# LifeOS Project Context

**Resuming after clear or session exit:** read [the current handoff](docs/agents/current-handoff.md) after this file. It records the approved UI decisions, current release checks, preview startup and private local-artifact boundary.

## Current State (2026-11-19 release batch)

- After `aa9cb18`, Companion's raised dock was reopened on iPhone. The shared dock frame now uses the measured visual viewport's top and explicit height, instead of `fixed; inset: 0` and its implicit layout-viewport bottom. The new regression fails on the old frame when visual/layout heights differ, and compares actual dock coordinates across tabs for both taller and shorter visible viewports. This reproduces a coordinate-space defect, not the physical iPhone paint offset; device acceptance remains open. See [mobile QA](docs/qa/mobile-bugfixes-2026-11-19.md). No schema rerun required.

- After `2ef0d8d`, the dock/keyboard correction replaces tab-dependent fixed positioning with one body-level navigation frame, lowers the pill to `max(2px, safe-area-bottom - 12px)` on all tabs, locks Companion's document panning and gives chat one effective viewport-height calculation. Extra keyboard height/padding/toolbar animations and Companion's pull-refresh wrapper are removed. See the after-`2ef0d8d` section of [mobile QA](docs/qa/mobile-bugfixes-2026-11-19.md). Physical iPhone acceptance remains open. No schema rerun required.

- Settings again exposes the existing build display and guarded update controls in a collapsed Application section. Confirm the installed client version there during native acceptance; update activation still preserves active-workout and dirty-draft guards.

- After `a1cd972`, the user rejected keyboard usability and reported first-tap Send failure and a raised Companion dock. The next correction holds keyboard geometry through blur, preserves Send/search pointer focus, removes duplicate mobile Companion headings/collapses its toolbar while typing, compacts the composer and expands mobile exercise catalog search to the full visible viewport. Acceptance now measures usable chat/results space and actual selection/submit taps; see the after-`a1cd972` section in [mobile QA](docs/qa/mobile-bugfixes-2026-11-19.md). No schema rerun required.

- The user reopened photo-page magnification and Companion keyboard compression on the installed iPhone after `3f7b6dd`. The correction uses a full-viewport photo overlay with a stable native dismiss control and a permanently fixed Companion layout; loaded-photo and staged keyboard-resize tests cover both. Safari's arrows/tick form assistant bar has no supported web opt-out. See the reopened iPhone section in [mobile QA](docs/qa/mobile-bugfixes-2026-11-19.md); physical acceptance remains open.

- Mobile bug follow-up removes the cross-tab workout banner, lowers the dock 6px, adds shared visual-viewport keyboard geometry, keeps photo animation on the circle and preserves native card taps until a deliberate pull gesture. See [mobile bug QA and release target](docs/qa/mobile-bugfixes-2026-11-19.md). Commit/push and production deployment were authorized on 2026-11-19; verify current Git/Vercel status and the public build-version SHA. Physical iPhone acceptance remains separate. No schema rerun required.

- Accumulated Settings, mobile bar, Companion, Community, Training and durable
  documentation changes are being released from `release/ui-refinements-20261118`
  against `fe8b99c`. The user's current instruction authorizes all checks,
  commit/push and merge to main. [Release evidence](docs/qa/ui-release-2026-11-19.md)
  records final results and release status; [current handoff](docs/agents/current-handoff.md)
  records the approved UI details and preview boundaries.
- Create/Edit templates share one staged form. Add is blue, Create/Save green,
  and confirmed Delete is equally large and red. The account-bound save helper
  uses stable IDs, unique staging orders, readback/retry and external-order
  conflict detection. It is a multistep client operation, not a DB transaction.
- Full Node regression passes, including Brain and new template-draft coverage.
  The previous attention fixed-clock failure was corrected in its isolated test
  fixture; production expiry constraints are unchanged. Browser and deployment
  results are recorded in the release evidence rather than older audit snapshots.
- Rest tickets #6/#7/#8 were implemented through `fe8b99c` and production was
  independently matched to that SHA on 2026-11-17. Physical iPhone push delivery
  and current Oracle health remain separate acceptance gates. See the rest spec,
  [rest QA](docs/qa/workout-rest-coordination.md) and [push runbook](docs/WORKOUT_WEB_PUSH.md).
- Private Community snapshots/photos and screenshots stay ignored under
  `test-results/`; generated Graphify output and rest-audit scratch stay local.
  Rankings specs and simulations remain design-only. No rankings runtime ships.
- No schema rerun required. Browser and backend Europe/Rome date helpers remain
  intentionally separate. Review applied migration ledgers before any future DB
  change; `supabase/catalog-migrations.json` seals catalog SQL, not every migration.

Release history is newest first in [docs/HISTORY.md](docs/HISTORY.md). Dated audits,
archives and plans retain their historical scope and do not override current code.

## Project Goal

LifeOS is a high-density personal operating system for daily planning, health tracking, workout logging, finances, and an assistant-style review surface. The product direction is "Midnight Cyber-Athletics": a dark, command-center interface for personal performance with dense data, fast entry, and minimal visual noise.

The app should feel like a practical daily-use tool, not a marketing page. The current priority is hardening the existing persistent workflows through scoped vertical slices.

## Tech Stack

