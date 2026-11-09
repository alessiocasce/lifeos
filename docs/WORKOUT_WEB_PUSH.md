# Training Rest Timer

## Production Transport Gate (2026-11-09)

The four reviewed migrations are applied, with repository versions reconciled to
the production ledger: 20261109033543, 20261109033551, 20261109033558 and
20261109033605. Foreground deadlines are available independently of Web Push.
Background delivery is NOT operational: production has
`LIFEOS_PUSH_WORKER_ENABLED=false`; no VAPID or dispatch credential was provisioned.

Hosted pg_net grants PUBLIC access to its queue, owned by supabase_admin.
The attempted postgres REVOKE does not remove that grant. The new forward
`workout_push_transport_guard` migration fails closed before accessing Vault if
client roles can read the queue. Cron stays inactive and the private control OFF.
Do not bypass this gate or provision a bearer secret into the unsafe transport.
See [Supabase's managed-grant limitation](https://supabase.com/kb/troubleshooting/revoking-access-to-pg_net-objects-has-no-effect-0bbc16).
No Oracle login key/host configuration is available in this workspace. Secure
transport or a verified accessible Oracle fallback is required before enabling.

The following selection/review notes describe the earlier proposal, not an
assertion that managed queue privileges were successfully restricted.

## Launch selection update (2026-11-09)

The owner selected Supabase Cron instead of the Oracle polling default below.
Production is Free / PG17.6; pg_cron1.6.4 and pg_net0.20.0 are available but not
installed, and Vault0.3.1 is already installed. Prepare/apply only after the backup
and hosted CI gates: `20261109033605_workout_push_cron.sql`, after the other three
release migrations. It starts with the dispatch job and private enabled control
both OFF. No Oracle worker should run alongside Cron.

Every10seconds the indexed due-work check executes locally. With no due eligible
timer it makes **zero HTTP requests**. Maximum local checks are8640/day or259200
per30days; an hourly maintenance job retains only2days of this feature's cron
history and30days of finished timer rows. Existing unrelated cron history is not
deleted. At current small scale, HTTP/function volume should follow actual due
rest events (plus bounded retries of dispatch requests), not idle clock ticks.
This is an estimate, not measured production usage. No paid plan change is made.

Store only the existing dispatch secret in Vault under
`lifeos_workout_push_dispatch`; VAPID private material remains Vercel server-only.
The job command includes no secret. The private control is inaccessible to client
roles, but the hosted pg_net queue is NOT similarly restricted. The transport
guard therefore prevents Vault access and dispatch on this production project.
Only the fixed production endpoint is supported.

After secure credential provisioning and endpoint deployment, an operator enables
the private control and Cron job together. Confirm current successful job runs,
net HTTP status and real claim/cancellation behavior before accepting subscriptions.
Three consecutive HTTP failures/timeouts automatically switch control OFF. A
healthy HTTP200 is not proof of successful OS delivery. Real external failure
alerting and plan consumption must be checked separately before full acceptance.

Immediate kill switch (admin only):
```sql
update lifeos_private.workout_push_scheduler set enabled=false where singleton;
select cron.alter_job(job_id:=jobid,active:=false) from cron.job where jobname='lifeos-workout-push';
```
Also set Vercel `LIFEOS_PUSH_WORKER_ENABLED=false` and invalidate pending delivery
tokens through the reviewed cancellation path for an incident. No Oracle worker
is started in this launch attempt. The older PM2 instructions are fallback only.

This is a new PWA Web Push path. It does **not** restore WhatsApp rest alerts,
Brain outbox scheduling, MONITOR or global Companion MESSAGE permissions.
Nothing in this document has been enabled in production by this task.

## Review and Future Rollout

Three unapplied forward migrations accompany the modernization:

1. `20261109033543_workout_web_push.sql`: user-scoped preferences, subscriptions,
   server deadlines, fail-open set trigger, cancellation and worker claims.
2. `20261109033551_curl_catalog_identity.sql`: owner-confirmed curl reconciliation
   to the existing EZ UUID, including saved sources/snapshots and sanitized Community
   projections. The old picker identity remains inactive, not deleted.
3. `20261109033558_settings_identity_defaults.sql`: lowercase username normalization,
   collision abort and Italian preference defaults while preserving explicit choices.

Approval and targeted migration application are required before deployment. Do not
replay historical migrations or run a broad `supabase db push`. Do not rerun the
entire schema. The frontend, API and worker must agree with these database objects.

## Server Configuration

- `LIFEOS_PUSH_PUBLIC_KEY`: VAPID public key; returned to authenticated clients.
- `LIFEOS_PUSH_PRIVATE_KEY`: corresponding server-only private key.
- `LIFEOS_PUSH_SUBJECT`: a valid VAPID contact URI, e.g. a maintained `mailto:` address.
- `LIFEOS_PUSH_DISPATCH_SECRET`: independent, high-entropy worker bearer credential.
- `LIFEOS_PUSH_WORKER_ENABLED=true`: set only when an actual worker is operating.

Use the maintained `web-push` package's VAPID generation command once in a secure
operator environment. Never put private keys or the worker secret in `VITE_` vars,
source control, browser storage, URLs or logs. No keys were generated here.

Run the separate worker using `npm run worker:workout-push` with the server-only
dispatch secret and `LIFEOS_PUSH_ORIGIN` set to the approved HTTPS application origin.
It polls the existing `/api/ai/actions` route every five seconds. No new Vercel
function or WhatsApp bridge restart is needed. Configure the operator's service
supervision and monitor failures before calling delivery operational.

## Behavior and Delivery Guarantees

- Timer and notification preferences default OFF; duration is 15–300 seconds.
- A successful live set INSERT schedules from server statement time. Working and
  warmup sets behave identically. Failed saves and historical edits never arm it.
- A new saved set replaces pending reminders. OFF/end/delete/cancel invalidates
  old delivery tokens, even if a push was accepted but not yet displayed.
- Notification OFF revokes pending delivery, not the visual deadline. Re-enabling
  notifications applies to future sets, not an old revoked reminder.
- Notification enablement requires a direct permission gesture. A platform permission
  grant alone is not considered successful server setup or subscription registration.
- At most five push subscriptions per user; only approved HTTPS push-service hosts
  are accepted. Neither ordinary users nor the browser can read delivery tokens or
  subscription capability URLs through database table APIs.
- The worker atomically claims at most five due timers, with bounded parallel delivery.
  A five-minute grace period prevents very stale reminders. Ambiguous network sends
  are not retried automatically; this favors avoiding duplicate alerts over guaranteed
  delivery. Provider acceptance is not proof of OS display or physical receipt.
- The service worker checks expiry and server cancellation before showing a generic,
  localized alert with no workout details. Invalid/unverifiable notifications fail
  closed. Network/power policies and the small verify-to-display race remain limits.
- Clicking the notification opens Training, never an external URL. Existing PWA update
  deferral remains in force; imported push handling does not force worker activation.

Physical iPhone acceptance still requires an installed supported Home Screen PWA,
permission granted by a tap, real server configuration and the running worker.
Test locked, backgrounded and killed-PWA delivery, replacement, OFF and workout end.
The countdown itself does not rely on continuous foreground JavaScript.

## Local Verification

`npm run test:workout:push` covers helpers, real isolated PostgreSQL lifecycle/RLS,
fault-injected fail-open logging, API auth/dispatch, real payload encryption/signing,
and service-worker display decisions. `tests/ui/workout-push.spec.js` covers the
fixture UI and mobile geometry. Neither test sends real notifications or writes
production workout records.

## Selected Operations Setup (Prepared, Not Executed)

Use a **separate single-instance Oracle Node 24 / PM2 process**, alongside but not
inside the existing WhatsApp bridge. `ops/workout-push/ecosystem.config.cjs` is the
reviewable supervision configuration. The poller has only Node built-ins: it does
not need a service-role key, VAPID private key, WhatsApp session or npm packages.
It sends one authenticated dispatch request, waits for its response, then waits
five seconds. Redirects are rejected; origin credentials/paths/queries are rejected.
Only timestamp, HTTP status and aggregate claimed/accepted/failed counts are logged.

### Infrastructure comparison

| Option | Feasibility | Cost / reliability | Decision |
| --- | --- | --- | --- |
| Existing Oracle + separate PM2 process | Five-second polling, no new DB extension or Vercel route | Reuses an existing host if capacity permits; host/reboot supervision and alarms required. Vercel invocation/compute usage is NOT free merely because the VM already exists | Selected; host capacity, service account and deployment access still require operator verification |
| Supabase Cron + pg_net + Vault | Seconds supported on compatible Postgres; production is PG17.6 | Neither pg_cron nor pg_net is installed in the read-only preflight. Requires approved extension/job/Vault setup, HTTP result monitoring, same dispatch invocation costs | Viable alternative, not silently installed and not an additional migration for this release |
| Standard Vercel Cron | Minute granularity / plan scheduling restrictions | Does not provide the selected five-second polling cadence; no precise physical notification guarantee | Not selected |

Official references: [Supabase seconds scheduling](https://supabase.com/docs/guides/cron/quickstart),
[Vercel Cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing),
[PM2 startup persistence](https://pm2.keymetrics.io/docs/usage/startup/).
At an idle five-second cadence, budget approximately **17,280 requests/day or
518,400 per 30 days**, before request latency. Verify the actual Vercel plan's
invocation/compute allowance and billing alerts before enabling; no price quote or
zero-cost guarantee is asserted. Healthy due-to-provider latency is usually polling
interval plus API/provider processing; requests may last up to 45 seconds. OS display
latency is separate. This is not an exact-deadline delivery SLA.

### Operator procedure after separate release authorization

1. Verify Node 24, existing PM2 startup support, outbound HTTPS and spare capacity
   on Oracle. Use a dedicated unprivileged account and separate reviewed checkout,
   e.g. `/opt/lifeos-workout-push`; do not alter the bridge checkout/process.
2. Apply only the three approved migrations in the documented order and verify
   schema/source preservation. Deploy the reviewed API/frontend with worker flag
   initially false. Confirm the production alias and seven functions.
3. Generate one VAPID pair in an approved secret-management session. Store public,
   private, subject and independent random dispatch credential as **server-only**
   Vercel variables. Do not echo or paste them into source or shell arguments.
   Retain the same VAPID pair across normal deployments; key rotation requires
   devices to unsubscribe and re-enroll. No real keys were generated in this task.
4. Create `/etc/lifeos/workout-push.env`, readable only by the dedicated service
   account (directory 0700, file 0600), using a secure editor/secret provisioner.
   It contains only `LIFEOS_PUSH_ORIGIN=https://lifeos-ruby-gamma.vercel.app` and
   `LIFEOS_PUSH_DISPATCH_SECRET=<securely-provisioned-value>`. Never commit this file.
5. As that account, run `pm2 start /opt/lifeos-workout-push/ops/workout-push/ecosystem.config.cjs --only lifeos-workout-push`.
   Execute the host-specific command printed by `pm2 startup`, then `pm2 save`.
   Do not restart any WhatsApp process. The first requests may return 503 while
   the deployment's flag is still false; do not enable user notifications yet.
6. After the process and origin are checked, deploy server configuration with
   `LIFEOS_PUSH_WORKER_ENABLED=true`. Require current HTTP200 aggregate heartbeat,
   no repeated 401/503, and a controlled due-timer smoke before declaring operational.
   The frontend config endpoint requires all keys/subject/secret/flag, but this
   configuration check is NOT a worker health check.
7. Configure log rotation and an independent alert for no successful heartbeat for
   60 seconds, repeated nonzero failed counts, process restart loops, overdue queue
   growth and Vercel usage limits. Verify process recovery after an approved host
   reboot. PM2 online by itself is insufficient delivery evidence.
8. Complete the physical-device acceptance in `audits/LIFEOS_RELEASE_READINESS.md`.

Stop with `pm2 stop lifeos-workout-push` and disable the server worker flag for an
incident; leave the foreground countdown available. Invalidate queued/claimed tokens
with the reviewed cancellation path before re-enabling after a prolonged outage.
Do not blindly retry ambiguous provider sends. Keep expired/failed rows for diagnostic
retention and plan bounded retention cleanup before scale; no new cleanup scheduler
or production job was installed in this task.

## Final local corrections

- A fault-injected replacement failure originally rolled back prior cancellation.
  A nested insert exception now preserves both the real set and revoked old reminder.
- Real helper tests now cover subscription upsert/remove and cross-user endpoint
  rejection, not only the action-route adapter. Missing config keeps enablement off.
- Missing subscriptions and five-minute stale expiry are exercised in PostgreSQL.
- The operational poller rejects redirects and logs sanitized result counts; it is
  separately importable/tested without starting an infinite polling process.
