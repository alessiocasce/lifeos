# LifeOS Deployment Guide

Use this guide to deploy LifeOS against a real Supabase project before adding AI or external API automation.

## Required Environment Variables

Set these in local `.env.local` and in the deployment provider environment settings:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

Only use the Supabase anon public key in the frontend. Do not add Supabase service-role keys or other private API keys to this repo or to Vite client variables.

If these variables are missing, the app should show the existing Supabase setup/config screen instead of rendering the LifeOS shell.

## Apply Supabase Schema

1. Open the target Supabase project.
2. Go to SQL Editor.
3. Open `supabase/schema.sql` from this repo.
4. Run the full SQL file.
5. Confirm the main user tables exist:
   - `workouts`
   - `workout_sets`
   - `health_logs`
   - `expenses`
   - `calendar_events`
   - `daily_reviews`
   - `chat_messages`
6. Confirm RLS is enabled and policies exist for authenticated user-scoped access.

The SQL file uses `create table if not exists`, `alter table ... add column if not exists`, and policy recreation so it can be rerun during setup.

## Local Build Check

Install dependencies and build:

```powershell
npm install
npm run build
```

Build command: `npm run build`

Output directory: `dist`

The production build currently emits a Vite warning about chunks larger than 500 kB. This warning is non-fatal and expected for now.

## Deploy On Netlify

1. Connect the GitHub repository to Netlify.
2. Set the build command to:

```text
npm run build
```

3. Set the publish directory to:

```text
dist
```

4. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy.

## Deploy On Vercel

1. Import the GitHub repository into Vercel.
2. Use the Vite framework preset if detected.
3. Confirm the build command is:

```text
npm run build
```

4. Confirm the output directory is:

```text
dist
```

5. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. Deploy.

## iPhone Live QA

1. Open the deployed URL in iPhone Safari.
2. Sign up or sign in.
3. Confirm the mobile shell uses the bottom tab bar.
4. Run `docs/QA_DEPLOYMENT.md`.
5. Pay special attention to:
   - no horizontal scrolling
   - inputs not zooming on focus
   - bottom navigation not covering primary save buttons
   - Health counters and Workout set logging being thumb-friendly
   - data persisting after refresh
   - data being scoped to the signed-in user

## Deployment Readiness Notes

- Run `npm run build` before every deploy claim.
- Apply `supabase/schema.sql` before live QA.
- Do not proceed to AI, chat automation, Google Calendar sync, or other external APIs until the deployed Supabase-backed workflows pass live QA.
