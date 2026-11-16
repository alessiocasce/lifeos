# Supabase

- `schema.sql` — source of truth for the full database schema. Do not change unless necessary; if you do, report what changed, whether the schema must be rerun, and migration risks.
- `migrations/` — forward-only, timestamped migrations. Never broad-replay them and never run a blanket `supabase db push`; apply only the targeted migration a release names. Filenames match the versions recorded in production.
- `catalog-migrations.json` — seals the applied exercise-catalog SQL (hashes). Generate only forward revisions.
- `releases/` — one-off release bundles (for example `reliability.sql`) applied manually with the steps in the matching `docs/` checklist.
- `operations/` — verification and one-off operational SQL (rollout checks, legacy mapping). Run by hand only; never part of normal deploys.
