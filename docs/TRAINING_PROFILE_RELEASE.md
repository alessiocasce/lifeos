# Training, Username Profiles and Navigation

## Runtime Contract

- Training has Live / History / Manage. Suggested Quick start cards are setup
  shortcuts, never fabricated workouts/exercises. Persisted nonempty templates
  start through the existing immutable-snapshot flow. Manage owns template CRUD,
  exercise ordering, eight color keys and twelve icon keys. Unknown visuals fall
  back safely. Logger drafts, History isolation, warmup numbering and timers retain
  their existing contracts.
- Public identity is username only. Never derive a public name from email or Auth
  metadata. Global sharing and notes privacy are unchanged.
- Profile photos use private `profile-avatars` Storage. Source JPEG/PNG/WebP <=5 MB
  is cropped/resized to 512px WebP <=1 MB. Persist only an owner-prefixed immutable
  object path. Authenticated members may sign referenced avatars for five minutes;
  only owners may stage/replace/delete. Legacy HTTPS avatar URLs remain readable.
  Replacement/removal clears the old reference, then best-effort removes the old
  object. In-flight account changes cannot retarget the captured Storage token.
  Previously issued signed URLs can survive until their five-minute expiry.
- Community browser entries carry an account-scoped origin stack, Members search
  and scroll positions. App Back follows a known origin; direct links fall back
  to Feed. Hash URLs remain shareable. Read-time privacy checks still apply on
  every re-fetch; no private workout cache is used for Community.
- Signup supplies a canonical production emailRedirectTo. Standard Supabase
  ConfirmationURL verification and SDK fragment handling are retained. See
  AUTH_CONFIRMATION.md; loading the homepage is not proof of email verification.

## Expand / Deploy / Contract

1. Capture the restricted logical backup and source/privacy hashes.
2. Apply only `training_profile_upgrade`: additive visuals/avatar paths, private
   bucket/RLS, new four-argument settings RPC and username-only Feed v2.
   The old column/RPC remain available while old production code is serving.
3. Push the reviewed frontend and verify its production SHA/bundle.
4. Only then apply `username_only_cleanup`: replace the legacy feed DTO, remove
   the retired admin cohort provisioner, old five-argument save RPC and column.
5. Verify source hashes and rollback-only A/B/anonymous SQL, Storage metadata and
   deployed reads. Seal assigned migration versions. Never broad db push.

Cached pre-release PWA clients must activate the new build before loading Settings
or Community after column removal. Never force activation during a live workout.
If deployment fails, leave the backward-compatible expand migration and stop
before cleanup; prefer forward fixes over destructive rollback.

## Focused QA

`node scripts/test-training-profile.js`, `node scripts/test-auth-redirect.js`,
`npm run test:workout`, `npm run test:workout:rest`, `npm run test:community`,
`npm run test:social-training`, `npm run test:schema`, `npm run check:functions`,
the targeted Training/Profile/Community/Auth Playwright specs, build/diff checks.
Historical foundation tests intentionally retain old migration-contract fixtures;
current production verification is `supabase/operations/verify_training_profile.sql`.

- At 390/768/1024/1440: no overflow, bottom navigation reachable, clear active view.
- Empty Training: five setup cards in order, no fake workouts; create/edit visuals,
  add/reorder exercises, reload, start and check immutable session snapshot.
- Active Training: History and Manage round trips preserve the full unsaved draft,
  selected exercise and rest timer. Finish/reopen/log/edit/delete remain available.
- Photo: crop, retry failure, replace, remove; own Community edit link; cross-user
  writes rejected. Camera/native iPhone behavior needs physical acceptance.
- Community: Members/search -> profile -> workout -> Back twice; Feed -> workout
  -> author -> Back twice; browser Back/Forward, refresh and direct links.
- Fresh email signup: no unverified session; confirm genuine emailed Supabase URL,
  verify confirmed state and canonical redirect, sign out/in. Generated-link smoke
  proves GoTrue verification, not mailbox delivery. Built-in SMTP is rate-limited.

No new API route, Vercel function, bridge restart, monitor permission or rankings.

## Production Verification (2026-11-02)

Applied only `20261102115233_training_profile_upgrade.sql`, then deployed the
compatible frontend (`2a05f25`), verified its production alias bundle hash, then
applied `20261102115554_username_only_cleanup.sql`. Filenames and LF hashes match
the assigned production ledger. No historical migration replay or schema reset.

Preservation hashes match for 45 workouts / 454 sets, two template contents and
five exercise rows, usernames/avatar URLs, three preferences, rest state and all
45 Community projections. Existing template timestamps were preserved while
assigning initial visuals. Public notes remain absent. The legacy column, RPC
signature and live function references are gone; old migrations remain immutable.

79 focused browser cases passed (78 initial plus corrected Projects-through-More
test rerun), with 390/768/1024/1440 layout checks. Workout render/storage, rest,
Community, Social Training, schema, Brain, redirect/SDK, build and seven-function
checks passed. Backup rehearsal preserved the actual production-shaped dataset.
All three rollback-only production verification SQL scripts passed. Real
authenticated Storage HTTP checks proved upload, signed member read, replacement,
removal and cross-user/anonymous rejection before and after cleanup; disposable
accounts, profiles and objects were cleaned up. No fake production workouts.

Security advisors have no new feature-specific finding. Existing owner-only
workout_share_status SECURITY DEFINER warning, three unrelated mutable search
paths, seven intentionally server-only policy-less tables and disabled leaked
password protection remain outside scope.

Physical iPhone camera/PWA lifecycle and actual confirmation-email mailbox click
remain acceptance work. Generated verification-link smoke is not inbox evidence.
