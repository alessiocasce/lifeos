# LifeOS Project Context

Last updated: 2026-06-14
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
- Top-level tabs use lightweight URL-based routing without React Router. Refreshing `/workout`, `/memos`, `/projects`, `/calendar`, and other tab paths preserves the active tab.
- Canonical tab paths are `/`, `/calendar`, `/memos`, `/projects`, `/health`, `/workout`, `/finances`, and `/assistant`.
- Alias paths are supported: `/home` and `/pulse` open Home, `/ops` opens Projects, `/money` opens Finances, and `/ai` opens Assistant.
- `vercel.json` rewrites non-API routes to the SPA entry while preserving `/api` serverless routes.
- Major tab components except Home are lazy-loaded with `React.lazy`/`Suspense` to reduce the initial bundle.
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
- `api/_utils/date.js` is the shared backend source for Europe/Rome local date/time defaults. Backend code must not use UTC ISO slicing for user-facing "today" behavior.
- `api/_utils/health.js` owns persisted sleep-hour recalculation from the previous day's `sleep_start` and the current day's `wake_time`.
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
- `project_money_entries`
- `daily_reviews`
- `chat_messages`
- `ai_action_logs`
- `ai_chat_threads`
- `ai_chat_messages`
- `ai_memories`
- `ai_insights`

All tables have `user_id` columns defaulting to `auth.uid()` and referencing `auth.users(id) on delete cascade`.

RLS is enabled on all user tables. Current policies are user-scoped for authenticated users:

- Users can only read/write rows where `auth.uid() = user_id`.
- `workout_sets` also checks that the referenced `workouts` row belongs to the same authenticated user.
- `workout_template_exercises` also checks that the referenced `workout_templates` row belongs to the same authenticated user.
- `project_sessions` and `project_money_entries` also check that the referenced `projects` row belongs to the same authenticated user.
- `ai_chat_messages` also checks that the referenced `ai_chat_threads` row belongs to the same authenticated user.

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
- Project money entries persisted in `project_money_entries`.
- Projects/Ops tab creates flexible-goal projects, tracks active/completed work sessions, proof of work, project-level money entries, calculated balance, and progress.
- Daily reviews persisted in `daily_reviews`.
- Brain persists user-scoped chat threads/messages, uses curated long-term memories as bounded AI context, and keeps Recent Actions available as a secondary surface.
- Brain exposes a collapsible `What LifeOS Knows` panel where active memories can be reviewed, edited, or archived.
- Daily Review remains persisted for backward compatibility but is hidden from Brain.
- Token-protected Action API endpoints for external automation:
  - `POST /api/actions/expense`
  - `POST /api/actions/health`
  - `POST /api/actions/wake`
  - `POST /api/actions/sleep-start`
  - `POST /api/actions/habit`
  - `POST /api/actions/calendar`
- In-app Gemini LifeOS assistant:
  - `POST /api/ai/chat`
  - `GET /api/ai/actions`
  - Persistent Brain chat with thread selection and New Chat.
  - Assistant responses render through safe Markdown with controlled LifeOS callout tags.
  - Brain stays focused on assistant chat and Recent Actions; canned suggestions and Daily Review UI are not rendered.
- AI Action History persisted in `ai_action_logs` for recent assistant/Shortcut writes and write failures.
- Durable Brain memory persisted in `ai_memories`; saved observations are kept separately in `ai_insights`.
- Meaningful conversations can extract a small number of durable memory/insight candidates. Simple logs and one-off writes skip extraction.

Still mostly mock/local:

- The real Workout tab no longer displays mock workout examples or archives.

## PWA Current Status

LifeOS supports installation as a Progressive Web App for iPhone Home Screen and modern desktop/mobile browsers.

Current behavior:

