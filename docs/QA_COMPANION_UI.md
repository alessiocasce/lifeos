# Companion app controls

## Conversation and current understanding

Companion stays a full-height conversation on mobile and desktop. Returning from
another tab keeps the selected conversation; only New Chat clears it. The context
icon opens a native modal side sheet, with Escape dismissal and browser focus
containment. The Training Resume dock has reserved space below the composer.

Current understanding shows bounded, non-expired routine states and the four
supported preference keys. It is separate from saved autobiographical memories.
No assumptions are invented when the data is empty. Current-state corrections
prefill the message composer and require the user to finish and send the message.
Opening the sheet or clicking Correct does not write a belief or invoke Brain.
The sheet also exposes active/suspended project Watches, independent monitoring
and messaging grants, saved conversations, memory edit/forget, and secondary
action history/Vault diagnostics. Failed memory saves preserve the editor.

`GET /api/ai/actions?view=companion_context` uses the same verified configured-user
session as Watch. It maps routine/preference rows and project Watch summaries to
human fields; no raw provenance, monitor conditions, database identifiers or
private cross-user rows are returned. Responses use no-store. No schema rerun
required; backend/frontend deploy together. No Oracle restart is needed.

Local QA: ten Companion Chromium checks cover selected-thread navigation,
corrections remaining unsent, independent permission controls, failed memory
edit recovery, chat retry request identity, Escape/focus restoration and seven
required viewport sizes. Tests use isolated services; they do not call Gemini or
production Supabase. Physical iPhone keyboard/process eviction remains manual.

Manual deployed QA: select a saved conversation, navigate to Training and back;
open context, verify real current state, prepare a correction and confirm it is
not sent automatically. Test a disposable memory edit and verify reload. Change
permissions only intentionally; opening the sheet must leave both unchanged.
Open a saved Vault report and confirm its detail modal can be used and closed.
Check the composer with an active workout, keyboard open and phone rotation.

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

## Saved Reports Preservation (2026-10-02)

- An assistant answer has a 44px Save to Vault icon; the reconstruction had
  accidentally omitted its callback despite retaining the modal code.
- Save/detail use native modal dialogs, bounded scrolling and focus return.
  Title, existing report types, comma-separated tags and markdown are preserved.
- During save/archive, duplicate mutations and dismissal are blocked. Failed
  saves retain inputs; failed archive remains visible with a concise alert.
- Context -> Brain Data -> Saved Reports retains reading/archive/refresh and
  Re-embed. This stays secondary; conversation remains the primary surface.
- `tests/ui/companion-reports.spec.js` checks save/failure/reload, field locking,
  focused return, background-control inertness, archive/retry without chat loss,
  embedding repair and both dialogs at all seven required viewport sizes.
- Tests use isolated services. After deploy, save a disposable answer, reload,
  open the report and archive it explicitly. Confirm content/types/tags match;
  test keyboard dismissal and long content on iPhone. Real Gemini embeddings,
  deployed report authorization and physical iOS behavior remain unverified here.

No backend/API/schema or bridge changes; no schema rerun required.
