# LifeOS progression - authoritative product specification

Status: final recommendation, awaiting owner approval. Date: 2026-11-04 Europe/Rome.
This is the ONLY normative product-rule source. `FINAL-APPROVAL.md` records approval
questions; `IMPLEMENTATION.md` translates these rules into tickets. Everything in
`archive/` and the original simulation run is historical evidence, not instructions.
No production code, migration, consent flag or workout record is changed here.

## 1. Product and launch contract

Two separate systems: private Lifetime XP/levels for corrected logged history,
and current competitive RP for timely, server-received activity. Neither proves
physical exercise. No seasons, XP expiry from inactivity, pay-to-win, daily streak
punishment, points for failure/RPE, or rewards for sharing/joining competition.

Initial release: private Lifetime XP; optional public All-time earned-XP and
Consistency boards; private Global RP preview; private Progress milestones and
Exercise records. Global public competition and Apex are NOT silently launched.
Preserve all five category names but label non-competitive/private categories.
Invitation pilot is a separate, disclosed rollout, not default enrollment.

Recommended broad Global/Apex gate: after eight pilot weeks, at least80% of
consenting participants have two genuinely supported, user-chosen progress
contexts without changing their training; no integrity/privacy failure; owner
approves aggregate cohort results. Suppress reported equipment cohorts below5.
This is a proposed product gate, not a measured current member statistic.
Apex disabled for everyone before the gate; private numerical RP still0-1000.
Enabling the gate is a hard rank requirement, never overridden by hysteresis.

After enabling, unsupported-context athletes can still cap at 850 and cannot
guarantee Apex. That inequity is an explicit approval trade-off, not solved by
the80% gate. Alternatives and consequences are in FINAL-APPROVAL.md.

## 2. Inputs, dates and source truth

Use owned saved completed workouts and their actual saved sets, not template
plans, the current frontend25-row page, unsynced drafts or client callback counts.
Warmup=false; finite weight>=0; integer reps1-50. Other valid training still saves
normally, even if it earns no points. RPE/notes/quantity of exercises do not boost XP.

Europe/Rome calendar dates; ISO weeks Monday-Sunday; no rolling168-hour substitute.
DST uses calendar arithmetic. All durations/receipts are stored UTC; timezone is
fixed for this rule version, not switchable to mint another credit day.

For private XP aggregate by corrected performed_on. For competition use immutable
server-only first completion date plus original claimed date and per-set receipt
inventory. Initial claimed date MUST equal first server completion date. Each
credited set must have been received on that server date and initially eligible.
No<=3-day grace. New late sets cannot top up an old competitive date; initially
invalid sets cannot be rehabilitated into past competitive inventory. Corrections
can remove invalid credit and reconcile originally eligible sources, not create
new receipt inventory. Rebinding a set/workout/account never creates fresh credit.

Server rule activation and the account's first explicit competition enrollment
set a lower bound for public earned XP. Re-enrollment retains that original bound.
Public scoring never backfills pre-enrollment activity. Private RP preview may
use timely receipts after rule activation; it remains private before enrollment.

Source created_at/started_at/performed_at/ended_at fields are not proof of receipt
or exercise. Future backend must stamp and seal separate receipt facts under
owner-bound DB grants. The arithmetic experiment accepts trusted test facts;
it does not establish actual DB security. Receipts prove server receipt only.

Late/offline/future-dated claims: preserve valid History; private XP only once
saved and performed date is not in the future. Never reassign old logs to today
for RP. No offline RP until a separately reviewed bounded receipt protocol exists.
Pre-issued server tickets may prove prior contact, never physical exercise.
Rome-midnight completion can lose competitive eligibility; explain this rather
than introducing a hidden date-choice grace. Logging must never fail for rewards.

## 3. Daily/weekly caps and XP

For each owner/date: count at most4 eligible sets per canonical exercise, or
trim/lowercase/collapsed-whitespace custom identity when unmapped. Global daily
`n=min(8,sum_exercise min(4,eligible_sets))`. Deduplicate set/workout IDs and use
latest source revisions. Multiple same-date sessions share one bucket.

Qualifying day: n>=2. Daily XP=10*n (20..80), otherwise0. Keep four largest-n
qualifying dates per ISO week, tie earlier date. Weekly bonus by credited-day
count 0..4 is `[0,0,10,30,40]`. Maximum360/week. Fifth day may replace a weaker day,
never append another award. Best-four selection is performed independently on
private performed dates and public frozen competitive dates.

