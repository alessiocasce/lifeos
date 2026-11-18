# Risks, approvals and readiness

> Historical archive; not current implementation instructions. Read [PROJECT_CONTEXT.md](../../../../PROJECT_CONTEXT.md) and the parent archive index before using this record.

> ARCHIVED DESIGN HISTORY. Do not implement from this document. See ../PRODUCT-SPEC.md
> for the single current specification and ../FINAL-APPROVAL.md for pending approvals.

## Revision 2 - current proposal, owner approval pending

Six revised product approvals are outstanding (document17 section8). Actual progress coverage is limited and secure receipt/context data absent. Global stays pilot-gated; Progress/Exercise competition staged. Physical iPhone, SQL/RLS/concurrency, Cron and context extraction remain unverified. This focused revision creates no production authorization.

The [final corrections](17-final-product-corrections.md) take precedence over conflicting text below.
## Version 1 reference and comparison (superseded where noted)

## Decisions already approved

Owner's sixfixed decisions; highest league on3-4days/week; public ranking default
with independent opt-out; preserve existing sharing-OFF members as ranking-hidden;
visual concept1. Existing private source records remain private. No production
implementation in this task.

## Final recommendations requiring blueprint acceptance

45/40/15 ModelB; 4working-set minimum,4/exercise,8/day,4rateddays/week;
40+5nXP andweekly0/0/10/30/40; level100+25L; sixleagues at1/250/450/650/800/900;
14+14kernel/9effective days; corroborated no-e1RM progress; no badge XP; separate
exercise-ranking consent; no automatic milestone Feed sharing. These are fully
specified recommendations, not medically validated constants or new app behavior.

## Engineering launch blockers (not reasons to alter production now)

1. Curl identity ambiguity: separate reviewed correction/whitelist, no guessing.
2. Server-owned receipt and timestamp-grant sealing. Existing schema defaults do
   not prove trustworthy timing; client fields cannot become trusted by naming.
3. Retained source fingerprints and hourly full-digest/anti-join audit plus verified
   fail-open queue marking. Deleted credited rows cannot be discovered by source
   updated_at alone; loss recovery must meet its stated60-minute audit bound.
4. Production representative-set extraction and context setup/corroboration parity.
   Arithmetic experiment accepts prepared representatives, not arbitrary raw logs.
5. SQL/RLS concurrency and privacy tests on isolated two-user/anon fixtures.
6. Confirm Cron availability/permissions and performance on expected member volume.

## Non-blocking design/pilot limitations

- Self-reported activity is inherently gameable; don't promise verified strength.
- Synthetic20profiles do not predict population rank distribution or retention.
- A rapid beginner showed15promotions/12demotions over a year; even with hysteresis
  churn may need pilot tuning, announced via rule version rather than silent edits.
- Advanced plateaus cap nearDiamond. Higher rank is possible with modest repeated
  progress, but not guaranteed for every program/body/context. Accessibility means
  not requiring more than4days, not promising equal RP for every frequency.
- Bodyweight progress is rep performance, not inferred relative strength. Unknown
  machine/unilateral setups miss real progress rather than inventing comparability.
- Tiny catalog whitelist and missing contexts may leave many users noP at launch;
  do not hide that. Instrument aggregate eligibility coverage before enrollment.
- Different schedules may have small phase differences as credits fade. Publish
  as-of labels and no daily loss notifications; don't add a second decay system.
- Prototype uses synthetic state, local memory and representative badge/icon art.
  It is not authenticated, persistent or production-integrated.
- Physical iPhone Safari/PWA QA and a real second-account rollout remain future
  acceptance; no physical-device claim is made from this design work.

## Intentionally deferred

Absolute strength/bodyweight-normalized boards, calibrated machine physics,
assistance reduction scoring, wearable/video verification, seasons, pay-to-win,
daily streaks, follower/reaction points, reactions/following, mandatory health
measurements, injury score freezes, animation-heavy profile effects and automatic
training rewrites. No History/completion redesign, rest timer or owner-service
multi-tenancy expansion.

## Readiness statement

The product recommendation can be reviewed with reproducible simulations and
inspectable prototype states. Engineering work may start milestoneA only after
owner accepts the blueprint. Full public launch is NOT ready: the six listed
data/security/infrastructure blockers must pass their milestone acceptance tests.
No schema rerun is required for this blueprint, and nothing has been deployed.
