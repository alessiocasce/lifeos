# LifeOS Calendar QA

Run this after applying `supabase/schema.sql` and signing in through the global auth gate.

## Create Event

1. Open Calendar.
2. Confirm no mock events are shown as real persisted data.
3. Create an event with title, date, start time, end time, category, location, notes, and status `planned`.
4. Confirm it appears in the selected week and selected date list.
5. Refresh the page and confirm the event reloads from Supabase.

## Edit Event

1. Click edit on the event.
2. Change title, time, category, notes, and status.
3. Save the event.
4. Confirm the week card and selected date detail both update.

## Delete Event

1. Click delete on an event.
2. Confirm the browser confirmation appears.
3. Confirm the event disappears from the week and selected date list.
4. Refresh and confirm it does not return.

## Date And Week Navigation

1. Use previous and next week controls.
2. Create an event in a future week.
3. Confirm the UI moves to or remains clearly oriented around the event's week.
4. Switch away and back to that week.
5. Confirm only events in the selected week are shown.
6. Edit an event and change its date to another week.
7. Confirm the UI loads the new week and the event appears on the new date.
8. Use the date picker and confirm the selected date panel updates.
9. Switch weeks rapidly several times and confirm old-week events do not appear after the final week finishes loading.

## Validation

1. Try saving without a title and confirm a clear error.
2. Try an end time earlier than the start time and confirm a clear error.
3. Confirm status only allows planned, done, skipped, or cancelled.
4. Confirm invalid dates are rejected.
5. Confirm invalid manual time values are rejected if the browser allows entry.
6. Confirm category, location, and notes can be left blank.

## Migration / Error States

1. Test against a Supabase project where `public.calendar_events` has not been created yet.
2. Confirm the Calendar tab shows a clear message telling you to apply `supabase/schema.sql`.
3. Restore the migration and confirm loading recovers after refresh.
4. Temporarily force a create/update/delete failure, such as by disabling network, and confirm a clear error appears.

## User Scope

1. Sign out and sign in as another user.
2. Confirm the first user's events do not appear.
3. Create an event as the second user.
4. Sign back in as the first user and confirm only the first user's events appear.
5. Start a week load, sign out quickly, and confirm previous-user events do not appear on the auth screen or after another user signs in.

## Long Labels

1. Create an event with a very long title.
2. Add a long category and a long location.
3. Confirm compact week cards truncate labels cleanly.
4. Confirm the selected date detail stays inside the viewport.

## iPhone Safari

1. Open Calendar on iPhone Safari.
2. Confirm no horizontal scrolling.
3. Confirm inputs do not zoom when focused.
4. Confirm week cards are readable in a single-column mobile flow.
5. Confirm create/edit/delete controls are thumb-friendly.
6. Confirm the bottom nav does not cover the Create/Update Event button.
