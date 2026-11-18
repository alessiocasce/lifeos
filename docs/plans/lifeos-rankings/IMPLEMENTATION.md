# Engineering handoff

Authority: [PRODUCT-SPEC.md](PRODUCT-SPEC.md). Rule defaults remain proposed until
the choices in FINAL-APPROVAL.md are accepted. Archive documents are not tickets.
No source/schema changes are authorized by this planning delivery.

## Minimal architecture

Reuse owned workouts/sets and canonical catalog, existing actions/auth and
Community privacy architecture. No new public workout tables or Vercel route.
Keep seven serverless functions. Use private DB computation/RPCs and one bounded
scheduler, not a second event platform, message broker or autonomous AI subsystem.

Proposed private records (consolidate physical tables where natural): immutable
rule versions; owned first-completion/per-set receipt inventory; user/context
definitions; dirty-user revision/lease queue; retained minimal source fingerprints;
versioned entitlements and signed XP ledger; account totals/progress evidence;
daily rank history/snapshots; achievement/style records and deduplicated reward
acknowledgments. Public rows contain ONLY sanitized authorized aggregates.
Per-date/week facts may be computed/cache fields, not mandatory extra tables.

Private lifetime and public-earned entitlements have different kinds/keys. Never
add both to one XP total. Owner reads include precise source/ready revision and
separate public/private values. Public reads never fetch private source sets/notes.
Rule/receipt/score/award writes have no ordinary client grants. Normal style/
preference writes derive actor from auth.uid and compare expected revision.

Source mutations should only mark a cheap dirty revision, not score within the
Community global writer lock. Fail open for logging: failure marking rewards must
not rollback a workout/set. Per-user worker lock, revision fence and idempotent
transaction publish entitlements/ledger/account together. Older replay cannot
replace newer source. Keep source fingerprints without source-delete cascade;
hourly batched full-digest + anti-join audit detects missed edits/deleted credited
sources even if queue marking failed. No raw workout mirror or max(updated_at)-only
deletion detection. Ordinary processing target<=2 min; missed mark repair<=60 min
plus worker lag, accurately labeled stale until reconciled.

One supported DB scheduler every minute (bounded user batches/time budget) and
hourly reconciliation, plus Europe/Rome daily snapshot rollover. Confirm actual
Cron availability/permissions; do not assume it. No full-source scan in app startup.
Use<=500 source rows/chunk, revision-bound cursors and full-history server queries,
never the25-workout client page. Audit chunk completion before comparing digest.
Privacy switches apply synchronously at READ time, independent of worker delay.
If receipt stamping itself fails, preserve the real workout save and report
receipt_unavailable; award private XP after reconciliation, not fabricated RP.
The audit must NEVER reconstruct a supposedly timely receipt from mutable source
timestamps. Restore competitive credit only if independent immutable receipt
evidence exists; otherwise that source stays private-only with an honest reason.

## Independently testable tickets

### A1 - Approve and freeze product rules (launch-critical)
Dependencies: owner decisions1-6 in FINAL-APPROVAL. Modules: this spec, future rule
seed. Behavior: freeze definition/digest/activation boundary, explicit initial
category and Apex rollout flags. Acceptance: one active version, no ambiguous
default. Tests: fixtures map to exact accepted formulas; archive not imported.
Security: no client rule override. Rollback: no activation, shadow only.

### A2 - Seal receipt inventory (launch-critical before competitive credit)
Depends A1. Modules: future narrow migration/private functions on workout/set
ingress; no source date semantics rewrite. Behavior: DB stamps original claim,
first completion and eligible set inventory; later arrivals cannot top up past
competition; first enrollment/activation cutoff. Acceptance: forged timestamps,
set reparenting, ownership changes and late invalid->valid edits cannot mint dates.
Tests: two authenticated users+anon, ordinary grants (not service role proof),
Rome midnight/DST, offline, four-in-one-day exploit, partial failures, concurrent
completion/set writes, reopening/deletion compatibility. Security: fixed search
path, narrow grants, immutable fields, owner predicates, no user_metadata roles.
Rollback: disable competitive scoring; real logging/private history untouched.

### A3 - Exact scoring parity and correction ledger (launch-critical)
Depends A1; competitive inputs depend A2. Modules: isolated production utility/
DB worker, private entitlements/ledger. Behavior: port SPEC 3-7 with rational RP,
BIGINT XP; replacement-day/weekly-bonus reconciliation and signed reversals.
Acceptance: all38 current deterministic tests plus actual DB parity, no double
award after retries/version switch. Tests: half-point rounding,1-5 days, historical
backfill, corrected dates, deletion, same-day splits, numeric overflow, >25/10k
workouts. Security: no direct client mutation. Rollback: keep ledger, stop worker,
do not reverse source history or add two version balances.

### A4 - Queue, scheduler and failure recovery (launch-critical)
Depends A2/A3. Modules: bounded internal scheduler, revision queue/fingerprints.
Behavior: lease/retry1/5/15/60 min, per-user lock, revision fence, resumable digest
audit. Acceptance: saved set survives reward failure; lost mark on credited delete
is repaired; old worker cannot publish newer source. Tests: fault injection in
isolated DB, interrupted chunks, stale leases, scheduler outage, burst imports,
query plans. Security: internal worker not public callable; sanitized error codes.
Rollback: disable jobs/publication, preserve source/ledger and stale-status labels.

