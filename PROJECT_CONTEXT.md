# LifeOS Project Context

Last updated: 2026-05-12
Current branch: `main`
Recent context: Health tab now focuses on measurable daily tracking with counters and ADC.

## Project Goal

LifeOS is a high-density personal operating system for daily planning, health tracking, workout logging, finances, and an assistant-style review surface. The product direction is "Midnight Cyber-Athletics": a dark, command-center interface for personal performance with dense data, fast entry, and minimal visual noise.

The app should feel like a practical daily-use tool, not a marketing page. The current priority is turning one vertical slice at a time from realistic mock UI into persistent Supabase-backed workflows.

## Tech Stack

- React 18 functional components
- Vite 6
- Tailwind CSS
- Lucide React icons
- Recharts for compact charts and sparklines
- Supabase JS v2 for auth and database access
- Supabase Postgres with Row Level Security

Important scripts:

- `npm run dev` starts Vite on `127.0.0.1`
- `npm run build` creates a production build
- `npm run preview` previews the built app on `127.0.0.1`

For LAN preview, run Vite manually with a LAN host, for example:

```powershell
npm.cmd run dev -- --host 0.0.0.0
```

## Current Architecture

- `src/App.jsx` gates entry into the app. It shows Supabase setup, auth loading, or global auth screens before rendering `Shell`.
- `src/context/LifeOSContext.jsx` is the central state layer. It owns active tab state, remaining local mock-backed state, Supabase auth state, persisted module state, and CRUD actions.
- `src/components/AuthScreen.jsx` owns global sign in, sign up, loading, and Supabase setup screens.
- `src/components/LifeOSLogo.jsx` contains the custom inline SVG logo used by the shell and favicon artwork.
- `src/components/Shell.jsx` owns the global app shell:
  - Desktop/tablet uses the fixed left sidebar and full top metrics header.
  - Mobile uses a compact sticky top header and fixed bottom tab navigation.
  - Sign out lives in the shell header, not in an individual tab.
  - Header/sidebar metrics use persisted health, workout, and expense state where available instead of mock finance/training values.
- `src/components/ui.jsx` contains shared UI primitives such as `Panel`, `PanelHeader`, `Tag`, `ProgressRing`, `Sparkline`, and `MiniMetric`.
- `src/services/lifeosApi.js` contains Supabase API wrappers.
- `src/lib/supabaseClient.js` creates the Supabase client from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- `src/data/lifeosData.js` contains realistic mock data still used by unconverted/sample surfaces, including the workout sample archive.
- Deployment docs live in `docs/DEPLOYMENT.md`, with deployed-app QA in `docs/QA_DEPLOYMENT.md`.
- Tab files live in `src/tabs/`:
  - `HomeTab.jsx`
  - `CalendarTab.jsx`
  - `HealthTab.jsx`
  - `WorkoutTab.jsx`
  - `FinancesTab.jsx`
  - `AIAssistantTab.jsx`

## Supabase Setup And Auth/RLS Status

Supabase is configured through `.env.local`:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

The schema is in `supabase/schema.sql`.

Current tables:

- `workouts`
- `workout_sets`
- `health_logs`
- `expenses`
- `calendar_events`
- `daily_reviews`
- `chat_messages`

All tables have `user_id` columns defaulting to `auth.uid()` and referencing `auth.users(id) on delete cascade`.

RLS is enabled on all user tables. Current policies are user-scoped for authenticated users:

- Users can only read/write rows where `auth.uid() = user_id`.
- `workout_sets` also checks that the referenced `workouts` row belongs to the same authenticated user.

The frontend currently uses Supabase Auth as a global app gate:

- Sign in
- Sign up
- Sign-up email confirmation messaging when Supabase returns no session
- Sign out
- Session restoration through `getSession`
- Auth state subscription through `onAuthStateChange`
- The app shell and tabs render only after `authUser` exists.
- User-scoped persisted state is cleared immediately when the auth user changes, and late list responses are ignored if they belong to a previous auth user.

