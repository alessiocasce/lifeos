# Personal progress: corroborated logged performance

> Historical archive; not current implementation instructions. Read [PROJECT_CONTEXT.md](../../../../PROJECT_CONTEXT.md) and the parent archive index before using this record.

> ARCHIVED DESIGN HISTORY. Do not implement from this document. See ../PRODUCT-SPEC.md
> for the single current specification and ../FINAL-APPROVAL.md for pending approvals.

## Revision 2 - current proposal, owner approval pending

Coverage is now measured, not assumed: potential candidate sets160/489, exact baseline-ready sets36/489, secure competition eligibility unestablished. Whitelist is not evidence of physical comparability. Machine/bodyweight adapters and an equipment-cohort coverage gate precede broad competitive launch. Corroboration/Pareto rules below remain the proposed event method; apply revised receipt eligibility.

The [final corrections](17-final-product-corrections.md) take precedence over conflicting text below.
## Version 1 reference and comparison (superseded where noted)

## Vocabulary and limits

Use **corroborated progress**, not verified strength: every input is self-reported.
Repeating a log cannot prove physical execution. Caps reduce payoff; they do not
detect all deliberate fabrication. Do not market the league as a medical or
athletic assessment. A progress milestone is one unit, not percentage gain.

## Comparison key and eligibility

Key = canonical exercise_id + variation_context + load_convention. Variation
context is a stable explicit setup identifier (e.g. standard barbell, unloaded
pull-up technique, or a named machine station/attachment). Human language labels
and aliases never create a new competitive movement. Custom/unmapped and the
ambiguous curl IDs earn activity XP only. Do not remap historical text here.

Progress requires completed, competitively eligible sessions with at least two
supporting working sets on the comparison key; repetitions 3-15. The representative
point is supported by BOTH sets at no lower load and reps; use the lower supported
performance, not a single lucky top set. RPE never boosts it. Do not impute RPE,
body mass, range of motion or equipment mechanics.

Take up to the last three comparable preceding session representatives within
90 days. Need three. First try exact same external-load band; baseline reps is
their median. Otherwise try exact same repetition count; baseline weight is its
median. If neither has three observations, no milestone candidate. No fuzzy rep
conversion, no e1RM interpolation. This deliberately misses some real progress.

## Candidate and confirmation

Candidate dominates baseline if load >= baseline load AND reps >= baseline reps,
and either reps >= baseline reps+1 or load increase >= min(2% baseline load, tick).
Tick defaults: barbell 2.5 kg, dumbbell/kettlebell per-implement 1 kg; a configured
machine context uses its declared 0.5-10 display-unit increment. Tick changes
create a new context/baseline, not a retroactive easy milestone. Zero-load modes
qualify only via repetitions. Do not sum or double per-implement loads.

Freeze the baseline when the first candidate is observed. Require a second
session on another date, 3-21 days later, whose representative meets/exceeds the
candidate. Then award at the confirmation date. Require a new Pareto-frontier
point: no retained corroborated high-water point has BOTH equal/higher load and
equal/higher reps. Returning to an old PR after deload is not another improvement.
Keep incomparable points rather than forcing a five-rep improvement to beat an
unrelated eight-rep record or converting them with e1RM. No more than one progress
unit per canonical exercise per rolling 28 days, across all contexts.

Candidate load jumps >20% over its matched baseline or rep jumps >5 are held
out of competitive progress, not rejected from workout logging. They can be
reviewed as a changed context or data error; v1 does not auto-clear them merely
after repeated implausible logs. No RPE-10 or one-rep-max incentive. The two-event
global P cap prevents a long exercise list being worth more competitive points.

Examples: 10 ->12 kg and 40 ->42 kg at eight supported reps each yield one unit,
if their tick threshold and confirmation conditions pass. They do not yield 20
versus 5 points for percentage gain. 150 ->152.5 kg can qualify via one 2.5 kg
tick despite being below 2%; this preserves a plausible advanced path. One extra
rep at unchanged load can qualify; two more reps at a much lower load cannot.

## Special movements

| Mode | Treatment |
|---|---|
| Total-external free weight | Same canonical setup; load/reps Pareto comparison |
| Per-implement | Compare stored per-implement load, never multiply for global kg |
| Bodyweight | Unloaded fixed variation: rep-performance improvement only; no claim of strength/relative mass improvement |
| Added-load bodyweight | Separate context; compare added load/reps only, not estimated total system mass |
| Assisted | Same calibrated station and assistance setting: reps only in v1; lower assistance scoring deferred |
| Machine | Explicit stable station/attachment/increment needed; no context means no P |
| Unilateral | Consistent per-side entry convention; use weaker-side supported reps where explicitly recorded, otherwise no progress credit |
| Timed, distance, boxing, none | Current schema insufficient: activity XP if valid sets, no strength/progress inference |
| New movement/substitution | New baseline; never compare superficially similar names |

Existing historical data lacking setup context can seed free-weight baselines
only on an explicitly approved unambiguous whitelist. Machine/unilateral/unknown
context history cannot retroactively become a precise comparison. Baseline setup
is optional; it must not block logging. The UI explains why progress is not yet
eligible, without demanding that users manufacture measurements.

Initial versioned progress whitelist: existing active barbell flat/incline bench,
barbell overhead press/back squat/Romanian deadlift, dumbbell flat/incline bench;
add explicit standard unloaded push_up and pull_up rep-performance contexts.
Resolve these slugs to their already-stable catalog UUIDs during the future rule
seed, never regenerate IDs. Bodyweight global progress is allowed on these two
contexts even though existing catalog leaderboard_eligible is false; the new
rule whitelist is distinct from an absolute-strength leaderboard permission.
Machine, assisted and unilateral handling above specifies their later eligibility
path; they earn no v1 P until a reviewed context adapter and its tests are enabled.

## Replay and correction

Store baseline source IDs, two supporting session/set IDs, context, rule version
and high-water points privately. If any source is edited/deleted/reclassified,
invalidate affected events and replay downstream comparisons chronologically;
an earlier deletion can change later eligibility. Reconcile XP/achievements/peak
without another unlock animation. Chronology uses the frozen rank date and
server receipt, not the timestamp of a later historical edit.

Engine.mjs implements the arithmetic/corroboration experiment on prepared session
representatives. It does NOT implement secure SQL extraction, setup capture,
moderation or cryptographic verification; future integration tests must cover them.

## Research basis

Published 1RM prediction validation is exercise/population-specific, and reported
errors can exceed a proposed 2% progress threshold. RPE/repetitions-to-failure
estimation is not perfectly accurate. These findings justify conservative logged
performance comparisons, not a scientifically proven scoring constant:
[prediction study](https://pubmed.ncbi.nlm.nih.gov/39330710/),
[repetitions-to-failure study](https://pubmed.ncbi.nlm.nih.gov/27787474/).
The 2%, tick, 90-day and corroboration windows are product hypotheses tested for
incentives here, not medically validated prescriptions.
