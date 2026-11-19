# Community Apple-style implementation and QA

Local mobile follow-up: [tap and photo fixes](mobile-bugfixes-2026-11-19.md). Pull-to-refresh ignores finger jitter before claiming a drag; profile motion animates only the photo circle, with no dialog-container outline. Physical iPhone acceptance remains pending.

Final accumulated release evidence: [2026-11-19 checks](ui-release-2026-11-19.md).
This supersedes earlier deferred-validation and local-only status notes below.

## 2026-11-18 ongoing visual revisions — validation deferred

The user is still supplying UI changes and explicitly requested postponing
tests and the overall review until feedback is complete. The latest edits have
not been validated; earlier results below predate this batch.

- Workout detail uses the exact same AuthorButton size/type treatment as Feed.
- Its brighter semibold date text sits beside the workout title without a box, aligned to the right
  content edge; it wraps right-aligned when space is limited.
- Exercise-heading number badges are removed; warm-up rows and W badges use
  orange highlighting.
- The experimental blue-charcoal exercise-card treatment was rejected and fully
  undone. Original card surfaces, headings, borders and row spacing are restored;
  the earlier orange warm-up highlighting and removal of number badges remain.
- A member profile's avatar opens the same circle-only, position/scale viewer
  as Settings, with no edit/delete controls. It uses the shared dialog and
  authorized avatar loader; missing/revoked profile data closes the viewer.
- Public-profile Settings aligns the username and adjacent Edit action with
  the avatar's vertical center; the desktop row also stays horizontal.

No schema rerun required. Local/uncommitted/undeployed. Run the focused and
required overall checks after the user finishes the revision batch.

## 2026-11-18 shared-card typography and exercise list (current)

Shared workout cards in Feed and member profiles now show `@username` at
1.125rem/regular weight beside the existing avatar. The workout title keeps its
hierarchy; only the exercise total remains, aligned to the right content edge.
Card dates have slightly brighter text, .875rem type and semibold weight for
clearer visibility in the header.
Below it, every exercise occupies a muted subtitle row with its set count aligned
to the right content edge, matching the exercise total's alignment and typography.
Counts include all projected sets,
including warm-ups, consistently with the existing workout projection.

The production feed now reads one ten-item page from the existing sanitized
Community table with the same date/ID ordering, author filtering, captured
authorization and RLS. The three-name RPC preview could not supply the requested
complete list/counts. The adapter immediately reduces returned sets to exercise
identities and counts; list caches do not retain set metrics or notes. Detail
loading, privacy invalidation and account/navigation boundaries remain unchanged.
No database functions, policies, schema or dependencies changed.

Validation: Chromium Community/navigation/privacy suites 48/48, followed by the
expanded card suite 18/18 and WebKit card suite 18/18 covering summary-only responses and EN/IT at 360, 390,
430, 768, 1024 and 1440px with normal/200% text. A focused production-service
probe verified complete summaries, discarded details, captured authorization,
account mismatch/error rejection and cursor/author filtering. The real-data
preview feed was rendered and visually inspected; launcher/detail/member/photo
checks passed. Brain, production build and whitespace checks passed (existing
non-failing bundle-size warning). Local/uncommitted/undeployed; physical-device
and user visual acceptance remain pending. No schema rerun required.

## 2026-11-18 review preview with current Community data

The local launcher at `http://127.0.0.1:4178/test-results/community-preview.html`
now replaces the synthetic browser seed with a database snapshot captured at
`2026-11-18T10:56:18Z`: 66 shared workouts, six member profiles and available
profile photos. The snapshot SELECT ran in a read-only transaction as
`authenticated` with the Casce viewer identity, preserving Community RLS and
notes-consent filtering. Only approved Community projection fields were exported.
Photos were downloaded server-side into the ignored local preview directory;
credentials and signed URLs are not included in browser data.

Snapshot JSON, photos, launcher and verification helpers live only under ignored
`test-results/`. They are a dated review copy, not a live database connection.
Reopen the launcher to replace earlier demo data. The bare `/community` URL
continues using whichever local seed the browser already has. Automated Chromium
verification passed two launcher visits, feed, real workout detail, six members,
loaded local photos and zero external browser requests; the rendered feed was
also inspected. Production data was not changed. No schema rerun required.

