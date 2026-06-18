# LifeOS Full-App Manual QA

Run this after applying `supabase/schema.sql` to a Supabase project and setting `.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## Auth Gate

1. Open the app while signed out.
2. Confirm the LifeOS shell and tabs are not visible.
3. Create a fresh account or sign in with an existing account.
4. If email confirmation is required, confirm the sign-up message is clear.
5. After sign-in, confirm the shell and bottom mobile navigation render.

## Create Persisted Records

1. Open Health.
2. Create today's health log with Sleep Start, Wake Time, Coffee, ADC, Daily Habits, and optional notes.
3. Open Workout.
4. Start today's workout session.
5. Add one set with exercise, weight, reps, RPE, and date.
6. Open Finances.
7. Create one expense dated today.
8. Open Calendar.
9. Create one event dated today.
10. Confirm the event is created from the modal and appears in the selected-day agenda.
11. Open Memos.
12. Create one memo dated today.
13. Mark it done, reopen it, dismiss it, edit it, and delete it.
14. Open Projects/Ops.
15. Create one active project.
16. Start a project session, add target output, end it with Proof of Work, and confirm it appears in recent sessions.
17. Open Assistant.
18. Send an analysis prompt and confirm Recent Actions remains available where visible, currently as a compact desktop secondary panel.

## Home Integration

1. Open Home.
2. Confirm the initial viewport has a clear signal-first hierarchy and only meaningful logged lanes.
3. Confirm Home does not show giant empty `No events planned today`, `No workout today`, `No memos due`, or `No project work logged today` panels.
4. Confirm Home does not show zero-value widgets such as `0`, `0m`, `0 sets`, `0 volume`, or `today 0m project work`.
5. Confirm the command strip only shows meaningful logged values such as Sleep, Habits, and Memos.
6. Confirm Today Signal appears only when a real signal exists and combines at most two high-priority deterministic signals.
7. Confirm Agenda appears only when today's visible calendar events exist.
8. Confirm Memos appears only when overdue/today/upcoming reminders matter.
9. Confirm Daily Signals shows only logged values: calculated Sleep, logged Shower/Creatine/Skin counts/times, Coffee, or ADC. Brush, Journal, Energy, and Water are absent.
10. Confirm Training appears only for a live or completed workout and excludes warmups from working set count and volume.
11. Confirm Ops appears only for an active project session or project work greater than 0 today.
12. Confirm an active project with 0m logged today does not show Ops, active project count, latest project, or an Ops nag.
13. Confirm Home does not show Money, Finance, Spend, expense totals, or category/vendor summaries.
14. Confirm Home does not show AI Recent Writes, Recent AI Activity, or Recent Actions.
15. Confirm top-right shell metric boxes and bottom-left mini stat boxes do not clutter Home.
16. Confirm mobile Home is readable and has no horizontal overflow.
17. Confirm no fake dashboard values are shown as real data.

## Refresh Persistence

1. Refresh the page.
2. Confirm auth restores.
3. Confirm Health, Workout, Finances, Calendar, Memos, Projects/Ops, Home, and AI Action History reload persisted records from Supabase.
4. Confirm loading states appear before empty states.
5. Confirm AI Action History logs survive refresh.

## PWA Pull To Refresh

1. In the installed iPhone PWA, pull down and confirm the main tab content visibly moves with the finger while the shell header and bottom navigation stay fixed.
2. Release below the threshold and confirm the content smoothly snaps back without refreshing.
3. Pull past the threshold and confirm the indicator moves through Pull and Release while being revealed above the translated content.
4. Release past the threshold and confirm the content stays slightly lowered during Refreshing.
5. Confirm Updated, Failed, or Update Ready remains visible briefly, then the content returns smoothly to its normal position before the indicator fades.
6. Confirm the header/content do not overlap strangely and the bottom navigation never moves or covers content.
7. Change Health and Finances on desktop, pull once from any iPhone tab, then confirm both modules show the new persisted data.
8. Change a Memo from desktop or Shortcut, pull from another tab, and confirm Memos reloads.
9. Start a Workout, pull refresh, and confirm the active workout, persisted sets, templates, and template snapshot remain active.
10. Enter only an exercise or incomplete weight/reps and confirm incomplete logger input does not block an available app update.
11. Enter a complete unsaved set with exercise, valid weight, and valid reps. With a new app version waiting, pull and confirm the app does not reload.
12. Confirm the indicator says `Update ready - save current workout set first.`
13. Save the set, pull again, and confirm the waiting update can activate and reload.
14. Start a Project session, enter meaningful Proof of Work, and confirm a waiting update asks to save the project session draft first.
15. Confirm pull does not trigger while typing in an input, textarea, select, contenteditable field, or while a dialog/editor is open.
16. Confirm Health autosave, active Project sessions, URL routing, bottom navigation, and horizontal layout remain intact.
17. Confirm no duplicate refresh runs start while one refresh is already active.

## Tab URL Routing

1. Navigate to Home and confirm the URL is `/`.
2. Navigate to Calendar, Memos, Projects/Ops, Health, Workout, Finances, and Assistant and confirm the URLs become `/calendar`, `/memos`, `/projects`, `/health`, `/workout`, `/finances`, and `/assistant`.
3. Refresh `/workout` and confirm Workout remains active.
4. Refresh `/projects` and confirm Projects/Ops remains active.
5. Refresh `/memos` and confirm Memos remains active.
6. Directly open `/money` and confirm Finances opens.
7. Directly open `/ai` and confirm Assistant opens.
8. Directly open `/ops` and confirm Projects opens.
9. Use browser back/forward and confirm the active tab follows the URL.
10. While signed out, directly open `/workout` and confirm the auth gate appears; after sign-in, confirm Workout opens.
11. Confirm PWA/Home Screen launch still opens normally.
12. Confirm mobile navigation still has no horizontal overflow.

## Background Sync Flicker

1. Load the app with existing Health, Workout, Finances, Calendar, Memos, Projects/Ops, and AI Action History records.
2. Switch between tabs several times.
3. Leave the browser tab and return after Supabase/auth has had time to refresh.
4. Confirm existing persisted data stays visible while modules show `SYNCING` or status badges.
5. Confirm large loading rows/cards only appear when a module has no data yet.
6. Sign out and sign in as another user, then confirm previous-user data still clears immediately.

## User Scope

1. Sign out.
2. Confirm the app returns to the auth screen.
3. Sign in as a different user.
4. Confirm the previous user's health logs, workouts, expenses, calendar events, memos, projects, project sessions, project money entries, daily reviews, AI action logs, Brain threads/messages, memories, insights, and Vault documents do not appear.
5. Create one record and one Brain conversation as the second user.
6. Sign out and sign back in as the first user.
7. Confirm the first user's records are still present and the second user's records and Brain context are hidden.

## Module QA References

Run the focused checklists after the full flow:

- `docs/QA_HEALTH.md`
- `docs/QA_FINANCES.md`
- `docs/QA_HOME.md`
- `docs/QA_CALENDAR.md`
- Memos checks in this file
- Projects/Ops checks in this file
- `docs/QA_WORKOUT.md`
- `docs/QA_PWA.md` after deployment over HTTPS

## Workout Warmup Sets

1. Run the latest `supabase/schema.sql`.
2. Start or select today's workout session.
3. Log two warmups, disable Warmup, and confirm the next working set immediately displays `Set 1`.
4. Log two working sets and confirm the current session log displays `W`, `W`, `Set 1`, `Set 2`.
5. Toggle Warmup on/off and confirm internal values such as `1001` or `1002` never appear.
6. Confirm old malformed non-warmup rows with high set numbers display with safe normal labels.
7. Edit between warmup/working status and confirm numbering remains non-conflicting.
8. Confirm edit and delete set behavior still works.

## Workout Live Logger

1. Start a workout from a template, refresh `/workout`, and confirm the exercise plan persists.
2. Background/reopen the app during the live workout and confirm the template snapshot still appears.
3. On iPhone/PWA with a LIVE workout, confirm no blank space appears between the LifeOS header and Workout content.
4. Confirm the active command header does not overlap Exercise Plan or Set Logger when opening or scrolling.
5. End the workout and confirm the ENDED/Reopen header does not overlap Logged Sets.
6. Confirm End Workout or Reopen is immediately visible when the Workout tab opens.
7. Confirm the rest timer, PR flags, active volume/count summaries, Date field, Other Sessions, and exercise history are absent.
8. Leave RPE blank, save a set, and confirm it displays `RPE --`.
9. Type in Exercise and confirm suggestions appear from snapshots, templates, and prior sets.
10. Tap a suggestion and confirm it fills the field and recalculates the next set.
11. Confirm only current-session sets are shown, grouped by exercise.
12. Confirm mobile has no horizontal overflow and the bottom navigation does not cover Save Set.

## Mock Areas

1. Open Calendar.
2. Confirm Calendar uses persisted events only and no fake planning data is shown as real.
3. Confirm Calendar opens to the selected-day agenda, not a week board or always-open side form.
4. Open Workout.
5. Confirm the real Workout tab does not show the old mock workout archive.
6. Confirm Home, Health, Finances, Calendar, Workout, and Assistant do not show fake data as real persisted data.

## Brain

1. Run the latest `supabase/schema.sql`, then open Assistant/Brain.
2. Confirm Brain opens to a fresh empty `New Chat` draft by default.
3. Confirm old-thread selection is not visible in the normal Brain UI for now.
4. Confirm old threads/messages still persist in the backend/context after sending messages, even though the default UI does not expose the selector.
5. Leave Brain and return; confirm the default is a fresh `New Chat` again.
6. Confirm there is only one visible New Chat affordance/title and no duplicate `New Chat` labels.
7. Confirm the empty state copy is minimal: `What do we solve?` and `Ask, log, analyze, plan.`
8. Confirm Memory and Vault panels are hidden from the default Brain UI.
9. Confirm compact Recent Actions remains available on desktop and old errors are hidden by default.
10. Confirm Daily Review is not rendered.
11. Confirm the main chat and composer are visually dominant on desktop and mobile.
12. On mobile, confirm the Assistant page itself does not become a long scroll just to see the widget/composer.
13. On mobile, confirm earlier messages scroll inside `brain-message-list`, not as a long page scroll.
14. Send `Hello` and confirm Brain gives a short greeting, not a full LifeOS status report.
15. Send `I haven't trained today` and confirm Brain stays conversational with no write action.
16. Send a normal analysis prompt and confirm Markdown/callouts still render.
17. Confirm deterministic thread title generation still happens in persisted backend thread data after the first message.
18. Add a durable preference with `Remember that...` and confirm it can be recalled or viewed from diagnostics.
19. Send `remember my name, Ale` and confirm it creates a name memory, not a memo.
20. If diagnostics are available, confirm Memory has a compact hidden-by-default state.
21. Edit and archive a memory through diagnostics or supported commands and confirm both operations persist.
22. Confirm simple habit/expense/calendar commands do not flood memory.
23. Send `I might need a nap tomorrow afternoon, don't schedule a memo` and confirm no memo/event/error action is created.
24. After a workout analysis answer, send `mettile in ordine cronologico` and confirm Brain transforms the previous answer instead of treating it as casual chat.
25. Send a Brain message in a long thread and confirm there is no duplicated optimistic/server message flicker.
26. Confirm Brain auto-scrolls the internal message list to the newest message, loading indicator, response, or error after sending.
27. Confirm a timed-out Brain request exits loading, restores the input, shows Retry, and does not leave an infinite spinner.
28. Confirm browser automation can target `brain-message-input`, `brain-send-button`, `brain-message-list`, `brain-loading-indicator`, and `brain-error`.
29. Pull to refresh and confirm threads, current messages, memories, insights, Vault documents, and Recent Actions reload without wiping typed Brain input.
30. Confirm Recent Actions shows successful actions by default, hides old errors behind the Errors toggle, and can expand to more entries on desktop.
31. Open a Recent Action and confirm its detail view still works.
32. Confirm assistant messages show a subtle selected skill badge such as Workout, Health, Calendar, Memo, Ops, Finance, Memory, Review, Product, or General.
33. Confirm skill badges do not overflow on mobile and do not make Brain less chat-first.
34. Confirm `hello` shows General behavior, `remember my name, Ale` shows Memory behavior, and `What should we build next in LifeOS?` shows Product behavior.
35. Confirm selected skill routing does not bypass existing negative write, workout-advice read-only, memory command, or follow-up transform guards.
36. Confirm AI-first `brain_route` metadata is present on new assistant messages but old messages without route metadata still render normally.
37. Confirm `yo, I just opened LifeOS` stays casual/general and `Be brutally honest: is LifeOS becoming too complicated?` routes Product/read-only.
38. Confirm ambiguous fragments such as `gym tomorrow 5` ask clarification and create no action.
39. Confirm `blocca domani un'ora per sistemare il Vault dopo pranzo` asks for exact time and creates no event.
40. Reply `14:30-15:30` and confirm Brain creates the stored Vault calendar block instead of asking the generic clarification again.
41. Send `oggi ho fatto un pisolino dalle 7.40 alle 10 di sera`, confirm Brain asks to save `Pisolino 19:40-22:00`, then reply `si` and confirm it saves to Health notes without touching sleep start/wake time/sleep hours.
42. Repeat the nap prompt and reply `si ma non segnarlo`; confirm no write occurs and the pending action is cancelled.
43. Send `antibiotico dopo cena`, confirm Brain asks for exact reminder date/time, then reply `stasera alle 21:30` and confirm a memo is created.
44. After a pending calendar clarification, send `comunque come sto andando con i workout?` and confirm Brain does not execute the pending action accidentally.
45. Confirm retrying a pending action confirmation does not create duplicate records.
46. After saving a nap/Health note, send `aggiungilo anche al calendario` and confirm Brain uses the same stored date/time without asking again.
47. Send `crea anche un memo con lo stesso orario` and confirm Brain uses the last operational subject's date/time or asks only for truly missing fields.
48. In a new empty chat, send `aggiungilo anche al calendario` and confirm Brain asks what should be added.
49. With two plausible recent subjects, confirm Brain asks a specific disambiguation question before writing.
50. Confirm Working Context metadata is not exposed in the normal Brain UI.
51. Confirm Italian command clarifications and completions stay in Italian.
52. Confirm Recent Actions remains clean when a route blocks writes, asks clarification, or stores a pending action.
53. On mobile, confirm chat messages and skill badges do not overflow horizontally.
54. Ask a long workout/product/project answer and confirm it auto-saves to Vault without a modal or prominent manual Save control.
55. If diagnostics are available, open the saved Vault document and confirm the full content renders safely with tags and metadata.
56. If embeddings are configured, ask a related future question and confirm Brain can reuse relevant saved reports as advisory context.
57. If embeddings are not configured, confirm saving still works and Brain does not crash.
58. Confirm `save this as a workout report` still saves the previous assistant answer to Vault and creates no memo/calendar row.
59. If diagnostics expose Vault `Re-embed`, confirm skipped/failed/pending or wrong-model chunks are repaired when Gemini embedding is available.
60. Confirm new assistant messages can store compact `metadata.brain_trace` in Supabase without changing visible Brain UI behavior.
61. Confirm enabling `x-lifeos-debug: true` returns debug JSON for API callers but does not render debug metadata in the app chat.