- React 18 functional components
- Vite 6
- Vite PWA support for installable app-shell caching
- Tailwind CSS
- Lucide React icons
- Existing CSS/SVG helpers for compact visuals; Recharts was removed.
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
- `src/utils/tabRoutes.js` owns canonical paths: `/`, `/community`, `/settings`, `/calendar`, `/memos`, `/projects`, `/health`, `/workout`, `/finances`, and `/assistant`.
- Alias paths are supported: `/home` and `/pulse` open Home, `/ops` opens Projects, `/money` opens Finances, and `/ai` opens Assistant.
- `vercel.json` rewrites non-API routes to the SPA entry while preserving `/api` serverless routes.
- Major tab components except Home are lazy-loaded with `React.lazy`/`Suspense` to reduce the initial bundle.
- `src/context/LifeOSContext.jsx` is the central state layer. It owns active tab state, account-scoped client drafts, Supabase auth state, persisted module state, and CRUD actions.
- `src/components/AuthScreen.jsx` owns global sign in, sign up, loading, and Supabase setup screens.
- `src/components/LifeOSLogo.jsx` contains the custom inline SVG logo used by the shell and favicon artwork.
- `src/components/Shell.jsx` owns the app shell: desktop primary navigation is Command, Training, Community, Projects and Companion; utilities include Health, Calendar, Memos, Finances and Settings. Mobile has Command, Community, Training, Companion and More; More contains Projects and utilities. The portaled navigation bar tracks keyboard/visual-viewport/safe-area geometry. The cross-tab workout banner is removed locally; Training navigation and Command's active-work card retain resume access. There are no old dashboard metric boxes.
- `src/tabs/SettingsTab.jsx`, `src/hooks/useUserSettings.js` and `src/components/ProfileCompletion.jsx` own profile/onboarding and account preferences. New/unset preferences default to Italian, workout sharing ON and notes sharing OFF; explicit saved choices are preserved. Password recovery is handled before the normal workspace.
- `src/tabs/CommunityTab.jsx` and `src/utils/communityCache.js` expose sanitized authenticated-member workout projections, account-scoped browsing state and privacy revalidation. Read [Community](docs/COMMUNITY.md) before changing sharing.
- `src/components/ui.jsx` contains shared UI primitives such as `Panel`, `PanelHeader`, `Tag` and `MiniMetric`.
- `src/services/lifeosApi.js` contains Supabase API wrappers.
- `src/utils/workoutRestCoordinator.js` owns fixed account/workout rest-timer state, immutable confirmed snapshots, mutation exclusion and coalesced refresh readback. `src/hooks/useWorkoutRestCoordinator.js` attaches a fresh coordinator per React effect setup, initial read and browser events; `WorkoutRestTimer.jsx` retains sheet/display/countdown behavior. Unknown preferences display a neutral placeholder until readback confirms them. Successful notification registration followed by a failed preference save forces one readback under the mutation lock, retaining registration and the safe mutation error even if a lost write response is confirmed persisted. Readback failure remains separate; retries require explicit user action. Acceptance evidence: `docs/qa/workout-rest-coordination.md`. Logout cancellation/device detachment remain in `LifeOSContext.jsx`.
- `api/_utils/date.js` is the shared backend source for Europe/Rome local date/time defaults. Backend code must not use UTC ISO slicing for user-facing "today" behavior.
- `api/_utils/health.js` owns persisted sleep-hour recalculation from the previous day's `sleep_start` and the current day's `wake_time`.
- `src/lib/supabaseClient.js` creates the Supabase client from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- `api/actions.js` is the token-protected multiplexed Vercel Serverless Function for external automation. It routes `expense`, `health`, `wake`, `sleep-start`, `habit`, and `calendar` actions and uses `SUPABASE_SERVICE_ROLE_KEY` with explicit `LIFEOS_ACTION_USER_ID` writes.
- `api/ai/chat.js` contains the in-app Gemini-powered LifeOS assistant endpoint. Gemini plans intent, while backend-controlled tools read/write Supabase. It retains `handler` and the main `handleBrainChatMessage` orchestration and re-exports existing public helpers; extracted helper implementations live in `api/_utils/chat/` (`chatPendingActions`, `chatPersistence`, `chatAutoVault`, `chatClassification`, `chatMemoryAnswers`, `chatResponse`, `chatCalendarPlanning`, `chatScheduleParsing`, `chatShared`). The split was verbatim extraction; keep new logic in the matching module, not in the entry.
- `scripts/` is grouped: `scripts/tests/` (deterministic test scripts behind `npm test`/`test:*`), `scripts/smoke/` (live smoke checks), `scripts/tools/` (generators, audits, rollout rehearsals). `serve-ui-qa.js`, `workout-push-worker.js` (deployed to Oracle at this path) and `check-vercel-functions.js` stay at `scripts/` root.
- Legacy demonstration data and mock finance actions were removed; real workspaces use persisted APIs. QA fixture substitutions live only in test servers/configuration, never the production Vite plugin graph.
- Deployment docs live in `docs/DEPLOYMENT.md`, with deployed-app QA in `docs/QA_DEPLOYMENT.md`.
- Action API docs live in `docs/ACTION_API.md`.
- AI Assistant QA lives in `docs/QA_AI_ASSISTANT.md`.
- Brain pipeline handoff lives in `docs/BRAIN_ARCHITECTURE.md`.
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
LIFEOS_WHATSAPP_BRIDGE_SECRET=...
LIFEOS_WHATSAPP_ALLOWED_SENDERS=...
LIFEOS_BRAIN_DEBUG=...
LIFEOS_BRAIN_DEBUG_FULL=...
LIFEOS_MCP_TOKEN=...
LIFEOS_MCP_LINK_SECRET=...
LIFEOS_MCP_OAUTH_SIGNING_SECRET=...
LIFEOS_MCP_OAUTH_ENABLED=true
```

`SUPABASE_SERVICE_ROLE_KEY` must never be exposed through a `VITE_` variable or frontend code.
`GEMINI_API_KEY` is also server-only and must never be exposed through frontend code.
Brain Vault semantic embeddings use the same server-only `GEMINI_API_KEY` with Gemini Embedding 2. No OpenAI key is required.

The schema is in `supabase/schema.sql`.

Core tables (not an exhaustive catalog; consult `supabase/schema.sql` and reviewed forward migrations for current definitions):

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
- `ai_vault_documents`
- `ai_vault_chunks`
- `brain_outbox_messages`
- `brain_proactive_rules`
- `brain_whatsapp_inbound_receipts`
- `brain_whatsapp_message_deliveries`
- `brain_interaction_state`
- `brain_beliefs`, `brain_external_sync_requests`, `brain_mcp_oauth_code_redemptions`
- `brain_monitors`, `brain_attention_events`
- `user_profiles`, `user_preferences`, `exercise_catalog`, `exercise_aliases`
- `community_workout_shares` and its sanitized set projection
- Web-rest preferences, timers and private push subscriptions defined by the targeted workout-push migrations

App-facing tables have `user_id` columns defaulting to `auth.uid()` and referencing `auth.users(id) on delete cascade`. The three WhatsApp reliability tables require an explicit backend `user_id`; they are service-role-only and intentionally have no authenticated-client policy.

RLS is enabled on all user tables. Current policies are user-scoped for authenticated users:

- Users can only read/write rows where `auth.uid() = user_id`.
- `workout_sets` also checks that the referenced `workouts` row belongs to the same authenticated user.
- `workout_template_exercises` also checks that the referenced `workout_templates` row belongs to the same authenticated user.
- `project_sessions` and `project_money_entries` also check that the referenced `projects` row belongs to the same authenticated user.
- `ai_chat_messages` also checks that the referenced `ai_chat_threads` row belongs to the same authenticated user.
- `ai_vault_chunks` also checks that the referenced `ai_vault_documents` row belongs to the same authenticated user.
- `brain_outbox_messages` and `brain_proactive_rules` are user-scoped for future diagnostics/config UI, while writes are performed server-side through service-role utilities.

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
- Home tab summarizes persisted calendar events, memos, workout sessions/sets, project sessions, and health logs through a signal-filtered daily view. Finance data stays in Finances.
- Calendar events persisted in `calendar_events`.
- Calendar tab creates, edits, deletes, and displays persisted user-scoped events in a day-first agenda.
- Memos persisted in `memos`.
- Memos tab creates, edits, deletes, completes, dismisses, and reopens time/date-based reminders and memory items.
- Projects persisted in `projects`.
- Project work sessions persisted in `project_sessions`.
- Project money entries persisted in `project_money_entries`.
- Projects/Ops tab creates flexible-goal projects, tracks active/completed work sessions, proof of work, project-level money entries, calculated balance, and progress.
- Daily reviews persisted in `daily_reviews`.
- Brain persists user-scoped chat threads/messages, uses curated long-term memories as bounded AI context, and keeps compact Recent Actions available as a secondary surface.
- Brain Memory and Vault remain backend intelligence layers. They are hidden from the default Brain UI and available only through subtle diagnostics/manual commands when needed.
- Daily Review remains persisted for backward compatibility but is hidden from Brain.
- Token-protected Action API endpoint for external automation:
  - `POST /api/actions?action=expense`
  - `POST /api/actions?action=health`
  - `POST /api/actions?action=wake`
  - `POST /api/actions?action=sleep-start`
  - `POST /api/actions?action=habit`
  - `POST /api/actions?action=calendar`
  - Legacy `/api/actions/<action>` paths are compatibility rewrites to the single function.
- In-app Gemini LifeOS assistant:
  - `POST /api/ai/chat`
  - `GET /api/ai/actions`
  - `POST /api/integrations/whatsapp/inbound`
  - `POST /api/integrations/whatsapp/outbox` with `action=evaluate|poll|ack|record_reply_delivery`
  - Persistent Companion chat with an unselected conversation on initial page load; selected app conversations survive tab navigation. Old threads/messages persist in the backend, but conversation selection is available in the Companion context sheet.
  - Assistant responses render through safe Markdown with controlled LifeOS callout tags.
  - Brain stays focused on assistant chat and Recent Actions; canned suggestions and Daily Review UI are not rendered.
- AI Action History persisted in `ai_action_logs` for recent assistant/Shortcut writes and write failures.
- Durable Brain memory persisted in `ai_memories`; saved observations are kept separately in `ai_insights`.
- Meaningful conversations can extract a small number of durable memory/insight candidates. Simple logs and one-off writes skip extraction.
- Brain Vault persists markdown-like AI reports in `ai_vault_documents` and chunk records in `ai_vault_chunks`.
- Brain Vault is a synthesized knowledge/report layer above structured LifeOS tables; it does not replace `health_logs`, workouts, projects, memos, expenses, memories, or insights as source-of-truth data.
- Vault chunks are embedded with Gemini Embedding 2 through the server-only `GEMINI_API_KEY` and Supabase pgvector. If Gemini embedding is missing, rate-limited, or fails, documents still save and chunks are marked skipped/failed.
- Obsidian-style links such as `[[Back Day]]` are extracted into document `links` for future graph/backlink features; no graph UI exists yet.

Design-only and test-only boundaries:

- Rankings/progression remains an isolated blueprint/prototype under `docs/plans/lifeos-rankings/`; it is not production scoring or enrollment.
- Production Training uses persisted data; synthetic records/adapters belong to isolated QA servers.
- `docs/LIFEOS_COMPANION_VNEXT.md` is a broader product roadmap, not proof that every proposed feature is implemented.

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
- One pull globally reloads health, workouts/templates, expenses, calendar, memos, projects/sessions/money entries, Brain threads/current messages/memories/insights/Vault documents, and recent AI actions.
- Pull-to-refresh also asks the service worker to check for a newly deployed app version.
- Discovery does not force activation. Explicit update application or the guarded pull-to-refresh path can activate a waiting update only when the shared guard permits it.
- Workout loading, any active workout (even on another tab), and meaningful unsaved work block activation/reload. Persisted data can still refresh; finishing a set alone does not make an active workout safe to reload.
- Incomplete half-written fields are intentionally not protected by the app-update guard.
- Pull-to-refresh is touch/mobile focused, ignores form controls and open dialogs, and is disabled on desktop.
- The shell header and fixed mobile bottom navigation remain stable while only the main tab content moves.

## Action API Current Status

The Action API is a minimal Vercel Serverless API for iPhone Shortcuts or other trusted external tools. It is consolidated into one multiplexed function, `api/actions.js`, to preserve Vercel Hobby function headroom.

Current behavior:

- Requires `Authorization: Bearer <LIFEOS_ACTION_TOKEN>` on every request.
- Canonical route is `POST /api/actions?action=<action>`, or a body field such as `"action": "wake"`.
- Supported actions are `expense`, `health`, `wake`, `sleep-start`, `habit`, and `calendar`.
- Legacy paths `/api/actions/expense`, `/api/actions/health`, `/api/actions/wake`, `/api/actions/sleep-start`, `/api/actions/habit`, and `/api/actions/calendar` are Vercel rewrites into the single endpoint. Do not restore separate route files unless the deployment plan changes.
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
- The `wake` action accepts `time`, `wake_time`, or `wakeTime`, defaults `logged_on` to the Europe/Rome local date, preserves other health fields, and recalculates persisted `sleep_hours` when the previous day's sleep start exists.
- The `sleep-start` action accepts `time`, `sleep_start`, or `sleepStart`. When no date is supplied, before-noon times are assigned to the previous Europe/Rome date so the following wake log can calculate sleep correctly.
- The sleep-start endpoint recalculates the following day's `sleep_hours` when a wake time already exists.
- The `habit` action updates Shower, Creatine, or Skin without Gemini. It accepts Italian aliases such as `doccia` and `creatina`, defaults to Europe/Rome date/time, and increments by one unless set mode is requested.
- Time-aware habits use `health_logs.hygiene` entries such as `{ "count": 1, "times": ["09:37"] }`.
- Legacy numeric, boolean, array, Brush, Journal, and unknown hygiene data remains readable and is preserved during tracked-habit updates.
- Expense categories created through the Action API normalize to canonical display casing when possible.
- Enforces endpoint field limits and numeric caps before writing to Supabase.
- Does not implement AI, chat behavior, external model calls, or frontend UI changes.
- Must be live-tested after setting Vercel env vars; local curl tests require the same server-only env vars.

## AI Assistant Current Status

`src/tabs/AIAssistantTab.jsx` is a persistent Companion conversation surface. Initial page load has no selected app conversation; tab navigation preserves an explicitly selected conversation. New Chat clears it. The context sheet exposes conversations, current understanding, watches, memories, saved reports and secondary Recent Actions.

Architecture:

- Frontend sends the raw message and active `thread_id` to `POST /api/ai/chat`.
- WhatsApp inbound uses the dedicated `POST /api/integrations/whatsapp/inbound` endpoint. The local bridge never calls the frontend chat endpoint directly.
- `/api/ai/chat` and `/api/integrations/whatsapp/inbound` both route through the same backend Brain execution handler, so WhatsApp reuses Brain routing, pending actions, working context, command drafts, Vault retrieval, memory, and deterministic write guards.
- Brain chat requests carry a client request id. Optimistic user/assistant messages are deduped against persisted `ai_chat_messages.metadata.client_request_id` to avoid visible flicker or duplicate bubbles.
- Brain chat requests have a frontend timeout and retry path, so a hung `/api/ai/chat` call exits loading instead of leaving an infinite spinner.
- Brain constrains the chat viewport so the Assistant tab/page does not become the primary scroll container on mobile.
- Chat messages scroll inside the Brain message widget; earlier messages move within that internal scroll area while the composer remains visible inside the panel.
- Brain auto-scrolls the internal message list to the latest message/loading/error when the user submits, while avoiding aggressive jumps during background reloads.
- Brain input, send button, message list, loading indicator, and error card expose stable test ids for browser automation.
- The frontend sends the current Supabase access token; the backend verifies it and ensures it matches `LIFEOS_ACTION_USER_ID`.
- The endpoint can also accept `Authorization: Bearer <LIFEOS_ACTION_TOKEN>` for trusted server/tool callers.
- App chat requests append user/assistant messages to `ai_chat_messages`; Shortcut/API calls do not create personal chat history by default.
- WhatsApp chat requests append user/assistant messages to a persistent dedicated backend Brain thread per sender using `metadata.source = "whatsapp"` and `metadata.whatsapp_sender`.
- WhatsApp threads are backend context only. They must not auto-open in the app and must remain distinct from app conversation navigation in the Companion context sheet.
- Threads are titled deterministically from the first meaningful user message without an extra Gemini title call.
- Brain opens with an unselected conversation on initial page load. Old app conversations remain persisted and selectable in the Companion context sheet; the main conversation surface remains chat-first.
- An unselected conversation shows the current `New conversation` title and `What's on your mind?` empty state. Tab navigation preserves a selected conversation; New Chat explicitly clears it.
- The backend includes a bounded recent-thread history block so follow-up messages retain conversation context.
- Active memories are loaded by importance/update time and recent insights are loaded separately. Both are advisory context and never permission to perform a write.
- Brain uses AI-first semantic routing before planner writes. The router classifies mode, selected skill, needed data, write intent, ambiguity, and risk from the current message plus bounded conversation/memory context.
- Brain asks specific domain clarifications for vague calendar/time-block commands such as `blocca domani un'ora dopo pranzo`; vague time phrases never authorize writes by themselves.
- Brain auto-saves eligible long-form analysis/advice responses into Brain Vault invisibly. Manual Save-to-Vault is not a primary user flow.
- Deterministic keyword routing is now fallback/sanity behavior, not the primary understanding layer.
- Brain's operating principle is: AI understands; backend code protects, validates, and executes.
- The AI semantic router cannot execute writes. It can only propose route metadata, skill, data needs, and action types.
- Backend code remains responsible for auth, user ownership, schema validation, date/time validation, destructive blocks, allowed actions, and final tool execution.
- Brain supports read-only follow-up transformations such as `mettile in ordine cronologico`, `fammi una tabella`, `riassumi`, `make it shorter`, and `sort them chronologically` by using the latest persisted assistant answer as source material.
- Follow-up transformations never create actions or run write tools. If there is no previous assistant answer, Brain asks what content to transform.
- Brain uses Skill Architecture v1: internal skills are backend modules, not separate autonomous agents or visible tabs.
- Current Brain skills are `general_chat`, `memory_manager`, `workout_coach`, `health_coach`, `calendar_planner`, `memo_assistant`, `project_ops_coach`, `finance_analyst`, `life_review`, and `product_builder`.
- Skill selection is primarily AI semantic routing with deterministic fallback.
- The selected skill and Brain route are injected into planner, calendar-plan, and answer prompts to guide mode, data needs, allowed actions, forbidden actions, and response style.
- Skill write permission and route write intent are additional guards. Skill rules never override global safety guards, negative write intent, tentative-language protection, workout-advice read-only behavior, follow-up transform read-only behavior, memory direct handling, or destructive-action blocks.
- Selected skill metadata is stored in existing `ai_chat_messages.metadata.selected_skill`, included in `/api/ai/chat` responses, and shown as a subtle badge on assistant messages.
- Brain route metadata is stored in existing `ai_chat_messages.metadata.brain_route`, included in `/api/ai/chat` responses, and included in sanitized AI action logs when actions are created.
- Brain stores compact structured trace metadata in `ai_chat_messages.metadata.brain_trace` on assistant messages when possible. Trace debugging records decision metadata and ids, not hidden reasoning or secrets.
- BrainTurn Pipeline Foundation lives in `api/_utils/brainTurn.js`. It centralizes per-turn state and trace updates for inbound metadata, thread/history attachment, memory context, Working Context, pending-action checks, proactive-before-pending arbitration, route/skill/vault trace stages, and pending-resolution trace state.
- Brain Stage v2 adds a formal BrainTurn Contract in `api/_utils/brainTurnContract.js`. Each turn gets one explicit `winning_path`, `intent_type`, write-intent source, allowed context sources, disallowed subsystem steals, route override, and field policy before pending/proactive/operational/route/command-draft paths can handle the message.
- Brain Turn Arbitration helpers live in `api/_utils/brainTurnArbitration.js`. They provide deterministic signals for explicit new commands, Working Context referents, agenda queries, operational follow-ups, true long-term memory recall, pending-vs-proactive priority, and memo-vs-calendar write-domain policy.
- `api/ai/chat.js` is the entry/orchestration module; helpers in `api/_utils/chat/` and the dedicated stages consult the BrainTurn Contract. Pending actions, proactive replies, operational follow-ups, memory recall, Vault retrieval, and command drafts are blocked when the contract says that subsystem would steal the turn.
- The AI Command Draft lifecycle is extracted into `api/_utils/brainCommandDraftStage.js`. The stage decides whether command draft should run, extracts with Gemini, applies deterministic reference/domain/field policy, validates, creates pending clarification state, or executes through the existing safe write path.
- Brain Stage v3 extracts the legacy planner/read-only/action path into `api/_utils/brainPlannerStage.js`. The stage handles route clarification, casual/read-only answers, synthetic multi-event calendar paths, Gemini planner output, read context loading, safe write execution handoff, and planner trace steps.
- Planner Stage validates every planner write against the BrainTurn Contract, route write intent, selected skill permissions, negative write intent, and destructive-action blocks. If the contract says the turn is read-only, operational, memory recall, follow-up transform, casual, or has no current-message write source, the planner output is repaired to read-only/clarification before any LifeOS tool can run.
- Brain has a pending-action / slot-filling layer for multi-turn writes. Candidate actions are AI-extracted into `ai_chat_messages.metadata.pending_action`, then deterministic backend validation handles confirmation, cancellation, missing fields, expiration, and execution.
- Pending-action resolution runs before normal AI routing, skill selection, command draft extraction, planner writes, and casual fallback for both app Brain and WhatsApp Brain.
- Short confirmation/cancellation/clarification replies such as `Sì`, `si`, `ok`, `confermo`, `fallo`, `yes`, `no`, `non farlo`, and `?` are normalized only when an active pending action exists, then resolve or explain that pending action before any new route is attempted.
- Pending actions are interruptible and topic-safe. The resolver only handles confirmation, cancellation, clarification, plausible slot-fill, or explicit referential replies for the stored action.
- New explicit independent commands such as `ricordami...`, `segna parrucchiere domani`, `segna memo: ...`, `segna creatina...`, `blocca domani...`, `ho speso...`, or a new sleep-start command bypass stale or unrelated pending actions and continue into normal Brain routing/command draft.
- Pending slot-fill extraction is gated by deterministic plausibility checks, so unrelated messages cannot mutate old pending args or stale confirmation questions.
- Generic pending cancellations such as `no`, `annulla`, `cancella tutto`, and `lascia perdere` resolve the active pending action before proactive WhatsApp reply handling unless the message clearly names the proactive reminder.
- Pending actions are thread-local, expire after a short window, and never bypass negative-write guards, destructive blocks, user ownership checks, skill/action permissions, or schema/date/time validation.
- Health nap/pisolino pending actions save to Health notes as context, not to `sleep_start`, `wake_time`, or calculated `sleep_hours`.
- Going-to-sleep commands such as `sto andando a dormire`, `vado a dormire`, `inizio sonno`, `bedtime`, and `sleep start` with a time map to the structured `log_sleep_start` Brain action, not a generic Health note.
- `log_sleep_start` reuses the same shared sleep-start helper as `/api/actions?action=sleep-start`, including Europe/Rome before-noon date assignment and next-day `sleep_hours` recalculation when a wake time exists.
- `log_sleep_start` is the canonical Brain action for going-to-sleep commands. Dirty or legacy pending actions that look like `update_health_log` but contain sleep-start semantics, such as `activity: sonno` plus `start_time` or `health_field: inizio sonno`, are normalized to `log_sleep_start`.
- Pending action validation recomputes `missing_fields` from normalized args. Stale fields such as `health_field` are removed when the normalized action is executable.
- Vague calendar or memo requests can store known slots such as title/date/duration while asking only for the missing exact time/title/date; follow-up replies like `si`, `14:30-15:30`, or `non bloccarlo` resolve the stored action instead of restarting generic clarification.
- Completed or cancelled pending actions are recorded as later assistant message metadata; the latest status for the pending id is treated as source of truth and helps avoid retry duplicates.
- Brain has Working Context metadata in `ai_chat_messages.metadata.working_context`. It stores the current conversation language, latest operational subject, latest successful action result, and recent referents without exposing raw metadata in the UI.
- Working Context lets Brain resolve unambiguous follow-ups such as `aggiungilo anche al calendario`, `usa lo stesso orario`, `mettilo anche nei memo`, and `la data e il tempo che hai gia usato` against the latest structured subject.
- Working Context exact fields such as date/start/end time are copied into a new Command Draft only when the current message has an explicit referent such as `lo`, `quello`, `stesso`, `anche`, `aggiungilo`, or a resolved draft referent. New standalone commands do not inherit old exact times.
- Brain uses an AI Command Draft protocol for referential/action-like turns. Gemini extracts a strict JSON command draft; deterministic backend code resolves references, validates safety/date/time/schema/action permissions, and executes only supported tools.
- Command Draft output is not trusted for calendar time semantics. Backend normalization repairs common AI mistakes against the original source text, including `11.45am` -> `11:45`, `11.45pm` -> `23:45`, and Italian `DD/MM/YY` dates such as `7/9/26` -> `2026-09-07`.
- Command Draft field provenance is runtime metadata only. Calendar drafts record whether exact date/time fields were grounded in the current message, inferred by AI, defaulted, copied from Working Context, or rejected as ungrounded. This provenance is stored in sanitized `brain_trace.command_draft`, not in schema.
- Memo-vs-calendar policy is conservative: `segna memo:`, `promemoria`, and `ricordami` create memos; `fissa`, `blocca`, `metti in calendario`, `evento`, `appuntamento`, `calendar`, and `schedule` create calendar events. Generic `segna X domani/alle...` defaults to a memo/reminder, not a calendar event, unless calendar wording is explicit.
- Calendar draft validation recomputes missing fields by action semantics. Vague phrases such as `domattina` or `mattina` do not justify an exact AI-inferred time unless the current message explicitly refers to a previous time. If a calendar event has `start_time` but no `end_time`, Brain asks for duration/end time instead of asking for the exact start time again.
- Calendar pending slot-fill is label-aware. Replies such as `orario di inizio 9.30`, `inizio 9.30`, or `start 9:30` update `start_time`; `fine 12:45`, `finisce 12:45`, or `until 12:45` update `end_time`; `durata 1 ora`, `un'ora`, or `45 minuti` compute duration/end time.
- Referential commands rely on `last_subject` and recent structured subjects, not a phrase-specific deterministic router. If the referent is missing or ambiguous, Brain asks a specific clarification in the conversation language.
- Working Context is advisory context for understanding only. It never authorizes writes by itself and does not override negative intent, destructive blocks, pending-action expiry/status, or supported-tool validation.
- Route invariants repair contradictory semantic routes. Agenda/task/schedule questions such as `Che cosa devo fare domani? Guardami gli impegni` must become `read_only_analysis` over calendar/memos, and operational follow-ups such as `Quando l'hai messo?` are answered from Working Context instead of long-term memory. `memory_recall` is reserved for true long-term memory questions such as `Cosa ti ricordi di me?`.
- Brain Vault v1 stores long-form markdown-like Brain reports and saved assistant answers in Supabase.
- Brain Vault documents can be saved by explicit follow-up commands such as `save this to vault`, and eligible long-form Brain answers are auto-saved invisibly.
- Brain Vault semantic retrieval runs after AI semantic routing for relevant analysis/action/product/workout/project/life-review requests and injects top matching saved report chunks into Brain prompts as advisory context.
- Simple explicit writes such as habit logs, sleep-start logs, memos, calendar creates, and expenses skip Brain Vault retrieval unless the current message also asks for analysis/advice/report context.
- Brain Vault and Working Context are advisory inputs only. Planner Stage explicitly prevents either one from creating write permission when the current message/contract is read-only.
- Vault context is stored in `ai_chat_messages.metadata.vault_context` for debugging and never creates write permission.
- Vault context does not replace structured LifeOS tables and cannot authorize calendar, memo, health, expense, project, or workout writes.
- Brain Vault embeddings are Gemini-native. The core model is `gemini-embedding-2`, configurable only through optional `GEMINI_EMBEDDING_MODEL`, with fixed 1536-dimension vectors stored in `ai_vault_chunks.embedding`.
- Gemini Embedding 2 retrieval inputs are formatted in text rather than `task_type`: document chunks use `title: {title} | text: {chunk}` and search queries use `task: search result | query: {query}`.
- Existing skipped, failed, pending, null-model, or non-`gemini-embedding-2` Vault chunks are excluded from semantic retrieval until repaired through the Vault Re-embed flow.
- Missing or rate-limited Gemini embeddings do not break Vault document saving; semantic retrieval is unavailable until chunks are ready.
- Future Vault work can embed screenshots, workout images, PDFs, audio logs, and other multimodal artifacts because Gemini Embedding 2 supports multimodal inputs, but this pass is text-only.
- Future Morning Briefing, Weekly Review, post-workout reviews, and product reports should save synthesized outputs into Brain Vault. Proactive WhatsApp currently covers memo reminders plus deterministic accountability checks for missing wake time, previous-night sleep start, and Shower/Creatine/Skin habits.
- Meaningful conversations may run a strict memory extractor after the main response. Extraction failure is isolated and never fails the chat response.
- Memory deduplication itself uses normalized title/category/key-term overlap; Brain Vault is the pgvector-backed long-form retrieval layer.
- Explicit memory commands such as `remember that ...`, `remember my name is Ale`, `call me Ale`, `my name is Ale`, `ricordati che mi chiamo Ale`, and `chiamami Ale` write directly to `ai_memories`, not to Memos.
- Memory recall requests summarize active memories, and ambiguous forget requests ask clarification or direct the user to diagnostics/manual memory controls.
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
- AI and Action API calendar creates normalize common AM/PM and messy Gemini time fields such as `from 12:45pm`, `12:45pm to 2:15pm`, `2:15 pm`, `9am`, and contextual ranges like `3:45 to 5:30 pm` into stored `HH:MM`. Single-time command drafts use a single-time parser, not a fake time range, so ambiguous morning times are not promoted to PM by accident.
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
- Brain memory and conversation history do not override deterministic write guards. Calendar/memo/health/expense/recurrence writes still require explicit supported intent in the current user message.
- Negative write intent such as `don't schedule`, `no memo`, `non creare`, or `non mettere in calendario` blocks writes even if the planner proposes one.
- Tentative language such as `I might need`, `maybe`, `forse dovrei`, or `potrei` does not create memos/events unless paired with an explicit action phrase like `remind me` or `schedule`.
- Vague memo timing such as `tomorrow afternoon` asks for clarification instead of surfacing raw validation errors.
- Casual acknowledgments such as `nah, just logging context`, `not sure though`, and `actually, nevermind` receive concise acknowledgments instead of repeated follow-up questions.
- AI health logging supports time-aware Daily Habits stored in `health_logs.hygiene`: Shower, Creatine, and Skin.
- AI habit updates merge with existing daily values and attach an explicit or current Europe/Rome time. Brush and Journal remain legacy-only and are no longer shown or updated.
- AI prefers `sleep_start` and `wake_time`; when both required times exist, automatic sleep calculation overrides a manual duration.
- Missing optional nullable health fields are ignored instead of being validated as invalid.
- Successful and failed AI write actions are logged to `ai_action_logs` with source, request id, action type/count, sanitized action metadata, record references, and safe error messages.
- AI Action History powers the Assistant Recent Actions preview. It is action history only; undo is not implemented yet. Home does not surface Recent AI Writes.
- Brain UI is chat-first. The composer stays central, conversation selection and Recent Actions live in the Companion context sheet, Memory/Vault management stays secondary, and Brain keeps Daily Review and canned Suggestions hidden.
- Brain Recent Actions shows successful actions by default and hides old failed writes behind an Errors toggle to reduce visual noise. Logs remain stored in `ai_action_logs`.
- WhatsApp inbound replies are concise and same-language for chat use, while preserving the same Brain action boundaries and backend validation as app chat.
- Future proactive features such as Morning Briefing, Weekly Review, workouts, projects, and sleep/wake check-ins should build on Brain skills and the outbox pattern.
- AI Action History previews are compact and click-to-expand. Preview cards show source, status, time, deterministic action title, and action count without displaying the full raw request or response.
- AI Action History detail views show the full saved request, full saved response, action metadata, request id, record references, and sanitized action payloads. Saved assistant responses render with the same safe Markdown and LifeOS callout renderer used by chat messages.
- AI Action History titles are deterministic frontend formatting and do not trigger an extra AI call.
- `GET /api/ai/actions` returns recent action logs for the configured user after Supabase-session or action-token auth.
- AI write failures log sanitized requestId-based diagnostics in server logs. Setting `LIFEOS_DEBUG_AI=true` in a test deployment can include sanitized debug details in error responses.
- AI planner-stage failures also log sanitized requestId diagnostics before any write routing runs, including whether the message looks like an explicit multi-event or day-schedule calendar request and the detected item/time-range counts.
- `LIFEOS_DEBUG_AI=true` is for test deployments only and can expose sanitized planner/write debug details in error responses.
- `LIFEOS_BRAIN_DEBUG=true` prints one compact `BRAIN_TRACE` JSON line per Brain-handled message in server logs and includes debug payloads in Brain HTTP responses.
- `LIFEOS_BRAIN_DEBUG_FULL=true` enables capped full text fields for active debugging only. It still must not include secrets, API keys, auth headers, or chain-of-thought.
- Requests with `x-lifeos-debug: true` receive `debug.brain_trace` in `/api/ai/chat` and `/api/integrations/whatsapp/inbound` JSON responses without adding debug text to the assistant or WhatsApp reply.
- Expense amount validation tolerates currency wording/symbols such as `25 euro`, `€25`, `25 dollar`, `$25`, and comma decimals.
- Simple successful create expense, create calendar event, create memo, and update health log requests return deterministic success messages without a second Gemini answer call.
- Complex analysis and analyze-and-plan requests may still use multiple Gemini calls.
- Proactive Morning Briefings, voice, external email, broad proactive messaging, and autonomous dangerous/unconfirmed actions are not implemented in this phase. Current proactive delivery includes memo, accountability and explicitly permitted monitor flows through the shared outbox.

