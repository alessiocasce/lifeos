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

- Cold-open installed iPhone PWA on Command, then switch tabs and return: the bar stays at the same lower position without a jump.
- On Feed and member profiles, tap workout titles, counts and card bodies with ordinary finger movement; verify each opens once. Deliberate pull-to-refresh still works.
- Open Settings and Community photos: only the circular photo appears in Community, without a rectangular outline or page magnification; outside tap dismisses. Verify Settings edit/removal still work.
- In Companion, type with a long conversation, multiline draft and keyboard suggestion row. The composer stays above the keyboard and the conversation scrolls independently. Dismiss/reopen keyboard and rotate; preserve the draft.
- Repeat in Training's Choose another exercise search/custom field, Settings username, Memos, Calendar, Projects, Health and Finances. Inputs remain reachable and modal contents scroll within the keyboard's visible area.
- Inspect native Safari and installed PWA. Mocked visual viewport resizing and browser emulation do not prove native iPhone keyboard or zoom acceptance.
