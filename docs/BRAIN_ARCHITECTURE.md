# LifeOS Brain Architecture

Last updated: 2026-07-06

This doc describes the current backend Brain pipeline as implemented in code. `PROJECT_CONTEXT.md` remains the high-level handoff, but `api/` is the source of truth.

## Pipeline

The shared Brain handler is `api/ai/chat.js`. It is used by app chat and WhatsApp inbound.

Current order:

1. Normalize request/source and enforce auth/idempotency.
2. Begin or load the Brain thread.
3. Load bounded Brain context and Working Context.
4. Detect active pending action.
5. Evaluate BrainTurn Contract.
6. Resolve allowed pending/proactive/operational paths.
7. Classify, route, repair route invariants, and select skill.
8. Re-evaluate BrainTurn Contract with route context.
9. Optionally retrieve Vault context.
10. Run Command Draft Stage.
11. Fall back to pending-action candidate extraction, memory handling, follow-up transforms, planner, read-only answers, or casual chat.
12. Persist sanitized response metadata and `brain_trace`.

`api/ai/chat.js` still owns planner execution and final persistence. Do not move more of it casually; extract one stage at a time with regression coverage.

## BrainTurn Contract

`api/_utils/brainTurnContract.js` produces one explicit per-turn contract:

- `winning_path`: `pending_action`, `proactive_reply`, `operational_context`, `memory_recall`, `explicit_command`, `read_only_query`, `follow_up_transform`, `casual_chat`, `clarification`, or `unknown`.
- `intent_type`: `new_write`, `pending_confirmation`, `pending_cancellation`, `pending_slot_fill`, `proactive_reply`, `operational_follow_up`, `agenda_query`, `true_memory_recall`, `memory_write`, `analysis`, `casual`, or `unknown`.
- `source_of_write_intent`: `current_message`, `pending_action`, `proactive_message`, or `none`.
- `allowed_context_sources` and `disallowed_steals`.
- `field_policy` for exact field grounding.
- optional `route_override`.

The contract is not just trace metadata. It blocks subsystems from stealing a turn. Examples:

- Active pending + `No. Cancella tutto` stays pending cancellation and blocks proactive reply.
- Active pending + `Segna memo: domani 9.30 parrucchiere` bypasses the pending action.
- `Che cosa devo fare domani? Guardami gli impegni` blocks memory recall and Vault retrieval.
- `Quando l'hai messo?` answers from Working Context or asks what item is meant.
- `Cosa ti ricordi di me?` is the true long-term memory recall path.

Every contract evaluation is recorded in `brain_trace` as `brain_turn_contract_evaluated`.

## Command Draft Stage

`api/_utils/brainCommandDraftStage.js` owns the Command Draft lifecycle:

- checks whether the stage is allowed by route/skill/contract;
- calls Gemini command draft extraction;
- validates with deterministic action normalizers;
- applies reference and field policy;
- creates pending clarification actions;
- executes through the existing safe write path only when allowed.

The stage must respect `BrainTurnContract.field_policy`. Command draft is not allowed to copy exact Working Context dates/times into standalone new commands.

## Field Provenance

Command Draft field provenance is runtime metadata, not schema. Calendar command drafts record safe provenance such as:

- `current_message`
- `ai_inferred`
- `default`
- `working_context`
- `working_context_blocked`
- `rejected_ungrounded`

Vague time phrases such as `domattina`, `mattina`, `pomeriggio`, and `tomorrow morning` do not justify exact AI-inferred times unless the current message explicitly references a previous time.

## Memo vs Calendar Policy

Conservative v1 policy:

- Memo/reminder: `segna memo:`, `memo:`, `promemoria`, `ricordami`.
- Calendar: `fissa`, `blocca`, `metti in calendario`, `evento`, `appuntamento`, `calendar`, `schedule`.
- Generic `segna X domani/alle...` defaults to memo/reminder, not calendar.
- Explicit calendar commands with only a start time ask for duration/end time.

This policy is enforced in both route repair and command-draft validation. If the AI extracts a calendar event for generic `segna`, deterministic code repairs it to `create_memo`.

## Memory Recall Guardrail

`memory_recall` is only for true long-term memory questions like:

- `Cosa ti ricordi di me?`
- `Che cosa sai di me?`
- `Quali preferenze hai salvato?`
- `What do you remember about me?`

Agenda, memo, calendar, workout, and operational follow-up questions must not dump long-term memory.

## Tests

Run:

```bash
npm run test:brain
```

The harness covers BrainTurn Contract paths, command-draft stage policy, memo/calendar policy, pending/proactive arbitration, operational follow-ups, route repair, Vault skipping, and the existing sleep/calendar/proactive regressions.

## Next Extraction

The next useful extraction is the planner/read-only answer stage after Command Draft. Do not extract it until the planner safety tests cover explicit write intent, negative intent, route repair, and selected skill permissions.