Private Lifetime XP=all corrected private date/week entitlements; historical
backfill uses exactly these rules. Public earned XP=same formula, but only timely
receipt-eligible sets/dates after activation AND first enrollment. Different totals
are intentional; APIs/UI must not label public earned XP as private Lifetime XP.
Public eligible days are a subset of the private source inventory, not a second
award added to the private balance. Badges grant0 XP. No purchases or claim buttons.

Level 1 at 0 XP. Cost L->L+1=100+25L. Threshold
`X(L)=100*(L-1)+25*L*(L-1)/2`. Inverse
`floor((sqrt(81+0.32 XP)-7)/2)`, corrected against adjacent exact thresholds.
Production totals/thresholds use BIGINT/BigInt; decimal strings in JSON. Never
cast arbitrary totals to JS Number. Level 19 starts6075, Level 20 starts6650;
6420 means345/575 progress,230 remaining. No arbitrary max level.

Changes/deletions recompute both old/new affected dates/weeks and append signed
entitlement deltas. Private XP may decrease for corrected/deleted source, never
for ordinary inactivity. No negative balance, duplicated weekly bonuses or retry
minting. Source edits retain completion timestamps and Community synchronization.

## 4. Personal progress event contract

Key: canonical exercise_id + explicit stable setup/variation context + load
convention. No fuzzy names, e1RM, total-system-mass estimate or RPE multiplier.
Initial candidate whitelist: existing active barbell flat/incline bench,
overhead press, back squat, Romanian deadlift; dumbbell flat/incline bench.
Optional explicit unloaded push_up/pull_up contexts compare rep performance only.
Never regenerate canonical IDs. Ambiguous curls remain quarantined, separately
reviewed. Machine/assisted/unilateral/timed/custom unknown contexts earn activity
XP/C/W but no P until a defensible adapter is enabled.

Each session representative needs two supporting working sets on the same
context,3-15 reps. The point must be supported by BOTH at no lower load/reps;
do not select a single best set. Need three preceding distinct-date comparable
representatives in90 days. Prefer three exact same-load points (median reps),
otherwise three exact same-rep points (median load). No conversion if neither.

Candidate: no lower load AND no lower reps, with either +1rep or load gain at
least min(2% baseline,tick). Barbell tick2.5 kg, per-implement tick1 kg; compare
stored load convention, never sum/multiply per-implement values for competition.
Zero-load bodyweight qualifies via reps only, not inferred strength. Freeze
baseline; require repeat meeting/exceeding candidate3-21 calendar days later.
Confirmation must be timely and on a rated date. No retained corroborated point
may already dominate the candidate in BOTH weight and reps (Pareto frontier).
One event per canonical movement per28 days across contexts. This28-day cooldown
is NOT an activity-decay window. Hold >20% load or >5rep baseline jumps from P,
without rejecting logging. Repeating implausible logs does not auto-clear the hold.

Private historical supported free-weight logs may seed baseline only after an
explicit reviewed context assumption. They cannot become retroactive RP events.
Changed/deleted evidence triggers downstream chronological replay; invalidate
unsupported confirmations and high-water dependencies, no new celebration.
The simulation consumes prepared representatives; raw two-set extraction remains
an engineering acceptance test, not a proven existing feature.

Coverage evidence (read-only aggregate2026-11-03):224 catalog rows,79 active;
512 recorded completed sets,489 valid working sets,124 free-weight candidates
+36 unloaded-bodyweight candidates=160 (32.72% of489;31.25% of512). Exact paired
points43;13 have three preceding comparable dates;36 sets in those groups (7.36%
of489). Machine-display working sets265 (54.19%). No audited trusted context/
receipt columns. Potential coverage is NOT confirmed improvements or secure RP.
No individual/private source rows are included in these artifacts. Do not repeat
the live audit unless needed; the dated observation is not a current count promise.

## 5. RP: one current score, not additive currency

Use the best four timely qualifying dates/week from section 3. For age a in
calendar days: k(a)=0 for a<0 or a>=42;1 for0<=a<=21; (42-a)/21 for21<a<42.

```
C = min(1, sum_dates k(age) * min(1,n/4) / 13.5)
W = min(1, sum_dates k(age) * n/8 / 13.5)
P = min(1, sum_two_best_distinct_exercise_event_weights / 2)
RP = round_half_up(450*C + 400*W + 150*P)
```

