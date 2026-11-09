-- Hosted pg_net is owned by supabase_admin; postgres REVOKE can silently do nothing.
-- Never read Vault or enqueue a bearer credential through a client-readable queue.
alter function lifeos_private.dispatch_due_workout_push() rename to dispatch_due_workout_push_transport;
revoke all on function lifeos_private.dispatch_due_workout_push_transport() from public,anon,authenticated,service_role;

create function lifeos_private.dispatch_due_workout_push() returns void
language plpgsql security definer set search_path='' as $$
begin
  if has_table_privilege('anon','net.http_request_queue','SELECT')
    or has_table_privilege('authenticated','net.http_request_queue','SELECT')
    or has_table_privilege('service_role','net.http_request_queue','SELECT') then
    update lifeos_private.workout_push_scheduler
      set enabled=false,last_error='unsafe_transport_permissions',checked_at=now()
      where singleton;
    return;
  end if;
  perform lifeos_private.dispatch_due_workout_push_transport();
end $$;
revoke all on function lifeos_private.dispatch_due_workout_push() from public,anon,authenticated,service_role;
update lifeos_private.workout_push_scheduler set enabled=false,last_error='transport_security_verification_required' where singleton;
select cron.alter_job(job_id:=jobid,active:=false) from cron.job where jobname='lifeos-workout-push';
