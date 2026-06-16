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
18. Send an analysis prompt and confirm Recent Actions remains available below the chat.

## Home Integration

1. Open Home.
2. Confirm Today Overview shows the next event, agenda counts, habit completion, memo count, workout status, Ops status, and today's spend.
3. Confirm Today Agenda shows today's calendar events and handles a no-event day with `No events planned today.`
4. Confirm the Home Memos panel shows overdue/today memos or the next open memo.
5. Confirm Daily Habits shows Shower, Creatine, and Skin with compact count/time details; Brush and Journal are absent.
6. Confirm Training Status reflects a live or completed workout and excludes warmups from working set count and volume.
7. Confirm Ops Status shows an active project session if one exists, today's project work time, active project count, and latest project.
8. Confirm Money Snapshot shows today's spend, month spend, top category, and latest expense.
9. Confirm Recent AI Activity shows compact recent app/Shortcut AI writes with source, status, time, action type/count, and no raw Markdown preview.
10. Click a Recent AI Activity card and confirm the detail view opens with full request, full response, record refs, and rendered Markdown/callouts.
11. Confirm Home does not show Water and does not duplicate a full latest-expenses panel.
12. Confirm no fake dashboard values are shown as real data.

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
2. Confirm persistent chat, expressive thread selector, New Chat, `What LifeOS Knows`, and Recent Actions are present.
3. Confirm Daily Review is not rendered.
4. Confirm canned Suggestions or prompt chips are not rendered.
5. Confirm the main chat is visually dominant and Memory/Recent Actions are secondary or collapsed on mobile.
6. Send `Hello` and confirm Brain gives a short greeting, not a full LifeOS status report.
7. Send `I haven't trained today` and confirm Brain stays conversational with no write action.
8. Send a normal analysis prompt and confirm Markdown/callouts still render.
9. Refresh and confirm persisted user/assistant messages remain.
10. Create a New Chat and confirm the old thread remains accessible.
11. Rename a thread if the control is visible and confirm the new title persists.
12. Confirm deterministic thread title generation works after the first message.
13. Add a durable preference with `Remember that...` and confirm it appears in the memory panel.
14. Send `remember my name, Ale` and confirm it creates a name memory, not a memo.
15. Confirm the memory empty state gives compact examples such as `Remember my name is Ale`.
16. Edit and archive a memory and confirm both operations persist.
17. Confirm simple habit/expense/calendar commands do not flood memory.
18. Send `I might need a nap tomorrow afternoon, don't schedule a memo` and confirm no memo/event/error action is created.
19. After a workout analysis answer, send `mettile in ordine cronologico` and confirm Brain transforms the previous answer instead of treating it as casual chat.
20. Refresh `/assistant`, send `fammi una tabella`, and confirm the persistent conversation history still allows the follow-up transform.
21. Pull to refresh and confirm threads, active messages, memories, insights, Vault documents, and Recent Actions reload without wiping typed Brain input.
22. Confirm Recent Actions shows successful actions by default, hides old errors behind the Errors toggle, and can expand to more entries.
23. Open a Recent Action and confirm its detail view still works.
24. Confirm assistant messages show a subtle selected skill badge such as Workout, Health, Calendar, Memo, Ops, Finance, Memory, Review, Product, or General.
25. Confirm skill badges do not overflow on mobile and do not make Brain less chat-first.
26. Confirm `hello` shows General behavior, `remember my name, Ale` shows Memory behavior, and `What should we build next in LifeOS?` shows Product behavior.
27. Confirm selected skill routing does not bypass existing negative write, workout-advice read-only, memory command, or follow-up transform guards.
28. Confirm AI-first `brain_route` metadata is present on new assistant messages but old messages without route metadata still render normally.
29. Confirm `yo, I just opened LifeOS` stays casual/general and `Be brutally honest: is LifeOS becoming too complicated?` routes Product/read-only.
30. Confirm ambiguous fragments such as `gym tomorrow 5` ask clarification and create no action.
31. Confirm Recent Actions remains clean when a route blocks writes or asks clarification.
32. On mobile, confirm thread controls, chat messages, skill badges, the memory panel, and Recent Actions do not overflow horizontally.
33. Save an assistant workout/product/project answer to Vault and confirm it appears in the Vault panel.
34. Open the saved Vault document and confirm the full content renders safely with tags and metadata.
35. Archive the Vault document and confirm it is removed from the active panel.
36. If embeddings are configured, ask a related future question and confirm Brain can reuse relevant saved reports as advisory context.
37. If embeddings are not configured, confirm saving still works and Brain does not crash.
38. Confirm `save this as a workout report` saves the previous assistant answer to Vault and creates no memo/calendar row.
39. Click Vault `Re-embed` and confirm skipped/failed/pending or wrong-model chunks are repaired when Gemini embedding is available.
40. Confirm Vault panel is collapsed/secondary on mobile and has no horizontal overflow.

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
10. Confirm Home Recent AI Activity and Assistant Recent Actions do not create horizontal overflow.
11. Confirm Home Recent AI Activity and Assistant Recent Actions detail views are usable in iPhone/PWA mode and the X close button is visible.

## Desktop / Laptop Layout

1. Open the app on a laptop or desktop viewport.
2. Visit Home, Calendar, Memos, Projects/Ops, Health, Workout, Finances, and Assistant.
3. Confirm no page-level horizontal scrollbar appears on any tab.
4. Confirm any intentional internal scroll areas still work normally.

## Known Non-Failing Build Warning

The production build may warn that one JavaScript chunk is larger than 500 kB. This is currently expected and non-fatal; future tab-level code splitting can address it.
