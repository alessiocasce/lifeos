# LifeOS Jarvis Companion

Status: **design approved 2026-11-22, not implemented.** The review questions in section 11 were answered on 2026-11-22. Sources for external facts are in section 13. The product goals and principles come from [Companion vNext](../LIFEOS_COMPANION_VNEXT.md). Where the two documents conflict, this spec wins (see section 12).

## 1. Goal

LifeOS Brain should feel like a personal assistant / second brain. It lives in WhatsApp and on the phone, speaks Italian, and remembers what the user says. It keeps the user to their commitments, thinks with them about ideas, asks about things on its own initiative, and calls when a call is worth it.

The test is the relationship, not a feature list: "it keeps track and seems conscious, like a real person." Awareness is shown through conversation, not through a "what Brain knows" screen.

## 2. Why the current Brain falls short

Diagnosis from the 2026-11-21 code review (`api/ai/chat.js` and `api/_utils/brain*.js`, about 19k lines):

1. **It is a command parser with chat as the fallback.** Every turn is forced into one path: pending action → proactive reply → router → BrainTurn Contract → command draft → planner. Most of the code exists to stop writes. Companion features were added as early exits around this core, not inside it.
2. **There is no agent loop.** The model returns one JSON plan with one intent. It cannot read projects, check the calendar, then decide within one turn.
3. **Its initiative is narrow.** Proactive output is limited to timed memos, five health check-ins and a project-staleness monitor whose permission to message is off by default.
4. **Deadlines and ideas have no home.** `projects` has no deadline, and a deadline can only become a memo. Ideas are not an object at all: memory extraction keeps at most 3 durable facts per turn.
5. **The €0 rule rules out the headline features.** It ruled out real phone calls and kept the Brain on free-tier Gemini Flash at about 6 model calls per message.
6. **Understanding is regex-first.** Hundreds of Italian/English patterns decide behaviour before the model does.
7. **LifeOS doesn't see the user's thinking.** It happens in ChatGPT and Claude, so LifeOS only sees what is typed into it deliberately.

## 3. Decisions

| Area | Decision |
|---|---|
| Top jobs | 1. chase deadlines/commitments, 2. capture and resurface ideas, 3. thinking-partner chat |
| Surfaces | WhatsApp is the everyday surface. The app Companion tab uses the same Brain. Deep sessions stay in ChatGPT (used more) and Claude and sync in. |
| Language | Italian, with the same persona on every channel |
| Core | Replace the router/contract/planner pipeline with an agent loop. Safety lives in tools. |
| Autonomy | High; see 4.10 |
| Calls | Real two-way phone calls with the same Brain from an Italian number, and the user can reach it by phone |
| Budget | €30 for the first month as a measured trial, including the ElevenLabs Starter plan; replaces the €0 constraint |
| Quality bar | "Everything exactly how I want, bulletproof, no bugs." Steps are gated by tests and real use (section 8). |
| Priority | Important but not the user's main project. Every step must be usable on its own within about a week of part-time work. |
| Outside sources | Gmail (read-only) and LifeOS's own calendar. The user's personal WhatsApp is never linked. |

## 4. Behaviour

### 4.1 Conversation and continuity

- **Persona.** The Butler character from vNext §5: concise, casual, willing to call the user out, no manufactured praise, no narrating database operations. It speaks Italian.
- **One timeline.** WhatsApp messages, app chat, call transcripts and proactive messages form one timeline. Brain must be able to say "come mi hai detto stamattina al telefono" on WhatsApp, and the reverse.
- **Open threads.** Brain tracks topics it is waiting on (a question it asked, a check-in it promised) and picks them up naturally.
- **Asking about things.** Brain may schedule its own follow-ups ("domani ti chiedo com'è andata") and ask when its picture of the user's life looks stale (vNext §5). Every proactive message needs a concrete reason.
- **Awareness without a UI.** No new "what Brain knows" screen. Questions like "cosa stai tenendo d'occhio?" are answered in chat.

### 4.2 Commitments

A **commitment** is anything the user is expected to do or attend. It replaces memos.

- **Kinds:** reminder, task/deliverable, project deadline, soft promise ("stasera finisco il deck"), recurring obligation (rent, weekly upload), hard external date (exam, bill, submission).
- **Fields (conceptual):** what; due (date with optional time); hard or soft; optional project; chase intensity (`gentle`, `coach` (default), `drill`); recurrence; source (channel and message); chase state; snoozed-until.
- **Capture.** Commitments are picked up from any conversation, including passing remarks, and confirmed in one line ("segnato: deck entro venerdì"). Correcting or removing one is a normal reply.
- **Coach ladder** (default for hard commitments):
  1. a progress check a few days before;
  2. a reminder the day before;
  3. a nudge on the morning of (usually inside the morning call);
  4. a call when the user has gone silent near the deadline (4.5).

  Soft commitments get at most a reminder and a follow-up, and never cause an escalation call.
