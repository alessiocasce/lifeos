# LifeOS AI Assistant QA

Run this after deploying to Vercel with:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LIFEOS_ACTION_USER_ID`
- `LIFEOS_ACTION_TOKEN`
- `GEMINI_API_KEY`
- optional `GEMINI_MODEL`
- optional `GEMINI_EMBEDDING_MODEL=gemini-embedding-2`
- `LIFEOS_WHATSAPP_BRIDGE_SECRET` and `LIFEOS_WHATSAPP_ALLOWED_SENDERS` for WhatsApp inbound QA

The in-app Assistant sends the signed-in user's Supabase access token to `/api/ai/chat`. The backend verifies that user against `LIFEOS_ACTION_USER_ID`. The endpoint also accepts the action token for trusted server/tool callers.

Run the latest `supabase/schema.sql` before this checklist so Brain thread, message, memory, insight, and Vault tables/functions exist.

## Brain Regression Harness

Run before and after Brain, WhatsApp, pending-action, command-draft, working-context, Vault gate, or sleep/wake command changes:

```bash
npm run test:brain
```

Expected:

- Runs locally without Vercel, browser automation, live WhatsApp, Gemini calls, or live Supabase writes.
- Dirty `update_health_log` sleep-start shapes and command drafts normalize to `log_sleep_start`.
- Stale `missing_fields` do not block confirmed executable pending actions.
- `Si`, `Sì`, `ok`, `confermo`, `procedi`, `fallo`, `yes`, and `do it` normalize to confirmation.
- Negative replies such as `non farlo`, `annulla`, `cancel`, and `don't` normalize to cancellation.
- `?`, `cosa?`, `non ho capito`, and `what?` normalize to clarification.
- Naps/pisolini do not coerce to sleep start.
- Simple explicit writes skip Brain Vault retrieval.
- Negative write intent wins over action wording.
- Working Context exposes enough prior-subject date/time data for `aggiungilo anche al calendario`.

## Persistent Brain Chat

1. Send a message in Brain and wait for the assistant response.
2. Refresh `/assistant` and confirm Brain opens a fresh `New Chat` draft by default.
3. Confirm old-thread selection is not visible in the normal Brain UI for now.
4. Confirm old threads/messages still persist in Supabase/backend context after sending messages, even though the default UI does not expose the selector.
5. Send a follow-up in the current chat and confirm Brain retains bounded conversation context.
6. Confirm the persisted thread title changes from `New Chat` to a deterministic title based on the first message.
7. Pull to refresh and confirm Brain data reloads without opening old threads in the default UI.
8. Confirm a failed AI request stores only a safe user-facing assistant error, not raw server/provider internals.

## Brain Chat UX Stability

1. Send a message in a long Brain thread and confirm the optimistic user bubble does not duplicate or flicker when persisted messages reload.
2. Confirm the latest user message, loading indicator, and assistant response auto-scroll inside the chat message widget after sending.
3. Simulate or manually test a slow `/api/ai/chat` request and confirm Brain exits loading after timeout with a visible error.
4. Confirm the failed message is restored into the composer and the Retry button resubmits it.
5. Confirm the textarea has `data-testid="brain-message-input"` and the send button has `data-testid="brain-send-button"`.
6. Confirm the message list, loading indicator, and error card expose stable test ids for browser automation.
7. On mobile, confirm the Assistant page itself does not become a long scroll just to see the Brain widget/composer.
8. Confirm earlier messages scroll inside `brain-message-list`, not in the page.

## Brain UX Reset

1. Navigate away from Brain, then return to Brain.
2. Confirm a fresh empty chat is visible and no old thread auto-opens.
3. Confirm old-thread selection is hidden from the normal Brain UI for now.
4. Navigate away and return again; confirm Brain returns to a fresh chat draft.
5. Confirm there is only one New Chat affordance/title and no duplicate `New Chat` labels.
6. Confirm the empty-state text is minimal: `What do we solve?` and `Ask, log, analyze, plan.`
7. Confirm the default Brain UI does not show Vault or Memory panels as primary cards.
8. If the diagnostics control is visible on desktop, open it and confirm Vault/Memory data is secondary and collapsed.
9. Confirm memory commands such as `remember my name, Ale`, `what do you know about me?`, and forget requests still work.
10. Ask a long workout, project, finance, health, life-review, or product analysis.
11. Confirm the answer appears normally with no save modal and no required manual Save-to-Vault action.
12. Confirm an auto-saved Vault document is created in the backend with `metadata.created_by = brain_auto_save`.
13. Ask casual `yo` and confirm no Vault report is created.
14. Confirm manual Save-to-Vault controls are not prominent in default assistant message bubbles.
15. Confirm `oggi ho fatto un pisolino dalle 7.40 alle 10 di sera`, `si`, then `aggiungilo anche al calendario` still resolves through working context without asking for date/time again.
16. Confirm Recent Actions shows at most 3 successful actions by default on desktop and old errors are hidden behind the Errors toggle.

## Brain Memory

1. Say: `Remember that I prefer direct practical advice and hate noisy dashboards.`
2. Confirm the response acknowledges it and the memory can be recalled by asking what Brain remembers or by opening diagnostics.
3. Ask later: `How should you answer me?`
4. Confirm Brain applies the preference without dumping the entire memory list.
5. Ask: `What do you remember about me?` and confirm active memories are summarized.
6. If diagnostics memory management is available, edit the memory there, refresh, and confirm the edit persists.
7. Archive/forget the memory through diagnostics or a supported forget command and confirm it disappears from active memory and future prompt context.
8. Discuss LifeOS as a SaaS/business direction and confirm a concise useful memory may be extracted.
9. Repeat a similar durable statement and confirm it updates/deduplicates rather than creating obvious duplicates.
10. Log a simple habit, expense, memo, or calendar event and confirm it does not create a durable memory.
11. Confirm memory extraction failure does not prevent the main assistant response.
12. Confirm no passwords, tokens, API keys, or secrets are saved as memories.

