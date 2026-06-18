# LifeOS Deployment QA

Run this against the deployed URL after applying `supabase/schema.sql` to the target Supabase project and setting deployment environment variables.

Core Brain/automation env vars include:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LIFEOS_ACTION_USER_ID`
- `LIFEOS_ACTION_TOKEN`
- `GEMINI_API_KEY`
- `LIFEOS_WHATSAPP_BRIDGE_SECRET`
- `LIFEOS_WHATSAPP_ALLOWED_SENDERS`
- optional `LIFEOS_BRAIN_DEBUG`
- optional `LIFEOS_BRAIN_DEBUG_FULL`

## Auth

1. Open the deployed URL while signed out.
2. Confirm the setup/config screen does not appear when env vars are set correctly.
3. Sign up with a test account.
4. If email confirmation is enabled, complete confirmation and sign in.
5. Refresh the page and confirm the session persists.

## Health

1. Open Health.
2. Create today's health log with sleep times, Coffee, ADC, notes, and time-aware Daily Habits.
3. Save, refresh, and confirm the values reload.
4. Update ADC and at least one Daily Habit.
5. Save again and confirm today's row updates instead of duplicating.

## Calendar

1. Open Calendar.
2. Create an event for today.
3. Edit the title, time, category, or status.
4. Delete the event.
5. Refresh and confirm deleted events do not return.

## Workout

1. Open Workout.
2. Start or select today's workout session.
3. Add a set with exercise, weight, reps, RPE, and date.
4. Refresh and confirm the session and set reload.

## Finances

1. Open Finances.
2. Create one expense dated today.
3. Confirm selected-month spend updates.
4. Refresh and confirm the expense reloads.

## Brain Persistence And Memory

1. Open Assistant.
2. Send a Brain message and refresh; confirm Brain opens a fresh New Chat draft while old messages remain persisted in Supabase/backend context.
3. Confirm old-thread selection remains hidden in the normal UI for now.
4. Add an explicit durable memory and confirm it can be recalled by asking Brain what it remembers or through diagnostics if exposed.
5. Archive/forget the memory through supported controls or commands and confirm it is no longer active AI context.
6. Verify RLS with a second user: threads, messages, memories, insights, Vault documents, and Vault chunks must remain user-scoped.
7. Confirm `/api/ai/chat` persists app messages without changing Shortcut/API action behavior.
8. Send `hello` and confirm `/api/ai/chat` returns selected skill `general_chat` and the assistant message shows a subtle skill badge.
9. Send `What should we build next in LifeOS?` and confirm selected skill `product_builder` is returned/persisted without any LifeOS CRUD write.
10. Send a workout-advice prompt and confirm selected skill `workout_coach` is returned while no calendar event is created.
11. Inspect the persisted assistant row in `ai_chat_messages` and confirm `metadata.selected_skill` is present for new assistant messages.
12. Ask a long eligible analysis and confirm an assistant response can auto-save to Brain Vault without a prominent manual save flow.
13. With `GEMINI_API_KEY` configured, confirm chunks are embedded with `embedding_model = 'gemini-embedding-2'` and a related future Brain question can retrieve the saved report.
14. If Gemini embedding fails or is rate-limited, confirm the Vault document still saves, chunks are marked failed/skipped, and Brain keeps working.

## Home

1. Open Home.
2. Confirm Home reflects persisted Health, Workout, Expense, Calendar-adjacent shell state, and recent AI actions where applicable.
3. Confirm empty states do not show for records just created.

## Direct Tab Routes

1. Directly visit `/calendar`, `/workout`, `/projects`, and `/memos` on the deployed URL.
2. Refresh each direct route and confirm the app loads without a Vercel 404 and keeps the matching tab active.
3. Directly visit `/money` and confirm Finances opens.
4. Directly visit `/ai` and confirm Assistant opens.
5. Confirm `/api/ai/chat` still returns API behavior and is not rewritten to the SPA.
6. Confirm `/api/ai/actions` still returns API behavior and is not rewritten to the SPA.
7. Confirm `/api/integrations/whatsapp/inbound` still returns API behavior and is not rewritten to the SPA.
8. Confirm `/api/actions/expense`, `/api/actions/health`, and `/api/actions/calendar` still reach serverless API behavior.

## Sign Out / Sign In

1. Sign out.
2. Confirm the app returns to the global auth screen.
3. Sign back in with the same account.
4. Confirm persisted records reload.

## User Scope

1. Sign out.
2. Sign in with a second test account.
3. Confirm the first user's Health, Workout, Expense, Calendar, and Daily Review data does not appear.
4. Create one record as the second user.
5. Sign back in as the first user and confirm the second user's data is hidden.

## iPhone Safari

1. Open the deployed URL in iPhone Safari.
2. Confirm no horizontal scrolling on Home, Health, Workout, Finances, Calendar, or Assistant.
3. Confirm inputs do not zoom on focus.
4. Confirm the bottom navigation does not cover Health controls, Save Set, Create Event, Save Expense, or Save Review.
5. Confirm Health Coffee/ADC counters and time-aware Daily Habits are thumb-friendly.
6. Confirm Workout set logging is usable one-handed.

## PWA / Home Screen

1. Run `docs/QA_PWA.md` against the deployed HTTPS URL.
2. Confirm LifeOS can be added to the iPhone Home Screen.
3. Confirm the installed app opens standalone and keeps API/Supabase/Gemini responses uncached.
4. Confirm PWA start still opens normally after the tab-route rewrite deployment.
5. Change data on desktop, pull down from the top of the installed PWA, and confirm one refresh synchronizes data across multiple modules.
6. Deploy a new Vercel version, keep the installed PWA open, and pull to refresh.
7. With no meaningful unsaved work, confirm the waiting service worker activates and LifeOS reloads once without closing the PWA.
8. Repeat with a complete unsaved Workout set and confirm auto-reload is blocked with `Update ready - save current workout set first.`
9. Confirm incomplete half-written fields do not block the update.
10. Save the set, pull again, and confirm the update applies.
11. Confirm there is no repeated or infinite reload loop.
12. Confirm `/api/ai/chat`, `/api/ai/actions`, and `/api/actions/*` still return API behavior after the update.
13. Confirm the installed iPhone PWA moves the main tab content with the pull gesture, holds it lowered during refresh, and smoothly returns it afterward.
14. Confirm the shell header and bottom navigation remain stable and no content remains stuck translated after success, failure, or an update-ready guard.
15. Pull to refresh on Brain and confirm threads, current messages, memories, insights, Vault documents, and Recent Actions update without wiping typed composer text.

## Brain Schema Deployment

1. Run the latest `supabase/schema.sql` before testing Brain persistence.
2. Confirm `ai_chat_threads`, `ai_chat_messages`, `ai_memories`, `ai_insights`, `ai_vault_documents`, and `ai_vault_chunks` exist.
3. Confirm authenticated users can only read/write their own rows.
4. Confirm the composite thread/message ownership foreign key rejects cross-user message insertion.
5. Confirm deploying Brain changes does not break `/api/actions/health`, `/api/actions/wake`, `/api/actions/sleep-start`, `/api/actions/habit`, `/api/actions/calendar`, or `/api/actions/expense`.
6. Confirm the `vector` extension is enabled in the `extensions` schema.
7. Confirm `match_ai_vault_chunks` does not return another user's chunks.
8. Confirm `match_ai_vault_chunks_for_user` is usable by service-role calls and still filters to the configured target user.
9. Confirm server-only `GEMINI_API_KEY` is deployed for Brain and Brain Vault semantic retrieval.
10. Optionally set `GEMINI_EMBEDDING_MODEL=gemini-embedding-2`; do not add `OPENAI_API_KEY` for Vault embeddings.
11. Save a Vault report and confirm chunks are `ready` with `embedding_model = 'gemini-embedding-2'`.
12. Run the Vault `Re-embed` repair action for old skipped, failed, pending, null-model, or non-Gemini chunks.
13. Confirm Brain Skill Architecture still stores skill/route/Vault metadata in existing JSON metadata fields.

## Brain Trace Debugging

1. Keep `LIFEOS_BRAIN_DEBUG` unset or false during normal production use.
2. For an active investigation, set `LIFEOS_BRAIN_DEBUG=true` and redeploy.
3. Confirm Vercel function logs print compact `BRAIN_TRACE` JSON lines for Brain-handled messages.
4. Keep `LIFEOS_BRAIN_DEBUG_FULL` unset or false unless actively debugging a hard issue.
5. If `LIFEOS_BRAIN_DEBUG_FULL=true` is enabled, confirm traces still cap text fields and never include secrets, API keys, auth headers, or chain-of-thought.
6. Call `/api/ai/chat` or `/api/integrations/whatsapp/inbound` with `x-lifeos-debug: true`.
7. Confirm the JSON response includes `debug.brain_trace`.
8. Inspect Supabase `ai_chat_messages.metadata.brain_trace` on assistant rows and confirm trace metadata is persisted even when the HTTP response is not in debug mode.
9. Turn debug env vars back off after investigation.

## WhatsApp Bridge Deployment

1. Set Vercel env vars:
   - `LIFEOS_WHATSAPP_BRIDGE_SECRET`
   - `LIFEOS_WHATSAPP_ALLOWED_SENDERS`
2. Redeploy after setting the env vars.
3. On the local bridge machine, set:
   - `LIFEOS_BASE_URL=https://lifeos-ruby-gamma.vercel.app`
   - `LIFEOS_WHATSAPP_BRIDGE_SECRET` to the same shared secret as Vercel.
   - `WHATSAPP_ALLOWED_SENDERS` to the sender id allowed locally.
4. Do not add Supabase service keys, Gemini keys, database credentials, or frontend-only env values to the local bridge.
5. Confirm `.env`, `.wwebjs_auth/`, and `.wwebjs_cache/` are not committed.
6. Run the local bridge, scan the QR code, and keep the PC awake.
7. If the PC sleeps or the process stops, confirm WhatsApp inbound stops until the bridge is restarted.
8. For 24/7 operation, move the bridge to an always-on PC, Raspberry Pi, or VPS.
9. Manually test the deployed endpoint:

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

Expected:

- `200`
- JSON includes `reply`, `thread_id`, and `source: whatsapp`
- Wrong secret returns `401`
- Unallowed sender returns `403`
- Non-text message types are rejected safely
- Brain app UI still opens fresh New Chat and does not show the WhatsApp backend thread selector

10. To debug the same endpoint, add `x-lifeos-debug: true`:

```bash
curl -X POST "https://lifeos-ruby-gamma.vercel.app/api/integrations/whatsapp/inbound" \
  -H "Content-Type: application/json" \
  -H "x-lifeos-whatsapp-secret: YOUR_SECRET" \
  -H "x-lifeos-debug: true" \
  -d '{
    "from": "111780936298528@lid",
    "message_id": "debug-test-1",
    "body": "Segna che sto andando a dormire ora alle 3.41am",
    "type": "chat",
    "is_group": false,
    "source": "whatsapp"
  }'
```

Expected:

- JSON includes `reply`
- JSON includes `debug.brain_trace`
- The debug trace is not included inside the WhatsApp `reply` text

11. To debug an actual live WhatsApp message, inspect Vercel `BRAIN_TRACE` logs if enabled, Supabase `ai_chat_messages.metadata.brain_trace`, and matching `client_request_id` or WhatsApp `message_id`.

Troubleshooting:

- If WhatsApp repeats the same pending-action confirmation after `Sì`, confirm the bridge sends the same stable `from` id on every message.
- Confirm `LIFEOS_WHATSAPP_ALLOWED_SENDERS` exactly matches that `from` value.
- Confirm the endpoint is reusing one WhatsApp Brain thread per sender instead of creating a new thread per message.
- Inspect the latest assistant message metadata and confirm `pending_action` exists after the confirmation prompt.
- Confirm a later assistant message stores the same `pending_action.id` with `status: completed` or `status: cancelled` after resolution.
- For sleep-start commands, confirm the action type is `log_sleep_start` and not a generic Health note.

## Known Non-Failing Build Warning

The production build may warn that a JavaScript chunk is larger than 500 kB. This is expected for now and does not block deployment.