Supported v1 intents/tools:

- Analyze persisted LifeOS context across expenses, health logs, workouts/sets, calendar events, and daily reviews.
- Create expenses.
- Create single calendar events, mixed point/range day schedules, explicit multi-event calendar schedules, and finite recurrence-expanded calendar schedules.
- Create memos for reminders, tasks, and memory items.
- Resolve proactive WhatsApp memo replies by marking memos done, dismissing them, or snoozing their date/time when the latest WhatsApp context is a proactive memo reminder.
- Update provided daily health log fields.
- Log structured sleep start through the same behavior as `/api/actions?action=sleep-start`.
- Analyze recent context and create a small non-overlapping calendar plan when the user explicitly asks to plan/schedule.
- Block destructive requests such as deleting records or mass updates.

Current limitations:

- No arbitrary SQL.
- No destructive writes.
- Pending actions support low-risk multi-turn confirmation and slot filling for supported Health, Calendar, Memo, Expense, and related action flows.
- External integrations: WhatsApp Bridge supports inbound Brain messages and Proactive WhatsApp v1A memo outbox delivery through the local bridge. LifeOS MCP exposes read-only context/debug tools plus separately scoped semantic `sync_context`; project-watch monitors require explicit standing permissions. These boundaries do not authorize general autonomous CRUD.
- No frontend range/scope dropdowns; Gemini infers intent, range, and scope from natural language.
- `GEMINI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are server-only.

## Companion State, Memory And Attention

`brain_beliefs` owns current truth; `ai_memories` owns curated autobiographical history; insights are hypotheses and Vault is long-form context. Explicit MCP `sync_context` requires `lifeos.write`, bounded supported updates and idempotency; read tools and `search_memory` remain read-only. It cannot execute operational CRUD or send messages.

Project Watch/attention uses grounded `project_staleness` monitors, explicit `companion.monitor` and separate default-off `companion.message` grants, bounded evaluation and delivery-time revalidation. This is not general autonomous outreach. the Companion context sheet exposes app conversations, current understanding, recent actions, reports and secondary memory/diagnostic controls. See [Brain architecture](docs/BRAIN_ARCHITECTURE.md), [MCP](docs/MCP.md) and [Companion QA](docs/QA_COMPANION_UI.md).

## Brain Trace Debugging

Brain Trace Debugging v1 adds compact instrumentation to the shared Brain handler used by app chat, trusted callers, and WhatsApp inbound.

Current behavior:

- Each Brain-handled assistant response attempts to persist `metadata.brain_trace` on the assistant `ai_chat_messages` row.
- Full user and assistant message text remains in `ai_chat_messages.content`; `brain_trace` stores compact decision/debug metadata and ids pointing to the relevant messages.
- Trace fields can include source, response mode, client request id, thread id, user/assistant message ids, WhatsApp sender/message id, user text preview, detected language, selected route, selected skill, working-context summary, pending-action status, pending reply intent, command draft summary, Vault retrieval counts, tool names/results, auto-save eligibility, final response type, error code, and latency.
- Trace helps identify whether a bug came from thread continuity, pending-action lookup, confirmation normalization, command draft extraction, deterministic validation, skill/routing, working context, Vault retrieval, tool execution, or response formatting.
- Trace is compact and sanitized. It must not include chain-of-thought, API keys, Supabase service keys, Gemini keys, auth headers, bridge secrets, raw provider internals, or huge Vault chunks.
- `LIFEOS_BRAIN_DEBUG=true` prints compact `BRAIN_TRACE` JSON lines in Vercel/server logs.
- `LIFEOS_BRAIN_DEBUG_FULL=true` is optional active-debug mode. It can include capped full message fields in debug payloads/metadata when safe, but still never secrets or chain-of-thought.
- `x-lifeos-debug: true` on `/api/ai/chat` or `/api/integrations/whatsapp/inbound` includes `debug.brain_trace` in the JSON response. The WhatsApp reply string itself remains clean.
- Unauthorized WhatsApp requests do not create Brain messages; debug logging for rejected endpoint checks is minimal and sanitized.

## LifeOS Context Compiler And Open Loops

LifeOS Context Compiler v1 lives in `api/_utils/lifeosContextCompiler.js`.

Current behavior:

- The compiler produces a compact structured world snapshot for backend consumers such as MCP, Brain, future Morning Briefing, future Home/Open Loops UI, and future Evening Review.
- The snapshot includes today, next few days, open memos, upcoming calendar, project staleness/carryover, health/sleep status, latest workout/recovery hints, failed actions, active pending Brain actions, WhatsApp outbox issues, and ranked open loops.
- Open loops are typed objects with source table/type/id, severity, due/date, reason, suggested next action, proactive eligibility, Home visibility, and compact metadata.
- Detected loop families currently include overdue/due/unscheduled memos, upcoming calendar prep candidates, stale active projects, open project sessions, project carryover without proof, failed Brain/action writes, claimed/failed/due WhatsApp outbox rows, active pending Brain actions, low-sleep recovery gaps, and high-confidence workout gaps.
- The compiler is read-only and does not enqueue messages, write records, or call Gemini.
- MCP `get_open_loops` now delegates to this shared engine, and `get_lifeos_context` / `lifeos://context/today` expose the compact snapshot for external read-only clients.
- Morning Briefing should use this compiler as its deterministic context source, then apply a separate deterministic send policy. The compiler itself must not decide to text the user.