## Brain Conversation Mode And Write Guards

1. Send `Hello`.
2. Confirm Brain gives a short greeting, does not dump full LifeOS status, and creates no action.
3. Send `I haven't trained today`.
4. Confirm Brain answers conversationally or asks one follow-up and creates no calendar, memo, or health write.
5. Send `remember my name, Ale`.
6. Confirm it stores an `identity` memory titled `Name`, does not create a memo, and answers that it will remember the name.
7. Refresh Brain, ask `what do you remember about me?`, and confirm the name memory is still active.
8. Send `my name is Ale`.
9. Confirm it updates/deduplicates the name memory instead of creating duplicate identity rows.
10. Send `what do you remember about me?`.
11. Confirm Brain summarizes active memories by category and mentions diagnostics or supported forget commands can remove them.
12. Send `I might need a nap tomorrow afternoon, don't schedule a memo`.
13. Confirm no memo is created, no raw validation error appears, and Recent Actions is not polluted by a create_memo failure.
14. Send `don't put this in calendar, but I might train chest tomorrow`.
15. Confirm no calendar event is created.
16. Send `remind me to nap tomorrow afternoon`.
17. Confirm Brain asks for a specific time or otherwise avoids a raw `memo_time` validation error.
18. Send `remind me to take pill at 8:30pm`.
19. Confirm a memo is created normally.
20. Send `schedule chest tomorrow 5pm to 6pm`.
21. Confirm a calendar event is created normally.
22. Re-run `Dumbbell bench press, dimmi prestazioni passate e come migliorare oggi`.
23. Confirm workout advice remains read-only with no calendar event.
24. Re-run the Italian mixed day schedule prompt and confirm the day-schedule write path still works.

## Brain Follow-Up Transforms

1. Ask: `Dumbbell bench press, dimmi prestazioni passate e come migliorare oggi`.
2. Then ask: `mettile in ordine cronologico`.
3. Confirm Brain reorders the previous performance list chronologically, creates no calendar/memo/action, and does not answer with `Got it. Do you want advice...`.
4. Ask: `fammi una tabella`.
5. Confirm Brain formats the latest relevant answer as a table and creates no write action.
6. Ask: `riscrivilo più breve`.
7. Confirm Brain rewrites the previous assistant answer shorter and creates no write action.
8. In a new empty conversation, ask `fammi una tabella`.
9. Confirm Brain asks what content to transform.
10. Send `nah, just logging context`.
11. Confirm Brain gives a short acknowledgment and does not ask another generic follow-up question.
12. Send `not sure though`.
13. Confirm Brain gives a concise acknowledgment such as keeping it open.
14. Confirm read-only workout advice does not use action-implying wording such as `Ho pianificato`, `Programmo`, or `Vuoi che imposti`.
15. Confirm Brain Recent Actions shows successful actions by default and hides old failed `create_memo` errors until the Errors toggle is enabled.

## Brain Skill Routing

1. Send `hello`.
2. Confirm the response is short, no write is created, and the assistant message shows or returns selected skill `general_chat`.
3. Send `remember my name, Ale`.
4. Confirm selected skill is `memory_manager`, an `ai_memories` identity memory is created or updated, and no Memo row is created.
5. Send `Dumbbell bench press, dimmi prestazioni passate e come migliorare oggi`.
6. Confirm selected skill is `workout_coach`, Brain reads workout context as needed, stays read-only, and creates no calendar event.
7. Send `I slept badly and took creatine at 9:37 AM`.
8. Confirm selected skill is `health_coach`; if phrased as a log it can update Health, but casual context does not force a write and Brush, Journal, and Energy are not reintroduced.
9. Send `schedule study today from 15:00 to 17:00`.
10. Confirm selected skill is `calendar_planner` and a calendar event can be created.
11. Send `remind me to take pill at 8:30pm`.
12. Confirm selected skill is `memo_assistant` and a memo can be created.
13. Send `Analyze my AI OFM project sessions and tell me if I'm doing fake productivity`.
14. Confirm selected skill is `project_ops_coach`, Brain analyzes project/session context, and no write is created.
15. Send `Analyze my expenses this month`.
16. Confirm selected skill is `finance_analyst` and the answer is read-only unless the user explicitly logs an expense.
17. Send `How am I doing in the last 30 days?`.
18. Confirm selected skill is `life_review`, Brain can connect domains, and no records are created.
19. Send `What should we build next in LifeOS?`.
20. Confirm selected skill is `product_builder` and the answer gives product/architecture advice without LifeOS CRUD writes.
21. After a previous assistant answer, send `mettile in ordine cronologico`.
22. Confirm Brain uses the follow-up transform path, remains read-only, and creates no action.
23. Send `I might need a nap tomorrow afternoon, don't schedule a memo`.
24. Confirm negative write intent blocks writes regardless of planner output or selected skill.
25. Inspect the `/api/ai/chat` response or persisted `ai_chat_messages.metadata` in a test database and confirm `selected_skill` includes `id`, `label`, `confidence`, and `reason`.

## Brain AI-First Semantic Router

