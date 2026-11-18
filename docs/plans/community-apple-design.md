# Community: complete Apple-style experience

Date: 2026-11-17. Status: **superseded on 2026-11-18** by a full redesign from `main` (see the top section of [Community evidence](../qa/community-apple-design.md)). Privacy, navigation and data boundaries below still apply; the visual decisions (Settings-card profile, photo viewer) do not.

Original status: implemented locally; uncommitted and undeployed.
Latest user correction supersedes the original exercise-index idea: no jump controls; reuse the actual Settings profile UI and preserve Feed typography while improving workout-detail hierarchy.

Current implementation and validation: [Community evidence](../qa/community-apple-design.md).
The user confirmed the scope and navigation decisions below, then requested
saving the plan and handoff before clearing context. That documentation request
does not authorize a commit, push or deployment. This file preserves the complete
conversation plan; do not reduce this scope to Feed/Members styling.

## Summary and boundaries

Redesign the entire Community journey: Feed, Members, member profiles,
shared-workout details, profile-photo viewing, navigation and every loading,
empty, error and privacy state. Apply `apple-design` from
`C:/Users/aless/.agents/skills/apple-design/SKILL.md`, continuing the current
local Settings, Companion and floating-navigation visual language.

User-confirmed decisions:

- Improve existing capabilities without adding reactions, comments, following,
  rankings or member training analytics.
- Members and workouts open as dedicated pages with contextual Back navigation,
  rather than detail sheets or desktop side panels.
- Workout details show every exercise and set openly, rather than initially
  collapsed exercise accordions.

Preserve authenticated sharing, read-only workout projections and account
isolation. No API, database or dependency changes are planned. **No schema rerun
required.** Preserve all pre-existing local work listed in
[the current handoff](../agents/current-handoff.md).

## Experience and visual design

Use the dark Apple-style language of the local Settings, Companion and dock:

- Canvas `#0b0d0f`, surfaces `#171c24` and `#222832`, primary text `#f3f5f9`,
  secondary text `#a8b4c4`, action accent `#a6caff`.
- Platform system typography, stronger headings, readable body text and tabular
  numbers for workout data.
- An 8px spacing rhythm, controls at least 44px, restrained rounded surfaces and
  immediate press feedback.
- A maximum workspace width of 1040px. Feed and directory remain centered,
  readable single-column experiences.

### Feed

- Replace the introductory paragraph and underline tabs with a compact header
  and Feed/Members segmented control.
- Use a critically damped selection indicator that retargets from its current
  position and velocity. Preserve keyboard tab navigation.
- Structure workout cards in three levels: member identity and actual workout
  date; session title and exercise preview; exercise/set counts and a clear
  workout-opening affordance.
- Member identity opens the profile; the workout area opens the session. Avoid
  nested interactive elements.
- Keep chronological ordering and explicit Load more pagination. Do not add
  fabricated totals or activity indicators.
- Provide a discreet Your profile action for viewers with a public profile;
  otherwise offer the existing Settings profile-setup route.

### Members

- Use a clear search field with a labeled Clear action and the existing
  debounced username search.
- Present grouped rows with avatar, dominant username and a trailing navigation
  chevron. The entire row opens the profile.
- Preserve alphabetical ordering and pagination. Do not show inferred activity,
  sharing status or workout totals.
- Distinguish an empty directory from no search results. No-results recovery
  clears the query.

### Member profile

- Reuse Settings' actual inset profile card, responsive avatar sizes, Username label, username typography and compact Edit treatment.
- Match Settings' desktop column proportions from 1000px; use its compact photo/identity row on mobile, above clearly labeled shared-workout history.
- Reuse Feed history cards while omitting the repeated author identity.
- Own profiles use the Your profile heading and a compact Edit action leading to Settings.
  Other members receive no editing controls.
- A profile with no visible workouts says No shared workouts available; do not
  imply the member has never trained or reveal their sharing preference.
- An available profile photo opens a read-only enlarged viewer. Missing/failed
  photos use the existing fallback without a misleading preview action. Photo
  editing stays in Settings.

### Shared-workout detail

- Show contextual Back navigation, followed by an inset summary card: actual date, strong session title, exercise preview and prominent supplied exercise/set counts. Place the member identity in its quieter footer.
- Give exercise headings the Feed title hierarchy and distinguish primary weight/repetition values from supporting table labels and RPE. Do not invent
  duration, volume, personal records or comparisons.
- Render every exercise as an open section with readable columns: Set, Weight
  (kg), Reps and RPE.
- Preserve source ordering, canonical exercise grouping, localized catalog names,
  authored custom names and warm-up identification. Legacy warm-up numbers must
  display as warm-ups, not 1001.
- Missing values remain unavailable, never zero or assumed bodyweight.
- Place permitted session notes after the exercise log and set notes beneath their
  rows. Do not display placeholders suggesting hidden private notes.
- No exercise index, jump selector or extra navigation. Keep every exercise and set openly readable.
- Details remain read-only for everyone, including the workout author.

## Navigation, motion and states

Preserve existing `/community` hash URLs and browser history compatibility.
Both complete journeys must work:

1. Members -> search -> profile -> workout -> Back to profile -> Back to the
   original search.
2. Feed -> workout -> author profile -> Back to workout -> Back to the original
   Feed position.

