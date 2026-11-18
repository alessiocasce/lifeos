# Technical architecture (PROPOSED, NOT APPLIED)

> Historical archive; not current implementation instructions. Read [PROJECT_CONTEXT.md](../../../../PROJECT_CONTEXT.md) and the parent archive index before using this record.

> ARCHIVED DESIGN HISTORY. Do not implement from this document. See ../PRODUCT-SPEC.md
> for the single current specification and ../FINAL-APPROVAL.md for pending approvals.

## Revision 2 - current proposal, owner approval pending

Add separate private lifetime and timely earned-XP entitlements, immutable workout/set receipt inventory, rule-activation/enrollment boundaries and independent affirmative consent state. No historical set top-up can expand a sealed competitive date. Queue, revision fencing, fail-open logging and read-time privacy architecture remain. No migration is authored/applied here.

The [final corrections](17-final-product-corrections.md) take precedence over conflicting text below.
## Version 1 reference and comparison (superseded where noted)

No migrations or application changes are part of this blueprint. All schema/RPC
names below are future interfaces. Ordinary browser writes must never control
XP, RP, receipts, eligibility, awards, ranking suspension or rule versions.

## Data model

Use a non-exposed lifeos_private schema for authoritative computation, with RLS
defense in depth. Expose only explicitly granted owner/public read RPCs.

| Proposed object | Keys and essential fields |
|---|---|
| progression_rules | version PK, effective_at, immutable definition JSON, digest, status shadow/active/retired |
| competitive_receipts | workout_id PK+owned FK, user_id, first_seen_at, first_completed_at, frozen_rank_date, eligible, reason, source_revision |
| progression_contexts | id PK, user_id, exercise_id, load_type, setup_key, increment, convention, created_at; immutable once used |
| progression_source_fingerprints | user_id+source_workout_id PK, last scored source digest, source dates, source revision; account FK cascades, deliberately no source-workout delete cascade |
| progression_dirty_users | user_id PK, revision bigint, earliest_dirty_date, claimed_revision, lease_until, attempts, next_retry_at, error_code |
| progression_day_facts | user_id+rule_version+date PK, capped n, qualifying, credited XP, source_revision/hash |
| progression_week_facts | user_id+rule_version+monday PK, selected dates, bonus XP, revision/hash |
| progression_entitlements | user_id+rule_version+kind+source_key PK, current_amount bigint, source_revision |
| xp_ledger | id, user_id, rule_version, source_key, revision, signed delta bigint, reason, created_at; UNIQUE(user,version,key,revision) |
| progress_events | id, user_id, canonical exercise_id, context_id, confirmed_date, baseline/support IDs, point, status/revocation reason, rule_version |
| progression_accounts | user_id PK, xp bigint, level bigint, source_revision, ready_revision, status, current league, peak league |
| ranking_snapshots | snapshot_id, rule_version, as_of_date, generated_at, complete flag |
| ranking_rows | snapshot_id+user_id PK, RP int0..1000, exact C/W/P numeric, effective days, status, source_revision; visibility checked on read |
| rank_history | user_id+as_of_date+rule_version PK, raw/display league, RP, source revision, corrected flag |
| achievement_awards | user_id+code PK, unlocked_at, source revision, revoked_at/reason, evidence key |
| progression_style | user_id PK, title code nullable, pinned codes max3 distinct, frame code, accent key, updated_at |
| reward_announcements | event UUID PK, user_id, source_workout_id, source revision, event type, acknowledged_at; dedupe unique logical event |

Add independent private user_preferences columns: rankings_visible,
show_progression, exercise_rankings_visible and share_milestones. Defaults
true/true/false/false for new complete accounts; existing enrollment per09.
Do not widen grants on unrelated preference columns. Body mass, gender, age,
health or private notes are NOT required ranking inputs.

Every user FK cascades on account deletion. Internal evidence referencing a
deleted workout becomes invalid rather than blocking workout deletion; keep only
the minimum aggregated correction audit required, not a second private workout
archive. Public responses never include internal source set/workout IDs.

## Trusted ingress and data provenance

Existing created_at defaults alone are insufficient: current clients insert rows
directly and may supply mutable performed dates. A future BEFORE trigger must
server-stamp first_seen/first_completed and sealed receipt facts. Clients cannot
update/insert receipt tables or overwrite server-owned timestamps through grants.
No change to source workout completion timestamp as an editing workaround.

At first eligible completion choose a frozen Europe/Rome date from the claimed
date only when not in the future and no more than three calendar days before
server first completion. Late/backdated records still get lifetime reconciliation,
but are excluded from RP. Preserve this decision through later History date edits;
do not create a fresh receipt on edited ended_at. A 72-hour allowance is bounded
self-report tolerance, NOT proof of offline capture. Future trusted offline
receipts need a separately reviewed protocol; current PWA drafts are not receipts.

## Queue, locks and fail-open logging

After source workout/set changes, record only a cheap dirty-user revision and
earliest affected date. Do not score inside existing Community writer locks.
Protect the queue mark in a narrow exception block: real set/workout logging
must survive ranking subsystem failure. The selected recovery design is an
hourly full-source reconciliation audit, NOT reliance on an optional tombstone
insert also succeeding inside the failing trigger. Every previously scored
workout has a private source_fingerprint with its original date/week and minimal
digest. These rows survive source deletion, without retaining the workout body.
The audit anti-joins known fingerprints to current owned workouts, detects
deleted credited sources, and compares a canonical SHA256 of current workout/set
IDs, values and timestamps against the last scored account source digest. It
requeues any difference, including changes whose queue mark failed. New rows
deleted before ever being scored have no entitlement to reverse.

