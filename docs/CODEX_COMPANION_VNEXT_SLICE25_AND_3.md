# Codex Execution Prompt — LifeOS Companion vNext, Slice 2.5 + Slice 3

You are working in the existing repository alessiocasce/lifeos.

This is one continuous execution run with two strictly ordered milestones:

1. Slice 2.5 — OAuth authorization-code replay hardening
2. Slice 3 — Deep autobiographical memory v1

You MUST finish and verify Slice 2.5 before beginning Slice 3.

Do not rebuild LifeOS from scratch. Preserve all correct Slice 1 and Slice 2 behavior.

## Read first

Before changing code, inspect current main and read:

- PROJECT_CONTEXT.md
- docs/LIFEOS_COMPANION_VNEXT.md
- docs/CODEX_COMPANION_VNEXT_SECOND_SLICE.md
- docs/CODEX_COMPANION_VNEXT_SLICE2_PROGRESS.md
- docs/BRAIN_ARCHITECTURE.md
- docs/MCP.md
- docs/RELIABILITY_RELEASE.md
- docs/QA_DEPLOYMENT.md
- api/mcp.js
- api/_utils/mcpOAuth.js
- api/_utils/brainExternalSync.js
- api/_utils/brainBeliefs.js
- api/_utils/brain.js
- api/_utils/brainVault.js
- api/_utils/lifeosContextCompiler.js
- api/_utils/mcpLifeosData.js
- api/ai/chat.js
- current Supabase schema/migrations
- current MCP, Companion, Brain, schema and reliability tests

The code is the source of truth for what exists. LIFEOS_COMPANION_VNEXT.md is the product north star.

# Global constraints

- No arbitrary CRUD or SQL through MCP.
- No raw chain-of-thought persistence.
- No full transcript dump as memory.
- No silent destructive/consequential external actions.
- No new required recurring paid service.
- Keep provider/model boundaries replaceable.
- Current world truth belongs in brain_beliefs.
- Historical/autobiographical memory must not override newer current beliefs.
- Existing WhatsApp, BrainTurn, interaction ownership, outbox and action-safety guarantees remain authoritative.
- Existing lifeos.read credentials remain read-only.
- Existing sync_context side-effect isolation remains intact.
- Do not silently mutate production through Supabase.

# PART I — Slice 2.5: OAuth single-use authorization codes

## Problem

The current MCP authorization code is a signed stateless token with a five-minute TTL. The same valid code can be exchanged more than once during that period if the caller still has the matching PKCE verifier.

Now that OAuth can grant lifeos.write, authorization codes must be single-use.

## Required behavior

authorize
→ signed code with unique jti
→ token endpoint validates signature, expiry, client, redirect, PKCE, scopes, write configuration and audience
→ atomically consume jti in durable shared storage
→ issue access token only for the first successful redemption

Second redemption of the same code:
→ invalid_grant

This must hold across concurrent serverless instances.

## Durable replay protection

Do not use process memory.

Use Supabase/Postgres or another existing shared durable primitive. Store only what is needed for replay prevention, for example a code jti/hash, expiry and timestamps.

Never persist:
- raw authorization code
- PKCE verifier
- access token
- link secret
- auth headers

Consumption must be atomic through a uniqueness constraint, narrow RPC, or equivalent database guarantee.

Do not use a race-prone SELECT-then-UPDATE flow.

## Do not consume invalid requests

Validate first:
1. grant type
2. signed code and expiry
3. client id
4. redirect URI
5. PKCE
6. allowed scopes
7. write OAuth configuration
8. audience/resource

Only then atomically consume the code immediately before access-token issuance.

If durable consumption fails, fail closed and issue no token.

## Required Slice 2.5 tests

- read-only code redeems exactly once
- read+write code redeems exactly once
- sequential replay returns invalid_grant
- concurrent replay: exactly one succeeds
- wrong PKCE does not consume the code
- wrong client/redirect does not consume the code
- lifeos.read still cannot call sync_context
- lifeos.write still can
- static read token remains read-only
- static write token behavior remains unchanged
- replay store contains no secret material

## Security gate

Before any Slice 3 work begins:
- OAuth/MCP tests green
- schema tests green
- concurrent replay test green
- Slice 2 read/write separation tests green
- checkpoint and commit OAuth hardening separately

If the gate is not green, DO NOT start Slice 3.

# PART II — Slice 3: Deep autobiographical memory v1

## Product goal

LifeOS should remember the user's life as a changing story rather than a flat list of memory strings.

Target architecture:

CURRENT TRUTH
brain_beliefs

+

DURABLE AUTOBIOGRAPHICAL MEMORY
goals, constraints, durable facts, preferences, decisions

+

EPISODIC MEMORY
important events, transitions, outcomes

+

PROJECT MEMORY
requirements, decisions, milestones, blockers, history

+

INSIGHTS
derived hypotheses with evidence/confidence

+

BRAIN VAULT
long-form reports and analyses

→ bounded retrieval and curation
→ same Brain across app, WhatsApp, MCP and future voice