## 2026-11-18 user revision (current; overrides the redesign below where they differ)

User feedback on the redesign, applied the same day:

- **Palette:** Community tokens now map to the shell palette from `main`
  (`--surface`, `--line`, `--ink`, `--muted`, `--accent`); no Community-only
  tint on cards.
- **Feed and profile cards:** one spaced card per workout (main-style border,
  12px radius), identical in Feed and on member profiles (author shown on both).
  Header: larger avatar (2.75rem, capped at 56px) and username on the left,
  date on the top right (Today / Yesterday / `d MMM`, year when not current).
  Title with "N exercises · N sets" beside it. Date sections and exercise-name
  chips are removed. The title line is the open button; tapping elsewhere on
  the card (outside the author) also opens the workout.
- **Members:** one plain list; the A–Z letter sections are removed.
- **Profile:** no Edit profile button, including on your own profile.
- **Workout:** author (avatar + username) first, then title with the date
  beside it (`d MMM yyyy`), notes as plain text, then exercise cards. The
  Exercises/Sets summary card and the "N sets" line are removed. Column header
  `kg` → `Weight` (`Carico`); weights show `kg` after each number. RPE badges:
  6–7 green, 8–9 yellow, 10 red (below 6 stays plain).
- At 200% text on a 360px phone the Set header can ellipsize to `S…`; data
  cells never clip.

Validation: Chromium Community, navigation, modern, apple spec, Settings and
shell continuity 71/71; `npm run test:brain`, build, Italian dictionary check
and `git diff --check` pass. Two navigation tests that required the Edit
profile button now assert it is absent. No schema rerun required.

## 2026-11-18 redesign (superseded in part by the revision above)

The user rejected the Codex implementation's look and asked for a full
`apple-design` redesign starting from `main`. The Codex files are replaced, not
patched. `CommunityTab.jsx` keeps `main`'s navigation, list/record hooks, cache,
privacy revalidation and account isolation verbatim; the presentation is new.

- **Feed:** posts grouped into Today / Yesterday / This week / month sections,
  each section one inset group with hairline separators. A post row has the
  author (avatar + username, its own button above the row), title, date/count
  meta and exercise-name chips (`+N` for the rest); the whole row opens the
  workout. No per-card "View workout" row.
- **Feed/Members:** a compact segmented control on a sticky scroll-edge fade;
  one thumb slides with a critically damped curve (snaps under reduced motion).
- **Workout:** navigation-bar back (chevron + previous title, accessible name
  "Back to …"), date eyebrow, large title, author chip, Exercises/Sets summary,
  session notes, then numbered exercise groups with fixed-layout Set/kg/Reps/RPE
  tables; warm-ups use an amber `W` badge; set notes sit under their row.
  Italian reps header is abbreviated `Rip.` to fit.
- **Profile:** centred hero (large avatar, `@username`, own-profile Edit profile
  pill → Settings) above the same date-grouped feed without author rows. The
  Codex photo viewer and Settings-card reuse are removed.
- **Members:** filled search field with clear button and Escape-to-clear, A–Z
  letter sections, avatar rows with a `You` tag, distinct no-match (with Clear
  search) and no-members states.
- **Motion/a11y:** push/pop pages slide along the same horizontal path, Feed/
  Members switches cross-fade; reduced motion → opacity only; reduced
  transparency/increased contrast adapt materials and lines. Returning focuses
  the row/author control that opened the page. Skeleton loading with a
  screen-reader status.
- `ProfileAvatar.jsx` is back to `main` (the Codex `onPhotoReady` prop was only
  for the removed viewer). Codex-only translation keys were removed; added
  Yesterday, Profile, Session notes.

Validation (2026-11-18): Chromium Community/navigation/modern/new spec plus
Settings, photo, dock and shell continuity **86/87** — the one failure was
`modern-settings` "larger text…" line 295, a timing flake (scroll width read
straight after a resize) that then passed 10 of 10 reruns and does not load
Community styles. WebKit Community suites **48/48**. `tests/ui/community-apple.spec.js`
was rewritten for this design (13 tests: sections, tabs pattern, detail tables,
back titles/focus, search, EN/IT at 360/390/768/1440 normal and 200% text with
reduced motion). Brain regressions, build, Italian dictionary and diff checks
pass. Physical iPhone/PWA and screen-reader acceptance and the user's visual
acceptance remain pending. Known outside scope: at 200% text the mobile dock
labels wrap mid-word. No schema rerun required.

