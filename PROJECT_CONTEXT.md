# LifeOS Project Context

Last updated: 2026-05-14
Current branch: `main`
Recent context: Assistant now has an in-app Gemini planner backed by controlled server-side LifeOS tools.

## Project Goal

LifeOS is a high-density personal operating system for daily planning, health tracking, workout logging, finances, and an assistant-style review surface. The product direction is "Midnight Cyber-Athletics": a dark, command-center interface for personal performance with dense data, fast entry, and minimal visual noise.

The app should feel like a practical daily-use tool, not a marketing page. The current priority is turning one vertical slice at a time from realistic mock UI into persistent Supabase-backed workflows.

## Tech Stack

- React 18 functional components
- Vite 6
- Vite PWA support for installable app-shell caching
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
  - Mobile uses a compact sticky top header that respects `env(safe-area-inset-top)` in iPhone PWA standalone mode, plus fixed bottom tab navigation.
  - Sign out lives in the shell header, not in an individual tab.
  - Header/sidebar metrics use persisted health, workout, and expense state where available instead of mock finance/training values.
- `src/components/ui.jsx` contains shared UI primitives such as `Panel`, `PanelHeader`, `Tag`, `ProgressRing`, `Sparkline`, and `MiniMetric`.
- `src/services/lifeosApi.js` contains Supabase API wrappers.
- `src/lib/supabaseClient.js` creates the Supabase client from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- `api/actions/` contains token-protected Vercel Serverless Functions for external automation. These are server-only and use `SUPABASE_SERVICE_ROLE_KEY` with explicit `LIFEOS_ACTION_USER_ID` writes.
- `api/ai/chat.js` contains the in-app Gemini-powered LifeOS assistant endpoint. Gemini plans intent, while backend-controlled tools read/write Supabase.
- `src/data/lifeosData.js` contains remaining local mock data for legacy/unconverted surfaces, but the real Workout tab no longer displays a mock workout archive.
- Deployment docs live in `docs/DEPLOYMENT.md`, with deployed-app QA in `docs/QA_DEPLOYMENT.md`.
- Action API docs live in `docs/ACTION_API.md`.
- AI Assistant QA lives in `docs/QA_AI_ASSISTANT.md`.
- PWA/iPhone Home Screen QA lives in `docs/QA_PWA.md`.
- Focused Workout QA, including warmup behavior, lives in `docs/QA_WORKOUT.md`.
- Tab files live in `src/tabs/`:
  - `HomeTab.jsx`
  - `CalendarTab.jsx`
  - `MemosTab.jsx`
  - `ProjectsTab.jsx`
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

Vercel Action API server functions use server-only env vars:

```env
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
LIFEOS_ACTION_TOKEN=...
LIFEOS_ACTION_USER_ID=...
GEMINI_API_KEY=...
```

`SUPABASE_SERVICE_ROLE_KEY` must never be exposed through a `VITE_` variable or frontend code.
`GEMINI_API_KEY` is also server-only and must never be exposed through frontend code.

The schema is in `supabase/schema.sql`.

Current tables:

- `workouts`
- `workout_templates`
- `workout_template_exercises`
- `workout_sets`
- `health_logs`
- `expenses`
- `calendar_events`
- `memos`
- `projects`
- `project_sessions`
- `daily_reviews`
- `chat_messages`
- `ai_action_logs`

All tables have `user_id` columns defaulting to `auth.uid()` and referencing `auth.users(id) on delete cascade`.

RLS is enabled on all user tables. Current policies are user-scoped for authenticated users:

