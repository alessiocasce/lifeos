# LifeOS UI/UX Modernization

## Scope and Safety

Local implementation on `codex/lifeos-ui-modernization`, starting at `23a4b62`.
No commits, deployments, production migrations or production data writes are authorized.
Existing `docs/plans/` Rankings work is preserved and excluded from this implementation.
Original private reference images are local design inputs, not application/public assets.

## Milestone Results

| Milestone | Scope | Applied skills and material impact | Status |
| --- | --- | --- | --- |
| 1 | Warmup, load conventions, curl identity | TDD/systematic-debugging: reproduced carry-forward and identity faults, then fixed their sources | Helper, picker, UI and PostgreSQL checks pass |
| 2 | Settings, defaults, profile/photo/username | frontend-design/anti-ui-slop/web-design-guidelines: clear sections, circular viewer, explicit saves, focus restoration; Supabase/TDD: isolation | Database/browser checks pass |
| 3 | PWA rest timer | Supabase practices: secure trigger/RLS/claims; React practices: isolated ticking; TDD/browser: lifecycle and geometry | Local DB/API/SW/UI tested; real delivery setup pending |
| 4 | Completion, templates, History filters/tabs | frontend-design/React/TDD: compact hierarchy, stable drafts, bounded server filters and older-session mutation cache | Completion/retry/filter/edit/continuity checks pass |
| 5 | More and Community | React practices/agent-browser: scoped deduplicated cache, restored search/scroll, real transitions and stale-response rejection | Navigation/privacy/account tests pass |
| 6 | Broader polish | anti-ui-slop/web-design-guidelines: useful Command action, accent-aware composer, readable Projects and consistent record forms | Five-width render review passes; existing workflows preserved |
| 7 | Cleanup and recovery | selective architecture/systematic-debugging/TDD: dead state removal, shared dialogs, real failure recovery and guarded PWA regression | Build, focused regressions and accessibility checks pass; hosted CI not executed |

## Skill Application

- `frontend-design`: retain LifeOS's dark operational UI; refine existing hierarchy rather than add dashboards.
- `tdd`: regression tests at UI, pure helper and PostgreSQL boundaries, including a failing test before the new timer implementation.
- `vercel-react-best-practices`: isolate countdown rendering; deduplicate Community requests and reject stale account responses.
- `supabase-postgres-best-practices`: owner RLS, narrow grants, fixed function search paths, indexed worker claims.
- `agent-browser`: isolated fixture application interaction and screenshot review, alongside Playwright.
- `web-design-guidelines`: named icon controls, focus behavior, readable forms, safe areas and reduced motion.
- `anti-ui-slop`: installed from github/awesome-copilot at the user's request; operate playbook used to critique task hierarchy and real loading/error states.
- `systematic-debugging`: installed from obra/superpowers at the user's request; reproduce and trace failures before changing implementation.
- `improve-codebase-architecture`: selective verified cleanup only, not a repository-wide refactor.

`grilling` was not needed: the product choices were explicit. No additional skill
was silently installed. The two missing skills were installed only after the user
requested it. No UIZZE account/database access is claimed; visual grounding used
the supplied references and actual rendered LifeOS fixture screens.

## Confirmed Corrections

- Warmup previously carried into the next saved draft. The regression failed before
  `nextWorkoutDraft` reset mode and applied working-history targets after success.
- Superseding owner decision (final corrections): all affected Barbell Curl history
  was EZ-bar work. The revised pending migration reconciles references to the EZ
  UUID and retires the old picker entry, retaining both catalog definitions. Authored
  performance text and fields are preserved; no equipment is guessed.
- Filtered older workouts were absent from the context mutation cache. Their edits
  could save without immediately refreshing detail data. Opening a filtered owned
  row now retains it for mutation/refresh, without changing the active session.
- Save-as-template creation did not bind an expected owner. A failing regression
  proved stale-account writes were not rejected. Both create paths now bind the
  initiating bearer and reject stale context responses before applying state.
- Intermittent QA auth failures came from duplicate HMR module URLs with separate
  adapter listeners. The fixture now models one browser auth event source. This
  was not treated as a production-auth defect.
- Safari/WebKit pointer clicks did not focus the avatar trigger. An explicit ref
  now restores focus after closing the viewer; the reproduced WebKit case passes.
- The desktop Resume dock intercepted the update notice's button. The notice now
  clears the dock and has its own higher overlay layer. Actual PWA activation
  guards were not bypassed to make the test pass.