Do not import the user's entire ChatGPT history in this slice.

## Storage responsibilities

### brain_beliefs
Authoritative current world state. Temporal and supersedable.

### ai_memories
Evolve/reuse as curated durable autobiographical memory. Do not create a second generic memory database unless inspection proves it is necessary.

### ai_insights
Keep separate as hypotheses/derived observations. Insights are not facts.

### Brain Vault
Keep for long-form documents/reports. Do not put every small memory into Vault.

## Evolve ai_memories safely

Use the smallest backward-compatible schema extension needed for concepts like:
- memory kind
- category/domain
- title/content
- subject identity where useful
- grounded project_id where applicable
- occurred/effective time
- provenance/source
- confidence
- importance
- last seen/confirmed
- active/archive/superseded lifecycle
- dedupe/idempotency identity where needed

Do not hide all important semantics inside unvalidated metadata.

Preserve existing rows.

## Supported memory kinds

Use a small explicit v1 set, such as:
- semantic_fact
- episode
- decision
- project_memory
- goal
- constraint

Names may be adapted to the existing codebase.

## Temporal truth

Historical memory is not current truth.

Example:
August: skincare active.
September: stopped skincare.

The historical episode may remain useful, but the current answer to whether skincare is active must come from the current belief.

Current user statement > older memory.
Current belief > conflicting historical memory for current-state questions.

## Project memories

Ground project memories to an existing user-scoped LifeOS project.

Unknown or ambiguous project references must not create projects or guess.

Store meaningful context such as:
- decisions
- client/user requirements
- milestone events
- blockers
- meaningful outcomes
- architecture choices

Do not duplicate routine project-session/progress data.

## Curator v2

Refactor/evolve the current extractAndPersistBrainKnowledge seam into a curator.

The model may propose candidates.
Deterministic backend logic validates and persists them.

The curator should:
1. inspect current user message, grounded result and bounded relevant context
2. extract only high-value durable candidates
3. classify kind/category
4. ground projects when needed
5. compare against current beliefs and relevant memories
6. merge, reconfirm, supersede or mark stale as appropriate
7. preserve provenance
8. reject noise

Do not store:
- greetings
- jokes with no durable meaning
- thanks
- daily habit completion
- individual workout sets
- every expense
- raw tool output
- temporary troubleshooting details
- credentials/tokens/passwords
- assistant speculation as user fact
- raw chain-of-thought
- whole conversations verbatim

## Contradictions and supersession

Do not leave conflicting durable facts as equally current.

Explicit contradiction should trigger deterministic supersession/archive/review behavior.

Low-confidence inference must not silently destroy a high-confidence explicit memory.

When the same fact is encountered again, reconfirm/update freshness instead of creating endless duplicates.

## Episodic time

Episodes should carry occurred_at/effective time when known.

If user says something happened yesterday/last week, do not replace that with the message timestamp.

Represent uncertainty honestly when exact time is unknown.

## Provenance

Keep bounded cross-channel provenance, e.g. source system/channel/reference/captured_at.

Do not store provider secrets or giant payloads.

## Extend sync_context

After Slice 2.5 is green, extend the existing sync_context tool with one narrow autobiographical-memory semantic family.

It may support:
- semantic_fact
- episode
- decision
- project_memory
- goal
- constraint

Requirements:
- same lifeos.write scope
- same request audit/idempotency
- project grounding where applicable
- bounded evidence/provenance
- exact replay safe
- no transcript ingestion
- no arbitrary metadata blob
- no operational side effects
- no second generic CRUD tool

## Retrieval v1

Build bounded autobiographical retrieval.

Relevant Brain context should combine:
1. current beliefs
2. relevant durable memories
3. relevant episodes/project memories
4. relevant insights marked as hypotheses
5. Vault only when long-form context is useful

Do not inject the entire memory database.

Ranking may consider:
- project/subject match
- lexical relevance
- recency
- importance
- confidence
- memory kind
- freshness
- current/historical status

If embeddings help and existing infrastructure supports them, they may be optional. Do not add a new paid embedding dependency. A lexical/structured fallback must work.

Set explicit limits on result count and serialized context size.

## Shared Context Compiler

Add a compact autobiographical section to the existing Context Compiler.

Include useful bounded concepts like:
- active goals/constraints
- current preferences/beliefs
- recent important episodes
- project-memory highlights
- stale/needs-review signals

Do not dump all memories.

## MCP read surface

Add a bounded read-only memory tool, e.g. search_memory, requiring lifeos.read.

It should:
- accept query and bounded limit
- optionally filter kind/project
- return sanitized concise results
- distinguish current beliefs from historical memories
- not expose unlimited history

Keep all existing MCP tools backward compatible.

## Same Brain everywhere

The same memory system must serve:
- app Brain
- WhatsApp Brain
- MCP
- future voice

Do not create channel-specific memory silos.

Memory context must never itself authorize an operational write.

## Staleness v1

Represent/detect minimal stale states such as:
- fresh
- stale
- historical
- needs_review

