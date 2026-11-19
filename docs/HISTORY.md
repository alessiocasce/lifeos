# LifeOS Release History

Newest-first release and handoff log moved verbatim from `PROJECT_CONTEXT.md`.
The current architecture and module reference stays in `PROJECT_CONTEXT.md`.

## UI refinement release (2026-11-19)

Dock/motion follow-up after `2ef0d8d`: use one fixed navigation frame across tabs,
lower its safe-area-adjusted position globally, lock Companion document panning,
and calculate chat height with dock clearance once. Remove independently animated
keyboard height/padding/toolbar changes and Companion's translated pull-refresh
container. New regressions compare actual coordinates and staged keyboard frames.
Physical iPhone acceptance remains separate. No schema rerun required.

Keyboard usability correction after `a1cd972`: keep editing geometry until actual
keyboard dismissal, preserve Send pointer focus, remove the extra dock offset,
collapse redundant Companion headings while typing and use a smaller composer.
Exercise catalog search now occupies the visible viewport with a compact search/
filter/close row and custom names available in results. New regressions reproduce
the first-tap failure, premature dock return and 38px exercise results region.
Physical iPhone acceptance remains separate. No schema rerun required.

Corrective iPhone follow-up after the user reported that `3f7b6dd` still magnifies
the page on Community photo opening and compresses Companion during keyboard
opening: use a full-viewport photo dialog with a stable native dismissal control,
bound actual image dimensions, keep one fixed Companion layout through keyboard
resize, and stop composer height-observer churn. The input requests text/Send;
Safari's native form assistant bar cannot be disabled by this PWA. Physical-device
acceptance remains open. No schema rerun required.

Mobile bug follow-up: preserve workout-card taps through small finger movements,
animate only the profile photo and remove its modal outline, lower navigation by
6px and track the visual viewport from startup, fit chat/forms above the keyboard,
retain latest replies during resize, and remove the cross-tab training banner.
User authorized commit/push and production deployment through `main`. Build,
Brain, function-count, whitespace and focused Chromium/WebKit checks passed;
physical iPhone acceptance remains separate. See [mobile checks and release target](qa/mobile-bugfixes-2026-11-19.md).
No schema rerun required.

Accumulated Settings, mobile navigation, Companion, Community and Training UI
changes, plus the documentation audit/handoff, were validated on
`release/ui-refinements-20261118` for push and fast-forward merge to main. Template creation/editing now share the staged
builder, custom exercise menus and a green final action; confirmed Delete matches
Save in full-width red styling. Release review corrected external-order conflicts.
See [release checks and deployment status](qa/ui-release-2026-11-19.md).
No schema rerun required. Older unreleased notes below describe earlier snapshots.

## Local Community UI implementation (2026-11-17, unreleased)

Visual follow-up: removed exercise-index/jump controls at the user's request; Community profiles now reuse Settings' actual profile card, avatar sizing, username typography and compact Edit action. Workout details use a clear title/preview/count summary, Feed-level exercise headings and stronger data hierarchy. Notes follow the exercise log. See current Community evidence for validation timing.

Implemented the complete approved Community redesign: Feed/Members, profiles, authorized read-only photo viewer, open workout tables and contextual navigation/focus restoration. Existing sharing/notes/account boundaries remain. Frontend, translations, isolated tests and handoff documentation only; uncommitted and undeployed. No schema rerun required. See [Community evidence](qa/community-apple-design.md).

## Rest-timer coordination (2026-11-17)

Implemented tickets #6 -> #7 -> #8 in four reviewed commits: `b2c213d`, `84a3b82`, `10c52a1`, `fe8b99c`. The integration branch was pushed and fast-forward merged/pushed to `main` at `fe8b99c70c7487500883954fd515f13a5cb487c8`. Production deployment `dpl_7o4x396sDEX2mGhK6dcFvB43qPxs` is READY for that SHA; the public build-version endpoint was independently checked on 2026-11-17.

The coordinator owns fixed lifetimes, immutable confirmed snapshots, mutation exclusion, coalesced refreshes, explicit outcomes and partial-notification-save reconciliation. The thin hook owns attachment/events and the view retains its sheet/countdown. Production/fixture owner guards and stable error codes protect multistage setup without changing logout ownership, schema, worker transport or network-independent display.

Coordinator/adapter/rest/push/Brain/build/Italian/diff checks passed; focused Chromium passed 21/21. Standards review found no documented breaches; its optional error-protocol finding was fixed/rechecked. Spec review found no actionable gap. Two unrelated prefill cases have stale Weight locators. Physical iPhone delivery remains pending; new hosted-RLS or Oracle-health acceptance was not performed. No schema rerun required. See [acceptance evidence](qa/workout-rest-coordination.md).

## iPhone Push Reliability Correction (2026-11-09)

The correction removes network verification from the display path and
sends immutable Declarative Web Push with a visible legacy fallback. WebKit can
revoke subscriptions after silent pushes; the old handler demonstrably dropped
accepted pushes on background-network failure. Actual device revocation is not
proven by provider-acceptance logs. Server cancellation remains before dispatch;
in-flight accepted pushes cannot be unsent, so TTL60/stable replacement Topic/tag
limit that race. Device status is reconciled on Training resume/online; explicit
Reconnect handles missing/revoked registration without altering other-device consent.
No migrations or Oracle/WhatsApp service changes. Physical iPhone reacceptance
requires the guarded update, reconnect and60second tests. See WORKOUT_WEB_PUSH.md.

## Production modernization (2026-11-09)