## Brain Regression Harness

Brain Regression Harness v1 adds a lightweight local test layer for deterministic Brain protocol behavior.

Current behavior:

- `npm run test:brain` runs `scripts/tests/test-brain-regressions.js`.
- Fixtures live in `tests/brain/fixtures.js`; notes live in `tests/brain/README.md`.
- The harness uses pure utilities and does not require Vercel, browser automation, WhatsApp, Gemini, or live Supabase writes.
- Covered checks include dirty sleep-start pending action normalization, command-draft sleep-start coercion, BrainTurn Contract path selection, command-draft stage policy, planner-stage write blocking, memo-vs-calendar domain repair, calendar command draft AM/PM repair, calendar duration/end-time clarification, stale `missing_fields` cleanup, pending reply confirmation/cancellation/clarification normalization, executable pending confirmation resolution, nap-not-sleep-start protection, simple explicit writes skipping Vault retrieval, negative write guard behavior, Working Context referent date/time preservation, the outbox state machine, proactive reply target selection, proactive candidate validation, pure Proactive WhatsApp memo outbox behavior, and Proactive Accountability candidate/reply behavior.
- Run it before and after changes to Brain, WhatsApp inbound/outbox, proactive memo rules, pending actions, command drafts, working context, Vault retrieval gates, or sleep/wake command handling.
- Live WhatsApp thread continuity, real tool execution, provider behavior, and RLS still require the manual QA checklists.