An event's weight is k(confirmation_age); choose strongest eligible event per
exercise then the best two exercises. No baseline/event means P=0, not a
participation substitute. Unrounded rational components determine the final RP;
round only final nonnegative sum half-up. Component display rounding can differ
by1 from total: disclose that instead of modifying a component to fake equality.
Integer calendar kernels permit exact rational implementation; JS Number here
is bounded experimental arithmetic, SQL/JS parity includes half-point boundaries.

Plateau maximum 850. Selected synthetic steady3-day plateau mean848,4/5-day 850.
Two recent corroborated contexts can lift a sustainable3-day program to1000;
not every genuine training program has supported P or can reach Apex. No bonus
for heavier loads alone,100 sets instead of8, failure, pain or more than4 days.

## 6. Rank state machine: hard gates first

Point bands:0 Unranked; Bronze1-249; Silver250-449; Gold450-649;
Platinum650-799; Diamond800-899; Apex900-1000 WHEN eligible/enabled.

Execute in this order on each source-consistent as-of snapshot:

1. General eligibility: at least4 distinct rated dates in ages0..41 spanning
   at least14 calendar days. If false or RP=0, immediately Unranked, counter0.
   Exclude future/duplicate dates. Public enrollment/visibility is a separate
   publication gate and cannot be bypassed by an old rank/history snapshot.
2. Apex hard eligibility: server Apex rollout gate enabled AND at least10 distinct
   rated dates in the same42-day window spanning at least21 days. If false,
   maximum possible AND retained league is Diamond. Clamp previous Apex to
   Diamond before evaluating point hysteresis. This is not a point demotion.
3. Compute raw band from actual RP; cap at eligible maximum. Promote immediately
   to an eligible higher league. No tenure/paid boost or extra point deduction.
4. For POINT-ONLY demotion from an eligible retained league, require score below
   its entry threshold minus20 on two consecutive Europe/Rome daily snapshots.
   Exactly threshold-20 retains league; below increments. Same-as-of retries
   never increment; a missing daily date resets the consecutive sequence.
   Recovering above the breach boundary resets the counter. Corrected source
   history replays the state machine, not an irreversible prior badge flag.
5. Save raw/display band, retention reason, below count and last_as_of. Positions
   always use actual RP, not retained league or historical peak.

906 RP,12 recent dates spanning17 days: BOTH new and previous Apex accounts are
Diamond. Nine dates spanning24 days also cannot retain Apex. Exactly10 dates
spanning21 days at 900 can promote to Apex when enabled. Eligible Apex at 880
retains;879 needs two consecutive daily breaches. Any mandatory eligibility loss
overrides hysteresis immediately. A future league-specific gate follows the same
ceiling-before-hysteresis rule. A privacy opt-out hides immediately regardless of RP.

Current points decay, not lifetime XP/valid peak. No extra inactivity multiplier.
Neutral inactive indicator after 14 days, no daily loss notifications or medical
claims. All source activity expires at age 42, but placement can fail earlier.

## 7. Reproducible examples (revision-report.json)

All simple rows use fresh timely dates, no progress events, at most8 counted
sets, no prior dates. RP is provisional; no public place without placement.

| Case | Private XP | Public earned XP | RP | Competitive dates |
|---|---:|---:|---:|---:|
|2 sets, one date |20 |20 |24 |1 |
|3 sets, one date |30 |30 |36 |1 |
|8 sets, two exercises, one date |80 |80 |63 |1 |
|Two4-set workouts, same date, enough distinct exercise capacity |80 |80 |63 |1 |
|3 fresh8-set dates in one ISO week |270 |270 |189 |3 |
|4 fresh8-set dates in one ISO week |360 |360 |252 |4 |
|8-set performed date submitted3 days late |80 |0 |0 |0 |
|Three-day week corrected: first date8->4 sets |230 |230 |174 |3 |
|Three-day week: delete first credited workout |170 |170 |126 |2 |
|Four historical dates received together (3 late,1 timely) |360 |80 |63 |1 |

The delete reverses100, not80, because weekly bonus falls30->10. The correction
reverses40. Name/RPE/notes-only edits leave point totals unchanged. Weight alone
does not increase activity points; progress evidence changes require replay.

Same established3-day athlete with real corroborated synthetic events stops at
1000: days 0/7/14/21/28/42 ->1000/843/618/379/161/0. Display leagues with the Apex
gate enabled: Apex/Diamond/Platinum/Silver/Unranked/Unranked. Day28 still has161
private RP but fails placement; the retained Platinum at day 14 is point hysteresis.
With the launch Apex gate OFF, cap all displayed Apex outcomes at Diamond.