Merged PR2, production SHA87acd1ead077ce73ad4e35af96030bc826787242, Vercel READY.
Five targeted forward migrations applied with verified backup/isolated restore;
54 workouts/564 sets and protected data preserved. Foreground timer works; background
Web Push is gated OFF because hosted pg_net queue permissions cannot isolate a
dispatch credential. Guard fails closed, no VAPID/dispatch secret provisioned.
Owner deferred Oracle access. Physical iPhone/PWA/email acceptance remains pending.
See `docs/audits/LIFEOS_PRODUCTION_LAUNCH.md` for exact ledger and live QA evidence.

### Original modernization scope

The merged `codex/lifeos-ui-modernization` branch adds Settings/profile polish,
Italian defaults with explicit English retained, lowercase username normalization,
independent autosaved preferences, and password recovery. Training has direct warmup
control (OFF after successful save), convention-aware load labels, completion
acknowledgment/template creation, and server-filtered All/Week/Template History.
Filtered older sessions are retained in the mutation cache without changing the
active workout. The owner's confirmed Barbell Curl history uses the existing EZ
UUID exclusively; the retired picker UUID stays as an inactive catalog definition.
The reconciliation preserves performance text/fields (224 total, 79 active).

The new PWA-only rest timer uses server deadlines, private subscriptions and a
separate Web Push worker. It does not revive WhatsApp/outbox timers. The three
feature migrations plus disabled Cron/transport guard are applied; VAPID/worker
configuration and physical delivery acceptance remain blocked/pending as above.
No schema rerun required; never broad-replay migrations. See
`docs/WORKOUT_WEB_PUSH.md` for the secure transport gate and requirements.

More/Community navigation uses account-scoped memory caching, preserving search,
pages and scroll while revalidating privacy. Shared confirmations, lazy-workspace
recovery and the existing PWA guarded activation are retained/improved. Dead demo
state, mock finance actions, unused decorative chart helpers and `recharts` are
removed; `tabRoutes` owns route identities directly. Rankings plans remain untouched.

This production section supersedes older rest-timer-absence/catalog-count/UI descriptions
below, which document past releases rather than this modernization. Evidence:
`docs/audits/LIFEOS_UI_UX_MODERNIZATION.md`.

## Unified Training editing and completion - approved release (2026-11-03)

Built on the uncommitted History visual refinement. Done editing is the only
workout-detail save action; name/date drafts survive internal exercise/set
navigation and individually saved set mutations. Dirty inline sets require Save
set or Cancel before switching context/finishing. Failed mutations retain drafts.
History discard/deletion uses the accessible ConfirmationDialog, including
continuation-aware application navigation. Browser unload protection remains
browser-managed; no native confirm/alert calls remain in the History editor.

Persisted ended sessions now show a dedicated completion screen, recorded-set
summary, Back to training (clear selection only), and View history. Aggregate
load-volume is shown only when every set has known total_external, bilateral
catalog semantics and valid weight/reps; bodyweight, assistance, machine-display,
per-implement and custom/unknown movements suppress it. Duration is shown only
for valid start/end intervals of 1 minute through 12 hours. No rewards or timer.
No backend, schema, Community projection or PWA activation changes. No schema
rerun required. Owner approved the visual review and authorized the targeted
release. QA preview fixtures are isolated to scripts/serve-ui-qa.js substitutions
and tests/ui/fixtureApi.js, never imported by the production Vite configuration.

## History visual review - local only (2026-11-03)

Uncommitted frontend refinement against the approved three History mockups:
collapsed exercise cards, directly editable title/date, green Done editing,
inline per-set form, compact warmup/RPE, contextual Back to workout and overflow
exercise deletion. Read-only History no longer exposes View in Community or the
completion label. Persisted template appearance supplies the accent, falling back
to the LifeOS token. Dock geometry/portal is unchanged; its Training surface is
opaque. Existing mutation APIs, pagination, concurrency, completion and Community
sync are untouched. No schema rerun required. The owner subsequently approved
this design for the unified Training release. See docs/design-qa.md and QA_WORKOUT.

## Floating Training sheets / picker navigation (2026-11-03)

The mobile dock has shared CSS geometry across lazy Training and other tabs;
Training only changes its appearance. No JavaScript positioning workaround.
Sheets float 10px + safe area above the visual viewport bottom, with four rounded
corners and safe area counted once. Exercise plans use 01 numbering and complete
accent borders. One dialog now animates plan <-> catalog, with Back, independent
scroll state and no search autofocus. Empty workouts use a name-only sheet;
Rome date/timestamp are captured at submission, and duplicate/failure/exit handling
preserves the existing logger. No schema rerun required. See
docs/TRAINING_NAVIGATION_QA.md for measured QA and physical iOS limitations.

## Training UX / PWA corrections (2026-11-03)

Approved structure is unchanged. Training sheets now share animated, content-sized
native dialogs with visualViewport/safe-area constraints and safe button focus.
Exercise triggers are semantic buttons (no Safari input-focus zoom). Numeric taps
place the caret at end without overriding keyboard edits. New template appearance
is directly visible. RPE is one None/6/7/8/9/10 selector; historical fractional
values stay intact. Per-exercise draft baselines distinguish prefill from edits.
End Workout never prompts to discard a logger form or silently saves it.
Settings -> Application exposes shared update state, build SHA and manual checks;
automatic discovery never forces activation. Workbox's implicit cross-tab reload
is disabled. Updates block while workouts load, any workout is active, or genuine
unsaved work exists. No destructive storage/cache reset. No schema rerun required.
See docs/PWA_TRAINING_CORRECTIONS.md for code boundaries, A/B Workbox QA and
physical-device limitations. Unrelated OAuth work remains excluded.

## Active Training / Identity / Media (2026-11-03)

