# LifeOS Calendar QA

Run this after applying `supabase/schema.sql` and signing in through the global auth gate.

## Day-First Layout

1. Open Calendar.
2. Confirm the first visible card is the selected day, not a week board.
3. Confirm the selected date defaults to today.
4. Confirm the top card shows the day label, full date, selected-day event count, date picker, and Plus button.
5. Confirm no duplicate week-grid event display appears above or beside the selected-day agenda.

## Date Selection

1. Use the date picker in the top card.
2. Confirm the selected-day agenda updates to the chosen date.
3. Select a date outside the current week and confirm persisted events for that date load.
4. Select a non-today date and confirm the Today shortcut appears.
5. Use the Today shortcut and confirm the selected date returns to today.

## Create Event Modal

1. Click the Plus button.
2. Confirm the `New Schedule Item` or create modal opens.
3. Confirm the modal date defaults to the currently selected date.
4. Create an event with title, date, start time, end time, category, location, notes, and status `planned`.
5. Confirm the modal closes after save.
6. Confirm the new event appears in the selected-day agenda.
7. Refresh the page and confirm the event reloads from Supabase.

## Edit Event Modal

1. Click edit on an event card.
2. Confirm the same modal opens in edit mode and is prefilled.
3. Change title, time, category, notes, date, and status.
4. Save the event.
5. Confirm the modal closes and the selected date follows the event date.
6. Confirm the agenda shows the updated event.
7. Click cancel/close from edit mode and confirm no changes are saved.

## Delete Event

1. Click delete on an event.
2. Confirm the browser confirmation appears.
3. Confirm the event disappears from the selected-day agenda.
4. Refresh and confirm it does not return.

## Categories

1. Confirm the event form uses defined category choices, not a free text hashtag field.
2. Confirm the visible categories are Work, Study, School, Health, Workout, Entertainment, and Sleep.
3. Create one event in several categories and confirm each uses a distinct but subtle color treatment.
4. Confirm event cards show category labels without hashtags.
5. If an older event has an unknown category string, confirm it displays with neutral styling and does not crash.
6. Confirm Action API or AI-created category strings outside the list remain display-compatible.

## Agenda Readability

1. Create several events on the same day.
2. Confirm timed events sort by start time ascending.
3. Confirm events without a start time appear after timed events.
4. Confirm titles, notes, and locations remain readable in the main agenda and do not rely on cramped truncation.
5. Confirm long titles, category strings, locations, and notes stay inside the viewport.
6. Confirm the empty state says `No events on this day` and includes a create CTA.

## Validation

1. Try saving without a title and confirm a clear error.
2. Try an end time earlier than the start time and confirm a clear error.
3. Confirm status only allows planned, done, skipped, or cancelled.
4. Confirm UI category selection only allows the defined categories.
5. Confirm invalid dates are rejected.
6. Confirm invalid manual time values are rejected if the browser allows entry.
7. Confirm location and notes can be left blank.

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
5. Start a date load, sign out quickly, and confirm previous-user events do not appear on the auth screen or after another user signs in.

## iPhone Safari

1. Open Calendar on iPhone Safari.
2. Confirm no horizontal scrolling.
3. Confirm the selected-day card is first and the agenda is immediately visible.
4. Confirm the Plus button is thumb-friendly.
5. Confirm the create/edit modal fits the screen and can scroll internally.
6. Confirm inputs do not zoom when focused.
7. Confirm the bottom nav does not cover modal actions.
8. Confirm event edit/delete controls are thumb-friendly.
