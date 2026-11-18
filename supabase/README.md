# Supabase

- `schema.sql` — baseline/feature schema reference; reviewed forward migrations also define newer features, including `20261109033543_workout_web_push.sql`. The baseline file alone is not a claim that a fresh database has every current object. Do not change unless necessary; if you do, report what changed, whether the schema must be rerun, and migration risks.
- `migrations/` — forward-only, timestamped migrations. Never broad-replay them and never run a blanket `supabase db push`; apply only the targeted migration a release names. Filenames match the versions recorded in production.
- `catalog-migrations.json` — seals the applied exercise-catalog SQL (hashes). Generate only forward revisions.
- `releases/` — one-off release bundles (for example `reliability.sql`) applied manually with the steps in the matching `docs/` checklist.
- `operations/` — verification and one-off operational SQL (rollout checks, legacy mapping). Run by hand only; never part of normal deploys.