- Users can only read/write rows where `auth.uid() = user_id`.
- `workout_sets` also checks that the referenced `workouts` row belongs to the same authenticated user.
- `workout_template_exercises` also checks that the referenced `workout_templates` row belongs to the same authenticated user.

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
- Workout templates persisted in `workout_templates` with ordered exercises persisted in `workout_template_exercises`.
- Workout sets persisted in `workout_sets`.
- Workout session create/select/end/delete.
- Workout template create/edit/delete and template exercise add/edit/delete/reorder.
- Workout set create/edit/delete.
- Workout analytics are computed frontend-only from persisted workout/session data.
- Health daily logs persisted in `health_logs`.
- Health tab creates or updates one log per `user_id + logged_on` and shows persisted 7-day history/summaries.
- Expenses persisted in `expenses`.
- Finances tab creates, edits, deletes, and summarizes persisted user-scoped expenses.
- Home tab summarizes persisted calendar events, memos, workout sessions/sets, health logs, and expenses.
- Calendar events persisted in `calendar_events`.
- Calendar tab creates, edits, deletes, and displays persisted user-scoped events in a day-first agenda.
- Memos persisted in `memos`.
- Memos tab creates, edits, deletes, completes, dismisses, and reopens time/date-based reminders and memory items.
- Projects persisted in `projects`.
- Project work sessions persisted in `project_sessions`.
- Projects/Ops tab creates flexible-goal projects, tracks active/completed work sessions, proof of work, project-level cost, and progress.
- Daily reviews persisted in `daily_reviews`.
- Assistant tab contains the Ask LifeOS AI chat plus the persisted Daily Review workflow.
- Token-protected Action API endpoints for external automation:
  - `POST /api/actions/expense`
  - `POST /api/actions/health`
  - `POST /api/actions/calendar`
- In-app Gemini LifeOS assistant:
  - `POST /api/ai/chat`
  - `GET /api/ai/actions`
  - Assistant tab "Ask LifeOS" chat surface.
  - Assistant responses render through safe Markdown with controlled LifeOS callout tags.
  - Daily Review workflow remains available below the AI chat surface.
- AI Action History persisted in `ai_action_logs` for recent assistant/Shortcut writes and write failures.

Partially wired but not fully used in UI:

- `lifeosApi.js` has basic list/create/update/delete wrappers for `chat_messages`.
- The database schema and RLS support these tables.

Still mostly mock/local:

- Chat message persistence is not yet used as the main AI conversation store.
- The real Workout tab no longer displays mock workout examples or archives.

## PWA Current Status

LifeOS supports installation as a Progressive Web App for iPhone Home Screen and modern desktop/mobile browsers.

Current behavior:

- Uses `vite-plugin-pwa` with generated Workbox service worker support.
- Registers the service worker with auto-update behavior in production builds.
- Provides manifest metadata for `LifeOS`, standalone display, portrait orientation, dark theme/background colors, and productivity/health/finance categories.
- Provides generated PNG icons for 192px, 512px, maskable 192px, maskable 512px, and Apple touch icon usage.
- Adds iOS Home Screen metadata and `viewport-fit=cover` in `index.html`.
- Uses a safe-area-aware mobile shell header so the installed iPhone PWA does not overlap the status bar.
- Caches the built app shell and static assets only.
- Does not add runtime caching for `/api`, Supabase, Gemini, auth/session, or user-specific database responses.
- Does not store Supabase tokens or server-only secrets in service worker code.
- Supports opening the already-loaded app shell offline where the browser allows it.
- Does not implement full offline data sync, offline write queues, or cached personal data.

## Action API Current Status

The Action API is a minimal Vercel Serverless API for iPhone Shortcuts or other trusted external tools.

Current behavior:

