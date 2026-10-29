# Social Training Foundation

Foundation implementation and focused QA are complete. Production rollout was
authorized on 2026-10-29; verify the deployment record and migration ledger rather
than assuming that local migration filenames have already been applied.

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

Migration order: identity `20261029211252`, then catalog `20261029211303`.
Backfill may advance updated_at triggers but never changes performed_at/date,
authored exercise text, loads, reps or notes. Review `exercise_legacy_mapping_report()`
before/after rollout; ambiguous rows need explicit user/curator confirmation.

`npm run test:social-training` executes actual two-user RLS/username tests on PGlite.
`node scripts/sync-social-schema.js --check` checks migration/fresh-schema parity.
Apply only approved targeted migrations in timestamp order before deploying code.
Never run a broad production `db push`; the historical ledger has gaps.
Forward fixes should preserve authored names and private workout policies.
Physical iPhone acceptance remains owner QA. The authorized production schema
rollout passed; see `SOCIAL_TRAINING_DEPLOYMENT.md` for verification boundaries.

## English / Italian Interface

`src/i18n/index.js` owns the runtime language store, interpolation and Rome-aware
date formatting. English source keys and the generated Italian dictionary cover
navigation, Settings, Training/History/templates/rest controls, Home, Health,
Calendar, Memos, Projects, Finances, Companion chrome and authentication screens.
Record names, notes, chat responses and other authored content are not translated.
Canonical exercise labels change language without rewriting stored exercise text
or IDs; explicit custom exercises retain their authored labels.

Settings saves language immediately, independently of profile completion. The
private per-user preference wins after login; guest language selection is temporary.
Requests capture and validate an auth token and expected identity, then bind that
token to the database request to prevent a stale form writing into another account.
Result revisions separately fence stale UI responses. Language changes do not
remount Training or replace the existing persisted draft/active-session contract.

Translation source: `src/i18n/italian-source.js`; regenerate with
`node scripts/generate-italian.js`, verify with `--check`. Catalog generation and
translation updates require review: no automatic translation of private records.

## Focused QA / Rollout

- Run `npm run test:social-training` for actual PGlite migrations, two-user RLS,
  canonical backfill, timer numbering, locale/custom labels and account-token fencing.
- Run `tests/ui/social-training.spec.js`; retain targeted Training History,
  keyboard picker, prefill/rest and session-switching regressions.
- Run `npm run test:workout`, `npm run test:workout:rest`, `npm run build`, generator
  parity checks and `git diff --check`. Do not substitute the full UI suite.
- Mobile acceptance: switch English/Italian and back, reload/sign in as a different
  user, preserve an unsaved set through Settings, use Other, inspect History and
  verify warmup/working prefills and RPE/notes reset. Physical iPhone remains required.

Approved rollout sequence (also the order for any future authorized rollout):
1. Snapshot/review current schema and legacy mapping inventory read-only.
2. Apply only `20261029211252_social_training_identity.sql`, then
   `20261029211303_social_training_catalog.sql` through targeted migration execution.
   Do not replay historical migrations. If tooling assigns another version, align
   checked-in identity with the applied ledger before any future CLI push.
3. Verify physical objects, grants/RLS, catalog count, nullable FKs, mapping report,
   untouched authored values and existing timer triggers. Review ambiguous/unmapped
   names; do not infer their equipment or automatically force a canonical ID.
4. Only then push authorized code and verify automatic Vercel production deployment,
   two-account privacy, language persistence, Training and owner rest-timer QA.

The migrations are additive. Prefer code rollback/forward fixes over dropping IDs,
catalogs or private policies. Sharing preferences do not authorize public workout
reads. Phase 2 needs an explicit completed-workout public projection, per-workout
sharing decisions and full-history server queries, not relaxed private-table RLS.
Known limits: 25-session client history, a bundled catalog mirror, no feed/ranking,
no new-member WhatsApp recipient provisioning and no physical-device verification.

## Final Mapping Audit

`scripts/audit-legacy-exercise-mapping.js <aggregated-inventory.json>` groups
distinct names by descending set/template/snapshot usage and compares the original
catalog against current aliases. Outputs under ignored `test-results/` contain
the private inventory; no raw workout history is committed. The script checks all
217 original slug/UUID pairs. Explicit-equipment aliases were added for Panca Piana
Manubri, DB Incline Press, Incline Dumbell Press, Panca Inclinata Manubri and
Dumbell Romanian Deadlift. No existing canonical IDs changed.

The audited legacy set coverage remains 131/442 (29.64%): the remaining names lack
equipment, grip, support or movement information. Never turn Incline Bench Press
into a barbell movement or Pectoral Machine into a fly by guessing. The additional
aliases improve future selection but do not increase this historical coverage.
Recent suggestions deduplicate canonical IDs across old spellings.

`supabase/operations/verify_social_training.sql` creates rollback-only identities
and fixtures, switches to authenticated/anonymous roles, checks RLS/grants and
username uniqueness, then rolls back. It is also exercised on local PGlite. This
proves database authorization, not a real second-account browser login or phone QA.