- **Per-commitment intensity.** "Stammi addosso su questa" raises it to `drill`.
- **Renegotiation always works.** "Non stasera, spostalo a giovedì" and "non è più una priorità" update or retire the commitment. Repeated "no" or silence lowers pressure and raises Brain's suspicion that its model is stale; it does not raise nag frequency (vNext §6).
- **Recurring obligations** produce their next occurrence when the current one is completed or passes.
- **Memos merge in.** Existing memos become commitments of kind reminder, and the Memos tab becomes a view of them. A project deadline is a commitment linked to that project, so `projects` does not change.

### 4.3 Ideas

- Ideas are captured silently from WhatsApp, voice notes, calls and synced ChatGPT/Claude sessions.
- Brain replies briefly: it links the idea to projects and earlier ideas and asks at most one sharp question.
- It resurfaces ideas in a weekly digest (inside a morning call or as a text) and whenever an idea becomes relevant to a current conversation, project or commitment.
- It develops an idea further only when asked ("sviluppiamola"). It can then propose turning it into a project, which needs explicit confirmation.

### 4.4 Daily rhythm

- **Morning call:**
  - Brain calls every morning at 09:00, weekends included (R6).
  - The user can move or cancel calls in conversation ("domani non chiamarmi", "chiamami alle 12", "nel weekend più tardi").
  - The call is short; its length follows its content: today's commitments, the chase-ladder items, anything Brain decided is worth saying.
  - Brain skips the call only on a genuinely empty day.
- **No answer:** retry once after about 10 minutes. If that also fails, send the briefing as a WhatsApp text. Voicemail counts as no answer and Brain never leaves a voicemail.
- **During the call:** "non posso parlare, richiamami tra un'ora" reschedules the call. "Scrivimelo" ends the call and sends the briefing as text.
- **Evening check-in:** a WhatsApp text, only on days a commitment was due ("il deck è partito? domani cosa c'è?").

### 4.5 Calls

- **Two-way.** Calls are real conversations with the same Brain: same persona, timeline, commitments and tools. The user can create, complete or move commitments during a call.
- **Call types:** the morning call; escalation; occasional reminder calls ("ricordati che stasera hai X"); event calls (important email, imminent calendar event); critical calls.
- **Escalation trigger:** a hard commitment due within ~24h, plus 2 unanswered texts at least 3h apart.
- **Critical calls.** Brain decides what is critical, and critical calls may break quiet hours. A critical call opens by saying why it is calling. Feedback such as "non valeva una chiamata" adjusts future judgement. If the first critical call isn't answered, Brain calls again within 3 minutes. That second call gets through iPhone Do Not Disturb / Sleep Focus when "Allow Repeated Calls" is on (onboarding checklist, step 3).
- **Guardrails** (deterministic; the model cannot override them):
  - at most one call per hour;
  - quiet hours 23:00–08:30 except critical, adjustable in conversation;
  - availability (4.6) is honoured;
  - feedback like "non chiamarmi per queste cose" changes behaviour permanently;
  - Brain asks whether calls have become too frequent if the recent rate rises;
  - there is no daily cap.
- **Reaching Brain by phone:** the user calls Brain's Italian number (a domestic call), or their secondary SIM if it forwards to that number (5.4). "Chiamami" on WhatsApp also gets a call back within a minute.

### 4.6 Availability, quiet hours and stop commands

- **Availability** is a current state with an expiry, honoured by both texts and calls. Examples: "sono a lavoro fino alle 6", "domani niente chiamate", "in vacanza fino a lunedì, solo messaggi", "lasciami stare oggi".
- **Calendar.** Brain uses the LifeOS calendar to avoid calling during events, and infers no other availability from it. Reminders before events are a separate trigger (4.8).
- **Stop commands.** "Smettila di chiamarmi" and "stop tutto" take effect immediately and deterministically, and Brain confirms them. Resuming is explicit.

### 4.7 Voice notes

- Inbound WhatsApp voice notes are transcribed and handled exactly like text.
- Brain sometimes replies with a voice note: when the user sent one, or when tone helps. Text stays the default.

### 4.8 Outside triggers

