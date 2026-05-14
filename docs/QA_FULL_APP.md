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
11. Open Assistant.
12. Create today's Daily Review with wins, risks, optional score, and next actions.

## Home Integration

1. Open Home.
2. Confirm today's health status is `Logged`.
3. Confirm today's workout status reflects live or ended state.
4. Confirm today's expense count and spend include the expense created today.
5. Confirm latest health, workout, current-month finance, top category, and latest expenses use persisted data.
6. Confirm no fake dashboard values are shown as real data.

## Refresh Persistence

1. Refresh the page.
2. Confirm auth restores.
3. Confirm Health, Workout, Finances, Calendar, Home, and Daily Review reload persisted records from Supabase.
4. Confirm loading states appear before empty states.

## Background Sync Flicker

1. Load the app with existing Health, Workout, Finances, Calendar, and Daily Review records.
2. Switch between tabs several times.
3. Leave the browser tab and return after Supabase/auth has had time to refresh.
4. Confirm existing persisted data stays visible while modules show `SYNCING` or status badges.
5. Confirm large loading rows/cards only appear when a module has no data yet.
6. Sign out and sign in as another user, then confirm previous-user data still clears immediately.

## User Scope

1. Sign out.
2. Confirm the app returns to the auth screen.
3. Sign in as a different user.
4. Confirm the previous user's health logs, workouts, expenses, calendar events, and daily reviews do not appear.
5. Create one record as the second user.
6. Sign out and sign back in as the first user.
7. Confirm the first user's records are still present and the second user's records are hidden.

## Module QA References

Run the focused checklists after the full flow:

- `docs/QA_HEALTH.md`
- `docs/QA_FINANCES.md`
- `docs/QA_HOME.md`
- `docs/QA_CALENDAR.md`
- `docs/QA_DAILY_REVIEW.md`
- `docs/QA_WORKOUT.md`

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

## Summary Consistency

1. Log a workout with warmups and working sets.
2. Confirm Home and Assistant selected-date workout summaries count working sets and working volume, not warmups.

## iPhone Safari Basics

1. Open the app on iPhone Safari.
2. Confirm the mobile shell uses the bottom tab bar.
3. Confirm no horizontal scrolling on Home, Health, Workout, Finances, Calendar, or Assistant.
4. Confirm inputs do not zoom when focused.
5. Confirm bottom navigation does not cover primary save buttons.
6. Confirm Calendar status buttons wrap without horizontal overflow.
7. Confirm long labels truncate cleanly in ledger, review archive, and workout history rows.

## Desktop / Laptop Layout

1. Open the app on a laptop or desktop viewport.
2. Visit Home, Calendar, Health, Workout, Finances, and Assistant.
3. Confirm no page-level horizontal scrollbar appears on any tab.
4. Confirm any intentional internal scroll areas still work normally.

## Known Non-Failing Build Warning

The production build may warn that one JavaScript chunk is larger than 500 kB. This is currently expected and non-fatal; future tab-level code splitting can address it.
