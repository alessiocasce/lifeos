# LifeOS Project Context

Last updated: 2026-05-11
Current branch: `main`
Recent context: authentication moved to a global app gate; Workout tab no longer owns login/register UI.

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
- `src/context/LifeOSContext.jsx` is the central state layer. It owns active tab state, local mock-backed state, Supabase auth state, workout session state, and workout CRUD actions.
- `src/components/AuthScreen.jsx` owns global sign in, sign up, loading, and Supabase setup screens.
- `src/components/Shell.jsx` owns the global app shell:
  - Desktop/tablet uses the fixed left sidebar and full top metrics header.
  - Mobile uses a compact sticky top header and fixed bottom tab navigation.
  - Sign out lives in the shell header, not in an individual tab.
- `src/components/ui.jsx` contains shared UI primitives such as `Panel`, `PanelHeader`, `Tag`, `ProgressRing`, `Sparkline`, and `MiniMetric`.
- `src/services/lifeosApi.js` contains Supabase API wrappers.
- `src/lib/supabaseClient.js` creates the Supabase client from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- `src/data/lifeosData.js` contains realistic mock data still used by non-workout tabs and by the workout sample archive.
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
- `daily_reviews`
- `chat_messages`

All tables have `user_id` columns defaulting to `auth.uid()` and referencing `auth.users(id) on delete cascade`.

RLS is enabled on all six tables. Current policies are user-scoped for authenticated users:

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

## Real Features Vs Mock Features

Real/persisted today:

- Supabase Auth as a global app gate before the shell/tabs render.
- Workout sessions persisted in `workouts`.
- Workout sets persisted in `workout_sets`.
- Workout session create/select/end/delete.
- Workout set create/edit/delete.
- Workout analytics are computed frontend-only from persisted workout/session data.

Partially wired but not fully used in UI:

- `lifeosApi.js` has basic list/create/update/delete wrappers for `health_logs`, `expenses`, `daily_reviews`, and `chat_messages`.
- The database schema and RLS support these tables.

Still mostly mock/local:

- Home tab agenda, health snapshot, finance summary, and daily pulse data.
- Calendar tab events and AI triage behavior.
- Health tab sliders, steppers, hygiene checklist, and consistency graph.
- Finances tab balance, ledger entries, rapid-entry form, and budget chart.
- AI Assistant tab messages, markdown-like presentation, and accept/reject widgets.
- Workout sample archive uses mock examples from `src/data/lifeosData.js`, visually separated from persisted data.

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

- Test global Supabase Auth gate with fresh sign up, email-confirmation flow, sign in, sign out, and page reload.
- Test app behavior when Supabase env vars are missing.
- Test workout session creation with RLS enabled in a real Supabase project.
- Test deleting a workout session and confirm associated sets disappear.
- Test editing sets with comma decimals such as `32,5` and `8,5`.
- Test duplicate set number behavior for the same exercise in one session.
- Test ended sessions:
  - Timer should be inactive.
  - Start should not work.
  - Adding sets to ended sessions should be reviewed; current UX may still need stricter guardrails if desired.
- Test iPhone Safari:
  - Sticky shell header plus workout header should not overlap.
  - Bottom nav should not cover Save Set.
  - Inputs should not trigger iOS zoom.
  - No horizontal scrolling.
- Build currently emits a Vite chunk-size warning because the bundle is over 500 kB. This is not a failing build, but future code splitting may be useful.

## Next Recommended Steps

1. Harden the workout vertical slice before expanding other tabs.
2. Add stricter UX around ended sessions if sets should never be added after `ended_at`.
3. Add focused tests or manual QA checklist for workout session/set CRUD with Supabase RLS.
4. Convert the Health tab from local state to Supabase `health_logs`.
5. Convert the Finances tab to Supabase `expenses`.
6. Convert Daily Reviews and Chat Messages only after the assistant behavior is clearly defined.
7. Consider route-level or tab-level code splitting later to reduce the Vite chunk warning.

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
