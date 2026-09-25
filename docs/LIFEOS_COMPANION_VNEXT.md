# LifeOS Companion vNext — Living Product Spec

> **Status:** living design document  
> **Started:** 2026-09-18  
> **Purpose:** preserve and continuously refine the next major LifeOS direction. This file is intentionally broader than an implementation ticket. Update it as the product vision becomes clearer.

---

## 1. North Star

LifeOS should stop feeling like a dashboard with an AI tab and become a **persistent personal companion / butler / accountability partner**.

The desired experience is not:

- open LifeOS;
- look at dashboards;
- fill in fields;
- receive deterministic reminders;
- answer narrowly-scoped yes/no questions.

The desired experience is:

> LifeOS knows me deeply, stays aware of the parts of my life I have allowed it to observe, remembers what matters, notices changes, decides when something deserves my attention, talks to me naturally, keeps me accountable, and can safely act across my tools.

The UI becomes one surface for inspecting and configuring LifeOS's world model. It is not the primary product interaction.

The primary product is the **relationship with the Brain**.

### Product sentence

**Brain understands. Memory remembers. Sensors observe. Monitors watch. Tools act. Channels reach me. The Butler makes the whole system feel like one continuous companion.**

---

## 2. Product Principles

### 2.1 One Brain, many surfaces

WhatsApp, the LifeOS web app, future desktop voice, phone calls, Shortcuts, ChatGPT integration, and future devices must not behave like separate assistants.

They are interfaces into the same Brain:

```text
ChatGPT ─────────┐
WhatsApp ────────┤
Voice / calls ───┤
LifeOS UI ───────┼──> ONE BRAIN ──> Memory / State / Tools
Desktop companion┤
iPhone / Shortcuts
                 ┘
```

Conversation can move between surfaces without losing the underlying user model.

This means **continuity, not merely shared storage**. Recent conversational state, unresolved commitments, active topics and the last meaningful interaction should be representable independently of the transport. A WhatsApp conversation followed by a voice session should not feel like meeting a different assistant.

Channel-specific metadata (provider ids, quotes, media ids, delivery receipts) stays transport-specific; semantic conversation state belongs to Brain.

### 2.2 Natural-language control, not magic phrases

LifeOS must not require exact commands such as:

- "disable skincare reminder"
- "cancel monitor skincare"
- "set habit active false"

A message such as:

> "bro stop asking me about skincare, I stopped doing that a month ago"

should be understood semantically as evidence that:

1. skincare is no longer an active routine;
2. existing skincare accountability monitoring should be retired or suspended;
3. the user does not want further proactive skincare check-ins;
4. this preference may be durable and should be remembered.

Likewise:

> "I don't really care about tracking that anymore"

> "leave me alone about creatine for a while"

> "actually I started doing this again"

must update the relevant world model/monitor policy when confidence is sufficient.

Deterministic backend validation remains necessary for identity, ownership, schema integrity, idempotency, money/destructive actions, exact execution, and provider reliability. **Deterministic code should protect execution; it should not be the primary language-understanding layer.**

### 2.3 The companion decides whether to interrupt

A missing field is evidence, not an automatic reason to message.

Old model:

```text
skin == missing -> WhatsApp reminder
```

vNext:

```text
signals + current state + history + routines + preferences + recent conversation
                                ↓
                        ATTENTION ENGINE
                                ↓
                 is an interruption worthwhile?
                     ↓ yes                 ↓ no
                  Butler                 silence
```

The best proactive message is often no message.

### 2.4 Reliability underneath, personality on top

The existing deterministic WhatsApp accountability and interaction ownership work is valuable and should remain the execution foundation.

But internal machine decisions must be separated from user-facing language.

Example internal decision:

```json
{
  "intervene": true,
  "topic": "skin",
  "reason": "expected routine appears missing",
  "confidence": 0.82,
  "urgency": "low",
  "desired_outcome": "clarify whether routine is still active"
}
```

The Butler can turn that into something natural:

> "wait, are you still doing skincare these days?"

If the user says they stopped a month ago, the system should **change its belief and monitoring behavior**, not ask the same question tomorrow.

### 2.5 Graduated autonomy

The user should be able to grant standing permissions instead of approving every tiny behavior.

Example autonomy classes:

- **Observe:** read allowed LifeOS/user data and detect patterns.
- **Remember:** save/update low-risk beliefs and preferences with provenance/confidence.
- **Monitor:** create low-risk watches when Brain judges they are useful.
- **Message:** send low-priority proactive messages within attention/quiet-hour budgets.
- **Escalate:** use stronger channels (voice note, repeated alert, call) only under configured importance policy.
- **Act:** modify external state only according to action-specific permissions.

LifeOS should be able to create a monitor because it notices something worth monitoring **when the user has granted that class of autonomy**. It should not need an exact "create scheduled task" phrase every time.

For consequential actions, autonomy remains narrower. In particular, financial monitoring may alert/escalate but must not silently execute a trade.

### 2.6 Provider/model independence + zero-cash operation

Companion vNext must not make the identity of the companion depend on OpenAI, Gemini, Claude, or any single model/provider.

```text
LifeOS Brain contract / memory / tools / monitors / Butler policy
                            ↓
                      model adapter
                  ↙         ↓         ↘
               local     existing     optional future
               model     provider     provider
```

The model is replaceable infrastructure. The **LifeOS world model, permissions, tool contracts, monitor registry, attention policy, conversation state and Butler relationship must survive a brain-provider swap**.

While the current €0 constraint is active:

- no new required per-token, per-minute, per-message or telephony spend;
- existing services/free allowances may be used only while they do not create a required new cash cost;
- every new core capability should have a zero-cash path or remain explicitly experimental/future;
- paid APIs can be optional adapters, never architectural requirements;
- deterministic monitors, queued events and stored context should continue to function when an optional model provider is unavailable.

---

## 3. Current Problem: LifeOS Knows Too Little Compared With ChatGPT