1. Send `yo, I just opened LifeOS`.
2. Confirm `brain_route.mode` is `casual_chat`, selected skill is `general_chat`, the answer is conversational, and no data dump or write occurs.
3. Send `I'm kinda tired but I don't know why`.
4. Confirm the route is `casual_chat` or `read_only_analysis`, selected skill is `health_coach` or `general_chat`, the answer gives light reasoning or asks whether to check logs, and no write occurs.
5. Send `remember my name, Ale`.
6. Confirm route `memory_write`, skill `memory_manager`, `ai_memories` is updated, and no Memo row is created.
7. Send `what do you currently know about me?`.
8. Confirm route `memory_recall`, skill `memory_manager`, and active memories are summarized.
9. With a memory about noisy dashboards present, send `forget the memory about noisy dashboards`.
10. Confirm route `memory_forget`; the matching memory is archived or Brain asks which matching memory to forget.
11. Send `Look at my last push workouts and tell me if chest today makes sense`.
12. Confirm route `read_only_analysis`, skill `workout_coach`, workout data is read, and no calendar event is created.
13. Re-run `Dumbbell bench press, dimmi prestazioni passate e come migliorare oggi`.
14. Confirm route `read_only_analysis`, skill `workout_coach`, and no calendar event.
15. Send `Be brutally honest: is LifeOS becoming too complicated?`.
16. Confirm route `read_only_analysis`, skill `product_builder`, real product critique, and no LifeOS CRUD write.
17. Send `gym tomorrow 5`.
18. Confirm route `clarification`, skill `calendar_planner`, and Brain asks whether to schedule gym, AM/PM, and/or end time. No write occurs.
19. Send `blocca domani un'ora per sistemare il Vault dopo pranzo`.
20. Confirm Brain asks for an exact time such as `14:30-15:30`, creates no event, and does not ask the generic `advice or create something` question.
21. Send `palestra sabato sera`.
22. Confirm Brain asks for exact time/duration and creates no event.
23. Send `tomorrow pill 8:30`.
24. Confirm route `clarification` or a clearly safe memo route only if enough information is present. Brain must not silently write the wrong reminder.
25. Send `I might need a nap tomorrow afternoon, don't schedule a memo`.
26. Confirm route write intent is false, no memo/event is created, and no scary action error is logged.
27. Send `remind me to take pill at 8:30pm`.
28. Confirm route `explicit_action`, skill `memo_assistant`, and a memo is created.
29. Send `blocca domani 14:30-15:30 per sistemare il Vault`.
30. Confirm route `explicit_action`, skill `calendar_planner`, and a calendar event is created.
31. Send `schedule study tomorrow from 15:00 to 17:00`.
32. Confirm route `explicit_action`, skill `calendar_planner`, and a calendar event is created.
33. After a long answer, send `fammi una tabella`.
34. Confirm route `follow_up_transform`, no LifeOS data write, and the previous answer is transformed.
35. Multi-turn check: send `gym tomorrow 5`, then answer `yes, 5pm to 6:30`.
36. Confirm the second message can route `explicit_action` with `calendar_planner` and create the event only if all required fields are clear.
37. Inspect persisted `ai_chat_messages.metadata.brain_route` and confirm it includes `mode`, `primary_skill`, `confidence`, `needs_data`, `write_intent`, and `risk_level`.
38. Confirm route metadata is included in sanitized AI action log payloads when actions are created.

## Brain Pending Actions

1. Send `oggi ho fatto un pisolino dalle 7.40 alle 10 di sera`.
2. Confirm Brain asks whether to save the nap with the known date/time, such as `Pisolino 19:40-22:00`, and does not ask again for date/time.
3. Reply `si`.
4. Confirm Brain saves the nap in today's Health notes and answers that it was saved.
5. Repeat the nap prompt and reply `si, fai oggi e il tempo te l'ho gia dato`.
6. Confirm Brain uses the original pending action data and does not repeat the same clarification.
7. Repeat the nap prompt and reply `si ma non segnarlo`.
8. Confirm negative intent wins, no Health write occurs, and the pending action is cancelled.
9. Send `blocca domani un'ora per sistemare il Vault dopo pranzo`.
10. Confirm Brain stores a pending calendar action with known title/date/duration, asks for an exact time, and creates no event.
11. Reply `14:30-15:30`.
12. Confirm Brain creates the calendar event using the stored title/date and the supplied time range.
13. Repeat the vague calendar prompt and reply `non bloccarlo, come non detto`.
14. Confirm Brain cancels the pending action and creates no event.
15. Send `palestra sabato sera`.
16. Confirm Brain asks for exact time/duration and does not create an event yet.
17. Reply `18-19:30`.
18. Confirm Brain creates the calendar event or asks one final confirmation only if needed; it must not restart generic conversation.
19. Send `antibiotico dopo cena`.
20. Confirm Brain asks for exact reminder date/time and creates no memo yet.
21. Reply `stasera alle 21:30`.
22. Confirm Brain creates the memo using the stored title and supplied date/time.
23. Send `ricordami sta cosa domani`.
24. Confirm Brain asks what reminder content to use, preserving the known `tomorrow` date.
25. Reply `di caricare le AirPods`.
26. Confirm Brain creates a date-only memo if supported or asks only for the missing time; it must not lose the `tomorrow` date.
27. After a pending calendar clarification, send `comunque come sto andando con i workout?`.
28. Confirm Brain does not execute the pending calendar action and answers the workout question or asks whether to ignore the pending action.
29. Retry a pending action confirmation after a timeout if possible.
30. Confirm no duplicate records are created; completed/cancelled pending action metadata prevents reusing the same pending id.

## Brain Working Context / Referent Resolution

