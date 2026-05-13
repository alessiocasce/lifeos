# LifeOS Workout QA

Run this after applying `supabase/schema.sql` and signing in with a Supabase-backed account.

## Session Flow

1. Open Workout.
2. Select/start today's session.
3. Use `Start Named Session` and confirm the helper text explains that templates will come later.
4. End the session and confirm logging/editing is blocked.
5. Reopen the session and confirm logging/editing works again.
6. Delete a session and confirm the confirmation step appears before deletion.

## Start From Previous

1. Complete or use an older session with multiple exercises, warmups, weights, reps, RPE, and notes.
2. In Session Control, use `Start From Previous`.
3. Confirm `Start From This` creates a new session for today with the previous session name.
4. If today's sessions already include the same name, confirm the new session gets a suffix such as `Push Day A #2`.
5. Confirm previous sets appear as draft target rows in `Today Plan`.
6. Confirm target rows do not create completed `workout_sets` automatically.
7. Confirm warmup targets display as `W` and working targets display as `Set 1`, `Set 2`, `Set 3`.
8. Tap a target row and confirm it fills exercise, warmup status, weight, reps, RPE, and notes in the logger.
9. Change target values before saving and confirm the saved set uses the edited values.
10. Save the target and confirm it is marked `LOGGED`.
11. Confirm the next unlogged target preloads when available.
12. Confirm unsaved targets do not affect volume, PR tags, previous performance, estimated 1RM, or Exercise History.

## Normal Set CRUD

1. Log a working set with exercise, weight, reps, RPE, date, and notes.
2. Confirm it displays as `Set 1`.
3. Log another working set for the same exercise.
4. Confirm it displays as `Set 2`.
5. Edit weight/reps/RPE/date/notes and confirm the row updates.
6. Delete a working set and confirm warmup rows still display as `W`.

## Warmup Logging

1. Enable the Warmup toggle.
2. Confirm the Set field displays `W`.
3. Confirm the Save button says `Save Warmup`.
4. Log two warmups for the same exercise.
5. Disable Warmup and log two working sets.
6. Confirm display order is `W`, `W`, `Set 1`, `Set 2`.
7. Confirm internal warmup set numbers such as `1001` are never visible.
8. Confirm old sets created before `is_warmup` existed still display as working sets.

## Mixed Ordering

1. Start a fresh session.
2. Log `Set 1` and `Set 2` for Exercise A.
3. Enable Warmup and log a warmup for Exercise A.
4. Confirm Exercise A displays `W`, `Set 1`, `Set 2`.
5. Log Exercise B, then Exercise C.
6. Confirm exercise groups remain ordered first logged to last logged.
7. Expand an older session and confirm its sets are grouped by exercise with warmups first.

## Warmup Edit Transitions

1. Edit a working set and switch it to Warmup.
2. Confirm it displays as `W` and no longer contributes to volume or PR tags.
3. Edit a warmup and switch it to working.
4. Confirm it receives a sensible working set number without colliding with existing working sets.
5. Confirm editing a warmup preserves warmup status when the toggle is not changed.
6. Confirm ended sessions block warmup and working-set edits until reopened.

## Analytics Exclusion

1. Log only warmups for an exercise.
2. Confirm active session volume remains `0`.
3. Confirm Previous Performance does not treat warmups as prior performance.
4. Confirm warmups do not show PR tags.
5. Add working sets and confirm volume, PR detection, estimated 1RM, and Exercise History use working sets only.
6. Confirm session-volume PR ignores warmup volume.

## Mobile / iPhone

1. Open Workout on iPhone Safari.
2. Confirm the Warmup toggle is thumb-friendly.
3. Confirm Save Set / Save Warmup remains visible above the bottom nav.
4. Confirm inputs do not zoom when focused.
5. Confirm the current session log has no horizontal overflow.
6. Confirm expanded session history remains readable.