The user consistently talks to ChatGPT much more than to the LifeOS UI. ChatGPT therefore contains substantially richer context about:

- current projects;
- recent decisions;
- preferences;
- changing routines;
- goals;
- struggles;
- product ideas;
- ongoing questions;
- what has become irrelevant;
- communication style.

LifeOS cannot become a great companion while ignoring the place where the user actually thinks out loud.

### vNext requirement: External Intelligence / ChatGPT Bridge

LifeOS should expose a controlled integration surface — ideally through its existing/future MCP/API layer — so a supported ChatGPT integration can read from and write selected LifeOS context.

Desired tools/concepts:

```text
lifeos.get_current_state
lifeos.search_memory
lifeos.get_project_context
lifeos.sync_conversation_summary
lifeos.upsert_project_update
lifeos.remember
lifeos.update_preference
lifeos.retire_monitor
lifeos.suggest_monitor
lifeos.create_monitor   # only within granted monitor autonomy
lifeos.log_event
```

The goal is **not** blind duplication of every ChatGPT token into LifeOS.

The goal is to let a conversation in ChatGPT produce high-value synchronization such as:

```json
{
  "type": "project_update",
  "project": "LifeOS",
  "summary": "User wants Companion vNext to prioritize deep memory, natural proactive conversation, voice and escalation channels.",
  "importance": 5,
  "source": "chatgpt_explicit_sync"
}
```

or:

```json
{
  "type": "routine_change",
  "subject": "skincare",
  "state": "inactive",
  "effective_since": "approximately one month ago",
  "confidence": 0.95,
  "source": "user_statement"
}
```

### Constraint

Do not design this around an assumption that LifeOS can automatically read the user's entire private ChatGPT history through an undocumented API.

Preferred approaches:

1. a supported ChatGPT plugin/app/MCP integration that can call LifeOS tools from an active conversation;
2. explicit high-value "sync this to LifeOS" operations;
3. optional periodic/manual ChatGPT data import for backfill;
4. future supported account-level integrations if they become available.

---

## 4. Memory: Build an Autobiographical World Model

Memory is the highest-priority intelligence layer.

LifeOS should distinguish several types of memory instead of treating all remembered text equally.

### 4.1 Memory layers

#### Identity / stable profile
Relatively stable facts and preferences.

Examples:
- communication preferences;
- long-term goals;
- important people/entities;
- recurring constraints;
- preferred accountability style.

#### Current state

Implemented first slice (2026-09-19): LifeOS now has a persistent current-belief layer for routines, semantic deactivate/suspend/reactivate operations with deterministic validation, compound proactive turns, Butler result/wording separation, candidate/delivery filtering, and read-only MCP/context exposure. This is deliberately narrower than the full memory graph described below: only tracked routine state is mutated conversationally today.
What is true now.

Examples:
- currently active projects;
- current routines;
- current priorities;
- active commitments;
- current experiments.

This layer must be easy to supersede. "Used to do skincare" must not behave as "currently does skincare."

#### Episodic memory
Meaningful events with time.

Examples:
- set up Oracle infrastructure for the WhatsApp bridge;
- decided to reposition LifeOS around a companion architecture;
- shipped a client website;
- changed a workout approach.

#### Project memory
Living state per project:

```text
goal
current status
recent decisions
open questions
next likely actions
important history
people/resources
stale assumptions
```

#### Preference / relationship memory
How the Butler should interact.

Examples:
- concise WhatsApp messages;
- profanity/casual tone is acceptable;
- direct accountability is welcome;
- avoid corporate praise;
- do not nag after the user retires a routine.

#### Behavioral / pattern memory
AI-generated hypotheses such as:

> "Late-night routines are often missed on days with long coding sessions."

These must have evidence, confidence, timestamps, and decay. They are hypotheses, not permanent truths.

### 4.2 Supersession and forgetting

Memory needs temporal truth.

A new statement can supersede an old one:

```text
2026-08: skincare routine = active
2026-09: skincare routine = inactive
```

Retrieval must prefer the current state while retaining history when useful.

"Forget", "stop asking", "that's not relevant anymore", "I don't do that now", etc. should be semantic operations, not exact-command parsers.

### 4.3 Memory curation

A curator periodically processes meaningful events and conversations.

It should ask:

- Did something about the user change?
- Was a decision made?
- Did a project move?
- Was a preference expressed?
- Is there a repeated pattern worth storing?
- Is an old belief now stale?
- Does an existing monitor no longer make sense?

It should not save every mundane event.

### 4.4 Retrieval

Use hybrid retrieval:

- structured LifeOS queries;
- active/current beliefs;
- recent episodic memories;
- project-specific context;
- lexical search;
- pgvector semantic search;
- recency;
- importance;
- confidence;
- supersession state;
- source provenance.

The Brain should receive the **smallest high-value context**, not a giant dump.

---

## 5. The Butler Layer

The Butler is the conversational/social expression of Brain.

It is not a separate source of truth and does not bypass execution guards.

### Desired character

- feels like an intelligent companion, not customer support;
- concise by default;
- conversational;
- can be casual;
- humor when natural;
- comfortable calling the user out;
- does not manufacture praise;
- does not narrate database operations;
- can challenge weak excuses;
- asks questions when genuinely curious/uncertain;
- changes tone based on context and channel;
- remembers interaction preferences;
- avoids repetitive phrasing.

### WhatsApp-specific behavior

WhatsApp should feel like texting one continuing person.

Good:

> "you still doing skincare these days?"

> "Hair Style hasn't moved in a week. still a priority?"

> "you've been on LifeOS a lot this week btw. actually shipping or just rearranging the spaceship?"

Bad:

> "Reminder: Skincare is not logged. Have you completed skincare today?"

> "Logged: skincare completed today."

Replies should not always confirm backend state mechanically. If a write succeeded, the Butler may simply say:

> "good"

or:

> "knew you forgot 💀"

The deterministic action result is stored in metadata/logs; it does not need to become robotic prose.