- Uses `vite-plugin-pwa` with generated Workbox service worker support.
- Registers the service worker explicitly in production so app updates can be applied through the in-app safety guard.
- Provides manifest metadata for `LifeOS`, standalone display, portrait orientation, dark theme/background colors, and productivity/health/finance categories.
- Provides generated PNG icons for 192px, 512px, maskable 192px, maskable 512px, and Apple touch icon usage.
- Adds iOS Home Screen metadata and `viewport-fit=cover` in `index.html`.
- Uses a safe-area-aware mobile shell header so the installed iPhone PWA does not overlap the status bar.
- Caches the built app shell and static assets only.
- Keeps app-shell navigation fallback compatible with top-level tab URLs while denying `/api` fallback.
- Does not add runtime caching for `/api`, Supabase, Gemini, auth/session, or user-specific database responses.
- Does not store Supabase tokens or server-only secrets in service worker code.
- Supports opening the already-loaded app shell offline where the browser allows it.
- Does not implement full offline data sync, offline write queues, or cached personal data.
- Mobile/iPhone PWA supports pull-to-refresh from the top of the app content.
- Pull-to-refresh physically translates the tab content downward with resisted, Safari-like feedback, holds it slightly lowered while refreshing, then smoothly snaps it back.
- One pull globally reloads health, workouts/templates, expenses, calendar, memos, projects/sessions/money entries, Brain threads/current messages/memories/insights, and recent AI actions.
- Pull-to-refresh also asks the service worker to check for a newly deployed app version.
- A waiting app update activates and reloads automatically when there is no meaningful unsaved work.
- A complete unsaved Workout set or meaningful Project session draft blocks only the app reload; persisted data still refreshes and the indicator asks the user to save first.
- Incomplete half-written fields are intentionally not protected by the app-update guard.
- Pull-to-refresh is touch/mobile focused, ignores form controls and open dialogs, and is disabled on desktop.
- The shell header and fixed mobile bottom navigation remain stable while only the main tab content moves.

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
- Supports creating expenses, upserting partial daily health logs, logging wake/sleep-start times, logging time-aware habits, and creating calendar events.
- The dedicated wake endpoint accepts `time`, `wake_time`, or `wakeTime`, defaults `logged_on` to the Europe/Rome local date, preserves other health fields, and recalculates persisted `sleep_hours` when the previous day's sleep start exists.
- `POST /api/actions/sleep-start` accepts `time`, `sleep_start`, or `sleepStart`. When no date is supplied, before-noon times are assigned to the previous Europe/Rome date so the following wake log can calculate sleep correctly.
- The sleep-start endpoint recalculates the following day's `sleep_hours` when a wake time already exists.
- `POST /api/actions/habit` updates Shower, Creatine, or Skin without Gemini. It accepts Italian aliases such as `doccia` and `creatina`, defaults to Europe/Rome date/time, and increments by one unless set mode is requested.
- Time-aware habits use `health_logs.hygiene` entries such as `{ "count": 1, "times": ["09:37"] }`.
- Legacy numeric, boolean, array, Brush, Journal, and unknown hygiene data remains readable and is preserved during tracked-habit updates.
- Expense categories created through the Action API normalize to canonical display casing when possible.
- Enforces endpoint field limits and numeric caps before writing to Supabase.
- Does not implement AI, chat behavior, external model calls, or frontend UI changes.
- Must be live-tested after setting Vercel env vars; local curl tests require the same server-only env vars.

## AI Assistant Current Status

`src/tabs/AIAssistantTab.jsx` is a persistent Brain chat surface with thread controls, long-term memory, and secondary Recent Actions.

Architecture:

