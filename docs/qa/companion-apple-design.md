# Companion Apple-style redesign

Final accumulated release evidence: [2026-11-19 checks](ui-release-2026-11-19.md).
This supersedes earlier deferred-validation and local-only status notes below.

Date: 2026-11-17. Implemented on the existing local Settings/dock UI using the
user-requested `apple-design` skill. Local, uncommitted and undeployed.

## Current interface

- Open conversation surface with system typography, a quiet thread subtitle,
  restrained blue user bubbles and unboxed assistant responses. A bounded
  desktop reading width and compact mobile toolbar preserve space for messages.
- Rounded material composer with immediate press feedback, a circular send
  button, automatic textarea growth and resize handling. Enter submits,
  Shift+Enter adds a line, IME composition Enter does not submit. New Chat moves
  focus to the composer. Initial suggestions fill editable drafts without any
  Brain request, conversation creation or other write.
- Native modal context sheet with inset groups and conversations first.
  Opening/closing uses reversible Web Animations from the current presentation;
  content, scroll lock and focus containment remain until closing finishes.
  Escape/backdrop dismiss, interruption reopens, normal closing explicitly
  restores trigger focus and corrections focus their unsent composer draft.
- Reduced motion uses a short opacity transition and avoids smooth forced
  scrolling. Reduced transparency/greater contrast use solid materials.
- Existing thread selection, optimistic messages, retry request IDs, memory
  failure recovery, independent permissions, action history and Vault remain.

## Implementation and verification

Runtime: `src/tabs/AIAssistantTab.jsx`, new `src/styles/companion.css`, interface
strings in `src/i18n/italian-source.js` and generated `src/i18n/it.json`.
New browser coverage lives in `tests/ui/companion-apple.spec.js`; existing
Companion, dock and shell tests retain their behavioral assertions.

For the initial redesign, Chromium Companion/dock/shell checks pass **33/33**. WebKit Companion
checks pass **24/24** after explicit focus restoration and the final
textarea/clearance changes. Both batches ran after the final runtime changes of that pass.
Brain regressions, production build, Italian dictionary check and whitespace
checks pass. The pre-existing >500kB build warning remains non-failing.

The new matrix covers 360/390/430/768/1024/1440px, English/Italian and 100%/200%
root text. It checks horizontal fit and whole-composer clearance above the
active-workout resume bar, in addition to the navigation bar. Interaction
coverage includes draft-only starters, multiline growth, composition Enter,
context reversal/focus and reduced-motion/contrast adaptations.

Visual review exposed two issues beyond the initial assertions: the legacy
fixed workspace height could override measured dock clearance at 200% text,
and textarea height needed to update on viewport/text changes. Scoped Companion
height rules now outrank those legacy rules and textarea resizing is observed.
WebKit also required explicit trigger focus after closing because pointer
activation need not focus a button. These were corrected without weakening
the corresponding assertions.

Actual empty, populated and context renders were inspected, including Italian
360px enlarged text and 1440px desktop. Context opening frames were sampled at
0/130/260ms (opacity 0/.946/1), and intermediate/settled renders inspected.
Screenshots are ignored local evidence
under `docs/audits/lifeos-ui/screenshots/companion-apple-*`.

## Limits and release boundary

All requests use isolated UI fixtures, not production accounts. Physical
iPhone/Safari/PWA safe areas, native keyboard/compositor behavior, OS text
settings, real screen-reader speech and user acceptance remain unverified.
Root text enlargement is not proof of browser zoom or physical-device behavior.
The broader `npm test` was not rerun; its previously recorded unrelated
attention-monitor fixture clock failure remains in the documentation audit.

No backend, schema, dependency, Brain protocol or sharing-policy change.
No schema rerun required. No commit, push or deployment performed.

## Chat refinement follow-up

The subsequent request focused on the populated chat itself, using
`apple-design` again. User bubbles now lead directly with message text and a
quiet timestamp. Assistant replies have a compact identity header, readable
body typography and a separate footer for Copy, Save and time. Action targets
remain at least 44px and wrap with enlarged text. Existing Vault actions retain
their accessible names and modal/focus behavior.

Copy writes the original answer text, including Markdown, to the browser
clipboard. Success changes the action to Copied with a live announcement;
denial displays an inline error and remains retryable. Copy never sends a chat
request or saves a report. English/Italian interface text is included.

New pending messages have a short, restrained arrival transition, using only
opacity with reduced motion. Reading older messages is preserved when a reply
or error arrives. Latest messages returns to the end and focuses the transcript
without opening the composer keyboard. Own sends and thread changes continue
to navigate to the end. The floating control has solid-material adaptations.

Added `tests/ui/companion-chat.spec.js` for clipboard success/denial/retry,
incoming-reply reading position, return-to-latest focus and populated six-width
normal/200% text layouts. The isolated fixture adds an opt-in response delay.
Report tests now wait for context data before clicking controls below it;
the progressive-disclosure assertions are unchanged. A separate deterministic
test closes context at animation time zero, covering immediate dismissal.

The follow-up also guards animation finish callbacks by direction and closing
endpoint. A queued opening-finish event must not close a newly reversed dialog.
The interruption test slows only the closing playback to provide a reliable
interaction window under load; normal-motion and focus assertions remain.

Inspected actual populated 390px and 1440px renders and enlarged-text output.
Local screenshots use `companion-chat-*` in the ignored evidence folder.
All earlier physical-device/OS clipboard/screen-reader acceptance limits remain.
No backend/schema/dependency changes; no schema rerun required. No commit,
push or deployment performed.

Final follow-up Chromium checks pass **44/44** across Companion, Apple layout/
motion, chat refinement, reports and shell continuity. Brain, production build,
Italian dictionary and whitespace checks pass. Clipboard success and denial
are tested with controlled browser stubs; no OS clipboard or physical-device
acceptance is implied. Earlier timing failures were investigated and corrected;
the final combined run includes the direction/endpoint guard, deterministic
interruption window and unchanged report progressive-disclosure assertions.
Final focused WebKit chat/Apple checks pass **10/10**, including incoming-reply
reading position, clipboard feedback, immediate dismissal and reversal.
