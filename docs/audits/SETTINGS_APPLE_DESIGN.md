# Settings review against Apple design principles

Date: 2026-11-17. Application baseline: `fe8b99c`; reviewed current local source. Original audit status: **audit and proposal at baseline**. Follow-up slices 1-4 are now implemented locally; see [implementation evidence and remaining acceptance limits](../qa/settings-apple-design.md). The findings and original measurements below describe the pre-implementation UI. Follow-up: [implementation plan](../plans/settings-apple-design.md).

## Verdict

Settings partially follows the supplied `apple-design` skill. It is restrained, grouped, touch-friendly and largely predictable, with good persistence safeguards. It needs clearer privacy context, truthful unavailable states, consistent save boundaries, stronger keyboard continuity and scalable typography before it fully meets the principles. A visual reskin alone would leave the main problems intact.

Preserve LifeOS's dark, compact identity. Apple principles do not require a light theme, rounded cards everywhere, decorative glass, large titles, extra gestures or an animation library. The intended feeling is calm confidence: people understand what is public, what changed and whether it saved.

## Method and evidence limits

- Used the user-supplied Apple Design skill as the evaluation rubric, especially response, agency, responsibility, familiarity, flexibility, simplicity and craft. This is a product review against that rubric, not Apple certification or an independently researched HIG compliance assessment.
- Read `PROJECT_CONTEXT.md`, the documentation index/status, Settings, profile-photo/dialog/avatar components, settings hook, service wrappers, shell, localization paths and relevant CSS/tests.
- Queried the existing Graphify snapshot with vocabulary-selected tokens `settings profile preferences photo dialog shell`. BFS returned 239 nodes, with 51 displayed at the 1,700-token cap. It located the Settings/profile/dialog cluster and hook/service boundaries. The graph is undirected and predates the latest merge; current imports and source establish ownership. No graph rebuild or semantic extraction ran; query/reflection are deterministic and use no model extraction tokens. Actual session token usage is not measured by Graphify.
- Ran the existing `tests/ui/modern-settings.spec.js`: **9/9 Chromium tests passed**. These cover rollback/retry, profile failure and repeated-submit exclusion, account switching, focus return from dialogs, photo/username independence, language persistence and layout.
- Captured current Italian Settings at **360, 390, 430, 768, 1024 and 1440px**, plus edit/viewer, root-text enlargement and an injected read failure. All six default-size page measurements had `scrollWidth === innerWidth`. At 1440px the content remains a readable 640px column; unused space is not itself a defect.
- Visually inspected current 390px normal/edit/viewer, 1440px normal and the existing suite's freshly generated 390px crop capture. That crop uses a generated black image; it demonstrates control layout, not realistic photo composition or visual crop quality.
- Screenshots are local ignored evidence in `docs/audits/lifeos-ui/screenshots/apple-settings/` and `settings-photo-crop-390.png` beside that directory. They are not committed deliverables; source anchors and measured results below keep this review usable without them. The capture named `loading-360.png` is actually the ready state: the app gates initial settings loading. Do not use it as evidence of a loading defect.
- No production account/settings were changed. Browser fixtures substitute services and isolate external traffic. Physical iPhone, Safari/WebKit, installed PWA keyboard behavior, screen-reader speech and real people using the flow were not assessed. Root `font-size: 200%` probes CSS scaling; it is not a substitute for browser zoom, OS text-size or physical-device testing.

## Existing strengths to preserve

| Principle | Evidence and assessment |
| --- | --- |
| Purpose / simplicity | Three small sections: Public profile, Preferences, Training privacy. No marketing blocks or administrative clutter. Profile editing is explicit; preferences save directly. `src/tabs/SettingsTab.jsx:55-74`. |
| Agency / responsibility | Native controls, explicit username Save/Cancel, opt-out switches, separate notes choice, photo preview/removal confirmation. `src/components/ProfilePhotoEditor.jsx:88-116`. |
| Familiarity / wayfinding | Shell supplies a Settings heading and navigation. Desktop highlights Settings; mobile More remains the secondary destination. `src/components/Shell.jsx:123-166`. |
| Flexibility | Main buttons, info buttons and switches have 44px minimum targets; inputs use 16px text; labels can wrap; keyboard focus styles exist. `src/styles/settings.css:6-23,46`. |
| Feedback / safety | Optimistic preferences roll back on failure, drafts survive failed saves, writes are locked, account/revision guards exclude stale responses. `src/hooks/useUserSettings.js:57-95`; passing browser cases. |
| Modal behavior | Native modal dialog, body scroll lock, Escape/backdrop dismissal when idle, named Close control and focus return to a connected trigger. `src/components/SettingsDialog.jsx:10-27`; passing focus-return test. |
| Restraint / reduced motion | Switch thumb has a short transition; local and global reduced-motion rules remove motion. Settings dialogs are static rather than gratuitously animated. `src/styles/settings.css:25,47`; `src/index.css:100-102`. |