## WhatsApp Bridge Current Status

WhatsApp Bridge v1 supports inbound trusted messages from a local `whatsapp-web.js` bridge into LifeOS Brain.

Current behavior:

- The local bridge runs on the user's PC or another always-on machine; it does not run inside Vercel.
- Vercel exposes `POST /api/integrations/whatsapp/inbound` for the bridge.
- The endpoint requires `x-lifeos-whatsapp-secret` to match server-only `LIFEOS_WHATSAPP_BRIDGE_SECRET`.
- The endpoint requires the sender to be listed in `LIFEOS_WHATSAPP_ALLOWED_SENDERS` in production.
- Sender ids can be canonicalized through server-only `LIFEOS_WHATSAPP_SENDER_ALIASES`, for example `39XXXXXXXXXX@c.us=111780936298528@lid`. Allowed-sender validation accepts aliases but stores the canonical sender for thread/outbox continuity.
- The endpoint validates text-only message payloads, rejects empty/oversized bodies, rejects unsupported message types, and keeps group behavior closed unless explicitly whitelisted.
- The local bridge only needs `LIFEOS_BASE_URL`, `LIFEOS_WHATSAPP_BRIDGE_SECRET`, and its own allowed sender config. It must not know Supabase service keys, Gemini keys, or database credentials.
- WhatsApp messages use `source = "whatsapp"` and include sanitized sender/message id metadata.
- Each allowed sender gets one persistent backend Brain thread. This preserves WhatsApp conversation context while app conversation navigation remains in the Companion context sheet.
- WhatsApp replies are generated by the same Brain handler used by app chat, with WhatsApp-friendly concise response instructions.
- WhatsApp inbound can return `debug.brain_trace` in JSON when called with `x-lifeos-debug: true`; the bridge should keep that out of the WhatsApp reply text.
- Pending actions, confirmation/cancellation normalization, structured sleep-start logging, Working Context, Command Draft referent resolution, memory commands, follow-up transforms, Brain Vault retrieval/auto-save, and deterministic tool guards remain active for WhatsApp.
- Proactive WhatsApp uses bridge polling for timed memo delivery and deterministic accountability checks. WhatsApp Business Cloud API, Meta templates, media/voice, open group chat support, and broad proactive coaching are future work.
- The production bridge currently runs on an Oracle VM under PM2, not Docker. Vercel backend deploys do not require a bridge restart unless bridge code or bridge env vars changed.

