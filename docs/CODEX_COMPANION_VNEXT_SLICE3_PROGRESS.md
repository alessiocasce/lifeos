# Companion vNext Slice 2.5 and 3 Progress

## Security checkpoint: Slice 2.5

- OAuth authorization codes now redeem through a durable, service-role-only PostgreSQL table with a unique SHA-256 hash of the signed code JTI. No raw code, verifier, or token is stored.
- Client, redirect, PKCE, scope, issuer, audience, and write configuration are checked before redemption. A duplicate redemption returns `invalid_grant`; a database failure fails closed.
- The code redemption table is additive. Apply `supabase/migrations/20260925130000_mcp_oauth_code_redemptions.sql` before deploying the API change. The checked-in fresh schema has the same table, grants, index, and RLS setting.
- Local PGlite tests cover read and read/write grants, invalid attempts not consuming codes, replay, concurrent exchange, table privacy, and schema privileges. Production connector re-link and concurrent Vercel-instance smoke still require manual QA after migration/deploy.

## Slice 3

Not started. Per the execution brief, begin only after the Slice 2.5 checkpoint is green and committed.