- Requires `Authorization: Bearer <LIFEOS_ACTION_TOKEN>` on every request.
- Returns `401` for missing or incorrect tokens.
- Supports unauthenticated `OPTIONS` preflight with CORS headers for browser-based callers.
- Rejects non-POST/non-OPTIONS methods with JSON `405` responses.
- Limits JSON request bodies to 32kb and returns `413` when exceeded.
- Uses a consistent JSON response shape with `ok`, `requestId`, `data` on success, and `ok`, `requestId`, `error` on failure.
- Uses constant-time token comparison and never returns configured secret values.
- Uses `SUPABASE_SERVICE_ROLE_KEY` only inside `/api` serverless functions.
- Validates server-only config and requires `LIFEOS_ACTION_USER_ID` to be a UUID.
- Writes all rows with `user_id = LIFEOS_ACTION_USER_ID` because service-role access bypasses RLS.
- Supports creating expenses, upserting partial daily health logs, and creating calendar events.
- Expense categories created through the Action API normalize to canonical display casing when possible.
- Enforces endpoint field limits and numeric caps before writing to Supabase.
- Does not implement AI, chat behavior, external model calls, or frontend UI changes.
- Must be live-tested after setting Vercel env vars; local curl tests require the same server-only env vars.

## AI Assistant Current Status

`src/tabs/AIAssistantTab.jsx` now includes an in-app "Ask LifeOS" chat area above the persisted Daily Review workflow.

Architecture:

- Frontend sends only the raw message to `POST /api/ai/chat`.
- The frontend sends the current Supabase access token; the backend verifies it and ensures it matches `LIFEOS_ACTION_USER_ID`.
- The endpoint can also accept `Authorization: Bearer <LIFEOS_ACTION_TOKEN>` for trusted server/tool callers.
- Gemini receives no database credentials and cannot run SQL.
- Gemini first returns a strict JSON planner object.
- Backend tools perform controlled reads/writes through Supabase service-role access and always filter/write `user_id = LIFEOS_ACTION_USER_ID`.
- Gemini is called again to produce the final practical answer from the original message, plan, controlled context summary, and action results.
- Assistant replies render Markdown in the frontend for bold labels, lists, paragraphs, inline code, and code blocks.
- Raw HTML is not allowed or executed in assistant responses.
- The only supported styled response tags are `[good]`, `[warn]`, `[bad]`, `[info]`, and `[action]`; unknown tags render as ordinary text.
- Gemini provider failures are mapped to clean errors: rate limits, temporary outages, rejected requests, empty responses, and invalid planner JSON.
- Assistant error cards show safe request/provider details without exposing secrets.
- Expense, calendar, and health date handling accepts `YYYY-MM-DD`, `DD/MM/YY`, `DD/MM/YYYY`, `today`, and `tomorrow` where relevant.
- AI-created expense categories normalize to canonical display casing when possible, such as `subscriptions` to `Subscriptions`.
- AI-created calendar events normalize case-insensitive preferred categories such as `work`, `errands`, `personal`, or `social` to the UI category names when possible.
- AI and Action API calendar creates normalize common AM/PM and messy Gemini time fields such as `from 12:45pm`, `12:45pm to 2:15pm`, `2:15 pm`, `9am`, and contextual ranges like `3:45 to 5:30 pm` into stored `HH:MM`.
- Explicit multi-event calendar prompts are routed through a dedicated extraction/create path instead of the single-event tool. `create_calendar_event` is for one event only.
- Obvious explicit multi-event calendar schedules bypass the general Gemini planner before it runs because Gemini may return an array of single-event planner objects while the general planner schema expects one object.
- Explicit multi-event calendar creation does not require read/analysis context and returns a deterministic created/skipped summary.
- The explicit multi-event path still uses strict extraction, local fallback parsing, and deterministic success messages.
- Finite recurring calendar requests bypass the general planner before it runs, then expand into multiple normal `calendar_events` rows.
- Supported finite recurrence patterns include daily, weekdays, weekends, weekly days, every other day, every N days, next week, next month, named months, next N weeks/months, and explicit start date plus duration.
- Recurrence expansion is capped at 60 created events per request. Ambiguous recurrence requests ask one clarification instead of writing.
- AI health logging supports Daily Habits stored in `health_logs.hygiene`: Brush, Shower, Creatine, Skin, and Journal.
- AI habit updates merge with existing daily habit values. Brush, Shower, Creatine, and Skin are counts; Journal is boolean.
- Missing optional nullable health fields are ignored instead of being validated as invalid.
- Successful and failed AI write actions are logged to `ai_action_logs` with source, request id, action type/count, sanitized action metadata, record references, and safe error messages.
- AI Action History powers Home Recent AI Activity and the Assistant Recent Actions preview. It is action history only; undo is not implemented yet.
- AI Action History previews are compact and click-to-expand. Preview cards show source, status, time, deterministic action title, and action count without displaying the full raw request or response.
- AI Action History detail views show the full saved request, full saved response, action metadata, request id, record references, and sanitized action payloads. Saved assistant responses render with the same safe Markdown and LifeOS callout renderer used by chat messages.
- AI Action History titles are deterministic frontend formatting and do not trigger an extra AI call.
- `GET /api/ai/actions` returns recent action logs for the configured user after Supabase-session or action-token auth.
- AI write failures log sanitized requestId-based diagnostics in server logs. Setting `LIFEOS_DEBUG_AI=true` in a test deployment can include sanitized debug details in error responses.
- AI planner-stage failures also log sanitized requestId diagnostics before any write routing runs, including whether the message looks like an explicit multi-event calendar request and the detected time-range count.
- `LIFEOS_DEBUG_AI=true` is for test deployments only and can expose sanitized planner/write debug details in error responses.
- Expense amount validation tolerates currency wording/symbols such as `25 euro`, `€25`, `25 dollar`, `$25`, and comma decimals.
- Simple successful create expense, create calendar event, create memo, and update health log requests return deterministic success messages without a second Gemini answer call.
- Complex analysis and analyze-and-plan requests may still use multiple Gemini calls.

