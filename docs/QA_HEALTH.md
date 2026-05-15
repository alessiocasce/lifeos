# Health Tab Manual QA

Run this after applying `supabase/schema.sql` to the target Supabase project and signing in through the global auth gate.

## Create Today's Log

1. Open the Health tab.
2. Confirm the main form does not show sleep quality, mood, social time, or main time waster.
3. Confirm the Sleep card is compact and includes date, sleep hours, sleep start, and wake time.
4. Enter sleep hours, optional sleep times, energy, coffee, ADC, notes, and Daily Habit values.
5. Confirm Energy uses compact `-` and `+` controls, not a nested input card.
6. Click `Save Check-In`.
7. Confirm today's row appears in `7-Day History` with the `TODAY` tag.

## Update Today's Log

1. Change at least one measurable value on today's form.
2. Increment and decrement Energy, Coffee, ADC, and at least one numeric Daily Habit.
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
6. While a non-today date is selected, refresh/sync health logs and confirm the form does not jump back to today.

## Daily Habits

1. Confirm the visible habit list is Brush, Shower, Creatine, Skin, and Journal.
2. Increase Brush to 2, Shower to 1, Creatine to 1, and Skin to 3.
3. Toggle Journal on and confirm it displays as journaled/yes rather than a numeric counter.
4. Toggle Journal off and confirm it displays as not journaled/no.
5. Save and refresh.
6. Confirm the same values reload.
7. Decrease a numeric counter repeatedly and confirm it never goes below 0.
8. Test an old row whose `hygiene` JSON contains Floss or Stretch; confirm the new UI ignores those old items without crashing.
9. Test an old row whose Journal uses `count: 1` or `done: true`; confirm it displays as journaled.
10. Confirm forced Journal counts above 1 normalize to journaled rather than displaying as a count.
11. Ask the AI assistant: `Log that i took creatine today`; confirm the Health tab shows today's Creatine habit incremented/logged.
12. Ask the AI assistant: `Log that I showered today`; confirm Shower increments/logs and other omitted habits are preserved.
13. Ask the AI assistant: `I journaled today`; confirm Journal becomes journaled/yes and remains boolean.

## Standalone Habit Stats

1. Save at least two logs with different Brush, Shower, Creatine, Skin, and Journal values.
2. Confirm the 7-day summary shows standalone habit stats, not one generic hygiene total.
3. Confirm the 7-day history shows a compact habit breakdown per row.
4. Confirm Brush/Skin values from old compatible rows carry forward when present.
5. Confirm Shower and Creatine default to 0 for older rows.

## Hidden Water Compatibility

1. Confirm the Health form has no visible Water counter.
2. Confirm the 7-day summary has no Avg Water metric.
3. Confirm the 7-day history has no Water metric.
4. Confirm saving a newly created Health log still works with the database `water` column left at its default.
5. If testing an old row with a non-zero water value, update another visible field and confirm the save does not require editing Water.
6. Confirm AI habit logging does not expose Water, while old Action API calls that include `water` still validate.

## Optional Nullable Fields

1. Ask the AI assistant to log a habit-only update such as `Log that i took creatine today`.
2. Confirm missing optional fields such as `sleep_hours`, `sleep_start`, and `wake_time` are ignored rather than validated as invalid.
3. Confirm explicitly clearing nullable fields with `null` or blank values remains safe where supported.
4. Confirm normal updates like `Log 8 hours of sleep today` still validate and save.

## ADC Counter

1. Increase ADC above 0.
2. Save and refresh.
3. Confirm ADC appears in the form, 7-day summary, and history.
4. Decrease ADC repeatedly and confirm it never goes below 0.

## Energy Control

1. Leave Energy blank and save; confirm blank Energy is allowed.
2. Press `+` from blank and confirm Energy becomes 1.
3. Press `+` repeatedly and confirm Energy does not exceed 10.
4. Press `-` from 1 and confirm Energy returns to blank.
5. Save and refresh with Energy set, then confirm the value reloads.

## Invalid Values

Try each invalid value and confirm save is blocked with a clear message:

- Invalid `logged_on` date.
- `sleep_hours` below 0 or above 24.
- `energy` below 1 or above 10 through any forced/manual test path.
- Negative coffee.
- Negative ADC.
- Negative numeric habit count through any forced/manual test path.
- Forced Journal counts above 1 normalize safely.
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
5. Confirm Energy, Coffee, ADC, and Daily Habit cards wrap instead of feeling cramped on narrow screens.
6. Confirm the Sleep card, counters, and Journal toggle are thumb-friendly.
7. Confirm date switching and saving works with the mobile keyboard.
