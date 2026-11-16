# History visual QA - local review

Release approval received after the screenshot review. The final release gate
re-runs focused Training/browser checks and verifies that QA preview markers are
absent from production assets. Historical no-deployment notes below describe the
earlier review-only phase, not the current release authorization.

## Final Training follow-up

Reviewed the six new 390x844 captures under
test-results/training-final-confirmations: changed name/date, discard and delete
dialogs, short completion, long completion and its bottom. Completion follows
the written direction and existing LifeOS tokens; no separate completion mockup
was attached to this request, so exact fidelity to that missing image is not
claimed. The three supplied History references still inform editing surfaces.

Removed Save changes. Workout drafts survive internal editing, with one Done
action. Custom confirmations use dark surfaces, explicit red actions, safe
initial focus and no backdrop confirmation. Completion uses restrained green
success, high-contrast Back to training and compact recorded-set summaries.
First screenshot review caught inherited logger scroll hiding Training tabs;
the completion mount now restores scroll top before paint. Recapture verified
the header/tabs. Long summary View history is measured above the opaque dock.

Current evidence: 39 distinct focused Chromium cases pass across runs (one old
test interaction was corrected after Done became read-only); seven WebKit cases
pass. Render/storage and metric checks pass. Build passes with existing large
chunk/Browserslist warnings. Device Safari/installed PWA are not physically
tested. No production data writes, commit, push, deployment or migration.

The following section records the earlier History-only visual pass.

final result: passed

Scope: approved History read-only/edit/set-edit mockups, with written corrections
taking priority. Visual review only; owner approval is still pending. No commit,
push or deployment is authorized at this stage.

## Comparison evidence

Source: the three codex-clipboard images attached to the task. App-owned content
was compared against rendered 390x844 browser captures, excluding the reference
phone frame/status bar/home indicator.

Captures: test-results/history-redesign-review/
training-history-design-ap-d32a9-t-and-inline-editing-at-390/
01-readonly.png through 05-add-set.png.
Long detail: test-results/history-redesign-final/
training-history-design-lo-cb0fb-reserves-destructive-guards/06-long-workout-bottom.png.

## Review loop

- First pass: compact charcoal cards, centered primary actions, actual set data,
  inline Set 2 placement and dock opacity matched the requested direction.
- Found P1: the shared mobile input rule reduced the editable title to body size.
  Fixed with a narrowly scoped title selector; recapture confirms 32px hierarchy.
- Corrected capture scrolling to show Save/Cancel fully above the dock; actual
  long-detail clearance is measured by the browser spec, not hidden by cropping.
- Second comparison: no remaining P0/P1/P2 visual issues against the written
  specification. Title/date have no pencil icons; read-only has no completion or
  Community link; collapsed cards have no performance stats. Compact RPE and
  warmup inputs replace the mockup's inconsistent controls.

## Intentional differences

Blue is the fixture's saved template accent, not a hardcoded purple. Real saved
appearance and the LifeOS fallback token remain authoritative. Date editing uses
the existing native date field; its presentation follows browser locale. Existing
LifeOS header, five destinations, safe-area behavior and portal are retained.
Long expanded workouts scroll naturally; not all controls fit in one viewport.

## Functional evidence and limits

32 focused Chromium cases passed; six selected WebKit cases passed. The final
390px capture case passed after frame-settled scrolling. Workout render/storage
checks passed. Real iPhone keyboard/toolbars and installed-PWA behavior were not
physically tested. No backend or production workout data was changed.