## Real Features Vs Mock Features

Real/persisted today:

- Supabase Auth as a global app gate before the shell/tabs render.
- Workout sessions persisted in `workouts`.
- Workout sets persisted in `workout_sets`.
- Workout session create/select/end/delete.
- Workout set create/edit/delete.
- Workout analytics are computed frontend-only from persisted workout/session data.
- Health daily logs persisted in `health_logs`.
- Health tab creates or updates one log per `user_id + logged_on` and shows persisted 7-day history/summaries.
- Expenses persisted in `expenses`.
- Finances tab creates, edits, deletes, and summarizes persisted user-scoped expenses.
- Home tab summarizes persisted workout sessions/sets, health logs, and expenses.
- Calendar events persisted in `calendar_events`.
- Calendar tab creates, edits, deletes, and groups persisted user-scoped events by date/week.
- Daily reviews persisted in `daily_reviews`.
- Assistant tab is currently a real Daily Review workflow, not AI chat.

Partially wired but not fully used in UI:

- `lifeosApi.js` has basic list/create/update/delete wrappers for `chat_messages`.
- The database schema and RLS support these tables.

Still mostly mock/local:

- Chat messages and AI assistant behavior; no fake AI chat is shown in the Assistant tab.
- Workout sample archive uses mock examples from `src/data/lifeosData.js`, visually separated from persisted data.

## Calendar Module Current Status

`src/tabs/CalendarTab.jsx` is Supabase-backed and mobile-first.

Current `calendar_events` fields:

- `title`
- `event_date`
- `start_time`
- `end_time`
- `category`
- `location`
- `notes`
- `status`

Current behavior:

- Loads the current authenticated user's calendar events through RLS.
- Queries events by selected week range.
- Supports selected date and selected week navigation.
- Creates, edits, and deletes events.
- Shows events grouped by date in the week view and selected-date detail.
- Uses persisted calendar events only; mock planning data and AI triage were removed from the Calendar tab.
- Ignores stale week-range responses during fast week switching and clears calendar state on auth changes.
- Shows a specific setup error if the `calendar_events` migration has not been applied.
- Status is limited to `planned`, `done`, `skipped`, and `cancelled`.
- Does not support recurring events yet.
- Does not implement Google Calendar sync yet.
- Does not implement AI triage yet.

## Daily Review Module Current Status

`src/tabs/AIAssistantTab.jsx` now hosts the Daily Review workflow.

Current behavior:

- Loads the current authenticated user's `daily_reviews` rows through RLS.
- Defaults to today's review date.
- Creates a review when none exists for `review_on`.
- Updates the existing review when one already exists for `review_on`.
- Uses duplicate-key recovery by fetching the existing date row and updating it.
- Supports selecting another review date and loading that date's persisted review.
- Stores `next_actions` as a JSON array of strings.
- Validates optional `score` as a whole number from 1 to 100.
- Shows recent persisted reviews.
- Shows loading states before review archive empty states and warns if selected-date expense context fails.
- Defensively sorts recent reviews newest-first in the Review surface.
- Shows read-only context cards for the selected date using persisted health logs, workout sessions/sets, and expenses.
- Keeps one empty next-action input row in the UI when all actions are removed, while saving an empty `next_actions` array.
- Does not save context summaries redundantly into the review.
- Does not implement AI behavior yet.

## Home Module Current Status

`src/tabs/HomeTab.jsx` is now a persisted-data summary dashboard.

Current behavior:

- Uses persisted `workoutSessions` and nested `workout_sets` from context.
- Uses persisted `healthLogs` from context.
- Uses persisted `expenses` for today's spend and latest expenses.
- Loads the current month through `loadExpenseMonth` and uses persisted `monthlyExpenses` for current-month spend and category summaries.
- Shows loading states while persisted lists are syncing and waits until statuses resolve before showing empty states.
- Prioritizes today's live session, then another today's session, before falling back to an older selected active/latest session in the workout summary.
- Shows clear empty states instead of mock values when data is missing.
- Does not use mock agenda, mock health, mock workout status, or mock finance data inside the Home tab.
- Remains mobile-first with compact cards and no wide fixed layout.

## Finances Module Current Status

`src/tabs/FinancesTab.jsx` is Supabase-backed and mobile-first.

Current `expenses` fields:

- `vendor`
- `category`
- `amount`
- `spent_on`
- `notes`

Current behavior:

- Loads the current authenticated user's expenses through RLS.
- Creates, edits, and deletes expenses.
- Amount input accepts comma decimals such as `12,50`.
- Has a month selector that defaults to the current month.
- Queries Supabase for the selected month range for monthly spend and category summaries.
- Keeps recent persisted expense history separate from selected-month summaries.
- Does not use mock finance ledger data inside the Finances tab.
- No bank balance is persisted yet; the current finance slice is an expense tracker only.

## Health Module Current Status

`src/tabs/HealthTab.jsx` is Supabase-backed and mobile-first.

Current `health_logs` fields:

- `logged_on`
- `sleep_hours`
- `sleep_start`
- `wake_time`
- `sleep_quality`
- `energy`
- `mood`
- `water`
- `coffee`
- `adc`
- `social_time_minutes`
- `main_time_waster`
- `notes`
- `hygiene`

Current behavior:

- Loads the current authenticated user's health logs through RLS.
- Shows today's log first when it exists.
- Saves today's log by updating the existing row when `logged_on` already exists.
- Creates a new row when no log exists for the selected `logged_on`.
- Uses the `user_id + logged_on` unique constraint to avoid duplicate daily logs.
- If a duplicate-key insert happens, the app fetches the existing log for that date and updates it.
- Changing the form date loads the persisted log for that date or clears the form for a new date.
- Shows compact 7-day history from persisted rows only.
- Shows measurable summaries: average sleep, average energy, average water, total coffee, total ADC, and hygiene count totals.
- Does not auto-calculate sleep time; `sleep_hours` is manually entered.
- `sleep_quality`, `mood`, `social_time_minutes`, and `main_time_waster` remain in the database for backward compatibility but are not displayed in the Health check-in, 7-day summary, or 7-day history.
- `sleep_hours` and `energy` may be left blank; water, coffee, ADC, and hygiene item counts must be non-negative numbers.
- Hygiene is stored as JSON count values. Older boolean rows are normalized in the frontend: `done: true` counts as 1 and `done: false` counts as 0.
- Does not use iPhone Screen Time integration yet.

## Workout Module Current Status

`src/tabs/WorkoutTab.jsx` has been refactored into smaller components:

- `ActiveWorkoutHeader`
- `SessionControlCard`
- `SetLogger`
- `PreviousPerformanceCard`
- `TodaySetsLog`
- `ExerciseHistoryPanel`
- `SampleDataArchive`

Current behavior:

- Assumes the user is already authenticated by the global app gate.
- Loads persisted workout sessions with nested sets.
- Selects an existing session or creates a session for today.
- Supports custom session creation behind a toggle.
- Ended sessions cannot use the local rest timer.
- Ended sessions cannot add or edit sets. The logger shows: "This workout is ended. Reopen it to add more sets."
- Ended sessions can be reopened from Session Control, which sets `ended_at` back to `null`.
- Deleting a session requires confirmation and cascades sets through the database relationship.
- Sets belong to workout sessions.
- Sets include exercise, set number, weight, reps, RPE, performed date/time, and notes.
- Next set number is automatic based on selected session plus exercise.
- Weight and RPE parsing accepts both comma and dot decimals.
- Validation runs before insert/update for exercise, weight, reps, RPE, and date.
- Today's active session sets are shown immediately under the logger, grouped by exercise.
- Other sessions are kept visually separate/collapsed in history.
- Persisted workout data is visually separated from mock sample data.
- Login/register controls are intentionally absent from the Workout tab.

