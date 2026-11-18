# Final approval - LifeOS progression

2026-11-04. **Read this first.** [PRODUCT-SPEC.md](PRODUCT-SPEC.md) is the ONLY
current rule source. Recommendations await your approval; nothing is deployed.

## A. Recommended final system

- Private Lifetime XP: minimum 2 working sets,10 XP/set,4/exercise,8/day,4 dates/week;
  weekly bonus0/0/10/30/40; max 360/week. Private historical backfill allowed.
- Public earned XP: same caps, timely server-received inventory since first explicit
  enrollment only. Private history is not automatically a public competitive score.
- RP:450 consistency +400 work +150 corroborated progress;21 days full weight then
  21 fading;42-day expiry, target 13.5. Lifetime XP does not decay with inactivity.
- Six league bands; placement4 dates spanning14 days, Apex10 spanning21. Hard
  eligibility/rollout gates apply BEFORE ordinary point-demotion hysteresis.
- Initial launch: private XP/Global preview; opt-in public All-time earned-XP and
  Consistency; private Progress collection/Exercise records. Public Global/Apex gated.
- Every account starts unenrolled. Profile lifetime/exercise/workout-sharing consent
  independent. Immediate read-time opt-out, private progress retained.
- Cosmetic rewards,0 bonus XP. Completion preserves Back to training, overview,
  summary and View history; rewards never resubmit a saved workout.

## B. Improvements since the original proposal

| Before | Final recommendation / evidence |
|---|---|
|0 XP at 3 sets,60 at 4 |20/30/40 XP at 2/3/4; less artificial extra-set incentive |
|One-receipt four-date batch:360 XP/378 RP |Private360; public80; one competitive date/63 RP, no placement |
|Stop curve1000->710 at 7 days->352 at 14 |Selected1000->843->618; day 21/28/42=379/161/0 |
|Capped metrics presented as specialized races |Eight-week Consistency tuple; Progress/Exercise honestly staged |
|Assumed broad progress coverage |160/489 sets potentially supported (32.72%); secure protocol absent |
|Prior Apex retained at 906 RP over17-day span |Immediately Diamond, exactly like a new account |
|Automatic new-member enrollment |Independent affirmative opt-in for ALL accounts |
|Conflicting current-looking drafts |Single PRODUCT-SPEC; old drafts explicitly archived |

## C. Decisions requiring your approval

| Question / viable options | Consequence and recommendation | Blocks |
|---|---|---|
|Same-day receipts vs late grace/tickets? |Recommend same-day; late/offline save privately, no retro public points. Midnight edge is conservative; tickets need threat review. |Competitive policy |
|Lower XP minimum only, or proportional awards too? |Recommend2 sets +10nXP;4-7 set days earn less than old fixed-base awards. Caps/level curve unchanged. |XP activation |
|14+14,21+21,28+14 decay? |Recommend21+21/13.5: gentler breaks but slower rebuilding and42-day memory. |RP policy |
|Apex measurable-progress, activity-only, new adapters or delay? |Recommend delay for EVERYONE initially. Later enable after pilot approval. Keeping900 threshold leaves unsupported users capped850; this inequity remains explicit. Activity-only Apex needs lower850 threshold or changed weights, diluting the hybrid; adapters are not yet validated. |Public Global/Apex, not private XP |
|No coverage gate,80%/two contexts or universal coverage? |Recommend eight-week pilot,>=80% consenting participants with2 supported contexts without changing training; suppress small cohorts. Universal coverage may block indefinitely;80% does NOT mean equal access for all. |Broad Global launch |
|Consent and category staging? |Recommend OFF for all until Join; independent profile/exercise/workout controls; earned-XP/Consistency first, collections/records until separate metric/data approval. |Public surfaces |

These are precise recommended defaults, not another open-ended design cycle.
Earlier visual acceptance does not approve changed privacy/scoring policy.

## D. Readiness

**Specification and isolated arithmetic are ready for approval.** Ready for
MilestoneA engineering once the above choices are accepted; isolated security/
parity preparation is specified. Broader policy-dependent implementation/public
launch remains blocked by approval and concrete integration gates, not missing
design exploration. [Tickets](IMPLEMENTATION.md) define the next work.
Secure DB receipts, SQL/RLS/concurrency parity, raw-set extraction, scheduler
availability and physical iPhone/PWA acceptance remain unimplemented/unverified.

## E. Evidence and review

- **38 current deterministic assertions passed**:11 Apex/daily-boundary regressions
  plus a disabled-Apex launch test. Original16 remain historical comparison tests.
  [Report](simulations/results/revision-report.json).
- [Daily score/league CSV](simulations/results/revision-trajectories.csv) and
  [comparison graphs](simulations/results/index.html?chart=revision-decay).
- Completion: [success](prototypes/index.html?rewards=success#training),
  [pending](prototypes/index.html?rewards=loading#training),
  [unavailable](prototypes/index.html?rewards=unavailable#training),
  [long](prototypes/index.html?rewards=success&long=1#training).
- [Actual visual/browser evidence](design-qa.md), [index](README.md),
  [decision history](DECISION-CHANGELOG.md).
- Coverage is a dated read-only aggregate observation (2026-11-03), not proof of
  physical training or current per-member fairness. Visual accounts are synthetic.

No production code/schema/data changes; no commit/push/deployment. No schema rerun
required. Stop here for owner review; implementation does not follow automatically.