1. Send `oggi ho fatto un pisolino dalle 7.40 alle 10 di sera`.
2. Confirm Brain asks to save the Health note with `19:40-22:00`.
3. Reply `si`.
4. Confirm Brain saves the Health note.
5. Send `aggiungilo anche al calendario`.
6. Confirm Brain creates a Calendar event using the same date, `19:40`, and `22:00`; it must not ask for date/time again.
7. Confirm the completion response is in Italian.
8. If a calendar pending action exists, send `la data e il tempo che hai gia usato`.
9. Confirm Brain fills date/time from the last subject and does not repeat the same question.
10. Send `crea anche un memo con lo stesso orario`.
11. Confirm Brain uses the last subject's date/time and creates the memo or asks only for fields truly missing.
12. Open a new empty chat and send `aggiungilo anche al calendario`.
13. Confirm Brain asks what should be added and creates no action.
14. Create or log two different things, then send `aggiungilo anche al calendario`.
15. Confirm Brain asks which referent is meant and creates no action until clarified.
16. In an Italian thread, confirm command-draft clarifications/completions stay in Italian and do not fall back to English.
17. After a last subject exists, send `aggiungilo anche al calendario, anzi no non farlo`.
18. Confirm no action is created.
19. If the last subject is a Health note, send `spostalo a domani`.
20. Confirm Brain does not claim it moved the Health note and instead explains the supported alternative or asks if it should create a new linked event/memo.
21. After a pending calendar clarification, send `comunque come sto andando con i workout?`.
22. Confirm Brain does not execute the pending action and answers the workout question.
23. Retry after executing a referential command with the same client request id if possible.
24. Confirm no duplicate calendar/memo records are created.

## Brain Vault

1. Ask a useful workout analysis question, such as `Dumbbell bench press, dimmi prestazioni passate e come migliorare oggi`.
2. Confirm the answer appears normally with no modal and no prominent manual Save button.
3. Confirm a Vault document is auto-saved in the backend when the answer is long/structured enough.
4. Confirm casual short chat such as `yo` does not create a Vault document.
5. If diagnostics are available, open the Vault document and confirm the full Markdown-like content renders safely.
6. Archive the document through diagnostics/API and confirm it disappears from active Vault documents.
7. Confirm saved chunks use Gemini Embedding 2 with `embedding_model = 'gemini-embedding-2'` and 1536 dimensions.
8. Ask a new related workout question and confirm Brain can reuse/reference the saved report as context when relevant.
9. Confirm the assistant message metadata includes Vault context when relevant chunks are retrieved.
10. Temporarily remove or invalidate Gemini embedding access in a test deployment and confirm saving still works, chunks are skipped/failed, and Brain answers without crashing.
11. Run the Vault Re-embed action and confirm old skipped/failed/pending or wrong-model chunks are repaired when Gemini embedding is available.
12. After an assistant answer, send `save this as a workout report`.
13. Confirm Brain saves the latest assistant answer to Vault and does not create a memo/calendar event.
14. Confirm the created action log, if shown, uses `create_vault_document` and does not expose raw secrets.
15. Confirm Vault context is advisory only: a saved report that mentions a schedule or reminder must not create new calendar/memo rows unless the current user message explicitly asks for that write.
16. Confirm `[[Back Day]]`-style links in saved content appear in document detail metadata if present.
17. Pull to refresh and confirm Vault documents reload in backend/diagnostics.
18. Confirm diagnostics Vault detail modal has no horizontal overflow if exposed.

## WhatsApp Inbound Brain

Use the deployed endpoint with `LIFEOS_WHATSAPP_BRIDGE_SECRET` and `LIFEOS_WHATSAPP_ALLOWED_SENDERS` configured.

Manual curl shape:

```bash
curl -X POST "https://lifeos-ruby-gamma.vercel.app/api/integrations/whatsapp/inbound" \
  -H "Content-Type: application/json" \
  -H "x-lifeos-whatsapp-secret: YOUR_SECRET" \
  -d '{
    "from": "111780936298528@lid",
    "message_id": "manual-test-1",
    "body": "come stai?",
    "type": "chat",
    "is_group": false,
    "source": "whatsapp"
  }'
```

1. Send valid body `come stai?` with valid secret and allowed `from`.
2. Confirm status `200`, JSON contains `reply`, `thread_id`, and `source: whatsapp`, and the reply is concise.
3. Confirm one dedicated backend Brain thread is created or reused with `metadata.source = whatsapp` and `metadata.whatsapp_sender`.
4. Open the app Brain UI and confirm it still opens fresh `New Chat` by default and does not show old thread selection or the WhatsApp thread in normal UI.
5. Send WhatsApp body `oggi ho fatto un pisolino dalle 7.40 alle 10 di sera`.
6. Confirm Brain asks confirmation in Italian with known `Pisolino 19:40-22:00` details and does not write yet unless the existing Brain rules choose a safe direct write.
7. Send WhatsApp body `si` from the same sender.
8. Confirm the Health note is saved and the reply confirms it in Italian.
9. Send WhatsApp body `aggiungilo anche al calendario`.
10. Confirm Working Context resolves the previous nap, creates a Calendar event with the same date/time, and does not ask for date/time again.
11. Send WhatsApp body `segnami creatina alle 9:37`.
12. Confirm today's Creatine habit logs with canonical time `09:37` and the reply confirms it.
13. Send WhatsApp body `aggiungilo al calendario, anzi no non farlo`.
14. Confirm no action is created and negative intent wins.
15. Repeat a request with the same `message_id` if possible and confirm normal client request id dedupe/idempotency avoids obvious duplicate writes.
16. Call with the wrong `x-lifeos-whatsapp-secret` and confirm `401`.
17. Call with an unallowed `from` and confirm `403`.
18. Call with a body over 4000 characters and confirm it is rejected safely.
19. Call with `type` other than `chat` and confirm v1 rejects it without invoking Brain.
20. Confirm WhatsApp source metadata appears on persisted user/assistant messages and sanitized AI action logs, without exposing bridge secret, Supabase keys, Gemini keys, or Authorization headers.

## Proactive WhatsApp Memo Outbox

Run `npm run test:brain` first. It covers pure candidate generation, idempotency keys, outbox status transitions, proactive memo reply intent normalization, and proactive working-context metadata.

Manual deployed QA:

1. Run the latest `supabase/schema.sql` and confirm `brain_outbox_messages` and `brain_proactive_rules` exist.
2. Create an open memo with `memo_date = today` and `memo_time` two minutes in the future.
3. After it is due, call `POST /api/integrations/whatsapp/outbox` with `action: "evaluate"`, valid secret, and allowed `recipient`.
4. Confirm the response reports at least one queued message, or debug output explains duplicate/suppression.
5. Call `POST /api/integrations/whatsapp/outbox` with `action: "poll"`.
6. Confirm one message is returned with `rule_key: timed_memo_due`, `source_type: memo`, and a concise WhatsApp body.
7. Call `POST /api/integrations/whatsapp/outbox` with `action: "ack"` and `status: sent`.
8. Confirm the outbox row becomes `sent`.
9. Confirm an assistant message is persisted in the dedicated WhatsApp Brain thread with `metadata.proactive_message = true`, `expected_reply_type = memo_done_snooze_cancel`, and `working_context.last_subject.type = memo`.
10. Through WhatsApp inbound from the same sender, reply `fatto`.
11. Confirm the memo status becomes `done` and the reply confirms completion.
12. Repeat with another timed memo and reply `snooze 30`.
13. Confirm the memo remains open and its `memo_date`/`memo_time` move forward.
14. Repeat with `annulla`.
15. Confirm the memo is dismissed and queued/claimed reminders for that memo are cancelled.
16. Repeat with `?` or `perche?`.
17. Confirm Brain explains the reminder and does not mark the memo done, snooze it, or dismiss it.
18. Run evaluate twice for the same due memo and confirm duplicate outbox rows are not created.
19. Let a timed memo expire past the v1 expiry window and confirm poll does not send it.
20. Confirm Home and Brain UI do not change and old WhatsApp backend threads remain hidden from normal Brain UI.

## WhatsApp Pending Action Resolution

1. Send WhatsApp body `Segna che sto andando a dormire ora alle 3.41am`.
2. Confirm Brain either saves directly or asks one specific confirmation such as `Confermi che devo registrare l'inizio del sonno alle 03:41?`.
3. Confirm Brain does not ask generic `Che dettaglio devo usare?`.
4. If confirmation is asked, send `Sì`.
5. Confirm Brain saves sleep start and replies in Italian, for example `Salvato: inizio sonno alle 03:41.`.
6. Confirm the same pending action is marked completed and Brain does not repeat the confirmation.
7. Repeat the sleep-start prompt and test confirmation variants `si`, `Sì`, `ok`, `confermo`, `fallo`, and `procedi`.
8. Confirm each variant resolves the open pending action when applicable.
9. Repeat the sleep-start prompt and send `no` or `non farlo`.
10. Confirm no write occurs, the pending action is cancelled, and Brain does not loop.
11. Repeat the sleep-start prompt and send `?`.
12. Confirm Brain explains the active pending action in Italian and does not create a new pending action.
13. Repeat the sleep-start prompt and send `Conferma inizio del sonno alle 3:41`.
14. Confirm Brain treats it as confirmation with details, executes the pending action, and does not ask again.
15. Confirm the saved sleep start uses the same behavior as `/api/actions/sleep-start`, including Europe/Rome date handling and next-day sleep-hours recalculation when wake time exists.
16. Send the nap flow from the same WhatsApp sender: `oggi ho fatto un pisolino dalle 7.40 alle 10 di sera`, then `si`, then `aggiungilo anche al calendario`.
17. Confirm all messages use the same backend WhatsApp thread, Working Context resolves the nap, and Brain does not ask for date/time again.

## Dirty Pending Action Normalization / Sleep Start

Run `npm run test:brain` first; it covers the pure regression cases in this section. Then run the live/manual cases below for app or WhatsApp execution.

1. Send app or WhatsApp message `Segna che sto andando a dormire ora alle 3.41am`.
2. Confirm Brain either saves directly or asks one specific confirmation for sleep start at `03:41`.
3. Confirm Brain never asks generic `Che dettaglio devo usare?`.
4. If a pending action is created, inspect trace/metadata and confirm `pending_action.type` or `action_type` is `log_sleep_start`, `missing_fields` is empty, and args contain canonical `time: "03:41"`.
5. Reply `Si` or `Sì`.
6. Confirm Brain executes the sleep-start action, does not repeat the confirmation, and trace shows `pending_reply_intent: confirm`, `pending_resolution: executed`, and tool/action `log_sleep_start`.
7. Manually simulate or inspect a legacy pending action shaped as `update_health_log` with `args.activity = "sonno"`, `args.start_time = "03:41"`, and `missing_fields = ["health_field"]`.
8. Confirm validation normalizes it to `log_sleep_start` with `args.time = "03:41"` and no missing fields.
9. Manually simulate or inspect a legacy pending action shaped as `update_health_log` with `args.health_field = "inizio sonno"`, `args.start_time = "03:41"`, and `missing_fields = ["health_field"]`.
10. Confirm validation normalizes it to `log_sleep_start` with no stale `health_field`.
11. Send `segna nota salute: mal di testa leggero alle 16`.
12. Confirm generic Health note logging still uses `update_health_log` and is not coerced to sleep start.
13. Send `oggi ho fatto un pisolino dalle 7.40 alle 10 di sera`.
14. Confirm naps/pisolini remain Health notes/context and are not mapped to `sleep_start`.
15. Send `segnami creatina alle 9:37`.
16. Confirm the action still works and trace shows Vault retrieval was not attempted for the simple explicit write.

## Brain Trace Debugging

