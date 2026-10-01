# Finances Tab Manual QA

Run this after signing in through the global auth gate. No extra schema migration should be needed if `expenses` already exists from `supabase/schema.sql`.

## Reconstruction Checkpoint (2026-10-01)

Finances is an unframed expense ledger, not a metrics dashboard. Capture leads on
mobile; desktop places capture beside the selected-month ledger. The month total
appears only with records. Category totals/proportional steel bars are secondary,
and recent records outside the selected month are collapsed without duplicating
the current ledger. Vendor/category/amount/date/notes and custom categories remain.
Inputs and edit/delete/save controls are at least 44px. Confirmed deletion asks
before removing a record; failed writes retain fields. In-flight writes disable
their form controls. Loading failures do not claim an empty or zero-spend month.

Untouched date/month defaults follow Europe/Rome rollover through `useLocalDay`;
explicit date and month selections remain unchanged. All mutations still use the
existing context/API and Supabase contracts. No schema rerun required.

`tests/ui/finances.spec.js` has fourteen isolated browser cases: CRUD/reload,
comma decimals/custom category, month/category scope, failed create/edit/delete,
empty versus failed load/retry, duplicate-submit protection, amount validation,
Rome month/day rollover, and layout/edit captures at seven required sizes.
Run `npx playwright test tests/ui/finances.spec.js`, `npx playwright test`,
`npm test`, `npm run build`, and `npm run check:functions`.
Fixtures never call production Supabase. Physical iPhone keyboard/standalone and
live user-scoped expense CRUD remain manual QA; browser coverage does not prove them.

## Create Expense

1. Open the Finances tab.
2. Enter a vendor, category, amount, date, and optional notes.
3. Use a comma decimal such as `12,50`.
4. Click `Save expense`.
5. Confirm the saved feedback and expense in the selected-month ledger (or expand
   `Recent expenses in other months` when its date is outside that month).

## Update Expense

1. Click the edit button on a recent expense.
2. Change amount, category, date, or notes.
3. Save the edit.
4. Confirm the row updates and the monthly/category totals recalculate.

## Delete Expense

1. Click the delete button on an expense.
2. Accept the permanent-delete confirmation and confirm the expense disappears.
3. Confirm monthly/category totals recalculate.

## Current Month

1. Create one expense dated this month.
2. Create one expense dated outside this month.
3. Confirm only this month's expense contributes to the header total.
4. Confirm both expenses can still appear in recent history.

## Category Casing

1. Create an expense through the AI assistant or Action API with category `subscriptions`.
2. Confirm Finances displays the saved category as `Subscriptions`.
3. Repeat with `grocery`, `bill`, and `personal-care` if possible and confirm they display as `Groceries`, `Bills`, and `Personal Care`.
4. Create an expense with an unknown category such as `random thing` and confirm it saves as `Random Thing` instead of being rejected.

## Month Selector

1. Create an expense dated this month.
2. Create an expense dated in the previous month.
3. Use the header month selector to select this month; expand `Category breakdown`.
4. Confirm totals and category bars include this month's expense only.
5. Switch to the previous month.
6. Confirm totals and category bars update to include the previous month's expense only.
7. Confirm `Recent expenses in other months` shows recent records outside the
   selected month; records in the selected month appear only in its ledger.

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
