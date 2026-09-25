# Codex Execution Prompt — LifeOS Companion vNext, Slice 2
## Explicit Semantic MCP Sync: ChatGPT → LifeOS

You are working in the existing repository `alessiocasce/lifeos`.

Do **not** restart or redesign LifeOS. Slice 1 is implemented and is the foundation for this task.

Your job is to implement the **second Companion vNext vertical slice**:

> A safe, explicit, authenticated semantic write path from MCP clients such as ChatGPT into the LifeOS world model — without exposing arbitrary CRUD, without weakening the existing read-only MCP guarantees, and without creating external side effects.

The end state should make this kind of interaction real:

```text
User in ChatGPT:
"Sync the important changes from this conversation to LifeOS."

ChatGPT identifies a few durable/current changes:
- skincare is inactive;
- concise/casual communication is preferred;
- Hair Style is still active but temporarily lower priority.

ChatGPT calls LifeOS MCP
        ↓
LifeOS validates scopes + semantic schema + grounding + provenance
        ↓
LifeOS applies only supported low-risk world-model updates
        ↓
LifeOS records an auditable sync result
        ↓
ChatGPT receives exactly what changed
```

This slice is **Mode 1 explicit sync only**.

Do not implement ambient/background synchronization, autonomous monitor creation, arbitrary memory ingestion, calendar actions, WhatsApp sends, or external side effects.

---

# Read these files first

Before changing code, inspect the current repository and read these in full:

1. `PROJECT_CONTEXT.md`
2. `docs/LIFEOS_COMPANION_VNEXT.md`
3. `docs/CODEX_COMPANION_VNEXT_FIRST_SLICE.md`
4. `docs/CODEX_COMPANION_VNEXT_PROGRESS.md`
5. `docs/BRAIN_ARCHITECTURE.md`
6. `docs/MCP.md`
7. `docs/RELIABILITY_RELEASE.md`
8. `api/mcp.js`
9. `api/_utils/mcpOAuth.js`
10. `api/_utils/mcpLifeosData.js`
11. `api/_utils/brainBeliefs.js`
12. `api/_utils/brainRoutineSemantics.js`
13. `api/_utils/brainCompanionTurn.js`
14. relevant project/context/database code and the current MCP/Companion tests;
15. current Supabase schema and migrations.

The **current code** is the source of truth for what exists.
`LIFEOS_COMPANION_VNEXT.md` is the target product direction.

Do not treat future vNext concepts as already implemented.

---

# Preflight

Slice 1 added `brain_beliefs` and `apply_brain_belief_transition`.

Before implementing Slice 2:

- verify repository migration `supabase/migrations/20260919120000_companion_beliefs.sql`;
- if @Supabase is available, inspect whether the target database currently contains the expected Slice 1 table/RPC and security state;
- do not silently modify production merely because the connector permits it;
- repository migrations remain the deployment source of truth;
- if production is missing a prerequisite migration, document it explicitly.

Do not claim a live database migration was applied unless you actually applied and verified it.

---

# Mission

The existing MCP is deliberately read-only and its OAuth implementation currently grants only `lifeos.read`.

Slice 2 must evolve it into:

```text
READ SURFACE
existing MCP tools
lifeos.read
        ✅ unchanged

SEMANTIC SYNC SURFACE
one narrow explicit sync tool
lifeos.write
        ↓
strict semantic validator
        ↓
grounded LifeOS world-model service
        ↓
belief transitions + audit
```

Do **not** expose:

```text
insert_row
update_row
delete_row
execute_sql
run_brain_action
send_whatsapp
create_calendar_event
arbitrary Supabase table writes
```

An MCP client tells LifeOS **what changed semantically**.

LifeOS decides whether that semantic object is supported and how it maps to persistent state.

---

# Core product behavior

The first useful explicit sync should support these low-risk semantic update families.

## A. Routine state

Use the existing Slice 1 routine semantics/belief model.