## WhatsApp Inbound Integration

1. With the deployed endpoint configured, send a valid WhatsApp bridge request to `/api/integrations/whatsapp/inbound`.
2. Confirm the response includes a concise `reply`, `thread_id`, and `source: whatsapp`.
3. Confirm WhatsApp messages persist in a backend Brain thread with `metadata.source = whatsapp`.
4. Confirm the app Brain still opens to a fresh empty `New Chat` draft by default.
5. Confirm the normal Brain UI still does not show old-thread selection or the WhatsApp backend thread.
6. Confirm Brain mobile internal-scroll layout remains intact after WhatsApp messages exist in the backend.
7. Confirm WhatsApp integration does not change Home UI, does not add Money/Finance, and does not add AI Recent Writes to Home.
8. Confirm app Brain chat still works normally through `/api/ai/chat`.
9. Confirm the WhatsApp flow supports pending-action and working-context behavior, such as nap -> `si` -> `aggiungilo anche al calendario`.
10. Send `Segna che sto andando a dormire ora alle 3.41am`, then `Sì` if confirmation is requested, and confirm sleep start is saved once without a repeated confirmation loop.
11. Confirm wrong bridge secret returns `401` and unallowed sender returns `403`.

## Workout Advice Write Boundary

1. Ask `Dumbbell bench press, dimmi prestazioni passate e come migliorare oggi`.
2. Confirm the response is analysis/advice only and no calendar event is created.
3. Ask `Analizza i workout degli ultimi giorni e dimmi cosa dovrei allenare oggi`.
4. Confirm no actions are created.
5. Ask `Programma petto oggi dalle 17 alle 18`.
6. Confirm explicit scheduling can still create a Calendar event.

