# Frontend reconstruction

## Scope and checkpoints

User brief: `9807a46e-66d9-4dac-9880-1f7943a6112b/pasted-text-1.txt`.
This is a full reconstruction; completing a checkpoint is not completion of the brief.

- [x] User/session-scoped Training continuity and browser regression journeys.
- [x] Navigation, shared visual foundation, mobile utility sheet, desktop rail.
- [x] Focused active Training logger, templates/history secondary, save feedback.
- [x] Command, Companion, Health, Projects, Memos and Calendar reconstruction checkpoints.
- [ ] Finances reconstruction.
- [ ] Useful routine-state integration, Training template journeys and complete preservation audit.
- [x] Authenticated typed project Watch and permission controls through a consolidated route.
- [ ] Full automated gates, seven-function check, all required viewport QA, final documentation.

Existing local edits to `scripts/smoke-mcp-oauth.js` and `docs/QA_DEPLOYMENT.md`
belong to the authorized production permission smoke. Keep them out of UI commits.

## Current feature inventory to preserve

| Surface | Existing capabilities | Intended home |
| --- | --- | --- |
| Workout | Start/select, templates and exercise order, warmups, weight/reps/RPE/notes, previous performance, edit/delete sets, end/reopen/delete sessions, history | Training, with live logger first and management secondary |
| Projects | CRUD/status, goals/progress, timed sessions/proof, money ledger | Projects plus typed Watch controls |
| Health | Date-based autosave, canonical sleep/wake, routines, daily counters, history | Health in utilities; relevant current routine state |
| Calendar | Day/week navigation, event CRUD/status | Utilities and Command commitments |
| Memos | Dated/undated reminders, quick capture, edit/complete/dismiss/delete | Utilities and Command open loops |
| Finances | Expense entry/edit/delete, month/category analysis, ledger | Utilities |
| Assistant | Persisted conversations, guarded Brain actions, history, memory/insight/Vault tools | Companion, conversation first with secondary current-state and autonomy controls |
| Shell | Auth, routes/back/deep links, lazy screens, pull refresh/PWA updates | Five mobile destinations; labeled desktop rail; persistent active-training affordance |

## Findings from the initial code audit

- Workout draft is component state; it disappears on unmount or process death.
- Selected session is also in-memory; reload chooses the first unended session, not necessarily the user's session.
- The manifest starts at `/`; there is no authenticated workspace recovery policy.
- Save already preserves exercise/weight and clears reps/notes, but that next-set context is not durable.
- Same-user auth events preserve context state. Retain that useful behavior.
- Pull refresh may apply a service-worker update when no meaningful draft is present, even during live training.
- Eight equal mobile destinations and global spend/sleep cards compete with training.
- Project monitor services exist only behind backend trust boundaries; browser control needs a narrow authenticated action.

## Design decisions

Mobile: Command / Projects / Training / Companion / More. More holds Calendar,
Memos, Health, Finances and account controls. Keep canonical paths and browser back.
Desktop: labeled rail with the same hierarchy and visible utility destinations.
Training: current exercise, large weight/reps inputs, previous performance, save;
management and historical inspection must not precede the live logger.
Visual system: obsidian and graphite fields, cold-white primary actions, steel
secondary text, semantic amber/red/green. No glow, ornamental telemetry or fake data.

## Recovery policy

Versioned user/session-scoped storage; bounded, validated values; stale expiry;
confirmed end/delete and sign-out clear appropriate state. Explicit routes and
intentional navigation win over root-launch restoration. A restored draft is never
an automatic write. Failed saves keep input. Only confirmed saves advance/reset it.

## Verification status

Continuity is implemented. Nine Chromium journeys pass against the real App and
Provider with isolated test APIs: full draft reload, exercise switch, confirmed
save/root relaunch, failed save, end/new session, sign-out/user change, explicit
navigation, selected-session recovery and deleted-session handling. Pure storage
tests cover expiry/corruption/unavailable storage. Visual reconstruction remains
in progress; the original 390px baseline confirmed small telemetry and crowded navigation.
Physical iOS process-eviction verification is still required. Cold offline startup
waits for authenticated server session confirmation; local drafts are retained.

## Shell and Training checkpoint (2026-10-01)

Implemented five mobile destinations with a native modal utility sheet, a labeled
desktop rail, and a Resume dock showing the persisted current exercise outside
Training. Keyboard viewport contraction hides mobile fixed controls while typing.
The logger now leads with exercise and large weight/reps fields, optional RPE/notes,
warmup checkbox, and confirmed-save feedback. Session management follows the logger
on mobile and sits beside it on desktop. Edit/delete controls have 44px targets.
Shared panels are unframed sections; colors use graphite/steel with semantic states.
Existing canonical routes and APIs are unchanged.

Seventeen Chromium journeys passed, including seven requested viewports (375x812,
390x844, 393x852, 430x932, 1280x800, 1440x900, 1920x1080). Screenshots inspected for
Training at every size; overflow assertions and Resume navigation passed. Set
edit/delete/end/reopen passed in addition to the continuity matrix. The isolated
QA Vite server now uses its own dependency cache after a verified cache collision
with the SSR harness produced a React dependency HTTP 504. Assertions were not relaxed.

Remaining at this checkpoint: Companion current state/permission controls;
Command and utility-tab reconstruction; richer populated screen fixtures and QA;
physical iOS keyboard/background/process-eviction testing; final full-scope audit.
Do not treat this checkpoint as a completed redesign.

## Companion checkpoint (2026-10-01)