### B1 - Private XP and historical reconciliation (initial launch)
Depends A3/A4. Modules: owner-read service/hook, private account totals. Behavior:
resumable backfill of private XP only, no public RP/earned-XP/celebration backfill.
Acceptance: source counts/hashes unchanged; ledger equals entitlements; private
levels survive opt-out. Tests: two users/account switch, revision/status errors,
bounded history, no draft XP. Security: owner-only RPC/auth.uid, decimal-string
totals. Rollback: hide progression feature, logging/Community remain operational.

### B2 - Completion attachment (initial launch)
Depends B1; RP can remain pending/private. Modules: WorkoutCompleted, existing
completion styles, one account-keyed reward hook. Behavior: insert reward section
after Back to training, preserve summary/history/navigation; retry read only.
Acceptance: source-revision matched data, no invented point delta, zero resubmit
on rewards failure. Tests: success/pending/unavailable, failure before completion,
week-bonus delta, historical edits no celebration, long bodyweight summary omits
volume,375/390/430, keyboard/safe area, current continuity guards and auth switch.
Security: no auth/source payload in URLs/logs; QA fixtures excluded production.
Rollback: remove/hide attachment only, leave completion persistence untouched.

### C1 - Context extraction and progress evidence (before public Global)
Depends A2-A4. Modules: private contexts/events and owner setup UI. Behavior:
SPEC 4 two-set representatives, frozen baselines, Pareto novelty, cooldown and
source-dependent replay. Acceptance: no machine/custom/ambiguous-curl inference,
supported-load conventions remain distinct. Tests: real raw set fixtures, mixed
rep bands, unilateral absence, corrections removing old baseline, context changes,
two independent IDs and cooldown. Security: owned context/evidence, no arbitrary
user/exercise escalation. Rollback: disable adapter/event awards, replay affected
RP only; no source remapping. Machine/bodyweight expansion is later per adapter.

### C2 - Rank state machine and daily decay (private preview)
Depends A2-A4/C1. Modules: private rank history and daily snapshot job. Behavior:
hard eligibility ceiling before hysteresis, exact42-day kernel, daily as-of
counter, Apex rollout OFF initially. Acceptance:906/12dates/17 days never Apex,
ordinary eligible880/879 hysteresis correct, loss/recovery of placement correct.
Tests: eleven Apex/daily-boundary regressions, disabled-Apex flag, missed/retried
daily jobs, corrections to peak badges, actual rational score parity. Security:
no browser rank/eligibility flag writes. Rollback: stop publishing RP, private XP
continues; stale score is not zero or a new loss notification.

### D1 - Explicit enrollment and immediate privacy revocation (public prerequisite)
Depends A1/A2/B1. Modules: private preferences, Settings, sanitized read RPCs.
Behavior: all accounts OFF, affirmative independent Join; separate private-profile
progression/exercise/share flags; original enrollment bound retained on rejoin.
Acceptance: existing Workout Sharing never enrolls; old cursor/profile/cache cannot
read opted-out aggregates immediately. Tests: A/B/anon, concurrent privacy/read,
unchanged sharing, stale requests under another login, joinedAt semantics, rejoin
no duplicate XP. Security: no broad grants on preference columns; read-time gates,
PUBLIC/anon EXECUTE revoked, required definers fixed search_path and actor checks.
Rollback: hide all ranking projections, leave private records/source privacy intact.

### D2 - Launch All-time/Consistency; stage other categories
Depends A3/B1/D1. Modules: Community Rankings subview, snapshot keyset queries.
Behavior: SPEC 8 metrics/window/ties, full-population RANK/pinned/search; Global
private preview, Progress collection and Exercise personal records honestly labeled.
Acceptance: no lifetime XP leakage into earned-XP board, exact tuple tie cursors,
no fake position on collections. Tests: ties at page boundary, >50 members,
account/category switch, empty states, opt-out during paging, EN/IT/mobile layout.
Security: authenticated sanitized reads only, no cross-owner source reads.
Rollback: hide Rankings subview/public readers; existing Feed/Members unchanged.

### E1 - Profile rewards (can follow initial launch)
Depends B1/C1/C2, public display D1. Modules: awards/style and existing profile.
Behavior: SPEC 11 predicates, one title/3 pins, owned cosmetic validation,0 bonus XP,
source-revoked safe fallback. Acceptance: once-only unlocks, hidden lifetime
progression unless separately opted in. Tests: all20 predicates, title not owned,
source correction/deletion, duplicate pins, cross-account writes and reduced motion.
Security: unlocked membership checked server-side, never supplied by client.
Rollback: plain profile, retain valid private XP/award audit. Milestone-feed posting
remains OFF/deferred, not a launch dependency.

### F1 - Pilot and public Global/Apex activation (later approval gate)
Depends C1/C2/D1/D2. Modules: server rollout config, aggregate pilot observability.
Behavior: eight-week disclosed pilot, equipment-context coverage/privacy/integrity
review, explicit owner activation. Acceptance: approved coverage gate and staged
category criteria pass, no implication of physical verification; Apex flag applied
before hysteresis. Tests: source/RLS parity, read-time revocation, rollback drill,
rank churn, population tie/coverage analysis, physical iPhone/PWA owner acceptance.
Security: no user-controlled rollout flag, no raw cohort data or small-cell reports.
Rollback: close public Global/Apex gate; clamp current rank as a hard eligibility
change, retain corrected private XP/history. Do not destructively rollback schema.

## Future deployment boundary

No migration supplied/applied in this task. Future work must review targeted
forward migrations, dependency ledger and DB-before-dependent-code order; never
broad db push to repair historical gaps. Verify ordinary-role authorization and
source counts/checksums in isolated fixtures, then controlled production rollout
only with that task's authorization. Existing owner-only Companion/WhatsApp and
OAuth/PWA update behavior remain out of scope.