Supported v1 intents/tools:

- Analyze persisted LifeOS context across expenses, health logs, workouts/sets, calendar events, and daily reviews.
- Create expenses.
- Create single calendar events, explicit multi-event calendar schedules, and finite recurrence-expanded calendar schedules.
- Create memos for reminders, tasks, and memory items.
- Update provided daily health log fields.
- Analyze recent context and create a small non-overlapping calendar plan when the user explicitly asks to plan/schedule.
- Block destructive requests such as deleting records or mass updates.

Current limitations:

- No arbitrary SQL.
- No destructive writes.
- No multi-turn pending confirmation system yet.
- No external API integrations beyond Gemini.
- No frontend range/scope dropdowns; Gemini infers intent, range, and scope from natural language.
- `GEMINI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are server-only.

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
- Defaults the selected date to today and visually prioritizes the selected-day agenda.
- Uses a compact selected-day control card with date picker, Today shortcut, event count, and Plus button.
- Uses weekly range loading internally around the selected date, but the week board is not the primary UI.
- Creates and edits events through a modal instead of an always-visible side form.
- Calendar create/edit uses a full-screen editor on mobile to avoid iPhone Safari bottom-sheet input hitbox issues, while desktop/tablet keeps a centered dialog.
- The create/edit surface uses an iOS-safe scroll lock without body fixed-position offsets, keeps mobile sizing CSS-driven with `100dvh` to reduce keyboard close gaps, keeps the X close button visible, prevents horizontal overflow, and stacks paired fields on narrow screens.
- Creates, edits, and deletes events.
- Shows all events for the selected date as readable agenda cards.
- Agenda event cards support quick status changes for planned, done, skipped, and cancelled without opening the editor.
- Sorts timed events by start time, with untimed events after timed events.
- UI-created event categories are limited to Work, Study, School, Health, Workout, Errands, Personal, Social, Entertainment, and Sleep.
- Calendar categories remain text in Supabase for compatibility with older and externally created events.
- AI-created calendar events prefer the same category list and normalize common aliases such as gym, boxing, dentist, errands, family, friends, and journaling when possible.
- AI and Action API calendar creates normalize common AM/PM strings and messy Gemini time fields into canonical stored `HH:MM`, while the Calendar UI still uses native time inputs.
- Explicit AI multi-event schedules such as comma-separated study/lunch/errand blocks bypass the general planner, create separate calendar events, and support chained ambiguous ranges like `12:45-2:15, 2:15-2:30, 3:45-5:30pm`.
- AI finite recurrence commands do not create true recurring database events. They expand into multiple normal `calendar_events` rows.
- Supported recurrence wording includes daily, weekdays, weekends, weekly days, every other day, every N days, next week, next month, named months, next N weeks/months, and explicit start date plus duration.
- Recurrence expansion creates at most 60 events per request and asks for clarification when the date range, title, or time is missing.
- Category badges use consistent subtle color styling. Older unknown category strings remain display-compatible with neutral styling.
- Uses persisted calendar events only; mock planning data and AI triage were removed from the Calendar tab.
- Ignores stale week-range responses during fast week switching and clears calendar state on auth changes.
- Shows a specific setup error if the `calendar_events` migration has not been applied.
- Status is limited to `planned`, `done`, `skipped`, and `cancelled`.
- Does not store true recurring events; finite AI recurrence commands are expanded into normal individual events.
- Does not implement Google Calendar sync yet.
- Does not implement AI triage yet.

## Memos Module Current Status

`src/tabs/MemosTab.jsx` is Supabase-backed and mobile-first.

Current `memos` fields:

- `title`
- `memo_date`
- `memo_time`
- `notes`
- `status`

Current behavior:

- Memos are time/date-based reminders, tasks, and memory items. They are not a tags/categories notes system.
- Calendar remains for scheduled events and time blocks; Memos are not forced into `calendar_events`.
- Loads the current authenticated user's memos through RLS.
- Creates, edits, and deletes memos.
- Supports optional date, optional time, and optional notes.
- The Memos UI is a Reminder Timeline, not a stack of CRUD panels.
- The Memos mobile UI uses a compact header and slim stats strip so the timeline or empty state appears high on the page.
- The main page focuses on a unified visual timeline for open dated memos, with overdue, today, tomorrow, and future date headers inside one board.
- A Plus button opens the create editor; editing opens the same editor prefilled.
- Mobile create/edit uses a full-screen editor with explicit labels, one scroll path, safe-area padding, and a visible X close button.
- Desktop create/edit uses the same editor as a centered dialog.
- The editor supports quick date buttons for Today, Tomorrow, and Clear Date, plus quick time helpers for +1h, Tonight, and Clear Time.
- No-date memos appear as compact Floating Memos instead of a full equal-weight panel.
- Done and dismissed memos are secondary in a collapsed Completed / Dismissed section.
- Empty secondary panels are hidden. When there are no memos at all, the tab shows one unified `Memory queue clear` empty state.
- Open overdue memos receive a subtle warning treatment and timed reminders use stronger timeline dots.
- Memo statuses are `open`, `done`, and `dismissed`; done and dismissed memos can be reopened.
- Home surfaces due/next memos in Today Overview and a compact Memos panel.
- AI supports `create_memo` for reminder/task/memory prompts such as "remind me", "remember to", and "i gotta".
- AI memo creation resolves relative due times such as "in an hour" using Europe/Rome local time.
- AI-created memos are logged in AI Action History with `memos` record references.
- Push notifications are not implemented yet.
- Apple Notes sync is not implemented.

## Projects/Ops Module Current Status

`src/tabs/ProjectsTab.jsx` is Supabase-backed and mobile-first.

Current `projects` fields:

- `name`
- `status`
- `goal_type`
- `goal_label`
- `target_value`
- `current_value`
- `unit_label`
- `overall_cost`
- `started_on`
- `notes`

Current `project_sessions` fields:

- `project_id`
- `started_at`
- `ended_at`
- `duration_minutes`
- `target_output`
- `proof_of_work`
- `progress_delta`

Current behavior:

- Projects are execution trackers for serious work, not only timers.
- Supported project statuses are `active`, `paused`, `completed`, and `archived`.
- Supported goal types are `hours`, `units`, `tasks`, `content`, and `custom`.
- For `hours` projects, progress is calculated from total logged session duration against `target_value`.
- For non-hour projects, progress is calculated from `current_value / target_value`.
- Work sessions are tracked for every project as effort/proof of work, regardless of goal type.
- A project can have an active session with `target_output`; active sessions survive refresh because they are persisted with `ended_at` null.
- Ending a session stores `duration_minutes`, `proof_of_work`, and optional `progress_delta`.
- For non-hour projects, positive `progress_delta` increments `current_value` when the session ends.
- The UI prefers one active project session globally in v1 and prevents starting another while one is open.
- New/edit project uses a modal/sheet with mobile full-screen behavior and desktop centered dialog behavior.
- Project detail shows progress, remaining target, total hours, this-week hours, total sessions, overall cost, active/resume session, manual non-hour progress, and recent sessions.
- Home surfaces a compact Ops status with active session, project work today, active project count, and latest project.
- Project cost is stored only as `overall_cost` at the project level.
- No per-session money spent/gained fields are implemented.
- No project revenue, AI OFM templates, output counters, metrics snapshots, badges, streaks, or pace predictor are implemented yet.
- AI project planning/session logging is not implemented yet.

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
- Selected-date workout context counts working sets and working volume, excluding warmups.
- Keeps one empty next-action input row in the UI when all actions are removed, while saving an empty `next_actions` array.
- Does not save context summaries redundantly into the review.
- Does not implement AI behavior yet.

## Home Module Current Status

`src/tabs/HomeTab.jsx` is now a Today Command Center.

Current behavior:

- Uses persisted calendar events, memos, project sessions, health logs, workout sessions/sets, and expenses from context.
- Loads today's calendar range and the current expense month without duplicating API wrappers.
- Shows a compact Today Overview with next event, agenda counts, daily habit completion, memo count, workout status, project/Ops status, and today's spend.
- Shows Today Agenda as a read-only list of today's events. Calendar editing, deletion, and status controls remain in the Calendar tab.
- Shows a compact Memos panel with overdue/today reminders or the next open memo. Memo editing remains in the Memos tab.
- Sorts timed agenda events before untimed events and visually de-emphasizes cancelled events.
- Shows Daily Habits from today's health log: Brush, Shower, Creatine, Skin, and Journal. Journal is shown as yes/no and Water is not shown.
- Shows Training Status focused on whether a workout is live/completed today, today's session name, working sets, volume, and exercise count.
- Workout set and volume summaries exclude warmup sets.
- Shows Ops Status focused on live project sessions, today's logged project work, active project count, and latest project.
- Shows Money Snapshot with today's spend, month spend, top category, and latest expense.
- Shows Recent AI Activity from persisted `ai_action_logs`, including compact app/shortcut source, status, time, action type/count, and click-through details.
- Avoids duplicate finance ledger surfaces such as a full latest-expenses panel or large Home chart; the Finances tab owns deeper ledger views.
- Shows compact loading and empty states with user-facing wording.
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
- Server-created expense categories from AI and the Action API use canonical display casing when possible.
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
- A selected non-today Health date remains stable during background health-log refreshes.
- Shows compact 7-day history from persisted rows only.
- Shows measurable summaries: average sleep, average energy, total coffee, total ADC, and standalone daily habit stats.
- Does not auto-calculate sleep time; `sleep_hours` is manually entered.
- `sleep_quality`, `mood`, `social_time_minutes`, and `main_time_waster` remain in the database for backward compatibility but are not displayed in the Health check-in, 7-day summary, or 7-day history.
- `sleep_hours` and `energy` may be left blank; coffee, ADC, and numeric habit counts must be non-negative numbers.
- Visible Health no longer includes a Water counter. The `water` column remains in the schema and Action API for backward compatibility, but visible UI and AI summaries do not emphasize it.
- Daily habit trackers are Brush, Shower, Creatine, Skin, and Journal.
- Brush, Shower, Creatine, and Skin are numeric counts. Journal is boolean: journaled or not journaled.
- Habits are stored in the existing `hygiene` JSON field. Older boolean rows and older numeric Journal rows are normalized safely; old Floss/Stretch rows are ignored by the new visible UI.
- AI health habit logging writes to the same `hygiene` JSON field and merges habit-only updates with existing daily values.
- Missing optional nullable health fields such as `sleep_hours`, `sleep_start`, and `wake_time` are ignored by backend validation unless explicitly provided.
- Health and AI summaries treat habits as standalone stats instead of one generic hygiene total.
- Does not use iPhone Screen Time integration yet.

## Workout Module Current Status

`src/tabs/WorkoutTab.jsx` has been refactored into smaller components:

- `ActiveWorkoutHeader`
- `WorkoutSessionControl`
- `SetLogger`
- `TemplatePlanCard`
- `PreviousPerformanceCard`
- `TodaySetsLog`
- `ExerciseHistoryPanel`

Current behavior:

- Assumes the user is already authenticated by the global app gate.
- Loads persisted workout sessions with nested sets.
- Loads persisted workout templates with ordered template exercises.
- The Workout tab is state-based:
  - No active session: Start Workout is the first visible card, with template starts first, Start Empty Workout secondary, and advanced controls collapsed.
  - Active session: the active header, optional Exercise Plan, Set Logger, Logged Sets, compact current-workout controls, and lower-priority Exercise History are shown.
- No active-session state hides the active workout header, rest timer, zero set/volume metrics, Set Logger, and Logged Sets panels.
- Uses templates as the primary way to start a workout. The first question in Session Control is what the user is training today.
- Starting from a template creates a new `workouts` row for today named after the template, with `#2`, `#3`, etc. suffixes when needed to avoid same-day duplicate names.
- Starting from a template does not create any `workout_sets`.
- A local `Exercise Plan` shows ordered template exercises near the logger. Tapping an exercise fills the Exercise input only.
- Template exercises are local planning guidance inside the active workout; they do not affect volume, PRs, previous performance, estimated 1RM, Exercise History, or other analytics until sets are saved.
- Starting empty remains available as a secondary action and creates a blank session named `Today Workout` or a user-provided name.
- Template management is collapsed inside Workout and supports create/edit/delete templates plus add/edit/delete/reorder template exercises.
- Template management shows clear validation/duplicate-name messages and compacts exercise order after deleting an exercise.
- Advanced session switching and delete session controls are collapsed away from the primary logging flow.
- On load, Workout auto-selects today's session when one exists; older sessions remain available from Advanced instead of hiding the template start prompt.
- Ended sessions cannot use the local rest timer.
- Ended sessions cannot add or edit sets. The logger shows: "This workout is ended. Reopen it to add more sets."
- Ended sessions can be reopened from Session Control, which sets `ended_at` back to `null`.
- Deleting a session requires confirmation and cascades sets through the database relationship.
- Sets belong to workout sessions.
- Sets include exercise, set number, warmup flag, weight, reps, RPE, performed date/time, and notes.
- Warmup sets are stored in `workout_sets.is_warmup`, display as repeated `W` rows before working sets, and do not increment the next working set number.
- Next working set number is automatic based on selected session plus exercise and ignores warmups.
- Editing between warmup and working status resolves to a non-conflicting internal set number.
- Weight and RPE parsing accepts both comma and dot decimals.
- Validation runs before insert/update for exercise, weight, reps, RPE, and date.
- Today's active session sets are shown immediately under the logger, grouped by exercise.
- Active session logs keep exercises ordered by first logged, with sets displayed as warmups first, then Set 1, Set 2, Set 3.
- Other sessions are kept visually separate/collapsed in history.
- Workout displays persisted/template data only; the previous mock workout archive was removed from the tab.
- Login/register controls are intentionally absent from the Workout tab.

