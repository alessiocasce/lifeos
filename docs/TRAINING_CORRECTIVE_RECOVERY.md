# Training corrective recovery audit - 3 November 2026

## Recovery baseline

- Local main and fetched origin/main: dfc122c, including e960299.
- Production alias independently reported READY at dfc122c.
- One working tree; no stashes. The only initial dirty file was WorkoutTab.jsx
  (task-related editor/source-baseline changes). No OAuth or Companion files were
  dirty in this recovery. The existing editor intent was integrated, not reset.
- Prior agent docs/tests are in the two known commits, not missing worktrees.
- No catalog identity corrections, rest-timer restoration or PWA changes.

## Original requirement audit

| Area | Before recovery | Corrective work and evidence | Remaining limitation |
| --- | --- | --- | --- |
| A: remove Reopen | Implemented | No reopen handler/button or historical ended_at mutation; UI and database tests retain completion | None found |
| B: History editing | Implemented, basic coverage | Read-only default, direct Edit/Delete, details name/date, saved/error states, stable Live identity; broadened browser coverage | No production-user CRUD performed |
| C: exercise/set editor | Partial safety and test coverage | Captured baseline/source revision is kept together; inline editor; RPE None/6/7/8/9/10; existing 8.5 preserved; failure/duplicate/stale-write/numbering tests | None found in tested paths |
| D: add/remove exercise | Partial | One dirty-discard check on selection; tentative/custom/catalog additions persist only via sets; atomic removal RPC; no template-only groups | Real simultaneous clients not exercised; transaction semantics tested in PostgreSQL |
| E: delete workout | Implemented, insufficient UI coverage | Direct destructive button, confirmation, failure retention and success return; DB cascade and RLS verified | No destructive production smoke |
| F: Community/analytics | Existing transactional sync | DB tests check title/date/set counts, stable share ID/audit time, note privacy, withdrawal and A/B/anon authorization; React mutations refresh source sessions used by Last Time | No physical second-user acceptance |
| G: dock | Portal implemented, physical cause unproven | Portal retained; cold/lazy, long-scroll, transformed-root fault injection, resized viewport, hit-testing, clearance and keyboard simulations in Chromium/WebKit | Physical Safari toolbars, home indicator, compositor and standalone cold launch unverified |
| H: scroll independence | Implemented, partial coverage | List offset restored, every detail opens at zero including same detail; saves do not invoke scroll restoration | Physical Safari scroll behavior unverified |
| I: Manage rows | Implemented | Two-digit order, flexible names, right-aligned 44px options, compact row bounds, CRUD/reorder and mobile/desktop screenshots | None found in automated layouts |

## Proven defects fixed

1. Context called list() with the service's implicit 25-workout limit. History now
   exposes Load older workouts using 25-session keyset pages plus one lookahead.
   Ordering is performed_on, started_at (NULLS LAST), UUID, all descending.
   Cursor timestamps retain database microseconds. UUID breaks ties.
   Pages deduplicate, preserve existing locally refreshed rows and retry without
   dropping the visible list. Refresh revalidates loaded page depth. A saved
   active session outside page one is fetched directly before draft recovery.
   An open History detail is independently retained by ID during refresh, so
   moving its date outside the loaded page range does not evict a dirty editor.
   Source sessions include their set data; there is no unlimited all-history join.
2. WorkoutSharing called setActiveTab directly and changed its hash regardless of
   cancellation. The shared setter now runs the cancelable navigation policy;
   Shell does not double-dispatch, Community only changes hash after approval,
   and cross-tab browser Back observes the same guard.
3. Exercise deletion was a loop of independently committed HTTP requests.
   The new delete_historical_workout_exercise RPC is SECURITY INVOKER with a fixed
   empty search_path and authenticated-only execution. Ownership/RLS, completed
   timestamp, exact group membership, duplicate IDs and every updated_at are
   checked before deletion. It acquires the existing Community writer advisory
   gate before row locks. A trigger fault rolls back all deletions and projections.
   It does not renumber or modify unrelated sets, templates, catalog or workouts.
4. Add-exercise onCommit and startSet both called canLeave. startSet now owns one
   check and returns success before addition state changes. A dirty switch emits
   one confirmation; canceled/empty additions persist no records.
5. History ordering used started_at alone. It now honors corrected performed_on
   first, retaining start-time/ID tie breakers for Last Time comparisons.

## Data and completion invariants