The approved active-session reference now governs logging: template-colored header,
exercise sheet, collapsed Last time, weight/reps steppers, More options sheet,
selected-exercise sets and separate End workout. Manage is a library plus one editor.
Only set notes remain in routine inputs; historical notes are untouched. Draft v1
stores exercise-specific banks to prevent weight/reps/RPE/warmup leakage.
Rest timers are retired end-to-end by the forward `training_active_identity_media`
migration, including queued/claimed rest rows; unrelated outbox rules are unchanged.
New workouts capture nullable appearance metadata without altering plan snapshots.
Avatar URLs are viewer-scoped/deduplicated in memory; photos use content validation,
15MB/60MP limits and 512px WebP/JPEG output. Private bucket/ownership remain.
Signup requires username; confirmed-user finalization and mandatory missing-profile
onboarding preserve genuine email verification and case-insensitive uniqueness.
See docs/TRAINING_ACTIVE_RELEASE.md for the exact migration, QA and limitations.
Production applied/sealed `20261103023105_training_active_identity_media.sql`.
Historical source hashes match (48 workouts/483 sets/4 templates/3 profiles/47 shares),
pending rest is zero, and rollback-only A/B/anonymous role smoke left no records.

## Approved Training visual reference (2026-11-02)

The supplied iPhone image supersedes the earlier prose-only grid interpretation.
Live start state now uses the framed blue-icon/LIVE intro, Templates heading,
stacked colored rows with chevrons and a subdued empty-workout card. Mockup names
are visual examples ONLY: Live lists saved user templates in loaded order, never
suggestions/placeholders. Zero templates offers Create template opening Manage;
incomplete saved plans open Manage rather than starting an invalid workout.
Stored colors/icon keys are unchanged. Twelve original curved vector icons replace
block anatomy; Manage has labeled color-aware choices and a live preview.
No schema/data changes. Header/dock refinements are Training-scoped, and active
logging, drafts, rest, History and Manage keep their existing behavior. See
docs/TRAINING_VISUAL_FIDELITY.md for screenshot evidence and focused QA.

## Training/Profile/Community/Auth release (2026-10-31)

Live / History / Manage separates gym logging from template administration.
Quick start uses only persisted templates, never sample plans or invented
exercises. Template visual identifiers are constrained and user-owned. Workout
draft/rest/session continuity architecture is unchanged. Profiles now use usernames
only and private Storage avatar paths with short-lived signed reads. Community
navigation records per-entry origins/search/scroll rather than always returning
to Feed. Signup preserves real Supabase verification with an explicit production
redirect. Schema rollout is expand -> verified frontend -> username-only cleanup;
never drop the old column before the compatible frontend deploys. See
docs/TRAINING_PROFILE_RELEASE.md for invariants, rollout and focused QA.
Production applied `20261102115233` (expand) and `20261102115554` (cleanup)
around verified frontend deployment `2a05f25`. Source hashes match for 45 workouts,
454 sets, template contents/timestamps, identity, preferences, rest and projections.
Real Storage A/B/anonymous HTTP and rollback-only DB QA passed; fixtures removed.
No actual email mailbox click or physical iPhone/camera acceptance is claimed.

## Automatic Community sharing (2026-10-30)

Workout Sharing defaults ON for new/unset accounts, while existing explicit OFF
choices are preserved. With an authored public profile, every eligible completed
workout (including history) is synchronized by database triggers. OFF removes all
projections; ON restores eligible history. Notes default OFF and are controlled
only by their global preference. No per-workout publish/revoke controls remain.
Private source RLS is unchanged; Community reads sanitized projections only.
Source edits refresh, reopen/delete withdraw, completion republishes. A BEFORE
STATEMENT writer gate serializes source/profile/privacy writes for this small
community. Projection errors withdraw stale shares without losing source logging.
Feed v2 paginates by performed_on + UUID; publication timestamps are audit only.
Auth-bound calls/account-keyed UI remain. See docs/COMMUNITY.md. No rankings.
The approved second cohort is now mapped: 16/16, audited global total 442/442.
Main-account records and all non-exercise fields/timestamps match before hashes.
Production applied `20261030111420_second_training_cohort.sql` and
`20261030113250_community_workout_shares.sql`; filenames/hashes match the ledger.
The original manual-publication RPCs are retired by the automatic-sharing forward
migration. Sync helpers are private/admin-only; workout_share_status is read-only.
Production versions `20261030121657` (automatic sharing) and `20261030121659`
(authorized degra identity) are applied/sealed. Verified 41 casce + 2 degra shares,
442 sets, no public notes, duplicates, unfinished sources or changed dates. Source,
auth, casce identity, existing preferences, rest and private-policy hashes match.
Rollback-only production A/B/anon checks passed. No permanent QA records created.

## Approved exercise revision (2026-10-30)

Catalog V2 has 224 identities (79 active/145 inactive), preserving all original
UUIDs/slugs. ExercisePicker is a mobile sheet/desktop dialog with local tentative
search and explicit commit; inactive IDs remain displayable, never normal choices.
Owner-only correction updates approved historical text/IDs while preserving all
timestamps and non-identity fields; conflicting IDs or set-number collisions abort.
Live scope is 426 owner sets, not the 442 global rows (16 belong to another user).
Production migration `20261030105557_exercise_catalog_revision.sql` is applied.
Verified 426/426 owner sets and 16/16 template exercises mapped; non-exercise
fields/timestamps, other-user records, rest state and private policies match the
pre-migration checksums. Authenticated A/B and anonymous rollback-only QA passed.
See `docs/EXERCISE_CATALOG_REVISION.md` for migration, backup, scope and QA rules.
Applied SQL is sealed by `supabase/catalog-migrations.json`; generate only forward
revisions. The old global backfill operation is intentionally retired/guarded.

## Social Training identity foundation (2026-10-29)

