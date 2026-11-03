# Dock cold-load and long-scroll QA

Dock positioning needs no schema change. The recovery release separately adds
the targeted atomic exercise-deletion RPC/index migration documented in
TRAINING_CORRECTIVE_RECOVERY.md. Do not rerun the full schema.

## Scope and cause

`Shell.jsx` portals the mobile navigation and active-training resume dock into a
body-level `.shell-docks[data-workspace]` wrapper. Training-only appearance rules
in `trainingStart.css` follow that wrapper; shared dock geometry is unchanged.
The shared context tab setter dispatches cancelable `lifeos:before-navigate` on
`document` before changing tabs. Shell closes utilities/resets scroll only after
approval, and Community only updates its hash after approval. History owns its
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
and expanded actions, forcing the options button below the name. `WorkoutTab.jsx`
now keeps each exercise's order, name and options control on one compact row.
The History editor also lives in `WorkoutTab.jsx`; no App or PullToRefresh changes
were needed.

## Automated checks

```sh
npm run test:ui -- tests/ui/dock-long-scroll.spec.js tests/ui/training-history.spec.js tests/ui/workout-continuity.spec.js tests/ui/training-templates.spec.js
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

This change is committed and deployed. Desktop Chromium/WebKit and resized windows do not reproduce Safari toolbar
expansion/collapse, cold installed-PWA launch, real safe-area/home-indicator
insets, keyboard animation, pinch zoom or iOS compositor behavior. Existing tests
simulate the keyboard viewport boundary; they do not open a physical keyboard.
On a real iPhone repeat cold launch, long scrolling, toolbar collapse/expansion,
tab switching, keyboard open/dismiss and standalone resume. Record dock bottom,
visualViewport bottom and height before assigning a browser-specific root cause.
No physical iPhone acceptance is claimed. The automated geometry checks validate
the rendered viewport behavior in browser engines and do not establish how iOS
Safari or a standalone PWA handles its native browser chrome.