Contextual Back labels name the destination. Restore loaded pages, search,
scroll and originating control focus. If the control disappeared, focus the
destination heading. Preserve browser Back/Forward, refresh and direct links;
direct links without an origin safely return to Feed. Returning from Settings
uses existing app history to restore the Community browsing context.

Use short, symmetric transitions without blocking navigation. Incoming pages
focus their heading without fighting scroll restoration. Photo-viewer dismissal
retains modality until completion and restores trigger focus. Reversal must
ignore queued opening-finish events, as learned from the Companion work.

Provide consistent states across every screen:

- Stable loading skeletons and accessible status; controls must not shift under
  a pointer as context data arrives.
- Distinct empty states for Feed, directory, search and member history.
- Inline errors with Retry, retaining route and search.
- Neutral private/unavailable workout/member screens with usable Back controls.
- Quiet background-refresh feedback without resetting scroll.

Preserve privacy revalidation, stale-response rejection and account-scoped
caches. Failed revalidation must continue removing unconfirmed cached Community
content. Do not add a persistent workout cache. Reduced motion replaces movement
with brief fades; reduced transparency/increased contrast use solid materials.
All menus, controls and viewer interactions support keyboard and screen-reader
semantics.

## Implementation sequence

1. Establish Community typography, materials, segmented navigation, identity
   rows, cards and state components using the existing stylesheet/components.
2. Implement Feed and Members together, retaining request hooks and navigation
   state while replacing presentation and adding search recovery.
3. Implement complete member profiles, reuse history cards, preserve own-profile
   Settings access and add the read-only photo viewer using authorized avatar
   loading.
4. Implement the complete workout reader with open exercise sections, semantic
   set columns, notes and a clear title/count/author summary.
5. Complete cross-screen behavior. Add an optional internal focus-return target
   to navigation state with safe defaults for older history entries. Verify
   transitions, restoration, invalidation and unavailable states.
6. Update QA and handoff documentation with scoped evidence, preserving existing
   Settings, Companion, dock and unrelated documentation changes.

Primary runtime work belongs in `src/tabs/CommunityTab.jsx`,
`src/components/SharedWorkout.jsx` and `src/styles/community.css`. Introduce small
shared helpers only where reused. Public service interfaces remain unchanged.

### Source facts and implementation guardrails

The plan was grounded in current source, not the stale generated graph:

- `communityApi` already exposes feed/detail/members/member; requests capture
  viewer identity. Feed uses date/UUID keyset pagination, 10 per page. Directory
  uses username search and 20 per page. Do not compute lifetime totals from a
  partially loaded page.
- Browser entries already hold an account-scoped origin stack, search and scroll
  state. Extend that mechanism; do not replace it with a generic Back-to-Feed
  button or break existing hash links.
- Revalidation occurs on focus/visibility and at 30-second intervals. List data
  uses bounded memory-only caching; detail snapshots are not stored durably.
- Private workout sources remain owner-only. Community reads sanitized shared
  projections, and source editing remains in Training. Global sharing/notes
  preferences and read-time revocation stay authoritative.
- Public identity is username only; never infer a name from email/Auth metadata.
  Avatar loading already handles signed URLs, expiry, authorization, image
  failure and account isolation. Reuse that boundary for photo viewing.

Read [Community policy](../COMMUNITY.md) and
[Training/profile navigation contracts](../TRAINING_PROFILE_RELEASE.md) before
implementation. Their production claims are dated evidence, not a fresh live
health check. Rankings remains a separate design-only plan.

## Validation and acceptance

- Cover every screen at 360, 390, 430, 768, 1024 and 1440px in English/Italian,
  including 200% root text.
- Inspect actual Feed, search results, own/other profiles, photo viewer,
  populated workout details and recovery renders.
- Test long usernames/titles, missing/broken avatars, many exercises, large set
  logs, warm-ups, missing RPE/weight and permitted multiline notes.
- Verify both nested journeys, pagination/search restoration, Back/Forward,
  refresh, direct links and keyboard focus return.
- Verify revocation while browsing, failed refresh, delayed responses, account
  switching and notes consent. Stale private content must not reappear.
- Verify active-workout resume/mobile navigation clearance, search-keyboard
  behavior, reduced motion, solid materials and interrupted viewer/menu
  transitions.
- Run focused Community/navigation tests, relevant avatar/shell checks,
  `npm run test:community`, `npm run test:social-training`, `npm run test:brain`,
  `npm run build`, `node scripts/tools/generate-italian.js --check` and
  `git diff --check`. Run syntax checks if backend files unexpectedly change;
  backend work is not part of this plan.
- Extend existing behavioral assertions rather than discarding them for new
  selectors. Some older Community/Settings journeys refer to superseded global
  Save settings or historical publication controls; inspect and update stale
  UI assumptions without reinstating those obsolete interfaces.
- Do not run the entire UI matrix. Separate the known unrelated full-suite
  attention-monitor clock issue from Community regressions.

Local acceptance requires all four main screens and their connecting journeys,
not only Feed/Members. Physical iPhone/PWA and screen-reader acceptance remain
separate manual checks. Implementation stays local/uncommitted; commit, push and
deployment require a separate explicit request.

## Resume instruction

The complete plan is implemented locally after the subsequent implementation
request. Read the current handoff and Community evidence, inspect `git status`,
and preserve the existing local work. The original save was documentation-only;
the later implementation still did not authorize commit, push or deployment.
The three confirmed design decisions remain the contract for further changes.
