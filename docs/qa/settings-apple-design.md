# Settings implementation verification

Final accumulated release evidence: [2026-11-19 checks](ui-release-2026-11-19.md).
This supersedes earlier deferred-validation and local-only status notes below.

## 2026-11-18 ongoing profile-layout revision — validation deferred

The resting username and Edit action now share a row, vertically centered
beside the avatar; desktop keeps a horizontal avatar/identity row. Username
editing and Save/Cancel retain their existing behavior. The user is still
providing changes and explicitly deferred tests/overall review until finished.
This batch is unvalidated; prior evidence below predates it. No schema rerun
required. See the latest Community QA section for the related viewer/detail edits.

## 2026-11-18 circle-only photo viewer (current)

The avatar viewer now shows only the enlarged circular photo and adjacent
pencil/bin icon buttons. Its visible title, X, separate Remove photo row,
rectangular background, border, shadow and padding are removed. The dialog
retains its accessible name, native modality, focus return, reversible motion,
Escape and outside-click dismissal. Edit opens the native file picker directly;
the bin opens the existing explicit removal confirmation and is disabled when
there is no photo. Crop controls retain their normal dialog header and layout.
Busy/error/success feedback and account/mutation guards are unchanged.
The viewer uses a 240ms position/scale animation from the clicked avatar's exact
rectangle to the enlarged circle, reversing back into its original position on
dismissal. Photo opacity stays at 1 throughout. The underlying avatar is hidden
until the return completes to avoid a duplicate image. Reduced motion snaps
between sizes without a fade. The overlapping inner entrance is removed.
The position/scale follow-up was checked only with the focused Chromium and
WebKit motion test: measured opening/return rectangles match the avatar within
one pixel, opacity stays at 1, interrupted opening reverses, and focus/reduced
motion behavior passes. No Brain or full-suite run for this follow-up.

Inspected the real-profile preview at 390px and generated 1440px evidence.
A six-width browser probe checked adjacent 48px targets, viewport fit and
outside dismissal at 360, 390, 430, 768, 1024 and 1440px. Brain, production build
and whitespace checks pass. Settings/photo Chromium checks pass 30/30; focused
WebKit viewer/motion/upload/removal checks pass 3/3. The WebKit upload initially
failed because the test network guard blocked same-origin blob URLs used for
image decoding; the fixture now permits those local URLs while continuing to
block external requests. Production image decoding was unchanged.
Physical-device and user visual acceptance remain
pending. Local/uncommitted/undeployed; no schema rerun required.

Date: 2026-11-17. Local implementation on baseline `fe8b99c`; uncommitted and not deployed. Implements slices 1-4 of [the Settings plan](../plans/settings-apple-design.md). Optional crop dragging stays outside scope.

## Implemented behavior

- Read failure hides unconfirmed profile/language/switch values and offers a serialized Retry. Recovery is read-only; account guards, saved preferences and defaults are unchanged.
- Privacy descriptions expose audience, historical workouts/notes and separate Rankings enrollment beside the switches, with accessible descriptions. Disabling workout sharing retains the notes preference and explains its effect on re-enabling.
- Username and photo have separate named actions. Username editing focuses the input, validates format locally, preserves failed drafts and server uniqueness errors, and returns focus after save/cancel. Photo saves immediately through Use photo or confirmed removal; closing its dialog returns focus to the originating action.
- Saving, success and failure feedback appears beside the affected operation. Existing mutation exclusion, optimistic rollback and account/revision checks remain intact. Username cancel remains unavailable during writes/photo work to preserve focus and write boundaries.
- Settings typography and text spacing scale with root text size. Buttons wrap, hit targets remain at least 44px, press feedback is immediate, and reduced motion/transparency plus increased contrast have scoped adaptations. The dark identity remains. The subsequent visual redesign replaces the old 640px column with an inset-group layout and a desktop grid up to 1040px wide.

## Evidence

| Check | Result |
| --- | --- |
| `npx playwright test tests/ui/modern-settings.spec.js tests/ui/profile-photo.spec.js --reporter=line` | PASS, 30/30 Chromium tests |
| `npm run test:brain` | PASS |
| `npm run build` | PASS; existing >500kB chunk warning |
| `node scripts/tools/generate-italian.js --check` | PASS |
| `git diff --check` | PASS |
| Italian/English layout | Default layout at 360, 390, 430, 768, 1024 and 1440px; 200% root text in both languages at all six widths; no page overflow. Enlarged-text dialogs also fit horizontally. |
| Keyboard/pointer | Edit/save/cancel and failed-save focus, dialog Escape/return, immediate pointer-down feedback and drag-away cancellation pass. |
| Reduced transparency | Chromium CDP media emulation: Settings header and open Settings dialog backdrop both report `backdrop-filter: none`; backdrop is opaque. |
| Sampled contrast | After visual redesign: help text/group background 8.28:1; select border/group background 3.55:1; checked switch thumb/track 8.45:1. These are bounded samples, not an exhaustive accessibility audit. |

Browser tests cover read failure/retry/recovery, account switching during retry and preference writes, privacy dependency/retained notes consent, uniqueness/format errors, delayed/repeated writes, local operation feedback, independently persisted photos and username cancellation, upload failure/retry, decoding/compression/crop bounds, signed-avatar reuse and in-flight photo account isolation. Older photo-suite locators and fixtures now match partial preference updates and separate username saves; behavioral assertions were retained.