## Superseded Codex implementation (2026-11-17)

Date: 2026-11-17. Implemented locally; uncommitted and undeployed. The approved
[complete design plan](../plans/community-apple-design.md) remains the scope.
No backend, service interface, dependency or database changes. No schema rerun required.

## Latest profile/workout visual correction

The user rejected the first profile/detail presentation and explicitly removed
exercise-jump navigation. All desktop indexes and mobile selectors are removed.
The earlier index idea is superseded; do not restore it.

Community profiles now import and use Settings' actual `settings-profile-card`,
`settings-profile-row`, `settings-photo-control`, `settings-identity-label`,
`settings-username` and compact `settings-edit-username` styles. The own-profile
heading establishes ownership; Edit still navigates to Settings. Authorized photo
viewing uses Settings' circular viewer styling and retains reversible native
modality without adding photo editing to Community.

Workout details now lead with an inset date/title/preview card, prominent supplied
exercise/set counts and a secondary author footer. Exercise headings use the same
size/weight/tracking as Feed titles. Weight/repetition values carry more emphasis
than supporting column labels, warm-ups and RPE. Session notes follow the open
exercise log. The Feed typography is preserved. Programmatic focus still reaches
the page heading, with no input-like border around noninteractive titles; button
focus indicators remain.

Updated files in this follow-up: `src/tabs/CommunityTab.jsx`,
`src/components/SharedWorkout.jsx`, `src/styles/community.css`, the Italian source
and generated dictionary, `tests/ui/community-apple.spec.js` and current QA/handoff
references. Settings implementation and backend contracts were preserved.

Validation: Chromium Community/navigation/Settings passed **73/73**
(`test-results/community-hierarchy-final/`); WebKit Community/navigation passed
**32/32** (`test-results/community-hierarchy-webkit/`). Final Brain regressions,
production build, Italian dictionary and whitespace checks pass; the existing
non-failing bundle-size warning remains. Coverage includes a computed-style comparison of the actual card,
avatar dimensions and username type between Community and Settings. The matrix
covers six widths, both languages and normal/200% text. Actual 390px and 1440px
Settings/profile/workout renders were inspected after animations completed;
local screenshots are `test-results/community-hierarchy-{settings,own-profile,workout}-{390,1440}.png`.
No schema rerun required. Local, uncommitted and undeployed.

## Result and file ownership

- `src/tabs/CommunityTab.jsx`: segmented Feed/Members navigation with a critically
  damped indicator, search recovery, grouped member rows, full-page profiles and
  workout details, contextual Back labels, control-focus restoration and the
  read-only animated photo viewer. Existing list/record request generations,
  account-keyed mounting, 30-second/focus/visibility revalidation and fail-closed
  cache invalidation remain.
- `src/components/SharedWorkout.jsx`: username-only identity, reusable cards and
  supplied exercise/set counts, open semantic set tables, permitted notes and
  no exercise-index/jump controls. Missing weight/reps/RPE display
  an unavailable marker; actual zero remains zero. Legacy warm-up numbers render
  W with a localized accessible label. Catalog identities localize; custom names
  and authored notes remain verbatim.
- `src/components/ProfileAvatar.jsx`: optional image-readiness reporting after
  successful image load, reusing the viewer-scoped signed URL cache, renewal,
  authorization and broken-image fallback. No new photo service or durable cache.
- `src/styles/community.css`: the local dark Settings/Companion materials,
  responsive layouts, readable numeric columns, immediate press feedback and
  reduced-motion/transparency/high-contrast adaptations.
- `src/i18n/italian-source.js` and generated `it.json`: new interface messages.
- `tests/ui/community-apple.spec.js`: complete screen/journey, photo, enlarged
  text, stress and privacy coverage. Existing Community/navigation tests retain
  their behavior assertions while using current Back/Edit labels, table semantics
  and independently saved Settings switches.
- `tests/ui/fixtureApi.js`: preference patches now merge with prior preferences,
  matching production. The old fixture replaced the entire object, accidentally
  dropping language and the independent sharing/notes choice. Other pre-existing
  changes to this shared fixture belong to the Companion handoff.