Examples:

```text
skin = inactive
creatine = suspended until 2026-10-02
skin = active
```

Requirements:

- reuse the existing routine identity/state contract;
- only supported/grounded tracked routines may change;
- do not create arbitrary new Health habits through MCP;
- preserve temporal supersession and provenance;
- inactive/suspended state must continue affecting proactive candidate eligibility through the Slice 1 mechanisms;
- reactivation must work;
- replay must be idempotent.

## B. Preferences

Add a narrow semantic preference belief contract.

Examples:

```text
communication.style = "concise and casual"
communication.avoid_terms = ["tendenzialmente", "fondamentalmente"]
accountability.style = "direct"
voice.preference = "short responses unless detail is requested"
```

Requirements:

- preference keys must use a validated normalized namespace/key format;
- values must be bounded safe JSON primitives or small arrays/objects according to an explicit schema;
- reject secrets/credential-like content;
- current preference supersedes the previous current value while retaining history;
- no preference may itself authorize a consequential action;
- preferences become available through current-belief/context reads.

Do not turn this into an unrestricted JSON document store.

## C. Grounded project context

Allow high-value semantic context to attach to an **existing LifeOS project**, without modifying operational project progress/money/session records.

Examples:

```text
Hair Style:
  current_focus = "client feedback and final booking integration"

Hair Style:
  priority_state = "temporarily_deprioritized"

LifeOS:
  current_focus = "Companion vNext"

LifeOS:
  next_action = "MCP semantic sync"
```

Requirements:

- prefer project id if supplied;
- exact normalized project-name matching may be used as a fallback;
- ambiguous project name -> reject/clarify; do not guess;
- unknown project -> reject; do not create a project;
- do not modify `projects.current_value`, money, sessions, or other operational fields;
- store project context as world-model state/beliefs with provenance;
- allow only a small explicit field set such as:
  - `current_focus`
  - `priority_state`
  - `next_action`
  - `context_summary`
- choose final naming based on existing domain conventions;
- bounded strings only;
- current values supersede older values.

This gives ChatGPT a safe way to keep LifeOS's understanding of a project current without impersonating the Projects CRUD system.

---

# MCP tool design

Implement **one primary mutating MCP tool**, preferably named:

```text
sync_context
```

or an equally clear semantic name if the current MCP naming convention strongly suggests something better.

Do not add a separate generic tool for every table/domain.

A request should contain a compact explicit-sync envelope with concepts equivalent to:

```json
{
  "idempotency_key": "client-generated-stable-key",
  "source": {
    "system": "chatgpt",
    "kind": "explicit_conversation_sync",
    "captured_at": "2026-09-25T10:30:00Z",
    "reference": "optional bounded opaque conversation reference"
  },
  "summary": "User explicitly asked to sync the important changes from this conversation.",
  "updates": [
    {
      "client_update_id": "u1",
      "type": "routine_state",
      "routine_id": "skin",
      "state": "inactive",
      "confidence": 0.99,
      "effective_from": "2026-08-25T00:00:00Z",
      "evidence_summary": "User explicitly said they stopped doing skincare about a month ago."
    },
    {
      "client_update_id": "u2",
      "type": "preference",
      "key": "communication.style",
      "value": "concise and casual",
      "confidence": 0.98,
      "evidence_summary": "Explicit user preference."
    },
    {
      "client_update_id": "u3",
      "type": "project_context",
      "project_name": "Hair Style",
      "field": "priority_state",
      "value": "temporarily_deprioritized",
      "confidence": 0.95,
      "evidence_summary": "User said the project remains active but LifeOS has priority this week."
    }
  ]
}
```

The exact JSON shape is not locked. Adapt it to clean MCP schemas and existing repo conventions.

### Bounds

Use conservative explicit limits, for example:

- max 8 updates per sync request;
- bounded summary/evidence strings;
- bounded source references;
- bounded preference values;
- bounded project-context values;
- no giant conversation bodies;
- no files/blobs;
- no raw chain-of-thought.

