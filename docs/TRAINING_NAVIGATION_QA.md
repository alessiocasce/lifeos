# Training navigation corrections (2026-11-03)

No schema rerun required. No API, production record, rest-timer, auth or PWA
activation change. Existing unrelated OAuth edits must stay excluded.

## Invariants and root causes

- The global dock now has one geometry on every tab, including before lazy
  Training CSS arrives. Training previously replaced 72/58px dock/button minimums
  with 66/54px, producing an app-controlled jump on load/navigation. Appearance
  overrides remain; dimension overrides are removed. CSS fixed-bottom positioning
  is retained, with the home-indicator inset counted once. No JS dock offset or
  animation masks the problem. Browser-toolbar viewport resizing can still move
  a fixed dock physically; that is not the same as a route-driven height change.
- Training sheets have four 22px corners and a 10px bottom gap plus the safe inset.
  Safe area is outside, not duplicated in bottom padding. The visualViewport
  bottom, height limit, internal scrolling and existing animation endpoints share
  that floating origin. Desktop dialogs remain centered. Keyboard/reduced-motion,
  focus, busy, Escape and backdrop contracts remain in TrainingSheet.
- Template exercise rows use full transparent borders, with a higher-specificity
  accent border on selection. The former separator rule overwrote the selected
  bottom border. Numbering is lightweight/tabular 01..20, NOT logged-set numbering.
- One stable picker dialog contains inert/aria-hidden inactive views. Plan slides
  left as catalog enters from right; Back reverses it. Height changes animate,
  header stays outside scrolling, plan scroll is restored, and catalog query/filter
  stays independent. Back is absent without a plan. Search is never auto-focused.
  Custom/catalog selection closes the dialog without changing the template.
- Start empty opens a name-only New workout sheet. Date/timestamp are captured at
  submission using the existing Europe/Rome helper and one Date instance. A ref
  locks duplicate submissions through the successful exit animation. Failure keeps
  the name; Cancel writes nothing. The portal remains mounted while the new logger
  appears behind it, so successful creation can animate out normally.

## Focused automation

```sh
npm run test:ui -- tests/ui/training-navigation.spec.js tests/ui/training-active.spec.js tests/ui/training-corrections.spec.js tests/ui/exercise-picker.spec.js tests/ui/workout-continuity.spec.js
npm run test:ui -- tests/ui/training-templates.spec.js --grep "empty session start"
# PowerShell: repeat the new navigation spec with the WebKit engine
$env:LIFEOS_QA_BROWSER='webkit'
npm run test:ui -- tests/ui/training-navigation.spec.js
npm run test:workout
npm run test:community
npm run test:pwa
npm run build
git diff --check
```

The navigation spec records dock bounding rectangles/visual viewport bottom and
height across first shell render, five destinations and real viewport resizes at
375/390/430px. It checks all sheet corners/gaps and captures screenshots. It also
checks a 20-exercise plan, selected borders, 01/10 numbering, a connected dialog
through Back, scroll restoration, catalog filtering/custom selection, and the
name-only creation path with rollback-free isolated fixtures. The midnight test
creates at 23:05 UTC, requiring the next Rome date. No production workouts are
created or edited by automated QA.

## Physical acceptance still required

Chromium/WebKit windows and viewport resizing are NOT physical Safari browser
chrome or an installed iOS PWA. On iPhone cold-launch with Safari controls expanded,
record dock bottom/visualViewport.bottom, collapse controls, switch all tabs and
scroll. A changed viewport bottom may legitimately move the dock; dock height must
not change just because Training CSS loads or a tab changes. Repeat in standalone
mode with the real home indicator. Open notes/name keyboard; sheets must stay
inside the visible viewport and the dock must return after dismissal. Verify no
zoom, clipped corners, stale focus, draft loss or forced PWA activation. Never
clear browser storage or finish a real workout merely to perform deployment QA.
