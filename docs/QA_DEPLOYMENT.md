# LifeOS Deployment QA

Run this against the deployed URL after applying `supabase/schema.sql` to the target Supabase project and setting deployment environment variables.

## Auth

1. Open the deployed URL while signed out.
2. Confirm the setup/config screen does not appear when env vars are set correctly.
3. Sign up with a test account.
4. If email confirmation is enabled, complete confirmation and sign in.
5. Refresh the page and confirm the session persists.

## Health

1. Open Health.
2. Create today's health log with sleep hours, optional sleep times, Energy, Coffee, ADC, notes, and Daily Habits.
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

## Daily Review

1. Open Assistant.
2. Create today's Daily Review with optional score and next actions.
3. Refresh and confirm the review reloads.

## Home

1. Open Home.
2. Confirm Home reflects the persisted Health, Workout, Expense, Calendar-adjacent shell state where applicable, and Daily Review-backed modules that are currently summarized.
3. Confirm empty states do not show for records just created.

## Direct Tab Routes

1. Directly visit `/calendar`, `/workout`, `/projects`, and `/memos` on the deployed URL.
2. Refresh each direct route and confirm the app loads without a Vercel 404 and keeps the matching tab active.
3. Directly visit `/money` and confirm Finances opens.
4. Directly visit `/ai` and confirm Assistant opens.
5. Confirm `/api/ai/chat` still returns API behavior and is not rewritten to the SPA.
6. Confirm `/api/ai/actions` still returns API behavior and is not rewritten to the SPA.
7. Confirm `/api/actions/expense`, `/api/actions/health`, and `/api/actions/calendar` still reach serverless API behavior.

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
4. Confirm the bottom navigation does not cover Save Check-In, Save Set, Create Event, Save Expense, or Save Review.
5. Confirm Health Energy/Coffee/ADC counters and Daily Habits are thumb-friendly.
6. Confirm Workout set logging is usable one-handed.

## PWA / Home Screen

1. Run `docs/QA_PWA.md` against the deployed HTTPS URL.
2. Confirm LifeOS can be added to the iPhone Home Screen.
3. Confirm the installed app opens standalone and keeps API/Supabase/Gemini responses uncached.
4. Confirm PWA start still opens normally after the tab-route rewrite deployment.

## Known Non-Failing Build Warning

The production build may warn that a JavaScript chunk is larger than 500 kB. This is expected for now and does not block deployment.
