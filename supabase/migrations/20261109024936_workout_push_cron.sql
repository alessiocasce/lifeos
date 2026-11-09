-- Fourth forward migration. Requires verified backup and the three release migrations.
-- Vault values are provisioned separately; never embed credentials in this file/job.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;
revoke all on net.http_request_queue,net._http_response from public,anon,authenticated,service_role;

create table lifeos_private.workout_push_scheduler (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  checked_at timestamptz,
  dispatched_at timestamptz,
  pending_request_id bigint,
  last_request_id bigint,
  last_http_status integer,
  last_success_at timestamptz,
  consecutive_failures integer not null default 0,
  last_error text
);
insert into lifeos_private.workout_push_scheduler(singleton) values(true);
revoke all on lifeos_private.workout_push_scheduler from public,anon,authenticated,service_role;
create index workout_web_rest_claimed_age on public.workout_rest_timers(claimed_at) where state='claimed';

create function lifeos_private.dispatch_due_workout_push() returns void
language plpgsql security definer set search_path='' as $$
declare c lifeos_private.workout_push_scheduler; response record; credential text; request_id bigint;
begin
  select * into c from lifeos_private.workout_push_scheduler where singleton for update;
  if not c.enabled then return; end if;
  update lifeos_private.workout_push_scheduler set checked_at=now() where singleton;
  if c.pending_request_id is not null then
    select status_code,timed_out,error_msg into response from net._http_response where id=c.pending_request_id;
    if not found and c.dispatched_at>now()-interval '60 seconds' then return; end if;
    if found and response.status_code=200 and not coalesce(response.timed_out,false) and response.error_msg is null then
      c.consecutive_failures:=0;
      update lifeos_private.workout_push_scheduler set last_success_at=now(),last_error=null where singleton;
    else
      c.consecutive_failures:=c.consecutive_failures+1;
      update lifeos_private.workout_push_scheduler set last_error='dispatch_http_failure_or_timeout' where singleton;
    end if;
    update lifeos_private.workout_push_scheduler set pending_request_id=null,last_http_status=response.status_code,
      consecutive_failures=c.consecutive_failures,enabled=c.consecutive_failures<3 where singleton;
    if c.consecutive_failures>=3 then raise warning 'Training push scheduler disabled after repeated dispatch failures'; return; end if;
  end if;
  -- Local indexed housekeeping does not make an HTTP request or retry an ambiguous send.
  update public.workout_rest_timers set state='expired',finished_at=now() where state in('queued','claimed') and expires_at<=now();
  update public.workout_rest_timers set state='failed',finished_at=now() where state='claimed' and claimed_at<now()-interval '60 seconds';
  if not exists(select 1 from public.workout_rest_timers t
    join public.workout_web_rest_preferences p on p.user_id=t.user_id and p.enabled and p.notifications
    join public.workouts w on w.id=t.workout_id and w.user_id=t.user_id and w.ended_at is null
    where t.state='queued' and t.delivery_enabled and t.scheduled_for<=now() and t.expires_at>now()
      and exists(select 1 from public.workout_push_subscriptions s where s.user_id=t.user_id)) then return; end if;
  select decrypted_secret into credential from vault.decrypted_secrets where name='lifeos_workout_push_dispatch';
  if credential is null or length(credential)<32 then
    update lifeos_private.workout_push_scheduler set enabled=false,last_error='dispatch_credential_missing' where singleton;
    raise warning 'Training push scheduler disabled: credential is not configured'; return;
  end if;
  select net.http_post(url:='https://lifeos-ruby-gamma.vercel.app/api/ai/actions',
    headers:=jsonb_build_object('Authorization','Bearer '||credential,'Content-Type','application/json'),
    body:=jsonb_build_object('action','training_push_dispatch'),timeout_milliseconds:=45000) into request_id;
  update lifeos_private.workout_push_scheduler set pending_request_id=request_id,last_request_id=request_id,dispatched_at=now() where singleton;
end $$;
revoke all on function lifeos_private.dispatch_due_workout_push() from public,anon,authenticated,service_role;

create function lifeos_private.maintain_workout_push() returns void
language plpgsql security definer set search_path='' as $$
begin
  delete from public.workout_rest_timers where state in('sent','cancelled','expired','failed') and finished_at<now()-interval '30 days';
  delete from cron.job_run_details where jobid in(select jobid from cron.job where jobname in('lifeos-workout-push','lifeos-workout-push-maintenance')) and end_time<now()-interval '2 days';
end $$;
revoke all on function lifeos_private.maintain_workout_push() from public,anon,authenticated,service_role;

-- Two independent gates: both the cron job and private control start disabled.
select cron.schedule('lifeos-workout-push','10 seconds','select lifeos_private.dispatch_due_workout_push();');
select cron.alter_job(job_id:=jobid,active:=false) from cron.job where jobname='lifeos-workout-push';
select cron.schedule('lifeos-workout-push-maintenance','17 * * * *','select lifeos_private.maintain_workout_push();');
