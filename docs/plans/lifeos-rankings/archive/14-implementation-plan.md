# Future implementation tickets

> Historical archive; not current implementation instructions. Read [PROJECT_CONTEXT.md](../../../../PROJECT_CONTEXT.md) and the parent archive index before using this record.

> ARCHIVED DESIGN HISTORY. Do not implement from this document. See ../PRODUCT-SPEC.md
> for the single current specification and ../FINAL-APPROVAL.md for pending approvals.

## Revision 2 - current proposal, owner approval pending

MilestoneA must now resolve the six owner approvals in document17, receipt-inventory sealing and representative coverage gate. Stage public Progress/Exercise, do not launch capped pseudo-rankings. Add adapters without changing user training; require proposed80% enrolled-pilot coverage of two contexts before broad Global launch. Existing implementation sequencing/rollback guidance remains useful.

The [final corrections](17-final-product-corrections.md) take precedence over conflicting text below.
## Version 1 reference and comparison (superseded where noted)

Nothing here authorizes implementation/deployment. Each milestone must preserve
the released Training/History/completion and existing Community projections.
Complexity estimates are relative engineering effort, not delivery promises.

## A - Data integrity and deterministic foundations (high risk / XL)

Dependencies: owner accepts rules; separate curl correction approved; verify
Supabase Cron availability, sealed timestamp/grant behavior and fingerprint audit.
Database: versioned rules, contexts, server receipts, retained source fingerprints,
private queue/facts/entitlements/ledger; no public rank rows yet.
Backend: deterministic SQL/JS parity engine and per-user revision worker.

- A1: Audit canonical/context whitelist and quarantine ambiguous identities;
  preserve UUID/original text. Acceptance: incompatible identities never merge.
- A2: Forward migration receipts/change capture; authenticated A cannot alter
  first receipt/frozen date or create B's facts. Completion/source editing stays.
- A3: Port engine and golden fixtures, exact arithmetic, XP date/week reconciliation.
- A4: Worker lease/revision/retry and hourly fingerprint/anti-join audit, logging-failure isolation.
- A5: Full-history backfill dry-run with per-user totals, source counts/checksums.

Tests: two users + anon, four-/eight-set boundaries, aliases, same-day sessions,
late/future/backfilled date, correction/deletion, lost queue mark/deletion audit, crash/retry,
replay older revisions, DST, >25/10k workouts, numeric overflow and migration
fresh-schema/upgrade parity. Done: no direct client score writes; ledger equals
entitlements; source data unchanged. Rollback: disable worker/feature flags,
retain private forward schema; do not reverse workout or catalog identities.

## B - Private lifetime progression (medium / L)

Depends A. Database: progression_accounts, private entitlement summaries and
acknowledgment events. Backend owner-only read RPC, decimal-string large values.
Frontend: progression service/account keyed hook and focused lifetime view.

- B1: Private XP/level read, status/error/stale semantics and exact thresholds.
- B2: One-time historical reconciliation with resumable checkpoints, no celebrations.
- B3: English/Italian level progress, days/caps explanation and corrected-data state.

Tests: 1-5 frequencies, edits/deletes with replacement day/week bonuses, >JS-safe
totals, auth switch, unchanged History fields. Done: source revision matching
and no cache leak. Rollback: hide private progression UI; training unchanged.

## C - Competitive rank and decay (high / L)

Depends A+B. Database: corroborated progress evidence, rank snapshots/history,
private league/peak/placement facts. Backend daily snapshot generation with
kernel, context extraction, event revocation and exact deterministic scores.

- C1: Setup contexts and opt-in progress whitelist; machine/no-baseline reasons.
- C2: Confirmation/high-water replay, late policy and frozen competitive dates.
- C3: Six leagues, placement/Apex gates, two-day demotion hysteresis, peak repair.
- C4: Daily local-date rollover jobs and snapshot/queue observability.

Tests: all 20 scenarios and golden760, day14/15/27/28 boundaries, 1/3/7/14/21/28
inactive dates, recovery/return, no double decay, two scheduled snapshots missing
one date, old progress evidence deletion. Done: advanced and beginner viable,
no unsupported contexts awarded, worker outage not treated as inactivity.
Rollback: disable public snapshot publication; retain private XP and source logs.

## D - Community leaderboards and privacy (high / L)

Depends C. Database: independent visibility preferences, sanitized snapshot RPCs
and supporting indexes; no new Vercel route. Frontend: Rankings tab, filters,
search, keyset pages, self row and member profile entry via existing navigation.

- D1: Enrollment defaults preserving existing opt-outs and incomplete profiles.
- D2: Five category queries with full-snapshot RANK(), tie-safe cursor/pinned row.
- D3: Public read-time revocation and separate exercise opt-in; all-time/profile
  progression obey show_progression. Account/request cache isolation.
- D4: Mobile responsive views and honest no-baseline/private/unranked states.

Tests: public/default/private matrix, old cursor after opt-out, stale profile/cache,
two-user/anon RLS, search stable place, ties across page edge, many members,
long usernames/translated labels, 375/390/430 and desktop; physical device later.
Done: no private source reads enabled. Rollback: hide Rankings/public RPC grants,
preserve existing Feed/Members/workout sharing and private XP.

## E - Rewards and profile customization (medium / L)

Depends B+C; public presentation depends D. Database: achievements, style and
source-linked unlock events. Frontend: collection, requirement dialog, title/frame/
accent picker and three pins. Backend validates actual entitlements on every save.

- E1: Implement all20 badge predicates and twelve titles; no bonus XP.
- E2: Atomic style save with expected revision; revoked cosmetic falls back safely.
- E3: Optional rare milestone Feed projection, separate explicit share consent
  and seven-day cap; existing workout shares not duplicated.

Tests: repeat unlocks, corrected peak/source revocation, title not owned, four pins,
duplicate pins, visibility toggles, source deleted with shared milestone. Done:
no reward loop or false current league frame. Rollback: plain profile styling;
retain entitlement evidence and XP, revoke milestone public reads if necessary.

## F - Completion attachment and controlled rollout (high / M)

Depends A-E. No completion redesign. Backend owner-view reward status contract;
frontend small reward attachment AFTER existing completion persistence succeeds.

- F1: Ready/updating/unavailable states, source revision fence and bounded retries.
- F2: Cross-device announcement acknowledgment, one summary per workout, no edits/
  backfill replay, no blocking Back to training/History.
- F3: Shadow all-owner scoring, compare aggregate totals, then internal test cohort,
  then public opt-in cohort, then disclosed default enrollment. No surprise writes.
- F4: Read-only production verification, source checksums, advisors/query plans,
  rollback flag drill, owner physical iPhone background/keyboard/PWA acceptance.

Tests: failed completion=no rewards, failed scoring=workout retained, duplicate
completion request, delayed auth switch, offline draft noXP, duplicate animations,
correction no celebration, Community projected source consistency. Done: owner
accepts final evidence and privacy; deployment order DB-before-dependent-code.
Rollback: disable progression UI/publication, leave logging and forward data intact.

## Release checklist and monitoring

No broad db push; targeted reviewed forward migrations only, ledger reconciled
to actual applied versions. Track queued revisions/oldest age/retry failures,
snapshot as-of age, correction deltas, invalid contexts, public-optout failures,
rank churn and percentage of users with no trustworthy progress baseline. Do not
log raw workouts. Pilot gates: no integrity/privacy failure; p95 ordinary reward
read <=500ms at expected load, ordinary dirty-user processed within2 minutes,
daily snapshot within15 minutes of local midnight. If these are missed, label
updating and halt expanded rollout rather than silently relaxing safeguards.
