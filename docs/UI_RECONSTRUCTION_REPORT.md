# LifeOS Frontend Reconstruction Report

Reconstruction baseline: `4358a76`. Review date: 2026-10-02.
This report describes local implementation and verification, not a production
deployment or physical iPhone acceptance test. Refer to
[requirement evidence](UI_RECONSTRUCTION_AUDIT.md) and
[feature preservation](UI_FEATURE_PRESERVATION.md) for scope and test boundaries.

## 1. Old interface findings

Eight equally weighted destinations did not match gym-first use. Training form
and selected-session state were volatile; root PWA launches had no authenticated
workspace-resume policy. Templates/history competed with logging. Card/metric
hierarchy and cyan/glow styling obscured useful signals. Project monitoring
existed behind backend services but had no safe app control. Companion's older
secondary surfaces needed preservation work, not deletion to make chat look clean.
The preservation audit caught an unreachable Save to Vault callback, older loaded
records without continuation, undersized controls and weak muted-text contrast.

## 2. Information architecture

Command is the attention-first entry. Training is the primary execution mode.
Projects lead with doing work and Watch. Companion leads with conversation;
current understanding, permissions, memory, reports and diagnostics are secondary.
Health, Calendar, Memos and Finances are utilities, not deleted modules.
Canonical URLs, authenticated data ownership and existing Brain semantics remain.

## 3. Visual language

Obsidian `#0b0d0f`, graphite `#14171b`, raised `#1b1f24`, cold white `#f1f3f5`
and steel text define the system. Hairline bands and unframed rows replace floating
page cards. Restrained amber/red/green communicate warnings, errors and success.
The legacy cyan utility palette is desaturated steel; glow shadows are disabled.
Sans text is readable; tabular/mono values are selective. Muted text remains
readable rather than disappearing into darkness. No branded Batman imagery,
decorative metrics, video, canvas or animation framework was introduced.

## 4. Mobile navigation

Five destinations: Command, Projects, Training, Companion, More. Training has the
prominent central affordance. More is a native utility sheet with the four
secondary workspaces and account controls. A live Training resume dock remains
available elsewhere; it does not navigate automatically after an explicit choice.
Safe-area padding and keyboard focus/viewport handling protect controls.

## 5. Desktop navigation and layout

A labeled rail separates primary work from records. Training places session
management beside the logger at desktop widths instead of before it. Command
uses restrained columns; Projects places execution and Watch together. Companion
keeps the conversation wide and context in a modal side sheet rather than an
always-open admin dashboard. Smaller desktop/tablet widths use the compact rail.

## 6. Training reconstruction

The live session header, current exercise, large load/reps inputs, warmup toggle,
optional RPE/notes, previous performance and Save lead. Successful Save announces
the confirmed set without an intrusive toast. Exercise/load remain ready for the
next set; numbering advances. Suggestions have 44px targets and contained keyboard
selection. Logged-set edit/delete, warmup conversion, session end/reopen/delete,
templates, exercise ordering/snapshots and history remain accessible, secondary
to the live logger. Ended sessions are inspectable and explicitly reopened to edit.

## 7. Resume/draft-loss cause

The old draft was React component state. Unmount or discarded browser process
destroyed it; selected session was also in-memory. The manifest's `/` launch could
rebuild Home instead of the prior live workspace. Preserving a rerender alone
would not solve this. The new contract stores interaction state at input boundaries
and restores it only for the authenticated user and correct live session.

## 8. Recovery boundaries

- Remount and page reload read the same scoped draft; browser journeys verify it.
- Root relaunch resumes Training only when the last meaningful surface was
  Training and the saved session is still live. Direct routes/explicit navigation win.
- Same-user token refresh and visibility/pageshow/reconnect reconcile without
  clearing useful in-memory state; browser event simulations verify this.
- Abrupt process loss can recover already-persisted input after auth/session/data
  rehydration. Physical iOS eviction/reopening was not tested. Storage availability,
  retained auth and network still matter; this is not a full offline-first engine.

## 9. Persistence and cleanup

