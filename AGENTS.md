# Repository Guidelines

## Project Context First

LifeOS is a Vite + React 18 app with Supabase data, Vercel serverless APIs, Brain AI workflows, WhatsApp integration, Vault retrieval, and PWA behavior.

Before changing code, read `PROJECT_CONTEXT.md`. Treat it as the source of truth for architecture, constraints, recent decisions, and known risks.

## Project Structure

- `src/` contains frontend code.
- `src/tabs/` contains main app screens such as `HomeTab.jsx`, `WorkoutTab.jsx`, and `AIAssistantTab.jsx`.
- `src/components/` contains shared UI and shell components.
- `src/context/LifeOSContext.jsx` owns app state and data loading.
- `src/services/` contains frontend API wrappers.
- `api/` contains Vercel serverless endpoints.
- `api/_utils/` contains shared backend utilities for Brain, Supabase, actions, dates, Vault, tracing, and validation.
- `supabase/schema.sql` is the database source of truth.
- `docs/` contains QA and deployment checklists.
- `public/` contains PWA icons and static assets.

## Build, Test, and Validation

Run validation before finishing changes:

```bash
npm run test:brain
npm run build
git diff --check
```

For changed backend files, also run:

```bash
node --check api/changed-file.js
```

If behavior changes, update the relevant docs:
- `docs/QA_AI_ASSISTANT.md`
- `docs/QA_FULL_APP.md`
- `docs/QA_DEPLOYMENT.md`
- module-specific QA docs if present

There is no full automated regression suite yet, so preserve and expand QA checklists.
Brain has a focused deterministic harness; run `npm run test:brain` before and after Brain, WhatsApp, pending-action, command-draft, working-context, Vault gate, or sleep/wake command changes.

## Brain-Specific Rules

Brain reliability is critical. Do not weaken write guards, destructive-action protections, pending-action handling, working context, trace debugging, or WhatsApp thread continuity.

For Brain bugs, inspect traces before guessing:
- `ai_chat_messages.metadata.brain_trace`
- Vercel `BRAIN_TRACE` logs when `LIFEOS_BRAIN_DEBUG=true`
- HTTP debug when `x-lifeos-debug: true`

Simple explicit writes should stay low-friction and should not trigger unnecessary Vault retrieval unless analysis/context is requested.

Sleep start uses the canonical structured `log_sleep_start` behavior. Do not regress it into generic health notes.

When fixing Brain behavior, prefer durable protocol/normalization fixes over one-off prompt patches for a single sentence.

## WhatsApp-Specific Rules

WhatsApp is a low-friction Brain interface, not a separate assistant.

Preserve:
- sender validation
- shared Brain routing/action behavior
- thread continuity
- pending-action confirmations
- concise replies
- debug trace support

Do not send debug JSON as WhatsApp text. Debug may be returned in HTTP JSON or printed by the bridge, but user-facing WhatsApp replies must remain clean.

## UI Rules

Keep Home signal-first. Do not reintroduce zero-value cards, Money cards, empty nags, or AI write clutter unless explicitly requested.

Workout UI is mostly stable; avoid redesigning it unless requested.

Brain UI should stay minimal, mobile-safe, and frictionless. Avoid exposing Vault/Memory/admin surfaces as primary UI unless explicitly requested.

## Coding Style

Use ES modules, React functional components, hooks, and existing Tailwind patterns. Match the current style: 2-space indentation, semicolons, single quotes, and concise helper functions.

Use PascalCase for React components and camelCase for functions/variables.

Prefer existing helpers before adding abstractions. Keep edits scoped to the requested module.

## Security & Configuration

Never expose server secrets in frontend code. Keep these server-only:
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- action tokens
- WhatsApp bridge secrets
- Vercel/Supabase admin keys

Frontend env vars must use only safe `VITE_` values.

Do not log secrets, auth headers, provider keys, or raw private internals. Brain traces must remain sanitized.

## Schema Discipline

Do not change `supabase/schema.sql` unless necessary. If schema changes are required, clearly report:
- what changed
- whether schema must be rerun
- migration risks
- validation status

No-schema changes should explicitly say: `No schema rerun required`.

## Commit Rules

Use short imperative commit subjects, for example:

```text
Fix sleep-start pending normalization
Add Brain trace debugging
Polish Brain mobile scroll
```

Commit and push only when the user explicitly asks or the task prompt includes it.

Final reports should include:
- files changed
- what changed
- validation results
- schema note
- commit hash if committed
- remaining risks
