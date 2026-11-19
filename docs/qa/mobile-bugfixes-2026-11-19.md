# Mobile interaction fixes, 2026-11-19

Follow-up to the UI release, authorized for commit/push and production deployment on 2026-11-19. Release target: `alessiocasce/lifeos` branch `main`, Vercel project `lifeos` (`prj_knu6xjJQj3e2gBJkki82HAfu6XeD`), public domain `https://lifeos-ruby-gamma.vercel.app`. Match the deployed `/build-version.json` to the Git release commit before claiming release completion. No schema rerun required.

## Changes and causes

- Shared workout taps: pull-to-refresh called `preventDefault()` after any downward movement, including a reproduced 3px finger movement. Wait for a 10px intentional drag before cancelling native taps. Intentional refresh and workout update guards remain.
- Profile photos: animate the photo circle rather than the native modal container, keeping modal geometry stable. Remove the container focus outline; outside tap/Escape and the Settings edit/remove controls remain. Double-tap zoom is suppressed on photo controls while pinch zoom remains available.
- Navigation: lower the floating bar by 6px (6px plus bottom safe area). Measure visual viewport height/top on mount, resize, focus and viewport scroll, so initial Command layout and browser-chrome changes use the same geometry as subsequent tab visits.
- Keyboard: a shared shell hook publishes visual viewport dimensions. Companion fits its header, independently scrolling chat and composer inside that space. A chat-list resize observer preserves bottom-pinned reading during keyboard/composer resizing; the regression reproduced a latest reply stranded 300px below view. Other modal forms receive visible-height bounds; Training retains its existing visual-viewport sheet anchoring. Mobile field text defaults to at least 16px and keyboard scroll margins shrink to 16px to avoid excessive focus panning.
- Remove the cross-tab Training-in-progress dock and Command's Training-in-progress headline. Training remains accessible through navigation and Command's existing active-work card. Workout state, rest coordination and PWA update guards remain unchanged.

## Verification

- Regression fixture reproduces the original swallowed 3px tap and composer below a 440px visual viewport before fixes.
- Chromium: 49 focused cases passed across Community navigation, Companion, photo editing, mobile dock, long scroll and shell continuity. Coverage includes 360, 390, 430, 768, 1024 and 1440px, English/Italian and enlarged text.
- Chromium follow-ups: 35 Command/Training/Finances/mobile cases passed after removing the Command headline and updating resume navigation. The final 16 mobile/Companion/chat cases passed after the long-conversation resize correction; earlier-message reading-position tests remain green.
- WebKit: 13 picker/keyboard/continuity cases passed initially; after replacing the unsupported `Touch` constructor with portable events, all five mobile regressions passed. This is emulation with mocked visual viewport geometry, not a physical keyboard.
- Final WebKit follow-up: all 10 mobile/chat cases passed, including the long-conversation keyboard resize regression and earlier-message reading-position checks.
- `npm run test:brain`: passed. Production build: passed with the existing large-chunk warning. Sandbox restrictions required running Vite/browser validation outside the sandbox.
- `git diff --check`: passed. Photo-viewer and mocked-keyboard Companion screenshots were visually inspected; the keyboard itself is not rendered by the mock.

## Physical-device checks

### Companion workspace positioning after `56e5ae0`

Opening Companion used to switch the body to fixed positioning and hide root
overflow. The mobile dock is mounted directly under that body, so it still saw
a tab-specific document layout even with a shared viewport calculation.
Companion now fixes only its workspace and keeps scrolling inside the chat.

The browser regression compares document positioning and dock rectangles across
Command, Companion, Community and Training, then checks dock recovery after a
keyboard cycle. On an installed iPhone, compare the dock when opening Companion
directly, switching to it from a scrolled tab and dismissing the keyboard.

### Visible-viewport dock frame after `aa9cb18`

The user again reports a higher Companion dock. Investigation ruled out active
label font weight causing an intrinsic-height change (360/375/390/393/430px,
16-32px root text in quarter-pixel increments). The remaining tab-specific
boundary is Companion's fixed document body. The prior shared dock still used
`position: fixed; inset: 0`, implicitly positioning its bottom against the layout
viewport rather than the visible viewport already measured by the shell hook.

The new regression separates those viewport dimensions with no focused field:
the old dock bottom was 822px instead of the expected 796px for an 810px visible
height, 8px top and 22px safe-area-adjusted gap. The frame now has an explicit
measured visible height/top; the pill's existing lower safe-area gap is unchanged.
Coverage includes taller (878px) and shorter (810px) visible heights against an
844px layout, all primary tabs, and recovery without switching tabs or focusing.
Keyboard detection, chat positioning, body locking and composer behavior are
unchanged by this correction.