The MCP should receive **curated semantic deltas**, not transcript dumps.

---

# Validation and transaction behavior

The sync service must be deterministic after the external client has supplied the structured semantic updates.

Do not ask another model to reinterpret an already structured MCP mutation.

Validation order:

1. authenticate;
2. authorize `lifeos.write`;
3. validate request envelope;
4. validate every semantic update;
5. ground every referenced entity (for example project);
6. reject unsupported/high-risk mutations;
7. only then perform persistence.

**Validate and ground the complete request before the first mutation.**

If validation/grounding fails, write nothing.

For database/runtime failures after persistence begins:

- every item must be independently idempotent;
- record the request as failed/partial as appropriate;
- retries must not duplicate successful transitions;
- return explicit per-item results.

Do not claim full atomicity unless you actually implement a transaction that guarantees it.

---

# Idempotency

This is mandatory.

The request carries a client-generated idempotency key.

Derive stable per-update idempotency keys from:

```text
user
+ request idempotency key
+ client_update_id
+ semantic type
```

or an equivalent stable contract.

Requirements:

- exact replay returns the prior logical result without duplicating beliefs;
- same idempotency key with a materially different request payload must be rejected as a conflict;
- do not silently accept key reuse with different content;
- persist a bounded request digest/hash for conflict detection;
- concurrency must not create duplicate current beliefs;
- reuse the existing atomic belief-transition RPC rather than bypassing it.

---

# Audit / provenance

A write-capable connector needs a durable audit trail.

Implement a narrow external-sync audit concept, using a new table or another repository-consistent durable mechanism if clearly better.

It should capture concepts such as:

- user_id;
- request idempotency key;
- safe request digest;
- source system/kind;
- source reference;
- captured_at;
- user-visible summary;
- status;
- requested item count;
- applied/rejected item count;
- bounded per-item result metadata;
- created/completed timestamps.

Do **not** persist:

- auth tokens;
- full connector request headers;
- secrets;
- full ChatGPT transcripts;
- model chain-of-thought.

Belief rows must also retain useful provenance that identifies external explicit sync as the source.

If a dedicated table is added:

- use RLS;
- authenticated users may have user-scoped read access if useful for future control-room inspection;
- mutation should remain server/service controlled;
- add indexes/idempotency uniqueness;
- add migration/schema contract tests.

---

# OAuth and authorization — critical

The current MCP OAuth implementation supports only:

```text
lifeos.read
```

and the authorization page says read-only access.

Do **not** make existing read tokens silently gain write authority.

Implement separate write authorization.

Preferred scope model:

```text
lifeos.read
lifeos.write
```

Requirements:

- existing `lifeos.read` OAuth tokens remain valid for existing read tools;
- read-only tokens cannot execute `sync_context`;
- write access requires an access token containing `lifeos.write`;
- a write-capable connector will normally request both `lifeos.read lifeos.write`;
- requested scopes must be validated as a subset of supported scopes;
- token response must return the actual granted/requested normalized scopes;
- authorization metadata advertises both supported scopes;
- authorization UI clearly tells the user when semantic write access is being granted;
- do not call it "read-only" when write scope is requested;
- add tests for read-only, read+write, invalid scope, expired/invalid token, and scope enforcement.

### Static tokens

Do not silently turn the existing `LIFEOS_MCP_TOKEN` into a write credential.

Prefer a separate server-only credential such as:

```text
LIFEOS_MCP_WRITE_TOKEN
```

for custom/local write clients.

Existing static read token behavior must remain backward-compatible.

A read token must not call mutating tools.

Never expose either token to frontend code.

If you choose a different static-write authorization mechanism, it must preserve the same security property: **existing read credentials do not gain write power.**

---

# MCP capability metadata

Update MCP tool metadata so read and write tools are accurately described.

Read tools should remain read-only.

