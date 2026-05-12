# Daily Review Manual QA

Run this after signing in through the global auth gate. No schema migration should be needed if `daily_reviews` already exists from `supabase/schema.sql`.

## Create Today's Review

1. Open the Assistant tab.
2. Confirm it shows the Daily Review surface, not AI chat.
3. Confirm a loading state appears while reviews are loading.
4. Leave the date set to today.
5. Enter wins, risks, optional score, and at least one next action.
6. Save the review.
7. Confirm the review appears in Recent Persisted Reviews.

## Update Today's Review

1. Keep today's date selected.
2. Change wins, risks, score, or next actions.
3. Save again.
4. Confirm the existing review updates instead of creating a duplicate row.

## Selected Date Review

1. Change Review Date to yesterday.
2. Confirm the form loads an empty review if no persisted review exists.
3. Save a review for yesterday.
4. Switch back to today, then back to yesterday.
5. Confirm each date loads the correct persisted review.
6. Click a recent review card.
7. Confirm the Review Date changes and the matching persisted review loads.

## Fast Date Switching

1. Switch between several review dates quickly.
2. Watch the expense context card while requests are in flight.
3. Confirm stale expense totals from the prior date are not shown as current data.
4. Confirm the final selected date shows the correct expense context.

## Next Actions

1. Add multiple next actions.
2. Edit one action's text.
3. Remove one action.
4. Save and refresh.
5. Confirm the persisted `next_actions` array reloads correctly.
6. Delete or blank out every next action input.
7. Save and refresh.
8. Confirm the UI keeps one empty input row but the saved `next_actions` value is `[]`.

## Blank Review Body

1. Clear wins and risks.
2. Leave score blank.
3. Save the review.
4. Confirm blank wins and risks are allowed for now.

## Validation

Try each invalid value and confirm save is blocked:

- Missing or invalid review date.
- Score `0`.
- Score `101`.
- Decimal score such as `8.5`.
- Decimal-looking score such as `8.0`.
- Non-numeric score.

## Duplicate Recovery

1. Open two browser tabs on the same user and same review date.
2. Create the review in one tab.
3. Save the review in the second tab.
4. Confirm the app recovers by updating the existing date review instead of leaving an error.

## Context Cards

1. Create a health log for the selected review date.
2. Create a workout session and set for the selected review date.
3. Create an expense for the selected review date.
4. Return to Assistant and select that date.
5. Confirm the context cards show the persisted health, workout, and expense summaries.
6. Confirm editing the review does not copy or save these summaries into `wins` or `risks` unless typed manually.
7. If possible, temporarily break the selected-date expense request or test with a user/project state that triggers an expense request error.
8. Confirm the expense context card shows a clear warning.

## Persistence

1. Save a review.
2. Refresh the page.
3. Confirm daily reviews reload from Supabase.
4. Sign out and sign in again.
5. Confirm only the current user's reviews appear.

## iPhone Safari

1. Open Assistant on iPhone Safari.
2. Confirm no horizontal scrolling.
3. Confirm inputs do not zoom when focused.
4. Confirm next action add/remove controls are thumb-friendly.
5. Confirm the bottom navigation does not cover the Save Review button or recent reviews.