English/Italian UI now uses `src/i18n` and private per-user language preferences.
Settings saves language immediately without remounting Training. Authored content
is never translated; canonical exercise display labels change, stored IDs/text do
not. Settings requests bind a captured auth token and expected identity to prevent
cross-account stale-form writes. Guest language is temporary. Focused browser QA
is `tests/ui/social-training.spec.js`; database/security QA is `test:social-training`.
Production schema migrations `20261029211252` and `20261029211303` are applied and
verified. These Supabase-assigned versions replace the original local filenames.
Historical content hashes/counts, rest preferences and private policies match
before/after. A rollback-only authenticated A/B role smoke passed in production;
this is not physical iPhone or real second-account browser acceptance.
Full rollout order, privacy rules and generation checks are in
`docs/SOCIAL_TRAINING_FOUNDATION.md`. No social feed or ranking is implemented.

Catalog milestone adds 217 curated bilingual IDs, aliases, load conventions,
nullable set/template IDs, snapshot backfill and catalog-first/custom selection.
Legacy text is preserved; ambiguous shorthand stays unmapped. Rest scheduling
only gains ID-aware next-set matching. Catalog migration `20261029211303` follows
identity. No feed, leaderboard or cross-user workout reads.

Settings `/settings` is available from Records/More. Public profiles are explicitly
authored; no email/auth metadata is copied. Private user preferences default to
English and both sharing flags OFF; these flags publish no workouts. Invoker RPCs
derive ownership from auth.uid(), with two-user RLS tests. Existing owner-only
Companion/rest APIs and all private-table policies remain unchanged. Training
works without completed onboarding. See docs/SOCIAL_TRAINING_FOUNDATION.md.
The final mapping audit deliberately leaves equipment-ambiguous shorthand unmapped.
Coverage is 131/442 sets, 6/16 template exercises and 24/61 snapshot entries. Added
aliases do not change existing canonical IDs. See the foundation handoff and
`docs/SOCIAL_TRAINING_DEPLOYMENT.md` for production verification boundaries.

## Training targets / durable rest timer (2026-10-04)

Set-trigger scheduling is best-effort: a protected subtransaction catches timer
errors (SQLSTATE-only warning), preserves the saved set and restores any prior
timer if replacement fails. Notification availability must never block logging.

Exercise suggestion selection or keyboard Enter/Tab prefills only empty weight/reps
from the matching Last Time set. No blur-time writes. Confirmed saves prefer the
next historical set, otherwise repeat saved targets; RPE/notes always clear.
Warmups and working sets keep separate numbering. Draft/storage/history remain intact.

Rest timer is OFF by default; compact Live controls persist user-scoped server
preferences. Existing authenticated `/api/ai/actions` handles timer controls;
no new function. The `workout_sets` INSERT trigger queues the durable notification
in the same transaction as the saved set, even if the PWA dies immediately.
Source `workout_rest_timer` bypasses autonomous attention/MONITOR/MESSAGE, does
not acquire reply ownership, and uses existing provider mappings. OFF/end/delete
cancel queued/claimed rows; already handed-to-bridge sends cannot be recalled.
Five-minute late grace; actual arrival is bounded by bridge poll cadence/availability.

Requires `20261004134735_workout_rest_timer.sql` before backend/frontend deployment.
Applied to production in this rollout (Supabase-assigned version; original local
filename was `20261002175702_workout_rest_timer.sql`). No historical ledger repair.
Physical WhatsApp/iPhone acceptance remains pending. Run
`npm run test:workout:rest`, targeted `training-prefill-rest.spec.js`, History and
continuity browser cases. See QA_WORKOUT for physical background/WhatsApp QA.

## Training History Editing (2026-11-03)

Recovery audit: History now pages in stable 25-session batches (date, start time,
UUID tie-breaker with null-start support), with retry/deduplication and direct
recovery of an active session outside the first page. Previously only 25 sessions
were accessible after refresh. Already loaded page depth is revalidated on resume.
The shared tab setter owns unsaved-navigation checks; Community links respect
cancellation before changing their hash. Add-exercise checks dirty state once.
Exercise deletion now uses the invoker/RLS-scoped
`delete_historical_workout_exercise` RPC, validating full membership and exact set
versions under the existing Community writer gate, then deleting transactionally.
This requires only the forward `workout_history_atomic_delete` migration before
the compatible frontend deploy, not a schema rerun. It also adds a history cursor
index. See docs/TRAINING_CORRECTIVE_RECOVERY.md for evidence and device limits.
Production applied/sealed `20261103154140_workout_history_atomic_delete.sql`;
source/projection/policy/trigger hashes match across rollout.

Completed sessions stay completed. Reopen is removed; historical corrections
occur in place in Training → History and never clear `ended_at` or change the
Live `activeWorkoutId`. Details are read-only by default with visible Edit
workout/Delete workout actions. Edit mode supports session name/date, per-exercise
set editing/add/delete, exercise removal and explicit catalog exercise addition.
History derives performed exercises only from saved sets, not the template
snapshot. New historical sets use noon UTC on the workout's recorded date to
avoid assigning them to the current day. Optimistic timestamps reject stale edits;
Community projections continue to synchronize through existing database triggers.

The mobile/resume docks render through a body portal so transformed app or
PullToRefresh ancestors cannot capture their fixed positioning. History stores
list scroll separately; details open at the top and return to the saved list
offset. Manage template exercises use compact single-line option rows. Existing
draft storage, active-session identity, root resume and PWA update protection
remain unchanged. Do not rerun the full schema; apply the targeted migration only.

