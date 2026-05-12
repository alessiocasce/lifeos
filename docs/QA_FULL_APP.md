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
2. Create today's health log with sleep, mood, energy, water, coffee, and optional notes.
3. Open Workout.
4. Start today's workout session.
5. Add one set with exercise, weight, reps, RPE, and date.
6. Open Finances.
7. Create one expense dated today.
8. Open Assistant.
9. Create today's Daily Review with wins, risks, optional score, and next actions.

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
3. Confirm Health, Workout, Finances, Home, and Daily Review reload persisted records from Supabase.
4. Confirm loading states appear before empty states.

## User Scope

1. Sign out.
2. Confirm the app returns to the auth screen.
3. Sign in as a different user.
4. Confirm the previous user's health logs, workouts, expenses, and daily reviews do not appear.
5. Create one record as the second user.
6. Sign out and sign back in as the first user.
7. Confirm the first user's records are still present and the second user's records are hidden.

## Module QA References

Run the focused checklists after the full flow:

- `docs/QA_HEALTH.md`
- `docs/QA_FINANCES.md`
- `docs/QA_HOME.md`
- `docs/QA_DAILY_REVIEW.md`

## Calendar And Mock Areas

1. Open Calendar.
2. Confirm Calendar may still show mock planning data.
3. Open Workout sample archive.
4. Confirm mock workout examples are visually labeled as mock/archive data.
5. Confirm Home, Health, Finances, and Daily Review do not show fake data as real persisted data.

## iPhone Safari Basics

1. Open the app on iPhone Safari.
2. Confirm the mobile shell uses the bottom tab bar.
3. Confirm no horizontal scrolling on Home, Health, Workout, Finances, or Assistant.
4. Confirm inputs do not zoom when focused.
5. Confirm bottom navigation does not cover primary save buttons.
6. Confirm long labels truncate cleanly in ledger, review archive, and workout history rows.

## Known Non-Failing Build Warning

The production build may warn that one JavaScript chunk is larger than 500 kB. This is currently expected and non-fatal; future tab-level code splitting can address it.
