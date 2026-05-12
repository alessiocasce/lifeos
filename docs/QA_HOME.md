# Home Tab Manual QA

Run this after signing in through the global auth gate. No schema migration is needed; Home reads persisted data from the existing Workout, Health, and Finances slices.

## Empty State

1. Sign in with a user that has no workout sessions, health logs, or expenses.
2. Open the Home tab.
3. Confirm Home shows clear empty states:
   - No health log yet today.
   - No workout logged today.
   - No expenses this month.
4. Confirm no fake agenda, balance, workout, or health values are shown as real data.

## Health Summary

1. Open the Health tab.
2. Create or update today's health log.
3. Return to Home.
4. Confirm Today's Health status changes to `Logged`.
5. Confirm Latest Check-In shows persisted sleep hours, sleep quality, mood, energy, water, and social time.

## Workout Summary

1. Open the Workout tab.
2. Start or select today's workout session.
3. Add at least one persisted set.
4. Return to Home.
5. Confirm Workout status shows live or ended based on the session.
6. Confirm Workout Summary shows the session name, set count, exercise count, and total volume.

## Finance Summary

1. Open the Finances tab.
2. Create one expense dated today.
3. Create one expense dated in the current month.
4. Return to Home.
5. Confirm Today's Spend shows today's expense count and total.
6. Confirm Current Month Finance shows current-month spend and top category from persisted expenses.
7. Confirm Latest Expenses shows persisted recent expenses.

## Persistence

1. Refresh the page.
2. Return to Home after auth restoration.
3. Confirm health, workout, and expense summaries reload from Supabase.
4. Sign out and sign in again.
5. Confirm only the current user's persisted summaries appear.

## iPhone Safari

1. Open Home on iPhone Safari.
2. Confirm no horizontal scrolling.
3. Confirm cards are compact and readable.
4. Confirm the bottom navigation does not cover the last Home card.