- **Gmail** (read-only). Brain judges which mail matters, using the user's plain-language rules ("se scrive la banca dimmelo; se è urgente chiamami") and its own judgement. It texts or calls according to 4.5.
- **Calendar.** LifeOS `calendar_events` can trigger a message or call shortly before an event ("tra un'ora hai X").
- **Other people's WhatsApp messages are out of scope.** Linking the user's personal account to the unofficial bridge risks a ban of the main number. Email is the channel for "someone needs something".

### 4.9 Deep-session sync (ChatGPT and Claude)

- New MCP write tools let a ChatGPT or Claude conversation save ideas, decisions, commitments and project updates to LifeOS: `capture_idea`, `upsert_commitment`, `log_decision`, `update_project_context`.
- A custom instruction in each app tells the assistant to call them whenever these come up. The user doesn't have to say "sync".
- Synced items keep their provenance. Brain can reference them on WhatsApp ("ieri su ChatGPT avevi deciso…").
- Content synced from ChatGPT/Claude can create or update commitments, ideas and context only. It never triggers deletes, calls or calendar changes by itself.

### 4.10 Autonomy and undo

| Action | Behaviour |
|---|---|
| Capture ideas, notes, memories; log habits, sleep, wake and expenses | Silent |
| Create, update or complete commitments; adjust its own check-ins and nag frequency; set availability | Do it, mention it in one line |
| Create or move calendar events | Do it, mention it, with undo |
| Change project status (paused, done) | Only on an explicit statement; ask if inferred |
| Delete anything | Ask first |
| Contact other people; money movements | Not built |

- **Undo.** "Annulla" undoes the last action in chat. Every write records how to reverse it. Undo works at least for the last 24h of actions, by description ("annulla l'evento di prima").
- **Confirmation can't be faked.** A confirmation-required tool stores a pending action. It runs only when the user's *next message* is a deterministic affirmative, reusing `normalizePendingReplyIntent`. The model cannot confirm on the user's behalf.

## 5. Architecture

### 5.1 Agent loop

One loop serves WhatsApp, the app and call tools:

```text
inbound (WhatsApp / app / call webhook / proactive moment)
  → serialize per user (one turn at a time across all channels)
  → assemble context
  → model with persona + tools (multi-step tool use, bounded steps)
  → tools validate, check autonomy class, execute, record undo
  → persist reply + tool calls to the shared timeline and trace
```

- **Context assembly** (target ≤ ~8k tokens):
  - the persona;
  - now, availability and quiet-hours state;
  - open commitments due soon;
  - today's calendar;
  - active projects (from `lifeosContextCompiler.js`);
  - current beliefs;
  - retrieved memories and ideas relevant to the message;
  - the last ~20 cross-channel timeline entries;
  - open threads;
  - the last actions with undo ids.
- **Interaction ownership stays.** The quoted message or active interaction from `brainInteractionSelection.js` is passed to the model as "the user is replying to: …". The deterministic quote validation stays.
- **Models:** two tiers behind one adapter.
  - The *fast* tier handles everyday turns and proactive wording.
  - The *deep* tier handles idea development, the weekly digest and planning.
  - Providers are chosen in step 0 by measuring quality, latency and cost on the eval set. Candidates are Gemini Flash-class and Claude Haiku/Sonnet-class models.
  - Chosen on 2026-11-23 (section 10, step 0): the fast tier is `gemini-3.8-flash`. The deep tier is provisionally the same model at high thinking. Claude has not been measured yet.
  - Paid tiers only. Free-tier data terms are not acceptable for a second brain.
- **Latency:** WhatsApp p95 reply < 20s. The bridge times out at 120s.
- **Trace:** every turn records model, steps, tool calls with results, tokens, estimated cost and latency, extending `brain_trace`. No chain-of-thought and no secrets.

### 5.2 Tool catalog (initial)

- **Read:** `get_today`, `list_commitments`, `get_project`, `search_memory`, `search_ideas` (step 4), `get_calendar`, `get_health_summary`, `search_vault`, `get_training_summary`. Real conversations ask about training more than anything else, so the step 0 review added the training reader.
- **Write:**
  - Silent: `capture_idea`, `remember`, `log_habit`, `log_sleep_start` (canonical sleep-start behaviour, unchanged), `log_wake`, `log_expense`.
  - Do and mention: `upsert_commitment`, `complete_commitment`, `reschedule_commitment`, `retire_commitment` (for "non la faccio più" or "non chiedermelo più"; nothing is deleted), `schedule_checkin`, `set_availability`, `set_call_preferences` (step 3), `create_calendar_event`, `move_calendar_event`.
  - Explicit only: `set_project_status`.
  - Undo: `undo_action`.
  - Ask first: `delete_*`.
