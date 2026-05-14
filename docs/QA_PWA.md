# LifeOS PWA QA

Run this against the deployed HTTPS URL after a production build has been deployed.

## Installability

1. Open the deployed app over HTTPS.
2. Confirm `/manifest.webmanifest` loads and contains `LifeOS`, `standalone`, and the expected icon entries.
3. Confirm a service worker registers in browser dev tools after the first load.
4. In iPhone Safari, use Share -> Add to Home Screen.
5. Confirm the Home Screen icon uses the LifeOS icon, not a page screenshot.
6. Open LifeOS from the Home Screen and confirm it launches in standalone mode where iOS supports it.
7. Confirm the status bar blends with the dark LifeOS background.
8. Confirm the LifeOS logo, title, and sign-out button sit below the iPhone time/Wi-Fi/battery area.

## App Shell Cache

1. Load the deployed app once while online.
2. Reopen or refresh the app and confirm it still works online.
3. Turn on airplane mode and reopen the installed app.
4. Confirm the static app shell loads if supported by the browser cache/service worker.
5. Confirm Supabase-backed content shows existing loading or error states instead of fake offline data.
6. Confirm no offline write queue appears for expenses, health, calendar, workouts, or assistant actions.

## Data And Auth Safety

1. Confirm `/api/actions/*` responses are not served from the service worker cache.
2. Confirm `/api/ai/chat` responses are not served from the service worker cache.
3. Confirm Supabase API/auth requests are network requests, not service worker cached responses.
4. Sign in, refresh, and confirm the Supabase session still restores normally.
5. Sign out and confirm the app returns to the auth screen.
6. Sign in as another user and confirm previous-user data is not shown.
7. Confirm `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, and `LIFEOS_ACTION_TOKEN` are not present in built frontend assets.

## iPhone Installed App

1. Open LifeOS from the Home Screen.
2. Confirm Home, Calendar, Health, Workout, Finances, and Assistant have no horizontal page scroll.
3. Confirm bottom navigation safe-area padding works in standalone mode.
4. Confirm the top shell header does not overlap iPhone status icons.
5. Confirm text inputs do not zoom on focus.
6. Open Calendar and create or edit an event.
7. Confirm the mobile full-screen Calendar editor still targets the correct input after keyboard open/close.
8. Confirm the Calendar editor close button respects the top safe area.
9. Confirm Calendar save/cancel controls are not covered by the iPhone bottom area.
10. Confirm the Gemini assistant and Action API features still require their server env vars and do not work from cached API responses.

## Deployment Notes

1. Redeploy after changing PWA metadata, icons, or service worker config.
2. If an old service worker appears stale, close all LifeOS tabs and reopen from the Home Screen after the redeploy.
3. Full offline database functionality is intentionally not implemented.