Workout analytics are frontend-only:

- Previous performance for selected exercise from the most recent prior workout session.
- Previous heaviest set, best volume set, estimated 1RM, total exercise volume, last weight/reps/RPE, and date.
- PR detection for weight PR, reps PR, set volume PR, and session-volume PR.
- Estimated 1RM uses the Epley formula: `weight * (1 + reps / 30)`.
- Exercise History groups persisted sets by exercise and shows progression over time, including total session volume and best estimated 1RM trend.
- Warmup sets are excluded from PR detection, previous performance, estimated 1RM trends, exercise volume, and active working volume.

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
- Mobile has a fixed bottom tab bar with Home, Calendar, Memos, Projects/Ops, Health, Workout, Finances, and Assistant.
- Mobile content is full width with smaller padding and safe-area bottom padding.
- Header metrics and sidebar pips are hidden on mobile.

Workout mobile direction:

- Prioritize fast set logging at the gym.
- Active workout header is compact and sticky on mobile with `top-[calc(env(safe-area-inset-top)+56px)]`, matching the safe-area-aware shell header.
- Desktop keeps the workout header non-sticky with `md:static`.
- Rest timer is compact and visible near the top.
- Exercise input is full-width.
- Weight, reps, and RPE use a compact mobile grid.
- Save Set is full-width and at least 48px tall.
- Numeric inputs use `inputMode` to prevent poor mobile keyboard behavior.
- Font sizes in inputs should stay at least 16px to avoid iOS zoom.
- Session Control and Exercise History are collapsed by default on mobile where appropriate, except no-session Start Workout content opens immediately.
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
  - Confirm ADC and Daily Habits persist.
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
  - Confirm the selected-day agenda defaults to today and date picker navigation works.
  - Confirm create/edit modals work and categories display correctly.
  - Refresh and confirm events persist.
  - Confirm another user cannot see the first user's events.
  - Confirm iPhone Safari has no horizontal overflow and controls remain thumb-friendly.