## Findings

P1 means address before describing the experience as aligned. P2 is a meaningful usability/craft improvement. P3 is optional refinement. Findings distinguish observed behavior from design judgment.

| ID / priority | Finding and source evidence | Principle and recommended outcome |
| --- | --- | --- |
| A1 / P1 | **Privacy consequences require opening info dialogs.** The ordinary page shows only short switch labels. Audience, inclusion of past workouts/notes and separate Rankings enrollment appear inside `Information` dialogs. `SettingsTab.jsx:72-73`. Observed in rendered UI; the consequence copy already exists. | Responsibility, understanding, simplicity. Put a concise audience/history explanation next to each switch; associate it through `aria-describedby`. Keep extended help secondary. Keep Rankings consent independent. |
| A2 / P1 | **Unavailable settings look like saved defaults.** A rejected settings read resets profile/preferences to fallback state (`useUserSettings.js:19,45-46`), while the tab renders those switch positions with controls disabled (`SettingsTab.jsx:37,72-75`). Injected failure rendered sharing ON and notes OFF with an error below them. This does not establish the account's saved choices. Initial loading is globally gated by `App.jsx:49`, so there is no confirmed initial-loading switch flash. | Safety, predictability, status. On failed read show neutral unavailable values, not apparently confirmed ON/OFF states or an instruction to choose a username. Put Retry beside the affected section. Do not change preference defaults or write anything during recovery. |
| A3 / P1 | **Text sizing does not follow root text preferences.** Section titles, ordinary row labels and inputs use fixed 17px/14px/16px (`settings.css:4,12,18`). With root text at 200%, titles remained 17px and row labels 14px. Default-size fit is good; enlargement support is incomplete. | Flexibility, typography. Use scoped `rem` type/spacing and wrapping layouts; test enlarged text with Italian labels, dialog actions and safe-area/dock constraints. Retain physical minimum hit areas. |
| A4 / P1 | **Edit transitions lose keyboard position and lack inline username guidance.** Clicking Edit profile replaces the focused button; the measured active element becomes BODY. No explicit focus transfer/return exists for Save/Cancel. Username requirements are only native `minLength`, `pattern` and input normalization (`SettingsTab.jsx:50-63`). Errors live below all sections. | Agency, feedback, craft. Focus the username after explicit edit without forcing a mobile keyboard on page load. Return focus to Edit after Save/Cancel. Show format guidance and inline invalid state; preserve the draft on server errors. Do not promise uniqueness until confirmed by the server. |
| A5 / P1 | **One edit surface has two save boundaries.** Username waits for Save profile; photo commits immediately through Use photo. Outer Cancel leaves the saved photo intact (explicitly covered by a passing regression). `SettingsTab.jsx:59-63`; `ProfilePhotoEditor.jsx:49-67,101-107`. | Familiarity, agency. Make the independent actions explicit: Edit username / Save username / Cancel username changes, with a separate photo action. Retain immediate photo persistence; do not silently invent a transaction spanning storage and profile data. |
| A6 / P2 | **Save feedback is distant and generic.** All changes share the bottom status/error; success clears after 3.5 seconds (`SettingsTab.jsx:31-45,75-77`). A single `disabled` condition covers every settings control and the username cancel action. Locks are valid protection, but the UI does not identify the operation occupying them. | Response, status, completion/error feedback. Show an adjacent pending/confirmed/error state for the affected control and a polite announcement. Keep the mutation exclusion and distinguish reversible edit controls from actions unsafe during a write. Do not merely remove disabled guards. |
| A7 / P2 | **No authored immediate press feedback.** Settings buttons have hover/focus styling but no `:active` treatment (`settings.css:6-16,30-41`; shared icon buttons in `index.css:172-173`). Global `-webkit-tap-highlight-color: transparent` also suppresses the browser tap highlight (`index.css:94`). Switches respond optimistically, so this is not a claim that every interaction waits on the network. | Response, craft. Give buttons/info/avatar controls immediate pressed color or opacity on pointer-down, then commit with normal click semantics. Keep keyboard focus and drag-away cancellation; no artificial delay or decorative bounce. |
| A8 / P2 | **Accessibility adaptations stop at reduced motion.** No `prefers-reduced-transparency` or `prefers-contrast` branches were found in app styles. Settings itself is opaque, but shell header and modal backdrop use blur. `index.css:99,179`; `settings.css:34`. | Flexibility, materials. Scope solid/no-blur and higher-contrast states to Settings and its dialogs/chrome; measure text, borders, focus and switch state contrast. This audit does not claim a measured contrast-ratio failure. |
| A9 / P2 | **Notes visibility depends on sharing without explaining the dependency inline.** Both switches remain independently operable even when workout sharing is off (`SettingsTab.jsx:72-73`). A retained notes preference can later take effect when sharing is re-enabled. | Mapping, responsibility. Keep the stored notes choice independent, but state that notes are not visible while workout sharing is off; expose what will happen when it returns. Do not clear notes consent as a side effect. |
| A10 / P3 | **Static dialogs and slider-only crop are an opportunity, not a required physics rewrite.** Dialogs mount/unmount with no motion (`SettingsDialog.jsx`); crop uses labeled native sliders and redraws on change (`ProfilePhotoEditor.jsx:29-33,99-107`). There is no drag surface to assess for velocity handoff or rubber-banding. | Spatial consistency, direct manipulation, restraint. Keep static dialogs as a valid baseline. Optional direct crop dragging must preserve native sliders, preview accuracy and cancellation; only then apply pointer capture and 1:1 tracking. Springs/velocity projection are unnecessary for current switches and non-draggable dialogs. |