The semantic sync tool should be clearly mutating but low-risk/idempotent.

Use MCP annotations/security metadata supported by the existing server implementation where appropriate.

Do not label the whole server "read_only: true" after a write surface exists.

Instead expose accurate capability metadata such as semantic/explicit writes while making clear that arbitrary CRUD and Brain execution remain unsupported.

Bump the MCP server version appropriately.

---

# What the write tool must NOT do

Calling `sync_context` must **never**, in this slice:

- send WhatsApp;
- enqueue a proactive message;
- create a calendar event;
- create a memo/reminder;
- create an expense;
- create/update Health logs except through the already-existing indirect eligibility consequences of routine beliefs;
- execute a stock trade or finance action;
- create a monitor;
- modify project progress/money/session records;
- create new projects;
- invoke arbitrary Brain planner actions;
- run arbitrary SQL;
- store full conversation transcripts.

It updates the **world model only**.

This separation is essential.

---

# Context/read integration

After sync, LifeOS must be able to read back the new current state.

Extend existing current-belief/context surfaces so:

- routine beliefs remain visible;
- current preferences are visible in a bounded section;
- current grounded project-context beliefs are visible alongside/with project context;
- superseded history is not dumped into every prompt;
- provenance remains available where useful;
- the Context Compiler stays the shared source rather than creating a second context aggregator.

Existing MCP reads must remain backward compatible.

---

# User-visible sync result

The MCP result should be compact and explicit.

Return concepts such as:

```json
{
  "status": "applied",
  "idempotent_replay": false,
  "summary": "3 LifeOS context updates applied.",
  "results": [
    {
      "client_update_id": "u1",
      "type": "routine_state",
      "status": "applied",
      "subject": "skin",
      "current_state": "inactive"
    }
  ]
}
```

Never return service-role data, raw SQL errors, auth tokens, or unlimited database rows.

ChatGPT should have enough information to truthfully tell the user what LifeOS learned.

---

# Explicit sync only

This slice must **not** pretend ChatGPT can silently sync every conversation.

Supported product behavior after this slice:

```text
User explicitly asks to sync
        ↓
ChatGPT chooses high-value semantic deltas
        ↓
sync_context
        ↓
LifeOS validates/applies them
```

Ambient high-value sync remains future work and depends on platform behavior + user standing permission.

Do not build polling of ChatGPT history.
Do not assume access to the user's full ChatGPT account history.
Do not ingest every message automatically.

---

# Provider independence

Do not make the semantic sync contract dependent on OpenAI-specific message objects.

`source.system = "chatgpt"` is provenance, not architecture.

The exact same validated backend service should be callable in the future by:

- ChatGPT;
- Codex;
- Claude;
- a local agent;
- a manual import;
- the LifeOS UI.

The domain service must accept LifeOS semantic objects, not provider-native payloads.

---

# €0 constraint

Introduce no required recurring paid dependency.

Do not require:

- OpenAI API;
- Twilio;
- ElevenLabs;
- Meta Cloud API;
- additional paid hosting;
- paid vector/search services.

Use existing LifeOS/Vercel/Supabase infrastructure.

---

# Connected tools

You may have access to @GitHub, @Supabase, and @LifeOS.

Use them when they improve correctness.

## @GitHub

- repository state is authoritative;
- inspect history and current implementation before edits;
- use coherent commits/checkpoints;
- do not overwrite unrelated correct work.

## @Supabase

Use for inspection/verification where appropriate.

Do **not** silently mutate production just because the connector permits writes.

For schema changes:

1. inspect;
2. implement/test locally or in the repository's established workflow;
3. create/update migration + `supabase/schema.sql`;
4. run schema/security checks;
5. document deployment requirements.

Never weaken RLS to make the feature easier.

## @LifeOS

Use live read MCP data, if available, to inspect the current connector behavior and verify read compatibility.

Do not rely on live MCP as a substitute for code/tests.

