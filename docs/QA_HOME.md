# Home Tab Manual QA

Run this after signing in through the global auth gate. No schema migration is needed; Home reads persisted data from the existing Calendar, Memos, Health, Workout, and Projects/Ops slices.

## Zero-Filtered Home

1. Sign in with a user that has no relevant records for today.
2. Open Home.
3. Confirm Home does not show widgets/cards that say `No ... logged`, `No project work logged today`, `No workout today`, `No events planned today`, or similar absence nags.
4. Confirm Home does not show zero-value cards such as `0`, `0m`, `0 sets`, `0 volume`, or `today 0m project work`.
5. Confirm Home does not show an Ops Execution card merely because active projects exist.
6. Confirm Home does not show active project count or latest project when no project work is active/logged today.
7. Confirm Home does not show Money, Finance, Spend, expense totals, or category/vendor summaries.
8. Confirm Home does not show AI Recent Writes, Recent AI Activity, or Recent Actions.
9. Confirm no fake dashboard values are shown as real data.

## Logged Daily Signals

1. Add only a valid sleep calculation for today.
2. Return to Home.
3. Confirm only the meaningful Sleep signal appears; unrelated zero/empty sections stay hidden.
4. Add one Shower, Creatine, or Skin habit with a timestamp.
5. Confirm Daily Signals shows only the logged habit with count/time.
6. Confirm unlogged habits are not shown.
7. Add Coffee or ADC above zero.
8. Confirm the value appears only when above zero.
9. Leave optional health fields blank and confirm blank values do not render as `--` cards on Home.

## Memos

1. Create an overdue memo.
2. Confirm Home shows the Memos lane and/or Today Signal for the overdue memo.
3. Create a memo due today and confirm it appears.
4. Create a future/upcoming open memo and confirm Home can show the next memo.
5. Complete, dismiss, or delete all relevant memos.
6. Confirm the Memos lane disappears instead of showing `No memos due`.

## Agenda

1. Create a Calendar event for today.
2. Confirm Agenda appears.
3. Cancel or delete all today's visible events.
4. Confirm Agenda disappears instead of showing an empty agenda card.
5. Confirm cancelled events are not counted as visible agenda signals.

## Training

1. Start a workout for today.
2. Confirm Training appears while the workout is live.
3. Add at least one non-warmup set and confirm working sets, volume, and moves appear when above zero.
4. Confirm warmup sets do not inflate working set count or volume.
5. End the workout and confirm Training remains visible as logged today.
6. Use a day with no workout and confirm Training disappears instead of showing `No workout today`.

## Ops

1. Create an active project but do not start/log any project work today.
2. Open Home and confirm Ops does not appear.
3. Confirm there is no `No project work logged today`, no `today 0m project work`, no active project count, and no latest-project card.
4. Start a project session and confirm Ops appears.
5. End a project session with duration above 0 and confirm Ops appears with today's project work.
6. Refresh and confirm persisted project work reloads.

## Finance And AI Activity Separation

1. Create an expense dated today.
2. Return to Home.
3. Confirm no Money/Finance/Spend section appears on Home.
4. Open Finances and confirm the expense appears there.
5. Trigger a successful Brain/Action API write.
6. Return to Home.
7. Confirm no AI Recent Writes/Recent Actions section appears on Home.
8. Open Brain and confirm action history remains available there when appropriate.

## Persistence And Mobile

1. Refresh the page.
2. Return to Home after auth restoration.
3. Confirm only meaningful logged signals reload from Supabase.
4. Sign out and sign in again.
5. Confirm only the current user's persisted signals appear.
6. Open Home on iPhone Safari/PWA.
7. Confirm cards are compact and readable.
8. Confirm no horizontal scrolling.
9. Confirm bottom navigation does not cover the last Home card.
