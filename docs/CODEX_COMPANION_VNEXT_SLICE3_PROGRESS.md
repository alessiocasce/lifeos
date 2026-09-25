# Companion vNext Slice 2.5 and 3 Progress

## Security checkpoint: Slice 2.5

- OAuth authorization codes now redeem through a durable, service-role-only PostgreSQL table with a unique SHA-256 hash of the signed code JTI. No raw code, verifier, or token is stored.
- Client, redirect, PKCE, scope, issuer, audience, and write configuration are checked before redemption. A duplicate redemption returns `invalid_grant`; a database failure fails closed.
- The code redemption table is additive. Apply `supabase/migrations/20260925130000_mcp_oauth_code_redemptions.sql` before deploying the API change. The checked-in fresh schema has the same table, grants, index, and RLS setting.
- Local PGlite tests cover read and read/write grants, invalid attempts not consuming codes, replay, concurrent exchange, table privacy, and schema privileges. Production connector re-link and concurrent Vercel-instance smoke still require manual QA after migration/deploy.

## Slice 3

Implementation and the full local validation gate are complete. Neither migration nor this code has been deployed to production.

- Schema/domain: additive `20260925140000_companion_autobiographical_memory.sql` evolves `ai_memories` without deleting legacy rows. Typed kinds, subject/project grounding, occurred/effective time, provenance, dedupe identity, supersession, indexes, RLS, and service-role-only curation RPC are present in migration and fresh schema.
- Curator: `brainAutobiographicalMemory.js` validates bounded candidates and evidence, rejects secrets/routine noise, grounds projects, atomically reconfirms or supersedes, and blocks inferred replacement of explicit facts. A → B → A explicit reversal retains history. `brain.js` explicit remember and post-answer extraction use it.
- Retrieval/context: bounded topical memory search, capped broad true recall, current-belief precedence, hypothesis-labeled insights, compact Context Compiler autobiography section.
- MCP: `sync_context` has one narrow `autobiographical_memory` update family under `lifeos.write`; `search_memory` is bounded/read-only under `lifeos.read`, with optional historical rows. The existing request audit and idempotency mechanism remain in use; operational tables are not written.
- Focused PGlite tests added in `test:memory`, `test:mcp-write`, and `test:schema`. The full `npm test` suite, `check:functions`, production build, syntax checks, and diff checks pass locally. Physical connector, Gemini, and WhatsApp behavior still require manual QA after ordered migration and deployment.
- Neither new migration was applied to production by this session. The OAuth redemption table was confirmed absent by a read-only query. Pushing `dd83153` to `main` before the OAuth migration could break connector linking, so the push requested by the user remains held pending migration authorization/order.
