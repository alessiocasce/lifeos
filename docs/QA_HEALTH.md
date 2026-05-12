# Health Tab Manual QA

Run this after applying `supabase/schema.sql` to the target Supabase project and signing in through the global auth gate.

## Create Today's Log

1. Open the Health tab.
2. Confirm the main form does not show sleep quality, mood, social time, or main time waster.
3. Confirm the Sleep card is compact and includes date, sleep hours, sleep start, and wake time.
4. Enter sleep hours, optional sleep times, energy, water, coffee, ADC, notes, and hygiene counts.
5. Click `Save Check-In`.
6. Confirm today's row appears in `7-Day History` with the `TODAY` tag.

## Update Today's Log

1. Change at least one measurable value on today's form.
2. Increment and decrement Water, Coffee, ADC, and at least one Hygiene counter.
3. Click `Update Check-In`.
4. Confirm only one row exists for today.
5. Refresh the page and confirm the updated values persist.

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

## Hygiene Counters

1. Increase Brush to 2, Skin to 3, and Journal to 1.
2. Save and refresh.
3. Confirm the same counts reload.
4. Decrease a counter repeatedly and confirm it never goes below 0.
5. Test an old row whose hygiene JSON uses `done: true/false`; confirm true displays as count 1 and false displays as count 0.
6. Confirm saving a row converts hygiene to `count` values rather than boolean-only `done` values.

## ADC Counter

1. Increase ADC above 0.
2. Save and refresh.
3. Confirm ADC appears in the form, 7-day summary, and history.
4. Decrease ADC repeatedly and confirm it never goes below 0.

## Invalid Values

Try each invalid value and confirm save is blocked with a clear message:

- Invalid `logged_on` date.
- `sleep_hours` below 0 or above 24.
- `energy` below 1 or above 10.
- Negative water.
- Negative coffee.
- Negative ADC.
- Negative hygiene count through any forced/manual test path.
- Non-numeric values in numeric fields.
- Comma decimal sleep value such as `7,5` should save as valid.

## Removed Subjective Fields

1. Confirm sleep quality, mood, social time, and main time waster do not appear in the Health form.
2. Confirm those fields do not appear in the 7-day summary.
3. Confirm those fields do not appear in the 7-day history.
4. Confirm updating an old row that already has those database values does not require re-entering them.
5. Confirm updating an old row does not wipe those hidden database values unless a future migration explicitly removes them.

## Persistence

1. Save today and yesterday.
2. Refresh the browser.
3. Confirm the form and 7-day history reload from Supabase.
4. Confirm 7-day summaries reflect persisted measurable rows only.

## iPhone Safari

1. Open the app on iPhone Safari.
2. Confirm no horizontal scrolling.
3. Confirm inputs do not zoom when focused.
4. Confirm the bottom nav does not cover `Save Check-In`.
5. Confirm Water, Coffee, and ADC cards wrap instead of feeling cramped on narrow screens.
6. Confirm the Sleep card, counters, and hygiene controls are thumb-friendly.
7. Confirm date switching and saving works with the mobile keyboard.