A plateau user stopping for two weeks retains504 RP instead of the old331;
resumed activity recovers more slowly because the selected memory is longer.
After90 days inactive:0/Unranked. In the return fixture7/14/21/37 days after
resuming:189/378/567/840 RP; placement stays incomplete until its minimum span,
and lifetime XP survives. Exact days/leagues are in revision-trajectories.csv.
No universal fixed decay table applies independent of the prior source dates.

## 8. Five category contracts

All public audiences are authenticated members; no anonymous SEO payloads or
private source IDs/sets/notes. Page size25,max 50; keyset cursor bound to snapshot,
category and ordering tuple. Search does not renumber; pinned row uses the same
full eligible population. Stable user key orders ties without breaking shared place.

| Category | Metric / ordering | Eligibility / window | Launch / visibility | Empty state |
|---|---|---|---|---|
|Global |Integer RP DESC, SQL RANK ties |Placed, timely receipts, source-consistent42-day score |Private preview initially; public opt-in pilot/full only after rollout gates |Competitive preview / no placed members / opted out |
|All-time |Corrected public earned XP DESC, shared ties |Enrolled with positive timely earned XP since original enrollment; no expiry |Public opt-in at initial launch; independent of private XP/profile disclosure |No timely earned XP yet |
|Consistency |Tuple(productive weeks,capped dates) DESC, shared ties |Eight COMPLETE ISO weeks; productive>=2 n>=4 dates; max 3 dates/week; at least1 productive week |Public opt-in at initial launch; current partial week not ranked |Complete a productive week |
|Progress |No numeric competitive order; earned milestone groups, alphabetical within group |Comparable corroborated events,42-day collection; owner sees own details |Private collection initially; public cohort only with explicit progression consent |No supported baseline / no corroborated milestones |
|Exercise |No public numeric ordering; owner's exact-context recorded performance |Canonical ID+explicit load/setup/rep convention; own history |Private personal records initially, custom logging stays valid |No comparable records / unsupported setup |

Consistency example:2 days/week=(8,16),3/4/5=(8,24). Ties are intentional:
do not reward a fourth day or invent max-weight/early-join tie-breakers.
Two-/three-set days earn XP/partial RP but are not substantial Consistency dates.
Store/display both tuple fields. Public All-time says "Earned XP since joining",
shows joining date, and does not imply total career investment or verified ability.

Progress full numeric leaderboard is NOT pre-approved: requires separate owner
approval of an independently discriminating metric, equipment-cohort pilot and
abuse/tie simulations. Until then collection is the complete launch behavior.
Exercise public competition requires adapter review, explicit exercise consent,
>=10 consenting active members in one EXACT comparable context for8 weeks,
no unresolved load conventions, tested source/receipt extraction, and owner approval
of a specific rep-band metric/ties before enabling. No cross-machine kilograms or
estimated strength substitutions. Lack of these is a staged feature, not "done".

## 9. Privacy, enrollment and interface

New and existing members: rankings_enrolled=false, rankings_visible=false,
show_progression=false, exercise_rankings_visible=false, share_milestones=false.
Workout Sharing ON is not ranking consent; OFF is not the only protected cohort.
Existing public profile identity never automatically gains RP/XP/history fields.
Private Lifetime XP and private progression persist regardless of public choices.

Join public rankings is an unchecked affirmative choice, requiring a complete
public username/profile. Disclosure: signed-in audience, handle/current/peak league
and board aggregates, inferred recent activity, logged-not-verified nature,
earned-XP start boundary and immediate hide control. No preselected checkbox or
points for consent. Enrollment alone does not publish lifetime XP/badges, specific
exercises, workout details or notes. Profile lifetime/level/badges require separate
show_progression. All-time's public earned-XP total is authorized by joining the
competition; do not accidentally require exposure of private lifetime progression.

Settings > Competition: Join/Leave public rankings; Show lifetime progression on
profile; Show exercise participation (disabled until staged release); Share
milestones (OFF/deferred). Explain each audience separately. Workout Sharing and
notes controls remain in their existing Settings section with unchanged meanings.

Leave/hide acknowledges only after the authoritative preference commit. ALL
rank/profile/cursor queries recheck current consent. Remove readable public rows
immediately without waiting for scoring worker/daily snapshot. Physically delete
or prune stale public projections asynchronously; read gates protect the interval.
Remove local cached row on state change/focus; screenshots already taken cannot
be recalled. Auth switching aborts/discards prior-account responses and caches.