- Run the full-app checklist in `docs/QA_FULL_APP.md` after major integration changes.
- Run `docs/QA_PWA.md` after deploying PWA changes:
  - Confirm the manifest and service worker load over HTTPS.
  - Confirm iPhone Safari can add LifeOS to the Home Screen.
  - Confirm the installed app header sits below the iPhone time/Wi-Fi/battery area.
  - Confirm the installed app opens standalone and keeps the Calendar mobile editor stable.
  - Confirm Supabase, `/api`, Gemini, and auth responses are not cached by the service worker.
- Run deployment setup from `docs/DEPLOYMENT.md` and live deployed QA from `docs/QA_DEPLOYMENT.md` before external API automation work.
- Run `docs/ACTION_API.md` manual QA after deploying Action API env vars:
  - Unauthorized requests return `401`.
  - Preflight requests return `204`.
  - Wrong methods return `405`.
  - Oversized JSON payloads return `413`.
  - Invalid payloads return clear `400` errors.
  - Expense, Health, and Calendar action-created rows appear only for `LIFEOS_ACTION_USER_ID`.
- Run `docs/QA_AI_ASSISTANT.md` after deploying `GEMINI_API_KEY`:
  - Natural-language analysis uses persisted context only.
  - Low-risk additive actions execute directly.
  - Destructive requests are blocked.
  - Daily Review remains usable.
- Test workout session creation with RLS enabled in a real Supabase project.
- Test Workout tab with `docs/QA_WORKOUT.md`, especially template CRUD/start flow, warmup display/edit transitions, and analytics exclusion.
- Test Workout templates after applying the latest `workout_templates` and `workout_template_exercises` schema migration.
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
9. Live-test Action API calls from iPhone Shortcuts before relying on external automation.
10. Live-test the Gemini in-app assistant with `docs/QA_AI_ASSISTANT.md`.
11. Convert Chat Messages only after assistant transcript persistence is clearly defined and live QA has passed.
12. Consider route-level or tab-level code splitting later to reduce the Vite chunk warning.

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