- Frontend sends the raw message and active `thread_id` to `POST /api/ai/chat`.
- The frontend sends the current Supabase access token; the backend verifies it and ensures it matches `LIFEOS_ACTION_USER_ID`.
- The endpoint can also accept `Authorization: Bearer <LIFEOS_ACTION_TOKEN>` for trusted server/tool callers.
- App chat requests append user/assistant messages to `ai_chat_messages`; Shortcut/API calls do not create personal chat history by default.
- Threads are titled deterministically from the first meaningful user message without an extra Gemini title call.
- The backend includes a bounded recent-thread history block so follow-up messages retain conversation context.
- Active memories are loaded by importance/update time and recent insights are loaded separately. Both are advisory context and never permission to perform a write.
- Meaningful conversations may run a strict memory extractor after the main response. Extraction failure is isolated and never fails the chat response.
- Memory deduplication uses normalized title/category/key-term overlap; no vector database is used in v1.
- Explicit `remember that ...` requests confirm memory capture, memory recall requests summarize active memories, and ambiguous forget requests direct the user to the memory panel.
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
- All backend default dates and relative `today`/`tomorrow` references use Europe/Rome local time through the shared date helper.
- AI-created expense categories normalize to canonical display casing when possible, such as `subscriptions` to `Subscriptions`.
- AI-created calendar events normalize case-insensitive preferred categories such as `work`, `errands`, `personal`, or `social` to the UI category names when possible.
- AI and Action API calendar creates normalize common AM/PM and messy Gemini time fields such as `from 12:45pm`, `12:45pm to 2:15pm`, `2:15 pm`, `9am`, and contextual ranges like `3:45 to 5:30 pm` into stored `HH:MM`.
- Explicit multi-event calendar prompts are routed through a dedicated extraction/create path instead of the single-event tool. `create_calendar_event` is for one event only.
- Obvious explicit multi-event calendar schedules bypass the general Gemini planner before it runs because Gemini may return an array of single-event planner objects while the general planner schema expects one object.
- Explicit multi-event calendar creation does not require read/analysis context and returns a deterministic created/skipped summary.
- The explicit multi-event path still uses strict extraction, local fallback parsing, and deterministic success messages.
- Obvious Italian or English day-agenda requests with mixed point times and time ranges bypass the general planner through a dedicated day-schedule extraction path.
- Day-schedule point items receive short deterministic durations: wake-up 15 minutes, lunch 30 minutes, dinner 45 minutes, and other point items 30 minutes.
- The day-schedule path has a local parser for comma-separated Italian/English agendas, decimal-dot times, point events, and ranges. It allows explicitly requested overlaps instead of dropping an item.
- Finite recurring calendar requests bypass the general planner before it runs, then expand into multiple normal `calendar_events` rows.
- Supported finite recurrence patterns include daily, weekdays, weekends, weekly days, every other day, every N days, next week, next month, named months, next N weeks/months, and explicit start date plus duration.
- Recurrence expansion is capped at 60 created events per request. Ambiguous recurrence requests ask one clarification instead of writing.
- Workout analysis and advice prompts are read-only unless the user explicitly asks to create or schedule a calendar item. A deterministic post-planner guard prevents accidental calendar writes for exercise-performance questions.
- Brain memory and conversation history do not override deterministic write guards. Calendar/memo/health/expense/recurrence writes still require the same explicit supported intent.
- AI health logging supports time-aware Daily Habits stored in `health_logs.hygiene`: Shower, Creatine, and Skin.
- AI habit updates merge with existing daily values and attach an explicit or current Europe/Rome time. Brush and Journal remain legacy-only and are no longer shown or updated.
- AI prefers `sleep_start` and `wake_time`; when both required times exist, automatic sleep calculation overrides a manual duration.
- Missing optional nullable health fields are ignored instead of being validated as invalid.
- Successful and failed AI write actions are logged to `ai_action_logs` with source, request id, action type/count, sanitized action metadata, record references, and safe error messages.
- AI Action History powers Home Recent AI Activity and the Assistant Recent Actions preview. It is action history only; undo is not implemented yet.
- AI Action History previews are compact and click-to-expand. Preview cards show source, status, time, deterministic action title, and action count without displaying the full raw request or response.
- AI Action History detail views show the full saved request, full saved response, action metadata, request id, record references, and sanitized action payloads. Saved assistant responses render with the same safe Markdown and LifeOS callout renderer used by chat messages.
- AI Action History titles are deterministic frontend formatting and do not trigger an extra AI call.
- `GET /api/ai/actions` returns recent action logs for the configured user after Supabase-session or action-token auth.
- AI write failures log sanitized requestId-based diagnostics in server logs. Setting `LIFEOS_DEBUG_AI=true` in a test deployment can include sanitized debug details in error responses.
- AI planner-stage failures also log sanitized requestId diagnostics before any write routing runs, including whether the message looks like an explicit multi-event or day-schedule calendar request and the detected item/time-range counts.
- `LIFEOS_DEBUG_AI=true` is for test deployments only and can expose sanitized planner/write debug details in error responses.
- Expense amount validation tolerates currency wording/symbols such as `25 euro`, `€25`, `25 dollar`, `$25`, and comma decimals.
- Simple successful create expense, create calendar event, create memo, and update health log requests return deterministic success messages without a second Gemini answer call.
- Complex analysis and analyze-and-plan requests may still use multiple Gemini calls.
- Proactive Morning Briefings, voice, external email/messaging, and autonomous dangerous/unconfirmed actions are not implemented in this phase.