### Multi-bubble messages

The channel layer should support deliberate multi-bubble output when it improves naturalness:

```text
Brain: "ale"
Brain: "you still doing skincare these days?"
```

Do not abuse this.

### Conversation must not collapse into a transaction

A proactive check-in may have a deterministic target, but the user's reply can contain **more information than the target resolver needs**.

Example:

```text
Brain: "skincare?"
User: "no lol I stopped doing that like a month ago"
```

v1 behavior must not be:

```text
detect "no"
→ resolve today's check-in
→ "Ok, non segno nulla."
→ discard the rest of the meaning
```

vNext behavior:

```text
deterministic local resolution: do not log skincare today
                         +
semantic residual meaning: skincare routine is no longer active
                         ↓
world-model update / monitor retirement
                         ↓
natural Butler reply
```

The same applies to compound responses such as:

> "done btw I'm going away tomorrow"

> "not yet, remind me after the gym"

> "yeah but stop tracking this from next week"

> "no because that project is dead"

**Interaction ownership protects the intended write target; it must not imprison the whole turn inside that narrow subsystem.** After safe target resolution, meaningful residual content should re-enter the semantic Brain path with the completed action as context and without being allowed to duplicate the resolved write.

### Proactive conversation is broader than missing fields

The Butler should initiate conversation for several reasons, not just "did you do X?":

- accountability around commitments the user actually cares about;
- curiosity when Brain suspects its world model is stale;
- project momentum / staleness;
- meaningful positive progress worth noticing;
- anomalies or risks;
- opportunities;
- useful cross-domain patterns;
- time-sensitive external monitor events;
- occasional context-aware check-ins when there is a concrete reason.

Positive observations should be specific and evidence-based, not synthetic praise. Casual check-ins should still have an underlying reason; LifeOS should not burn attention merely to imitate a friend.

---

## 6. Attention Engine

The proactive system evolves from rule-triggered reminders into an attention allocator.

### Inputs

Potential inputs include:

- current LifeOS structured data;
- active routines and monitors;
- calendar;
- project staleness;
- deadlines;
- recent Brain conversations;
- user preferences;
- time of day;
- recent interruption count;
- sleep/wake state;
- meaningful external monitors;
- confidence that data is actually missing vs routine no longer active;
- importance/urgency;
- whether the user already responded negatively multiple times.

### Output

```json
{
  "decision": "silent | message | voice_note | call_candidate",
  "reason": "...",
  "confidence": 0.0,
  "importance": 0,
  "topic": "...",
  "cooldown": "...",
  "context_refs": []
}
```

### Attention budget

The system needs anti-nag behavior:

- maximum interruption density;
- topic cooldown;
- negative-response learning;
- quiet hours;
- routine confidence decay;
- suppression after repeated dismissal;
- escalation only for genuine importance.

Repeated "no" responses are **data**. They should change the model.

### Accountability is about commitments, not database completeness

LifeOS should distinguish:

```text
tracked field missing
≠
user failed a commitment
```

Accountability should be grounded in active goals, routines, commitments and stated priorities. The companion can push when the user is drifting from something they still care about, but it must also allow the user to renegotiate reality conversationally.

Examples:

> "I said I'd finish it tonight but I'm bullshitting, keep me on it."

→ stronger accountability is appropriate.

> "this isn't a priority anymore"

→ reduce/retire the commitment and its nudges.

> "not tonight, move it to tomorrow"

→ update the commitment if the relevant write is safe and clear.

> repeated "no" / silence on a routine

→ increase the probability that the **model is stale**, rather than increasing nag frequency.

A future commitment model should track what was promised, expected timeframe, current state, evidence, and whether Brain is allowed to hold the user to it.

---

## 7. Self-Directed Monitors / Agentic Work

LifeOS should maintain a registry of monitors.

A monitor is a durable question the Brain wants periodically answered.

Examples:

```text
Is an active project becoming stale?
Has an important stock crossed a user-relevant threshold?
Did a tracked company publish thesis-changing news?
Is tomorrow overloaded?
Has sleep deteriorated for several days?
Is a bill/subscription unusually high?
Did an awaited email arrive?
Did a deployment fail?
```

### Brain-created monitors

With user-granted standing permission, Brain may propose or create low-risk monitors without requiring the user to explicitly say "create a scheduled task."

Creation should have:

- reason;
- source/evidence;
- scope;
- cadence;
- expiration/review date;
- notification/escalation policy;
- cost budget;
- confidence;
- user-visible audit trail.

Brain should retire monitors that become irrelevant.

The monitor engine should also periodically review its **own portfolio**:

- which monitors are still justified by the current world model;
- which are duplicative;
- which have never produced useful signal;
- which should become more/less frequent;
- which should expire;
- which new durable questions are implied by active projects, commitments or external dependencies.

A Brain-created monitor is therefore not permanent just because Brain once thought it was useful.

### Important distinction

Autonomy means **choosing what to watch and when to surface it** within permission boundaries.

It does not mean silently taking consequential irreversible actions.

Example:

> LUNR experiences an extreme, verified move or thesis-changing event.

Allowed future behavior under standing permission:

```text
monitor detects event
→ verify with multiple/current data sources
→ importance engine marks critical
→ WhatsApp alert
→ if unread / policy says critical: CALL USER
→ explain what happened and why the monitor escalated
```

Not:

```text
→ place stock trade automatically
```

---

## 8. WhatsApp Becomes a Full Brain Surface

Current text bridge is only the start.

### Current WhatsApp transport constraint

**LifeOS currently uses the self-hosted `whatsapp-web.js` bridge on the Oracle always-on worker. It is not using Meta WhatsApp Cloud API, and vNext must not casually redesign around Meta/Twilio/BSP infrastructure.**

The current bridge/auth/session/provider-correlation work is part of the product architecture. Rich media support should first be investigated and implemented against this existing bridge where technically reliable.