`lifeos:training:v1:<encoded-user>` contains a workspace envelope and per-session
draft envelopes, versioned and timestamped with 36-hour expiry. Draft fields are
exercise, set number, load, reps, RPE, warmup and notes; workspace contains tab and
session identity. Values are sanitized; future/expired/corrupt data is rejected.
Every meaningful input update writes synchronously. No credentials are added.
Confirmed save clears only next-set fields; failed save retains all input.
End/delete removes that session's draft; sign-out removes that user's Training
keys; session/user switching never copies an old draft into another scope.
If storage is unavailable the logger warns rather than promising durability.

## 10. PWA/update behavior

No automatic update reload was added. Existing pull-refresh refreshes data but
defers a waiting worker during live Training, even with an empty logger. After
Training ends, explicit refresh may apply it. Tests simulate worker state and
keyboard event ordering; production worker activation and physical iOS standalone
lock/resume remain manual checks. No mandatory cache purge is recommended.

## 11. Project Watch UI

Project details show supported project-staleness Watch state, current context,
last check and last intervention queued when recorded. Enable, suspend, resume
and two-step retire are available. Unknown/load-failed is not falsely shown as
Off. Expired/exhausted/retired Watch cannot resume; renewal is not implemented.
Project CRUD, timed sessions/proof, progress and separate project-money ledger remain.

## 12. Watch authorization/security

The existing consolidated `/api/ai/actions` route verifies the configured user's
Supabase bearer session. Automation tokens cannot manage app controls. User/project
ownership is checked; only the typed supported monitor is allowed. MONITOR and
MESSAGE remain independent explicit grants; reads/enabling Watch never silently
grant either. Persistence stays in server services/RPC, not direct protected browser
writes. App controls neither evaluate Attention nor enqueue/send WhatsApp. Existing
Attention/delivery validation still controls any eventual intervention.

## 13. Companion capabilities surfaced

Current routines/preferences and Watch summaries have human labels. Corrections
prepare unsent composer text. Conversation selection survives tab navigation.
Permissions, memory edit/Forget, saved conversations, reports/Vault, action detail
and diagnostics remain secondary. Loaded older conversations/reports now have
continuation controls within the existing server limits. Native nested detail
dialogs contain focus and close independently. Health displays current routines
separately from daily habit counts and removes that current-state view on historical dates.

## 14. Files changed

The exact inventory is reproducible with `git diff 4358a76 HEAD --name-only`.
Major groups:

- Shell/design: App, Shell, AuthScreen, shared ui, LifeOSLogo, index.css, Tailwind.
- Continuity: LifeOSContext, useWorkoutDraft, workoutContinuity, PullToRefresh.
- Workspaces: all eight `src/tabs` implementations.
- Companion UI: CompanionState, HealthRoutineState, ProjectWatch, AiActionHistory,
  routineState and authenticated Companion API methods in lifeosApi.
- Narrow backend: `api/_utils/companionApp.js` and `api/ai/actions.js` only.
- Tests/tooling: Playwright config/QA server/isolated fixture API, `tests/ui`,
  pure continuity and schema-backed app-control scripts, package/ignore entries.
- Handoff: PROJECT_CONTEXT, per-module QA, full-app QA, progress, preservation,
  requirement audit and this report. Unrelated deployment QA/OAuth smoke edits
  are intentionally excluded from reconstruction commits.

## 15. Regression coverage

Continuity covers the original A-H matrix plus expired/corrupt storage, delayed
reads, failed saves, user changes, session switches/deletion, root launch, explicit
navigation and PWA update deferral. Training suites preserve templates, snapshots,
warmup/working numbering, prior performance, keyboard suggestions and history.
Feature suites cover CRUD/status/progress/money, Health serialization/failures,
Companion conversations/memory/reports/detail focus and Auth failures/confirmation.
The cross-workspace suite adds 56 route/size checks for runtime/overflow, visible
44px controls and bounded muted-text contrast. Fixtures replace transport only;
the actual React application is rendered. No production writes are used.

## 16. Visual QA

Required dimensions: 375x812, 390x844, 393x852, 430x932, 1280x800, 1440x900,
1920x1080. Reconstruction checkpoints captured and inspected Training, Command,
Projects, Companion, Health and utilities including dialogs/setup/detail states.
Latest Training captures were re-inspected at all seven sizes after the text
correction; Retry/memory controls were also inspected at all seven.
Automated geometry catches overflow and important control placement; selected
keyboard/dock tests simulate both event orders. Chromium is not physical iOS.

