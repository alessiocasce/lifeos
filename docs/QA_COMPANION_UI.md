# Companion app controls

## Project Watch

Project details show the persisted typed project-staleness Watch, current project
context (priority/focus/next action/summary when present), last check and last
intervention queued. Queued is not delivered. No invented status or AI-generated
context is shown. Failed loads say Unavailable rather than Off.

Enable and resume require an active project and the MONITOR standing grant.
Suspend and retire remain available after revocation. Retirement requires a second
explicit click and is terminal; expired/check-exhausted watches cannot resume.
Renewal of a terminal Watch is not implemented. The existing stable monitor
idempotency key must not be bypassed by silently creating a replacement.

The secondary Companion permissions disclosure has independent monitoring and
messaging checkboxes. Neither is changed by loading the page or enabling Watch.
These grants control Companion monitor behavior; legacy memo reminders and other
proactive rule preferences remain separate. MESSAGE is still checked by Attention
and delivery validation. No app control invokes evaluation, enqueues a message,
or sends WhatsApp directly.

## API boundary

The existing `/api/ai/actions` endpoint retains its legacy GET action-log contract.
Added views: `project_watch` (requires project_id) and `companion_permissions`.
POST accepts only `project_watch` enable/suspend/retire or `companion_permission`
boolean monitor/message grants with a UUID request_id. Unknown fields are rejected.
The configured Supabase user's bearer session is verified server-side; automation
tokens do not authorize these controls. All project, belief and monitor queries
are user-scoped. Service role stays backend-only. Existing typed monitor services
and atomic belief transition RPC handle persistence. Responses are not cached.

No schema rerun required. Deploy backend and frontend together; no Oracle bridge
restart or new environment variable is needed. Vercel function count remains seven.

## QA

- `npm run test:attention` includes schema-backed app-control and route tests.
- `npm run test:ui` covers explicit grants, enable/suspend/resume/retire, failure
  without false success, and mobile overflow using isolated services.
- After deploy, sign in with the configured account, open an active project,
  inspect the actual permissions, enable Watch, reload and verify persistence.
- Suspend/resume and verify current status after reload. Retire only a disposable
  test Watch because retirement is terminal. Do not use SQL to revive it.
- With MONITOR off, enable/resume must fail; suspend/retire must still work.
- With MESSAGE off, Watch may check silently. Verify no physical message claim
  is inferred from `last_triggered_at`; delivery still needs separate bridge QA.
- Try an expired session or another account: private Watch data must not appear.

Local schema/browser tests do not prove a deployed session or physical WhatsApp
round trip. No production Watch was created during implementation.