Workout analytics are frontend-only:

- Previous performance for selected exercise from the most recent prior workout session.
- Previous heaviest set, best volume set, estimated 1RM, total exercise volume, last weight/reps/RPE, and date.
- PR detection for weight PR, reps PR, set volume PR, and session-volume PR.
- Estimated 1RM uses the Epley formula: `weight * (1 + reps / 30)`.
- Exercise History groups persisted sets by exercise and shows progression over time, including total session volume and best estimated 1RM trend.

Rest timer status:

- Local-only state in `WorkoutTab.jsx`.
- Starts at 0 when no set has been logged.
- After saving a set, starts counting up from 0.
- Has Start, Pause, and Reset.
- Displays `mm:ss`.
- Does not persist to Supabase.
- Inactive when there is no active workout session or the active session has `ended_at`.
- Ending a workout stops and resets the timer.
- Reopening a workout does not automatically start the timer; it stays at 0 until the user starts it or logs another set.

## Mobile/iPhone UI Direction

The app shell is now mobile-first while preserving desktop:

- Desktop/tablet keeps the fixed left sidebar and full header metrics.
- Mobile hides the sidebar and uses a compact native-app style shell.
- Mobile has a fixed bottom tab bar with Home, Calendar, Health, Workout, Finances, and Assistant.
- Mobile content is full width with smaller padding and safe-area bottom padding.
- Header metrics and sidebar pips are hidden on mobile.

Workout mobile direction:

- Prioritize fast set logging at the gym.
- Active workout header is compact and sticky on mobile with `top-14`, matching the shell's mobile `h-14` header.
- Desktop keeps the workout header non-sticky with `md:static`.
- Rest timer is compact and visible near the top.
- Exercise input is full-width.
- Weight, reps, and RPE use a compact mobile grid.
- Save Set is full-width and at least 48px tall.
- Numeric inputs use `inputMode` to prevent poor mobile keyboard behavior.
- Font sizes in inputs should stay at least 16px to avoid iOS zoom.
- Session Control, Exercise History, and Sample Data Archive are collapsed by default on mobile.
- Avoid fixed desktop widths or wide grids that cause horizontal overflow.

## Important UX Principles

- Preserve the "Midnight Cyber-Athletics" visual language:
  - `bg-[#0a0a0a]` for the app background.
  - `bg-[#121212]` and black overlays for panels/cards.
  - Subtle borders like `border-white/5` and `border-zinc-800`.
  - Neon accents only for meaningful highlights.
  - `font-mono`/`data-text` treatment for numbers, metrics, logs, and system-like text.
- Keep the UI dense, but not chaotic.
- The workout flow should be thumb-friendly, fast, and low-friction.
- Real persisted data should be visually prioritized over sample/mock data.
- Use icons for compact controls where appropriate.
- Do not add large decorative hero sections or marketing-style layouts.
- Avoid making mobile worse while improving desktop, and avoid making desktop worse while improving mobile.

## Known Issues / Things To Test

- Before adding AI, chat automation, Google Calendar sync, or other external APIs, deploy against the real Supabase project and run `docs/QA_DEPLOYMENT.md`.
- Test global Supabase Auth gate with fresh sign up, email-confirmation flow, sign in, sign out, and page reload.
- Test app behavior when Supabase env vars are missing.
- Test Health tab after running the latest `health_logs` migration:
  - Create today's log when none exists.
  - Save today's log again and confirm it updates instead of duplicating.
  - Create yesterday's log and switch between dates to confirm the form loads the correct persisted row.
  - Confirm 7-day summaries use persisted rows only.
  - Confirm numeric fields reject out-of-range values.
  - Confirm ADC and hygiene counters persist.
  - Run `docs/QA_HEALTH.md`.
