# Training / PWA corrective release (2026-11-03)

No schema rerun required. No production workout/profile data or rest-timer
infrastructure is changed by this release. Rest timers remain retired.

## Training invariants

- New-template appearance is immediately visible; existing appearance editing
  remains collapsible. Only saved user templates are shown.
- Exercise selection is a semantic button, never a read-only text input. Mobile
  Training editing controls are at least 16px; pinch zoom remains enabled.
- `TrainingSheet` owns the native dialog, 210ms entrance/exit, reduced motion,
  body overflow restoration, safe focus return and visual-viewport sizing.
  Short plans are content-sized; long content scrolls below the fixed header.
  Exit completes before unmount. Navigation cleanup never focuses a stale input.
- Weight/reps caret moves to the end on pointer release/click only. Keyboard
  events cancel the deferred adjustment; ordinary typing/selection still works.
- New RPE choices are None/6/7/8/9/10, with no text field. None persists null.
  Legacy fractional RPE remains readable and survives edits unless changed.
- Draft envelopes retain per-exercise baselines for weight/reps/RPE/warmup/notes.
  Automatic initial/next-set targets establish a clean baseline. Manual changes
  are dirty, including edits to a different exercise in the same session. Old
  envelopes without baseline are conservatively protected. Storage failures
  still protect the current in-memory edit.
- End Workout never confirms discarding logger values or implicitly saves them.
  It keeps save-in-progress/double-submit guards. Existing context clears the
  draft only after a successful completion; failures retain it.

## Update architecture

`appUpdateManager.js` has a subscribable immutable snapshot and injected browser
boundaries. `pwaUpdate.js` wires the existing Workbox prompt registration and
checks on registration/launch, foreground/focus/online (60s throttle), and every
15 minutes while visible. Concurrent checks share one promise.

Settings -> Application shows the build-generated full commit SHA, Check for
updates, status and Update now. A compact notice offers Update now/Later; Later
hides the notice for 30 minutes without losing Settings access.

States: checking, downloading, available, activating, loading, confirmed, current,
offline and error. A session marker verifies that a different running build
matches the expected target after reload. A completed check/reload alone is not
proof of an upgrade. Network version mismatch without a ready worker is an error,
not an inaccurate latest-version claim.

**Checks are automatic; activation/reload is explicit.** The guard blocks while
workout data is unavailable, ANY loaded workout is unfinished, or genuine unsaved
work exists. Workbox's implicit controlling-tab reload is disabled (otherwise a
different tab could bypass these guards). An externally activated worker makes
the old tab eligible for a later guarded reload, never a forced one.

Only the updater sends SKIP_WAITING, waits for controllerchange with a bounded
timeout, and reloads after rechecking the guard. No localStorage, IndexedDB, auth
sessions or application caches are cleared. Versioned precache/offline navigation
remain. Vercel serves sw.js and build-version.json without stale caching; HTML is
revalidated. No new API/function, permission or database setting.

## Focused QA

```sh
node scripts/test-app-update.js
node scripts/test-pwa-upgrade.js
npm run test:ui -- tests/ui/training-corrections.spec.js tests/ui/training-active.spec.js tests/ui/workout-continuity.spec.js tests/ui/shell-continuity.spec.js tests/ui/training-prefill-rest.spec.js
# Optional engine selection in PowerShell:
$env:LIFEOS_QA_BROWSER='webkit'
npm run test:ui -- tests/ui/training-corrections.spec.js
npm run test:workout
npm run test:community
npm run test:schema
npm run test:brain
npm run check:functions
npm run build
git diff --check
```

The isolated A/B test builds the actual production-mode app/Workbox with fixture
services, switches one HTTP origin from A to B, verifies waiting/notice/Later,
blocks update during a live workout, ends it explicitly, activates/reloads B,
checks changed installed build/storage preservation, then current/offline states.
It never connects to production Supabase. It is not installed-iPhone testing.

Manual acceptance: on physical iPhone Safari and installed PWA, repeatedly open,
select and close exercise/options sheets, open keyboard for notes/name, dismiss,
change tabs; verify no zoom/scroll jump. Tap different digit positions in weight
and reps; type/delete decimals and use +/-; test keyboard selection on desktop.
Finish a workout with prefill and with unsaved changes: neither logs extra sets.
Check updates in Settings, defer while training, finish, apply and verify a new
build ID without clearing storage. Test an installed desktop PWA separately.

Existing pre-release clients cannot retroactively display the new update notice;
they must first load this release through their existing safe update/relaunch
path. Never clear workout storage to force an update. Physical iOS keyboard,
installed-PWA lifecycle and OS-level zoom remain device acceptance, not emulation.
