# Reconstruction preservation evidence

Audit date: 2026-10-02. Compare against pre-reconstruction `4358a76`.
This is a workflow evidence map, not a declaration that the entire brief is done.
The source of truth is the current component/context/service code and executed
tests. Browser fixtures exercise the real React app while replacing transport;
they do not prove production Supabase, Gemini, Oracle or physical iOS behavior.

## Required existing functionality

All test paths below are under `tests/ui/` unless stated otherwise.

| Capability | Current home / implementation | Evidence and limits |
| --- | --- | --- |
| Session creation | Training > start empty or start template; `WorkoutSessionControl` | `training-templates.spec.js`: failed empty start retains fields, then starts once; template starts immutable snapshot. |
| Templates | Training > Session options > Manage templates | Same suite exercises template/exercise create/edit/delete, notes, reordering/compaction, reload and snapshot survival after template deletion. |
| Set logger | Focused `SetLogger` in Training | `workout-continuity.spec.js`: confirmed save, failed save, reload, exercise/load preservation, next number. No offline queue or unconfirmed-save success. |
| Warmups | Logger checkbox and edit-row Warmup toggle | `training-templates.spec.js`: warmup then working set remain distinct persisted rows. `training-history.spec.js`: warmup converts to working set 3 and back to warmup 1001 across reload, preserving load/reps/RPE/notes. Toggle exposes pressed state. |
| RPE / notes | Logger RPE & notes disclosure; edit row | `workout-continuity.spec.js`: populated RPE/notes/warmup draft survives reload; edit/save fields remain present. |
| Previous performance | Compact previous result, Performance detail | `training-history.spec.js`: last/heaviest working sets from the prior session, not warmups or future sessions; persists through navigation. Original heaviest/Epley calculations remain unchanged. |
| Set edit/delete | Logged Sets action buttons | `workout-continuity.spec.js`: edit reps and delete persisted row. Ended workouts require reopening for edit. |
| End/reopen | Active header | Same suite: end, reopen, logger available again; confirmed end removes draft. |
| Session history | Session options > Advanced > Switch session | `training-history.spec.js`: ended prior workout is selectable, sets remain visible and Reopen remains reachable. Continuity suite covers session switching/deleted identities. |
| Session deletion | Session options > Danger, two-step confirmation | `training-history.spec.js`: first click changes no data, in-flight confirmation disables repeat, failed deletion preserves session/draft, retry removes only selected session/draft, reload retains remaining historical sessions without inventing an active session. |
| Projects | Primary Projects list/details | `projects.spec.js`: All/Active filtering, completed records, create/edit, active session resume and parallel-session block. |
| Project sessions | Detail > timed sessions/history | Same suite: session target/proof, progress, history and project-switch draft isolation. |
| Project progress | Project details/manual progress | Same suite validates the displayed and persisted progress after session/manual edits. |
| Project money | Secondary detail ledger | Same suite creates, edits and deletes money entries. This is separate from personal expenses. |
| Health | More > Health, date check-in / recorded patterns | `health.spec.js`: counts, decrement/reload, historical date isolation, serialized rapid edits, failed-save retention, notes retry, empty patterns. Current routines are separate from daily counts. |
| Calendar | More > Calendar; Command today links | `calendar.spec.js`: week/date/Today navigation, event CRUD, all status transitions, equal-time validation, failed save, busy dismissal lock, load failure distinct from empty. |
| Memos | More > Memos; Command open loops | `memos.spec.js`: each dated row once, done/dismiss/reopen, create/edit/delete, optional date/time, failures, duplicate submit lock and quiet empty state. |
| Finances | More > Finances | `finances.spec.js`: comma decimals, custom categories, CRUD/reload, month/category totals, other-month ledger without duplication, loading failure/retry and busy locks. Category analysis is rows instead of the old chart. |
| Assistant conversation | Primary Companion | `companion.spec.js`: conversation survives navigation, retry uses same request/thread without duplicate bubbles; correction opens unsent input. Existing Brain transport remains unchanged. |
| Conversation history | Companion > context | `companion-reports.spec.js`: conversation 25 is selectable. UI exposes loaded records progressively, not a new paginated archive. |
| Memory controls | Companion > context > Saved memories | `companion.spec.js`: failed edit retains fields then saves; failed Forget retains record then retry removes only memory, not conversation. Seven-size keyboard/edit coverage measures 44px title/Save and keeps Save within the viewport. |
| Reports / Vault | Save on assistant bubble; context > Saved reports | `companion-reports.spec.js`: save failure/retry, types/tags/content, reload, re-embed, archive failure/retry, older reports, dialog focus/inert background/busy locks. |
| Action history | Companion > context > history; optional Errors | `companion-details.spec.js`: success/error details, all loaded rows, modal focus and isolated dismissal, long response scrolling, sanitized actions. |
| Insights / diagnostics | Companion > context > Saved memories > Recent insights | `companion.spec.js`: populated insights remain behind secondary disclosures, show only the existing bounded three records and do not alter memory or conversation. Diagnostics source comparison remains distinct from production trace evidence. |
| Auth | Private entry, More/rail sign-out | `auth.spec.js`: locked request/failure retry/deep route, signup without session, validation, autocomplete, keyboard order; continuity suite isolates users after sign-out. Real email/auth provider remains unverified. |
| Routes / navigation | Five mobile destinations, More utilities, desktop rail | `training-layout.spec.js`, `shell-continuity.spec.js`, continuity suite: direct routes, explicit navigation, back/forward, resume dock, both keyboard resize/focus orders. |
| PWA | Existing pull-refresh/update service | `shell-continuity.spec.js`: waiting-worker update is deferred during a live empty logger; cached/draft UI survives reconnect/token refresh. Physical iOS install/lock/process eviction remains manual QA. |
| Brain / backend | Existing shared Brain and server services | `npm test` covers Brain, MCP/OAuth/write scopes, memory, schema, reliability, bridge, Workout, Companion and Attention. Browser redesign does not prove live AI answers. |

## Contract comparison

`git diff 4358a76 HEAD -- api supabase src/services` identifies only the narrow
`companionApp` helper, consolidated `api/ai/actions` integration and authenticated
frontend Companion API wrapper. There is no reconstruction schema change or edit
to Brain chat, WhatsApp inbound/outbox/provider mapping, MCP, OAuth or `aiApi.js`.
Existing operational service methods remain in `lifeosApi.js`. Provider changes
are limited to Training workspace/draft cleanup, same-user reconciliation and
the post-write account-change guard. These are code-comparison evidence, not a
claim of production deployment verification.

Watch uses a verified Supabase session and existing typed project-staleness
service, not browser writes to protected tables. Separate MONITOR/MESSAGE grants
remain explicit. App controls do not evaluate Attention or send WhatsApp.
`test:attention` checks auth/user scoping, lifecycle/replay and no delivery effects.

## Deliberate relocation, not removal

- Live Training is primary; templates/history are secondary, not deleted.
- Calendar/Memos/Health/Finances move to More on mobile, remain in the desktop rail.
- Command removes empty metrics/Money/missing-data nags, not the underlying data.
- Companion conversation is primary; reports/memory/permissions/debug remain
  secondary. No table names, raw state enums or database IDs are primary UI.
- Finances replaces a chart with real category totals and a month ledger.

## Remaining audit evidence

Before full-goal completion, finish the whole-app control/focus/contrast review
and reconcile the final brief evidence/report. Keep physical iOS/Supabase/
Oracle/production SW items explicitly unverified rather than substituting browser
viewport screenshots. No schema rerun required.
