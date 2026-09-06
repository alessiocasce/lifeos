-- Reliability release: source_id is a polymorphic logical key; memo UUID strings are preserved.
alter table public.brain_outbox_messages alter column source_id type text using source_id::text;

-- Serialize admission and ordinary delivery per user/channel across serverless instances.
create or replace function public.guard_proactive_attention()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  gap_minutes integer;
  daily_max integer;
  recent boolean;
begin
  if new.source_type not in ('memo', 'accountability') then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || ':' || new.channel, 0));
  gap_minutes := coalesce((new.metadata #>> '{attention_profile,min_gap_minutes}')::integer,
    case when new.source_type = 'accountability' then 20 else 60 end);
  daily_max := coalesce((new.metadata #>> '{attention_profile,max_per_day}')::integer,
    case when new.source_type = 'accountability' then 20 else 6 end);
  if tg_op = 'INSERT' then
    if exists (select 1 from public.brain_outbox_messages b where b.user_id = new.user_id and b.idempotency_key = new.idempotency_key) then return new; end if;
    if (select count(*) from public.brain_outbox_messages b where b.user_id = new.user_id and b.channel = new.channel
      and b.created_at >= (date_trunc('day', now() at time zone 'Europe/Rome') at time zone 'Europe/Rome')
      and b.status <> 'cancelled') >= daily_max then
      raise exception 'attention_deferred';
    end if;
    if coalesce((new.metadata->>'exact_due_reminder')::boolean, false) or new.rule_key like '%_snooze' then return new; end if;
    select exists(select 1 from public.brain_outbox_messages b where b.user_id = new.user_id and b.channel = new.channel
      and b.status in ('queued','claimed','sent') and b.created_at > now() - make_interval(mins => gap_minutes)) into recent;
    if recent then raise exception 'attention_deferred'; end if;
  elsif old.status = 'queued' and new.status = 'claimed' then
    if coalesce((new.metadata->>'exact_due_reminder')::boolean, false) then return new; end if;
    select exists(select 1 from public.brain_outbox_messages b where b.user_id = new.user_id and b.channel = new.channel and b.id <> new.id
      and ((b.status = 'sent' and b.sent_at > now() - make_interval(mins => gap_minutes))
        or (b.status = 'claimed' and b.claimed_at > now() - make_interval(mins => gap_minutes)))) into recent;
    if recent then return null; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_proactive_attention on public.brain_outbox_messages;
create trigger guard_proactive_attention before insert or update of status on public.brain_outbox_messages
for each row execute function public.guard_proactive_attention();
revoke all on function public.guard_proactive_attention() from public, anon, authenticated;

-- Completed non-hour session contributions are applied transactionally on every
-- insert/edit/reopen/delete. Manual total edits rebase the existing total.
create or replace function public.reconcile_project_session_progress()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare old_value numeric := 0; new_value numeric := 0; target_id uuid; target_user uuid;
begin
  if tg_op <> 'INSERT' then
    target_id := old.project_id;
    target_user := old.user_id;
    if old.ended_at is not null then old_value := old.progress_delta; end if;
  end if;
  if tg_op <> 'DELETE' then
    if tg_op = 'UPDATE' and new.project_id <> old.project_id then raise exception 'Move sessions by recreating them in the destination project.'; end if;
    target_id := new.project_id;
    target_user := new.user_id;
    if new.ended_at is not null then new_value := new.progress_delta; end if;
  end if;
  update public.projects set current_value = current_value + new_value - old_value
    where id = target_id and user_id = target_user and goal_type <> 'hours';
  if exists (select 1 from public.projects where id = target_id and user_id = target_user and current_value < 0) then
    raise exception 'Reconcile manual project progress before removing this contribution.';
  end if;
  return null;
end;
$$;
drop trigger if exists reconcile_project_session_progress on public.project_sessions;
create trigger reconcile_project_session_progress after insert or update or delete on public.project_sessions
for each row execute function public.reconcile_project_session_progress();
revoke all on function public.reconcile_project_session_progress() from public, anon, authenticated;
