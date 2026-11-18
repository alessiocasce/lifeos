# Settings Apple design implementation plan

Status: **slices 1-4 implemented locally; not committed or deployed**. Verification and remaining device/accessibility gates: [implementation evidence](../qa/settings-apple-design.md). Date: 2026-11-17. Baseline: `fe8b99c`. Findings and validation: [Settings audit](../audits/SETTINGS_APPLE_DESIGN.md).

## Intended outcome

Settings should make privacy and persistence immediately understandable, remain usable with larger text and keyboard/touch input, and respond visibly to every deliberate action. Keep the current dark LifeOS language, compact three-section structure, native controls and readable desktop column.

The user subsequently requested implementation. Slices 1-4 are implemented locally; physical-device and human accessibility acceptance, commits and release remain separate gates. This plan adds no database objects, endpoints, dependencies or Rankings policy. No schema rerun required.

## Proposed page structure and behavior

1. **Public profile:** avatar with an independently named photo action; username with Edit username. Show that profile information is visible to signed-in members. Username edit contains a labeled field, concise format help, inline error and Save username / Cancel username changes. A photo commits only through Use photo or confirmed removal; username Cancel never implies reverting that photo.
2. **Preferences:** Language stays a native select that saves directly. Keep a concise adjacent saving/error state and polite completion announcement. Do not introduce a global Save settings action.
3. **Training privacy:** each switch keeps a title, short consequence description and local operation state. Proposed English meaning: completed and past workouts are visible to signed-in members while sharing is on; past workout/set notes are also included when notes sharing is on. Explain that Rankings enrollment is separate. If workout sharing is off, state that notes remain hidden even when their saved choice is on. Translate final wording into Italian with equal prominence.
4. **Unavailable data:** section-level unavailable text and Retry; neither switch should visually claim a confirmed setting until a successful read. Keep initial auth/profile loading gates. Preserve unrelated Training access and the shell's navigation/resume dock.

Do not add confirmation dialogs to ordinary preference changes. Keep destructive photo-removal confirmation. Preserve the current default values (Italian, workout sharing on, notes off) and every explicitly saved choice; this is an explanation/state-presentation change, not a consent-policy migration.

## Ordered implementation slices

### 1. Truthful privacy state and inline explanations — P1

Addresses A1, A2 and A9. Start here because confidence in privacy state matters more than visual polish.

Files: `src/tabs/SettingsTab.jsx`, `src/styles/settings.css`, `src/i18n/it.json` and applicable localization key/source files. Inspect `src/hooks/useUserSettings.js`, `src/services/lifeosApi.js`, `src/App.jsx` and `docs/COMMUNITY.md`; change their contracts only if presentation cannot consume existing status safely.

- Render failure/unknown states explicitly from `settings.status`; avoid showing initial defaults as confirmed values. Do not persist a guessed choice.
- Add concise descriptions linked with `aria-describedby`. Retain detailed dialogs only where additional information earns the extra step.
- Keep notes consent independent; explain the effect of workout sharing being off and the effect of enabling it again.
- Position Retry and recovery status beside the affected content. Prevent duplicate reads without turning a failed read into a write.

Acceptance: reject initial read and retry, recover saved ON and OFF combinations, and switch accounts during read/retry. Unknown values never masquerade as saved values. Notes state survives sharing off/on. Audience/history implications are readable without opening a dialog in both languages. No backend sharing policy or Rankings enrollment changes.

### 2. Explicit profile boundaries, focus and operation feedback — P1/P2

Addresses A4-A6. Depends on slice 1's state model/copy conventions.

Files: `src/tabs/SettingsTab.jsx`, `src/components/ProfilePhotoEditor.jsx`, `src/components/SettingsDialog.jsx` only where necessary, settings CSS and localization. Inspect existing hook locks and generation guards before editing any async behavior.

- Separate username and photo affordances/copy while retaining existing persistence operations. Rename the username controls precisely; make successful photo persistence clear inside the editor.
- On explicit Edit username, focus the input. After successful save/cancel, return focus to Edit username; after failed save retain draft and focus/error context. Page load must not focus the text field or open the keyboard.
- Show username format help and accessible validation on edit/blur, plus server uniqueness errors beside the field. Do not repeatedly announce errors for every keystroke or add uniqueness polling.
- Track which operation is pending for feedback. Retain a single write exclusion boundary and account/revision guards. Add nearby Saving / Saved / Failed state without multiple competing live announcements.
- Decide which purely local actions can safely remain available during a write. Keep unsafe submission/photo changes blocked; preserve the busy dialog protections. Animation interruptibility does not justify cancelling an already-sent write.

Acceptance: keyboard edit/save/cancel focus sequence; invalid/duplicate username; delayed/failed save with retained draft; photo saved then username cancelled; photo failure with retained crop; rapid repeated submit; account change/unmount during each mutation. Existing rollback, isolation and immediate-photo-commit tests remain meaningful and pass after locator updates.

### 3. Larger text, layout and accessibility preferences — P1/P2

Addresses A3 and A8. Use the final copy and controls from slices 1-2 to avoid validating an obsolete layout.

