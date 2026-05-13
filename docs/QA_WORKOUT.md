# LifeOS Workout QA

Run this after applying `supabase/schema.sql` and signing in with a Supabase-backed account.

## Session Flow

1. Open Workout.
2. With no active session selected, confirm the first visible card is `Start Workout`.
3. Confirm the primary prompt asks what you are training today.
4. Confirm no fake exercise name appears at the top.
5. Confirm no rest timer, `0 / 0` set metrics, Set Logger, or Logged Sets panel appears above Start Workout.
6. Confirm the old `Start From Previous` UI is gone.
7. Confirm the mock workout archive is not visible.
8. Start a template workout or start an empty workout.
9. Confirm the active session state shows the workout header, optional Exercise Plan, Set Logger, and Logged Sets.
10. End the session and confirm logging/editing is blocked.
11. Reopen the session and confirm logging/editing works again.
12. Open `Advanced / Switch Session` and confirm active session switching still works.
13. Open `Advanced / Danger`, delete a session, and confirm the confirmation step appears before deletion.

## Workout Templates

1. Open `Manage Templates`.
2. Create a template such as `Chest Day`.
3. Add ordered exercises such as `Cable Fly`, `Incline Bench Press`, and `Bench Press`.
4. Reorder exercises with up/down controls and confirm the order persists after refresh.
5. Edit the template name and confirm the updated name persists.
6. Edit an exercise name and confirm it persists.
7. Delete an exercise and confirm it is removed.
8. Delete a template and confirm its exercises disappear with it.
9. Confirm another user cannot see the template or exercises.

## Start From Template

1. With no active session selected, start a workout from a saved template.
2. Confirm the new session is named after the template.
3. If today's sessions already include the same name, confirm the new session gets a suffix such as `Chest Day #2`.
4. Confirm no `workout_sets` are created automatically.
5. Confirm `Exercise Plan` shows only ordered exercise names, not weights/reps/RPE targets.
6. Tap an exercise in `Exercise Plan` and confirm it fills the logger Exercise input.
7. Log warmups and working sets normally.
8. Confirm Previous Performance still uses persisted historical sets for the selected exercise.
9. Confirm unsaved template exercises do not affect volume, PR tags, previous performance, estimated 1RM, or Exercise History.

## Start Empty Workout

1. With no active session selected, open `Start Empty Workout`.
2. Keep `Today Workout` or enter a custom name.
3. Start the session and confirm no `Exercise Plan` appears.
4. Type exercises manually and log sets normally.

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
2. With no active session selected, confirm Start Workout is visible immediately near the top.
3. Confirm no fake exercise name, rest timer, logger, or logged-set panel appears before Start Workout.
4. Confirm choosing a template or starting empty is the first obvious action when no session is active.
5. Confirm `Manage Templates`, `Advanced / Switch Session`, and `Advanced / Danger` are collapsed by default.
6. Confirm template start buttons are thumb-friendly.
7. Confirm tapping an exercise plan row is thumb-friendly.
8. Confirm the Warmup toggle is thumb-friendly.
9. Confirm Save Set / Save Warmup remains visible above the bottom nav.
10. Confirm inputs do not zoom when focused.
11. Confirm the current session log has no horizontal overflow.
12. Confirm expanded session history remains readable.