## Calendar Polish

1. Create a Calendar event from the selected-day agenda.
2. Mark it done, skipped, cancelled, and planned from the event card quick actions.
3. Confirm the cancelled status button does not delete the event.
4. Confirm permanent delete still uses the Trash icon and confirmation prompt.
5. Confirm long event titles, notes, locations, and unknown categories stay inside the viewport.

## Memos

1. Open Memos on desktop and mobile.
2. Confirm the page opens as a Reminder Timeline, not an always-visible create form.
3. Confirm the mobile header and metrics are compact, with the timeline or empty state visible high on the page.
4. With no memos, confirm the tab shows one clean `Memory queue clear` empty state and no empty Floating Memos or Completed / Dismissed panels.
5. Confirm the Plus button opens the create editor and the X button closes it.
6. Confirm the create editor supports title, optional date, optional time, optional notes, Today/Tomorrow/Clear Date, +1h, Tonight, Clear Time, and Create.
7. Confirm the editor is full-screen and tap-stable on mobile, centered on desktop, and has no horizontal overflow.
8. Create a timed memo for today and confirm it appears in the unified timeline under Today with a time chip and timeline dot.
9. Create an overdue memo and confirm it appears before Today with subtle warning styling.
10. Create a date-only memo for tomorrow and confirm it appears under Tomorrow.
11. Create a future memo and confirm it appears under its date header in the same timeline board.
12. Create a no-date memo and confirm Floating Memos appears; delete/redate it and confirm Floating Memos hides when empty.
13. Edit a memo and confirm the same editor opens prefilled and changes persist after refresh.
14. Mark a memo done, dismiss another memo, and reopen each one.
15. Confirm Completed / Dismissed appears only when it has items, stays secondary/collapsed, and can reopen memos.
16. Delete a memo and confirm it disappears.
17. Confirm no tags/categories appear in the Memos UI.
18. Confirm the Memos tab appears in desktop sidebar and mobile bottom nav without horizontal overflow.
19. Confirm keyboard open/close does not break taps in the memo editor on iPhone/PWA.
20. Run `supabase/schema.sql` again before testing against a live Supabase project.

