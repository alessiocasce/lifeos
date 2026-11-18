# Lifetime XP and levels

> Historical archive; not current implementation instructions. Read [PROJECT_CONTEXT.md](../../../../PROJECT_CONTEXT.md) and the parent archive index before using this record.

> ARCHIVED DESIGN HISTORY. Do not implement from this document. See ../PRODUCT-SPEC.md
> for the single current specification and ../FINAL-APPROVAL.md for pending approvals.

## Revision 2 - current proposal, owner approval pending

Current recommendation: n>=2 earns10nXP, with existing4/exercise,8/day,4 dates/week and360XP/week caps. Private lifetime XP may include historical entries. Public All-time uses separate timely earned XP since explicit enrollment, excluding bulk historical imports. Level thresholds are unchanged.

The [final corrections](17-final-product-corrections.md) take precedence over conflicting text below.
## Version 1 reference and comparison (superseded where noted)

## Eligible training

Only saved sets belonging to saved completed workouts count. Eligible working
sets have warmup=false, finite nonnegative weight and integer repetitions 1-50.
RPE and notes do not affect rewards. Unknown/custom exercises can earn capped
activity XP; canonical identity is required only for progress competition.
No duration, calorie, raw-load or failure bonus. Valid training outside these
scoring bounds still saves normally and remains in History.

Aggregate all completed workouts on each Europe/Rome performed_on date. Count
at most four sets per canonical exercise; unmapped exercises use trim/lowercase/
collapsed-whitespace identity. The daily global cap prevents custom-name farming.
Let n=min(8,sum_exercises min(4,valid_working_sets)). n<4 earns zero. n>=4
earns **40+5n XP**, so a four-set day earns 60 and an eight-set day 80.

Within each Monday-Sunday Europe/Rome week, retain the four highest n dates;
equal n is resolved by earlier date. A later day may replace a lower-credit day,
but the weekly total never exceeds four full days. The weekly bonus for k counted
dates is [0,0,10,30,40] for k=0..4. Maximum 4*80+40=360 XP/week.
Split sessions do not get another base award. A sole exercise with four sets can
qualify; do not mandate artificial exercise variety. Warmups earn no XP, but users
can log them without limit. No bonus for a fifth/sixth/seventh training day.

## Levels

Start at Level 1 with zero XP. Next cost from L to L+1 is 100+25L XP.
Cumulative threshold X(L)=100(L-1)+25L(L-1)/2. Invert with
L=floor((sqrt(81+0.32XP)-7)/2), then verify adjacent integer thresholds to avoid
floating-point boundary errors. Use exact BIGINT arithmetic on the server.
Next-level progress is XP-X(L), out of 100+25L. No purchasable or hidden XP.

| Days/week, n=8 | XP/week | XP/52 complete weeks | Level | L2 approx weeks | L10 approx weeks | L25 approx weeks |
|---|---:|---:|---:|---:|---:|---:|
| 1 | 80 | 4,160 | 15 | 1.56 | 25.31 | 123.75 |
| 2 | 170 | 8,840 | 23 | .74 | 11.91 | 58.24 |
| 3 | 270 | 14,040 | 30 | .46 | 7.50 | 36.67 |
| 4 | 360 | 18,720 | 35 | .35 | 5.63 | 27.50 |
| 5 | 360 | 18,720 | 35 | .35 | 5.63 | 27.50 |

Time values are continuous planning estimates: awards arrive on actual workout
days and weekly thresholds, not fractional days. L10=2,025 XP; L25=9,900 XP;
L50=35,525 XP. Five simulated years at three weekly dates gave 70,370 XP / L71
(calendar partial weeks explain the difference from exactly 260 complete weeks).
Early L2 can arrive after two full sessions; subsequent levels slow gradually.
No product max level. Use a BIGINT total and decimal-string JSON values to avoid
JavaScript safe-integer overflow. Clients must not cast arbitrary totals to Number;
binary-search exact thresholds using BigInt. Counts must reject overflow on write.

## Reconciliation, history and offline

XP is a projection of corrected source history, not a bag of additive callbacks.
Versioned entitlement keys are xp:date:{user}:{date}, xp:week:{user}:{monday}.
On change, recompute affected old/new dates and weeks and append the signed delta
against the last entitlement value. Unique source revision prevents retry minting.
One backfill applies the SAME rules to all existing completed history. No arbitrary
legacy multipliers. Retrying a backfill produces zero new net XP.

Name/notes/RPE-only changes do not change XP. Date corrections can move eligible
XP between weeks; both weeks are rebuilt, never added blindly. Deleting source
sets/workouts reverses unearned credit, possibly lowering XP/level and revoking
dependent cosmetics. No negative totals and no invented negative debt. Legitimate
rest/inactivity never reduces XP. Do not generate reward celebrations for revisions,
backfill, rule migration or deletions. Late/offline records may earn lifetime XP
after they are actually saved; a local draft is never an awarded workout.

Worked example: three dates, each n=8: 3*80+30=270. Adding a fourth n=4 day:
270+60+10=340. Adding a fifth n=8 replaces the n=4 day: 360, not 420.
Removing one of the original n=8 days from that five-day week restores n=4 as
the fourth credited date: 340, a -20 correction, not a full -80.
