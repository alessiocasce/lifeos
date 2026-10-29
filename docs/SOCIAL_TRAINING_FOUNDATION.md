# Social Training Foundation

Local-only implementation. No production migration or code push is authorized.

## Identity / Privacy

`user_profiles` contains only user-authored public username/display name/avatar
and identifiers/timestamps. Authenticated members may read these fields; only the
owner may write. There is no auth metadata/email backfill. Existing users can
continue Training while a non-blocking prompt links to Settings.

`user_preferences` is private and user-scoped. English, workout sharing OFF and
notes sharing OFF are defaults. Sharing switches publish nothing in this phase.
Invoker RPCs derive identity from `auth.uid()`; profile/preferences save atomically.
Neither these settings nor language grant any WhatsApp/Companion permission.
The configured-owner backend guard and rest recipient contract are unchanged.
Other members can use their own Training but do not inherit the owner's WhatsApp.

## Local Validation / Rollout

## Canonical Exercises

217 curated movements have stable deterministic UUIDs and immutable slugs. The
readable curated source is `src/data/exerciseCatalogSource.js`; generated JSON
and SQL must agree (`generate-catalog-migration.js --check`). Clients cannot
write the global catalog. Names, Italian labels and explicit aliases resolve
only when exactly one canonical identity matches. No fuzzy backfill.

Nullable IDs supplement, never replace, original set/template text. Snapshot
backfill preserves all fields and array order. Re-running the mapping operation
does not remap already-canonical records. The invoker report is RLS-scoped.
Ambiguous names such as Bench Press/Military Press/Lateral Raises stay legacy.
Other exercises remain nullable-ID private records, never global catalog writes.

Loads: barbell/plate total external, dumbbell/kettlebell per implement, machines/
Smith/cables displayed load, assisted machines assistance, bodyweight separate,
rope non-comparable. Only ten explicitly selected strength movements are initially
eligible for future ranking; no ranking calculation or public workout read exists.
Last Time/grouping/prefills use IDs, or exact unambiguous legacy resolution;
unrecognized text retains case/whitespace-normalized personal identity.
The existing 25-session history bound remains; no all-history leaderboard is
computed from that bounded client dataset. Rest scheduling keeps the same trigger,
expiry/idempotency/permissions; only next-set exercise matching becomes ID-aware.

Migration order: identity `20261029200856`, then catalog `20261029201131`.
Backfill may advance updated_at triggers but never changes performed_at/date,
authored exercise text, loads, reps or notes. Review `exercise_legacy_mapping_report()`
before/after rollout; ambiguous rows need explicit user/curator confirmation.

`npm run test:social-training` executes actual two-user RLS/username tests on PGlite.
`node scripts/sync-social-schema.js --check` checks migration/fresh-schema parity.
Apply only approved targeted migrations in timestamp order before deploying code.
Never run a broad production `db push`; the historical ledger has gaps.
Forward fixes should preserve authored names and private workout policies.
Physical iPhone acceptance and production rollout remain separate authorization.
