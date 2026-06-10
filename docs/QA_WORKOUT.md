# LifeOS Workout QA

Run this after applying `supabase/schema.sql` and signing in with a Supabase-backed account.

## Session Flow

1. Open Workout with no active session and confirm `Start Workout` is the first visible card.
2. Confirm template starts are primary and `Start Empty Workout` remains available.
3. Start a workout and confirm the sticky header shows the workout name, LIVE status, date, and visible End Workout button.
4. Confirm End Workout is visible without scrolling or opening another panel.
5. End the workout and confirm set logging/editing is blocked.
6. Confirm the sticky header changes to ENDED with a visible Reopen button.
7. Reopen and confirm set logging/editing works again.
8. Open Session Options, switch sessions through Advanced, and delete a session through the confirmation flow.

## Template Persistence

1. Create a template with at least three ordered exercises.
2. Start a workout from the template.
3. Confirm the new workout stores `template_id` and an ordered `template_snapshot`.
4. Confirm no `workout_sets` are created automatically.
5. Confirm Exercise Plan shows the snapshot exercises in template order.
6. Refresh `/workout` and confirm the same active workout and Exercise Plan return.
7. Background the iPhone/PWA for at least 10 minutes, reopen it, and confirm the plan still appears.
8. Edit or delete the original template and confirm the active workout snapshot remains stable.
9. Confirm old and empty workouts without a snapshot still load normally.

## Exercise Suggestions

1. Focus the Exercise field and type part of a template exercise name.
2. Confirm suggestions include current snapshot exercises.
3. Confirm suggestions also include exercises from other templates and prior logged sets.
4. Tap a suggestion and confirm it fills the Exercise field and recalculates the next set number.
5. Type a new exercise name and confirm it can still be saved.
6. Confirm the suggestion list has no horizontal overflow on iPhone.

## Normal Set CRUD

1. Log a working set with exercise, weight, reps, blank RPE, and optional notes.
2. Confirm no Date field is required and the set uses the current timestamp.
3. Confirm the row displays `Set 1` and `RPE --`, not `RPE 0`.
4. Log another working set for the same exercise and confirm it displays `Set 2`.
5. Edit weight, reps, RPE, warmup status, and notes; confirm blank RPE remains blank/null.
6. Delete a set and confirm the current session log updates.
7. Confirm only the current active workout's sets appear; `Other Sessions` is absent.

## Warmup Numbering

1. Enable Warmup and confirm the next-set display shows `W`.
2. Log two warmups for one exercise.
3. Disable Warmup and confirm the next-set display immediately becomes `Set 1`.
4. Log two working sets and confirm display order is `W`, `W`, `Set 1`, `Set 2`.
5. Toggle Warmup on and off repeatedly and confirm `1001`, `1002`, or other offset values never appear.
6. Edit a working set into a warmup and confirm it displays `W`.
7. Edit a warmup into a working set and confirm it receives a non-conflicting normal number.
8. If an old non-warmup row has `set_number >= 1000`, confirm it displays with a repaired normal set label.

## Active Workout Noise

1. Confirm the rest timer and Start/Pause/Reset timer controls are gone.
2. Confirm PR flags such as `SET VOLUME`, `SESSION VOLUME`, `WEIGHT`, and `REPS` do not appear near active sets.
3. Confirm active workout set/volume summaries are absent.
4. Confirm exercise group subtitles such as `3 working / 1 warmup / 810 volume` are absent.
5. Confirm Previous is either absent or shows only compact Heaviest and Est 1RM values.
6. Confirm Exercise History/analysis is not shown in the active workout flow.

## Template Management

1. Open `Manage templates`.
2. Create, rename, and delete a template.
3. Add, edit, delete, and reorder template exercises.
4. Confirm blank names and duplicate names show clear validation errors.
5. Confirm deleting a template does not delete completed workout sessions or their snapshots.
6. Confirm another user cannot see the template or exercises.

## Mobile / iPhone

1. Open `/workout` on iPhone Safari or the installed PWA.
2. Confirm the safe-area shell and sticky workout header do not overlap.
3. Confirm End Workout/Reopen is immediately visible and thumb-friendly.
4. Confirm Exercise, Weight, Reps, RPE, Notes, and Save controls fit without horizontal scrolling.
5. Confirm inputs do not zoom when focused.
6. Confirm Save Set / Save Warmup remains above the bottom navigation.
7. Confirm logged set edit/delete controls remain tappable.
8. Refresh and background/reopen the app during a live template workout and confirm the active session and plan persist.
