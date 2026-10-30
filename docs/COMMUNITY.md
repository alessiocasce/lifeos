# Automatic Community Sharing

## Current product contract

Workout Sharing defaults ON for newly created or previously unset preferences;
explicit existing OFF choices are never overwritten. Notes default OFF. A member
must author a public profile before anything appears; no identity is inferred
from email/auth metadata. Signup and Settings disclose that past and future
completed workouts are visible to authenticated members while sharing is ON.

ON reconciles all eligible completed history; OFF withdraws all projections
immediately in the same transaction. Re-enabling restores eligible history.
Notes ON includes permitted historical session/set notes; OFF removes them.
History has only View in Community, not individual publication controls. Details
are read-only, including for their author. Owner editing stays in Training.

## Database lifecycle

Private workouts, sets and templates retain owner-only RLS. Community reads the
existing sanitized `community_workout_shares` snapshot table, with SELECT on
approved columns only. Source workout IDs, notes when disabled, email, health,
outbox and private preferences are not projected. Anonymous reads are denied.

Private fixed-search-path sync functions run from source/profile/privacy triggers:
unfinished/zero-set/>500-set/no-profile/OFF workouts are not published; completion
creates a projection, edits/sets refresh it, reopen/delete withdraw it. Unique
source references and conditional UPSERT preserve IDs/row versions on no-op sync.
Read-time RLS independently checks current master/notes permission, profile and
source completion, so a stale/corrupt projection cannot override current privacy.
The visibility helper is callable by the policy, not exposed through the API.
Projection failure deletes any old snapshot and emits SQLSTATE-only WARNING;
source logging survives. Failure to revoke cannot be silently ignored.

BEFORE STATEMENT advisory writer gates serialize relevant source/profile/privacy
writes, including service-role writes and auth insert/delete cascades, before row
locks. This deliberately coarse gate suits the current small community; readers
never take it. Do not add source writers that acquire row locks first. Future
high-volume scaling should replace the gate through one coordinated protocol,
not remove it from one path. Source writes and privacy changes commit atomically.

Auth insert initializes preferences. Profile creation backfills history, preserving
existing opt-outs. Preference language-only updates do not reconcile workouts.
A deleted/malformed settings row fails closed until recreated. Admin sync helpers
are not callable by ordinary clients. The obsolete manual publish/withdraw RPCs
are dropped; cached old UIs must refresh. `workout_share_status` remains owner-only
read access. The old feed read contract remains for cached clients.

`community_feed_v2` uses server-side keyset pagination by performed_on DESC, UUID
DESC, 10/page. Publication timestamps remain audit metadata; cards show workout
dates, not bulk-backfill dates. Catalog IDs localize in English/Italian, including
inactive identities; authored custom names are not guessed or translated.

UI requests capture auth identity; account-keyed mounts/generations reject stale
responses. Feed/details revalidate on focus/resume and every 30 seconds while
visible. All new DB reads honor revocation immediately; already-read data cannot
be retracted from a device. No persistent Community browser cache exists.

## Authorized degra provisioning

The admin-only `configure_degra_member(uuid)` validates the reviewed existing
account's two completed workouts/16 sets, refuses unrelated profiles and username
collisions, creates `degra` / `degra`, and enables sharing with notes OFF. It
preserves language, auth account, all source records and casce's identity. No
private UUID is committed. Repeated provisioning is a no-op. If the cohort changes,
stop and re-audit instead of relaxing the guard blindly.

## Verification and rollout

Use `npm run test:community`, `test:social-training`, `test:workout`,
`test:workout:rest`, `test:schema`, targeted Community/Training/auth browser cases,
catalog/schema/i18n checks, syntax/diff checks, function gate and production build.
Do not run the full UI matrix. `supabase/operations/verify_community.sql` exercises
current automatic behavior under authenticated A/B/anon roles in a rollback-only
transaction. It creates no permanent production fixtures.

Capture restricted recovery data with the opt-in backup script. Rehearse the actual
capture using `LIFEOS_COMMUNITY_REHEARSAL_FILE=<restricted path> node scripts/rehearse-automatic-community.js`.
This proves restoration/data preservation but does not verify managed PITR status.
Apply only the two new forward migrations, reconcile assigned filenames and seal
hashes; never broad db push or rewrite applied SQL. Verify projection counts,
source hashes, notes, grants and advisors before pushing. Let GitHub deploy Vercel.

Manual acceptance: check casce/degra profiles and historical dates, complete/edit/
reopen a real workout, toggle global sharing OFF/ON, and verify notes OFF/ON/OFF.
Check both languages and iPhone navigation/draft recovery. Browser tests do not
prove physical iPhone background or WhatsApp rest delivery. No rankings added.
