# Dock cold-load and long-scroll QA

No schema rerun required. No production data, auth, API or PWA activation change.

## Scope and cause

`Shell.jsx` portals the mobile navigation and active-training resume dock into a
body-level `.shell-docks[data-workspace]` wrapper. Training-only appearance rules
in `trainingStart.css` follow that wrapper; shared dock geometry is unchanged.
Shell navigation dispatches cancelable `lifeos:before-navigate` on `document`
before changing the tab, closing utilities or resetting scroll. History owns its
local dirty/busy listener and beforeunload handling.

A transform (including identity translate3d), transform will-change, or containing
ancestor can make a fixed dock relative to the document instead of the viewport.
Moving fixed elements to body avoids app-root/shell/pull-content containing blocks.
Do not apply transform/filter/contain to body, html or `.shell-docks`.

Important evidence boundary: the inspected App has no DOM wrapper; the current
Shell already placed docks outside PullToRefresh. PullToRefresh uses transform and
will-change only on its content while pulling. No existing dock ancestor transform
was found in the checked-in path. The new regression deliberately injects one and
proves the failure mechanism with a fixed probe before measuring the portaled docks.
This is structural hardening, not proof of the physical iPhone defect's cause.

Manage's old exercise display used a single-column grid for label, options button
and expanded actions, forcing the options button below the name. Parent owns the
compact flex-row correction and all WorkoutTab edits; this change does not edit
WorkoutTab, App, PullToRefresh, shared geometry or the historical editor.

## Automated checks

```sh
npx playwright test tests/ui/dock-long-scroll.spec.js tests/ui/shell-continuity.spec.js tests/ui/training-navigation.spec.js
```

Repeat the focused spec with `LIFEOS_QA_BROWSER=webkit`. Fixtures and network
blocking isolate all tests from production. The new spec measures:

- 375/390/430px cold shell before the lazy Training module/CSS is released.
- 60 real rendered fixture set rows, multiple scroll depths, return to top, and
  640/900/844px viewport heights at the document bottom.
- Dock rectangles, visual viewport bottom/scale, ancestor containing blocks,
  horizontal overflow and hit testing. JSON measurements and screenshots attach
  to the Playwright result.
- Both docks under a transformed root and will-change shell with a 5000px page;
  the resume button still navigates back to Training.
- Canceled navigation preserves route, scroll and the open utilities dialog;
  removing the local guard permits navigation and resets scroll.

## Physical limitations

Desktop Chromium/WebKit and resized windows do not reproduce Safari toolbar
expansion/collapse, cold installed-PWA launch, real safe-area/home-indicator
insets, keyboard animation, pinch zoom or iOS compositor behavior. Existing tests
simulate the keyboard viewport boundary; they do not open a physical keyboard.
On a real iPhone repeat cold launch, long scrolling, toolbar collapse/expansion,
tab switching, keyboard open/dismiss and standalone resume. Record dock bottom,
visualViewport bottom and height before assigning a browser-specific root cause.
No physical iPhone acceptance, deployment or commit is claimed.