Normal edits preserve set/workout identities, ownership, canonical IDs,
performed_at, started_at, ended_at and template snapshots. Only requested fields
change. Historical backfills use 12:00 UTC on the workout's recorded date rather
than the time of correction. Working/warmup numbering remains separate; deletion
leaves surviving set identities/numbers intact and counts derive from saved sets.
Fractional RPE is retained until deliberately changed.

Existing Community source triggers refresh the same eligible projection. Notes
remain gated by the global consent preference; final-set deletion or workout
deletion removes public visibility. RLS and privacy policies are not replaced.

## Migration and rollout

Only the forward workout_history_atomic_delete migration is needed. It adds an
invoker function and a user/date/start/UUID history index; no data backfill or
trigger replacement. Apply this migration before pushing the dependent frontend.
Do not rerun schema.sql or replay historical ledger gaps. Seal the actual
Supabase-assigned filename/hash in catalog-migrations.json.

Production applied `20261103154140_workout_history_atomic_delete.sql` through the
targeted connector. Repository version/hash matches the assigned ledger version.
Function metadata confirms invoker execution, fixed empty search_path, anonymous
denial and authenticated grant. The index physically exists. Before/after hashes
match for 48 workouts, 500 sets, 5 templates/23 exercises, 3 profiles/preferences,
48 projections and all existing workout policies/triggers. No historical ledger
replay, source-data mutation or new UI fixture was performed in production.
Pre-existing advisors (Auth password protection, older function search paths,
intentional restricted backend tables/RPCs and performance hints) remain outside
scope; this function introduces no SECURITY DEFINER or mutable-search-path warning.

Before/after checks fingerprint private sources, profiles/preferences, Community
projections, existing workout triggers and policies. Production smoke must be
read-only or reject invalid/unauthorized operations before any deletion. Actual
success/failure/rollback CRUD is tested in isolated PostgreSQL fixtures.

If frontend deployment fails, the additive function/index may safely remain.
Prefer a forward code fix or code rollback; never destructively reverse history.

## Verification commands

Run test:workout, scripts/test-workout-history-db.js,
scripts/test-workout-mutation-guards.js, test:community, test:social-training,
test:schema, test:pwa, check:functions, build, syntax and diff checks.

The focused browser command is:

```sh
npm run test:ui -- tests/ui/training-history.spec.js tests/ui/dock-long-scroll.spec.js tests/ui/workout-continuity.spec.js tests/ui/training-templates.spec.js tests/ui/shell-continuity.spec.js tests/ui/training-navigation.spec.js
```

Repeat applicable History/dock/keyboard/picker cases with LIFEOS_QA_BROWSER=webkit.
The recovery includes 55-session pagination, missing-page retry, an active session
outside page one, stale set versions, failed individual/whole-exercise deletion,
tentative and custom additions, dirty Community/Live navigation, duplicate submit,
historical dates/times, fractional RPE, source-only groups, and completion retention.
Manage captures cover 375/390/430px and desktop; dock geometry captures include
scroll offsets, visual viewport, ancestors, hit testing and content clearance.

## Observed validation results

- Requested six-spec Chromium run: 54 passed (2.1m).
- Applicable WebKit History/dock/keyboard/picker/mobile+desktop cases: 28 passed
  (1.7m). Strengthened same-detail/edit-scroll check passed separately in both
  engines (1 each); final dated-out-refresh/older-active delta passed 4 Chromium
  and 2 WebKit cases. Last Time reflects corrected reps/new sets in the targeted
  completed-edit browser case.
- test:workout: 11 render states plus continuity/storage harness passed.
- history DB harness: 5 assertion groups passed, including RPC fault rollback,
  Community identity/privacy, owner RLS, stale versions and final-set withdrawal.
- mutation guards: 4 assertion groups passed (service predicates, real keyset
  builder, existing context wrappers and atomic-wrapper account-switch rejection).
- test:community: 5 groups; test:social-training: 5 groups; test:schema: 8 groups.
- test:pwa: state/guards plus real production-mode Workbox A->B suite passed.
- check:functions: 7. Production build and syntax/locale/diff checks passed.
  Existing Browserslist age and large-bundle warnings remain.
- Production rollback-scoped rejection smoke: owner read allowed, other-user
  private visibility/mutation denied, empty membership rejected, anonymous denied.
  No successful destructive RPC was run against real workout data.

## Acceptance still requiring an actual iPhone

Cold Safari and installed-PWA launch; toolbar expansion/collapse during long
History/detail scroll; home-indicator clearance; real software-keyboard animation;
return/resume and pinch zoom. Playwright WebKit is not physical iOS acceptance.
The physical cause of the reported mid-page dock has not been reproduced on a
device here, so it must not be reported as physically resolved.