## Eight-principle assessment

| Foundation | Assessment |
| --- | --- |
| Purpose | Strong: focused preferences and profile management; preserve scope. |
| Agency | Partial: rollback and explicit editing are good; improve save boundaries and focus continuity (A4-A6). |
| Responsibility | Partial: privacy choices exist; surface their consequences and distinguish unknown state (A1-A2, A9). |
| Familiarity | Partial: standard controls and navigation; inconsistent commit semantics within profile edit (A5). |
| Flexibility | Partial: good default touch/layout behavior; text scaling and preference adaptations need work (A3, A8). |
| Simplicity | Good structure, incomplete explanations: add essential inline context rather than more nesting (A1, A9). |
| Craft | Partial: strong persistence guards, weaker press, operation feedback and keyboard transitions (A4, A6-A8). |
| Delight | Not established through user testing. Aim for confidence through the preceding fixes, not decorative celebration. |

## Validation and boundaries

- `npx playwright test tests/ui/modern-settings.spec.js --reporter=line`: PASS, 9/9 Chromium cases.
- Read-only browser layout probe: PASS for default-size page overflow at all six widths. Root text enlargement exposed fixed font sizing. Explicit Edit profile left focus on BODY. Injected settings-read rejection exposed disabled fallback privacy values.
- `npm run test:brain`: PASS.
- `npm run build`: PASS; existing greater-than-500kB chunk warning remains.
- `git diff --check`: PASS. Local Markdown page-link validation for this audit, its plan and the documentation index: PASS.
- `tests/ui/profile-photo.spec.js` still expects the older always-visible username / Save settings / Save photo UI. It was inspected, not run or counted as passing. Update those locators in the relevant implementation slice; preserve their behavioral coverage.

No runtime, backend, schema, dependency or test source changed. No schema rerun required. No commit, push or deployment performed. Existing unrelated local changes are preserved. That statement records the original audit scope. The later local implementation and its verification are recorded separately in [implementation evidence](../qa/settings-apple-design.md).