## Projects / Ops

1. Open Projects/Ops on desktop and mobile.
2. Confirm the Projects tab appears in the desktop sidebar and the mobile bottom nav uses the short `Ops` label without horizontal overflow.
3. Create an hour-goal project with a 400h target and confirm the create/edit modal does not ask for total cost.
4. Confirm the project card shows progress based on logged session hours, not `current_value`.
5. Confirm the project overview card does not show Total Hours, This Week, or Cost metric boxes.
6. Confirm the project overview card shows the sessions count.
7. Start a session, enter target output, refresh the page, and confirm the active session survives as resumable.
8. End the active session with Proof of Work and confirm `duration_minutes` is calculated.
9. Confirm the recent sessions timeline shows date/time, duration, target output, Proof of Work, and completed status.
10. Confirm the project progress bar fills from total logged session hours for the hour-goal project.
11. Create a non-hour project, for example `School Biology` with 12 chapters.
12. Confirm manual progress/current_value controls fill progress using `current_value / target_value`.
13. Start and end a non-hour project session with `progress_delta`, then confirm `current_value` increments.
14. Confirm Project Balance appears in project detail.
15. Add Expense and confirm Spent increases and net balance becomes negative/amber.
16. Add Revenue and confirm Revenue increases and net balance becomes positive/green if revenue exceeds expenses.
17. Confirm recent money entries show date, type, signed EUR amount, and description.
18. Edit and delete a money entry and confirm the balance recalculates.
19. Confirm there are no per-session money fields.
20. Confirm the UI prevents or clearly blocks starting a second active project session while one is already open.
21. Confirm edit/delete project flows work and deleting a project removes its sessions and money entries.
22. Confirm mobile create/edit uses a full-screen editor with visible X, 16px inputs, one scroll path, and no horizontal overflow.
23. Run `supabase/schema.sql` again before testing against a live Supabase project.