## Proactive WhatsApp Current Status

Proactive WhatsApp is a conservative deterministic outbox for memo reminders and Proactive Accountability v1 health check-ins.

Current behavior:

- Brain does not randomly decide to text the user. Deterministic rule families evaluate open `memos` and missing health/sleep/habit fields, then enqueue outbound rows in `brain_outbox_messages`.
- `brain_proactive_rules` stores future per-user rule settings such as enabled state, quiet hours, daily cap, min gap, and JSON config.
- Memo rules cover timed memo due reminders, one quiet overdue follow-up, and date-only memo prompts that ask what time to use instead of guessing.
- Accountability rules live in `api/_utils/brainProactiveAccountability.js` and are registered as the `accountability` family. They can ask for missing `wake_time`, missing previous-night `sleep_start`, and missing Shower/Creatine/Skin habit entries in `health_logs.hygiene`.
- Accountability scheduling uses deterministic per-day/per-rule jitter inside fixed local Europe/Rome windows. The same date/rule/source produces the same scheduled time and idempotency key, so repeated evaluation does not create random duplicates.
- Accountability candidates include `metadata.expected_reply_type = "accountability"`, `source_type = "accountability"`, stable source ids such as `habit:shower:YYYY-MM-DD`, `wake_time:YYYY-MM-DD`, or `sleep_start:YYYY-MM-DD`, and an attention profile that bypasses quiet-hours suppression while keeping idempotency and a shorter min gap.
- The local bridge calls one multiplexed endpoint, `POST /api/integrations/whatsapp/outbox`, with `action=evaluate`, then `action=poll`, sends returned messages through WhatsApp, and calls the same endpoint with `action=ack`.
- The outbox endpoint is intentionally consolidated into one serverless function to stay under Vercel Hobby function limits. Legacy `/outbox/evaluate`, `/outbox/poll`, and `/outbox/ack` paths are rewrite-compatible when `vercel.json` is active, but new bridge code should use the combined endpoint.
- Outbox rows are idempotent by `user_id + idempotency_key`; due messages move `queued -> claimed -> sent`, and failed sends retry up to a small capped attempt count before `failed`.
- Outbox lifecycle decisions are centralized in `api/_utils/brainOutboxStateMachine.js`; Supabase reads/writes stay in `api/_utils/brainOutbox.js`.
- Polling reclaims stale `claimed` rows after a short claim timeout so bridge crashes after poll do not permanently hide reminders. Expired claimed rows become `expired`, and claimed rows over the attempt cap become `failed`.
- Polling sorts due rows by priority rank (`high`, `normal`, `low`) after a small oversampled fetch instead of relying on lexicographic text ordering.
- ACK handling is state-aware: normal sent ACKs require `claimed -> sent`, repeated `sent -> sent` is idempotent, and queued/expired/failed/cancelled rows are not silently marked sent. Failed ACKs requeue with short backoff while attempts remain.
- Successful ack persists the proactive WhatsApp text as an assistant message in the same dedicated WhatsApp Brain thread, with `metadata.proactive_message = true` and `working_context.last_subject` pointing to the memo or accountability target. Persistence is idempotent by outbox message id.
- Proactive reply resolution lives in `api/_utils/brainProactiveReplies.js` behind `resolveProactiveWhatsappReply()`. It selects between memo and accountability targets from the latest proactive WhatsApp context, then resolves replies deterministically.
- Memo replies such as `fatto`, `done`, `snooze 30`, `domani alle 10`, `annulla`, or `?` are resolved only when recent WhatsApp context contains one unambiguous proactive memo reminder inside the reply window. Stale or multiple recent reminders ask clarification instead of mutating a memo.
- Accountability replies such as `si`, `fatto`, `presa`, `9.30`, `ora`, `non ancora`, `non ho dormito`, and `piu tardi` are handled without Gemini/planner routing. Clear replies update Health through existing `updateHealthLog()` or canonical `logSleepStart()` helpers; unclear/stale replies ask a short clarification and do not write.
- Short proactive replies can be prioritized before unrelated pending actions when the latest WhatsApp assistant message is proactive. New explicit commands bypass proactive context and route normally.
- `api/_utils/brainProactiveRules.js` exposes a small `proactiveRuleRegistry`, candidate validator, rule config loader, and attention-budget helpers so future rule families can plug in without changing the evaluator contract.
- The existing `brain_proactive_rules` table is the foundation for rule preferences and a global attention budget. A `global` rule row can cap daily proactive messages or min-gap behavior across future families.
- `docs/WHATSAPP_PROACTIVE_ARCHITECTURE.md` documents the outbox lifecycle, reply resolution rules, and future extension points.
- Proactive outbound messages do not directly modify LifeOS records except outbox status. Memo completion/dismissal/snooze and accountability health writes happen only after a user reply.
- Current proactive scope intentionally excludes Morning Briefing, Evening Review, calendar completion checks, workout/project nudges, finance nudges, PWA push, AI-generated coaching, and paid WhatsApp providers.

