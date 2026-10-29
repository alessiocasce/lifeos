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

`npm run test:social-training` executes actual two-user RLS/username tests on PGlite.
`node scripts/sync-social-schema.js --check` checks migration/fresh-schema parity.
Apply only approved targeted migrations in timestamp order before deploying code.
Never run a broad production `db push`; the historical ledger has gaps.
Forward fixes should preserve authored names and private workout policies.
Physical iPhone acceptance and production rollout remain separate authorization.
