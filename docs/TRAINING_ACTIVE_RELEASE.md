# Active Training, Identity and Media Release

## Runtime

The 3 November active-workout reference governs logging, not the unchanged Live
start page. Live/History/Manage remain. Only saved templates appear. Active sessions
use their captured template icon/color (new sessions); old sessions resolve the
associated template or use neutral slate. Appearance never changes exercise snapshots.

Workout options contains only details (name/date) and confirmed deletion. End is a
separate accent action below always-visible, selected-exercise sets. Last time is
collapsed and exercise-specific. The compact exercise sheet uses the session plan;
Choose another exercise opens the existing canonical catalog without editing it.
Weight/reps are editable with 2.5kg/one-rep steppers. More options has warmup, a
discoverable None RPE option, fractional/manual RPE and the sole routine notes input.
No template/exercise/empty-session notes inputs; all stored historical notes remain.

Manage is a saved-template library. Create/open selects one dedicated editor;
appearance is a disclosure and exercise operations are contextual. Failed saves
retain drafts. Existing order, IDs and immutable workout snapshots are preserved.

## Root Causes and Boundaries

- Exercise selection spread the preceding form into the next exercise. Draft v1
  envelopes now additionally hold a bounded exercise-keyed bank, scoped to user and
  workout, with the same 36-hour lifetime. Switching restores that exercise or starts
  clean with its own historical prefill. Saved targets reset RPE/notes as before.
  Old v1 envelopes with only one draft are imported into the bank at the first
  switch, even if the user has not edited that restored draft. Legacy fields survive.
- Every avatar mount cleared its state and minted a signed URL. The shared in-memory
  cache keys viewer + object path, deduplicates in-flight work and reuses five-minute
  URLs with a 30-second refresh margin. Visibility resume checks validity, no regular
  polling. Transient failures retain the visible image; authorization errors clear it.
  Auth identity changes clear the cache; successful replacement invalidates the old
  path and prewarms the new one. Private Storage and captured-token requests remain.
- Photo sources were rejected by exact MIME and a 5MB ceiling; exporting required
  WebP. Sources now use actual magic bytes and bounded header dimension inspection:
  15MB, 60MP and 16384px side limits. Browser-native decoding handles JPEG/PNG/WebP,
  static GIF, and AVIF/HEIC where supported. HEIC is not universally converted: an
  incompatible browser explicitly asks for JPEG. Crop uses 512px white-matted output,
  WebP first, JPEG fallback, <=1MB. Never remove an old avatar before replacement commits.
- Signup previously discarded public identity entirely. It now validates/checks the
  requested username and carries it as untrusted signup metadata through genuine
  Supabase email confirmation. A confirmed-user RPC validates again and creates only
  auth.uid()'s missing profile. Existing lower(username) uniqueness wins races; a
  loser chooses another name in mandatory onboarding. No reservations or email names.
  Existing profiles are never overwritten by metadata. A settings-network error may
  leave private Training usable; Community still requires profile completion/RLS.

## Forward Migration and Rollout

Apply only the `training_active_identity_media` forward migration, never broad db
push or schema rerun. It adds nullable `workouts.template_appearance`, captures only
new sessions, retires rest producer triggers/RPCs, cancels only queued/claimed rest
outbox rows and rejects future rest enqueue/claim attempts. Inert old preferences
remain for recovery but have no app grants/writer. Historical sent rows remain for
audit and stay excluded from autonomous attention/reply ownership. No bridge change.

JPEG expands only the same owner-prefixed UUID path and private Storage MIME list.
The former anonymous table check constraint is replaced by a named path constraint;
read/delete scope and all workout/Community RLS are unchanged. Profile finalization
is the narrow confirmed-owner SECURITY DEFINER RPC; availability exposes only a
boolean. Both have fixed empty search paths and explicit grants. No display_name.

Deploy DB first, then reviewed code through main's automatic Vercel deployment.
Old clients temporarily see a retired-timer error; they cannot schedule alerts.
Keep the additive database expansion on code rollback. Do not restore timers or
reverse workout IDs/data. Prefer a forward fix. Previously sent/in-flight physical
messages cannot be unsent. Activate PWA updates only after protecting workout drafts.

## QA and Handoff

- `node scripts/test-training-active.js`: real PGlite A/B/anonymous grants, confirmed
  username/duplicate/metadata behavior, JPEG scope, frozen appearance, set persistence
  without timers; pure cache expiry/deduplication and exercise-bank isolation.
- Targeted browser specs: training-active, training-prefill-rest (retirement),
  training-live-manage, template CRUD, History, continuity, profile-photo, auth and
  username-onboarding. Real encoded JPEG/PNG/WebP bytes test decoding, MIME mismatch,
  crop, JPEG fallback and failed replacement. Repeated Members visits must not mint
  another URL for the same identity/path. Inspect 390/768/1024/1440 screenshots.
- Run test:workout, test:brain, test:schema, test:community, check:functions (7),
  schema/dictionary generation checks, backend syntax checks, production build/diff.
- Production QA must distinguish actual authenticated reads from isolated fixtures.
  Never fabricate owner workout history or change avatar/privacy for smoke testing.
  Verify rest pending count zero, retired RPC absence, new grants and source hashes.

Physical iPhone process eviction/keyboard/HEIC, Safari encoder behavior, actual email
mailbox verification, and physical WhatsApp cessation require device-level evidence.
Browser fixtures do not prove these. Next work should be acceptance fixes, not a
new Training redesign or unrelated Companion/OAuth changes.

## Production Database Verification (3 November)

Applied only `20261103023105_training_active_identity_media.sql` to
`wrqscqhclepwxxkazbnc` via the targeted migration connector. Supabase's assigned
version replaces the local creation timestamp. Normalized ledger SQL matches the
checked-in source; its SHA256 is sealed in catalog-migrations.json.

Before/after content hashes match for 48 workouts, 483 sets, 4 templates, 19 template
exercises, 3 profiles, 3 preferences, 47 public projections and the inert rest
preferences. The new nullable workout column is excluded from historical-content
hashing. Pending rest rows went from one to zero. No timer scheduling/control
functions remain; both new guard/capture triggers exist. Bucket stays private,
1MB, allowing WebP/JPEG. Grants and fixed search paths were inspected directly.

Rollback-only production SQL under actual authenticated A/B and anonymous roles
verified owned set insertion, appearance capture, cross-user read/write rejection,
availability, existing-profile no-op finalization and anonymous finalization/profile
read denial. Source hashes matched again after rollback; no QA records remained.

Security advisors flag the deliberately callable availability/finalization definer
RPCs: availability returns one boolean, finalization checks confirmed auth.uid() and
cannot overwrite identities. These are intentional limited APIs, not admin grants.
Pre-existing mutable search-path functions, service-only no-policy tables and leaked
password-protection warning remain outside this release. Review:
https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
