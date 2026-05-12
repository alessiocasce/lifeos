# Finances Tab Manual QA

Run this after signing in through the global auth gate. No extra schema migration should be needed if `expenses` already exists from `supabase/schema.sql`.

## Create Expense

1. Open the Finances tab.
2. Enter a vendor, category, amount, date, and optional notes.
3. Use a comma decimal such as `12,50`.
4. Click `Save`.
5. Confirm the expense appears in `Recent Expenses`.

## Update Expense

1. Click the edit button on a recent expense.
2. Change amount, category, date, or notes.
3. Save the edit.
4. Confirm the row updates and the monthly/category totals recalculate.

## Delete Expense

1. Click the delete button on an expense.
2. Confirm the expense disappears.
3. Confirm monthly/category totals recalculate.

## Current Month

1. Create one expense dated this month.
2. Create one expense dated outside this month.
3. Confirm only this month's expense contributes to `Current Month Spend`.
4. Confirm both expenses can still appear in recent history.

## Validation

Try each invalid value and confirm save is blocked:

- Missing vendor.
- Missing category.
- Invalid date.
- Amount `0`.
- Negative amount.
- Non-numeric amount.

## Persistence

1. Create or update an expense.
2. Refresh the page.
3. Confirm the persisted expenses reload from Supabase.
4. Sign out and sign in again.
5. Confirm only the current user's expenses appear.

## iPhone Safari

1. Open the Finances tab on iPhone Safari.
2. Confirm no horizontal scrolling.
3. Confirm inputs do not zoom when focused.
4. Confirm the bottom nav does not cover the entry form or recent expense controls.
5. Confirm create, edit, and delete work with the mobile keyboard.
