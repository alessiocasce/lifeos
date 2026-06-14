# Health Tab Manual QA

Run this after signing in through the global auth gate. This pass does not require a schema rerun.

## Visible Health Fields

1. Open Health and confirm Wake Time, Sleep Start, Coffee, ADC, Notes, and Daily Habits are available.
2. Confirm Sleep Hours is read-only and cannot be typed or incremented.
3. Confirm Wake Time appears before Sleep Start.
4. Confirm Sleep Start says `Used for the following morning.`
5. Confirm the Sleep Hours hint says it is calculated from the previous day's sleep start and this day's wake time.
6. Confirm there is no Save Check-In or Update Check-In button.
7. Confirm Energy, Water, Brush, Journal, sleep quality, mood, social time, and main time waster are not shown.
8. Confirm hidden legacy database values are not cleared when another visible field is updated.

## Autosave

1. Change Wake Time and blur or press Enter; confirm the status moves through `Saving...` to `Saved`.
2. Change Sleep Start and blur or press Enter; confirm it autosaves.
3. Clear a time field and blur; confirm null is saved.
4. Enter an invalid or incomplete time and confirm it is not saved and a subtle unsaved/error state remains.
5. Change Notes and blur; confirm it autosaves without writing on every keystroke.
6. Increment and decrement Coffee and ADC; confirm each control change autosaves.
7. Increment Creatine and Skin; confirm each change autosaves immediately and appends the current Europe/Rome time.
8. Change several controls quickly; confirm the final values persist without older responses replacing newer changes.
9. Edit a field, change the selected date before committing it, and confirm the pending edit is not written to the new date.
10. Queue a save, change dates, and confirm the queued save remains tied to its original date.
11. Force a write failure and confirm the input remains visible with `Failed to save`.

## Automatic Sleep Calculation

1. Set yesterday's `sleep_start` to `01:30` and blur.
2. Set today's `wake_time` to `09:00` and blur.
3. Confirm today's Sleep Hours displays and persists as `7.5`.
4. Change today's wake time to `08:00`; confirm Sleep Hours recalculates to `6.5`.
5. Change yesterday's sleep start to `00:30`; confirm today's Sleep Hours recalculates to `7.5`.
6. Test previous sleep start `00:45` and wake time `08:10`; confirm rounding produces `7.5`.
7. Test previous sleep start `23:30` and wake time `08:00`; confirm the result is `8.5`.
8. Remove either required time and confirm the calculated display becomes `--` or remains unavailable.
9. Confirm invalid durations at or below zero or above 24 hours are not persisted.
10. Refresh and confirm the calculated value remains consistent.

## Daily Habits

1. Confirm the visible habit list is Shower, Creatine, and Skin.
2. Confirm Brush and Journal are not shown.
3. Increase each habit; confirm the count increments and the current Europe/Rome time is appended.
4. Decrease a habit; confirm the count decrements safely and the latest timestamp is removed when present.
5. Refresh and confirm autosaved counts and times reload.
6. Test legacy numeric and boolean habit values and confirm they display as counts without crashing.
7. Test a legacy row containing Brush, Journal, Floss, or Stretch and confirm those values remain stored but are not displayed.
8. Ask the assistant `Log that i took creatine today`; confirm Creatine updates with a timestamp and omitted habits remain unchanged.
9. Ask `Log that I showered today`; confirm Shower updates with a timestamp.
10. Ask to log brushing teeth or journaling and confirm no visible habit update is created.

## API And AI Recalculation

1. Call `POST /api/actions/wake` with `{"time":"8.37"}` and confirm wake time becomes `08:37`.
2. Ensure the previous day's sleep start exists and confirm the wake endpoint also recalculates today's `sleep_hours`.
3. Call `/api/actions/health` without `logged_on` and confirm it uses the Europe/Rome current date.
4. Update `wake_time` through `/api/actions/health`; confirm same-day sleep recalculation.
5. Update `sleep_start` through `/api/actions/health`; if the next day's wake time exists, confirm next-day sleep recalculation.
6. Ask the AI to update wake time or sleep start and confirm the same recalculation rules apply.
7. Confirm omitted nullable health fields do not produce validation errors.
8. Confirm direct `sleep_hours` writes remain backward-compatible when the same update does not change sleep/wake fields.

## Sleep-Start Action API

1. Call `POST /api/actions/sleep-start` with `{"time":"1.30"}`.
2. Confirm the stored value is `01:30`.
3. Confirm omitted `logged_on` uses the previous Europe/Rome date because the time is before noon.
4. Call with an explicit `logged_on` and confirm the explicit date is respected.
5. Ensure the following day has a wake time and confirm `sleep_hours` recalculates.
6. Send an invalid time and confirm a clear `400`.
7. Confirm missing or invalid auth returns `401`.

## Habit Action API

1. Call `POST /api/actions/habit` with `{"habit":"creatine","time":"9:37 AM"}`.
2. Confirm today's Creatine count increments and `09:37` appears in Health and Home.
3. Call with `{"habit":"skin","time":"10:45 PM"}` and confirm `22:45`.
4. Call with `{"habit":"doccia"}` and confirm Shower increments using the current Europe/Rome time.
5. Confirm duplicate times in the same minute are allowed.
6. Confirm invalid habit and invalid time values return clear `400` errors.
7. Confirm Brush and Journal are preserved in legacy JSON but are not updated or displayed.
8. Confirm missing or invalid auth returns `401`.

## Persistence And Mobile

1. Autosave today and yesterday, refresh, and confirm both logs reload.
2. Switch dates and confirm the selected non-today date remains stable during refreshes.
3. Confirm 7-day summaries and history use persisted rows and do not show Energy, Water, or Brush.
4. On iPhone/PWA, confirm no horizontal overflow, no input zoom, and the bottom nav does not cover Health controls.
5. Confirm the read-only sleep value and time-aware habit controls remain easy to scan and tap.
