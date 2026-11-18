# Training Manage: existing-template editing

Final accumulated release evidence: [2026-11-19 checks](ui-release-2026-11-19.md).
This supersedes earlier deferred-validation and local-only status notes below.

## Current: Edit reuses the approved creation form

Edit and Create now render the same form, appearance editor and exercise draft
builder, including the custom picker, blue Add exercise trigger, compact animated
actions and layout springs. Editing uses the same full-width green final action,
labelled Save template; Delete template is the one separate confirmed destructive
action below the form. The previous edit-only layout and per-exercise write/
save controls are removed. The approved creation/empty-manager design remains.

All exercise additions, ordering and removals stay local until Save template.
Save preserves existing row IDs and notes, assigns stable IDs to additions and
reads back the final template. Exercise changes stage into unused positive order
positions before final ordering, avoiding temporary unique-order collisions.
Metadata-only changes skip exercise writes. Each request captures the expected
account; unexpected rows or changed baseline content cause a conflict instead of
silently replacing another change. No schema changes/migration required.

This save uses multiple existing Data API operations, not a new transaction RPC.
Failures can partially apply; the form truthfully locks its draft for Retry or an
explicit leave decision. Retry reconciles the same stable IDs and reads confirmed
state, including after a lost response. Saved workout snapshots are unaffected.

Focused Chromium review passed: exact shared layout/full-width green Save,
staging without writes, navigation protection, failed save/retry, retained IDs/
session and exercise notes, and six-width normal/200% English layout. Actual
mobile render inspected. A mocked-client probe executed the production save
helper and checked order uniqueness, lost-stage-response retry, preserved IDs/
notes, removals, account rejection and unexpected-row conflict. The existing
creation/recovery probe also passed after the shared-form rebuild. No live DB
writes, broad suites, Brain/build or physical-device acceptance in this revision.
The user's overall validation batch remains deferred. Local and uncommitted.

## Latest creation/picker polish

- All muscle groups is a custom animated combobox/listbox with selected check,
  keyboard selection, Escape, type-to-jump and click-away dismissal. It stays
  inside the native exercise dialog rather than portaling beneath its top layer.
- Exercise picker uses the shared palette, grouped search/filter controls and
  reversible 240ms sheet motion. Selection dismissal stays committed; ordinary
  dismissal can be reversed by interacting with the sheet. Reduced motion snaps.
  The existing generic sheet motion is retained outside the exercise picker.
- Final Create template is green with a check; Add exercise stays blue with a
  plus. Draft-row options are three equal columns: Up, Down, Remove, with full
  accessible names. Three-dot feedback and reversible action-row expansion are
  animated; reorder/removal retarget critically damped row springs from current
  rendered positions, retaining velocity. Reduced motion snaps layout.

Focused isolated Chromium review covered custom-menu containment, filtering,
keyboard, Escape and click-away, single-row 44px action targets at 360/390/430
with normal/200% text, live reorder motion, distinct blue/green colours and
reduced-motion dismissal. Actual picker/menu and staged-template images were
inspected. The creation/recovery probe also passed after these changes. Broader
tests, Brain/build and device acceptance remain deferred. No schema rerun required.

## Latest direction: create a complete template first

The user rejected the edit-screen direction below. The current task adds staged
exercises to the creation UI; further edit-screen redesign is deferred until
that creation flow is settled. The previous edit UI is still in source, not an
accepted final design.

Creation retains the approved name/colour/icon controls and now includes an
exercise list and a blue Add exercise trigger. Picker selection adds a local
draft immediately; options allow move/remove, with Escape/focus recovery. No
records are created until Create template. That final action saves metadata and
the ordered exercise rows. New templates retain blue/general dumbbell defaults.

Known partial exercise-save failures keep the setup draft locked and offer Retry
instead of creating another template. Retry reads back persisted exercise order
and identities before continuing, including a write whose response was lost.
Leaving partial setup explicitly states that the template already exists.
`reloadWorkoutTemplates` now also returns the confirmed list to support readback;
existing loading/error behavior is retained. No schema rerun required.

Focused isolated Chromium review covered staging without database writes,
reorder, defaults, create, and a simulated lost second-exercise response: retry
produced one template with two ordered exercises and no duplicated insert.
The actual mobile creation render was inspected. No broad suites or Brain/build
run; the user's overall validation batch remains deferred.

## 2026-11-18 local revision

Scope: editing existing templates only. Preserve the user-approved creation
screen, heading typography and empty-manager state. No backend, database,
dependency or publication changes. No schema rerun required.

### Current behavior

- Opening a template goes directly to editable name and appearance. The old
  read-only header, duplicate pencil/name edit entry points and icon-only
  Save/Cancel pair are removed. One labelled Save template action persists
  metadata; it is disabled when unchanged and stays in the editor after saving.
- Exercises have a named section, count and grouped rows. One options control per
  row exposes labelled reorder/edit/delete actions; boundary moves are disabled.
  Escape closes options, and focus returns predictably after moving or editing.
- Choose exercise and Add exercise have distinct purposes/names. Add remains
  disabled until a choice exists. Template deletion has one quiet destructive
  action below the editing area and retains the existing confirmation.
- Save failures retain drafts. Meaningful metadata, replacement-exercise or
  pending-add drafts are protected when leaving via Your templates, Training
  subviews, global navigation or browser unload. Switching between exercise
  edits also protects changed drafts. Explicit exercise Cancel discards only
  that replacement draft, preserving other template edits.
- Synchronous mutation exclusion prevents rapid duplicate edit/add/reorder/
  delete requests. Operation feedback reports confirmed outcomes. A missing
  template has a truthful unavailable state instead of an empty editor.

### Focused local review

The ignored `test-results/review-template-edit.mjs` uses an isolated browser
fixture on port 4178. Reviewed failed-save draft retention and retry, save,
navigation cancel/discard, reordering boundaries, keyboard options/edit focus,
picker/add, rapid double click and cancelled/confirmed exercise deletion.
Normal/200% text layouts were inspected for horizontal overflow at 360, 390,
430, 768, 1024 and 1440px in English. Actual mobile and desktop renders were
inspected; screenshots remain ignored under `test-results/`.

This was a focused Chromium edit-flow review, not the deferred overall test
pass. Brain, full build/regression suites, WebKit, Italian rendering and physical
device/screen-reader acceptance were not rerun for this revision. Those remain
for the user's requested end-of-feedback validation batch. Local/uncommitted;
no commit, push or deployment performed.


## Final release batch ? 2026-11-18

Delete template uses the same full-width, 50px primary-button geometry as Save,
with a red fill. It retains explicit confirmation and failure feedback.
The shared Create/Edit form stages all exercises until final submission; blue
Add exercise and green Create/Save remain distinct. Browser regressions cover the shared draft editor, custom muscle-group menu,
confirmed deletion and equal Save/Delete geometry in Chromium and WebKit.
The production save helper now has durable `npm run test:template-draft`
coverage, included in `npm test`: unique staging order, lost-response retry,
preserved IDs/notes, removal, actor mismatch and unexpected external rows.
No schema rerun required.