Files: `src/styles/settings.css`; Settings-scoped shell/header overrides in `src/index.css` only if needed. Avoid changing global typography or other workspaces incidentally.

- Express Settings type and text-dependent spacing in `rem`/`em`. Keep input text at least equivalent to 16px at the default setting, with at least 44px targets. Allow rows, select widths and buttons to grow/wrap instead of shrinking labels.
- Preserve heading/label/help hierarchy using size, weight and leading together. Scope heading tracking deliberately; use platform system UI type for Settings unless keeping the current face has a documented reason. No font download is required.
- Adapt Settings chrome/dialogs for reduced transparency and increased contrast; keep static/short opacity feedback for reduced motion. Avoid blur-dependent legibility and light glass stacked on glass.
- Check short viewports, safe areas, internal dialog scrolling and active-workout dock clearance. Keep controls in reach when the mobile keyboard changes the visual viewport.

Acceptance: 360, 390, 430, 768, 1024 and 1440px, Italian and English, longest valid username, all error/retry text, 200% text enlargement and browser zoom/reflow. No clipped labels, overlapping actions or horizontal page scrolling. Measure normal text contrast at least 4.5:1, large text and essential control boundaries/state indicators at least 3:1; verify clear non-color switch state and visible focus. Run keyboard and screen-reader checks as well as visual inspection. Record real iPhone/PWA acceptance separately.

### 4. Immediate interaction feedback and restrained finish — P2

Addresses A7. Depends on stable control/layout rules from slice 3.

- Add immediate `:active` background/opacity feedback for Settings buttons, information triggers and avatar actions, including portaled dialog controls. No input delay or arbitrary debounce.
- Preserve click-on-release and native cancellation semantics. Avoid layout-changing press effects and feedback on disabled controls.
- Keep native select/range behavior. Keep the switch transition short, interruptible by retargeting and removable for reduced motion. A spring dependency is unnecessary for a binary switch.
- Keep static dialogs acceptable. If a transition is added, use matching enter/exit paths, retain focus/inertness correctly through exit, and allow reopening without a stale target jump. Do not introduce gesture physics solely for appearance.

Acceptance: touch/pointer press state appears before release; keyboard focus remains clear; cancelled presses do not submit; repeated interactions remain responsive; reduced motion and high contrast preserve understandable feedback. Review actual animation frames if motion is introduced.

### 5. Optional crop direct manipulation — P3, separate scope

Addresses A10 only if user testing shows that sliders are a significant obstacle. It is not required to finish slices 1-4.

If pursued, prototype dragging the image beneath a visible circular avatar mask, with pointer capture, grab-offset preservation, movement threshold and 1:1 tracking. Keep labeled sliders as keyboard/precision alternatives and retain the actual square output contract. Prevent conflicting scroll gestures; test pointer cancellation. Do not add flick inertia to precision crop placement without evidence it helps. Approve the prototype through hands-on use before implementing it in the shared photo component.

## Verification and release gates

- Extend `tests/ui/modern-settings.spec.js` with behavior-focused coverage for unknown/recovered settings, notes visibility explanation, profile focus transitions and operation-specific status. Keep account isolation and rollback checks.
- Repair outdated `tests/ui/profile-photo.spec.js` entry/action locators as part of profile work so the existing decoding, crop bounds, failed-upload and account guards can run against current UI. Do not delete those assertions to obtain green results.
- Inspect any other test references to renamed labels before changing copy. Use the repository localization validation workflow for added strings; inspect current scripts rather than inventing a command.
- Before each implementation slice finishes: `npm run test:brain`, `npm run build`, `git diff --check`, plus affected browser tests. Run `node --check` for backend files only if any are actually changed. No backend changes are expected.
- Add acceptance procedures to `docs/QA_FULL_APP.md` and affected auth/community QA documentation when behavior changes; update this audit with dated evidence. Avoid rewriting release history to claim a future fix is deployed.
- Verify real photo composition, keyboard/touch flow, reduced motion/transparency/contrast and screen-reader announcements. Chromium fixtures prove UI contracts, not production persistence, physical iPhone behavior or user acceptance.
- Commit/push only on explicit request. Production release should be a separate authorized action after scoped verification. Keep the many pre-existing local documentation/graph changes out of feature staging.

## Completion criteria and risks

Slices 1-4 are complete only when their acceptance cases pass and current rendered layouts are inspected. The audit should then be updated to distinguish resolved findings from untested device/user evidence. Optional crop gestures are not a completion prerequisite.

Main risks are lost privacy clarity through translation, regressions to account-scoped rollback/serialization, accidental coupling of photo and username persistence, focus changes that unexpectedly open the mobile keyboard, and scoped styling leaking into Community's shared dialogs/avatar editor. Validate those boundaries explicitly. No schema rerun required.


## Authorized visual redesign follow-up

After reviewing the first implementation, the user clarified that the desired change was the visual UI and explicitly invoked `apple-design`. The original instruction to preserve the old narrow layout is superseded for Settings: the local implementation now has inset groups, a dedicated desktop profile column, attached photo control, colored functional row icons, rounded dialogs/buttons and restyled switches. See [current evidence](../qa/settings-apple-design.md). Persistence and privacy contracts remain unchanged. No schema rerun required.
