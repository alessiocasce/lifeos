# Current architecture assessment

> Historical archive; not current implementation instructions. Read [PROJECT_CONTEXT.md](../../../../PROJECT_CONTEXT.md) and the parent archive index before using this record.

> ARCHIVED DESIGN HISTORY. Do not implement from this document. See ../PRODUCT-SPEC.md
> for the single current specification and ../FINAL-APPROVAL.md for pending approvals.

## Revision 2 - current proposal, owner approval pending

Production read-only aggregates now show512 completed sets,489 valid working sets,160 whitelist/context candidates (32.72%) and36 sets in exact baseline-ready groups (7.36%). Neither context nor trusted receipt fields currently exist. Architecture facts below remain useful; ranking behavior is still proposed.

The [final corrections](17-final-product-corrections.md) take precedence over conflicting text below.
The earlier architecture assessment follows; proposed-policy details are historical.

Inspected local baseline: 23a4b6256c9b86b8f8cf64bc458fc3f0429623ac.
Repository observations below are not claims about a fresh production DB audit.

| Existing surface | Reuse / constraint |
|---|---|
| workouts | UUID, user_id, performed_on, started_at, ended_at, template snapshot, notes, created_at, updated_at |
| workout_sets | Owned workout FK, canonical exercise_id where mapped, original exercise text, weight, reps, is_warmup, set_number, optional RPE/notes, timestamps |
| Exercise catalog | 224 checked-in identities, 79 active; six load conventions; seven active leaderboard_eligible movements |
| Training | Independent Live/History/Manage; weight/reps prefill, per-exercise drafts, persisted completion |
| History | Read-only default; inline guarded set changes; completed status preserved; canonical grouping from saved sets |
| API | Authenticated Supabase CRUD; expectedUpdatedAt and expectedEndedAt guards; atomic historical exercise deletion RPC |
| Data loading | 25-session keyset pages plus pinned/active retrieval; NOT suitable as a full-history scoring source |
| Profiles | user_profiles username/owned avatar, case-insensitive uniqueness; use existing MemberIdentity |
| Preferences | Private user_preferences; language, workout_sharing, share_workout_notes |
| Community | Feed/Members/hash navigation, paginated sanitized projections, automatic completion/edit/delete synchronization |
| Privacy | Private source owner policies; authenticated projection reads gated again by source completion/preferences |
| PWA | Prompted updates, live-work/unsaved protection, retained drafts; not proof of durable offline set synchronization |
| Deployment | Vite/React 18, Supabase, Vercel; seven route functions; no ranking worker or cron confirmed enabled |

Sources: src/services/lifeosApi.js, src/context/LifeOSContext.jsx,
src/tabs/WorkoutTab.jsx, src/tabs/CommunityTab.jsx, src/components/SharedWorkout.jsx,
src/utils/exerciseCatalog.js, src/utils/date.js, src/index.css; identity/catalog,
automatic Community, historical mutation and active identity/media migrations.
Schema.sql alone is insufficient: forward migrations supersede older defaults.

## Calculations possible now

- Distinct training dates, completed sessions, working-set counts and capped XP.
- Comparable same-identity free-weight sets, subject to conservative matching.
- Personal rep records for a fixed explicitly defined bodyweight variation.
- Persisted completion time intervals where reliable. Duration is NOT scoring.

## Missing or unreliable inputs

- No immutable competitive occurrence/first-receipt/first-completion record.
  created_at defaults are not a receipt guarantee unless writes/grants are sealed.
- Date and performed_at are editable. History inserts use noon UTC on the
  saved historical date. Neither proves physical effort or timely logging.
- No machine station/attachment calibration or standardized movement-context ID.
- No verified body mass, range of motion, technique, assisted-machine calibration,
  spotter validation, wearable proof or anti-fraud ground truth.
- RPE is optional and subjective; do not infer missing effort or reward failure.
- Lifecycle edits/deletions require recomputation, not additive XP callbacks.

## Sensitive boundaries

Community uses an existing global advisory writer gate and synchronous sanitized
projection triggers. Do not add a heavy scoring replay while holding that gate.
Do not grant a browser writes to score tables or reuse service-role Brain owner
APIs for ordinary members. LifeOS's privileged owner-only services remain private.

The catalog currently has an inactive straight-bar curl and an active EZ-bar
identity both named Barbell Curl in English. Preserve their UUIDs; do not guess
historical equipment. Quarantine those identities from exercise-progress credit
until a separately authorized catalog correction is reviewed. Core XP can launch
without exercise-progress awards if visibly labeled, but full hybrid launch is
gated on a trustworthy progress-eligible subset.

## Preliminary concept corrections

Its 15/25 participation points were 60% of the progress component; three weekly
sessions earned 920 RP without improvement. A generic 2% e1RM delta is not proof
of progress. Box-window decay removes whole days abruptly. All-history scoring
cannot run over the frontend's latest 25 sessions. Workout-sharing consent does
not automatically authorize exposing notes or private data through score APIs.