## Summary Consistency

1. Log a workout with warmups and working sets.
2. Confirm Home and Assistant selected-date workout summaries count working sets and working volume, not warmups.

## Wake Time Action API

1. Call `POST /api/actions/wake` with a valid action token and `{"time":"8.37"}`.
2. Confirm the response and Health UI show wake time `08:37` for today's Europe/Rome date.
3. Repeat with `{"wake_time":"08:37"}` and confirm the alias works.
4. Send `{"time":"banana"}` and confirm a clear `400` response.
5. Confirm existing Energy, habits, coffee, water, ADC, and notes remain unchanged.
6. Call without Authorization and with an invalid token; confirm both return `401`.
7. Confirm the existing `/api/actions/health` endpoint still accepts `wake_time`.
8. Set yesterday's sleep start to `01:30`, log today's wake time as `09:00`, and confirm today's persisted `sleep_hours` becomes `7.5`.

## Sleep-Start And Habit Action APIs

1. Call `/api/actions/sleep-start` with `{"time":"1.30"}` and confirm `01:30` is stored.
2. Confirm omitted `logged_on` assigns a before-noon sleep start to the previous Europe/Rome date.
3. Repeat with explicit `logged_on` and confirm the explicit date is respected.
4. Confirm next-day `sleep_hours` recalculates when a wake time exists.
5. Confirm invalid sleep-start time returns a clear `400`.
6. Call `/api/actions/habit` with `{"habit":"creatine","time":"9:37 AM"}` and confirm `09:37`.
7. Call it with `{"habit":"skin","time":"10:45 PM"}` and confirm `22:45`.
8. Use `doccia` and confirm Shower increments.
9. Confirm invalid habit/time requests return clear `400` responses.
10. Confirm both endpoints return `401` for missing and invalid tokens.
11. Confirm legacy numeric/boolean hygiene values still render safely.
12. Confirm Home displays compact habit count/time information.

