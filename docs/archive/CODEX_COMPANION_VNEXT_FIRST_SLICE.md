# Codex Execution Prompt — LifeOS Companion vNext, First Vertical Slice

You are working in the existing repository `alessiocasce/lifeos`.

Do **not** restart, redesign, or rebuild LifeOS from scratch.

Your job is to implement the **first real vertical slice of LifeOS Companion vNext** on top of the current production architecture while preserving all existing BrainTurn, WhatsApp, Supabase, MCP, and reliability guarantees.

## Read these files first — source of truth

Before changing code, inspect the current repo and read these in full:

1. `PROJECT_CONTEXT.md`
2. `docs/LIFEOS_COMPANION_VNEXT.md`
3. `docs/BRAIN_ARCHITECTURE.md`
4. `docs/RELIABILITY_RELEASE.md`
5. `docs/MCP.md`
6. `bridge/whatsapp/wts.js`
7. current proactive/accountability/interaction-selection implementation under `api/_utils/`
8. current relevant Supabase schema/migrations and test harnesses.

The codebase is the source of truth for current behavior. The vNext spec defines the target behavior.

Do not treat unimplemented vNext ideas as already available.

---

# Mission

Move LifeOS away from:

```text
missing field
→ deterministic reminder
→ narrow reply parser
→ robotic confirmation
```

toward:

```text
current world model
+ active routines/commitments
+ recent conversation
+ deterministic execution safety
        ↓
semantic Brain understanding
        ↓
natural Butler response
        ↓
world model updates when reality changes
```

The first slice must make the **existing WhatsApp Brain feel like one intelligent continuing companion** without weakening the existing deterministic safety/reliability layer.

Do **not** attempt all of Companion vNext in one pass.

Do **not** implement desktop Focus, webcam/screen sensors, realtime calls, or the full monitor engine in this task.

---

# Primary user-visible problem to solve

Today LifeOS can repeatedly ask about a tracked item even when the user's real life has changed.

Canonical failure:

```text
Brain: "Skincare fatta?"
User: "no"
→ no write
→ next day Brain asks again
→ repeats indefinitely
```

Even worse:

```text
Brain: "skincare?"
User: "no lol I stopped doing that like a month ago"
```

The existing narrow proactive/accountability resolver can understand the immediate `no`, but the meaningful residual statement — "I stopped doing that a month ago" — must not be discarded.

After this implementation, LifeOS should understand that the world model changed, update/supersede the relevant current routine state, stop future skincare accountability candidates, preserve historical provenance, and answer naturally.

No magic phrase should be required.

These should all be semantically understandable:

- "bro stop asking me about skincare, I stopped doing that a month ago"
- "I don't really care about tracking that anymore"
- "leave me alone about creatine for a while"
- "actually I started doing this again"
- "yeah but stop tracking this from next week"
- "no because that project is dead"

---

# Non-negotiable architecture rule

**Deterministic code protects execution. It must not be the primary language-understanding layer.**

Do not delete or weaken:

- BrainTurn Contract;
- current interaction ownership / quote correlation;
- pending-vs-proactive arbitration;
- field provenance;
- source revalidation;
- idempotency;
- compare-and-swap health writes;
- outbox delivery/ACK/provider mappings;
- user scoping;
- current destructive/high-risk action guards.

The deterministic proactive resolver may still decide:

```text
Do not log skincare today.
```

But the rest of the turn must remain available to semantic understanding:

```text
"I stopped doing that a month ago"
```

Interaction ownership protects the intended write target. It must **not imprison the whole conversational turn inside the narrow target resolver**.

---

# Implement this vertical slice

## 1. Current-state / belief model

Introduce the minimum robust persistent representation needed for **current semantic state with temporal supersession**.

It must support at least:

- a subject/topic;
- a predicate/type;
- current value/state;
- active vs superseded state or equivalent;
- confidence;
- provenance/source;
- valid/effective time when known;
- created/updated timestamps;
- supersession relationship or equivalent historical trace.

Use naming/schema that fits the existing repo. Do not blindly copy speculative schema from the product doc if a better integration with the current database is obvious.

Important behavior:

```text
old belief: skincare routine = active
new belief: skincare routine = inactive
```

The historical fact may remain available, but retrieval/proactive logic must prefer the current belief.

Do not overload `ai_memories` alone if that cannot safely model current-vs-historical truth.

Add migration/schema/test coverage as required.

## 2. Semantic routine-state changes

Add a semantic path that can recognize conversational statements indicating:

- deactivate/retire a routine;
- temporarily suppress a routine;
- reactivate a routine;
- user no longer cares about tracking something;
- the system's assumption appears stale.

Do not implement this as a growing regex list of exact user phrases.

Use the existing model/planner/classification infrastructure where appropriate, but validate the extracted semantic operation deterministically before persistence.

The model may infer the semantic intent.

The backend owns the allowed operation and validation.

