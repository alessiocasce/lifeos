# LifeOS AI Assistant QA

Run this after deploying to Vercel with:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LIFEOS_ACTION_USER_ID`
- `LIFEOS_ACTION_TOKEN`
- `GEMINI_API_KEY`
- optional `GEMINI_MODEL`

The in-app Assistant sends the signed-in user's Supabase access token to `/api/ai/chat`. The backend verifies that user against `LIFEOS_ACTION_USER_ID`. The endpoint also accepts the action token for trusted server/tool callers.

## API Security

1. Call `POST /api/ai/chat` with no `Authorization` header and confirm `401`.
2. Call it with an invalid bearer token and confirm `401`.
3. Set a wrong signed-in user and confirm the backend rejects it.
4. Temporarily remove `GEMINI_API_KEY` in a test deployment and confirm a clear config error.
5. Confirm no response includes `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, or token values.

## Planner And Analysis

1. Ask: `How have I been doing in the last 30 days?`
2. Confirm the assistant reads persisted LifeOS context and mentions sparse data if applicable.
3. Ask: `Analyze my expenses in the last 3 months.`
4. Confirm it uses expenses and the 3-month range.
5. Ask: `Am I progressing in workouts?`
6. Confirm warmups are not treated as working volume or PR evidence.
7. Ask a broad question with no data and confirm it does not invent records.

## Low-Risk Writes

1. Ask: `Add a 25 dollar expense for ChatGPT Plus.`
2. Confirm an expense is created and appears in Finances/Home after refresh.
3. Ask: `Plan the dentist for tomorrow from 2 to 3 pm.`
4. Confirm a calendar event is created with the right date and times.
5. Ask: `Log 8 energy and 3 waters today.`
6. Confirm today's health log updates without overwriting omitted fields.
7. Ask with missing expense amount and confirm the assistant asks one concise clarification.

## Analyze And Plan

1. Ask: `Analyze my last week and plan a 20% more productive day for tomorrow.`
2. Confirm it reads recent calendar/daily review/health context.
3. Confirm it creates a reasonable small calendar plan automatically.
4. Confirm no more than 8 events are created.
5. Confirm events are for tomorrow, have valid times, and do not overlap.
6. Confirm invalid proposed events are skipped and reported.

## Blocked Destructive Requests

1. Ask: `Delete my dentist appointment tomorrow.`
2. Confirm no record is deleted.
3. Confirm the assistant explains deletion is not enabled for v1.
4. Ask: `Wipe all my expenses.`
5. Confirm no destructive mutation runs.

## Response Rendering

1. Ask for an analysis response and confirm `**bold labels**` render as bold, not raw asterisks.
2. Confirm bullet lists render as indented lists.
3. Confirm numbered lists render as ordered lists.
4. Confirm inline code renders as a compact dark chip.
5. Confirm fenced code blocks are scrollable and do not create mobile horizontal overflow.
6. Confirm `[good]...[/good]`, `[warn]...[/warn]`, `[bad]...[/bad]`, `[info]...[/info]`, and `[action]...[/action]` render as compact colored LifeOS callouts.
7. Confirm unknown tags such as `[critical]...[/critical]` render as plain text and do not create custom styling.
8. Confirm broken or unclosed callout tags do not crash the Assistant.
9. Confirm raw HTML from a response renders as text or is ignored, and never executes.
10. Confirm user messages remain plain text and do not render Markdown.
11. Confirm action result cards still render below assistant content.

## Mobile / iPhone

1. Open Assistant on iPhone Safari.
2. Confirm `Ask LifeOS` appears above Daily Review.
3. Confirm no range/scope dropdowns exist.
4. Confirm prompt chips are tappable.
5. Confirm the textarea uses 16px text and does not zoom.
6. Confirm the send button is thumb-friendly and not covered by bottom nav.
7. Confirm Daily Review remains usable below the AI chat area.