## 17. Validation

Latest terminal results are recorded in UI_RECONSTRUCTION_AUDIT.md. Required
gates are `npm test`, `test:ui`, `check:functions`, `build`, changed JS syntax and
diff checks. `npm test` includes all individually requested Brain, Workout,
reliability, Companion, Attention, MCP and MCP-write suites, plus OAuth, memory,
schema and bridge. A build alone was never used as render proof. No live smoke
or production mutation is part of these frontend gates.

## 18. Functions

Exactly seven serverless API route functions. No new endpoint was added.

## 19. Schema/backend changes

No schema rerun required. No reconstruction migration. The authenticated typed
Companion/Watch app projection and mutation seam was added to the existing action
route. Brain chat, WhatsApp provider/inbound/outbox, MCP and OAuth implementations
were not rewritten. Existing operational API methods and canonical sleep semantics remain.

## 20. Deployment

Push only after separate authorization. Deploy frontend and the consolidated
action-route/helper changes together to Vercel. No new environment variables,
Supabase migration or Oracle bridge restart is required for reconstruction.
Installed PWAs should receive the normal waiting-worker flow; end Training and
explicitly refresh before applying an update. Verify the deployed account and
Watch reads against actual Supabase separately.

## 21. Remaining risks

Physical iPhone standalone keyboard/safe-area/lock/process-eviction testing is
outstanding. Cold offline auth/data hydration is not guaranteed; no offline write
queue was added. Local drafts expire after 36 hours and private/cleared storage
cannot restore them. Browser fixtures do not prove production CRUD/RLS/Gemini/
Oracle delivery. Watch renewal after terminal expiry is deliberately unsupported.
Loaded conversation/report/history bounds are preserved, not a new archive API.
The bounded color check is not exhaustive WCAG or screen-reader certification.
No deployment, push or production UI acceptance is claimed by this report.

## 22. Coherent commits

```text
0e2c81e Preserve Training drafts and workspace across reloads
70ff49e Rebuild navigation and focused Training interface
1c1eaf9 Add authenticated Project Watch controls
d8a69e2 Rebuild Companion conversation and context controls
e045564 Rebuild Command around active work and commitments
327aded Rebuild Health around daily check-in
95c7617 Rebuild Projects around execution and Watch
6839e00 Rebuild Memos as a focused reminder queue
878bb04 Rebuild Calendar around a focused day agenda
187fcb3 Rebuild Finances around expense capture and ledger
9ea2122 Rebuild Training setup and template controls
a3ca72e Connect Health check-in to current routine state
5226178 Fix mobile dock keyboard continuity
cb9fa24 Restore Companion report workflows
cf38ea5 Keep older Companion records reachable
e55a70a Unify Companion state and accessible detail views
eb5d1f9 Unify private entry and protect auth submissions
53e1221 Improve Training suggestions and preservation coverage
367586f Make Companion recovery controls mobile-safe
```

The final text-contrast/requirement-audit commit follows this list; its hash is
reported in the final response rather than embedded self-referentially here.

## 23. Main screen descriptions and captures

- Training: live header; unframed exercise/load/reps logger; cold-white Save;
  secondary records/options, with desktop management beside the logger.
- Command: bounded active-work lane and dated agenda/open loops; quiet absence.
- Projects: execution/proof and actual Watch state; progress/history/money below.
- Companion: conversation/composer first; native context side sheet and contained
  report/action dialogs. Permission/memory controls are not the landing experience.
- Health: selected-day check-in, habits and separately labeled current routines.
- Calendar: selected-day agenda; compact week navigation and native event editor.
- Memos: one dated queue, undated notes secondary, closed history disclosure.
- Finances: capture and month ledger; category totals secondary, no dashboard chart.

Fresh browser artifacts live under ignored `test-results/`: per-feature captures
include training.png, command.png, Companion/report/detail and utility captures.
`workspace-audit*/workspace.png` captures every route/size. These are test evidence,
not shipped data or permanent committed image assets; a later test run regenerates them.