- Test Finances tab with `docs/QA_FINANCES.md`:
  - Create, edit, and delete persisted expenses.
  - Confirm comma decimal amounts save correctly.
  - Confirm selected-month totals exclude expenses outside the selected month.
  - Confirm recent history remains separate from selected-month summaries.
- Test Home tab with `docs/QA_HOME.md`:
  - Confirm empty states when no persisted module data exists.
  - Create health, workout, and expense records and confirm Home updates.
  - Refresh and confirm persisted summaries reload.
  - Confirm Home handles zero-set workouts, blank optional health fields, older-only expenses, long labels, and multiple sessions today.
- Test Daily Review workflow with `docs/QA_DAILY_REVIEW.md`:
  - Create and update today's review.
  - Create reviews for other dates and switch between them.
  - Confirm duplicate-date saves update the existing row.
  - Confirm read-only context cards use persisted health, workout, and expense data.
  - Confirm blank wins/risks, empty next actions, fast date switching, and expense context errors behave correctly.
- Test Calendar tab with `docs/QA_CALENDAR.md`:
  - Create, edit, and delete persisted events.
  - Switch selected dates and weeks.
  - Refresh and confirm events persist.
  - Confirm another user cannot see the first user's events.
  - Confirm iPhone Safari has no horizontal overflow and controls remain thumb-friendly.
- Run the full-app checklist in `docs/QA_FULL_APP.md` after major integration changes.
- Run deployment setup from `docs/DEPLOYMENT.md` and live deployed QA from `docs/QA_DEPLOYMENT.md` before external API automation work.
- Test workout session creation with RLS enabled in a real Supabase project.
- Test deleting a workout session and confirm associated sets disappear.
- Test editing sets with comma decimals such as `32,5` and `8,5`.
- Test duplicate set number behavior for the same exercise in one session.
- Test ended sessions:
  - Timer should be inactive.
  - Start should not work.
  - Adding sets should be blocked.
  - Editing sets should be blocked.
  - Delete session should still work.
  - Reopen Workout should clear `ended_at` and restore logging.
- Test iPhone Safari:
  - Sticky shell header plus workout header should not overlap.
  - Bottom nav should not cover Save Set.
  - Inputs should not trigger iOS zoom.
  - No horizontal scrolling.
- Build currently emits a Vite chunk-size warning because the bundle is over 500 kB. This is not a failing build, but future code splitting may be useful.

## Next Recommended Steps

1. Harden the workout vertical slice before expanding other tabs.
2. Add focused tests or manual QA checklist for workout session/set CRUD with Supabase RLS.
3. Test Health tab CRUD against a real Supabase project after applying the latest `health_logs` migration.
4. QA the Finances tab against a real Supabase project.
5. QA the Home dashboard against a real Supabase project after creating records in Health, Workout, and Finances.
6. Harden the Daily Review workflow against a real Supabase project.
7. QA the Calendar tab against a real Supabase project after applying the `calendar_events` migration.
8. Deploy the app and complete live iPhone QA against the real Supabase project.
9. Convert Chat Messages only after the assistant behavior is clearly defined and live QA has passed.
10. Consider route-level or tab-level code splitting later to reduce the Vite chunk warning.

## Rules For Future Work

- Do not add unrelated features.
- Preserve the desktop layout while improving mobile.
- Keep the Supabase schema unchanged unless explicitly asked.
- Run `npm run build` before claiming success.
- Prioritize one vertical slice at a time.
- Keep changes scoped to the requested module/tab.
- Do not touch unrelated tabs, schema, or app logic unless required by the requested change.
- Keep authentication global unless explicitly asked to change the app access model.
- Prefer existing component patterns and LifeOS visual language over new abstractions.
- Treat persisted Supabase data as the source of truth for completed real workflows.
- Keep mock data only where the tab has not yet been converted or where it is clearly labeled as sample/archive data.