Supported v1 intents/tools:

- Analyze persisted LifeOS context across expenses, health logs, workouts/sets, calendar events, and daily reviews.
- Create expenses.
- Create single calendar events, mixed point/range day schedules, explicit multi-event calendar schedules, and finite recurrence-expanded calendar schedules.
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
- `overall_cost` remains for backward compatibility but is not the main UI money source
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

Current `project_money_entries` fields:

- `project_id`
- `type`
- `amount`
- `description`
- `entry_date`

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
- New/edit project does not ask for a static total cost.
- Project overview cards are simplified around project name, status, goal type, progress, percentage, and sessions count. They do not show Total Hours, This Week, or Cost metric boxes.
- Project detail shows progress, remaining target, total hours, this-week hours, total sessions, active/resume session, manual non-hour progress, recent sessions, and a dedicated Project Balance widget.
- Project money is managed through project-level `project_money_entries`, not sessions.
- Project Balance is calculated as total revenue minus total expenses.
- Balance entries can be expenses or revenue, with amount, description, and entry date.
- Home surfaces a compact Ops status with active session, project work today, active project count, and latest project.
- No per-session money spent/gained fields are implemented.
- No AI OFM templates, output counters, metrics snapshots, badges, streaks, or pace predictor are implemented yet.
- AI project planning/session logging is not implemented yet.

## Daily Review Module Current Status

Daily Review persistence and context actions remain for backward compatibility, but the workflow is no longer rendered in Brain.

Current behavior:

- Loads the current authenticated user's `daily_reviews` rows through RLS.
- Defaults to today's review date.
- Creates a review when none exists for `review_on`.
- Updates the existing review when one already exists for `review_on`.
- Uses duplicate-key recovery by fetching the existing date row and updating it.
- Supports selecting another review date and loading that date's persisted review.
- Stores `next_actions` as a JSON array of strings.
- Validates optional `score` as a whole number from 1 to 100.
- Does not save context summaries redundantly into the review.
- The `daily_reviews` table and existing service/context support are not deleted.

## Home Module Current Status

`src/tabs/HomeTab.jsx` is now a Today Command Center.

Current behavior:

- Uses persisted calendar events, memos, project sessions, health logs, workout sessions/sets, and expenses from context.
- Loads today's calendar range and the current expense month without duplicating API wrappers.
- Shows a compact Today Overview with next event, agenda counts, daily habit completion, memo count, workout status, project/Ops status, and today's spend.
- Shows Today Agenda as a read-only list of today's events. Calendar editing, deletion, and status controls remain in the Calendar tab.
- Shows a compact Memos panel with overdue/today reminders or the next open memo. Memo editing remains in the Memos tab.
- Sorts timed agenda events before untimed events and visually de-emphasizes cancelled events.
- Shows time-aware Daily Habits from today's health log: Shower, Creatine, and Skin. Cards show count and latest time; Brush, Journal, and Water are not shown.
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
- Health field changes autosave; there is no manual Save/Update Check-In button.
- Wake Time and Sleep Start save on blur or Enter once valid. Notes save on blur, while Coffee, ADC, and habit controls save immediately.
- Autosave uses serialized, field-level patches tied to the selected date so quick changes and date switching do not overwrite unrelated or newer values.
- The Health header shows compact Saving, Saved, Unsaved changes, or Failed to save feedback.
- Shows compact 7-day history from persisted rows only.
- Shows measurable summaries for calculated sleep, coffee, ADC, and standalone daily habit stats.
- `sleep_hours` is display-only in Health and is calculated from the previous calendar day's `sleep_start` plus the current day's `wake_time`.
- Wake Time appears before Sleep Start. Sleep Start is labeled as affecting the following morning, while calculated Sleep Hours explains its previous-day sleep-start relationship.
- Calculated sleep is rounded to the nearest 0.5 hour. Missing or nonsensical durations remain unavailable instead of being stored.
- `sleep_quality`, `mood`, `social_time_minutes`, and `main_time_waster` remain in the database for backward compatibility but are not displayed in the Health check-in, 7-day summary, or 7-day history.
- `energy` remains in the database for backward compatibility but is hidden from Health and Home.
- Coffee, ADC, and numeric habit counts must be non-negative numbers.
- Visible Health no longer includes a Water counter. The `water` column remains in the schema and Action API for backward compatibility, but visible UI and AI summaries do not emphasize it.
- Daily habit trackers are Shower, Creatine, and Skin.
- Each visible habit stores a count plus canonical `HH:MM` timestamps in the existing `hygiene` JSON field.
- Health increments append the current Europe/Rome time; decrements remove the latest timestamp when present.
- Legacy numeric/boolean/array hygiene values normalize safely. Brush, Journal, Floss, Stretch, and unknown keys remain untouched but are not visible or updated.
- AI health habit logging writes to the same `hygiene` JSON field and merges habit-only updates with existing daily values.
- Missing optional nullable health fields such as `sleep_hours`, `sleep_start`, and `wake_time` are ignored by backend validation unless explicitly provided.
- Health UI saves, AI health writes, `/api/actions/health`, and `/api/actions/wake` recalculate affected sleep hours when sleep start or wake time changes.
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