Do not proactively nag from this mechanism yet. Future Attention Engine owns interruption decisions.

## Privacy

At minimum:
- reject obvious credentials/secrets
- no transcript dumps
- no inferred sensitive traits from weak evidence
- no inferred medical diagnoses as facts
- bounded provenance
- user-scoped RLS

A large memory-management UI is out of scope.

# Required Slice 3 journeys

A. Durable fact:
Create one explicit durable fact; repeated mention reconfirms instead of duplicating.

B. Episode with time:
Store an event with honest occurred time when user says yesterday/last week.

C. Project decision:
Ground to existing project; later relevant retrieval returns it; operational project rows unchanged.

D. Current truth beats history:
Historical memory says X, current belief says Y; current context prefers Y.

E. Explicit contradiction:
New explicit durable fact safely supersedes/archives/reviews old one.

F. Low-confidence inference:
Must not destroy a high-confidence explicit memory.

G. Noise rejection:
"thanks", "lol", "done", "I took creatine" do not create autobiography spam.

H. ChatGPT explicit sync:
sync_context can write an allowed autobiographical-memory item with lifeos.write, audit and idempotency.

I. Retrieval:
Relevant memories rank above unrelated high-importance memories; output is bounded.

J. Cross-channel:
Memory created from app/WhatsApp can be read through shared Brain/MCP services.

K. Secrets:
Credential-like content is not persisted.

L. Compatibility:
Existing ai_memories rows remain readable; remember/forget flows still work; Vault works; Slice 1 and Slice 2 tests remain green.

# Schema/migrations

Use additive backward-compatible migrations.

Do not rewrite/delete existing memory rows unnecessarily.

New tables/functions must:
- use RLS
- be user-scoped
- expose only necessary grants
- use service-role mutation boundaries where appropriate
- include retrieval indexes
- have schema tests

Document exact migration order after:
1. Slice 1 beliefs migration
2. Slice 2 external sync migration
3. OAuth replay/memory migration(s)

Do not apply production migrations unless explicitly instructed.

# Connected tools

Use @GitHub, @Supabase and @LifeOS where useful.

@GitHub:
- repo is authoritative
- preserve unrelated work
- use coherent checkpoint commits

@Supabase:
- inspect live state/security if useful
- do not silently deploy migrations
- report pre-existing warnings separately

@LifeOS:
- use live read behavior to verify compatibility if available
- do not claim new features are live until deployed/re-linked

# Interruption protocol

Maintain:
docs/CODEX_COMPANION_VNEXT_SLICE3_PROGRESS.md

It must separately track Slice 2.5 and Slice 3.

Checkpoint approximately:
1. OAuth replay migration/service/tests
2. memory schema/domain model
3. curator/supersession
4. retrieval/context
5. MCP memory sync/read surface
6. full regressions/docs

If usage/context runs low, stop at a green coherent checkpoint and update the progress file.

# Verification

Run focused suites throughout.

Before final completion run at minimum:

npm run test:mcp
npm run test:mcp-write
npm run test:companion
npm run test:schema
npm run test:brain
npm run test:reliability
npm run test:bridge
npm run test:workout
npm test
npm run check:functions
npm run build
git diff --check

Add focused OAuth/memory tests to npm test where appropriate.

Do not weaken existing tests.

# Definition of Done

Slice 2.5 is complete when:
An MCP OAuth authorization code can issue an access token exactly once across concurrent serverless instances; invalid token requests do not consume it; replay returns invalid_grant; existing read/write scope separation remains unchanged; no raw code/verifier/token secrets are persisted.

Slice 3 is complete when:
LifeOS maintains bounded autobiographical memory that distinguishes current world truth, durable facts, historical episodes, project history and inferred insights; meaningful memories are curated with provenance and temporal context; duplicates are reconfirmed/merged; contradictions are handled safely; relevant memories are retrieved instead of dumped; the same memory serves app/WhatsApp/MCP; and explicit ChatGPT sync can add supported autobiographical memories without gaining operational side effects.

Also:
- old memory rows remain compatible
- current beliefs beat historical memory for current-state questions
- project memories are grounded
- memory cannot authorize operational writes
- full transcript dumping is impossible through normal contracts
- no new required paid service
- all existing Slice 1/Slice 2 behavior remains green

# Out of scope

Do not implement:
- full ChatGPT history backfill/import
- ambient automatic ChatGPT sync
- Attention Engine
- self-created monitors
- WhatsApp images/voice notes
- realtime voice
- outbound calls
- desktop sensors/Focus
- large memory-management UI
- autonomous consequential actions

# Final report

Report:
- Slice 2.5 replay architecture/guarantee
- Slice 3 memory architecture
- schema/migrations
- curator behavior
- retrieval/context limits
- MCP changes
- deployment order
- connector re-link requirements
- tests/build
- live QA actually performed vs still required
- known limitations
- recommended Slice 4

Do not stop after producing a plan.
Do not start Slice 3 before the security gate is green.
Finish both slices end-to-end if usage permits.
