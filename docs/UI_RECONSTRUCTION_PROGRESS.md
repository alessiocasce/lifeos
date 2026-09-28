# Frontend reconstruction

## Scope and checkpoints

User brief: `9807a46e-66d9-4dac-9880-1f7943a6112b/pasted-text-1.txt`.
This is a full reconstruction; completing a checkpoint is not completion of the brief.

- [x] User/session-scoped Training continuity and browser regression journeys.
- [ ] Navigation, shared visual system, mobile utility sheet, desktop rail.
- [ ] Focused active Training logger, templates/history secondary, save feedback.
- [ ] Command, Companion, Health and lower-frequency screens.
- [ ] Authenticated typed project Watch and permission controls through a consolidated route.
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
pending; the 390px baseline capture confirms small telemetry and crowded navigation.
Physical iOS process-eviction verification is still required. Cold offline startup
waits for authenticated server session confirmation; local drafts are retained.