- **Proactive only:** `send_text`, `place_call` (through the policy gate in 5.3).

Each tool declares its autonomy class, validates its arguments with the existing validators (dates, times, Europe/Rome), is idempotent per turn, and returns a result plus its undo record.

### 5.3 Proactive engine

1. **Clock.** A separate PM2 process on the Oracle worker (`companion-worker`, following `scripts/workout-push-worker.js`) calls an authenticated LifeOS endpoint every 60s. It is separate from the WhatsApp bridge so that calls keep working when WhatsApp breaks.
2. **Moments.** Deterministic code produces due *moments*:
   - the morning call slot;
   - chase-ladder steps;
   - Brain-scheduled check-ins;
   - calendar lead times;
   - email signals;
   - evening check-ins;
   - the weekly digest.

   Each moment has an idempotency key.
3. **Policy gate (deterministic):** availability, quiet hours (except critical), at most 1 call per hour, stop flags, channel health, spend guard (section 9), and dedupe against what was already sent.
4. **Decision and wording (fast model):**
   - merge moments into one message where natural;
   - choose silence, text or call among the channels the gate allows;
   - judge whether something is critical;
   - write the message in persona.
5. **Delivery:** WhatsApp through the existing outbox; calls through the voice adapter (5.4).
6. **Outcomes:** answered, no-answer, voicemail, busy and replies feed the retry rules and the timeline.

The current memo and accountability rule families keep running until step 2 replaces them. In step 2 the health check-ins (shower, creatine, skin, wake time, sleep start) become recurring soft commitments (R3), so they follow the same renegotiation and anti-nag rules as everything else. The canonical `log_sleep_start` write is unchanged.

### 5.4 Voice