1. Send a normal app Brain message.
2. Inspect the assistant row in Supabase `ai_chat_messages.metadata.brain_trace`.
3. Confirm the trace exists, has `source: app`, includes `thread_id`, `user_message_id`, `selected_skill` or `route` when available, and includes `latency_ms`.
4. Call `/api/ai/chat` with `x-lifeos-debug: true` in a test request.
5. Confirm the JSON response includes `debug.brain_trace` and the normal assistant answer is unchanged.
6. Send a WhatsApp inbound message through `/api/integrations/whatsapp/inbound` with a valid secret/from/body and `x-lifeos-debug: true`.
7. Confirm the JSON response includes `debug.brain_trace` with `source: whatsapp`, `whatsapp_sender`, `whatsapp_message_id`, and `thread_id`.
8. Trigger a pending action through WhatsApp, then reply `Si`.
9. Confirm the trace for the confirmation reply shows `pending_action.found: true`, `pending_reply_intent: confirm`, `pending_resolution: executed` or a safe failure, and a tool/action result entry.
10. For the sleep-start flow, confirm the trace makes the failure point obvious if it breaks: missing pending action means thread/context issue, `pending_reply_intent: other` means normalization issue, generic Health command draft means mapping issue, and tool failure means execution issue.
11. Inspect persisted trace metadata and debug responses.
12. Confirm traces do not include API keys, bridge secrets, Authorization headers, Supabase service keys, Gemini keys, cookies, chain-of-thought, raw provider internals, or huge Vault chunk text.

## API Security