## 3. Compound proactive replies

Modify the proactive-reply flow so a turn can have BOTH:

1. a deterministic resolution of the currently-owned proactive target; and
2. meaningful residual semantic content processed by Brain.

Example:

```text
Brain asks about skincare.
User: "no, I stopped doing that a month ago"
```

Expected:

- do not log skincare today;
- safely resolve/close today's accountability interaction as appropriate;
- process "I stopped doing that a month ago" as a routine-state change;
- deactivate/supersede the skincare-current-state belief;
- prevent new skincare accountability candidates;
- produce one coherent natural response;
- do not execute the same action twice;
- do not let the residual path steal/write to a different proactive target;
- preserve current quoted-message/interaction ownership guarantees.

Create an explicit internal contract/result shape for "resolved action + residual semantic content" rather than ad-hoc fallthrough if that makes the architecture clearer.

## 4. Proactive candidate generation must respect current state

Current accountability generation must no longer assume that every historically tracked habit is currently desired.

Before producing a Shower/Creatine/Skin candidate, consult current-state/routine information.

If a routine is inactive/suspended:

```text
no candidate
no outbox row
no daily nag
```

If it is reactivated conversationally, candidates may resume according to normal timing/attention rules.

Preserve existing source revalidation and delivery safety.

## 5. Anti-nag feedback

Repeated negative responses are evidence.

Implement the minimum bounded behavior needed so repeated "no"/dismissal of the same routine does **not** increase nagging.

Prefer one of:

- lower routine confidence;
- mark the assumption as needing clarification;
- suppress and ask a natural stale-model question at an appropriate later point;
- another explicit bounded mechanism compatible with the architecture.

Do not silently deactivate a routine from one ambiguous "no".

Explicit statements such as "I stopped doing that a month ago" may carry high enough confidence to update current state immediately.

## 6. Butler rendering layer

Separate:

```text
what happened
```

from:

```text
how the companion says it
```

Today deterministic paths return strings such as:

- "Segnato: skincare fatta oggi."
- "Ok, non segno nulla."
- "Ok, te lo richiedo piu tardi."
- "A che ora esattamente?"

Preserve deterministic action/result metadata, but introduce a channel-independent Butler response stage or equivalent clean abstraction so these machine results do not have to be the final user-facing prose.

For WhatsApp:

- concise by default;
- conversational;
- can be casual;
- no corporate assistant voice;
- no mandatory narration of database operations;
- no fake praise;
- humor only when natural;
- should feel like the same person across consecutive messages;
- must remain grounded in actual action result/context.

Examples of acceptable style:

```text
"got it"
"yeah fair"
"knew you forgot 💀"
"wait, you still doing skincare these days?"
```

Do not hardcode those exact phrases as the product.

The Butler should generate/choose wording from structured result + context.

If model generation is unavailable/fails, provide a safe concise deterministic fallback.

## 7. Natural proactive scope

Do not build the full Attention Engine yet, but make the architecture compatible with proactive reasons beyond "missing health field".

The result/model contracts should be able to represent reasons such as:

- accountability;
- stale-world-model clarification;
- project staleness;
- anomaly;
- opportunity;
- positive evidence/progress;
- monitor event.

Do not implement all those candidate families now unless naturally required.

Avoid schema/contracts that hard-wire proactive communication to health forever.

## 8. MCP / external intelligence integration

The existing MCP is a real, read-only v1 and must remain stable.

Do not replace it.

Expose any new current-state/belief information through the existing context/MCP architecture where appropriate.

Then implement **at most one minimal semantic write primitive** for Companion sync if it can be done safely in this slice.

Preferred concept:

```text
sync_context / update_current_belief
```

not arbitrary database CRUD.

It must:

- be user-scoped;
- validate a narrow semantic schema;
- preserve provenance;
- be idempotent;
- reject unsupported mutation types;
- never expose service keys;
- never allow arbitrary table/SQL access.

If adding a write MCP tool would materially destabilize this slice, implement the internal semantic service and its tests first, document the MCP write contract precisely, and leave the external mutation tool as the next isolated step. Do not fake completeness.

Keep current MCP read tools and OAuth/static-token behavior working.

---

# Important constraints

## €0 new recurring spend

Do not introduce a required paid service.

Do not add required dependencies on:

- OpenAI API;
- Twilio;
- ElevenLabs;
- Meta WhatsApp Cloud API;
- paid vector databases;
- paid hosting.

Existing currently-used infrastructure may remain.

Keep model/provider integrations replaceable.

## WhatsApp transport

Keep the existing Oracle-hosted `whatsapp-web.js` architecture.

Do not migrate to Meta Cloud API.

Do not work on WhatsApp calls in this task.

## Model independence

Do not bind new world-model semantics, Butler contracts, or monitor/routine state to Gemini-specific response structures.

Gemini may remain the currently configured implementation, but the durable domain interfaces must be provider-agnostic.

