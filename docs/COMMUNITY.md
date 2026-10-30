# Community / Shared Workouts

Phase 2 is member-only. Community is a lazy-loaded top-level destination at
`/community`, with Feed and Members views. Mobile navigation exposes Community
directly; Projects remains in More. Detail/profile hash links survive reload/back.
No rankings, reactions, following, notifications or automatic publication exist.

## Privacy boundary

Private workouts/sets/templates retain their owner-only RLS. The separate
`community_workout_shares` table stores a sanitized JSONB set snapshot, title,
date, counts and optional notes. JSONB keeps the small immutable published unit
atomic without duplicating private IDs or coupling public reads to private RLS.
Owners can revoke from Community detail too, including shares older than the
private 25-session cache, using their public share ID without exposing source IDs.
Authenticated users have SELECT only on approved columns, never source workout
IDs. Anonymous access and direct client mutations are revoked. Feed reads use
`community_feed` keyset pagination (10/page, timestamp + UUID); public profiles
are joined once. Member search is server-filtered/paginated, not private history.

`publish_workout_share` derives auth.uid(), locks preferences and the owned source,
requires a profile, master publishing permission and persisted ended_at, and builds
only approved fields. Preview uses the same builder without writing. Confirm is
an explicit per-workout action. A unique source reference makes retries idempotent.
At most 500 sets are published; title/notes previews reflect 120/2000 character
limits. RPE is optional. Canonical IDs localize even inactive entries; null-ID
custom names remain authored text, never guessed from ambiguous aliases.

Master sharing OFF or deleting preferences removes all shares transactionally.
ON never restores them. Notes OFF scrubs session/set notes and consent from all
existing snapshots; ON never restores notes. Per-share notes consent defaults OFF,
even when the global notes permission is ON. Source edits, inserts/deletes of sets,
reopening and source deletion withdraw the share; explicit republishing is needed.
Trigger/RPC helpers have fixed search paths and minimal grants. Parent/set ownership
is checked before source invalidation so foreign parent IDs cannot revoke shares.

Community has no persistent browser cache. Requests bind a captured auth token;
account-keyed mounts and generation checks discard stale requests. Detail is
revalidated on focus/resume and every 30 seconds while visible. Data already read
cannot be retracted from a viewer's device, but every new DB read honors revocation.
Feed refreshes on focus/resume. No private source IDs or raw DB errors are rendered.

## Approved second cohort

Admin-only `map_second_training_cohort(uuid)` refuses any distribution other than
the approved 3/3/3/4/3 five-name cohort (16 sets). It accepts a repeat run only if
every row already has the exact target ID/text. No global ambiguous aliases or
private user IDs are committed. Timestamp trigger modes are restored transactionally.
The reviewed account has no template exercises or snapshot references; unexpected
ones abort. Backup/rehearsal precedes correction. Main-account rows are unchanged.

## QA and rollout

Run `npm run test:community`, `test:social-training`, `test:workout`,
`test:workout:rest`, targeted `tests/ui/community.spec.js` and Training continuity,
prefill/rest/template cases. Also run catalog/schema/i18n generation checks,
syntax/diff checks, function gate and build. Do not run the whole UI matrix.
Production role verification is `supabase/operations/verify_community.sql`: it
creates rollback-only users/workouts and tests actual A/B/anonymous permissions,
notes/master revocation, no resurrection, source invalidation and keyset pages.
Never leave fake production posts. Restricted recovery capture is
`LIFEOS_CAPTURE_COMMUNITY_BACKUP=true node --env-file=.env.local scripts/backup-community-rollout.js`.
Managed PITR availability is not proven by this logical backup.

Apply only new targeted forward migrations; never broad db push. Reconcile the
connector's actual versions and seal their hashes. No owner-only Brain, WhatsApp,
MCP or rest-timer permission changes; no new Vercel function.

Manual acceptance: enable sharing in Settings (defaults OFF), open a completed
workout in Training History, inspect/cancel preview, confirm with notes unchecked,
view from another member, stop sharing and verify old link unavailable. Repeat
with explicit notes consent, turn notes OFF, then master OFF/ON; nothing should
resurrect. Edit/reopen a shared source and verify withdrawal. Check both languages,
custom exercises, History/draft return, and iPhone keyboard/dialog ergonomics.
Physical iPhone background/rest WhatsApp acceptance is not browser-test proof.
