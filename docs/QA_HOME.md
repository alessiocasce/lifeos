# Home Tab Manual QA

Run this after signing in through the global auth gate. No schema migration is needed; Home reads persisted data from the existing Workout, Health, and Finances slices.

## Empty State

1. Sign in with a user that has no workout sessions, health logs, or expenses.
2. Open the Home tab.
3. Confirm loading states appear while persisted data is syncing.
4. Confirm Home shows clear empty states:
   - No health log yet today.
   - No workout logged today.
   - No expenses this month.
5. Confirm no fake agenda, balance, workout, or health values are shown as real data.

## Health Summary

1. Open the Health tab.
2. Create or update today's health log.
3. Return to Home.
4. Confirm Today's Health status changes to `Logged`.
5. Confirm Latest Check-In shows persisted sleep hours, energy, coffee, and ADC, with no visible Water metric.

## Workout Summary

1. Open the Workout tab.
2. Start or select today's workout session.
3. Add at least one persisted set.
4. Return to Home.
5. Confirm Workout status shows live or ended based on the session.
6. Confirm Workout Summary shows the session name, set count, exercise count, and total volume.

## Workout Edge Cases

1. Create today's workout session but do not add sets.
2. Return to Home.
3. Confirm Workout Summary shows the session with `0` sets, `0` volume, and `0` exercises.
4. Create multiple workout sessions dated today.
5. Confirm Today Status reports a live session if one of today's sessions is not ended.
6. End all of today's sessions.
7. Confirm Today Status reports ended and includes the number of sessions today.
8. Confirm Home prefers today's workout session over an older selected active session.

## Health Edge Cases

1. Create a health log with optional fields left blank, such as sleep hours or energy.
2. Return to Home.
3. Confirm blank optional fields render as `--`, not fake values.

## Finance Summary

1. Open the Finances tab.
2. Create one expense dated today.
3. Create one expense dated in the current month.
4. Return to Home.
5. Confirm Today's Spend shows today's expense count and total.
6. Confirm Current Month Finance shows current-month spend and top category from persisted expenses.
7. Confirm Latest Expenses shows persisted recent expenses.

## Finance Edge Cases

1. Create an expense dated in a previous month only.
2. Return to Home.
3. Confirm Current Month Finance still says no expenses this month.
4. Confirm Latest Expenses can show the older persisted expense.
5. Create an expense with a very long vendor and category name.
6. Confirm labels truncate cleanly and do not cause horizontal scrolling.
7. If possible, temporarily break the monthly expenses request or use a user without access.
8. Confirm the finance card shows a clear monthly expense error.

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
