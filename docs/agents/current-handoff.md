# Current session handoff

## Mobile bug follow-up, 2026-11-19

After `aa9cb18`, the user again reports Companion's dock higher on iPhone.
The shared dock frame now anchors from the measured visual viewport top with an
explicit height, bypassing the implicit fixed-position layout-viewport bottom.
The regression covers a visible viewport both taller and shorter than layout,
across actual tab navigation and recovery without focus. The old equal-viewport
tests missed this coordinate-space defect. Physical iPhone rendering remains
unverified; do not claim this browser reproduction proves native acceptance.
This changes navigation CSS only; Companion/keyboard behavior is preserved.

Latest correction after `2ef0d8d`: one fixed body-level frame positions the lower
navigation on every tab; its safe-area-adjusted bottom is lower globally.
Companion locks document panning and uses one effective chat height rather than
separate animated height/padding. Its pull-refresh wrapper and app-added keyboard
motion are removed. Compare rendered rectangles across tabs and a focus/blur cycle,
not only CSS inset values. Earlier "eased dismissal" notes are superseded. Native
iPhone acceptance remains open; see the newest mobile evidence section.

After `a1cd972`, the user reports insufficient typing space, Send requiring prior
keyboard dismissal, Companion's raised dock and cramped exercise results. The
correction holds keyboard state through blur until viewport recovery, preserves
pointer focus, removes duplicate mobile Companion headings and collapses the
toolbar while typing, uses a 54px composer, and gives exercise catalog search the
full visible viewport with one Search/filter/Close row. Acceptance must check
usable space and first-tap actions, not just whether a box fits above the keyboard.
The previous implementation's exercise results measured only 38px in a 360px
visual viewport. Native iPhone acceptance remains open.

The user reopened the iPhone photo zoom and Companion keyboard defects after
`3f7b6dd` reached production. The next correction uses a full-viewport photo
overlay with a native close control, plus a permanent Companion viewport layout
instead of switching positioning modes during keyboard opening. Test loaded square
and portrait photos, not just initials. Safari's native arrows/tick form assistant
bar has no supported PWA opt-out. Preserve that limitation and await user iPhone
acceptance; see the reopened-defect section in the mobile evidence below.

The mobile follow-up fixes pull-to-refresh swallowing small workout-card
taps, isolate photo animation to the circle and remove its container outline,
lower the mobile bar by 6px with visual-viewport tracking from startup, fit
Companion/modal forms above the keyboard, preserve bottom-pinned chat during
resize, and remove the cross-tab workout banner plus Command's Training-in-progress
headline. Training navigation and Command's active-work card still resume the
session. See [mobile bug evidence and device checks](../qa/mobile-bugfixes-2026-11-19.md).
No schema rerun required. Native iPhone keyboard/photo/cold-PWA behavior still
needs physical-device acceptance. The user explicitly authorized committing and
deploying this follow-up. Release through `main` and the existing Vercel Git
integration; confirm READY status and the public build-version SHA for completion.

## Release batch: 2026-11-18 to 2026-11-19

The user explicitly requested the final Delete-button correction, all checks,
updated handoff, commit, push and merge to main. Validation is authorized again;
older instructions to defer tests applied only during the earlier feedback batch.
The validated release branch is `release/ui-refinements-20261118`, based on
`fe8b99c`, with `main` as the authorized merge target. Check current Git refs
for the completed merge rather than relying on older local-only notes.
Release status and final evidence: [UI release checks](../qa/ui-release-2026-11-19.md).

## Preserve these UI decisions

- Training Create/Edit use the same name/appearance/exercise components. The
  labelled title has a subtle underline; color and icon choices are collapsed
  menus. Defaults for new templates are blue and the general dumbbell.
- Approved Manage/Create heading typography and the first-template empty state
  stay. Your templates is the small blue back link above the editor heading.
- Blue Add exercise opens the custom searchable picker. Exercises are staged
  locally with Up/Down/Remove in one contextual row and reversible motion.
  Create/Save is one full-width green final action; confirmed Delete matches
  its size and shape in red. There are no per-exercise write buttons.
- Draft navigation guards, mutation exclusion and partial-save Retry remain.
  `saveDraft` binds each request to the initiating account, uses stable exercise
  IDs, stages unique orders, preserves notes and reads back the saved template.
  Exact attempted order states distinguish retries from external reorders.
  This is a multistep client operation, not a database transaction.
- The empty-workout sheet is compact: heading/X, one labelled name and Start.
  Training's start heading is beside the icon, with no LIVE badge.
- Community author names use @ and regular 18px type with a 44px avatar. Counts
  align at the right: exercises on the title row, sets on every subtitle row.
  Shared detail reuses the author styling, keeps the unboxed date right beside
  the workout title, highlights warmups orange and omits exercise-number badges.
- Community profile photos use Settings' geometric thumbnail-to-circle viewer,
  without edit/delete controls. Settings shows the circle with pencil/bin only;
  its username is vertically centered and Edit stays on the card's right edge.
  Photo motion enlarges/shrinks from the clicked position, without fading.
- Preserve the shared charcoal/blue palette, floating spring mobile bar and
  Companion conversation/context-sheet work included in this release.

## Validation and local artifacts

`npm test` passes, including the durable template-draft helper test. The isolated
attention database now shares its deterministic insertion clock with application
expiry calculation; production schema and expiry constraints are unchanged.
The browser fixtures were updated for current control names, custom menus,
staged templates, mandatory username setup, warmup reset and completion flow.
Async persistence assertions wait for confirmed writes.

All 430 Chromium and 63 focused WebKit cases were validated, including final
focused rechecks after fixture/timing corrections. Exact batch results and
remaining boundaries are recorded in the release evidence.
Physical iPhone/PWA, native photo picker/camera, screen-reader speech and push
notification display require device acceptance; browser emulation does not prove
those. No live database mutations or schema changes were made for release QA.
No schema rerun required.

Private authenticated Community snapshots/photos, screenshots and review probes
remain ignored under `test-results/`. Generated `graphify-out/` and historical
`lifeos-rest-implementation-notes/` scratch remain local and ignored. Durable
source, tests and accumulated documentation are included; rankings documents and
simulations remain design-only and do not implement ranking behavior.

## Resume the local preview

Inspect `git status` first. `node scripts/serve-ui-qa.js` serves current source at
http://127.0.0.1:4178 with isolated fixtures; reuse it if already running. Standard
routes are `/settings`, `/community`, `/workout` and `/assistant`.
The populated, current-database Community review is available locally at
`/test-results/community-preview.html`; its ignored snapshot is dated and is not
live synchronization. Never commit or deploy those private fixture artifacts.

Relevant acceptance details: [Training Manage](../qa/training-manage-apple-design.md),
[Community](../qa/community-apple-design.md), [Settings](../qa/settings-apple-design.md),
[Companion](../qa/companion-apple-design.md), [bottom bar](../qa/apple-bottom-bar.md).
