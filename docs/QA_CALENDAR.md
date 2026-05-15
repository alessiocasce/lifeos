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
2. Confirm the `New Schedule Item` create editor opens.
3. On mobile, confirm it opens as a full-screen editor instead of a bottom sheet.
4. On desktop/tablet, confirm it still opens as a centered dialog.
5. Confirm the editor date defaults to the currently selected date.
6. Create an event with title, date, start time, end time, category, location, notes, and status `planned`.
7. Confirm the editor closes after save.
8. Confirm the new event appears in the selected-day agenda.
9. Refresh the page and confirm the event reloads from Supabase.

## Modal Scrolling

1. Open the create modal on iPhone Safari.
2. Confirm mobile uses a full-screen editor, not a bottom-sheet popup.
3. Confirm the Calendar page behind the editor does not create a bad scroll trap.
4. Confirm there is no nested modal/body double-scroll trap.
5. Confirm there is no horizontal scrollbar inside the editor, form body, or footer.
6. Confirm the editor content has a single reliable vertical scroll path when the form is taller than the viewport.
7. Confirm the X close button remains visible without scrolling.
8. Confirm Create/Update and Cancel remain accessible.
9. Trigger a validation error and confirm the user can still see the X button and close the editor.
10. Confirm the editor respects the iPhone safe area and is not covered by the bottom nav.
11. Confirm the mobile editor feels like a native full-screen create/edit screen, not a squeezed desktop form.

## Modal Field Layout

1. On a narrow iPhone viewport, confirm Date, Status, Start, End, Category, and Location stack vertically.
2. Confirm Start and End are not forced into two columns on the narrowest screens.
3. Confirm native date, time, and select controls stay inside the modal width.
4. Confirm footer buttons are full width on mobile and do not overflow.
5. Confirm the mobile editor header title and X remain visually clean.

## iPhone Input Targeting

1. Open the create modal on iPhone Safari.
2. Tap Title, type `Study session`, dismiss the keyboard, and tap Title again. Confirm Title focuses, not Date.
3. Repeat the focus, dismiss, and refocus flow for Date, Status, Start, End, Category, Location, and Notes.
4. Scroll the full-screen editor, tap a visible field, and confirm the tapped field receives focus.
5. Confirm keyboard open/close does not shift tap hitboxes to the field below the visible target.
6. Confirm there is still no horizontal scrollbar inside the modal.
7. Confirm the X button still closes the modal and the background page does not create a bad scroll trap.

## iPhone Keyboard Close

1. Open the mobile full-screen create editor on iPhone Safari.
2. Focus Title, type text, and tap Done/End on the keyboard.
3. Confirm the keyboard close animation does not leave a lingering black rectangle where the keyboard was.
4. Repeat with Location and Notes.
5. Confirm any brief viewport transition uses the editor background and disappears quickly.
6. Confirm input targeting still works after keyboard open/close.
7. Confirm there is no horizontal overflow after the keyboard closes.

## Edit Event Modal

1. Click edit on an event card.
2. Confirm the same editor opens in edit mode and is prefilled.
3. On mobile, confirm edit also uses the full-screen editor.
4. Change title, time, category, notes, date, and status.
5. Save the event.
6. Confirm the editor closes and the selected date follows the event date.
7. Confirm the agenda shows the updated event.
8. Click cancel/close from edit mode and confirm no changes are saved.

## Delete Event

1. Click delete on an event.
2. Confirm the browser confirmation appears.
3. Confirm the event disappears from the selected-day agenda.
4. Refresh and confirm it does not return.

## Quick Status Actions

1. Create or open an event in the selected-day agenda.
2. Confirm the quick controls are visually grouped as status actions and separate manage actions.
3. Click the green check button and confirm the event status changes to `done`.
4. Click the amber skip button and confirm the event status changes to `skipped`.
5. Click the red X status button and confirm the event status changes to `cancelled`.
6. Click the planned clock button and confirm the event status changes back to `planned`.
7. Confirm the current status button is highlighted and disabled.
8. Confirm the red cancelled status button does not delete the event.
9. Confirm permanent delete still uses the Trash icon and confirmation prompt.
10. Confirm failed status updates show a clear agenda error and that the error clears after changing selected dates.
11. On mobile, confirm the status buttons wrap cleanly with Edit/Delete and do not create horizontal overflow.

## Categories

1. Confirm the event form uses defined category choices, not a free text hashtag field.
2. Confirm the visible categories are Work, Study, School, Health, Workout, Errands, Personal, Social, Entertainment, and Sleep.
3. Create one event in several categories and confirm each uses a distinct but subtle color treatment.
4. Confirm event cards show category labels without hashtags.
5. If an older event has an unknown category string, confirm it displays with neutral styling and does not crash.
6. Confirm Action API or AI-created category strings outside the list remain display-compatible.
7. Create or edit events with Errands, Personal, and Social and confirm they save and reload.
8. Ask the assistant to create `take mom somewhere today 15:45-17:30` and confirm the category is Errands or Social depending on the wording.

## Agenda Readability

1. Create several events on the same day.
2. Confirm timed events sort by start time ascending.
3. Confirm events without a start time appear after timed events.
4. Confirm titles, notes, and locations remain readable in the main agenda and do not rely on cramped truncation.
5. Confirm long titles, unknown category strings, locations, and notes stay inside the viewport.
6. Confirm the empty state says `No events on this day` and includes a create CTA.

## Validation

1. Try saving without a title and confirm a clear error.
2. Try an end time earlier than the start time and confirm a clear error.
3. Confirm status only allows planned, done, skipped, or cancelled.
4. Confirm UI category selection only allows the defined categories.
5. Confirm invalid dates are rejected.
6. Confirm invalid manual time values are rejected if the browser allows entry.
7. Confirm location and notes can be left blank.
8. Confirm API/AI-created events accept AM/PM time strings such as `12:45pm`, `2:15 pm`, `9am`, and `9 am`, then store/display canonical `HH:MM`.
9. Confirm a range like `3:45 to 5:30 pm` stores as `15:45-17:30` when created through AI/API.
10. Confirm messy AI/API time fields parse correctly: `from 12:45pm`, `12:45pm to 2:15pm`, and `from 3:45 to 5:30 pm`.
11. Confirm the UI time inputs still save normal browser time values correctly.

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
5. Confirm the create/edit flow uses a full-screen editor that fits the screen.
6. Confirm background page scrolling does not interfere while the editor is open.
7. Confirm there is no horizontal scrollbar inside the modal.
8. Confirm inputs do not zoom when focused.
9. Confirm tapping a field after keyboard open/close focuses the visible field, not the field below it.
10. Confirm tapping Done/End on the keyboard does not leave a lingering black box under the editor.
11. Confirm the bottom nav does not cover modal actions.
12. Confirm event status, edit, and delete controls are thumb-friendly and wrap without horizontal overflow.
