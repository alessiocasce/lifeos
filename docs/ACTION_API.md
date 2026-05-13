# LifeOS Action API

The Action API is a small Vercel Serverless API for personal automation. It lets trusted tools such as iPhone Shortcuts create LifeOS records without opening the app.

This is not AI and it does not add chat behavior.

## Security Model

Every request must include:

```text
Authorization: Bearer <LIFEOS_ACTION_TOKEN>
```

Use a long random token. Store it only in Vercel environment variables and trusted automation clients such as iPhone Shortcuts. Do not commit real token values.

The API uses the Supabase service-role key on the server only. Since that key bypasses RLS, every insert/upsert explicitly writes `user_id = LIFEOS_ACTION_USER_ID`.

Never expose `SUPABASE_SERVICE_ROLE_KEY` with a `VITE_` prefix.

## HTTP Behavior

- `POST` creates or updates records.
- `OPTIONS` returns `204` for browser preflight requests.
- Other methods return JSON `405` errors.
- CORS allows `POST`, `OPTIONS`, `Authorization`, and `Content-Type`.
- JSON request bodies are limited to 32kb.
- POST requests require the bearer token. OPTIONS requests do not.
- Every JSON response includes a `requestId`.

Success response:

```json
{
  "ok": true,
  "requestId": "generated-request-id",
  "data": {}
}
```

Error response:

```json
{
  "ok": false,
  "requestId": "generated-request-id",
  "error": "Clear error message"
}
```

## Vercel Environment Variables

Set these in Vercel:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
LIFEOS_ACTION_TOKEN=your-long-random-token
LIFEOS_ACTION_USER_ID=target-auth-user-uuid
```

The frontend still needs:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

Redeploy after changing Vercel environment variables.

## Find LIFEOS_ACTION_USER_ID

In Supabase:

1. Open the project dashboard.
2. Go to Authentication.
3. Open Users.
4. Copy the target user's UUID.
5. Store it as `LIFEOS_ACTION_USER_ID` in Vercel.

## Generate LIFEOS_ACTION_TOKEN

Use a password manager or a command like:

```powershell
$bytes = New-Object byte[] 48
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

Store the generated value as `LIFEOS_ACTION_TOKEN`.

## Endpoints

Replace `https://your-lifeos.vercel.app` and `$TOKEN` with your deployed URL and token.

### Create Expense

```bash
curl -X POST https://your-lifeos.vercel.app/api/actions/expense \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "vendor": "Esselunga",
    "category": "Groceries",
    "amount": "12,50",
    "spent_on": "2026-05-13",
    "notes": "optional"
  }'
```

Required: `vendor`, `category`, `amount > 0`.

`spent_on` defaults to today when omitted.

Limits:

- `vendor`: 120 characters
- `category`: 80 characters
- `amount`: greater than 0 and less than or equal to 100000
- `notes`: 1000 characters

### Upsert Health Log

```bash
curl -X POST https://your-lifeos.vercel.app/api/actions/health \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "logged_on": "2026-05-13",
    "sleep_hours": 8,
    "sleep_start": "01:30",
    "wake_time": "09:40",
    "energy": 8,
    "water": 3,
    "coffee": 1,
    "adc": 0,
    "notes": "optional"
  }'
```

`logged_on` defaults to today. The API upserts by `user_id + logged_on` and only updates fields provided in the request.

Omitted fields preserve existing health values. Explicit `null` or empty strings clear nullable fields: `sleep_hours`, `sleep_start`, `wake_time`, `energy`, and `notes`. Counter fields must be valid integers when provided.

Validation:

- `sleep_hours`: optional, 0-24
- `sleep_start`, `wake_time`: optional, `HH:MM`
- `energy`: optional, integer 1-10
- `water`, `coffee`, `adc`: optional, integers 0-100
- `notes`: 2000 characters

### Create Calendar Event

```bash
curl -X POST https://your-lifeos.vercel.app/api/actions/calendar \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Dentist",
    "event_date": "2026-05-13",
    "start_time": "15:30",
    "end_time": "16:30",
    "category": "personal",
    "location": "optional",
    "notes": "optional",
    "status": "planned"
  }'
```

Required: `title`, `event_date`.

`status` defaults to `planned` and must be `planned`, `done`, `skipped`, or `cancelled`.

Limits:

- `title`: 160 characters
- `category`: 80 characters
- `location`: 200 characters
- `notes`: 2000 characters
- `start_time` and `end_time`: optional `HH:MM`
- if both times are provided, `end_time` must be later than `start_time`

## iPhone Shortcuts Setup

Create a shortcut with:

1. Get Contents of URL.
2. URL: `https://your-lifeos.vercel.app/api/actions/<endpoint>`.
3. Method: `POST`.
4. Headers:
   - `Authorization`: `Bearer <LIFEOS_ACTION_TOKEN>`
   - `Content-Type`: `application/json`
5. Request Body: JSON.

Keep the token private. Treat anyone with the token as able to create records for `LIFEOS_ACTION_USER_ID`.

## Curl Smoke Tests

Use these against the deployed Vercel URL after setting environment variables.

Missing auth should return `401`:

```bash
curl -i -X POST https://your-lifeos.vercel.app/api/actions/expense \
  -H "Content-Type: application/json" \
  -d '{"vendor":"Test","category":"Test","amount":1}'
```

Invalid token should return `401`:

```bash
curl -i -X POST https://your-lifeos.vercel.app/api/actions/expense \
  -H "Authorization: Bearer wrong-token" \
  -H "Content-Type: application/json" \
  -d '{"vendor":"Test","category":"Test","amount":1}'
```

Invalid payload should return `400`:

```bash
curl -i -X POST https://your-lifeos.vercel.app/api/actions/calendar \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"","event_date":"not-a-date"}'
```

Preflight should return `204`:

```bash
curl -i -X OPTIONS https://your-lifeos.vercel.app/api/actions/expense
```

## Manual QA

1. Deploy to Vercel with all Action API env vars set.
2. Call each endpoint with no `Authorization` header and confirm it returns `401`.
3. Call each endpoint with an invalid token and confirm it returns `401`.
4. Send an `OPTIONS` request and confirm it returns `204` without a token.
5. Send a non-POST/non-OPTIONS request and confirm it returns a JSON `405`.
6. Send a JSON body larger than 32kb and confirm it returns `413`.
7. Call each endpoint with invalid required fields and confirm it returns clear `400` errors.
8. Create an expense and confirm it appears in Finances/Home for the configured user.
9. Upsert today's health log twice and confirm the second call updates the same row.
10. Send `null` for `energy` or `sleep_start` and confirm the existing value is cleared.
11. Create a calendar event and confirm it appears in Calendar.
12. Try a calendar event where `end_time` is earlier than `start_time` and confirm it is rejected.
13. Sign in as another user and confirm the action-created records are not visible.