An official paid/provider-backed WhatsApp transport can remain a future optional adapter, not a current dependency.

### 8.1 Images

User can send an image on WhatsApp through the existing `whatsapp-web.js` bridge where supported.

Pipeline:

```text
WhatsApp image
→ bridge receives/downloads media
→ normalize media envelope
→ Brain multimodal route
→ image + relevant LifeOS context
→ natural response
→ optionally extract structured action with normal guards
```

Examples:

- meal/photo context;
- screenshot/error;
- document;
- gym equipment;
- receipt;
- product;
- visual situation.

Raw media retention should be configurable and minimal by default.

### 8.2 Voice notes

User sends WhatsApp voice note:

```text
voice note
→ download audio
→ transcribe
→ same BrainTurn pipeline as text
→ action/answer
→ text reply OR generated voice-note reply
```

The system should preserve:
- transcript;
- original provider correlation;
- confidence;
- optional audio retention policy.

### 8.3 Brain sends voice notes

The Butler can answer with a voice note when:
- user used voice;
- response benefits from tone;
- user preference says voice is welcome;
- message is not better as a quick text.

Voice must sound natural and low-latency, not like a robotic TTS notification.

---

## 9. Realtime Voice / Calls

This is a core product goal, not a gimmick.

### Zero-cash constraint

**Current product constraint: LifeOS must be buildable and usable without new recurring monetary spend.**

Do not make OpenAI Realtime API, Twilio, ElevenLabs, Meta Cloud API, or any other paid cloud provider a required dependency.

Paid services may be documented as future optional adapters, but the default architecture must prefer:

- already-owned/available infrastructure;
- Oracle Always Free worker capacity;
- the existing Vercel/Supabase setup while it remains within free allowances;
- browser-native APIs;
- open protocols such as WebRTC;
- local/open-weight STT, TTS and LLM inference where practical;
- provider/model abstraction so a future paid service can be swapped in without redesigning LifeOS.

"OpenAI call support" therefore means only that a standalone realtime voice engine could someday be connected behind a generic LifeOS voice adapter. **LifeOS itself must not rely on OpenAI for calls or voice.**

### 9.1 Continuous voice session

User can enter a live conversation with Brain:

```text
microphone
↕
voice transport / local speech pipeline
↕
LifeOS Brain tools/memory
```

Zero-cash candidate stack to investigate:

```text
Browser / desktop microphone
        ↓
WebRTC or local streaming transport
        ↓
local STT (e.g. faster-whisper / whisper.cpp class of engine)
        ↓
model-agnostic LifeOS Brain
        ↓
local TTS (e.g. Kokoro / Piper class of engine)
        ↓
streamed audio back to user
```

The exact components are not locked yet; naturalness and latency must be tested on the user's actual hardware.

Requirements:

- interruption/barge-in;
- low latency;
- natural prosody;
- same Butler personality;
- same memory as WhatsApp/app;
- tools available during the call;
- conversation summary saved back to the shared Brain;
- no separate "voice personality."

### 9.2 Brain can call the user

For sufficiently important events, LifeOS should eventually be able to initiate an outbound phone call.

Conceptual flow:

```text
Monitor/event
→ importance verification
→ escalation policy
→ call transport adapter
     ↳ WhatsApp call experiment first
     ↳ PWA/WebRTC fallback
     ↳ paid PSTN/SIP only as optional future transport
→ realtime voice Brain
→ "Ale, this is worth your attention..."
```

Calls are a high-attention channel and require strict policy:

- user opt-in;
- importance threshold;
- quiet-hour emergency rules;
- rate limits;
- duplicate suppression;
- verified event state;
- cost limit;
- audit trail.

A call should mean something.

Possible implementation paths must be separated by cost:

**€0 path first**
- LifeOS-initiated high-priority notification that opens/launches a realtime WebRTC/PWA/desktop voice session;
- local/open speech pipeline;
- existing Oracle worker for signaling/orchestration where useful.

**True PSTN/mobile-phone call**
- remains a desired escalation channel, but should not be treated as solved under the €0 constraint;
- ordinary outbound PSTN termination normally requires a telephony carrier/provider and can incur usage cost;
- do not add a paid telephony dependency now.

**WhatsApp call transport**
- investigate separately against the current `whatsapp-web.js` bridge;
- do not assume outbound programmable WhatsApp voice calls are available merely because incoming call events can be observed;
- if the current library cannot reliably originate/handle media calls, keep this as a future transport problem rather than replacing the whole WhatsApp stack.

---

## 10. ChatGPT ↔ LifeOS Integration

This is strategically important because ChatGPT is currently the user's most-used thinking/conversation surface.

### Desired experience

During a normal ChatGPT conversation:

> "This changed. Make sure LifeOS knows."

or even, when appropriate and available through the integration:

> "Update LifeOS with the important changes from this conversation."

ChatGPT calls LifeOS tools and sends structured updates.

Conversely:

> "What did I do on LifeOS this week?"

ChatGPT can query LifeOS.

### Do not copy the entire conversation blindly

Prefer:
- decisions;
- project changes;
- new/retired routines;
- preferences;
- commitments;
- important events;
- goals;
- durable personal context.

Every synced item should retain provenance such as:

```json
{
  "source_system": "chatgpt",
  "source_kind": "conversation_summary",
  "captured_at": "...",
  "confidence": 0.94
}
```

### Import/backfill

A one-time import of exported ChatGPT conversations may be useful to bootstrap LifeOS's autobiographical knowledge, but should run through curation/deduplication rather than become raw active memory.

### Existing MCP baseline — do not rebuild this integration from scratch

LifeOS already has a deployed MCP v1 at `/api/mcp` with static-token auth for custom clients and OAuth authorization-code + PKCE support specifically for ChatGPT connectors.

Current MCP implementation is intentionally **read-only**.

Current repo tools:

- `get_lifeos_snapshot`
- `get_lifeos_context`
- `get_recent_workouts`
- `get_workout_intelligence`
- `get_health_summary`
- `get_open_memos`
- `get_upcoming_calendar`
- `get_projects_status`
- `get_brain_debug_context`
- `get_whatsapp_outbox_recent`
- `get_whatsapp_proactive_debug`
- `search_lifeos_vault`
- `get_open_loops`

The MCP also exposes LifeOS resources for snapshot/context/today/week/health/workouts/memos/calendar/projects/Brain/WhatsApp/Vault plus reusable prompts for morning brief, evening review, weekly review, workout analysis, Brain bug analysis, and project execution review.

`get_lifeos_context` / `lifeos://context/today` already provide an important vNext primitive: the shared **LifeOS Context Compiler**, which combines today/next days, health/sleep, workouts, project staleness/carryover, failed actions, WhatsApp issues, pending Brain actions, and ranked open loops. Companion vNext should extend/reuse this compiler rather than building another parallel context aggregator.

Current MCP security is personal/single-user, resolved through the configured LifeOS user and server-side service role. That is acceptable for the current personal build but is not the final public multi-user model.

#### Connector exposure note

The current ChatGPT connector surface observed on 2026-09-18 exposed a subset of 10 read operations:

- snapshot;
- recent workouts;
- health summary;
- open memos;
- upcoming calendar;
- projects status;
- Brain debug context;
- recent WhatsApp outbox;
- Vault search;
- open loops.

The repo itself implements additional read capabilities (`get_lifeos_context`, `get_workout_intelligence`, and `get_whatsapp_proactive_debug`). Keep the deployed MCP/tool manifest and connector registration in sync so external clients receive the full useful surface.

#### MCP v2 requirement for Companion

Do **not** turn MCP v2 into unrestricted CRUD.

Add a small semantic write surface designed around the world model:

```text
lifeos.sync_context
lifeos.remember
lifeos.update_current_belief
lifeos.update_preference
lifeos.upsert_project_context
lifeos.suggest_monitor
lifeos.create_monitor
lifeos.suspend_monitor
lifeos.retire_monitor
lifeos.log_external_event
```

The exact names/schema are not final.

Important distinction:

```text
ChatGPT says what changed / what was learned
        ↓
LifeOS validates semantic object + provenance
        ↓
world-model mutation / monitor mutation
        ↓
audit event
```

External clients should **not** write arbitrary Supabase rows or invoke arbitrary Brain internals.

MCP write calls should carry:

- provenance/source system;
- source timestamp;
- confidence where applicable;
- semantic type;
- idempotency key;
- user-visible summary;
- supersession target when updating a belief;
- autonomy/permission basis for monitor creation.

Low-risk memory/current-state synchronization may eventually operate under standing permission. Consequential external actions remain behind their own action policies.

#### ChatGPT sync modes

Build this progressively:

**Mode 1 — explicit**
> "sync the important changes from this conversation to LifeOS"

ChatGPT emits a compact set of semantic updates through MCP.

**Mode 2 — assistant-suggested**
ChatGPT recognizes that a project/routine/preference materially changed and offers/initiates sync according to connector permission behavior.

**Mode 3 — ambient high-value sync**
If/when the ChatGPT platform permits the required connector behavior and the user grants standing permission, meaningful context can synchronize without requiring ritual command phrasing.

The LifeOS backend semantics must work in all three modes so platform UX changes do not require another architecture rewrite.



---

## 11. Local Desktop Companion

Still part of vNext, but not necessarily the first visible feature.

The companion eventually provides local sensors/tools that a browser/PWA cannot reliably provide:

- foreground app;
- browser/tab context;
- focus sessions;
- screen watch;
- microphone;
- optional camera/posture signals;
- local file indexing;
- desktop overlays;
- local notifications.

Privacy principle:

> process sensitive raw sensor data locally and transmit only the minimum semantic signal needed by Brain.

Example:

```json
{
  "focus_session": true,
  "on_target": false,
  "drift_seconds": 18
}
```

instead of permanent browsing history.

Issue #1 remains useful as the Focus/desktop-organ implementation slice, but it is subordinate to this larger Companion vNext vision.

### 11.1 LifeOS UI / iPhone PWA role

The UI is not a usage quota LifeOS must force the user to satisfy. If WhatsApp, ChatGPT and voice are where interaction naturally happens, the UI should become the **control room**:

- inspect what Brain currently believes;
- inspect/override active routines, commitments and monitors;
- see why an interruption was sent, suppressed or escalated;
- review actions and provenance;
- inspect channel/bridge health;
- tune autonomy/attention permissions;
- manually enter a Brain conversation when useful.

The installed iPhone PWA is also the zero-cash fallback communication surface. It can use standards-based Web Push to surface a high-priority "Brain is calling" event and open a WebRTC voice room. This is not equivalent to native PushKit/CallKit ringing, but it gives LifeOS a provider-independent fallback if WhatsApp-call media remains too fragile.

---

## 12. Channel Escalation Ladder

LifeOS chooses the least intrusive channel likely to work.

```text
silent observation
      ↓
LifeOS UI signal
      ↓
WhatsApp text
      ↓
WhatsApp voice note
      ↓
push / repeated alert
      ↓
phone call
```

The appropriate level depends on:

- urgency;
- confidence;
- user preference;
- whether previous attempts were read/answered;
- time sensitivity;
- cost;
- quiet hours;
- topic sensitivity.

---

## 13. Architecture Direction

```text
                           ┌──────────────────────┐
                           │      LIFEOS BRAIN    │
                           │ route / reason / plan│
                           └──────────┬───────────┘
                                      │
           ┌──────────────────────────┼──────────────────────────┐
           │                          │                          │
           ▼                          ▼                          ▼
      WORLD MODEL                ATTENTION ENGINE              TOOLS
  current state + memory       should we intervene?      safe actions/APIs
           │                          │                          │
           │                          ▼                          │
           │                    BUTLER LAYER                    │
           │                 what/how do we say?                │
           │                          │                          │
           └──────────────┬───────────┴───────────┬──────────────┘
                          │                       │
                 COMMUNICATION BUS          MONITOR ENGINE
                WhatsApp / Voice /         watches / events /
                Calls / App / ChatGPT      scheduled reasoning
                          │                       │
                          └───────────┬───────────┘
                                      │
                                 EVENT LEDGER
                           provenance / outcomes /
                              feedback / traces
```

