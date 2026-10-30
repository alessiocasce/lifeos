# Exercise Catalog Revision — 2026-10-30

## Identity / Selection

The catalog contains 224 immutable identities: 79 active, 145 inactive. Original
217 UUID/slug pairs are unchanged; seven new slugs are deterministic. Counts:
Chest 20, Back 15, Shoulders 11, Biceps 10, Triceps 8, Quadriceps 8, Hamstrings 4,
Glutes 0, Calves 1, Core 1, Full Body 1.

Approved active lists, renames and owner corrections live in
`src/data/exerciseCatalogRevision.js`; the original curated rows remain intact.
JSON is generated, never hand-edited. Existing load/eligibility conventions remain;
new generic/machine/boxing identities are not leaderboard eligible. Generic Leg
Press retains the 45-degree UUID; EZ curl/skull-crusher IDs retain EZ equipment.
Boxing/unspecified calves use no required external load; an empty load logs zero.
The existing reps/set model is retained, not repurposed into duration tracking.

Resolution: explicit IDs always win, including inactive historical IDs. Exact
active bilingual canonical names then take precedence over aliases; other aliases
must identify exactly one ID across the catalog. SQL and JavaScript are tested for
parity. Bench Press/Lateral Raises remain ambiguous. Owner decisions such as
Panca Piana or Incline Bench Press are NOT global aliases. Explicit null IDs remain
private legacy/custom identities; they are not silently inferred through a name.

## Historical Correction / Rollout

The admin-only invoker operation is `apply_owner_exercise_revision_v2(uuid)`.
PUBLIC, anon, authenticated and service_role cannot execute it. The configured
owner is verified against Auth outside Git; no private user UUID is checked in.
The forward migration invokes it only if the transaction-scoped
`lifeos.exercise_revision_owner` setting is supplied. Fresh installs have no owner
data and install only the catalog/operation. There are 27 approved set mappings
plus two separately confirmed template mappings (Single Pushdown and Single Tricep
Overhead). Existing unrelated canonical IDs are never overwritten; conflicts,
unknown names or duplicate resulting set numbers abort instead of guessing.

The operation locks the three affected workout tables for its short transaction,
temporarily disables only their set_updated_at triggers, performs owner-only text/
ID corrections, then restores each original trigger mode. Exceptions roll back
DDL and data together. All row IDs, timestamps, weights/reps/RPE, notes, warmups,
set numbers, ownership and snapshot order/extra fields remain unchanged. No rest
preference, timer/outbox row or private policy is changed. A second run is a no-op.

The live baseline distinguishes 426 configured-owner sets from 16 sets belonging
to another account (442 total). Only the owner's 426 are authorized for correction.
Do not claim 442 owner records or broaden the scope to inflate coverage.

`scripts/prepare-exercise-revision-rollout.js` requires explicit backup opt-in,
verifies the configured owner/project, captures a user-restricted logical backup
outside Git, verifies its checksum and replays actual owner rows in isolated
PGlite twice. Managed Supabase PITR status is not exposed by connected tooling;
the verified scoped backup plus transactional rollback is the available recovery
path. Production files/records must never be committed or echoed into logs.

Apply only the new forward migration, after tests/rehearsal and production scope
authorization. Do not replay V1 or broadly db push. Reconcile any connector-assigned
version. Seal applied catalog SQL hashes in `supabase/catalog-migrations.json`;
the generator refuses to rewrite sealed migrations. The old global backfill
operation is guarded against execution because new picker names are not evidence
for another user's historical equipment. Schema generation includes both revisions.
Prefer a forward fix; do not delete canonical IDs or rewrite other users' history.

## Picker / QA

Production applied version: `20261030105557_exercise_catalog_revision.sql`.
Verified 224 catalog rows (79 active), 426/426 owner sets and 16/16 template
exercises mapped, with zero owner set text/ID mismatches. Exact aggregate hashes
prove all non-exercise fields/timestamps, other-user records, rest preferences/
outbox and private policies survived unchanged. All timestamp triggers are enabled.
Rollback-only production authenticated A/B and anonymous security QA passed;
the correction function is not executable by authenticated clients. No historical
migrations were replayed. Physical iPhone and WhatsApp acceptance remains manual.

Exercise opens an accessible modal: full-width bottom sheet on mobile, centered
dialog from tablet upward. Search/filter chrome and Other action stay fixed while
rows scroll. Recent entries retain IDs and cannot resurrect inactive identities.
Tentative search is local to the dialog; Cancel/Escape leaves the current workout
draft unchanged. Only explicit selection commits canonical English text + UUID,
or private authored text + null UUID. Keyboard arrows/Enter/Escape, focus return,
bilingual search and safe areas are covered. History still renders inactive IDs.

Run `test:social-training` (catalog + all owner mappings + real PostgreSQL RLS),
`test:workout`, `test:workout:rest`, focused exercise-picker/social-training/Training
browser specs, generator/schema checks, syntax/diff checks and one production build.
Picker visual QA uses 390x844, 768x1024, 1024x768 and 1440x900; do not run the entire
UI matrix. Real iPhone keyboard/safe-area ergonomics and physical rest alerts
remain owner acceptance, not simulated-browser proof.
