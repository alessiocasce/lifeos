# Apple-style mobile bottom bar

Local mobile follow-up: [tap/photo/dock/keyboard fixes](mobile-bugfixes-2026-11-19.md). The bar now sits 6px above the safe area, tracks visual viewport changes from startup, and the cross-tab workout banner is removed. Older measurements below describe the earlier release.

Final accumulated release evidence: [2026-11-19 checks](ui-release-2026-11-19.md).
This supersedes earlier deferred-validation and local-only status notes below.

Date: 2026-11-17. Local, uncommitted implementation; not deployed. Uses the user-requested `apple-design` guidance. No schema rerun required.

## Current interface

- Five equal destinations: Command, Community, Training, Companion and More. Desktop navigation stays in the existing rail. The oversized inactive Training tile is removed.
- Floating dark dock with a 12px viewport inset plus bottom safe area, rounded translucent material, restrained icon/label hierarchy and one selected pill. The workout resume bar is a separate opaque rounded surface above it; More's panel uses matching visual treatment.
- A critically damped selection spring preserves its current position and velocity during rapid route changes. Navigation still commits on click/release, with immediate CSS pointer-down feedback and native drag-away cancellation. Reduced motion snaps selection directly; increased contrast/reduced transparency use solid surfaces and defined borders.
- Body-level dock portal, cancelable navigation, More focus return, keyboard hiding and workout continuity remain. No transform/filter/contain is applied to dock ancestors. Only the selection pill moves.
- `ResizeObserver` measures both bars to reserve content space and position the resume bar/update notice. Labels wrap with larger text; Companion's composer clears the resized stack. No workout data or service contracts change.

## Files

- `src/components/MobileNavigation.jsx`: destination controls, selected spring, resize/media cleanup and measured dock heights.
- `src/components/Shell.jsx`: mounts the bar using existing route, keyboard, More and workout state.
- `src/styles/navigation.css`: floating material, typography, press/focus states, accessibility adaptations and clearance.
- `src/styles/trainingStart.css`: removes four old tab-specific dock overrides, so lazy Training CSS cannot restyle the shared bar.
- `tests/ui/mobile-dock.spec.js`: new interaction/geometry checks. Existing long-scroll/navigation tests now expect floating insets; scroll comparison tolerates browser rounding within one CSS pixel. `shell-continuity.spec.js` uses a cross-engine synthetic touch fixture.

## Validation

Chromium: **40/40** tests pass across `mobile-dock`, `dock-long-scroll`, `shell-continuity`, `companion` and `training-navigation`. Includes six viewport widths (360/390/430/768/1024/1440), English/Italian, both languages at 200% root text, rapid spring retargeting, reduced motion/contrast, pointer cancellation, More focus, long scrolling, cold lazy CSS, transformed app roots, canceled navigation, keyboard simulation and workout/Companion continuity.

Brain, production build, generated Italian dictionary and whitespace checks pass; the existing non-failing large-chunk build warning remains. Chromium reduced-transparency emulation reports a solid `rgb(25, 31, 41)` dock and no backdrop blur. Screenshots at all six widths are local ignored evidence in `docs/audits/lifeos-ui/screenshots/apple-dock-*.png`; normal Italian 390px was visually inspected with the resume bar.

WebKit: **14/14** focused tests pass across `mobile-dock`, `dock-long-scroll` and `shell-continuity`. The official Playwright WebKit engine was installed after its initial missing-executable failure. An existing pull-refresh fixture used a nonconstructible desktop-WebKit `Touch` object; it now dispatches the same synthetic touch coordinates using an Event with a touches payload, retaining its service-worker/workout-guard assertions. After that fixture correction, Chromium shell continuity passes again (4/4), and the complete WebKit focused batch passes. This changes test portability only, not production pull-refresh code.

The final overflow clipping and PWA-notice spacing were included in the final build and WebKit run. These are isolated UI fixtures; no production account or workout was changed.

## Device acceptance

Physical iPhone safe-area/home-indicator behavior, Safari toolbar movement, installed-PWA keyboard/compositor behavior and screen-reader speech remain unverified. Browser-engine and synthetic viewport checks do not establish physical-device acceptance. No schema/backend/dependency change. No commit, push or deployment performed.