### Infrastructure roles

**Supabase**
- structured LifeOS state;
- autobiographical memory;
- embeddings/pgvector;
- monitor registry;
- event ledger;
- conversation state;
- permissions/policies.

**Vercel / LifeOS API**
- authenticated Brain API;
- safe tools;
- semantic routing;
- memory retrieval;
- attention evaluation;
- channel-independent BrainTurn logic.

**Oracle always-on worker**
- existing `whatsapp-web.js` bridge;
- polling/event workers;
- long-running monitor workers;
- future lightweight media/orchestration jobs that fit the free machine;
- signaling for free realtime voice if useful;
- no paid telephony dependency by default.

**Desktop companion**
- local sensors;
- focus;
- screen/app context;
- local files;
- desktop voice/overlay.

---

## 14. New Data Concepts to Design

Do not treat these schemas as final yet. They represent required concepts.

### user_beliefs / world state

Current and historical beliefs with:

- subject;
- predicate;
- value;
- valid_from / valid_to;
- confidence;
- source;
- supersedes;
- last_confirmed_at.

### monitor_registry

- user_id;
- topic/type;
- monitor spec;
- reason;
- created_by (user/brain/system);
- autonomy basis;
- cadence/event source;
- active/suspended/retired;
- expires/review_at;
- escalation policy;
- cost budget.

### attention_events

- candidate event;
- decision;
- importance;
- confidence;
- suppression reason;
- chosen channel;
- resulting intervention.

### communication_preferences

Can be represented as memory initially, but eventually should support:

- preferred channels;
- quiet hours;
- call permission;
- voice-note preference;
- topic-level suppression;
- style preferences;
- interruption budget.

### external_context_sync

Track high-value context imported from ChatGPT or other intelligence surfaces with provenance and deduplication.

---

## 15. Implementation Phases — Current Draft

This order can change as this living spec evolves.

### Phase A — Make the existing Brain feel alive

1. Butler response layer for WhatsApp.
2. Semantic routine/preference changes.
3. Stop repeated nagging based on negative replies/stale-routine inference.
4. Natural reply generation after deterministic writes.
5. Multi-bubble support.
6. Better shared context injection.

**Success test:** WhatsApp feels like a continuing person, not a CRUD interface.

### Phase B — Deep autobiographical memory

1. world-state beliefs + supersession;
2. project memories;
3. episodic memories;
4. preference/relationship memory;
5. curator;
6. hybrid retrieval improvements;
7. stale-belief detection.

**Success test:** Brain knows major current projects, changing routines, preferences, recent decisions, and relevant history without being manually re-taught.

### Phase C — ChatGPT bridge

1. define LifeOS MCP/API tool surface;
2. read tools;
3. explicit structured context sync;
4. project/memory/preference writes with provenance;
5. optional conversation export ingestion/backfill;
6. evaluate future automatic/supported sync capabilities as platforms evolve.

**Success test:** important context learned in ChatGPT can become LifeOS context without retyping it manually.

### Phase D — Rich WhatsApp

1. inbound images;
2. multimodal Brain;
3. inbound voice notes;
4. transcription;
5. outbound generated voice notes.

**Success test:** WhatsApp supports natural multimodal conversation with the same Brain.

### Phase E — Realtime voice

1. realtime voice transport;
2. Brain tool adapter;
3. interruption/barge-in;
4. shared memory/context;
5. post-call episodic summary.

**Success test:** a fluent live conversation feels like speaking to the same companion from WhatsApp.

### Phase F — Attention + self-directed monitors

1. monitor registry;
2. standing autonomy permissions;
3. Brain-suggested monitors;
4. Brain-created low-risk monitors;
5. attention budget;
6. monitor retirement/review;
7. cross-domain patterns.

**Success test:** Brain discovers useful things to watch without becoming noisy.

### Phase G — Escalation / outbound calls

1. importance policy;
2. isolated WhatsApp-call proof of concept on Oracle;
3. test outgoing ring + synthetic Brain audio;
4. test PulseAudio/PipeWire capture of the remote participant;
5. if bidirectional WhatsApp media is unreliable, implement PWA Web Push + WebRTC fallback;
6. connect the successful transport to the realtime Brain session;
7. add critical-event verification, rate limits, audit and duplicate suppression;
8. keep paid PSTN/SIP as an optional future adapter only.

**Success test:** an actually urgent event can cause LifeOS to call, while ordinary noise never does.

### Phase H — Desktop organs

1. local companion;
2. focus sessions;
3. app/tab awareness;
4. screen watch;
5. local files;
6. optional local camera signals;
7. overlays.

---

## 15.1 First implementation slice — before desktop Focus

Before Issue #1 / desktop Focus becomes the main build effort, Companion vNext should attack the current pain where it already exists: WhatsApp + stale memory/state.

Suggested first vertical slice:

1. introduce a channel-independent Butler rendering contract so deterministic action results are not themselves the final prose;
2. preserve deterministic proactive target ownership/writes;
3. add compound-turn handling so residual semantic meaning survives after a proactive reply is resolved;
4. add explicit current-routine/current-belief representation with supersession;
5. let natural language suspend/retire/reactivate a routine or monitor;
6. feed those current beliefs into proactive candidate generation so inactive routines stop producing candidates;
7. add anti-nag feedback from repeated negative replies;
8. add regression coverage for the exact stale-skincare journey;
9. then broaden proactive messages into project/commitment/pattern conversations;
10. expose the new current-state/monitor context through MCP and design the first semantic MCP v2 sync operation.