Focused QA: `npm run test:workout`, `node scripts/tests/test-workout-history-db.js`,
`node scripts/tests/test-workout-mutation-guards.js`, and focused
`tests/ui/training-history.spec.js`, `tests/ui/workout-continuity.spec.js`, and
`tests/ui/dock-long-scroll.spec.js` Playwright specs. Desktop browser emulation
does not verify physical iPhone Safari toolbar or standalone-PWA behavior.

Last updated: 2026-11-03
Current branch: `main`

## Frontend reconstruction local completion (2026-10-02)

All eight workspaces, Training continuity, revised navigation/design system,
authenticated typed Watch controls and Companion state/permission surfaces are
implemented and audited locally. The complete post-correction browser run passed
225 tests; `npm test`, production build and function-count gate passed (seven).
The original 45-section evidence map and 23-part report are in
docs/archive/UI_RECONSTRUCTION_AUDIT.md and docs/archive/UI_RECONSTRUCTION_REPORT.md.
Older checkpoint notes below describe the sequence, not current unfinished scope.
Physical iPhone lock/keyboard/process eviction, production CRUD/Watch delivery and
production PWA activation remain explicitly unverified. No schema rerun required.
No reconstruction deployment or unauthorized push is claimed. Existing local
deployment-QA/OAuth-smoke edits remain outside reconstruction commits.

## Frontend reconstruction checkpoint (2026-10-01)

Cross-workspace audit (2026-10-02): rendered muted date/unit/status/empty-state
text failed a 4.5:1 reading-contrast check on six screens. Shared text-only
utilities now use readable steel values; surface and disabled-control colors
are unchanged. `tests/ui/workspace-audit.spec.js` waits for each actual workspace,
then checks visible button/summary heights, muted-text contrast, horizontal fit
and runtime exceptions on all eight routes at seven required sizes. This is a
bounded browser audit, not WCAG certification or physical-device verification.
See docs/archive/UI_RECONSTRUCTION_AUDIT.md for the remaining brief reconciliation.

Control audit checkpoint (2026-10-02): regressions measured Companion Retry at
36px and the undated-only Add Dated Memo control at 40px. Both now have 44px
minimum targets. Memory title/content use neutral, visible focus treatment;
keyboard retry, editor tab order and reachable Save are covered at all seven
requested viewport sizes. The full isolated browser suite passes 169 tests.
This does not prove physical iOS or production behavior. No schema rerun required.

Preservation checkpoint (2026-10-02): Training exercise suggestions now retain
focus within the group, support arrow/Home/End selection and Escape dismissal,
and use 44px targets without changing the draft/session contracts. A prior-session
regression verifies warmups/future sessions cannot replace previous performance.
Memory Forget failure/retry is covered without deleting the conversation.
Warmup edit classification now has reload/numbering coverage; session deletion
has confirmation/failure/retry/draft-cleanup coverage and a 44px control.
Populated insights retain the existing secondary three-record view.
See docs/archive/UI_FEATURE_PRESERVATION.md for the source/test evidence map and explicit
remaining gaps; this is not full reconstruction completion. No schema rerun required.

Entry-path checkpoint (2026-10-02): authentication and lazy workspace loading now
use the same neutral visual grammar as the reconstructed app. Credential fields
have explicit autocomplete semantics; in-flight submissions lock fields and mode
switching, with a synchronous duplicate-submit guard. Failures retain input and
announce an alert; email-confirmation signup announces a status and stays signed
out. The existing Supabase auth/session contracts are unchanged. Ten isolated
browser checks cover retry, confirmation, keyboard order and seven viewport sizes.
No schema rerun required. Full feature-preservation/whole-app audit remains open.

Companion detail/state checkpoint (2026-10-02): action history details are native
modal dialogs with contained focus, explicit focus return and independent Escape
dismissal. The parent context ignores child-dialog close/cancel events (including
Strict Mode cleanup). Request/response/error/reference/action data are preserved.
Routine labels now share Health's human-readable Active/Paused/No longer current/
Not certain language; preference text remains unchanged. Report/memory sections
use unframed rows and 44px controls instead of nested decorative containers.
No schema rerun required. Full preservation and whole-app/device audit remain.

Companion history access checkpoint (2026-10-02): loaded conversations and reports
now have progressive disclosure instead of unreachable rows after the twentieth
conversation/fifth report. Expanded action history exposes all loaded entries.
Default views stay bounded; no API limits or database queries changed. Browser
coverage selects the twenty-fifth conversation and opens the eighth report.
No schema rerun required. Whole-app preservation/device audit remains open.

Companion report-preservation checkpoint (2026-10-02): restored the missing
assistant-message Save to Vault callback, which made the preserved modal
unreachable after reconstruction. Save/detail now use native modal dialogs with
focus return, 44px controls and in-flight dismissal protection. Report failures
retain input/content; archive failures are caught and shown, not unhandled.
Existing report types/tags/markdown/archive/embedding repair contracts are kept.
Browser fixtures exercise these paths without production or Gemini calls.
No schema rerun required. Full feature-preservation and final whole-app audit remain.

Cross-app continuity checkpoint: Shell now reacts to input focus even when the
visual viewport shrank first; blur uses the next focus target to restore docks.
Four isolated browser tests cover both event orders, delayed reconnect/token
refresh with visible Training drafts, back/forward/resume, and waiting PWA update
deferral during a live empty logger. This is browser-boundary simulation, not
physical iOS/production service-worker evidence. No schema rerun required.
Full feature-preservation audit and whole-app/device QA remain outstanding.

Training continuity and the five-destination mobile shell are implemented locally;
the full reconstruction is still in progress. Project details now have typed
LifeOS Watch controls and separate Companion MONITOR/MESSAGE checkboxes through
the existing `/api/ai/actions` route. These controls require the configured user's
verified Supabase session, preserve standing permissions and never directly send
WhatsApp. No schema rerun required. See [app-control QA](QA_COMPANION_UI.md)
and [remaining reconstruction scope](archive/UI_RECONSTRUCTION_PROGRESS.md).