## Implementation Files

- Training: `src/tabs/WorkoutTab.jsx`, `src/components/ExerciseSelector.jsx`,
  `src/hooks/useWorkoutHistoryFilter.js`, workout completion/continuity/prefill/filter
  helpers, Training styles, catalog source/generated data and generator checks.
- Settings/auth: `SettingsTab.jsx`, `AuthScreen.jsx`, `ProfileCompletion.jsx`,
  `ProfilePhotoEditor.jsx`, `SettingsDialog.jsx`, `useUserSettings.js`,
  `userSettingsIdentity.js`, `authRecovery.js`, localization and Settings styles.
- Timer: `WorkoutRestTimer.jsx`, `workoutRestApi.js`, `workoutRest.js`, timer CSS,
  `api/_utils/workoutPush.js`, narrow `api/ai/actions.js` branches,
  `public/workout-push-sw.js`, worker/test scripts and `vite.config.js` importScripts.
- Shared/navigation: `Shell.jsx`, `CommunityTab.jsx`, `SharedWorkout.jsx`,
  `communityCache.js`, navigation/Community styles, `AppUpdates.jsx`, `index.css`.
- Reliability: `App.jsx`, `WorkspaceErrorBoundary.jsx`, `ConfirmationDialog.jsx`,
  `useDestructiveConfirmation.jsx`, Calendar/Memos/Finances/Projects/Companion tabs,
  `LifeOSContext.jsx`, `tabRoutes.js` and shared `ui.jsx`.
- Removed: `src/data/lifeosData.js`, unused `WorkoutSharing.jsx`, unused chart/ring/dot
  helpers and `recharts` (36 dependency packages removed). Persisted APIs remain.
- Three pending migrations, package scripts/lock, isolated fixture adapters,
  focused unit/UI/PWA tests, context/QA documentation and private-reference ignore.
- `.github/workflows/frontend-quality.yml`: a credential-free, pull-request/manual
  quality gate using isolated database fixtures and focused browsers, not the full
  legacy viewport suite. Prepared locally; **not run on GitHub** without a push.

## Rest Timer Architecture

PWA-only, not the retired WhatsApp reminder. The new `workout_web_rest_preferences`
table defaults both timer and notifications OFF. Duration is 15–300 seconds.
A protected PostgreSQL AFTER INSERT trigger schedules a deadline for live sessions;
timer errors cannot roll back the saved set. Completed-session corrections do not schedule.
Preferences, countdowns and subscriptions are user-scoped. New sets supersede older
delivery tokens, including push messages accepted but not yet displayed by the OS.
Disabling notifications invalidates pending delivery without removing the countdown.

Background delivery requires the pending local migration, VAPID configuration and a
separately operated authenticated worker. None are applied/configured in production here.
The existing generated service worker imports the push handler without changing guarded
update activation. Push display revalidates cancellation with the server; offline or
unverifiable reminders fail closed. A narrow race between verification and OS display,
platform power/network policies and delivery delays cannot be eliminated.