- **Provider:** an ElevenLabs voice agent (the user's existing Starter plan) with an Italian voice chosen from samples. Twilio recording is off.
- **Telephony (R1):** Brain calls from a new Italian geographic (landline-style) number on Twilio, connected through ElevenLabs' native Twilio integration.
  - **Why not the secondary SIM as caller ID.** Since 19 Nov 2025, AGCOM decision 106/25/CONS has Italian operators block internationally routed calls that show an Italian mobile number, unless that line is really roaming abroad. Twilio originates outside Italy and tells customers to stop using Italian mobile caller IDs and use an Italian geographic number bought on or ported to Twilio instead. ElevenLabs also allows verified (non-Twilio) caller IDs for outbound calls only.
  - **Paperwork.** The number needs a Twilio regulatory bundle: an ID document, the codice fiscale and proof of an address inside the number's area. It is started during step 2 so it is approved before step 3.
  - **Cost.** With an Italian caller ID, calls to Italian mobiles use Twilio's EEA rate. The user calling the number is a domestic call.
  - **Secondary SIM.** It can forward its calls to the Brain number, so either number reaches Brain. Forwarding is charged on that SIM's own plan. Both numbers go in one "Brain" contact.
  - **Fallbacks.**
    - If the bundle isn't approved when step 3 starts, Brain uses a temporary US Twilio number for outbound calls only, and the user asks for calls with "chiamami".
    - If the Italian Twilio number is refused or too expensive, Brain uses a geographic number from an Italian VoIP provider connected through ElevenLabs SIP trunking.
- **Outbound calls:** ElevenLabs' Twilio outbound-call API, with `conversation_initiation_client_data` carrying the briefing, the relevant commitments and a recent-timeline summary.
- **During the call:** ElevenLabs webhook tools call the same LifeOS tools (5.2) with the same autonomy rules and undo.
- **Inbound calls:** context comes from a conversation-initiation webhook.
- **After the call:** a post-call transcription webhook (HMAC-verified) writes the transcript and a summary into the shared timeline. The call-initiation-failure webhook (busy / no-answer) feeds the retry rules. Voicemail detection ends voicemail calls as no-answer.
- **Same Brain:** shared persona source, context, tools and timeline. The live call LLM runs on ElevenLabs' side for latency by default. A spike at the start of step 3 compares this with ElevenLabs' custom-LLM option pointing at LifeOS, and keeps the default unless the custom option meets latency.

### 5.5 Data changes

All changes are forward migrations reported according to `AGENTS.md`. Exact columns are finalised in the step that introduces them.

| Need | Change |
|---|---|
| Commitments | Evolve `memos` in place: kind, hardness, due time, `project_id`, chase intensity and state, recurrence, source, snooze. This keeps the 29 files that reference memos (Memos tab, MCP, compiler, proactive rules) working while they migrate. |
| Ideas | New `ideas` table: text, links, status (raw / developing / parked / became_project), provenance, embedding (the pgvector already used by Vault) |
| Undo | New action ledger: tool, arguments, result reference, inverse, autonomy class, `undone_at` |
| Availability, call preferences, critical feedback | `brain_beliefs`, which already has supersession and expiry |
| Moments and check-ins | New moments table with idempotency keys |
| Calls | New calls table: kind, reason, critical, schedule, attempts, provider ids, outcome, transcript reference, cost |
| Email | New email-signals table: Gmail id, sender, subject, received time, Brain assessment, handled state. No full bodies stored. |
| Usage | New usage ledger: provider, units, estimated cost |
| Timeline | Calls appear in the user's WhatsApp thread as `ai_chat_messages` with `metadata.channel = 'call'` |

### 5.6 Platform constraints

- **Vercel Hobby allows at most 12 functions; 7 are in use** (`scripts/check-vercel-functions.js`). The worker tick, ElevenLabs webhooks and Gmail ingest go into **one** new multiplexed function (for example `api/companion.js`). The total must stay ≤ 9 or so, leaving headroom.
- **The bridge already serializes per sender.** Server-side per-user serialization is still needed because app chat, calls and proactive turns can run at the same time.
- **Gmail access.** `gmail.readonly` is a restricted scope. Personal use is an official exception to verification. An OAuth app left in "Testing" issues refresh tokens that expire after 7 days, so the app must be published as an unverified personal-use app. Expired tokens must trigger an explicit "ricollega Gmail" message, never silent failure.
- **The repository is public.** Real conversations, phone numbers, email content and eval data from real messages must never be committed. The eval set lives in a gitignored local directory or a private Supabase table. Public tests use synthetic paraphrases.

### 5.7 Kept and removed

- **Kept:**
  - Supabase data;
  - the whatsapp-web.js bridge (a separate account);
  - the outbox and delivery mapping;
  - inbound receipts and interaction ownership;
  - `brain_beliefs`;
  - autobiographical memory;
  - Vault (as a search tool, with auto-save kept);
  - `lifeosTools.js` writers and `healthActions.js`, wrapped as tools;
  - the context compiler;
  - traces and the MCP server.
- **Removed** after the gate in section 8:
  - `brainRouter.js`, `brainTurnContract.js`, `brainTurnArbitration.js`;
  - `brainCommandDraft*.js`, `brainPlannerStage.js`, `brainSkills.js`;
  - the `chat/` classification/planning helpers;
  - deterministic proactive reply resolvers that the agent loop replaces.

## 6. Reliability, safety and privacy

- **Fallback chain.**
  - If the call provider fails, Brain sends a text.
  - If WhatsApp is down (no bridge heartbeat for more than 10 minutes), important messages go out as calls, and the next contact mentions the outage. The bridge already logs disconnects; it must also report a heartbeat to LifeOS.
  - If the model provider is down, the deterministic layer still sends the morning briefing and chase-ladder texts from templates, and nothing is lost.
- **Untrusted input.**
  - Email content and synced external text are data, never instructions. They are passed to the model inside clear delimiters.
  - Turns triggered by email can only notify the user, place calls (through the gate) and create or update commitments.
  - An email can trigger a call during quiet hours only if its sender is someone the user has corresponded with or is named in one of the user's rules (R2). Unknown senders can still trigger daytime texts and calls. This blocks phishing and spam "URGENT" mail from waking the user.
- **Privacy.**
  - Twilio recording is off.
  - Call audio is not stored; transcripts and summaries are.
  - Only email metadata and Brain's assessment are stored.
  - All secrets stay server-side.
  - Traces stay sanitized.
- **Kill switches.** Chat stop commands (4.6) and one environment flag per capability: `COMPANION_AGENT`, `COMPANION_PROACTIVE`, `COMPANION_CALLS`, `COMPANION_EMAIL`.

## 7. Behaviour guarantees carried over

The agent loop must preserve these. They are ported from the current harness into the eval suite before the old pipeline is deleted:

- negative wording ("non segnarlo") never writes;
- memory, Vault and synced context never authorize a write;
- going-to-sleep messages use the canonical `log_sleep_start`;
- naps are notes, not sleep start;
- vague times don't become invented exact times;
- generic "segna X domani" becomes a commitment, not a calendar event;
- destructive actions need confirmation;
- debug output never reaches WhatsApp text.

## 8. Quality strategy

**Severity**
- **P1** (blocks the next step):
  - a write the user didn't want;
  - a lost user message;
  - a duplicate message or call;
  - a non-critical call during quiet hours;
  - a missed chase step on a hard commitment;
  - availability or a stop command ignored;
  - a wrong-language or debug-leaking reply.
- **P2:** awkward wording, a suboptimal decision about whether to message.

**Test layers**
1. **Deterministic tests:** tools (validation, idempotency, undo), policy gate, moment scheduler (ladders, recurrence, retries, quiet hours, time zones), webhook signatures, migrations (PGlite, as in the existing tests).
2. **Agent evals:** recorded conversations replayed against the loop, asserting tool calls, the absence of writes, language and confirmation behaviour, not exact wording. They run before every deploy that touches the companion.
3. **Voice tests:** ElevenLabs agent tests/simulations, plus a manual call checklist.
4. **Real use:** each step is used daily for 5–7 days, with traces reviewed, before the next step starts.

**Gates**
- A step is done when its done-criteria (section 10) pass **and** its real-use period had zero P1.
- Calls go live only after 1–2 weeks of trouble-free text.
- The old pipeline is deleted after step 2 plus 2 trouble-free weeks with the ported guarantees (section 7) passing.

## 9. Budget

The first month is a measured trial at €30 in total, **including** the ElevenLabs Starter plan (R5). Estimates, assuming ~120–150 call minutes per month (a daily morning call of 3–4 minutes plus retries and other calls). Verify them on live pricing pages:

| Item | Assumption | Estimate per month |
|---|---|---|
| ElevenLabs Starter | $6/month, includes 75 call minutes | ~€5.5 |
| Call minutes, ElevenLabs | the 45–75 minutes beyond the included 75, at $0.08/min | €3–6 |
| Call minutes, Twilio to Italian mobile | $0.0445/min with an Italian (EEA) caller ID | €5–6 |
| Twilio Italian geographic number | not on Twilio's public pricing page; check the console before buying | ~€1–6 |
| Fast model (text turns, proactive wording) | ~30 messages/day, cached context | €6–15 |
| In-call LLM | may be billed separately from ElevenLabs' per-minute rate | to measure in step 3 |

The total is roughly **€21–39**, so the upper end exceeds €30 and a **spend guard** is required.
- The usage ledger projects month-end spend.
- Above 80% of budget, low-value calls become texts and reminder calls stop.
- Above 100%, only the morning call, escalation calls and critical calls remain.
- Brain tells the user when it changes behaviour for budget reasons.

## 10. Build plan

Each step is a GitHub sub-issue of [#9](https://github.com/alessiocasce/lifeos/issues/9): steps 0–6 are #10–#16, and each issue is blocked by the steps it builds on. The done-criteria below are the issues' acceptance criteria in summary.

**Step 0: Foundations** (new, small)
- Scope: private eval set from real conversations (≥ 30 cases), eval runner, comparison of fast and deep models, usage ledger, capability flags. Nothing visible to the user.
- Done when: the evals run locally, the chosen models and their measured cost/latency are recorded in this spec, and the ledger records model spend.
- Status (2026-11-22): the foundations are built and tested.
  - **Built:**
    - flags (`companionFlags.js`);
    - pricing table;
    - two-tier model adapter (Gemini REST, Claude via the official SDK, with a mandatory usage sink);
    - usage ledger, month-end projection and spend guard (`companionUsage.js`, migration `20261122150000_companion_usage_ledger.sql`);
    - tool catalog v1 (`companionTools.js`);
    - persona (`companionPersona.js`);
    - pure agent loop (`companionAgentLoop.js`);
    - eval runner and the real-conversation exporter (`scripts/evals/`).
  - **Eval sets:**
    - 39 public synthetic cases (`tests/companion/`);
    - 48 private cases from real conversations, stored outside Git in `evals/private/`.
  - **Model comparison (2026-11-23, Gemini only):**
    - Setup: all 87 cases, 2 runs each. Claude was not measured: no `ANTHROPIC_API_KEY` yet.
    - Results:

      | Model | Pass | Runs with a P1 | Guarantees | p50 | p95 | $/turn | $/month at 30/day |
      |---|---|---|---|---|---|---|---|
      | `gemini-3.1-flash-lite` | 87% | 8 | 93% | 1.0s | 2.1s | 0.0017 | 1.5 |
      | `gemini-3.5-flash-lite` | 84% | 16 | 84% | 0.9s | 1.4s | 0.0021 | 1.9 |
      | `gemini-3.8-flash` | 99% | 0 | 96% | 7.3s | 18.0s | 0.0060 | 5.4 |
      | `gemini-3.8-flash`, low thinking | 97% | 3 | 96% | 4.1s | 9.1s | 0.0047 | 4.2 |

    - The Flash-Lite models repeat P1s the spec rules out: they book a calendar event without asking for the missing end time, delete without confirmation, and miss sleep-start logging.
    - **Fast tier: `gemini-3.8-flash` at default thinking.** It is the only configuration with zero P1. Its p95 is under the 20s target, but by only 2s, so step 1 traces watch latency.
    - Costs use introductory pricing until 2026-12-31. At list price the fast tier costs about $0.012 per turn, or about $11 a month, which is inside the §9 estimate of €6–15.
    - **Deep tier:** provisionally `gemini-3.8-flash` at high thinking. No eval covers deep work yet, so measure it, together with Claude Haiku/Sonnet, when step 4 adds idea cases.
    - The bench was fixed before the final run:
      - the Italian check now fails only on English evidence;
      - mock training data respects the clock and the `days` window.
  - **Still open:**
    - applying the migration (until then the ledger writes local JSONL);
    - the user's review of the private labels, including whether logging a wake time that the user stated but did not confirm counts as unwanted;
    - the Claude comparison, once an `ANTHROPIC_API_KEY` exists.

**Step 1: Agent Brain on WhatsApp (text).** Builds on 0.
- Scope: agent loop, persona, context assembly, tool catalog v1 with autonomy classes, confirmation guard, action ledger with undo, commitments (memos evolved, plus migration), automatic capture, shared timeline, trace. Behind `COMPANION_AGENT`, WhatsApp only.
- Done when: evals pass including the guarantees in section 7, p95 < 20s, undo works on every write tool, and 5–7 days of real use have zero P1.
- Status (2026-11-23): built and tested locally, uncommitted, not deployed.
  - **Built:**
    - real tool executors with per-turn idempotency (`companionToolExecutors.js`);
    - the action ledger with undo, including "annulla" by description (`companionActionLedger.js`);
    - context assembly with short per-turn refs (c1, e1, a1) instead of UUIDs (`companionContext.js`);
    - the WhatsApp turn: replay, per-user lock, confirmation gate, quote validation, legacy proactive replies, bare "annulla", agent loop and trace (`companionTurn.js`);
    - `inbound.js` switching on `COMPANION_AGENT`;
    - migration `20261123120000` (memo → commitment columns, `brain_action_ledger`, `brain_turn_locks`).
  - **Decisions:**
    - Brain-scheduled check-ins are commitments of kind `checkin`. The legacy memo rule sends them once, as the question.
    - Replies to legacy health/memo check-ins keep the old deterministic resolver until step 2.
    - The agent path skips the old per-turn memory-extraction model call; durable facts go through `remember`.
  - **Still open:** the deploy, then the real-use gate and the latency check.

**Step 2: Proactive v2 (text).** Builds on 1.
- Scope:
  - the companion worker and moments engine with the policy gate;
  - chase ladder, Brain-scheduled check-ins and stale-model questions;
  - the morning briefing *as text* for now, plus the evening check-in;
  - availability, quiet hours, stop commands;
  - bridge heartbeat and outage fallback;
  - the app Companion tab switched to the new Brain;
  - the health check-ins converted to recurring soft commitments (R3);
  - the Twilio regulatory bundle for the Italian number submitted, so step 3 isn't blocked on paperwork (R1).
- Done when: over 7 consecutive days every hard commitment due was chased per its ladder, there were zero duplicate or quiet-hour messages, every availability statement was honoured, and real use had zero P1.

**Step 3: Calls.** Builds on 2, plus 1–2 trouble-free weeks.
- Scope:
  - ElevenLabs agent (Italian voice) and the Italian Twilio number (R1), with the latency spike from 5.4;
  - outbound calls with initiation context, webhook tools, transcripts into the timeline;
  - voicemail and no-answer handling, retry, "richiamami" and "scrivimelo";
  - the morning call replacing the morning text;
  - escalation, reminder, event and critical calls with the call guardrails;
  - reaching Brain by phone, including forwarding from the secondary SIM;
  - an iPhone setup checklist: a "Brain" contact with both numbers, allowed in Focus modes, "Allow Repeated Calls" on.
- Done when: 10 consecutive mornings behave correctly (called on time or at the adjusted time, retried once, then text), there are zero non-critical quiet-hour calls, a test critical call gets through Sleep Focus, Brain references a call later on WhatsApp, and spend matches the projection.

**Step 4: Ideas and voice notes.** Builds on 1.
- Scope: the `ideas` table, silent capture, linking, one sharp question, the weekly digest, resurfacing when relevant, "sviluppiamola" on the deep tier; inbound voice-note transcription and occasional voice-note replies.
- Done when: 10 real ideas are captured and linked correctly, the digest arrives, at least one idea is resurfaced on its own in a relevant moment, and voice notes are handled like text.

**Step 5: ChatGPT and Claude sync.** Builds on 1 and 4.
- Scope: MCP write tools (4.9) under `lifeos.write`, a custom-instruction text for both apps, provenance.
- Done when: an idea, a decision and a deadline stated in ChatGPT and in Claude appear in LifeOS without the user saying "sync", and Brain references one of them on WhatsApp the next day.

**Step 6: Outside triggers.** Builds on 2 and 3.
- Scope: Gmail read-only (published personal-use OAuth app), email signals, plain-language sender rules, calendar lead-time moments, no quiet-hours calls from unknown senders (R2).
- Done when: 2 weeks with no missed important email from a rule-listed sender, zero calls about unimportant mail, an expired Gmail token produces a "ricollega Gmail" message, and calendar lead-time messages arrive on time.

## 11. Review questions (answered 2026-11-22)

| # | Question | Answer | Applied in |
|---|---|---|---|
| R1 | Which phone number does Brain use? | The user has a secondary mobile SIM. Italian rules stop it being Brain's caller ID, so Brain calls from a new Italian geographic number on Twilio and the SIM forwards to it. | 4.5, 5.4, 9, steps 2–3 |
| R2 | Can an email from an unknown sender trigger a call during quiet hours? | No. Unknown senders can still trigger daytime texts and calls. | 6, step 6 |
| R3 | What happens to the current health check-ins (shower, creatine, skin, wake time, sleep start)? | They become recurring soft commitments. | 5.3, step 2 |
| R4 | Add step 0 (eval set, model comparison, usage ledger) before step 1? | Yes. | step 0 |
| R5 | Does the €30 trial exclude the existing ElevenLabs Starter plan? | No. Starter counts inside the €30. | 3, 9 |
| R6 | When is the morning call? | 09:00 every day, weekends included, until the user says otherwise. | 4.4 |

## 12. Relationship to Companion vNext

This spec supersedes these parts of [Companion vNext](../LIFEOS_COMPANION_VNEXT.md):
- the €0 constraint (§2.6, §9, §17, §18);
- the "WhatsApp-call spike first, paid PSTN only as optional future" transport (§9.2, Phase G);
- the Phase A–H order (§15).

vNext remains the source of the product principles: one Brain, the Butler character, attention philosophy, graduated autonomy, provider independence through an adapter. It also remains the long-range vision for parts outside this plan, such as desktop organs, external monitors and images.

## 13. Sources

Checked 2026-11-21/22. Prices change; re-check before each step that depends on them.
- [ElevenLabs Agents pricing](https://elevenlabs.io/pricing/agents)
- [ElevenLabs Twilio outbound call API](https://elevenlabs.io/docs/eleven-agents/api-reference/twilio/outbound-call)
- [ElevenLabs post-call webhooks](https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks)
- [ElevenLabs webhook tools](https://elevenlabs.io/docs/eleven-agents/customization/tools/webhook-tools)
- [ElevenLabs dynamic variables](https://elevenlabs.io/docs/eleven-agents/customization/personalization/dynamic-variables)
- [ElevenLabs Twilio native integration (verified caller IDs are outbound-only)](https://elevenlabs.io/docs/eleven-agents/phone-numbers/twilio-integration/native-integration)
- [ElevenLabs SIP trunking](https://elevenlabs.io/docs/eleven-agents/phone-numbers/sip-trunking)
- [Twilio Voice pricing – Italy](https://www.twilio.com/en-us/voice/pricing/it)
- [Twilio regulatory updates, October 2025 (Italy caller-ID rule)](https://www.twilio.com/en-us/blog/insights/2025-october-regulatory-updates)
- [Twilio Italy regulatory guidelines](https://www.twilio.com/en-us/guidelines/it/regulatory)
- [AGCOM decision 106/25/CONS](https://www.agcom.it/provvedimenti/delibera-106-25-cons)
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Claude API pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Google: restricted scope verification (personal-use exception)](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)
- [Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [Google: app audience / Testing-status token expiry](https://support.google.com/cloud/answer/15549945)