Until this slice is deployed/re-authorized, do not assume the live connector already has write capability.

---

# Required acceptance journeys

Add regression coverage for at least these.

## Journey A — existing read token remains read-only

Given an existing valid OAuth token containing only:

```text
lifeos.read
```

Assert:

- existing read tools still work;
- `sync_context` fails authorization;
- zero world-model writes occur.

## Journey B — write-capable OAuth

A client requests:

```text
lifeos.read lifeos.write
```

Assert:

- authorization succeeds only through normal link-secret/PKCE flow;
- token contains the expected scopes;
- reads work;
- explicit semantic sync works;
- authorization UI accurately describes write access.

## Journey C — existing static token remains read-only

Assert existing `LIFEOS_MCP_TOKEN`:

- can still read;
- cannot execute semantic writes.

A separately configured write credential may write.

## Journey D — explicit routine sync

Sync:

```text
skin = inactive
```

Assert:

- current routine belief becomes inactive;
- previous current state is superseded;
- provenance identifies external explicit sync;
- replay does not duplicate the transition;
- queued/future routine accountability remains suppressed according to Slice 1 semantics.

## Journey E — preference supersession

Sync:

```text
communication.style = concise and casual
```

then:

```text
communication.style = concise, casual, more detail when asked
```

Assert:

- exactly one current preference belief;
- first value remains historical/superseded;
- current context returns the newer preference;
- provenance and timestamps are preserved.

## Journey F — grounded project context

Given exactly one existing project named `Hair Style`, sync:

```text
field = current_focus
value = client feedback and booking integration
```

Assert:

- project resolves deterministically;
- a current project-context belief is stored;
- the underlying project progress/money/sessions are unchanged;
- Context Compiler returns the new project semantic context.

## Journey G — unknown/ambiguous project

Assert:

- unknown project name is rejected;
- ambiguous name is rejected;
- no project is created;
- no context belief is written.

## Journey H — request idempotency conflict

1. send request with idempotency key X;
2. replay identical payload -> same logical result/no duplicate writes;
3. reuse X with different payload -> explicit conflict/no mutation.

## Journey I — invalid mixed request

One update is structurally invalid or ungrounded.

Assert validation/grounding occurs before writes and **no items are persisted**.

## Journey J — side-effect isolation

After a successful sync assert:

- no calendar event;
- no memo;
- no expense;
- no Health log;
- no WhatsApp outbox message;
- no monitor/proactive rule;
- no project operational mutation.

Only allowed world-model/audit state changes occur.

---

# Tests

Extend the existing MCP/Companion/schema test architecture rather than creating a disconnected test toy.

Add a focused script if useful, for example:

```text
npm run test:mcp-write
```

but keep `npm test` as the umbrella.

At minimum run:

```bash
npm run test:mcp
npm run test:companion
npm run test:schema
npm run test:brain
npm run test:reliability
npm run test:bridge
npm test
npm run check:functions
npm run build
git diff --check
```

If OAuth code changes, extend OAuth smoke/unit coverage.

Do not claim physical ChatGPT connector write behavior is verified unless it was actually exercised after deployment/re-linking.

---

# Security review

Before calling the slice complete, explicitly verify:

- existing read OAuth tokens cannot write;
- existing static read token cannot write;
- write scope is explicit;
- service-role key never leaves backend;
- RLS remains enabled on new exposed tables;
- write RPC/functions are not executable by unintended roles;
- project matching cannot cross user scope;
- idempotency key conflict handling works;
- request/evidence strings are bounded;
- secret-like content is rejected where appropriate;
- no arbitrary table/predicate/value path bypasses semantic validators;
- no full transcript persistence;
- errors returned to MCP are sanitized.

If @Supabase supports advisors, inspect relevant security/schema feedback before finalizing, but do not hide unresolved warnings.

---

# Documentation

Update documentation to reality, including at least:

- `PROJECT_CONTEXT.md`;
- `docs/MCP.md`;
- `docs/LIFEOS_COMPANION_VNEXT.md`;
- architecture/security/deployment docs if relevant.

Document:

- read vs write OAuth scopes;
- separate static write credential behavior;
- supported semantic sync update types;
- unsupported mutations;
- idempotency behavior;
- provenance/audit behavior;
- deployment/re-authorization requirements;
- that existing ChatGPT connector may need to be re-linked to receive `lifeos.write`.

Do not say ambient sync exists.

---

# Interruption / usage-limit protocol

This task may be interrupted.

Work in coherent checkpoints.

Maintain:

```text
docs/CODEX_COMPANION_VNEXT_SLICE2_PROGRESS.md
```

It must record:

- current status;
- chosen architecture;
- completed requirements;
- files changed;
- migrations;
- auth/scope changes;
- tests passing/failing;
- work in progress;
- remaining requirements;
- known risks;
- last good commit;
- exact recommended next step.

After each major coherent milestone:

1. run relevant focused tests;
2. update the progress file;
3. commit working state with a descriptive message.

Never commit knowingly broken code just to checkpoint.

If approaching a usage/context limit:

- finish the smallest safe coherent unit;
- run focused tests;
- update progress;
- commit;
- stop cleanly.

A fresh Codex session must be able to resume without redesigning the slice.

---

# Suggested milestone order

This is guidance, not a command to ignore better seams in the real code.

### Milestone 1 — authorization foundation

- multi-scope OAuth support;
- `lifeos.write`;
- backward-compatible `lifeos.read`;
- separate static write credential;
- per-tool authorization contract;
- tests.

### Milestone 2 — semantic external-sync domain service

- strict request/update normalization;
- preference contract;
- project grounding/context contract;
- reuse routine belief transitions;
- request/per-item idempotency;
- no external side effects;
- tests.

### Milestone 3 — audit + persistence integration

- external sync audit state;
- RLS/migration/schema;
- exact replay/conflict behavior;
- current context exposure;
- tests.

### Milestone 4 — MCP tool + full regressions

- `sync_context` MCP tool;
- metadata/annotations;
- compact result;
- MCP/OAuth/schema/Companion regressions;
- docs;
- deployment/re-link QA checklist.

---

# Definition of done

Slice 2 is complete when this statement is true:

> A user can explicitly ask an authorized MCP client such as ChatGPT to synchronize a few important current changes to LifeOS; the client can submit only a small allowlisted set of semantic updates; LifeOS independently validates authorization, grounding, provenance and idempotency; the updates become temporally correct current world-model state with audit history; existing read-only credentials cannot write; no operational/external side effects occur; and the synced state can immediately be read back through the shared LifeOS context.

Specifically:

- existing MCP read clients remain backward compatible;
- `lifeos.write` is separate and explicit;
- existing read credentials do not silently gain write power;
- routine state sync works through the Slice 1 belief contract;
- preference sync works with supersession;
- grounded project context sync works without modifying project operations;
- request replay is idempotent;
- idempotency-key/payload conflict is rejected;
- invalid/ungrounded requests perform zero writes;
- durable audit/provenance exists;
- current context exposes the synced state;
- no arbitrary CRUD/SQL/Brain actions are exposed;
- no calendar/memo/WhatsApp/monitor/finance side effects are possible from this tool;
- no new paid dependency is introduced;
- full existing test suite/build remains green.

---

# Final report

At completion, report concisely:

- architecture implemented;
- new MCP tool(s);
- OAuth/static auth changes;
- supported semantic update types;
- files changed;
- migrations/deployment order;
- whether connector re-linking is required;
- test/build results;
- live QA actually performed vs still required;
- known limitations;
- recommended Slice 3.

Do not stop after a plan.
Do not expand into deep autobiographical memory, ambient sync, monitors, rich WhatsApp, voice, calls, or desktop organs.
Finish Slice 2 end-to-end.