## MCP Server Current Status

LifeOS MCP retains its read-only context/debug surface and adds one separately authorized semantic current-context sync tool. It is not a general write-capable LifeOS agent.

Current behavior:

- Vercel exposes one serverless MCP endpoint at `api/mcp.js` / `POST /api/mcp`.
- The endpoint uses a minimal stateless JSON-RPC 2.0 MCP-compatible HTTP handler and supports `initialize`, `tools/list`, `tools/call`, `resources/list`, `resources/read`, `prompts/list`, and `prompts/get`.
- `GET /api/mcp` returns only a safe health/capability summary and no private data.
- Static-token private MCP operations require server-only `LIFEOS_MCP_TOKEN` through `Authorization: Bearer ...` or `x-lifeos-mcp-token` for local testing and custom clients.
- ChatGPT Connector OAuth compatibility is handled by direct `api/mcp.js` query URLs, not separate route files:
  - `/api/mcp?mcp_oauth=protected-resource`
  - `/api/mcp?mcp_oauth=authorization-server`
  - `/api/mcp?mcp_oauth=authorize`
  - `/api/mcp?mcp_oauth=token`
- Root OAuth paths remain compatibility rewrites only and should not be the URLs advertised to ChatGPT:
  - `/.well-known/oauth-protected-resource`
  - `/.well-known/oauth-authorization-server`
  - `/.well-known/openid-configuration`
  - `/oauth/authorize`
  - `/oauth/token`
- OAuth mode supports authorization-code + PKCE S256 with explicit `lifeos.read` and `lifeos.write` scopes. Only tokens actually granted write may call `sync_context`; independent link/signing secrets are required for write grants. `LIFEOS_MCP_OAUTH_ENABLED=false` is the emergency OAuth rollback flag.
- MCP is scoped to the configured personal user via `LIFEOS_ACTION_USER_ID` and service-role Supabase reads.
- MCP tools/resources provide compact summaries for snapshots, today/week, workouts, health, open memos, upcoming calendar, projects, Brain traces/action logs, WhatsApp outbox, Vault search, and open loops.
- MCP workout output includes exact set-level rows in both top-level `sets[]` and per-exercise `sets[]`, including set number, warmup flag, weight, reps, RPE, performed time, and safe note previews, while preserving aggregate workout/exercise summaries. Workout responses include `sets_truncated`, `set_limit`, and `returned_set_count`.
- Workout Intelligence v1 exposes read-only `get_workout_intelligence` and `lifeos://workouts/intelligence`. It analyzes exact working sets into latest-session summaries, per-exercise progression, cautious next targets, plateau flags, and sleep/recovery caveats when health data exists. Warmups are excluded from top working-set targets. Brain workout context uses the same helper through the workout coach read path.
- MCP includes read-only proactive WhatsApp debug access through `get_whatsapp_proactive_debug` and `lifeos://whatsapp/proactive-debug`, exposing outbox status counts, safe ACK/retry summaries, and proactive traces without mutating records.
- MCP prompts are instruction templates only; they do not embed private data directly.
- All legacy MCP tools/resources and new `search_memory` remain read-only. Only `sync_context` may update current beliefs, curated autobiographical memories, and its bounded audit under `lifeos.write`; it must not call Brain chat, execute LifeOS actions, enqueue or ack outbox rows, or send WhatsApp messages.
- Responses are limited and sanitized. MCP must not expose Supabase service keys, Gemini keys, WhatsApp secrets, action tokens, auth headers, or unlimited raw transcripts/dumps.
- MCP OAuth metadata/authorize/token requests are all served by the same `api/mcp.js` function. OAuth metadata advertises direct `/api/mcp?mcp_oauth=...` URLs so ChatGPT linking cannot be swallowed by the SPA fallback. Action API consolidation keeps total Vercel function count under the Hobby limit. Run `npm run check:functions` before deployment.
- Local validation uses `npm run test:mcp`; it does not require live Supabase, Gemini, Vercel, or WhatsApp.
- Deployed validation uses `npm run smoke:mcp`, which reads `LIFEOS_MCP_TOKEN` from `.env.local` or the process env, calls the real deployed endpoint, and prints pass/fail results without dumping private LifeOS data or token material.
- OAuth deployed validation uses `npm run smoke:mcp:oauth`, which reads the link secret from `.env.local` or process env, completes PKCE linking against the deployed endpoint, and redacts codes/tokens from output.
- Any future MCP write capability needs its own explicit scope, semantic validator, and regression coverage. The current sync tool does not authorize operational CRUD.

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
- Timed and overdue open memos can be delivered through Proactive WhatsApp v1A when the local bridge polls the outbox endpoints.
- WhatsApp replies to proactive memo reminders can mark a memo `done`, dismiss it, or snooze by updating `memo_date`/`memo_time` through the backend after explicit user reply.
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
- Home surfaces Ops only when a project session is active or project work has been logged today. It does not show active project count or latest project merely because projects exist.
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

`src/tabs/HomeTab.jsx` renders Command from persisted records, using `useLocalDay` for Europe/Rome midnight/resume behavior.

- Active Training and project sessions expose direct resume links.
- Today contains up to five non-cancelled calendar events; Open loops contains up to four open dated memos due today or overdue. Future memos stay in Memos. Tomorrow previews up to two events.
- Recorded today contains persisted sleep, logged Shower/Creatine/Skin habits, and counts of completed workouts/project blocks. Home does not show Coffee/ADC counters, set/volume analytics, expense totals or AI action history.
- Empty sections collapse. A quiet/loading/unavailable sentence distinguishes no dated commitments from failed or pending data loading; it is not an empty metric card.
- Calendar/Memo editing stays in its workspace. [QA_HOME.md](docs/QA_HOME.md) and `tests/ui/command.spec.js` describe current behavior.

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
- Health UI saves, AI health writes, `/api/actions?action=health`, and `/api/actions?action=wake` recalculate affected sleep hours when sleep start or wake time changes.
- Health and AI summaries treat habits as standalone stats instead of one generic hygiene total.
- Does not use iPhone Screen Time integration yet.

## Workout Module Current Status

`src/tabs/WorkoutTab.jsx` renders Live, History and Manage from persisted sessions, templates and canonical exercise identities.

- Live starts a template or a named empty workout. Template ID, ordered exercise snapshot and appearance persist independently of later template edits. Starting does not create sets.
- A single exercise picker moves between plan/catalog views with Back and retained scroll. Logging uses convention-aware load labels, reps and optional RPE; warmup is a direct control. Successful save resets warmup/RPE/notes; a failed save retains the draft. Only persisted saves schedule rest.
- Per-exercise drafts, active session and workspace selection survive navigation/reload under account scope. Last time uses canonical identity, not text-only matching. Warmups use W and are excluded from working-set progression/volume.
- Active controls retain the rest settings/countdown in the header, selected exercise sets and End Workout. Legacy WhatsApp Start/Pause/Reset controls, PR/volume summary clutter and active-session date fields remain absent.
- The rest coordinator and hook own async lifecycle/concurrency; construction/disposal do not cancel persisted timers. Notification opt-out is independent of automatic countdown. See [rest coordination evidence](docs/qa/workout-rest-coordination.md).
- Completion acknowledges the saved workout, summary and appearance, provides Back to training and explicit Save as template, and persists dismissal. It does not award the proposed Rankings rewards.
- History filters All/Week/Template through bounded server pages. Editing a historical session does not reopen it or replace the active Live session. Header drafts and independently saved set edits are separate; dirty inline edits need Save/Cancel. Owner editing/deletion uses shared confirmations.
- Manage is the template library/editor, with ordered exercises, appearance and validation. It is not a collapsed legacy Session Control panel.
- Input semantics, numeric limits, internal set numbering and catalog reconciliation remain owned by existing helpers/API/RLS. Consult [QA_WORKOUT.md](docs/QA_WORKOUT.md), [catalog rules](docs/EXERCISE_CATALOG_REVISION.md), and the corresponding browser tests before changes.

