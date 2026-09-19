# LifeOS Brain Architecture

## WhatsApp Interaction Selection

Before pending/proactive execution, `prepareBrainTurnInteraction()` loads the versioned thread owner and resolves any trusted provider quote. `selectBrainTurnInteraction()` returns one frozen selection and BrainTurn Contract consumes that exact object. Runtime proactive dispatch receives the selected target rather than scanning history again.

Precedence:

1. Grounded current-message command or typed Health self-report; negation is checked first.
2. Strong pending cancellation such as `annulla` or `cancella tutto`.
3. A provider ID mapped to a quoted assistant message in the same user, recipient, and thread scope.
4. The active delivered interaction owner.
5. The immediately adjacent legacy proactive question, only for 30 minutes.
6. Compatible pending fallback, bounded clarification/abandon, or normal guarded Brain routing.

An unresolved native quote is a read-only clarification and cannot fall back to another target. Ordinary quoted `no/non ancora` answers the quoted check-in; explicit global cancellation still cancels an active pending action. Safe trace metadata records the selection method and bounded IDs, not bodies or full target metadata.

`brain_interaction_state` separates conversational ownership from source satisfaction and outbox delivery. Assistant persistence creates `pending_delivery`; a validated outgoing provider mapping activates it. Replacements and closure use the row version so stale turns cannot close a newer owner. Legacy clients without delivery receipts do not gain confirmed ownership.

## Structured Health Reports

`brainHealthSelfReports.js` handles grounded Shower/Creatine/Skin completion before competing conversational contexts. Positive reports use ensure-target Health writes; repeated reports become no-ops. Negative and hypothetical phrases do not write. Bare habit pending drafts are repaired to typed habit fields, and shared validation treats structured habits and explicit zero values as present.

The complete time parser is shared with accountability replies. It accepts supported clock expressions and rejects partial-number extraction from unrelated text. Sleep-start accountability still uses the persisted previous-night target and canonical sleep helper.

## Reliability Release Boundary

See [RELIABILITY_RELEASE.md](RELIABILITY_RELEASE.md) for deployment and limitations. BrainTurn Contract and `resolveProactiveWhatsappReply` now use the same family-aware `selectProactiveReplyTarget`; accountability is no longer gated through the memo-only selector. Pending cancellation/independent commands still win, ambiguous and consumed prompts are read-only, and `brainProactiveDelivery.js` owns persisted target checks, ensure-health mutations, resolution markers, and delivery revalidation. No planner feature or new route was added.

Accountability notes never infer habit writes. Delivered IDs, user scope, current target state, and compare-and-swap updates constrain mutations; metadata cleanup is a separate transaction. `npm run test:reliability` exercises real schema-backed metadata through contract and dispatch, not just isolated intent parsing. Do not replace this with tests that call the accountability resolver directly and bypass the contract.

Last updated: 2026-07-07

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
11. Run memory/save/follow-up special branches that are still explicit in `chat.js`.
12. Run Planner Stage for route clarification, casual/read-only answers, planner output, read context, synthetic calendar plans, and safe write execution handoff.
13. Persist sanitized response metadata and `brain_trace`.

`api/ai/chat.js` still owns auth, thread/context setup, memory branches, Vault-save follow-ups, final persistence, and low-level LifeOS write helpers. Do not move more of it casually; extract one stage at a time with regression coverage.

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

## Planner Stage

`api/_utils/brainPlannerStage.js` owns the legacy planner/read-only/action path after Command Draft.

The stage handles:

- route clarification responses;
- casual chat responses;
- synthetic finite recurring/day-schedule/multi-event calendar paths;
- Gemini planner generation through injected `planMessage`;
- planner plan repair/validation;
- read-only LifeOS context loading;
- safe LifeOS write execution handoff;
- final read-only answer generation.

Planner Stage validates every write-capable plan against:

- BrainTurn Contract write source and `winning_path`;
- `brainRoute.mode` and `brainRoute.write_intent`;
- selected skill allowed/forbidden actions;
- negative current-message write intent;
- destructive/high-risk action blocks.