This establishes the coordinate-space defect and its correction in browser
geometry. It does not reproduce or prove the cause of the user's native paint
offset. WebKit tracks related standalone fixed-position/viewport discrepancies
([237961](https://bugs.webkit.org/show_bug.cgi?id=237961),
[312149](https://bugs.webkit.org/show_bug.cgi?id=312149)); these are supporting
platform context, not evidence of the exact device cause. On the installed iPhone,
compare Command/Companion/Community/Training before typing, after a keyboard cycle,
and after cold launch. Native acceptance remains open. No schema rerun required.

Validation: 21 focused dock/long-scroll/typing checks passed in Chromium and 21
in WebKit. The taller-visible-viewport case was then added and the expanded
regression passed in both engines. Brain regressions, production build and
`git diff --check` passed; the build retains its existing large-chunk warning.

### Shared dock frame and single keyboard motion after `2ef0d8d`

The user reports that Companion's dock remains higher and its input/chat move up
then down on both focus and blur. The prior independent 220ms height/padding
transitions are removed; they produced a measurable lag during staged viewport
recovery (about 29px in the failing regression). This supersedes the earlier
"eased dismissal" expectation below.

- A single body-level fixed frame now positions navigation for every tab. Its pill
  is an absolute child, independent of each workspace's positioning/scroll model.
  All mobile tabs use `max(2px, safe-area-bottom - 12px)`: 22px with a 34px safe
  area, versus the previous 40px; without an inset it is 2px versus 6px.
- Companion locks document scrolling and uses an absolute chat viewport inside
  that fixed document. Its effective height subtracts remaining dock clearance in
  the same calculation; height and bottom padding no longer animate separately.
  No app-added toolbar height animation runs during keyboard changes.
- Companion no longer sits inside the translated pull-to-refresh container.
  Conversation scrolling remains local; other tabs retain pull-to-refresh.
- Regressions compare actual dock rectangles across Command, Companion,
  Community and Training and after a keyboard cycle, with a simulated iPhone safe
  area. Opening/closing samples must follow the viewport on the next rendered
  frame and return to the original input rectangle, without a second movement.
- Preserve first-touch Send, compact typing space and exercise search behavior.
  Native iPhone viewport/keyboard acceptance remains required; these regressions
  verify app geometry and do not emulate UIKit's own keyboard animation.

Validation: all three new regressions failed against `2ef0d8d`, then passed with
the shared frame/single-height model. WebKit's final focused batch passed 31/31.
Chromium covered the same geometry/usability paths plus shell/Companion controls;
the fresh 25-case batch passed 23, with two font-resize timing assertions corrected
to compare the measured fractional dock height after ResizeObserver delivery;
both six-width/large-text cases then passed. Earlier navigation failures included
`ERR_NETWORK_IO_SUSPENDED` and passed in the fresh runner. Brain, production build,
function guard and whitespace checks passed. No schema rerun required.
Confirm the installed client's build in Settings' LifeOS version display before
native acceptance; active workouts/drafts still guard service-worker activation.
The Settings renderer had stopped including the existing ApplicationUpdates
component. Its build display and guarded update controls are restored under a
collapsed Application section, with no duplicate heading. The Settings browser
check and PWA manager/upgrade harness cover visibility and preserved update guards.

### Usable keyboard space and pointer activation after `a1cd972`

The user reports that the previous release still leaves too little conversation/
exercise space, raises the Companion dock, snaps when dismissing the keyboard,
and requires dismissing it before Send works. Five new browser regressions all
failed against that release. The old exercise results area measured only 38px
with a 360px visual viewport; containment was not sufficient acceptance.

Corrections:

- Hold keyboard state/occlusion through blur until the visual viewport recovers.
  Send preserves textarea focus on pointerdown and submits only on click. This
  prevents layout changes between pointerdown and pointerup without sending on
  a canceled press or drag. Restore Companion height/padding with a 220ms ease;
  reduced-motion users get no added transition.
- Use the same 6px-plus-safe-area navigation inset on all tabs. Remove the extra
  visual-viewport bottom-gap correction that could lift the dock twice on iOS.
- Remove the duplicate mobile Companion shell heading. Collapse its conversation
  toolbar while typing and use a 54px one-line composer with a 44px Send target.
  Messages keep their type size; the mobile textarea caps at 96px for long drafts.
- Mobile catalog search uses the full visible viewport, rather than 65% minus
  controls. During search, the header/handle/footer give way to one row containing
  Search, category filter and Close. Results measured about 276px out of 360px.
  Custom exercise creation remains available as a result row while typing.
  Result presses preserve search focus until selection completes.
- Acceptance includes a first-click Send request (exactly once), draft retention,
  delayed dock restoration, eased closing, minimum chat/results space and the
  actual active-workout Choose another exercise path. Test real iPhone taps,
  scrolling, category/custom selection and keyboard dismiss/reopen before closing
  these device reports. Native keyboard rendering is still outside emulation.

Usability validation: all five original regressions failed against `a1cd972`.
The broader Chromium batch passed 38/39 and exposed a compact-filter focus
transition; the WebKit batch passed 21/22 and exposed compatibility mouse-focus
handling on filter taps. After those fixes, the final Chromium usability/catalog
batch passed 12/12 and final WebKit usability batch passed 7/7, including native
touch Send, filter/custom-name selection and the active-plan search path. The
earlier broad batches also cover drafts, latest-reply pinning, safe navigation,
keyboard recovery, Training persistence and large text. Populated-chat and exercise
screenshots were visually inspected. Brain, build, seven-function guard and
whitespace checks passed; the existing large-chunk build warning remains.

### Reopened iPhone defects after `3f7b6dd`

The user reports whole-page magnification when opening a Community photo in the
installed iPhone PWA, plus Companion moving/compressing during keyboard opening.
The earlier browser pass did **not** establish that either native defect was fixed.

Follow-up changes:

- Photo viewer uses a fixed full-viewport native modal and a transparent, normally
  focusable dismissal button. It no longer assigns `tabindex` to the photo modal
  or explicitly focuses the small photo dialog. Only the bounded photo circle
  animates; real image dimensions and inline baseline spacing cannot size its box.
- Real square and portrait PNGs now exercise Community photo opening, closing,
  focus return and geometry at all six target widths; previous generic mobile
  viewer tests used an initials fallback. Native iPhone zoom remains an acceptance
  gate, not something desktop WebKit emulation can establish.
- Companion keeps one fixed viewport layout even before the keyboard opens.
  The old implementation switched layout mode at the 120px keyboard threshold.
  Bottom navigation clearance now decreases with keyboard occlusion; the header,
  toolbar and composer retain their own sizes while the message scroll area shrinks.
  Composer auto-grow reacts to text/width changes instead of observing its own
  height writes. The input requests the text keyboard and a Send return key.
- The arrows/tick strip is Safari's native form assistant bar. The PWA cannot
  suppress it through a supported web API. See the [W3C Editing discussion](https://github.com/w3c/editing/issues/545)
  and [WebKit report](https://bugs.webkit.org/show_bug.cgi?id=319762). Do not claim
  that `inputmode`, `enterkeyhint`, or replacing a textarea can remove that strip.

Recheck on the installed iPhone after deploying this follow-up before closing the
reported defects. Browser geometry checks cover the implementation, not UIKit zoom
or keyboard animation acceptance.

Corrective validation: final Chromium target batch 16/16 and WebKit photo/chat/
viewport batch 23/23 passed. The initial broader Chromium batch passed 56/58;
the old zero-padding expectation was retained by removing unnecessary overlay
padding, and a one-off reduced-motion dismissal timeout passed three isolated
rechecks plus the final target batch. Loaded Community photo screenshots were
inspected. Build, Brain, seven-function route guard, Italian dictionary generation
and whitespace checks passed. The existing large-bundle build warning remains.

- Cold-open installed iPhone PWA on Command, then switch tabs and return: the bar stays at the same lower position without a jump.
- On Feed and member profiles, tap workout titles, counts and card bodies with ordinary finger movement; verify each opens once. Deliberate pull-to-refresh still works.
- Open Settings and Community photos: only the circular photo appears in Community, without a rectangular outline or page magnification; outside tap dismisses. Verify Settings edit/removal still work.
- In Companion, type with a long conversation, multiline draft and keyboard suggestion row. The composer stays above the keyboard and the conversation scrolls independently. Dismiss/reopen keyboard and rotate; preserve the draft.
- Repeat in Training's Choose another exercise search/custom field, Settings username, Memos, Calendar, Projects, Health and Finances. Inputs remain reachable and modal contents scroll within the keyboard's visible area.
- Inspect native Safari and installed PWA. Mocked visual viewport resizing and browser emulation do not prove native iPhone keyboard or zoom acceptance.