1. Call `POST /api/ai/chat` with no `Authorization` header and confirm `401`.
2. Call it with an invalid bearer token and confirm `401`.
3. Set a wrong signed-in user and confirm the backend rejects it.
4. Temporarily remove `GEMINI_API_KEY` in a test deployment and confirm a clear config error.
5. Confirm no response includes `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, or token values.

## Planner And Analysis

1. Ask: `How have I been doing in the last 30 days?`
2. Confirm the assistant reads persisted LifeOS context and mentions sparse data if applicable.
3. Ask: `Analyze my expenses in the last 3 months.`
4. Confirm it uses expenses and the 3-month range.
5. Ask: `Am I progressing in workouts?`
6. Confirm warmups are not treated as working volume or PR evidence.
7. Confirm the selected-date workout context card also excludes warmups from set count and volume.
8. Ask a broad question with no data and confirm it does not invent records.

## Low-Risk Writes

1. Ask: `Add a 25 dollar expense for ChatGPT Plus.`
2. Confirm an expense is created and appears in Finances after refresh, while Home does not show a Money/Spend section.
3. Ask: `add a 25 euro expense for ChatGPT Plus on 13/05/26. The category should be "Subscriptions"`
4. Confirm it creates `ChatGPT Plus`, amount `25`, category `Subscriptions`, spent on `2026-05-13`.
5. Ask: `25 euro expense for chatgpt plus`.
6. Confirm the saved expense category is `Subscriptions`, not `subscriptions`.
7. Confirm the success message is deterministic and uses the saved normalized category.
8. Ask with `13/05/2026` and confirm DD/MM/YYYY dates normalize correctly.
9. Ask with `25 euro`, `€25`, `25 dollar`, `$25`, and `12,50` in test expenses and confirm amounts validate correctly.
10. Ask: `Plan the dentist for tomorrow from 2 to 3 pm.`
11. Confirm a calendar event is created with the right date and times.
12. Confirm AI-created calendar events use preferred categories where possible: Work, Study, School, Health, Workout, Errands, Personal, Social, Entertainment, Sleep.
13. Ask for an event with a lowercase preferred category such as `work` or `study`.
14. Confirm the created event stores/displays the preferred category casing, such as `Work` or `Study`.
15. Ask: `Create an event today: take my mom to an appointment from 3:45 PM to 5:30 PM.`
16. Confirm the created event uses `Errands` or `Health` depending on whether Gemini frames it as logistics or a medical appointment.
17. Ask: `Plan dinner with friends tonight.`
18. Confirm the created event uses `Social` or `Entertainment` depending on wording.
19. Ask: `Block 30 minutes for journaling.`
20. Confirm the created event uses `Personal`.
21. Ask: `plan these events for today: science study session from 1:00pm to 2:15pm, lunch from 2:15pm to 2:30pm, study session from 2:30pm to 3:45pm, plan with mom (i gotta take her to the doctor) from 3:45 to 5:30 pm`
22. Confirm all four events are created successfully through the explicit multi-event path.
23. Confirm created events store/display canonical times: `13:00-14:15` Study, `14:15-14:30` Health, `14:30-15:45` Study, and `15:45-17:30` Health or Errands.
24. Ask the log-proven failing prompt: `plan these events for today: science study session from 12:45pm to 2:15pm, lunch from 2:15pm to 2:30pm, study session from 2:30pm to 3:45pm, plan with mom (i gotta take her to the doctor) from 3:45 to 5:30 pm`
25. Confirm it bypasses the general planner, does not fail with `Gemini returned an invalid planner response.`, and creates four events.
26. Confirm created events store/display canonical times: `12:45-14:15`, `14:15-14:30`, `14:30-15:45`, and `15:45-17:30`.
27. Ask: `plan today: science 12:45-2:15, lunch 2:15-2:30, study 2:30-3:45, mom doctor 3:45-5:30pm`
28. Confirm all four events are created and no `start_time` validation error appears.
29. Ask: `today i want to study from 2 to 3 pm, work from 4 to 5 pm, dance from 6 to 7 pm`
30. Confirm it creates three events through the explicit multi-event path and no planner invalid response appears.
31. Ask: `create event tomorrow dentist 2pm to 3pm`
32. Confirm it uses the single-event path and creates one event.
33. Ask: `analyze my last week and plan a more productive day tomorrow`
34. Confirm it uses the analyze-and-plan path, reads context, and does not use explicit multi-event extraction.
35. Ask: `Log that i took creatine today`
36. Confirm no `sleep_hours` validation error appears and today's Creatine habit increments or logs.
37. Ask: `Log that I showered today`
38. Confirm today's Shower habit increments or logs.
39. Ask: `I journaled today`.
40. Confirm Journal is not written as a visible Daily Habit; preserving the statement in notes is acceptable.
41. Ask: `Log 8 hours of sleep today`.
42. Confirm direct duration logging remains backward-compatible when no complete sleep/wake pair exists.
43. Set a previous-day sleep start and ask the AI to update today's wake time; confirm calculated `sleep_hours` is refreshed.
44. Ask with missing expense amount and confirm the assistant asks one concise clarification.
45. Ask: `Segna la giornata di oggi: sveglia 12.30pm, pranzo 13.30pm, matematica da 13.40pm a 4.30pm, palestra da 4.40pm a 6.40pm, cena 8pm`
46. Confirm the day-schedule path creates: Sveglia `12:30-12:45`, Pranzo `13:30-14:00`, Matematica `13:40-16:30`, Palestra `16:40-18:40`, and Cena `20:00-20:45`.
47. Confirm all events use the current Europe/Rome date, not the next UTC date.
48. Confirm the explicit Pranzo/Matematica overlap is preserved and no `title is required` error appears.
49. Ask: `plan today: wake up 9am, lunch 1pm, study from 2pm to 4pm, gym 5pm to 6pm, dinner 8pm`
50. Confirm it creates Wake Up `09:00-09:15`, Lunch `13:00-13:30`, Study `14:00-16:00`, Gym `17:00-18:00`, and Dinner `20:00-20:45`.
51. Confirm both mixed schedules log `create_calendar_events`, the created event count, source path, target date, and calendar record references in AI Action History.
52. Re-run the existing range-only prompt and confirm it still uses the explicit multi-event path.
53. Re-run `create event tomorrow dentist 2pm to 3pm` and confirm it remains a single event.
54. Re-run `remind me to take the pill at 8:30pm` and confirm it creates a memo, not a calendar event.
55. Re-run `25 euro expense for ChatGPT Plus` and confirm it creates an expense.

## Workout Advice Write Boundary

1. Ask: `Dumbbell bench press, dimmi prestazioni passate e come migliorare oggi`.
2. Confirm the assistant reads workout history, gives advice, creates no actions, and says no events or activities were created.
3. Ask: `Analizza i workout di petto precedente, dimmi prestazioni passate di panca piana e come provare a migliorare oggi`.
4. Confirm analysis only and no calendar rows.
5. Ask: `Analizza i workout degli ultimi giorni e dimmi cosa dovrei allenare oggi. Io pensavo di allenare petto ma ho paura di cedere con le spalle`.
6. Confirm analysis only and no `Azioni create` section.
7. Ask: `Programma petto oggi dalle 17 alle 18`.
8. Confirm explicit scheduling can create a calendar event.
9. Ask: `create chest workout in calendar today 5pm to 6pm`.
10. Confirm explicit calendar wording remains write-capable.

## Action History

1. Ask: `Log that i took creatine today`.
2. Confirm an `ai_action_logs` row is created with `action_type` `update_health_log`, `status` `success`, and a `health_logs` record reference.
3. Confirm Home does not show the entry in `Recent AI Activity` or any AI writes panel.
4. Confirm Assistant shows the entry in `Recent Actions` on desktop.
5. Send a Shortcut-style request to `/api/ai/chat` with `Authorization: Bearer <LIFEOS_ACTION_TOKEN>` if available.
6. Confirm the action log source is `shortcut` or `api` and no token value is stored.
7. Ask a recurrence request that creates seven events.
8. Confirm `action_count` is `7` and `record_refs` includes the created `calendar_events` ids.
9. Force a validation error, such as an invalid calendar time in a test environment.
10. Confirm an error action log is created with `status` `error`, safe `error_message`, and no Authorization headers, bearer tokens, Supabase keys, Gemini keys, provider raw debug output, or cookies.
11. Refresh the app and confirm action history remains visible.
12. Ask a long analyze-and-plan prompt and confirm Home/Assistant action previews stay compact instead of showing raw request/response text.
13. Confirm preview cards show source, status, time, uppercase action title, and count only.
14. Click an action preview and confirm the detail view opens.
15. Confirm the detail view shows the full request, full response, action type/count, request id when present, and record references.
16. Confirm saved response Markdown and `[info]`, `[warn]`, `[action]`, etc. render correctly in the detail view.
17. Confirm error action logs show the error message in the detail view.
18. Confirm the action detail view has no horizontal overflow on mobile and the X close button is visible.

## AI Memos

1. Ask: `remind me to charge my headphones in an hour`.
2. Confirm a memo is created with the current Europe/Rome date/time plus one hour.
3. Ask: `i gotta take the antibiotic pill at 8:30pm`.
4. Confirm a memo is created for today if 20:30 is still upcoming, otherwise tomorrow, with `memo_time` `20:30`.
5. Ask: `change the teeth braces on the 20/05/26`.
6. Confirm a date-only memo is created for `2026-05-20`.
7. Ask: `remember to buy charger`.
8. Confirm a no-date memo is created with `memo_date` and `memo_time` empty.
9. Confirm these prompts do not create `calendar_events`.
10. Confirm AI Action History logs `create_memo` with a `memos` record reference.

## Finite Calendar Recurrence

1. Ask: `everyday for 7 days starting from 17/05/26 i have a school appointment from 2pm to 4pm, log that`
2. Confirm it creates seven normal calendar events, not one event on today.
3. Confirm event dates are `2026-05-17` through `2026-05-23`, with time `14:00-16:00` and category `School`.
4. Ask: `for two weeks every monday log a school appointment from 2 to 3 pm`
5. Confirm it creates two Monday events in the next two weeks, with time `14:00-15:00` and category `School`.
6. Ask: `log a deep work session every day of next week from 4 to 8 pm`
7. Confirm it creates seven events for next week, with time `16:00-20:00` and category `Work`.
8. Ask: `all mondays of next month log school from 2pm to 3pm`
9. Confirm it creates one event for each Monday in next month.
10. Ask: `every other day of next month log deep work from 4pm to 8pm`
11. Confirm it creates every-other-day events within next month and stays under the event cap.
12. Ask: `every other day of july log deep work from 4pm to 8pm`
13. Confirm it creates every-other-day events in the next sensible upcoming July.
14. Ask: `all weekends for the next 3 weeks log boxing from 10am to 12pm`
15. Confirm it creates six events, Saturday and Sunday for three weeks, with category `Workout`.
16. Ask: `for the next 3 months every sunday log family lunch from 1pm to 3pm`
17. Confirm it creates every Sunday in the finite range, remains under the 60-event cap, and uses `Social` or another sensible category.
18. Ask: `every other day log gym from 5pm to 6pm`
19. Confirm the assistant asks for the date range and creates nothing.
20. Re-run: `today i want to study from 2 to 3 pm, work from 4 to 5 pm, dance from 6 to 7 pm`
21. Confirm it still uses the explicit multi-event path and not recurrence expansion.
22. Re-run: `create event tomorrow dentist 2pm to 3pm`
23. Confirm it still uses the single-event path and creates one event.
24. Re-run: `analyze my last week and plan a more productive day tomorrow`
25. Confirm it still uses the analyze-and-plan path and not recurrence expansion.

## Health Habit Context

1. Create several Health logs with different Shower, Creatine, and Skin counts/times.
2. Ask: `Analyze my sleeping behaviour and daily habits in the last 7 days.`
3. Confirm the assistant sees standalone habit stats rather than one generic hygiene total.
4. Confirm Brush and Journal are not presented as tracked Daily Habits.
5. Confirm Water is not emphasized in the assistant health analysis, while old Action API compatibility remains available if explicitly used.

## Analyze And Plan

1. Ask: `Analyze my last week and plan a 20% more productive day for tomorrow.`
2. Confirm it reads recent calendar/daily review/health context.
3. Confirm it creates a reasonable small calendar plan automatically.
4. Confirm no more than 8 events are created.
5. Confirm events are for tomorrow, have valid times, and do not overlap.
6. Confirm invalid proposed events are skipped and reported.

## Blocked Destructive Requests

1. Ask: `Delete my dentist appointment tomorrow.`
2. Confirm no record is deleted.
3. Confirm the assistant explains deletion is not enabled for v1.
4. Ask: `Wipe all my expenses.`
5. Confirm no destructive mutation runs.

## Response Rendering

1. Ask for an analysis response and confirm `**bold labels**` render as bold, not raw asterisks.
2. Confirm bullet lists render as indented lists.
3. Confirm numbered lists render as ordered lists.
4. Confirm inline code renders as a compact dark chip.
5. Confirm fenced code blocks are scrollable and do not create mobile horizontal overflow.
6. Confirm `[good]...[/good]`, `[warn]...[/warn]`, `[bad]...[/bad]`, `[info]...[/info]`, and `[action]...[/action]` render as compact colored LifeOS callouts.
7. Confirm unknown tags such as `[critical]...[/critical]` render as plain text and do not create custom styling.
8. Confirm broken or unclosed callout tags do not crash the Assistant.
9. Confirm raw HTML from a response renders as text or is ignored, and never executes.
10. Confirm user messages remain plain text and do not render Markdown.
11. Confirm action result cards still render below assistant content.
12. Confirm Markdown and callouts still render after provider-error and deterministic-write changes.

## Provider Errors

1. Simulate or observe Gemini `429` and confirm the UI says `Gemini rate limit reached. Try again shortly.`
2. Simulate or observe Gemini `500` or `503` and confirm the UI says `Gemini is temporarily unavailable. Try again shortly.`
3. Simulate Gemini `400` and confirm the UI says `Gemini rejected the request.`
4. Confirm the error card shows `requestId` when returned.
5. Confirm provider status is shown as `Provider: 503` or the relevant status.
6. Confirm safe provider messages can appear, but no stack traces, API keys, bearer tokens, or env values appear.
7. Confirm invalid planner JSON returns `Gemini returned an invalid planner response.` and no write is executed.
8. Confirm complex analysis can still use multiple Gemini calls, while simple create expense/calendar/health writes avoid the final answer call.
9. Force a write validation failure in a test environment and confirm server logs include a requestId, planner intent, sanitized planner args shape, write path, and error without exposing secrets.
10. With `LIFEOS_DEBUG_AI=true` in a test deployment only, confirm error responses include sanitized debug diagnostics. Turn it back off after testing.

## Temporary Planner Diagnostics

1. Run a non-obvious request that still reaches the general planner and intentionally produces invalid planner JSON in a test deployment.
2. If the response says `Gemini returned an invalid planner response.`, open Vercel logs for the `/api/ai/chat` request.
3. Confirm the log line starts with `[LifeOS AI planner failure]`.
4. Confirm it includes `requestId`, `stage: planner`, `explicitMultiEventLikely`, `timeRangeCount`, sanitized error details, and any available provider status.
5. Confirm no Authorization headers, bearer tokens, Supabase keys, Gemini keys, service role keys, cookies, or raw env vars appear.
6. In a test deployment only, set `LIFEOS_DEBUG_AI=true` and confirm the error response includes sanitized planner debug details. Remove it after testing.

## Mobile / iPhone

1. Open Assistant on iPhone Safari.
2. Confirm Brain contains the persistent chat surface and a single compact New Chat icon/button.
3. Confirm Memory/Vault are hidden from the default Brain UI or only visible behind diagnostics.
4. Confirm no old-chat/thread selector is shown in the default mobile UI.
5. Confirm no range/scope dropdowns exist.
6. Confirm Daily Review and canned prompt Suggestions are absent.
7. Confirm the textarea uses 16px text and does not zoom.
8. Confirm the composer/send button is thumb-friendly, inside the Brain panel, and not covered by bottom nav.
9. Confirm the Assistant page itself does not require long scrolling to reach the composer/widget.
10. Confirm messages scroll inside the chat widget when the conversation grows.
11. Confirm Recent Actions remains compact on desktop and opens its detail view.