Run the audit in account batches with bounded source-ID cursors and a consistent
read snapshot; compare complete digests only after all chunks finish. Do not
pretend a max(updated_at) or row count alone detects deletion/replacement. On
ordinary queue operation rewards reconcile within2 minutes; a lost mark repairs
within60 minutes plus worker lag. Until then show last-scored-as-of honestly.
Direct privacy switches still take effect immediately at read time, independent
of score repair. Tests must deliberately fail the queue mark and then prove the
fingerprint audit repairs credited deletion. This is a correctness launch gate.

Worker takes per-user advisory lock (not Community's global key), leases queued
users with SKIP LOCKED, captures revision R, reads complete source history needed
for affected dates/weeks and 90-day progress baseline plus retained high-water.
Recompute chronology forward when an old comparison changed. Process <=500
source rows/chunk; long replays remain updating and resume by cursor. Do not let
an older replay publish over a newer revision. Recheck revision before publishing;
if changed, retain the new dirty mark and retry, never clear it blindly.

Reconcile entitlements and append signed ledger deltas in one per-user transaction.
Then reconcile progress-dependent badges/styles/peak and publish ready_revision.
Old reward events from corrections/backfill do not create new announcements.
Sum signed ledger rows must equal current entitlements and XP. A failed worker
does not roll back saved workouts; serve owner status updating and no fabricated
reward. Retry 1/5/15/60 minutes, capped at 10 attempts before operator review;
after a source revision changes reset retry budget. Structured errors omit notes,
auth details, private workout names and raw source payloads.

## Scheduling and query cost

Propose one Supabase Cron worker every minute, batch20 users / <=30s budget;
an hourly audit job checks fingerprints as above, with resumable batches and
metrics for last completed full-audit time;
daily Europe/Rome as-of rollover creates a coherent ranking snapshot and bounded
decay work for recently active members. Use local-date calculations, not a fixed
UTC midnight hour. Cron availability is a deployment prerequisite, not confirmed
enabled here. Supabase documents Postgres-backed scheduling:
https://supabase.com/docs/guides/cron . No new Vercel function is required.

Indexes: dirty(next_retry_at,lease_until), source workouts(user_id,performed_on,id),
sets(user_id,workout_id), facts(user_id,version,date), ledger(user_id,created_at),
progress(user_id,exercise_id,context_id,confirmed_date), ranking_rows(snapshot,RP
DESC,user_id), leaderboard XP account ordering, username lower-prefix index.
Use execution plans on realistically sized isolated fixtures before choosing
denormalization. Existing frontend page limits are never a scoring limit.

## RPC contract

- get_my_progression(workout_id nullable): auth.uid only, returns status,
  xp_total as decimal string, level as decimal string, next threshold/progress,
  RP/components, current/peak league, as_of, source/ready revisions and notices.
- list_rankings(category,exercise_id nullable,snapshot_cursor nullable,query):
  authenticated, enum validation, canonical exercise validation, <=50 rows;
  returns as_of/snapshot, rows(public member identity, metric, shared position,
  league, permitted level/title/badges), next cursor and separately pinned self.
- get_public_progression(member_id): sanitized projection only after visibility
  and context consent checks. Missing/private members are indistinguishable.
- set_progression_preferences / save_progression_style: actor from auth.uid,
  optimistic expected_updated_at, unlocked enum references/max3 unique pins;
  cannot accept user_id, points, award code grants or rule version overrides.
- acknowledge_reward(event_id): owner-scoped idempotent acknowledgement, cannot
  create an event or award points. Private worker/admin RPCs have no client grant.

Use SECURITY INVOKER for ordinary owner preference/style writes. Any necessary
SECURITY DEFINER aggregate readers must have search_path='', explicit actor and
visibility predicates, parameter validation and revoked default PUBLIC/anon
EXECUTE before granting authenticated. Worker is internal, inaccessible via a
generic client call. Private schema/grants are not replaced with JWT user_metadata.

## Frontend ownership and integration

New progression service and account-keyed hook; cache by auth UID + source
revision + rule version + snapshot. Abort stale reads on account change, never
persist public board records as if privacy could not be revoked. Existing
Community hash navigation hosts new views. Training logger/history mutations
remain their existing authenticated CRUD/atomic RPC paths. The completion screen
requests rewards only after persisted success; see10 for delayed/failure behavior.
English/Italian interface strings follow existing i18n; canonical exercise IDs
and score values do not change when language changes.

## Worker pseudocode and publication invariant

```
claim user lease; take per-user lock
R := dirty revision; V := active immutable rule version
sources := complete required owned rows from a consistent read snapshot
facts := aggregate valid completed sets by corrected XP date and frozen RP date
new_entitlements := day XP + selected-date week XP under V
progress := replay comparable representatives and retained high-water chronology
rp := bounded formula on rated dates and corroborated events
if dirty revision != R: keep queued; discard this publication; retry
transaction:
  for each old/new entitlement key:
    append unique (user,V,key,R) signed(new_amount-old_amount)
    replace entitlement with new_amount
  reconcile source fingerprints, progress, awards and corrected peak
  publish accounts.ready_revision=R and ranking row with as_of_date
  clear dirty only WHERE revision=R
commit; release lease
```

Use READ COMMITTED with the explicit revision recheck or a consistent source
snapshot plus a separately fenced publication transaction, not a REPEATABLE READ
recheck that cannot see a newer commit. A missed mark is recovered by the hourly
full-source fingerprint audit. This bounded eventual-consistency exception is
visible through last-as-of; it is not a license for cross-account stale responses
or delayed privacy revocation. Every RPC returns rule and source revisions.