Own-profile Edit opens Settings; browser Back restores the original profile and
edit control. Members search -> profile -> workout unwinds to the original
search and loaded pages. Feed -> workout -> author profile unwinds back through
the workout to the original Feed. Refresh and direct hash links remain supported;
direct links without history fall back to Feed. Removed origins fall back to the
destination heading. Restoration uses focus with preventScroll.

The photo action appears only for a successfully loaded authorized image. The
viewer retains native dialog modality and content while dismissing, reverses
from its current animation position and ignores queued opening-finish events.
Escape/backdrop dismissal restores trigger focus. Missing/broken photos offer
no preview action; revoking the member closes the viewer with the profile.

## Earlier implementation verification and timing

- Broad Chromium Community/navigation/photo/shell batch: **69/69 passed**,
  output `test-results/community-chromium-accepted/`, before the final one-rule
  profile-heading width correction.
- Final Chromium Community-screen/navigation recheck after that correction:
  **32/32 passed**, output `test-results/community-chromium-verified/`.
- Final WebKit Community-screen/navigation/shell batch: **36/36 passed**,
  output `test-results/community-webkit-verified/`.
- Deterministic `test:community` and `test:social-training`: passed, isolated
  rollback fixtures including two-user/anonymous RLS and notes revocation.
- Final production build, Brain regressions, generated Italian dictionary check
  and `git diff --check`: passed. The existing non-failing bundle-size warning
  remains. Documentation links and new-file whitespace also pass.

WebKit exposed two browser-specific presentation issues that were fixed and
rechecked: mouse clicks do not reliably focus buttons, so navigation now passes
origin-control identity explicitly; and a flex-column profile heading could
exceed its column at 360px/200% text, so its width is constrained explicitly.
The photo interruption test uses actual pointer coordinates while the surface
moves; Playwright locator clicks intentionally wait for stable geometry. The
large-log fixture reloads after adding its active workout so app state reads it.

The layout matrix covers 360, 390, 430, 768, 1024 and 1440px, English/Italian,
normal and 200% root text. It captures Feed, filtered directory, member profile,
photo viewer and full workout logs. Actual rendered images were inspected.
The first review found decimal weights wrapping at narrow enlarged text; table
column proportions were corrected and final screenshots show intact numbers.
Filtered-search screenshots wait for debounce; photo screenshots wait for the
opening animation to finish. No-results/error recovery screenshots are retained
with the final browser outputs, and the 500-set case checks the final note clears the
active-workout resume bar.

Additional coverage preserves loaded pages/scroll, Back/Forward and refresh,
same-account Settings return, signed avatar cache reuse/renewal/failure, stale
responses after route/account changes, profile and workout revocation, failed
revalidation removing cached content, notes OFF/ON/OFF, unknown/actual-zero values,
long authored titles/exercise names, all 500 sets and the absence of exercise-jump navigation.

## Repeat focused validation

Run browser batches sequentially, using separate output directories:

```powershell
npx playwright test tests/ui/community-apple.spec.js tests/ui/community-navigation.spec.js tests/ui/modern-community.spec.js tests/ui/community.spec.js tests/ui/profile-photo.spec.js tests/ui/shell-continuity.spec.js --reporter=line --output=test-results/community-chromium
$env:LIFEOS_QA_BROWSER='webkit'
npx playwright test tests/ui/community-apple.spec.js tests/ui/community-navigation.spec.js tests/ui/shell-continuity.spec.js --reporter=line --output=test-results/community-webkit
$env:LIFEOS_QA_BROWSER='chromium'
npm run test:community
npm run test:social-training
npm run test:brain
npm run build
node scripts/tools/generate-italian.js --check
git diff --check
```

Use the isolated fixture preview at `http://127.0.0.1:4178/community` when
`node scripts/serve-ui-qa.js` is running. It serves current local source, not
production Supabase. Browser engines and fixture data do not establish physical
iPhone/PWA safe areas, OS keyboard/picker behavior, screen-reader speech or
production delivery/RLS acceptance. No hosted account or private data was changed.
The broader suite's previously recorded attention-monitor clock-fixture issue
was not changed or rerun. Commit, push and deployment require a separate request.