Companion now has a mobile/desktop context side sheet with bounded current
routine/preference state, Watch summaries, independent permissions, saved chats
and memory correction tools. Conversation selection survives tab navigation;
current-state corrections prepare an unsent message. The existing authenticated
actions route adds a read-only `companion_context` view. No schema rerun required.
This is a local UI checkpoint; the full reconstruction is still in progress.

Command/Home now leads with active work, today's calendar and dated open memos,
followed by recorded health/training/project context and tomorrow's commitments.
Empty data stays quiet; calendar/memo refresh failures are distinguished from an
empty day. There are no writes or new backend reads on Home. Rome-local dates
and times use shared helpers. Displayed items navigate to their existing screens.

Health's local reconstruction checkpoint prioritizes selected-date check-in and
44px habit/counter controls, with secondary recent-record summaries and history.
Empty logs do not produce invented patterns. Existing autosave and canonical
sleep-date behavior are unchanged; browser QA covers isolated persistence and
failure journeys, not production sleep recalculation. See `docs/QA_HEALTH.md`.
Projects now prioritize session execution and Watch, with All/Active filtering,
active-session resume and secondary progress/records/history/money sections.
Native project/money editors retain CRUD and return focus. Failed deletes report
errors; switching projects cannot silently carry a session draft. Browser tests
use isolated fixtures; production progress remains database-authoritative.
See `docs/QA_PROJECTS.md`. Utility-screen reconstruction and whole-app QA remain
in progress. No schema rerun required.

Memos now presents each dated reminder once, with undated notes secondary and
recent closed history collapsed. Equal colored metrics and duplicated next-up
content are removed. Native editors retain date/time shortcuts, CRUD and status
actions; focus returns and saves cannot be dismissed mid-flight. Twelve isolated
browser cases cover persistence/failures and seven sizes. No backend/schema change.
See `docs/QA_MEMOS.md`; Calendar/Finances and whole-app QA remain in progress.

Calendar now combines one selected-day agenda with a compact seven-day selector
and week navigation. Neutral category labels and unframed rows replace colored
cards. Native event editors protect in-flight saves and restore focus; identical
start/end is rejected. Failed loads remain distinct from empty days. Thirteen
isolated browser cases cover CRUD/status/date/error journeys and seven sizes.
No API/schema change; see `docs/QA_CALENDAR.md`. Finances and whole-app QA remain.

Finances now prioritizes capture and the selected-month ledger, with category
breakdown and recent other-month records secondary. Equal colorful metrics and
the chart dependency on this screen are removed; all expense fields/custom
categories/CRUD remain. Failed writes retain input, deletion asks confirmation,
and in-flight forms disable duplicate edits/submits. Untouched date/month defaults
follow Rome rollover while explicit selections are preserved. Fourteen isolated
browser cases cover workflows and seven sizes; see `docs/QA_FINANCES.md`.
No API/schema changes. Full feature-preservation, Training template and device QA
remain required before the full reconstruction can be considered complete.

## Current Companion Slice 4 Handoff (2026-09-26)

Health routine-state checkpoint (2026-10-01): today's Health check-in now reads
the existing authenticated Companion context projection and displays supported
current routines separately from daily habit counts. Active, paused, inactive
and uncertain states are human-readable; no belief is inferred from a daily log.
Historical dates do not present today's current state. Empty routine context
stays quiet; failed reads offer refresh without blocking logging. Companion is
the correction surface and prepares unsent changes through its existing flow.
No backend/schema changes. Full preservation and whole-app/device audits remain.

Training setup/templates checkpoint (2026-10-01): readable unframed management
rows and 44px actions preserve session/template/exercise CRUD and ordering.
In-flight template mutations lock panel dismissal and sibling edits. Deletion
asks confirmation while existing workout snapshots remain intact. Failed session
starts now show an alert outside the active logger. Twelve isolated browser
tests cover these journeys and seven viewport sizes; see `docs/QA_WORKOUT.md`.
No API/schema changes. Full preservation audit, useful routine-state integration
and whole-app/device QA remain outstanding; this is not full reconstruction completion.

Slice 3.1 memory hardening is committed at `adf31f5`; typed monitor/permission checkpoint B is committed at `677dc40`. Slice 4 Attention/WhatsApp work is tracked in [the live progress handoff](archive/CODEX_COMPANION_VNEXT_SLICE31_4_PROGRESS.md). Code now has one bounded project-staleness monitor type, separate default-off MONITOR/MESSAGE standing permissions, a deterministic silent/message Attention Engine, a reason-code ledger, and read-only MCP monitor/attention diagnostics. The existing outbox remains the only WhatsApp delivery path. `npm test`, build and seven-function check pass locally; this is not live production verification.

**Deployment gate:** production now records the Slice 3 memory migration plus explicitly applied `20260926172636_companion_external_sync` and `20260926172705_companion_attention_monitors`. Both new schemas were verified read-only. Older physical reliability/belief/OAuth objects still lack matching ledger rows; do not run blanket `supabase db push`. This backend has not been deployed, so monitor/WhatsApp behavior remains local-only. OAuth link-secret QA remains blocked. No Oracle bridge code changed. See `docs/QA_DEPLOYMENT.md` for the live sequence.


## Companion vNext Product Direction (2026-09-18)

The living product north star for the next major LifeOS evolution is **[docs/LIFEOS_COMPANION_VNEXT.md](LIFEOS_COMPANION_VNEXT.md)**. Read that file before planning substantial new Brain, proactive, memory, WhatsApp, voice, monitoring, MCP, PWA, or desktop-companion work.

Important distinction:

- this file documents **current implemented architecture and operational handoff**;
- `LIFEOS_COMPANION_VNEXT.md` documents the **target product behavior and staged roadmap**;
- do not treat unimplemented vNext ideas as current capabilities;
- preserve the existing BrainTurn/WhatsApp reliability guarantees while evolving the user-facing system.

Current vNext priorities start with the existing pain surface: make WhatsApp/Brain conversational, support semantic stale-routine/current-belief changes, prevent narrow proactive resolvers from discarding meaningful compound replies, and build toward deep autobiographical memory + MCP semantic sync. Desktop Focus remains a planned organ but is not the first overall Companion priority.

Hard current constraints: keep the existing Oracle-hosted `whatsapp-web.js` transport, prefer a WhatsApp-call proof of concept before PWA/WebRTC fallback, require a **€0 new recurring-spend path**, and keep model/provider dependencies replaceable.

Recent context: Assistant now has a shared Brain backend used by app chat and WhatsApp inbound, with a formal BrainTurn contract, controlled command-draft stage, planner stage, and backend LifeOS tool guards.

### Companion vNext First Slice

The first current-state vertical slice is implemented in repository code. `brain_beliefs` stores one current belief per `(user, subject, predicate)` plus immutable superseded rows, confidence, provenance, effective time, and bounded negative feedback. All mutations go through the service-role-only atomic `apply_brain_belief_transition` RPC; authenticated clients have user-scoped read access only. Apply `supabase/migrations/20260919120000_companion_beliefs.sql` before deploying the backend that reads this table.

`brainCompanionTurn.js` composes three distinct contracts: the already-selected immutable proactive target, validated routine semantics, and Butler wording. A rich reply can resolve the owned Health check-in without a Health write, update routine state, preserve unrelated residual content for knowledge extraction, and return one grounded response. A bare `no` records bounded feedback but never means permanent deactivation. Candidate generation and poll-time delivery revalidation both consult current routine beliefs.

The original MCP belief tools remain read-only. `get_current_beliefs`, `lifeos://brain/current-beliefs`, and the shared LifeOS context expose sanitized current rows only; superseded history stays in Postgres. Run `npm run test:companion` for focused current-state/compound-turn coverage.


### Companion vNext Slice 2 — Explicit Context Sync

The next implementation brief is **`docs/archive/CODEX_COMPANION_VNEXT_SECOND_SLICE.md`**.

Slice 2 adds one narrow mutating MCP tool, `sync_context`, while preserving existing MCP read behavior. Reads require `lifeos.read`; semantic sync requires `lifeos.write` from an explicitly granted OAuth token or distinct `LIFEOS_MCP_WRITE_TOKEN`. The static read token never authorizes sync. OAuth write grants require independently configured link/signing secrets, and existing ChatGPT connectors must be re-linked to request `lifeos.write`. See `docs/MCP.md` for the supported envelope and `docs/archive/CODEX_COMPANION_VNEXT_SLICE2_PROGRESS.md` for the implementation/deployment checkpoint.

Supported semantic families are intentionally limited to tracked routine state, four allowlisted preference keys, and four context fields attached to an existing user-scoped project. The complete request is validated and project-grounded before any write. The service stores a bounded request audit, digest and per-item belief idempotency keys; partial failures retry without duplicating applied transitions. The shared context compiler exposes current preference/project beliefs. The tool cannot expose arbitrary CRUD/SQL, create projects, mutate project progress/money/sessions, send WhatsApp, create monitors, execute Brain actions, or write calendar/memo/expense/Health operational records.

Apply `supabase/migrations/20260926172636_companion_external_sync.sql` after the Slice 1 belief migration in new environments. Production applied it explicitly on 2026-09-26. It adds the audit table, `external_sync` provenance, and revokes unintended public/authenticated RPC execution; it does not alter operational data. Ambient/background ChatGPT synchronization is not part of Slice 2.

### Companion vNext Slice 2.5 + Slice 3 — Current Execution Target

The combined execution brief is **`docs/archive/CODEX_COMPANION_VNEXT_SLICE25_AND_3.md`**.

Slice 3.1 memory hardening now guards observational recall from explicit-memory parsing and post-answer extraction, repairs clearly dated event/decision kinds, and reconfirms narrowly recognized cross-channel communication preferences (including punctuation variants). It does not rewrite the two existing production duplicate preference rows. Run `npm run test:memory` and read `docs/archive/CODEX_COMPANION_VNEXT_SLICE31_4_PROGRESS.md` before Slice 4 work. No schema rerun is required for Slice 3.1.

The run is deliberately security-gated: OAuth authorization-code replay hardening must be completed, tested, and checkpointed before any deep-memory work begins. Authorization codes must become single-use across concurrent serverless instances without persisting raw codes, PKCE verifiers, access tokens, or secrets.

After that gate is green, Slice 3 evolves the existing `ai_memories` / `brain_beliefs` / `ai_insights` / Brain Vault split into autobiographical memory v1: current beliefs remain authoritative current truth; curated memories represent durable facts, episodes, decisions, goals, constraints, and grounded project history; insights remain hypotheses; Vault remains long-form knowledge. Retrieval must be bounded and relevant rather than a full memory dump.

Slice 3 may extend the existing `sync_context` contract with a narrow autobiographical-memory semantic family and add a read-only bounded memory-search MCP tool. It must not broaden operational side effects or introduce generic CRUD.

Repository checkpoint: Slice 2.5 is committed as `dd83153` and pushed to `main`. Its OAuth code redemption is a single unique insert of a SHA-256 JTI hash after client/redirect/PKCE/scope/audience validation. Replay returns `invalid_grant`; database failure fails closed. The OAuth migration was applied to production before the push. Deployed connector behavior still needs live QA.