**Definition of done:** after the user naturally explains that a previously tracked routine is no longer part of their life, LifeOS understands the change, stops future related nudges, remembers the transition with provenance, and responds like the same Butler rather than a CRUD confirmation.

## 15.2 Second implementation slice — explicit semantic MCP sync

Slice 2 turns the existing read-only MCP into the first **two-way ChatGPT ↔ LifeOS bridge** without exposing generic CRUD.

Primary outcome:

```text
explicit user request to sync
        ↓
external MCP client (for example ChatGPT)
        ↓
small curated semantic delta set
        ↓
LifeOS write scope + semantic validation + entity grounding
        ↓
world-model belief transitions + audit
        ↓
readable immediately through shared LifeOS context
```

Scope for this slice:

1. keep all existing MCP read tools backward compatible;
2. add explicit `lifeos.write` authorization separate from `lifeos.read`;
3. existing read OAuth/static credentials must not silently gain write power;
4. add one narrow semantic sync MCP tool rather than table-level CRUD;
5. support only a small low-risk set:
   - tracked routine state;
   - bounded user preferences;
   - grounded context for existing LifeOS projects;
6. validate and ground the full request before the first mutation;
7. preserve idempotency, request conflict detection, provenance and audit history;
8. reuse `brain_beliefs` temporal supersession rather than bypassing it;
9. expose synced preferences/project context through the shared Context Compiler/current-belief reads;
10. prohibit operational side effects: no WhatsApp send, monitor creation, calendar/memo/expense/Health operational write, project progress/money/session mutation, arbitrary Brain execution or SQL;
11. remain provider-agnostic: `chatgpt` is provenance, not a backend dependency;
12. explicit sync only; ambient/background ChatGPT synchronization remains future work.

Execution brief: `docs/CODEX_COMPANION_VNEXT_SECOND_SLICE.md`.

**Success test:** after the user explicitly asks ChatGPT to sync a few important changes, LifeOS safely receives the supported semantic updates, records exactly where they came from, rejects unsupported/ambiguous writes, and can immediately return the new current state while existing read-only clients remain read-only.

---

## 16. Immediate Behavioral Fix: Skincare Example

Current failure:

```text
LifeOS believes skincare should happen
→ not logged
→ asks every day
→ user repeatedly says "no"
→ system records no but never updates the belief
→ repeats forever
```

Desired:

```text
LifeOS: "you still doing skincare these days?"
User: "nah I stopped like a month ago"
        ↓
semantic interpretation
        ↓
routine state: skincare = inactive
existing skincare accountability monitor: retired
preference/event memory: saved with provenance
        ↓
Brain: "got it"
        ↓
no more skincare nagging
```

Even if the user instead says:

> "bro you've asked me this for a week, I'm obviously not doing it anymore"

the same underlying update should occur.

---

## 17. Non-Negotiables

- No exact-phrase UX for normal conversation.
- No repeated nagging when evidence says the world model is stale.
- No separate personalities per channel.
- No raw chain-of-thought persistence.
- No silent destructive/consequential external actions.
- No permanent storage of sensitive sensor detail unless it is genuinely needed and explicitly allowed.
- No giant unfiltered memory dump in every prompt.
- No model-specific architecture lock-in.
- No "agent council" merely for the aesthetic of agents.
- No pretending an unsupported platform capability exists.
- No critical alert based on one unverified noisy signal.
- No new required recurring paid service while the €0 constraint is active.
- Core architecture must stay provider/model agnostic.
- Reliability tests grow with every real incident.

---

## 18. Open Questions / Decisions to Refine

This section should evolve with future discussions.

- Exact Butler personality and whether the user can tune it conversationally.
- Which memories should be visible/editable vs mostly invisible.
- How aggressively Brain may create monitors under standing permission.
- Compute/resource budgets for local models and free-tier infrastructure; paid API budget is currently **€0**.
- Exact escalation policy for finance/company/news monitors.
- Which zero-cost local/browser speech stack gives acceptable realtime quality on the user's hardware.
- WhatsApp currently stays on the existing self-hosted `whatsapp-web.js` bridge; any future official transport is an optional productization decision, not part of current vNext.
- How ChatGPT context sync should work on the user's current ChatGPT plan given platform integration constraints.
- Whether a bootstrap import of ChatGPT history is worth doing.
- How much of LifeOS UI should remain once conversational surfaces are dominant.
- When to implement Focus/Desktop Companion relative to memory/voice.
- Whether positive spontaneous observations should have their own attention budget.

---

## 19. Product Test

LifeOS Companion vNext is succeeding when interactions like this are ordinary:

```text
Brain: "ale"

Brain: "Hair Style hasn't moved in like a week. are we still doing this or did priorities change?"

User: "still doing it, just been focused on lifeos. remind me tomorrow afternoon"

Brain: "yeah fair"

[LifeOS understands the project is still active, creates the appropriate low-risk reminder,
and updates context without requiring special syntax.]
```

Or:

```text
[An important verified monitor fires.]

LifeOS attempts WhatsApp → event is genuinely time-sensitive → escalation policy permits calls.

Phone rings.

Brain: "Ale — quick one. Something material just happened with the thing we're monitoring. I've verified it. Want the 30-second version?"

[The user can continue a fluent conversation and Brain has the same memory/tools as every other surface.]
```

Additional acceptance tests:

```text
Brain: "skincare?"
User: "bro I stopped doing that like a month ago"
Brain: natural acknowledgement

[No skincare candidate tomorrow. Current routine state is inactive.
The historical fact that skincare used to be tracked is retained but no longer treated as current.]
```

```text
Brain: "Hair Style hasn't moved in a week. still doing it?"
User: "yeah, LifeOS took over this week. don't let me abandon Hair Style though"

[Brain keeps the project active, captures the priority/context change,
and may create or adjust a low-risk monitor under standing permission.]
```

```text
User starts in WhatsApp: "I need to figure out the voice architecture"
Later opens voice session: "where were we?"

[Brain can recover the active semantic topic without treating voice as a new assistant.]
```

