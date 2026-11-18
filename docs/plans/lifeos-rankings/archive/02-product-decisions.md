# Decision log and model comparison

> Historical archive; not current implementation instructions. Read [PROJECT_CONTEXT.md](../../../../PROJECT_CONTEXT.md) and the parent archive index before using this record.

> ARCHIVED DESIGN HISTORY. Do not implement from this document. See ../PRODUCT-SPEC.md
> for the single current specification and ../FINAL-APPROVAL.md for pending approvals.

## Revision 2 - current proposal, owner approval pending

The six revised policy decisions in document17 replace the earlier default-visible, three-day-late, four-set-base-XP and14+14 recommendations. Concept1 and450/400/150 component weights stay. Owner approval is pending for the new decisions, not inferred from provisional visual acceptance.

The [final corrections](17-final-product-corrections.md) take precedence over conflicting text below.
## Version 1 reference and comparison (superseded where noted)

## Locked by owner

Hybrid, permanent XP and activity-sensitive competition, no seasons, all useful
leaderboards, badges/titles/cosmetics and inactivity response. Highest league
should be attainable on 3-4 days/week. Rankings public to signed-in members by
default, independently of sharing workout contents. Existing sharing-OFF members
start ranking-hidden; never overwrite an explicit future ranking opt-out.

## Candidate models

- A: RP=round(550C+450W). Simplest activity-only benchmark. Fails the fixed hybrid
  decision because it omits genuine progress. Useful baseline, not a launch choice.
- B: RP=round(450C+400W+150P). Progress is capped corroborated milestones, not
  relative gains. Chosen: understandable, compatible, resilient to noisy loads.
- C: RP=round(400C+350W+250N). N uses milestone weight times min(gain/10%,1).
  Exposes beginner-relative-gain and starting-baseline bias; research and data
  limitations do not support pretending this is an individualized fitness model.

## Weighted judgment matrix

Ratings 1-5 are explicit product/engineering judgments, NOT simulation estimates.
Weights: fairness .25, healthy incentives .20, comprehension .20, abuse resistance
.15, existing-data compatibility .10, implementation/maintenance cost .10.

| Model | Fairness | Healthy | Understand | Abuse | Data | Cost | Weighted /5 |
|---|---:|---:|---:|---:|---:|---:|---:|
| A | 3 | 4 | 5 | 3 | 5 | 5 | 4.00 |
| B | 5 | 5 | 4 | 4 | 4 | 4 | 4.45 |
| C | 3 | 3 | 2 | 3 | 2 | 2 | 2.60 |

The simulations are a second gate: A places 13/20 end-state scenarios at Apex;
B places 4; C places 0. These deliberately selected scenarios are not a sample
of real users or a target percentile distribution. C's low upper-rank access
and A's no-progress ceiling support B; neither count proves population fairness.

## Selected recommendations

| Decision | Rationale / rejected alternative |
|---|---|
| Six leagues, no divisions | Enough range without seven nearly redundant labels in a tiny community |
| Fixed thresholds | Transparent at any member count; percentiles unstable with two or ten users |
| Shared displayed ties | Stable UUID tie ordering only for pagination; no false superiority |
| 45/40/15 | Prioritizes sustainable training, includes genuine progress without continual PR dependence |
| 14+14 kernel | Bounded memory, no unlimited inactive elites, no whole-day 28-day cliff |
| Four rated days/week | Owner ceiling; fifth session can improve an underfilled day/week, not exceed the cap |
| XP never decays | Permanent investment; data corrections can reverse invalid awards |
| No XP for badges | Avoids circular unlocks, bonus farming and double rewarding the same milestone |
| No raw-kg global competition | Equipment, body size and load conventions are incompatible |
| No recovery pause score freeze | Unlimited self-declared pauses would preserve inactive standing; lifetime remains |
| No daily streak | Avoids suggesting recovery days are failures |
| No auto milestone Feed spam | Explicit optional share at rare milestone only, separate permission |
| Machine context optional | Logging stays low-friction; trustworthy progress requires context instead of assumptions |

Rank and cosmetic names here are final design recommendations pending owner
approval of the complete blueprint; technical work must not invent alternatives.