## UI

Do not spend this task redesigning the LifeOS dashboard.

Add only the minimal UI/diagnostic surface required to safely inspect/debug the new state if useful.

The UI is becoming a control room, not the primary daily interaction surface.

---

# Required regression journeys

Add tests that prove at least these journeys through the **real BrainTurn/proactive contract path**, not only isolated helper calls.

### Journey A — explicit stale routine

```text
proactive skincare question is active
user: "no, I stopped doing that like a month ago"
```

Assert:

- skincare is not logged;
- current skincare routine becomes inactive;
- previous/current provenance is preserved;
- interaction is resolved safely;
- tomorrow/current candidate generation excludes skincare;
- natural response is produced/fallback is valid;
- no duplicate writes.

### Journey B — simple no does not over-infer

```text
Brain: skincare?
user: "no"
```

Assert:

- no skincare write;
- do not immediately fabricate "routine inactive";
- negative feedback is recorded/bounded;
- existing interaction ownership still works.

### Journey C — reactivation

```text
user: "actually I started doing skincare again"
```

Assert:

- current routine becomes active;
- old inactive belief remains historical/superseded rather than being silently destroyed;
- future candidate generation can include skincare again.

### Journey D — compound done + new information

```text
Brain: creatine?
user: "done btw I'm going away tomorrow"
```

Assert:

- creatine target resolves once;
- residual content is not discarded;
- no duplicate health write;
- residual path cannot hijack another pending/proactive target.

You do not necessarily need to persist "going away tomorrow" unless the current semantic-memory policy supports it safely; the important regression is that meaningful residual content reaches the semantic path instead of being silently eaten.

### Journey E — quote/ownership reliability

Keep existing native quoted-message, out-of-order reply, stale target, and provider mapping tests passing.

### Journey F — MCP compatibility

Existing MCP v1 read tests pass unchanged unless intentionally extended.

If a semantic write tool is added, add explicit auth, schema, idempotency, provenance, and forbidden-mutation tests.

---

# Implementation quality

Before editing, inspect the exact current code paths and identify the smallest coherent extraction points.

Prefer new focused modules over making `api/ai/chat.js` even larger.

Likely areas include, but are not limited to:

- proactive reply resolution;
- BrainTurn contract/selection;
- memory/current-state services;
- proactive candidate generation;
- response rendering;
- MCP semantic services;
- schema/migrations;
- reliability tests.

Do not casually move existing code just for aesthetics.

Do not reduce existing safety behavior in order to make the new flow easier.

Add trace events/diagnostics for the new semantic path, but do not log private full message bodies or chain-of-thought.

Store only safe bounded metadata.

---

# Verification

Run the complete existing verification suite, not just new tests:

```bash
npm test
npm run check:functions
npm run build
```

Also run focused suites while developing:

```bash
npm run test:brain
npm run test:reliability
npm run test:bridge
npm run test:mcp
npm run test:schema
```

If schema changes are required:

- add the appropriate migration/release SQL using the repo's established conventions;
- update schema contracts;
- document deployment order;
- do not claim the feature is deployed if only repository code was changed.

No local test currently proves physical Oracle/WhatsApp delivery. Keep that limitation explicit and provide a manual QA checklist for the new journey.

---

# Definition of done

This task is complete when the following statement is true:

> If Brain asks about a routine and the user naturally explains that the routine is no longer part of their life, LifeOS understands the change without requiring a magic phrase, safely resolves the original interaction, updates a temporally-correct current world model, stops future related nudges, preserves provenance/history, and replies naturally — while all existing BrainTurn, pending-action, WhatsApp quote/provider-mapping, outbox, MCP read, schema, and action-safety tests continue to pass.

Additionally:

- a bare ambiguous "no" does not falsely rewrite the user's life;
- a later natural reactivation works;
- deterministic result data is separated from Butler wording;
- the implementation is provider-agnostic at the domain-contract level;
- no new recurring paid dependency is introduced.

---

# Working process

1. Inspect current implementation and tests.
2. Write a short internal implementation plan based on actual code.
3. Implement the whole vertical slice coherently.
4. Add migrations/tests/docs as required.
5. Run all verification.
6. Fix regressions rather than weakening tests.
7. Update `PROJECT_CONTEXT.md`, `docs/BRAIN_ARCHITECTURE.md`, `docs/MCP.md`, and/or `docs/LIFEOS_COMPANION_VNEXT.md` only where the implementation actually changed reality.
8. Finish with a concise report containing:
   - architecture implemented;
   - files changed;
   - schema/migration requirements;
   - tests/build results;
   - manual Oracle/WhatsApp QA still required;
   - known limitations;
   - the next recommended Companion slice.

Do not stop after producing a plan.

Do not leave placeholder TODOs for core requirements.

Do not expand into later vNext phases just because they are described in the product document.

Preserve existing correct work and finish this first Companion slice end-to-end.
