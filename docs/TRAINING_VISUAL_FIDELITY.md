# Training Live Visual Fidelity

Reference: owner-supplied `Schermata Training_ Allenamento Live (1).png`.
This overrides the earlier prose-only two-column design interpretation.

## Current-Run Audit

1. Authenticated production, 390px: data/actions, three views and navigation were
   working. Visual fidelity was poor: unframed introduction, no LIVE badge, two
   columns, small unframed symbols, Quick start title, plain empty-workout link.
   Captured baseline at 390/768/1024/1440 before edits; no production writes.
2. Corrected start state: single-column full-width rows, rounded tinted surfaces,
   accent icon containers, chevrons, blue dumbbell intro and green LIVE badge,
   Templates heading/subtitle and dark secondary empty-workout card. Header/date,
   tabs and dock proportions are scoped to Training; other workspaces unchanged.
3. Rechecked responsive screenshots against the supplied image. Persisted data
   still determines names/counts; missing templates explicitly say Set up template.
   There is no fake iPhone frame, OS status bar, home indicator or fabricated data.

## Invariants

- Defaults for unconfigured suggestions: red / blue / purple / amber / green.
  Every valid stored color/icon overrides defaults. No migration or DB rewrite.
  An existing green Quads template remains green if that is its saved preference.
- Real templates still use the same start/snapshot logic; suggestions open Manage.
  Empty workout still expands the existing form. Unfinished sessions retain Resume.
- Active logger, drafts, rest scheduling, History and Manage CRUD remain intact.
- Anatomy icons reuse the themeable icon library, focused on the relevant body
  region; they are not pixel-identical copies of the illustrated reference glyphs.
- App dates/data, platform font rasterization and desktop sidebar differ on purpose.
  Shorter phone viewports scroll; bottom safe-area padding keeps controls reachable.

## Verification

Focused `training-live-manage.spec.js` guards vertical geometry, the new hierarchy,
palette, saved appearance precedence, no invented counts, setup/start/CRUD and
immutable snapshots. Check 390/768/1024/1440; inspect actual screenshots, not only
test assertions. Targeted History, prefill/rest, templates and draft-continuity cases
also cover unchanged behavior. Run `test:workout`, build and diff checks.

Current-run before/after screenshots are in `test-results/training-fidelity/`;
isolated test screenshots live in `test-results/training-fidelity-final-tests/`.
These are ignored QA artifacts, not production assets. Browser-width emulation is
not physical iPhone/PWA lifecycle acceptance. No schema rerun required.
