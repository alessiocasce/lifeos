# Health Tab Manual QA

Run this after signing in through the global auth gate. This pass does not require a schema rerun.

## Visible Health Fields

1. Open Health and confirm Sleep Start, Wake Time, Coffee, ADC, Notes, and Daily Habits are available.
2. Confirm Sleep Hours is read-only and cannot be typed or incremented.
3. Confirm the Sleep Hours hint says it is calculated from the previous sleep start and today's wake time.
4. Confirm Energy, Water, Brush, sleep quality, mood, social time, and main time waster are not shown.
5. Confirm hidden legacy database values are not cleared when another visible field is updated.

## Automatic Sleep Calculation

1. Set yesterday's `sleep_start` to `01:30` and save.
2. Set today's `wake_time` to `09:00` and save.
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
5. Save and refresh; confirm counts and times reload.
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

1. Save today and yesterday, refresh, and confirm both logs reload.
2. Switch dates and confirm the selected non-today date remains stable during refreshes.
3. Confirm 7-day summaries and history use persisted rows and do not show Energy, Water, or Brush.
4. On iPhone/PWA, confirm no horizontal overflow, no input zoom, and the bottom nav does not cover Save Check-In.
5. Confirm the read-only sleep value and time-aware habit controls remain easy to scan and tap.
