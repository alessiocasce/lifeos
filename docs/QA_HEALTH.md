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

1. Confirm the visible habit list is Shower, Creatine, Skin, and Journal.
2. Increase Shower, Creatine, and Skin; confirm counters never go below zero.
3. Toggle Journal and confirm it remains boolean rather than becoming a count.
4. Save and refresh; confirm all four values reload.
5. Test a legacy row containing Brush, Floss, or Stretch and confirm the UI ignores those entries without deleting or displaying them.
6. Ask the assistant `Log that i took creatine today`; confirm Creatine updates and omitted habits remain unchanged.
7. Ask `Log that I showered today`; confirm Shower updates.
8. Ask `I journaled today`; confirm Journal becomes true.
9. Ask to log brushing teeth and confirm no `hygiene.brush` habit update is created.

## API And AI Recalculation

1. Call `POST /api/actions/wake` with `{"time":"8.37"}` and confirm wake time becomes `08:37`.
2. Ensure the previous day's sleep start exists and confirm the wake endpoint also recalculates today's `sleep_hours`.
3. Call `/api/actions/health` without `logged_on` and confirm it uses the Europe/Rome current date.
4. Update `wake_time` through `/api/actions/health`; confirm same-day sleep recalculation.
5. Update `sleep_start` through `/api/actions/health`; if the next day's wake time exists, confirm next-day sleep recalculation.
6. Ask the AI to update wake time or sleep start and confirm the same recalculation rules apply.
7. Confirm omitted nullable health fields do not produce validation errors.
8. Confirm direct `sleep_hours` writes remain backward-compatible when the same update does not change sleep/wake fields.

## Persistence And Mobile

1. Save today and yesterday, refresh, and confirm both logs reload.
2. Switch dates and confirm the selected non-today date remains stable during refreshes.
3. Confirm 7-day summaries and history use persisted rows and do not show Energy, Water, or Brush.
4. On iPhone/PWA, confirm no horizontal overflow, no input zoom, and the bottom nav does not cover Save Check-In.
5. Confirm the read-only sleep value, counters, and Journal toggle remain easy to scan and tap.