Conversation now occupies the primary workspace at every width, with a context
side sheet accessible from mobile and desktop. Current routines/preferences,
project Watches and independent permissions use a bounded authenticated read on
the existing actions route. Saved memories are reachable without diagnostics;
memory failures retain the editor. Corrections create an unsent composer draft.
Saved conversations are selectable and survive tab navigation. Chat retry retains
the same request identity. The composer reserves space for the Training dock.

All seven viewport screenshots were inspected; browser tests assert no overflow,
safe composer placement, focus restoration, explicit controls and chat continuity.
Full reconstruction remains open: Command, full Projects hierarchy, Health and
utility screens, populated visual QA, and physical iOS verification.

## Command checkpoint (2026-10-01)

Replaced repeated metric pills and nested data cards with active work, a Today
agenda and short dated-memo open-loop list, recorded context and tomorrow's
calendar. Existing context data is the source; no AI call or new backend surface.
Active Training opens the actual selected session. Recorded zero sleep remains
data; missing sleep produces no nag. Cancelled events and closed memos stay out
of open commitments. Failed agenda refresh is distinct from a quiet day.

Nine browser checks cover quiet/failure states and populated real-shaped records
at all seven required sizes. Screenshots were inspected. Lower-frequency utility
screens, full Projects hierarchy and Health/routine presentation remain pending,
along with final whole-app validation and physical iPhone QA.

## Project Watch checkpoint (2026-10-01)

Project details have actual current-context and Watch status, explicit enable,
suspend/resume/retire controls, plus independent Companion permission checkboxes.
The existing actions endpoint accepts a small session-authenticated typed contract;
automation tokens cannot use it. No browser protected-table writes, schema changes,
new functions, evaluation or outbox writes. Schema-backed tests prove denied grants,
cross-user rejection, lifecycle, expired/paused rejection, and no delivery side effects.
Two browser journeys verify explicit grants/lifecycle and failed-save feedback.
See `QA_COMPANION_UI.md` for deployed QA and the terminal Watch renewal limitation.

## Health check-in checkpoint (2026-10-01)

Health now prioritizes selected-date Sleep, daily counters, habits and notes in
unframed bands. Habit/counter controls are named 44px targets. Patterns are secondary
and omitted for empty data; latest-seven-record history is no longer mislabeled as
seven consecutive days. Existing serialized autosave and sleep-date semantics stay
unchanged. Browser fixtures support isolated health mutations and failure testing.
Seven viewport captures, habit persistence/decrement, historical-date isolation,
rapid saves, failed-save retention, notes retry and empty behavior are covered.

Remaining full scope: full Projects hierarchy and utility screens, routine-state
integration where useful, feature-preservation audit, whole-app visual/workflow QA,
and physical iPhone keyboard/process-eviction testing. This is not completion.

## Projects execution checkpoint (2026-10-01)

All/Active filtering and a real active-session resume row replace equal metric
cards. Details lead with execution and Watch; desktop shows them together.
Progress updates, records, sessions and money remain accessible below. All loaded
money entries can now be edited, including those after the former six-row cutoff.
Editors are native modal dialogs; regression coverage caught and fixed explicit
focus restoration on removal. Failed deletion reports an error without rejecting
unhandled. Switching project/back confirms before clearing a session draft.
Existing authenticated Watch/Attention paths and database progress remain intact.

Fifteen project browser cases cover CRUD/session/progress/money/draft journeys and
list/detail/editor/money at all seven sizes. These fixture-based tests do not
replace production schema/RLS validation or physical iPhone keyboard QA. Remaining
scope is utility-tab reconstruction, routine-state integration where useful, the
full feature preservation audit and whole-app/iPhone QA. Do not mark complete.

Checkpoint validation: `npm test`, production build and seven-function check pass;
the complete browser suite passes 66 tests. No schema or environment changes.
No production mutations were used for these UI checks.

## Memos queue checkpoint (2026-10-01)

Each dated reminder appears once in the timeline, with quieter undated notes and
collapsed closed history. Removed equal colored counters, duplicate Next Up and
decorative timeline glow. Native modal editors use 44px controls, focus restoration
and in-flight-save dismissal protection. CRUD, optional date/time, shortcuts,
done/dismiss/reopen and error retention are preserved. Twelve browser cases cover
these behaviors and list/editor captures at all seven sizes. Fixtures are isolated;
physical iPhone keyboard and production data journeys remain unverified.

Remaining scope: Calendar/Finances reconstruction, useful routine-state integration,
Training template coverage, full feature inventory/whole-app QA and device QA.
No schema rerun required; no new functions, environments or production mutations.

Memos checkpoint gates: `npm test`, build, syntax checks and diff checks pass;
the complete browser suite passes 78 tests. Function count remains seven.
Queue/editor captures were inspected at all seven required viewport sizes.

## Calendar agenda checkpoint (2026-10-01)

Selected-day agenda leads, with compact date/week navigation and no duplicate
event grid. Event rows are unframed; category colors no longer compete with status.
CRUD, all four statuses, arbitrary dates and Today are preserved. Native modal
editors contain/restore focus and cannot be dismissed during a save. Identical
start/end is rejected; untimed events remain supported. Failed loading does not
pretend the day is empty. Thirteen isolated browser tests cover these journeys
and seven sizes, including reaching editor Cancel. No backend/schema changes.

Remaining: Finances, useful routine-state integration, richer Training template
coverage, complete feature-preservation audit, whole-app/device QA. This is not
the completion of the full reconstruction brief.

Calendar checkpoint gates: `npm test`, build, syntax and diff checks pass;
the complete browser suite passes 91 tests. Function count remains seven.
Agenda and editor captures were inspected at all seven requested viewport sizes.
These are isolated browser fixtures, not production Supabase or physical iOS QA.