Inspected rendered Italian mobile and 1440px desktop normal states, enlarged Italian 360px edit/privacy state, and the two-color photo crop. Screenshots remain ignored local evidence under `docs/audits/lifeos-ui/screenshots/`. Mobile fixtures include the existing active-workout resume dock; the notes switch can scroll clear of the dock. No production account was changed.

## Remaining acceptance limits

Physical iPhone/Safari/PWA keyboard behavior, OS text settings, true browser zoom, real-person photo composition, screen-reader speech and hands-on user acceptance are unverified. Root text enlargement and Chromium accessibility assertions do not prove those results. The broader `npm test` was not rerun; the unrelated attention-monitor fixture clock failure remains documented in [documentation status](../audits/DOCUMENTATION_STATUS.md).

No backend, hook contract, schema, dependency or sharing-policy changes. No schema rerun required. No commit, push or deployment performed.


## Visual redesign follow-up

The user clarified that the intended result was a visibly redesigned interface and explicitly requested `apple-design`. The earlier appearance-preserving scope is superseded for Settings.

- Desktop: a dedicated profile column with a larger avatar and attached camera control; preferences and training privacy form a second column. The page now uses up to 1040px rather than the former 640px.
- Mobile/tablet: inset groups, a compact horizontal identity panel, colored language/workout/notes icons, full-width explanatory copy on small screens and rounded controls. The language select fits in one row at normal text size and wraps with larger text.
- Visual language: platform system typography, charcoal surfaces, restrained blue actions, green active switches, clear group dividers and rounded dialogs. Immediate press feedback, reduced-motion/transparency/contrast support and all existing persistence behavior remain.
- Changed runtime files: `src/tabs/SettingsTab.jsx`, `src/components/ProfilePhotoEditor.jsx`, `src/styles/settings.css`. No new dependencies or runtime data contracts.
- Verification: Settings/photo browser batch passes 27/27; after final mobile spacing changes, both responsive/default and enlarged-text tests pass again (2/2). Brain, production build, dictionary and whitespace checks pass. Inspected actual Italian renders at 360, 390, 1024 and 1440px, plus all six screenshot widths. The existing English/Italian 200% text matrix passes.
- Screenshot evidence: `settings-redesign-{width}.png` includes the active-workout fixture; `settings-redesign-clean-{390,1440}.png` shows a separate empty-workout fixture. Both use isolated QA data. No production data was changed. Physical-device/user and screen-reader acceptance remain unverified.


## Profile hierarchy, native picker and motion follow-up

Current local behavior supersedes the earlier camera shortcut and intermediate photo-edit menu described above.

- Public profile: the username is 28px at default root text size; Edit is a quiet 13px action. Save and Cancel use short visible labels, equal widths and matching 44px minimum heights. Accessible names retain their full username meaning. Removed the profile visibility paragraph and its duplicate information dialog at the user's request.
- Photo: the avatar opens an enlarged viewer. Its pencil synchronously invokes the single image file input, allowing the OS/browser to present its native image-source chooser. There is no camera shortcut, capture-only input, Add/Replace/Take photo menu or intermediate Edit profile photo dialog. Selection opens the existing crop preview; cancellation keeps the viewer and saved photo. Confirmed removal remains available in the viewer. Upload/account guards, crop retry and immediate persistence remain intact.
- Language: `SettingsLanguagePicker.jsx` replaces the Settings native select with an animated, portaled English/Italian listbox. Supports arrows, Home/End, type selection, Enter/Space, Escape, Tab and pointer dismissal; saves immediately through the existing guarded preference mutation. Auth's separate native language select is unchanged.
- Motion: anchored dialog fade/scale opening and symmetric closing; reversible language popover; animated profile edit height/content; gentle content/status entry. Reopening retargets the current Web Animations playback, retaining modal focus/body scroll lock until dismissal finishes. Reduced motion uses short opacity fades and removes layout/translation effects. No dependency added.

Validation: `modern-settings.spec.js` plus `profile-photo.spec.js` pass **30/30 Chromium tests**; Brain/build/dictionary/diff checks pass. New cases assert hierarchy and equal action sizing at 360/390/1440px, the native filechooser event without an intermediate menu, custom-language keyboard/dismissal/failure rollback/persistence, actual photo animation progress and reduced-motion timings. The existing six-width English/Italian 200% text and account-isolation/crop suite remains green.

Inspected settled Italian edit/menu/viewer renders, photo opening frames at 0/120/240ms, and the final enlarged viewer. Manually exercised reversal during both menu and photo dismissal: reopened content reached opacity 1, subsequent Escape dismissed correctly, and body scrolling restored. Local screenshot evidence uses `settings-polish-*.png` and `settings-photo-motion-*.png` in the existing ignored screenshot folder. Browser filechooser-event verification does not establish the exact iPhone action-sheet labels, real camera/library behavior or physical-device acceptance.

Runtime files: `src/tabs/SettingsTab.jsx`, `src/components/ProfilePhotoEditor.jsx`, `src/components/SettingsDialog.jsx`, new `src/components/SettingsLanguagePicker.jsx`, and `src/styles/settings.css`; tests and QA/handoff docs updated. No backend/schema changes. No schema rerun required. No commit, push or deployment performed.
