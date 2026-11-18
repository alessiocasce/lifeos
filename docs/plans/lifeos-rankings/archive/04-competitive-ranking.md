# Competitive scoring, placement and decay

> Historical archive; not current implementation instructions. Read [PROJECT_CONTEXT.md](../../../../PROJECT_CONTEXT.md) and the parent archive index before using this record.

> ARCHIVED DESIGN HISTORY. Do not implement from this document. See ../PRODUCT-SPEC.md
> for the single current specification and ../FINAL-APPROVAL.md for pending approvals.

## Revision 2 - current proposal, owner approval pending

Current recommendation: competitive dates require initial claimed date = immutable first completion receipt date; set receipts must match. k is1 through21 days then (42-age)/21 to zero at42; target13.5. C uses min(1,n/4), W uses n/8, n>=2. RP weights and league bands remain unchanged. Placement uses42 days. See document17 for score AND league trajectories.

The [final corrections](17-final-product-corrections.md) take precedence over conflicting text below.
## Version 1 reference and comparison (superseded where noted)

RP is a **current score**, not currency earned per workout. It is recomputed
from eligible activity. Units are points, bounds 0..1,000, round half-up only
after summing the unrounded weighted components.

## Formula

Rated dates use the same n>=4 and best-four-per-week rule as XP, but use their
server-owned frozen competitive date and eligibility, not an editable History date.
For age a in Europe/Rome calendar days at the snapshot date:

```
k(a) = 0                         a < 0 or a >= 28
       1                         0 <= a <= 14
       (28-a)/14                 14 < a < 28
C = min(1, sum_rated_dates k(a) / 9)
W = min(1, sum_rated_dates k(a) * n/8 / 9)
P = min(1, sum_two_best_distinct_exercise_events k(event_age) / 2)
RP = round_half_up(450C + 400W + 150P)
```

An event must be corroborated, eligible, not revoked and confirmed on a rated
competitive date. At most one milestone per exercise per 28 days. Keep the
strongest decayed event per exercise, then the best two different exercises.
No baseline means P=0, not fabricated progress or a participation substitute.

Nine effective weighted days puts a sustainable three-day program near the
activity cap (simulated plateau mean 846), and four days maintains it. Five
days cannot exceed C=1 or W=1. Eight versus 100 sets is identical activity credit.
Progress contributes at most 150: plateau maximum 850, not an automatic Apex.

Hand check: ten rated dates aged [0,3,5,7,10,12,14,17,19,21] days have kernel
numerators [14,14,14,14,14,14,14,11,9,7]/14, total 125/14 effective days.
Let their eligible n values be [8,6,4,4,4,4,4,5,4,5]. Weighted set numerator
is 602/14; W=602/1008. One recent milestone gives P=.5. Therefore C points
=450*125/126=446.428571, W points=400*602/1008=238.888889, P points=75.
Total=760.317460, rounded RP=760. The prototype shows 446+239+75=760.
simulations/results/visual-fixture.json reproduces this specific synthetic input.

## Leagues

| League | Raw point band | Palette | Library symbol |
|---|---|---|---|
| Unranked | 0, or placement incomplete | Muted steel | Empty shield |
| Bronze | 1-249 | #c3a489 | Shield |
| Silver | 250-449 | #b9c7d8 | Shield/check |
| Gold | 450-649 | #d9bd79 | Medal |
| Platinum | 650-799 | #78c5c0 | Faceted shield/star |
| Diamond | 800-899 | #9bc8eb | Gem |
| Apex | 900-1,000 | #e5c58d | Crown |

No subdivisions or population-percentile gates. A small community cannot support
meaningful percentile leagues. All ranks are mathematically attainable: fixture
three-day beginner and advanced schedules both reached Apex during the year.

Placement: at least four rated dates in the last 28 days, spanning at least 14
calendar days between oldest/newest. Before that show provisional RP privately,
Level/XP normally, no public global place. Apex additionally needs ten rated dates
in the window spanning at least 21 days. Without that, display Diamond even if
raw score >=900. New accounts cannot instantly take the highest league.

Promotion: next threshold at an eligible published snapshot, no spending RP.
Demotion: below the current league's entry threshold minus 20 points on two
consecutive daily snapshots. Missing a worker snapshot does NOT count as a day;
evaluate two consecutive Europe/Rome as-of dates. At zero RP or failed placement,
immediately Unranked. During a 20-point buffer, label current league as retained;
leaderboard ordering always uses actual RP, not the retained emblem. Peak league
is the highest valid published league; corrections can invalidate it.

## Inactivity and return

No extra inactivity multiplier. Each day's credit is unchanged for 14 days, then
decreases in steps of 1/14 per calendar day until expiry. Other older activity may
fade during a normal rest day; this is not a missed-workout punishment. Show a
snapshot date and explainer, never a daily loss alert. Maximum per-date activity
fade is approximately 850/(9*14)=6.75 RP before caps; multiple older dates and
milestones may fade together. Normal activity maintains the rolling balance.

One simulated established three-day user stopped with 1,000 RP:

| Inactive days | 0 | 1 | 3 | 7 | 14 | 21 | 28 | 90 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| RP | 1,000 | 1,000 | 915 | 710 | 352 | 94 | 0 | 0 |

These values depend on prior dates and are not a universal decay schedule. XP
stayed 3,220 / L13 throughout. At >=14 inactive days display a neutral inactive
indicator; at >=28 no RP survives. After months, return under normal placement;
no paid or self-declared score freeze, no loss of legitimate lifetime investment.
Suspended accounts are excluded publicly, not deleted. Scoring outage shows
last-as-of/updating, never falsely applies inactivity or invents points.
