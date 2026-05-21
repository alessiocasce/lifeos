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
2. Create today's health log with sleep, Energy, Coffee, ADC, Daily Habits, and optional notes.
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
18. Create today's Daily Review with wins, risks, optional score, and next actions.

## Home Integration

1. Open Home.
2. Confirm Today Overview shows the next event, agenda counts, habit completion, memo count, workout status, Ops status, and today's spend.
3. Confirm Today Agenda shows today's calendar events and handles a no-event day with `No events planned today.`
4. Confirm the Home Memos panel shows overdue/today memos or the next open memo.
5. Confirm Daily Habits shows Brush, Shower, Creatine, Skin, and Journal, with Journal as yes/no.
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
3. Confirm Health, Workout, Finances, Calendar, Memos, Projects/Ops, Home, and Daily Review reload persisted records from Supabase.
4. Confirm loading states appear before empty states.
5. Confirm AI Action History logs survive refresh.

## Background Sync Flicker

1. Load the app with existing Health, Workout, Finances, Calendar, Memos, Projects/Ops, and Daily Review records.
2. Switch between tabs several times.
3. Leave the browser tab and return after Supabase/auth has had time to refresh.
4. Confirm existing persisted data stays visible while modules show `SYNCING` or status badges.
5. Confirm large loading rows/cards only appear when a module has no data yet.
6. Sign out and sign in as another user, then confirm previous-user data still clears immediately.

## User Scope

1. Sign out.
2. Confirm the app returns to the auth screen.
3. Sign in as a different user.
4. Confirm the previous user's health logs, workouts, expenses, calendar events, memos, projects, project sessions, daily reviews, and AI action logs do not appear.
5. Create one record as the second user.
6. Sign out and sign back in as the first user.
7. Confirm the first user's records are still present and the second user's records are hidden.

## Module QA References

Run the focused checklists after the full flow:

- `docs/QA_HEALTH.md`
- `docs/QA_FINANCES.md`
- `docs/QA_HOME.md`
- `docs/QA_CALENDAR.md`
- Memos checks in this file
- Projects/Ops checks in this file
- `docs/QA_DAILY_REVIEW.md`
- `docs/QA_WORKOUT.md`
- `docs/QA_PWA.md` after deployment over HTTPS

## Workout Warmup Sets

1. Apply the latest schema migration and confirm existing old workout sets still appear as working sets.
2. Start or select today's workout session.
3. Log two warmup sets for one exercise with the Warmup toggle enabled.
4. Log two working sets for the same exercise with Warmup disabled.
5. Confirm the current session log displays `W`, `W`, `Set 1`, `Set 2`.
6. Confirm warmups appear before working sets and do not increment the next working set number.
7. Confirm active volume, PR tags, previous performance, and exercise history ignore warmup sets.
8. Log a second exercise and confirm exercise groups stay ordered first-to-last by first logged exercise.
9. Edit a set and confirm warmup/working status, edit, and delete behavior still work.

## Mock Areas

1. Open Calendar.
2. Confirm Calendar uses persisted events only and no fake planning data is shown as real.
3. Confirm Calendar opens to the selected-day agenda, not a week board or always-open side form.
4. Open Workout.
5. Confirm the real Workout tab does not show the old mock workout archive.
6. Confirm Home, Health, Finances, Calendar, Workout, and Daily Review do not show fake data as real persisted data.

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
3. Create an hour-goal project with a 400h target and optional overall cost.
4. Confirm the project card shows progress based on logged session hours, not `current_value`.
5. Start a session, enter target output, refresh the page, and confirm the active session survives as resumable.
6. End the active session with Proof of Work and confirm `duration_minutes` is calculated.
7. Confirm the recent sessions timeline shows date/time, duration, target output, Proof of Work, and completed status.
8. Confirm the project progress bar fills from total logged session hours for the hour-goal project.
9. Create a non-hour project, for example `School Biology` with 12 chapters.
10. Confirm manual progress/current_value controls fill progress using `current_value / target_value`.
11. Start and end a non-hour project session with `progress_delta`, then confirm `current_value` increments.
12. Confirm project `overall_cost` displays and there are no per-session money spent/gained fields.
13. Confirm the UI prevents or clearly blocks starting a second active project session while one is already open.
14. Confirm edit/delete project flows work and deleting a project removes its sessions.
15. Confirm mobile create/edit uses a full-screen editor with visible X, 16px inputs, one scroll path, and no horizontal overflow.
16. Run `supabase/schema.sql` again before testing against a live Supabase project.

## Summary Consistency

1. Log a workout with warmups and working sets.
2. Confirm Home and Assistant selected-date workout summaries count working sets and working volume, not warmups.

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