References: [WebKit Home Screen Web Push](https://webkit.org/blog/13878/),
[Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API),
[Web Push transport](https://github.com/web-push-libs/web-push).

## Validation Log

- Baseline `npm run test:workout`: passed.
- `node scripts/test-workout-push.js`: passed duration/threshold/subscription checks.
- `node scripts/test-workout-push-db.js`: passed real isolated PostgreSQL scheduling,
  replacement, OFF/end cancellation, owner/anonymous isolation and fail-open fault injection.
- Final Chromium integration: **43 passed** across auth recovery, Settings,
  Training, Community, shell continuity, timer and workspace recovery specs.
- Continuity/History visual regression run: **19 passed** (includes four overlapping
  timer cases; these are not claimed as 19 additional distinct new behaviors).
- Calendar/Memos/Finances/Projects functional regression run: **27 passed**;
  seven-viewport legacy matrices were excluded with `--grep-invert`.
- Broader product visual review: **1 passed**, capturing Command, Companion and
  Projects at 375/390/430/1024/1440. No page errors or horizontal overflow detected.
- WebKit: **12/13 initially passed**; the avatar focus defect was fixed and its
  failing case passed on targeted rerun. These remain automated-browser results.
- New helper/service tests: **12 passed** via `node --test tests/settings/*.test.js
  tests/workout/modernTraining.test.js tests/workout/modernWorkoutApi.test.js
  tests/workout/exerciseSelectorLabels.test.js`. The Settings service test was
  extended and re-passed for template/timer bearer binding after final review.
- `npm run test:workout`, `npm run test:social-training`, `npm run test:community`,
  `npm run test:schema`, `npm run test:brain`: passed.
- `node scripts/test-settings-identity.js`, `node scripts/test-workout-history-db.js`,
  `node scripts/test-workout-mutation-guards.js`: passed actual isolated database,
  concurrency, Community sync and stale-account checks.
- `npm run test:workout:push`: all four harnesses passed; includes real encryption/
  VAPID request construction, not a claim that a remote provider/device received it.
- `npm run test:pwa`: passed actual production-mode Workbox A→B upgrade, active
  workout deferral, Later, controllerchange, preserved storage and no other-tab reload.
  Test-only update inspection now replaces the intentionally removed Settings panel.
- `npm run check:functions`: passed, **7 functions**.
- `npm run build`: passed. A final rebuild followed the stale-owner safety fix.
- Backend/worker/SW `node --check` and `git diff --check`: passed.
- New CI workflow YAML structure: validated locally with PyYAML; GitHub execution
  remains unverified because committing/pushing is prohibited for this task.
- Catalog generator and sealed applied-migration checks: passed; no applied SQL rewritten.
- Agent-browser axe checks: Settings **0 violations/0 incomplete**, Companion
  **0 violations/0 incomplete** after adding the chat log's semantic role.
- Production bundle scan: no QA adapter identities, preview hooks, history-preview
  fixtures, private push key variable or service-role code found in served frontend assets.

## Visual Evidence and Critique

Actual PNGs are in `docs/audits/lifeos-ui/screenshots/` and use isolated QA records.
Reviewed Settings normal/edit/photo/crop, Training Live/warmup/completion/week filter,
timer normal/amber/red/settings, Feed/Members/More and shared record workspaces.
The supplied references guided circular avatar presentation and timer placement;
they were not copied as fictional workout data. Existing LifeOS navigation remains.

Key captures: `settings-normal-390.png`, `settings-photo-viewer-390.png`,
`settings-edit-390.png`, `settings-photo-crop-390.png`, `timer-normal-390.png`,
`timer-warning-390.png`, `timer-urgent-390.png`, `timer-settings-390.png`,
`training-completion-390.png`, `training-history-week-390.png`,
`community-feed-390.png`, `community-members-390.png`, `more-menu-390.png`,
`command-390.png`, `companion-390.png`, `projects-390.png`.

The anti-slop pass kept work-focused spacing and existing dark tokens, removed
decorative demo charts rather than adding metrics, and corrected the timer cancel
button alignment. Accessibility checks drove explicit focus restoration and log
semantics. It did not add a new dashboard or rebuild stable Training layouts.

## Remaining Limits and Approval Gates

- No commit, push, deploy or production schema/data change occurred. Nothing is staged.
- No schema rerun required. Three **unapplied forward migrations** are required for a
  future approved rollout; see `docs/WORKOUT_WEB_PUSH.md`. Never replay the whole tree.
- Web Push still needs real VAPID keys, server configuration, an operated worker and
  physical permission/delivery acceptance. The UI does not claim notifications are
  configured when the server says otherwise. Five-second polling is not exact OS timing.
- Password recovery was verified with isolated browser fixtures, not a real email or
  production password change. The existing approved redirect must remain allowlisted.
  The flow follows Supabase's documented
  [resetPasswordForEmail](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail)
  and [updateUser](https://supabase.com/docs/reference/javascript/auth-updateuser) APIs.
- Save-as-template locks/retry reuse protect the current device. Cross-device exactly-once
  template creation is not guaranteed by the existing multi-call template API.
- The owner's final confirmation authorizes the pending Barbell Curl identity
  reconciliation. Its exact preflight/local results are in LIFEOS_RELEASE_READINESS.md.
- Community summary caching is memory-only, scoped to the viewer, with a 30-second
  freshness bound and revalidation/invalidation. No offline private detail cache was added.
- Final compatible dependency updates reduced **17 findings (7 high)** to **6
  low/moderate (0 high)**. Remaining build-tool risks are documented in
  DEPENDENCY_RELEASE_AUDIT.md. The >500kB entry warning remains; stale Browserslist
  data was refreshed. A passing build is not a clean security audit.

## Device Limitations

Browser emulation is not physical iPhone Safari/PWA acceptance. Web Push permission,
locked-phone delivery, installed-app cold launch and real background delivery remain
device/deployment acceptance work. No physical delivery claim is made.
