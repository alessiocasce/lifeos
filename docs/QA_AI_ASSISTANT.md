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
7. Confirm the selected-date workout context card also excludes warmups from set count and volume.
8. Ask a broad question with no data and confirm it does not invent records.

## Low-Risk Writes

1. Ask: `Add a 25 dollar expense for ChatGPT Plus.`
2. Confirm an expense is created and appears in Finances/Home after refresh.
3. Ask: `add a 25 euro expense for ChatGPT Plus on 13/05/26. The category should be "Subscriptions"`
4. Confirm it creates `ChatGPT Plus`, amount `25`, category `Subscriptions`, spent on `2026-05-13`.
5. Ask: `25 euro expense for chatgpt plus`.
6. Confirm the saved expense category is `Subscriptions`, not `subscriptions`.
7. Confirm the success message is deterministic and uses the saved normalized category.
8. Ask with `13/05/2026` and confirm DD/MM/YYYY dates normalize correctly.
9. Ask with `25 euro`, `€25`, `25 dollar`, `$25`, and `12,50` in test expenses and confirm amounts validate correctly.
10. Ask: `Plan the dentist for tomorrow from 2 to 3 pm.`
11. Confirm a calendar event is created with the right date and times.
12. Confirm AI-created calendar events use preferred categories where possible: Work, Study, School, Health, Workout, Errands, Personal, Social, Entertainment, Sleep.
13. Ask for an event with a lowercase preferred category such as `work` or `study`.
14. Confirm the created event stores/displays the preferred category casing, such as `Work` or `Study`.
15. Ask: `Create an event today: take my mom to an appointment from 3:45 PM to 5:30 PM.`
16. Confirm the created event uses `Errands` or `Health` depending on whether Gemini frames it as logistics or a medical appointment.
17. Ask: `Plan dinner with friends tonight.`
18. Confirm the created event uses `Social` or `Entertainment` depending on wording.
19. Ask: `Block 30 minutes for journaling.`
20. Confirm the created event uses `Personal`.
21. Ask: `plan these events for today: science study session from 12:45pm to 2:15pm, lunch from 2:15pm to 2:30pm, study session from 2:30pm to 3:45pm, plan with mom (i gotta take her to the doctor) from 3:45 to 5:30 pm`
22. Confirm created events store/display canonical times: `12:45-14:15` Study, `14:15-14:30` Health, `14:30-15:45` Study, and `15:45-17:30` Health or Errands.
23. Ask: `Log 8 energy and 1 coffee today.`
24. Confirm today's health log updates without overwriting omitted fields.
25. Ask with missing expense amount and confirm the assistant asks one concise clarification.

## Health Habit Context

1. Create several Health logs with different Brush, Shower, Creatine, Skin, and Journal values.
2. Ask: `Analyze my sleeping behaviour and daily habits in the last 7 days.`
3. Confirm the assistant sees standalone habit stats rather than one generic hygiene total.
4. Confirm Journal is treated as a yes/no daily stat.
5. Confirm Water is not emphasized in the assistant health analysis, while old Action API compatibility remains available if explicitly used.

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
12. Confirm Markdown and callouts still render after provider-error and deterministic-write changes.

## Provider Errors

1. Simulate or observe Gemini `429` and confirm the UI says `Gemini rate limit reached. Try again shortly.`
2. Simulate or observe Gemini `500` or `503` and confirm the UI says `Gemini is temporarily unavailable. Try again shortly.`
3. Simulate Gemini `400` and confirm the UI says `Gemini rejected the request.`
4. Confirm the error card shows `requestId` when returned.
5. Confirm provider status is shown as `Provider: 503` or the relevant status.
6. Confirm safe provider messages can appear, but no stack traces, API keys, bearer tokens, or env values appear.
7. Confirm invalid planner JSON returns `Gemini returned an invalid planner response.` and no write is executed.
8. Confirm complex analysis can still use multiple Gemini calls, while simple create expense/calendar/health writes avoid the final answer call.

## Mobile / iPhone

1. Open Assistant on iPhone Safari.
2. Confirm `Ask LifeOS` appears above Daily Review.
3. Confirm no range/scope dropdowns exist.
4. Confirm prompt chips are tappable.
5. Confirm the textarea uses 16px text and does not zoom.
6. Confirm the send button is thumb-friendly and not covered by bottom nav.
7. Confirm Daily Review remains usable below the AI chat area.
