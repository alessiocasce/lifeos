# Companion vNext Slice 2.5 and 3 Progress

## Security checkpoint: Slice 2.5

- OAuth authorization codes now redeem through a durable, service-role-only PostgreSQL table with a unique SHA-256 hash of the signed code JTI. No raw code, verifier, or token is stored.
- Client, redirect, PKCE, scope, issuer, audience, and write configuration are checked before redemption. A duplicate redemption returns `invalid_grant`; a database failure fails closed.
- The code redemption table is additive and is applied in production. The checked-in fresh schema has the same table, grants, index, and RLS setting.
- Local PGlite tests cover read and read/write grants, invalid attempts not consuming codes, replay, concurrent exchange, table privacy, and schema privileges. Production connector re-link and concurrent Vercel-instance smoke still require manual QA after migration/deploy.

## Slice 3

Implementation and the full local validation gate are complete. Both migrations were applied to production before the respective backend commits were pushed to `main`. Vercel deployment and physical behavior still need verification.

- Schema/domain: additive `20260925215527_companion_autobiographical_memory.sql` evolves `ai_memories` without deleting legacy rows. The filename matches production's recorded migration version `20260925215527`; only the filename changed, not SQL or production schema. Typed kinds, subject/project grounding, occurred/effective time, provenance, dedupe identity, supersession, indexes, RLS, and service-role-only curation RPC are present in migration and fresh schema.
- Curator: `brainAutobiographicalMemory.js` validates bounded candidates and evidence, rejects secrets/routine noise, grounds projects, atomically reconfirms or supersedes, and blocks inferred replacement of explicit facts. A → B → A explicit reversal retains history. `brain.js` explicit remember and post-answer extraction use it.
- Retrieval/context: bounded topical memory search, capped broad true recall, current-belief precedence, hypothesis-labeled insights, compact Context Compiler autobiography section.
- MCP: `sync_context` has one narrow `autobiographical_memory` update family under `lifeos.write`; `search_memory` is bounded/read-only under `lifeos.read`, with optional historical rows. The existing request audit and idempotency mechanism remain in use; operational tables are not written.
- Focused PGlite tests added in `test:memory`, `test:mcp-write`, and `test:schema`. The full `npm test` suite, `check:functions`, production build, syntax checks, and diff checks pass locally.
- Production verification after applying Slice 3 found all 11 new columns, seven constraints, five indexes, service-role-only curator execution, and all 13 pre-existing memory rows. Live Brain/MCP/WhatsApp journeys remain a separate QA gate.

## Live QA on 2026-09-26

- GitHub's Vercel status is successful for `81c592b` and the migration-identity commit `dbf6d39`. The deployed MCP read smoke passes, `search_memory` is listed and callable, the shared context contains autobiography, and a read token is denied `sync_context`.
- App Brain explicit remember succeeded; repeating the exact preference reconfirmed one row. Topical recall answered from memory. A dated statement stored the correct Rome previous date with no invented exact time, but was classified `semantic_fact` rather than `episode`.
- The user's physical WhatsApp test reached the backend, saved an assistant reply, and the user confirmed receipt on the phone. A near-identical cross-channel preference differing only by punctuation created a second active row instead of reconfirming the app row. The app recall question also created an unintended `user_explicit` memory. These are open Slice 3 defects, not passing journeys.
- OAuth live smoke reached the authorize page, but the locally configured link secret was rejected with HTTP 401; code exchange/replay remains unverified. No write OAuth token was available for a live `sync_context` test. Production has no project rows, so positive project grounding was not testable. A `Thanks` noise check hit a temporary Gemini 503, so noise rejection remains unverified live. No test memories were deleted.
- Production migration history contains only `20260925215527`. The Slice 3 filename now matches, but earlier repository migration versions remain absent from the ledger; a future CLI `db push` needs a separate full-history audit before it is safe.