Current behavior:

- Assumes the user is already authenticated by the global app gate.
- Loads persisted workout sessions with nested sets, `template_id`, and `template_snapshot`.
- Loads persisted workout templates with ordered template exercises.
- The Workout tab is state-based:
  - No active session: Start Workout is the first visible card, with template starts first, Start Empty Workout secondary, and advanced controls collapsed.
  - Active session: the active command header, optional persisted Exercise Plan, Set Logger, current-session Logged Sets, and secondary session/template controls are shown.
- No active-session state hides the active workout header, Set Logger, and Logged Sets panels.
- Uses templates as the primary way to start a workout. The first question in Session Control is what the user is training today.
- Starting from a template creates a new `workouts` row for today named after the template, with `#2`, `#3`, etc. suffixes when needed to avoid same-day duplicate names.
- Starting from a template stores `template_id` plus an ordered `template_snapshot` on the workout row.
- The template snapshot keeps the active exercise plan stable after refresh/backgrounding and after later template edits.
- Starting from a template does not create any `workout_sets`.
- The persisted `Exercise Plan` shows ordered template exercises near the logger. Tapping an exercise fills the Exercise input.
- Starting empty remains available as a secondary action and creates a blank session named `Today Workout` or a user-provided name.
- Template management is collapsed inside Workout and supports create/edit/delete templates plus add/edit/delete/reorder template exercises.
- Template management shows clear validation/duplicate-name messages and compacts exercise order after deleting an exercise.
- Advanced session switching and delete session controls are collapsed away from the primary logging flow.
- On load, Workout prefers the latest unfinished session, then falls back to today's session.
- End Workout or Reopen is immediately visible in the active workout command header.
- Ended sessions cannot add or edit sets. The logger shows: "This workout is ended. Reopen it to add more sets."
- Ended sessions can be reopened from the active workout command header, which sets `ended_at` back to `null`.
- Deleting a session requires confirmation and cascades sets through the database relationship.
- Sets belong to workout sessions.
- Sets include exercise, internal set number, warmup flag, weight, reps, optional RPE, performed timestamp, and notes.
- RPE is nullable. Blank RPE is stored as `null` and displayed as `RPE --`.
- Set logging does not show a date field; new sets use the current timestamp.
- Warmup sets are stored in `workout_sets.is_warmup`, display as repeated `W` rows before working sets, and do not increment the next working set number.
- Warmup set numbers may use an internal 1000 offset, but that offset never appears in the UI.
- Next working set number is automatic, ignores warmups and malformed high working-set numbers, and is recomputed when toggling out of warmup mode and before save.
- Editing between warmup and working status resolves to a non-conflicting internal set number.
- Weight and RPE parsing accepts both comma and dot decimals.
- Validation runs before insert/update for exercise, weight, reps, and optional RPE.
- The Exercise field suggests names from the current template snapshot, all templates, and prior logged sets.
- Current active-session sets are shown immediately under the logger, grouped by exercise.
- Active session logs keep exercises ordered by first logged, with sets displayed as warmups first, then Set 1, Set 2, Set 3.
- Active workout UI does not show the rest timer, PR flags, volume/count summaries, dates, or Other Sessions.
- Previous performance is reduced to compact Heaviest and estimated 1RM values.
- Deeper workout analysis is intentionally deferred to a separate analysis surface later.
- Workout displays persisted/template data only; the previous mock workout archive was removed from the tab.
- Login/register controls are intentionally absent from the Workout tab.