Slice 3 repository implementation uses `api/_utils/brainAutobiographicalMemory.js` and additive `supabase/migrations/20260925215527_companion_autobiographical_memory.sql`. The SQL is unchanged; its filename now matches the migration version already recorded in production. `ai_memories` remains the single curated autobiographical store with kinds `semantic_fact`, `episode`, `decision`, `project_memory`, `goal`, and `constraint`; existing rows default to `semantic_fact`. The service-role-only curation RPC atomically reconfirms exact matches or supersedes a stable subject, while low-confidence inference cannot replace explicit memory. Project memories require an existing user-owned project. `brain_beliefs` stays authoritative current truth, `ai_insights` stays hypothetical, and Vault stays long-form. Brain app/WhatsApp load bounded topical memories from the same service; true memory recall uses a capped broad set. The Context Compiler includes a compact autobiography section. `sync_context` accepts a narrow `autobiographical_memory` update under `lifeos.write`; read-only `search_memory` requires `lifeos.read`. No operational LifeOS table or proactive rule is added. The Slice 3 migration was applied before commit `81c592b` was pushed to `main`; production rows and privileges were verified. Live QA on 2026-09-26 confirmed Vercel status, MCP reads, app remember/reconfirm, and a physical WhatsApp round trip, but found unintended memory creation from a recall question and duplicate cross-channel memory. See `docs/archive/CODEX_COMPANION_VNEXT_SLICE3_PROGRESS.md` before treating Slice 3 as release-green.

## Reliability Release Handoff

### WhatsApp interaction ownership patch

The backend now persists Brain metadata as bounded structured JSON (`metadata_version: 2`) and selects one immutable interaction owner per WhatsApp turn in `brainInteractionSelection.js`. Selection precedence is grounded current-message Health/commands, strong pending cancellation, trusted native quote, active delivered interaction, a 30-minute adjacent legacy fallback, then normal Brain routing. The selected object is attached to BrainTurn/BrainTurn Contract and passed unchanged to proactive execution; old history is not rescanned for another writable target.

Durable transport correlation requires the additive migration `supabase/migrations/20260908231937_whatsapp_interaction_reliability.sql`. It adds inbound execution receipts, scoped outgoing provider-message mappings, one versioned interaction row per WhatsApp thread, and a unique assistant/outbox linkage. These tables are service-role-only with RLS enabled and no authenticated-client grants. Do not fabricate IDs or infer old provider IDs.

The Oracle/PM2 bridge source is stored at `bridge/whatsapp/wts.js`; `bridge/whatsapp/providerMessageContract.cjs` is the single provider-ID/quote-envelope implementation used by runtime and `npm run test:bridge`. Current WhatsApp Web can expose message IDs as `$1` while `whatsapp-web.js#getQuotedMessage()` still reads `_serialized`, so the bridge restores that validated compatibility field before quote retrieval and uses a bounded raw-data fallback. In the current provider runtime, `client.sendMessage()` can also deliver a bubble while returning no message object. The bridge therefore listens for the matching outgoing `message_create` event before sending and uses that event as the provider-identity fallback. Outbound sends are serialized so an event cannot be assigned to another concurrent send.

Normal replies and proactive ACKs send singular plus plural provider IDs, and the backend stores one exact mapping per physical WhatsApp bubble. A proactive `sent` ACK with no provider ID is rejected before the outbox transition; a successful sent ACK now means the proactive assistant message and every physical delivery mapping were persisted. Duplicate sent ACKs retry the same idempotent mapping writes. Debug output uses only provider-ID counts and 12-character fingerprints. The old duplicate reference adapter was removed.

Native quote lookup remains exact and scoped by user/channel/canonical recipient, then BrainTurn verifies the resolved assistant belongs to the current thread. Debug traces distinguish unknown provider ID, recipient mismatch, thread mismatch, non-replyable, expired, resolved, and invalid-value outcomes without logging raw provider IDs. The PGlite reliability journey covers fresh and out-of-order wake/sleep/habit quotes, original target dates across Rome midnight, multi-chunk mappings, and resolved-target idempotency. Physical Oracle/WhatsApp delivery still requires manual QA.

Deterministic current-message Health reports now recognize Shower/Creatine/Skin completion and negation before pending/proactive routing. Completion ensures the daily target once; it never writes a note pretending to be a habit. Accountability time parsing accepts complete expressions such as `3 e 30 di notte` as `03:30` and rejects unrelated numeric sentences.

Read [the release/deploy checklist](RELIABILITY_RELEASE.md) before deployment. **Database change required:** apply `supabase/releases/reliability.sql` with polling paused and old clients closed, then deploy/reload the app before resuming. Outbox source IDs are text; transactional admission/claim spacing and project contribution triggers are now database responsibilities. Do not retain the old frontend project increment alongside the trigger.

BrainTurn and runtime proactive dispatch share family-aware target selection. Accountability replies ensure a Health target rather than incrementing, persist resolution, and invalidate queued work; poll revalidates sources. Free-text notes cannot update habits. Missing sleep remains unknown. Pending Open Loops reduce latest state before filtering. Frontend day defaults observe Rome rollover, and MCP reports post-serialization set truncation.

Run `npm test` (Brain, MCP, embedded PostgreSQL schema contracts, lifecycle tests, bridge adapter fixtures), `npm run check:functions` (7), and build. No physical WhatsApp delivery is exercised by these local suites. Live outbox smoke is opt-in and preview-only unless `LIFEOS_SMOKE_MUTATE=1`. After deployment, correlate the same safe fingerprint across outgoing capture, ACK mapping persistence, and inbound native-quote lookup. Remaining cross-transaction/send-before-ACK races still require operational monitoring.
