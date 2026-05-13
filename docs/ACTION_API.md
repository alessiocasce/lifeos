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

Validation:

- `sleep_hours`: optional, 0-24
- `sleep_start`, `wake_time`: optional, `HH:MM`
- `energy`: optional, integer 1-10
- `water`, `coffee`, `adc`: optional, integers >= 0

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

## Manual QA

1. Deploy to Vercel with all Action API env vars set.
2. Call each endpoint with no `Authorization` header and confirm it returns `401`.
3. Call each endpoint with an invalid token and confirm it returns `401`.
4. Call each endpoint with invalid required fields and confirm it returns clear `400` errors.
5. Create an expense and confirm it appears in Finances/Home for the configured user.
6. Upsert today's health log twice and confirm the second call updates the same row.
7. Create a calendar event and confirm it appears in Calendar.
8. Sign in as another user and confirm the action-created records are not visible.
