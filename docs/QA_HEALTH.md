# Health Tab Manual QA

Run this after applying `supabase/schema.sql` to the target Supabase project and signing in through the global auth gate.

## Create Today's Log

1. Open the Health tab.
2. Leave the date as today.
3. Enter valid values for sleep, sleep quality, energy, mood, water, coffee, social time, time waster, notes, and hygiene.
4. Click `Save Check-In`.
5. Confirm today's row appears in `7-Day History` with the `TODAY` tag.

## Update Today's Log

1. Change at least one value on today's form.
2. Click `Update Check-In`.
3. Confirm only one row exists for today.
4. Refresh the page and confirm the updated values persist.

## Create Yesterday's Log

1. Change the date to yesterday.
2. Confirm the form clears for that selected date if no log exists.
3. Enter valid values.
4. Save the check-in.
5. Confirm yesterday appears in `7-Day History`.

## Switch Dates

1. Switch the date back to today.
2. Confirm today's persisted values load into the form.
3. Switch the date to yesterday.
4. Confirm yesterday's persisted values load into the form.
5. Switch to a date with no log and confirm the form is empty for that date.

## Invalid Values

Try each invalid value and confirm save is blocked with a clear message:

- Invalid `logged_on` date.
- `sleep_hours` below 0 or above 24.
- `sleep_quality` below 0 or above 100.
- `energy` below 1 or above 10.
- `mood` below 1 or above 10.
- Negative water.
- Negative coffee.
- Negative social time.
- Non-numeric values in numeric fields.
- Comma decimal sleep value such as `7,5` should save as valid.

## Persistence

1. Save today and yesterday.
2. Refresh the browser.
3. Confirm the form and 7-day history reload from Supabase.
4. Confirm 7-day summaries reflect persisted rows only.

## iPhone Safari

1. Open the app on iPhone Safari.
2. Confirm no horizontal scrolling.
3. Confirm inputs do not zoom when focused.
4. Confirm the bottom nav does not cover `Save Check-In`.
5. Confirm date switching and saving works with the mobile keyboard.