## Mobile/iPhone UI Direction

- Preserve the current dark, compact workspace hierarchy and five-destination mobile dock. More exposes secondary modules; desktop keeps primary and utility navigation.
- Fixed app/workout docks are portaled outside containing-block ancestors. Keep shared dock geometry, safe-area padding and keyboard visibility across lazy workspaces.
- Training sheets use shared visual-viewport-aware dialogs, internal scroll, safe initial button focus and no forced numeric keyboard. Preserve thumb-friendly controls and 16px input text.
- Preserve account-scoped continuity, canonical exercise identities, existing History/Manage structure and guarded PWA activation. Do not redesign Workout incidentally to a reliability change.
- Browser coverage is not physical iPhone/PWA acceptance. Test 360, 390, 430, 768, 1024 and 1440px when layout or error content changes; record real-device limits separately.

## Important UX Principles

- Preserve the "Midnight Cyber-Athletics" visual language:
  - `bg-[#0a0a0a]` for the app background.
  - `bg-[#121212]` and black overlays for panels/cards.
  - Subtle borders like `border-white/5` and `border-zinc-800`.
  - Neon accents only for meaningful highlights.
  - `font-mono`/`data-text` treatment for numbers, metrics, logs, and system-like text.
- Keep the UI dense, but not chaotic.
- LifeOS UX principle:
  - Brain should do invisible organization.
  - Users should not manually manage Memory or Vault in normal usage.
  - Valuable analysis should auto-save when it is useful long-term knowledge.
  - Empty dashboard sections should collapse instead of consuming prime space.
  - Home should never fill prime space with zero, empty, or `no ... logged` widgets.
  - Home should show logged signal, not raw widget inventory or absence nags.
  - Logging and following the plan should feel obvious with minimal friction.
  - Brain should feel like the main interface, not a settings/database screen.
  - Brain should be chat-first and viewport-contained on mobile, with scroll isolated to the chat message area.
  - Old data can persist invisibly without being surfaced as normal admin UI.
- The workout flow should be thumb-friendly, fast, and low-friction.
- Real persisted data should be visually prioritized over sample/mock data.
- Use icons for compact controls where appropriate.
- Do not add large decorative hero sections or marketing-style layouts.
- Avoid making mobile worse while improving desktop, and avoid making desktop worse while improving mobile.
- Future UX phases may add Morning Briefing, broader proactive check-in nudges, missed-check-in outreach, and voice logging, but they are not implemented yet.

## Known Issues / Things To Test

- Before adding more external APIs such as Google Calendar sync or broader proactive messaging, deploy against the real Supabase project and run `docs/QA_DEPLOYMENT.md`.
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
  - Confirm a no-data Home does not show zero-value/no-logged widgets.
  - Confirm only logged daily signals appear.
  - Create sleep, memo, habit, workout, and project-session records and confirm Home updates only for those actual signals.
  - Refresh and confirm persisted summaries reload.
  - Confirm 0m project work with existing active projects does not show an Ops nag/card.
  - Confirm expenses and AI action logs do not create Home Money or Recent AI Writes sections.
  - Confirm Home handles blank optional health fields, long labels, and multiple sessions today without horizontal overflow.
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
  - Canonical `/api/actions?action=<action>` calls work for each supported action.
  - Legacy `/api/actions/<action>` paths rewrite to the consolidated endpoint without separate route files.
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
  - Brain shows a viewport-contained chat without Daily Review or suggestion chips.
  - On mobile, the Assistant page itself should not require long scrolling to reach the composer; messages scroll inside the chat widget.
  - App conversations can be selected in the Companion context sheet; persisted WhatsApp continuity must remain channel-scoped.
- Test WhatsApp Bridge v1 after deploying `LIFEOS_WHATSAPP_BRIDGE_SECRET` and `LIFEOS_WHATSAPP_ALLOWED_SENDERS`:
  - Valid bridge requests to `/api/integrations/whatsapp/inbound` return a concise `reply`.
  - Wrong secret returns `401`; unallowed sender returns `403`.
  - WhatsApp messages reuse one backend Brain thread per sender.
  - Brain initially has no selected conversation; the context sheet allows explicit app conversation selection without automatically opening WhatsApp continuity.
  - Pending actions and Working Context work through WhatsApp, including nap-to-calendar follow-ups.
- Test Proactive WhatsApp v1A after running the latest schema:
  - Create a timed memo, call outbox evaluate/poll/ack, and confirm the message is sent once.
  - Confirm ack persists a proactive assistant message in the dedicated WhatsApp Brain thread.
  - Reply `fatto`, `snooze 30`, `annulla`, and `?` from the same sender and confirm memo/outbox behavior.
  - Confirm expired or duplicate reminders are not repeatedly sent after bridge downtime.
- Test LifeOS MCP Server v1.1 after deploying `LIFEOS_MCP_TOKEN` and, for ChatGPT Connector mode, `LIFEOS_MCP_LINK_SECRET` plus `LIFEOS_MCP_OAUTH_SIGNING_SECRET`:
  - `GET /api/mcp` returns only safe capability metadata.
  - POST without a valid token returns `401`.
  - The `401` response includes OAuth resource metadata through `WWW-Authenticate` when OAuth is enabled.
  - OAuth metadata advertises `/api/mcp?mcp_oauth=authorize` and `/api/mcp?mcp_oauth=token`.
  - Direct `GET /api/mcp?mcp_oauth=authorize` returns MCP authorization HTML/errors, not the frontend SPA.
  - `initialize`, `tools/list`, `resources/list`, and `prompts/list` return valid JSON-RPC results.
  - `tools/list` marks read tools with `lifeos.read` and `sync_context` with `lifeos.write`.
  - `get_brain_debug_context` returns compact trace summaries without secrets.
  - Read credentials cannot invoke `sync_context`; authorized sync changes only current belief/curated memory/audit rows and never sends WhatsApp messages.
  - Run `npm run test:mcp`, `npm run smoke:mcp`, `npm run smoke:mcp:oauth`, and `npm run check:functions`; function count must remain at or below 12.
- Test workout session creation with RLS enabled in a real Supabase project.
- Test Workout tab with `docs/QA_WORKOUT.md`, especially template snapshot persistence, nullable RPE, suggestions, and warmup display/edit transitions.
- Test Workout after applying the latest `workouts`, `workout_sets`, `workout_templates`, and `workout_template_exercises` schema migration.
- Test deleting a workout session and confirm associated sets disappear.
- Test editing sets with comma decimals such as `32,5` and `8,5`.
- Test duplicate set number behavior for the same exercise in one session.
- Test ended sessions:
  - End Workout should mark the session complete and clear its live draft.
  - Live set additions/edits remain blocked for completed sessions.
  - History exposes Edit workout and Delete workout directly.
  - Historical edits preserve the original `ended_at`; no reopen action exists.
- Test iPhone Safari:
  - The shell header and normal-flow workout command header should not overlap or create a blank safe-area gap.
  - Bottom nav should not cover Save Set.
  - Inputs should not trigger iOS zoom.
  - No horizontal scrolling.
- Build currently emits a Vite chunk-size warning because the bundle is over 500 kB. This is not a failing build, but future code splitting may be useful.

## Next Recommended Steps

1. Read `git status` before starting: existing local agent/spec/planning documents are not all committed. Preserve them and keep feature commits scoped.
2. Use the current issue tracker and [documentation audit](docs/audits/DOCUMENTATION_STATUS.md), rather than interpreting old release snapshots as pending work. Rest-coordination tickets #6-#8 are complete.
3. Keep physical iPhone notification display, installed-PWA lifecycle and real email delivery acceptance explicit. Recheck Oracle/hosted database state when an infrastructure task requires it.
4. Repair the stale `training-prefill-rest` test locators in a scoped test-maintenance task; their recorded failures do not invalidate the passing 21-case rest/continuity batch.
5. Completed-workout template saving and Brain planner deepening were later architecture candidates, not prerequisites or completed work of this refactor. Rankings remains design-only until separately authorized.

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