## Mobile/iPhone UI Direction

The app shell is now mobile-first while preserving desktop:

- Desktop/tablet keeps the fixed left sidebar and full header metrics.
- Mobile hides the sidebar and uses a compact native-app style shell.
- Mobile has a fixed bottom tab bar with Home, Calendar, Memos, Projects/Ops, Health, Workout, Finances, and Assistant.
- Mobile content is full width with smaller padding and safe-area bottom padding.
- Header metrics and sidebar pips are hidden on mobile.

Workout mobile direction:

- Prioritize fast set logging at the gym.
- The active workout command header stays in normal document flow on mobile and desktop.
- Workout does not add a second sticky safe-area offset below the shell header, so it does not create blank space or overlap the Exercise Plan, Set Logger, or Logged Sets.
- The Workout root uses horizontal clipping instead of a sticky-breaking hidden overflow container.
- End Workout/Reopen remains visible in the active header without scrolling.
- Exercise input is full-width.
- Exercise suggestions are thumb-friendly and fill the logger when tapped.
- Weight, reps, and RPE use a compact mobile grid.
- Save Set is full-width and at least 48px tall.
- Numeric inputs use `inputMode` to prevent poor mobile keyboard behavior.
- Font sizes in inputs should stay at least 16px to avoid iOS zoom.
- Secondary session/template controls are collapsed by default on mobile, while no-session Start Workout content opens immediately.
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
  - Change another field in today's log and confirm autosave updates instead of duplicating.
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
- Daily Review persistence remains available for backward compatibility, but it is no longer a visible Brain workflow.
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
  - Expense, Health, Wake, Sleep Start, Habit, and Calendar action-created rows appear only for `LIFEOS_ACTION_USER_ID`.
- Run `docs/QA_AI_ASSISTANT.md` after deploying `GEMINI_API_KEY`:
  - Natural-language analysis uses persisted context only.
  - Low-risk additive actions execute directly.
  - Destructive requests are blocked.
  - Workout analysis/advice remains read-only unless calendar creation is explicit.
  - Brain shows chat and Recent Actions without Daily Review or suggestion chips.
- Test workout session creation with RLS enabled in a real Supabase project.
- Test Workout tab with `docs/QA_WORKOUT.md`, especially template snapshot persistence, nullable RPE, suggestions, and warmup display/edit transitions.
- Test Workout after applying the latest `workouts`, `workout_sets`, `workout_templates`, and `workout_template_exercises` schema migration.
- Test deleting a workout session and confirm associated sets disappear.
- Test editing sets with comma decimals such as `32,5` and `8,5`.
- Test duplicate set number behavior for the same exercise in one session.
- Test ended sessions:
  - End Workout should change to Reopen in the active command header.
  - Adding sets should be blocked.
  - Editing sets should be blocked.
  - Delete session should still work.
  - Reopen Workout should clear `ended_at` and restore logging.
- Test iPhone Safari:
  - The shell header and normal-flow workout command header should not overlap or create a blank safe-area gap.
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
6. QA the Calendar tab against a real Supabase project after applying the `calendar_events` migration.
7. Deploy the app and complete live iPhone QA against the real Supabase project.
8. Live-test Action API calls from iPhone Shortcuts before relying on external automation.
9. Live-test the Gemini in-app assistant with `docs/QA_AI_ASSISTANT.md`.
10. Convert Chat Messages only after assistant transcript persistence is clearly defined and live QA has passed.

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
