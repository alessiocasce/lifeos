# Social Training Foundation Deployment — 2026-10-29

## Baseline / Scope

Remote main and Vercel Production started at `8b46e43`. The three foundation commits
are `e394a59`, `4100e06`, `13af6c2`; final audit/QA commit is `2ce5468`.
Unrelated OAuth changes in QA_DEPLOYMENT and smoke-mcp-oauth are excluded.
No Community feed/ranking or broader owner-only backend access is included.

## Production Database

Project `wrqscqhclepwxxkazbnc`; only these migrations were applied using targeted
Supabase apply_migration calls, in order:
- `20261029211252_social_training_identity.sql`
- `20261029211303_social_training_catalog.sql`

Checked-in filenames and generator/test/docs references match the assigned ledger.
No historical ledger repair, broad db push or full schema rerun was performed.
Catalog has 217 stable IDs and 454 alias/ID pairs. UUID/slug digest matches the
bundled catalog: `6b94a77132026089fc3960c80530be38`.

Before/after counts: 43 workouts, 442 sets, 5 templates, 16 template exercises.
Content digests match after excluding newly added IDs and updated_at timestamps;
snapshot digests strip only added exercise IDs. Authored names, loads/reps/RPE,
notes, dates, ownership and snapshot structure are unchanged. Rest preferences
and all 24 pre-existing private policies also have identical digests.

Mapping matches the reviewed dry run: 131/442 sets (29.64%), 6/16 template rows
(37.50%), 24/61 snapshot entries (39.34%). Seven distinct names resolve safely;
27 names stay unmatched and two have explicit ambiguous aliases. Potential matches
are documented in the ignored local audit, not forced into historical records.

Rollback-only production verification used actual authenticated/anon database
roles with two temporary auth identities. It exercised settings RPCs, bilingual
canonical/custom set inserts, private-table isolation, denied cross-user updates,
case-insensitive username uniqueness and denied anonymous/catalog writes. All
fixtures were rolled back; zero QA profiles/workouts remain. This is database
authorization verification, not two real browser sign-ins.

Physical table RLS, grants, profile column whitelist, default sharing OFF, fixed
function search paths and nullable catalog FKs were inspected. The internal rest
scheduling function remains unavailable to ordinary authenticated callers.
Security advisors report no new-table/function findings. Existing warnings remain:
mutable search_path on set_updated_at and two Vault match helpers; Auth leaked-
password protection disabled; seven server-only RLS tables have no client policies.
No unrelated policies or settings were changed.

## Application QA / Rollout

Local: ten focused mobile browser tests, Workout render/storage tests, actual
PGlite migrations/RLS, template/snapshot preservation, cross-language/alias search,
draft/account isolation and durable rest tests passed. Build and generator parity
checks passed; seven serverless routes remain. Visual QA covered 390x844 English/
Italian Settings, cross-language catalog, custom entry, Live and History.
Only the existing large-bundle build warning remains.

Push after database verification; use the automatic GitHub/Vercel integration.
Verify the final Git SHA, Production READY status, alias and served asset hash.
The task's deployment report records the actual resulting deployment and any live
UI checks; local fixture browser tests must never be described as live user QA.
Bridge code is unchanged and does not require a ritual PM2 restart.

Owner acceptance: physical iPhone language/catalog use, historical prefills, lock/
background resume and real WhatsApp rest delivery/cancellation. A real second-
account login remains necessary if no legitimate second browser session is available.
Prefer forward fixes/code rollback; do not destructively unmap historical IDs or
drop privacy policies. New migrations are additive and old text remains available.