If a route is read-only, casual, memory recall, operational context, follow-up transform, or has `source_of_write_intent = none`, planner output is repaired to read-only analysis or clarification before any LifeOS tool can run. Vault and Working Context may inform the answer, but they never grant write permission.

Important trace steps:

- `planner_stage_started`
- `planner_plan_generated`
- `planner_plan_validated`
- `planner_plan_repaired`
- `planner_write_blocked_by_contract`
- `planner_action_executed`
- `planner_read_only_answered`
- `planner_stage_completed`

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

## Proactive Reply Dispatch

`api/_utils/brainProactiveReplies.js` is the deterministic proactive reply executor for WhatsApp. BrainTurn now supplies its single selected proactive target; the executor may revalidate eligibility but must not substitute another historical target.

Current reply types:

- `memo_done_snooze_cancel`: mark memo done, dismiss, snooze, explain, or ask clarification.
- `accountability`: log missing Health check-ins for wake time, previous-night sleep start, or Shower/Creatine/Skin habits.

Accountability replies are intentionally narrow:

- `si`, `fatto`, `fatta`, `presa`, `done` can log the targeted habit.
- `9.30` can update the targeted wake time or previous-night sleep start.
- `ora` updates wake time to current Europe/Rome time.
- `piu tardi` can enqueue a snoozed accountability outbox row.
- `non ancora`, `non so`, `boh`, or `non ho dormito` acknowledge without writing.

These replies must not route through Planner Stage, create memos/calendar events, call Vault, or dump memory. Generic pending cancellations still beat proactive reply priority unless the user clearly references the proactive target.

## Companion Current-State And Compound Turns

`api/_utils/brainBeliefs.js` owns the persistent current-state contract. `brain_beliefs.record_status` describes row lifecycle (`current` or `superseded`); `value.state` describes domain truth (`active`, `inactive`, `suspended`, or `uncertain`). The atomic transition RPC serializes one subject/predicate, supersedes the old current row, inserts the new row, and replays by idempotency key. Do not replace this with updates to `ai_memories`: memories do not provide current-vs-historical truth.

`api/_utils/brainRoutineSemantics.js` is provider-agnostic at its boundary. Gemini may propose one narrow routine operation, but deterministic validation owns the allowed operation, grounded routine, confidence threshold, temporal bounds, and persistence. Bare `no`/`not yet` bypass semantic inference. Cross-target or low-confidence model output becomes `no_change`.

`api/_utils/brainCompanionTurn.js` handles compound proactive turns:

1. use the immutable target selected by interaction ownership;
2. resolve that target at most once through the existing deterministic executor;
3. apply a validated routine-state transition or bounded negative feedback;
4. cancel queued candidates when the routine is no longer eligible;
5. preserve unrelated residual text for the existing knowledge-extraction path;
6. pass structured machine outcome to `brainButler.js` for wording.

The Butler cannot add actions. Model wording is optional and failure falls back to concise deterministic text grounded in the structured result. Trace metadata records semantic operation/state and whether a belief, feedback record, or residual was handled, without storing model prompts or secrets.

Standalone explicit routine changes such as `I started doing skincare again` use the same semantic validator and belief transition before generic routing. Candidate generation and delivery revalidation must both consult current beliefs; checking only at evaluation time is insufficient because already queued rows can become stale.

## Tests

Run:

```bash
npm run test:brain
npm run test:reliability
npm run test:bridge
npm run test:companion
```

The harness covers BrainTurn Contract paths, command-draft stage policy, memo/calendar policy, pending/proactive arbitration, operational follow-ups, route repair, Vault skipping, and the existing sleep/calendar/proactive regressions.
It also covers Planner Stage contract enforcement: read-only/agenda/workout/product/casual turns cannot write even if a fake planner proposes a write, while explicit current-message memo/calendar writes still pass route and skill permission.
Proactive coverage includes memo reminders and Proactive Accountability v1 candidate/reply behavior without live WhatsApp, Gemini, or Supabase writes.

## Next Extraction

The next useful extraction is the remaining memory/Vault-save/follow-up special branch group, or a lower-level LifeOS tool execution adapter. Do not extract either until tests cover explicit memory writes/forget, Vault save follow-ups, action logging, and final persistence.