## Health Sleep And Cleanup

1. Confirm Sleep Hours is display-only in Health.
2. Confirm Wake Time appears above Sleep Start.
3. Confirm Sleep Start says it affects the following morning.
4. Confirm the manual Save/Update Check-In button is absent.
5. Change Wake Time and blur; confirm autosave and calculated sleep refresh.
6. Change Sleep Start and blur; confirm autosave.
7. Set yesterday's Sleep Start to `01:30` and today's Wake Time to `09:00`; confirm today displays `7.5`.
8. Change today's Wake Time to `08:00`; confirm it recalculates to `6.5`.
9. Change yesterday's Sleep Start to `00:30`; confirm today recalculates to `7.5`.
10. Change today's Sleep Start and confirm it does not falsely change today's Sleep Hours.
11. Change Coffee/ADC and confirm immediate autosave.
12. Click Creatine and Skin; confirm immediate autosave and timestamps.
13. Confirm invalid partial time does not save and shows subtle unsaved/error feedback.
14. Change selected dates with pending edits and confirm no value writes to the wrong date.
15. Confirm Energy is not shown in Health or Home.
16. Confirm Brush and Journal are not shown in Health or Home.
17. Confirm Shower, Creatine, and Skin counts/times autosave and reload.
18. Confirm `/api/actions/health` defaults `logged_on` to the Europe/Rome date.

## iPhone Safari Basics

1. Open the app on iPhone Safari.
2. Confirm the mobile shell uses the bottom tab bar.
3. Confirm no horizontal scrolling on Home, Calendar, Memos, Projects/Ops, Health, Workout, Finances, or Assistant.
4. Confirm inputs do not zoom when focused.
5. Confirm bottom navigation does not cover primary save buttons.
6. Confirm Calendar status buttons wrap without horizontal overflow.
7. Confirm long labels truncate cleanly in ledger, review archive, and workout history rows.
8. If installed as a PWA, confirm the shell header sits below the iPhone status bar and does not overlap time, Wi-Fi, or battery.
9. Confirm Home cards stack cleanly in PWA/iPhone mode and the overview is visible near the top.
10. Confirm Home has no Recent AI Activity section.
11. Confirm Assistant message scrolling stays inside the chat widget and does not create a long page scroll.

## Desktop / Laptop Layout

1. Open the app on a laptop or desktop viewport.
2. Visit Home, Calendar, Memos, Projects/Ops, Health, Workout, Finances, and Assistant.
3. Confirm no page-level horizontal scrollbar appears on any tab.
4. Confirm any intentional internal scroll areas still work normally.

## Known Non-Failing Build Warning

The production build may warn that one JavaScript chunk is larger than 500 kB. This is currently expected and non-fatal; future tab-level code splitting can address it.
