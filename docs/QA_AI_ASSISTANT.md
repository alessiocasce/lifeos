# LifeOS AI Assistant QA

Run this after deploying to Vercel with:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LIFEOS_ACTION_USER_ID`
- `LIFEOS_ACTION_TOKEN`
- `GEMINI_API_KEY`
- optional `GEMINI_MODEL`

The in-app Assistant sends the signed-in user's Supabase access token to `/api/ai/chat`. The backend verifies that user against `LIFEOS_ACTION_USER_ID`. The endpoint also accepts the action token for trusted server/tool callers.

Run the latest `supabase/schema.sql` before this checklist so Brain thread, message, memory, and insight tables exist.

## Persistent Brain Chat

1. Send a message in Brain and wait for the assistant response.
2. Refresh `/assistant` and confirm both user and assistant messages remain.
3. Send a follow-up that depends on the previous exchange and confirm Brain retains bounded conversation context.
4. Create `New Chat` and confirm the old active thread remains selectable.
5. Confirm the new thread title changes from `New Chat` to a deterministic title based on the first message.
6. Archive the current thread and confirm another active thread is selected without affecting its messages.
7. Pull to refresh and confirm the thread list and active thread messages reload.
8. Confirm a failed AI request stores only a safe user-facing assistant error, not raw server/provider internals.

## Brain Memory

1. Say: `Remember that I prefer direct practical advice and hate noisy dashboards.`
2. Confirm the response acknowledges it and a memory appears under `What LifeOS Knows`.
3. Ask later: `How should you answer me?`
4. Confirm Brain applies the preference without dumping the entire memory list.
5. Ask: `What do you remember about me?` and confirm active memories are summarized.
6. Edit the memory in the panel, refresh, and confirm the edit persists.
7. Archive/forget the memory from the panel and confirm it disappears from active memory and future prompt context.
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
7. Refresh Brain and confirm the memory panel still shows the name memory.
8. Send `my name is Ale`.
9. Confirm it updates/deduplicates the name memory instead of creating duplicate identity rows.
10. Send `what do you remember about me?`.
11. Confirm Brain summarizes active memories by category and mentions the memory panel can edit or forget them.
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
2. Confirm an expense is created and appears in Finances/Home after refresh.
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
3. Confirm Home shows the entry in `Recent AI Activity`.
4. Confirm Assistant shows the entry in `Recent Actions`.
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
2. Confirm Brain contains persistent chat, compact thread selection, New Chat, `What LifeOS Knows`, and Recent Actions.
3. Confirm the thread selector and memory panel do not overflow horizontally.
4. Confirm no range/scope dropdowns exist.
5. Confirm Daily Review and canned prompt Suggestions are absent.
6. Confirm the textarea uses 16px text and does not zoom.
7. Confirm the sticky composer/send button is thumb-friendly and not covered by bottom nav.
8. Confirm Recent Actions remains compact and opens its detail view.