That is the level this project is aiming for.

---

## 20. Changelog

### 2026-09-25 — Slice 2 execution brief: explicit semantic MCP sync
- Defined the next Companion vertical slice as the first write-capable ChatGPT/LifeOS bridge.
- Write authority is separate from existing `lifeos.read`; old read OAuth/static credentials must remain unable to mutate LifeOS.
- The initial semantic write surface is intentionally narrow: tracked routine state, bounded preferences, and grounded context for existing projects.
- Explicitly prohibited arbitrary CRUD/SQL, Brain action execution, monitor creation and operational side effects from the sync tool.
- Added request-level idempotency/conflict detection, provenance/audit, full-request validation-before-write, and shared Context Compiler readback as slice requirements.
- Ambient/background ChatGPT synchronization remains future work.

### 2026-09-18 — Gap audit: conversational semantics and provider independence
- Added provider/model independence as a global Brain constraint, not merely a voice implementation detail.
- Made cross-channel continuity explicit: semantic conversation state belongs to Brain; provider metadata belongs to transports.
- Added compound-turn handling so deterministic proactive resolution cannot discard meaningful residual statements such as "I stopped doing skincare a month ago."
- Expanded proactive behavior beyond missing fields into commitments, curiosity, project momentum, positive evidence, anomalies, opportunities and patterns.
- Reframed accountability around active commitments rather than database completeness.
- Added self-review/retirement of Brain-created monitor portfolios.
- Corrected call planning to WhatsApp-call experiment first, PWA/WebRTC zero-cost fallback, paid PSTN/SIP optional only.
- Clarified that the LifeOS UI/PWA is a control room and fallback communication surface, not the primary interaction requirement.
- Added a concrete first Companion implementation slice centered on WhatsApp + stale world-model behavior before desktop Focus.
- Added conversational end-to-end acceptance tests.

### 2026-09-18 — Existing MCP promoted to Companion integration backbone
- Confirmed LifeOS already has MCP v1 with static-token clients plus OAuth/PKCE support for ChatGPT connectors.
- MCP v1 is deliberately read-only and exposes high-value LifeOS context, Context Compiler output, workout intelligence, Vault search, Brain/WhatsApp diagnostics, open loops, resources and reusable prompts.
- Companion vNext will extend this MCP rather than inventing a separate ChatGPT bridge.
- Defined MCP v2 direction around semantic world-model/project/preference/monitor mutations with provenance, idempotency and auditability instead of unrestricted database CRUD.
- Noted a current connector-surface mismatch: the ChatGPT-exposed tool set is a subset of the capabilities implemented in the repo.

### 2026-09-18 — Voice transport direction: WhatsApp-call spike first, PWA/WebRTC fallback
- Researched current `whatsapp-web.js` stable call API and active upstream call work.
- Stable `whatsapp-web.js` 1.34.7 exposes incoming Call metadata/reject only; current LifeOS bridge therefore cannot originate a fluent Brain call as-is.
- Upstream PR #201825 (still unmerged as of 2026-09-18) has been live-tested for outgoing WhatsApp voice calls, accept/end, connection state, and synthetic audio injection in headless Chromium. This means a zero-cost Brain-initiated WhatsApp call that **speaks** generated audio is technically plausible with an experimental fork/patch.
- Critical limitation: that PR does not expose the caller's remote audio. The contributor reports WhatsApp Web carries call audio through a WASM/data-channel pipeline rather than ordinary WebRTC audio tracks, so a normal library-level remote-audio capture hook is unavailable.
- Research spike proposed before abandoning WhatsApp calls: route Chromium output on Oracle into a dedicated PulseAudio/PipeWire virtual sink and capture the sink monitor externally (FFmpeg/parec), then stream chunks to STT. If this works reliably, the zero-cost full duplex path becomes: WhatsApp native call rings iPhone → Oracle captures incoming decoded audio → STT → Brain → local TTS → injected audio back into WhatsApp call.
- Treat this PulseAudio capture path as an experiment, not an assumed production capability. It depends on WhatsApp Web internals and headless/headful Chromium audio behavior and must pass real-device latency/reconnect tests.
- PWA/WebRTC remains the clean fallback for true full-duplex audio. Installed iPhone Home Screen web apps support standards-based Web Push, so Brain can send an incoming-call-style notification for free; tapping it opens LifeOS into a WebRTC voice room. A pure PWA does **not** get native PushKit/CallKit incoming-call UI/background VoIP behavior, so it is not equivalent to a native WhatsApp/Phone ringing screen.
- Current preference: prototype WhatsApp calls first because the native WhatsApp ring UX is exactly what the product wants and requires no paid telephony. Fall back to PWA/WebRTC if reliable bidirectional WhatsApp audio capture proves too fragile.
- Do not depend directly on unmerged upstream code in the main bridge without pinning the exact fork/commit and adding a kill-switch/fallback to the stable text bridge.

### 2026-09-18 — Cost/transport constraints clarified
- Confirmed current WhatsApp transport is the Oracle-hosted `whatsapp-web.js` bridge, not Meta Cloud API.
- Added hard current constraint of **€0 new recurring spend**.
- Reframed realtime voice around WebRTC/local STT/local TTS/model adapters.
- Marked true outbound PSTN calls as a desired future escalation transport, not a currently free solved dependency.
- Explicitly made OpenAI/Twilio/paid realtime providers optional adapters only.

### 2026-09-18 — Initial vNext vision
Captured:
- companion/butler as product north star;
- ChatGPT ↔ LifeOS context bridge;
- natural semantic routine/monitor control;
- autobiographical memory/world model;
- anti-nag attention engine;
- Brain-created monitors under standing autonomy;
- WhatsApp images;
- WhatsApp voice notes;
- outbound generated voice notes;
- realtime voice;
- high-importance outbound phone calls;
- escalation ladder;
- desktop companion/focus as later organ;
- explicit skincare stale-belief failure case.