Rejoin is explicit; original earned-XP enrollment bound is retained, no replay
awards. Private timely receipts keep accruing after first enrollment while hidden
under the disclosed private progression purpose; rejoin can reveal the corrected
earned total again, NEVER previously ineligible/pre-enrollment history. Deleting
an account follows account deletion/cascade rules, not opt-out semantics.

## 10. Completion reward contract and visual boundaries

Keep actual order: Workout completed! -> Back to training -> overview -> grouped
recorded sets -> View history. Insert one restrained reward section AFTER Back to
training, BEFORE overview. No Back to Rankings as top/primary completion action.
No save/resubmit call in reward reads/retries. Render only after workout save
success or a separately defined durable offline-save state; draft-only is not saved.

Owner reward read includes source revision/workout identity, private XP delta,
private total/level, public earned-XP delta if distinct, RP/status/as_of, reasons.
Ready revision must match saved source; later responses cannot overwrite a newer
workout/account. Weekly replacement/bonus can make the XP delta differ from daily
10n; always return the real server entitlement delta, never hardcode+80.

Pending: "Your workout is saved. Points are being calculated." No made-up numbers.
Unavailable: "Your workout is saved. No need to log it again." Retry reward read
only; both navigation actions remain available. Success: confirmed delta, level
and private standing with clear as-of; secondary score breakdown. Historical edits/
backfills/corrections never replay reward celebrations. No blocking modal queue.

Prototype fixtures are prominently labeled synthetic. Short scene8 working sets,
2 bilateral total-external movements,4320 kg verified fixture load-volume and45 min
explicit timestamps; long scene preserves real set-style grammar, warmups, RPE and
notes and omits unsupported aggregate volume. No fake OS frame. Preserve selected
accent, opaque five-destination dock, safe-area padding and bottom content clearance.
Actual SQL/physical iPhone acceptance is future work, not proven by this mockup.

## 11. Rewards and profile rules

Badges are one per account/code, no bonus XP, retained across inactivity but revoked
if corrected/deleted evidence invalidates the condition. No unlock animation for
replay/backfill/correction. q=private credited days after 4/week cap; active week
has>=2 credited dates. Competitive badges require a valid enabled rank snapshot.

|Code |Exact condition |
|---|---|
|first_step |q>=1 |
|routine_builder |q>=12 |
|foundation |4 consecutive active ISO weeks |
|twelve_weeks |12 consecutive active weeks |
|quarter |13 active weeks total |
|long_game |52 active weeks total |
|century |q>=100 |
|three_hundred |q>=300 |
|first_progress |1 retained corroborated event |
|ten_progress |10 retained events on>=3 canonical exercises |
|patient_progress |3 events spanning>=180 days |
|comeback |3 credited dates within 14 days after>=28 inactive days; once lifetime |
|second_year |Credited dates in two calendar years |
|level10 / level25 / level50 |Corrected level>=10 /25 /50 |
|diamond / apex |First valid enabled published league, including all hard gates |
|bench_progress |3 events on approved bench IDs spanning>=56 days |
|movement_range |Two credited dates in each of3 canonical primary muscle categories within 90 days |

Twenty predicates total (combined rows expand). Progress predicates use reviewed
canonical contexts only; ambiguous/custom categories cannot satisfy variety.
One optional title; up to3 distinct pinned badges; Plain frame always available.
Steel frame atLevel20, long-view frame at 25, milestone accent at 50. Titles map
to first_step(Getting Started), routine_builder(The Builder), foundation(The
Consistent), twelve_weeks(Twelve Weeks Strong), century(Century Member),
ten_progress(Progress Architect), patient_progress(Patient Practitioner),
comeback(Back in Motion), level25(The Long Game), level50(Enduring),
diamond(Diamond Member), apex(Apex Member). No rare-population percentage claims.
Revoked title/frame falls back safely. League emblem stays distinct from a lifetime
earned frame; no cosmetic can impersonate active Apex. All optional, no XP loop.

## 12. Versioning and acceptance authority

Use immutable rule definition+digest+effective date. No silent live retuning.
Future runtime version is assigned only after approval; experimental engine version
`rankings-final-proposal-v3` is not a deployed migration/rule identifier. Changes
rebuild entitlements under a new version, compare shadow totals and atomically
activate one version, not add both balances. Preserve signed audit and source data.
Worker/RLS/receipt sealing requirements are in IMPLEMENTATION.md, not fulfilled
by an arithmetic test passing. FINAL-APPROVAL.md records product gates; no
unapproved policy default may be treated as authorization to launch.
