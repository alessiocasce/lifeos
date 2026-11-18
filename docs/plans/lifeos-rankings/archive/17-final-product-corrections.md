# Final product corrections - revision 2, approval pending

> Historical archive; not current implementation instructions. Read [PROJECT_CONTEXT.md](../../../../PROJECT_CONTEXT.md) and the parent archive index before using this record.

> ARCHIVED DESIGN HISTORY. Do not implement from this document. See ../PRODUCT-SPEC.md
> for the single current specification and ../FINAL-APPROVAL.md for pending approvals.

2026-11-03, Europe/Rome. This document supersedes conflicting version-1 policy
in documents00-16. Version-1 experiments remain reproducible comparison evidence,
not the current recommendation. No application, schema or production records
were changed. `simulations/revision.mjs` is the new deterministic experiment.

## Decision summary and before/after

| Area | Previous proposal | Revised recommendation / reason |
|---|---|---|
| XP eligibility | 4-set minimum; 0 at3,60 at4 | 2-set minimum,10*n XP; 20/30/40 at2/3/4, less artificial-set incentive |
| Caps | 4/exercise,8/day,4 dates/week,360/week | Unchanged; warmups excluded; weekly bonus unchanged |
| Competitive chronology | Up to3 days late on claimed dates | Timely server-day credit only; one receipt day cannot create several competitive days |
| Lifetime vs public XP | One historical total used for All-time | Private lifetime XP keeps historical logs; public All-time uses timely earned XP since enrollment |
| RP decay |14 full +14 fading, target9 |21 full +21 fading, target13.5; same450/400/150 weights |
| Short-workout RP | Four-set threshold for full C | Two-set threshold; C day's contribution=min(1,n/4), W=n/8 |
| Rank accessibility | 3-4 days with eligible progress can reach Apex | Still true; unsupported progress users still cap at850, explicitly not universal parity |
| Consistency | Capped effective-days count with many ties | Eight complete weeks; lexicographic productive-weeks / capped training-dates; meaningful ties retained |
| Progress / Exercise | Capped units as numbered competitions | Progress milestone collection; Exercise personal records, competitive ordering staged |
| Public enrollment | New members default visible | Existing AND new members default unenrolled; affirmative independent opt-in |
| Completion visual | Reward fragment without real summary | Actual completion hierarchy preserved, reward inserted after Back to training; loading/success/unavailable |

All six substantive policy changes need explicit owner approval. The approved
Concept1 visual direction, separate lifetime/current standing, permanent leagues,
level thresholds, cosmetics and no-pay-to-win architecture remain intact.

## 1. Competitive chronology and the confirmed exploit

The executable fixture submits four8-set completed workouts on server day23,
claiming days20,21,22,23 in one ISO week. Version1 yields360 lifetime XP and378RP,
four separate rated dates. This reproduces the externally reported issue exactly.
Freezing an initially accepted false date prevents later movement but does not
make its initial acceptance safe. Server receipt proves receipt, NOT exercise.

### Compared policies

| Policy | Same-receipt batch | Legitimate late logging | Other costs |
|---|---|---|---|
| V1: claimed date within3 days | Four competitive days; vulnerable | Convenient | Reject |
| Move every submission to receipt day | One date / capped activity | Bulk old logs create today's RP | Reject: history imports become current participation |
| **V2: claimed initial date must equal server receipt date** | Only the timely record qualifies; one date | History/private XP always save; no retro RP | Conservative midnight/offline disadvantage, clearly disclosed |
| Pre-issued dated online tickets with bounded sync | Limits retroactive date selection if issued on separate days | Can support known outstanding sessions | Tickets prove prior server contact, not physical exercise; hoarding/replay/expiry/privacy and set-receipt controls needed |

Selected v1-launch policy is V2 above, not a ticket system. Freeze the first
completed-workout receipt date and original claimed date in server-only state.
Qualifying set receipts must belong to that same server date; a later edit or
newly added historical set cannot top up an old competitive day. Corrections to
already-received set values can reduce/reconcile entitlement, but cannot exceed
the day's sealed receipt set inventory. New IDs and new receipt dates cannot be
backdated. Future date claims never qualify. Editing performed_on never alters
the frozen competitive day or rehabilitates an initially ineligible record.

The actual boundary must be DB/server-generated and not supplied by the browser.
Revoke client mutation of receipt/competitive fields and seal it in an isolated
schema. Source created_at, started_at, performed_at and ended_at are NOT trusted
substitutes. The simulation's firstReceivedDay/initialDay/set receipt values are
trusted test inputs, not implemented security. Integration must test forged
fields, concurrent updates, set-ID rebinding and source ownership before launch.

Result under the selected42-day scoring kernel: one date,63RP, no public placement.
Private historical XP=360 by design; **public earned XP=80**, not360. Distinguish
this metric in All-time's heading and API. No historical bulk import, correction,
pre-enrollment activity or unsynced draft can become a public earned-XP award.
Private levels/badges remain self-reported history products, not verified prizes.

Do not retroactively trust existing history for RP. It may seed only reviewed
unambiguous baselines. Competitive earned XP begins no earlier than the server's
rule-activation/enrollment boundary. Opting out hides data immediately; private
timely receipt collection can continue only under disclosed progression processing.
Re-enrollment cannot reset receipt identities or double-award earlier dates.

### Late and offline UX

Always save valid workouts regardless of reward eligibility. Say "Saved to
History. Late entries count toward lifetime XP, not competitive standing." No
accusation or blocked logging. A workout crossing Rome midnight is a known
limitation: create it with the actual current local date, or accept private-only
credit for an earlier performed date. No hidden grace that recreates date choice.
True offline queues may later save History/private XP; v1 gives no offline RP.
A future ticket protocol requires an independent threat-model review. Neither
device clocks, a signed client timestamp, nor a ticket proves physical execution.

## 2. Recovery and decay comparison

The same established three-day user's source dates and corroborated events are
replayed in all three cases. This reproduces original1000->710->352 exactly.
Age is elapsed Europe/Rome calendar days. No extra inactivity multiplier.

| Mechanism | Flat / fade | Effective-day normalization | RP day0 | day7 | day14 | day21 | day28 | day42 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Original |14/14 |9 |1000 |710 |352 |94 |0 |0 |
| **Balanced** |21/21 |13.5 |1000 |843 |618 |379 |161 |0 |
| Long grace |28/14 |15 |1000 |858 |688 |465 |220 |0 |

The alternative denominators scale with the effective memory, so longer windows
do not simply inflate everyone's score. For the same flat three-day active
schedule, average RP over the last28 days is846/848/848 respectively. Active
plateaus still cap at850; two new corroborated events can contribute150.

Displayed leagues include placement and two-daily-snapshot20-point hysteresis:

| Mechanism | day0 | day7 | day14 | day21 | day28 | day42 |
|---|---|---|---|---|---|---|
| Original | Apex | Platinum | Unranked | Unranked | Unranked | Unranked |
| Balanced | Apex | Diamond | Platinum (retained briefly) | Silver | Unranked | Unranked |
| Long grace | Apex | Apex (retained briefly) | Platinum | Gold | Unranked | Unranked |

At day28 the longer kernels still have private RP, but fewer than four qualifying
dates remain for this fixture, so public placement is lost. Do not label161RP
as a public Bronze position. General placement uses the selected42-day window,
four dates spanning14; Apex ten dates spanning21. All points expire by age42.
No permanent peak-to-current score carryover, medical certification or paid freeze.

### Ordinary recovery and return (no invented progress events)

The recovery experiment pauses a previously flat850RP three-day program on
days84-97 and resumes it afterwards. On the final paused day97, RP is331/504/538
for original/balanced/long-grace; at day125 it is850/735/680. Balanced makes the
break less punitive, but its longer averaging memory means rebuilding the entire
activity cap takes longer. This trade-off must be stated, not hidden by a
"recovery protection" label. The CSV/JSON trajectories include every daily league.

After a90-day break all three are0 and Unranked. Seven days after resumption
(day180), RP is283/189/170; after21days(day194),776/567/510. On day210 it is
850/840/834. Balanced returns users more gradually; show retained lifetime XP,
private provisional standing and placement progress without loss notifications.

Recommend **21+21 / target13.5**: meaningfully gentler weeks off, less stale-score
residence than28+14, sustainable3-day cap maintained. Costs: up to42 days of old
activity and slower return ramp. Active leaderboard members may be temporarily
outscored by a recently inactive member with corroborated progress; this is an
explicit memory horizon, not proof of current performance. Publish as-of/window,
neutral inactivity label after14 days, no daily rank-loss alerts. No kernel is a
medical prescription. Owner must approve the trade-off before implementation.

Formula remains RP=round(450C+400W+150P), with k=1 through21, (42-age)/21
thereafter,0 at42. C=sum(k*min(1,n/4))/13.5, W=sum(k*n/8)/13.5, each capped1.
P remains the best two distinct corroborated event weights divided by2. Events
must be confirmed on eligible rated dates. The partial-day change supports shorter
logging without treating two sets as equivalent to eight; it is unrelated to
specialized-board differentiation.

## 3. Specialized boards: useful ordering without false precision

Retain five categories. Global RP remains a transparent opt-in pilot until the
coverage gate in section4 passes. All-time uses corrected **timely earned XP
since enrollment**, not imported private lifetime XP. Its profile discloses joined
date so newcomers are not presented as having a worse lifetime training history.

### Consistency: sustainable weeks, not fractional-day saturation

Use eight COMPLETE ISO weeks before the current one. A date qualifies at n>=4
timely working sets; at most three dates/week improve this board. Primary tuple:
`(number_of_weeks_with_at_least_two_dates, sum(min(3,dates_in_week)))`, descending.
Display "8 /8 weeks ·24 training dates". This distinguishes8/16 from8/24 without
rewarding a fourth/fifth training day. Two-set workouts still earn XP and partial
RP, but this board explicitly represents sustained substantive training days.
Equal tuples share place, SQL RANK over BOTH tuple components. Stable internal
ID orders tied rows without inventing superiority. Do not add kilograms, XP,
early join time, longest daily streak or exercise count as hidden tie-breakers.

Controlled eight-week fixtures: two days/week=(8,16); three/four/five=(8,24).
Ties among consistent members are intentional, not an excuse to invent a race.
Cursor includes snapshot, both tuple values and stable key. Pin/search use the
same full population and tuple. Current week appears as private progress only.

### Progress: achievement cohort at launch, not a capped race

The two-unit RP component remains unchanged. Do NOT sort everyone with one/two
events into artificial ranked places, or favor people with many whitelisted lifts.
Show opted-in members grouped by0/1/2+ corroborated milestones in the selected
window, with no podium, numeric position or pinned rank. Within a group use stable
username order explicitly labeled alphabetical. Distinct exercise names require
the separate exercise consent. Personal milestone detail remains owner-only.
A future competitive metric needs coverage and event-frequency pilot evidence;
simply increasing the event cap would alter incentives without solving fairness.

### Exercise: personal records first, competitive release staged

Keep exercise selection/search but show the viewer's comparable personal records
and eligibility explanation. No ordinal public strength/progress leaderboard in
the initial release. Do not replace a cap of1 with uncapped percentages, e1RM or
one-off maxes. A future opt-in board can compare exact canonical ID + equipment/
variation + load convention + common rep band and disclose self-report limits;
it needs adequate participants and adapters first. Until then do not fabricate
places or raw-machine comparisons. Prototype labels this staged state honestly.

## 4. Real catalog / historical coverage audit

Read-only production aggregate queries on2026-11-03 against project
wrqscqhclepwxxkazbnc. No names, private exercise strings, user IDs, notes or source
rows were returned or stored. First connector attempt timed out; retry succeeded.
Source rows were not changed. SQL aggregates are saved in
`simulations/coverage-audit.sql`; aggregate results in `results/coverage-audit.json`.

Catalog remains224 rows /79 active. Active load types: total_external12,
per_implement21 (3 unilateral), machine_display34 (4 unilateral), bodyweight8,
assistance2, none2. Reviewed free-weight whitelist still seven canonical movements;
bodyweight proposal adds unloaded push_up/pull_up rep contexts, not global strength.

| Aggregate | Count | Interpretation |
|---|---:|---|
| Recorded/completed sets |512/512 | Snapshot denominator; may increase later |
| Valid working sets (1-50reps, nonnegative weight, not warmup) |489 | Activity-eligible shape, not proof of execution |
| Seven free-weight candidates (3-15reps) |124 |25.36% of489 |
| Proposed unloaded bodyweight candidates |36 |7.36% of489 |
| Candidate total |160 |32.72% of working sets;31.25% of all recorded sets |
| Exact2+-support exercise/date points |43 | Conservative exact load/rep grouping, not all possible Pareto pairs |
| Points with3 prior comparable dates within90days |13 | Baseline readiness, not confirmed improvement |
| Sets in those baseline-ready groups |36 |7.36% of489; NOT a milestone percentage |
| Machine-display working sets |265 |54.19% of489; station context missing |
| Bodyweight/assisted working sets |39 |7.98% of489; not all are supported rep contexts |
| Unmapped sets |0 | Canonical mapping does not establish setup comparability |
| Trusted context/receipt columns among audited workout tables |0 | Current production is not a deployed ranking system |

These are dataset aggregates, not member comparisons. Categories are diagnostic
and need not partition all sets. The124 free-weight sets are an upper bound under
explicitly adopted legacy-whitelist assumptions; missing ROM/setup and two-support
extraction can reduce it. The36 baseline-ready sets do not prove actual candidate
improvement, frozen baseline, later corroboration, receipt eligibility or novelty.
**No recorded activity is currently proven eligible for the new secure competitive
protocol** because that receipt/context boundary does not exist. Zero means
unverified by this proposed protocol, not zero real training or zero potential.

### Fair path without fabricated comparability

Every valid mode earns the same capped activity XP and C/W. Machine-heavy users
can reach the same activity ceiling850 but cannot obtain missing150 by relabeling
or by a participation substitute. Bodyweight users get only explicitly configured
unloaded rep-performance contexts; changes in mass/technique are not inferred.
Do not normalize unsupported users'850 to1000: dropping the denominator creates
an incentive to avoid supported contexts, then switch strategically.

Stage Global RP as an opt-in, clearly provisional pilot and withhold broad
competitive launch until support is measured across the enrolled population.
Concrete proposed gate: >=80% of consenting pilot members have at least two
user-chosen supported contexts, observed for eight weeks, without requiring
changes to their training. Do not infer this percentage from current aggregate
sets. Owner approval needed for the80% gate; report coverage by equipment cohort
with suppressed cells below5 rather than exposing tiny-cohort health/activity.
Members without those contexts keep lifetime progression, Consistency, private
records and Community access. No XP/badges are conditional on switching exercises.

Next adapters: opt-in named machine station + attachment + seat/ROM/setup version
+ display increment and entry convention; record repeatability, not cross-machine
mechanical equivalence. Standardized bodyweight variants with stable technique;
unilateral support only when per-side recording is explicit. Each adapter gets
tests and owner review. Curl identity correction remains separately scoped.

## 5. Two/three/four-set threshold experiment

Controlled same-date sessions have1,2,3,4,8,12 working sets, two alternating
canonical exercises, same weights/reps. Existing per-exercise/day caps apply.

| Sets | Minimum2, old40+5n | Minimum3, old40+5n | Minimum4, old40+5n | **Minimum2,10n selected** |
|---|---:|---:|---:|---:|
|1 |0 |0 |0 |0 |
|2 |50 |0 |0 |20 |
|3 |55 |55 |0 |30 |
|4 |60 |60 |60 |40 |
|8 |80 |80 |80 |80 |
|12 |80 |80 |80 |80 |

Changing only the threshold moves the large discontinuity from3->4 to1->2 or
2->3. Recommend two sets AND proportional10n, not just lowering the gate under
the large fixed base. This still has a0->20 boundary; split-day aggregation and
daily/weekly caps bound it. No minimum can prove quality or eliminate fabrication.
Warmups and valid one-set sessions save normally with neutral eligibility copy.
New smaller reward is not a prompt to add sets. No "one more set to earn XP" UI.

Eight-set sustainable weeks remain170/270/360/360XP for2/3/4/5 dates. Four-set
three-day weeks become150XP (3*40+30), not210. Two-set three-day weeks earn90,
three-set120. Their daily C contribution is.5/.75/1 at2/3/4 sets, W=.25/.375/.5;
there is no automatic full consistency credit at the lower threshold. Existing
private-history backfill is recomputed with the accepted version, signed deltas,
no silent rule mutation or repeated badge XP. Owner must approve lower4-7set XP.

## 6. Public competition does not imply automatic enrollment

Recommend public-to-authenticated-member boards, **explicit affirmative enrollment
for BOTH existing and new accounts**. All initialize rankings_enrolled=false and
rankings_visible=false, regardless of Workout Sharing. Existing sharingON is not
evidence of ranking consent; existing sharingOFF is not the only private cohort.
No checkbox preselection, implicit consent from using Training, or rewarded joining.

Show a plain disclosure before Join public rankings: audience signed-in LifeOS
members; public handle, current/peak league and aggregate board metrics; inferred
recent activity; logged-not-verified nature; opt-out control. Keep Workout Sharing,
notes sharing, public profile progression(show_progression), exercise participation
and milestone-feed sharing independent. Progression/exercise/feed flags default
OFF. Public XP means timely earned XP, not automatic exposure of private lifetime
history. Enrollment alone must not reveal lifetime XP, historical badges or
specific exercises; public profile progress requires its own affirmative choice.

Opt-out acknowledges only after authoritative privacy commit; every public query,
profile, old cursor and cached snapshot rechecks the current flag. Immediately
remove the member from readable public results; no asynchronous worker needed to
hide it. Hide stale local rows on state change/focus; already taken screenshots
cannot be recalled. An opt-out never deletes workouts or private XP. Rejoin requires
an explicit action and reuses receipt/event identities without duplicate awards.
This replaces the prior owner-approved default-visible recommendation for review,
not a claim that the owner has already accepted the changed enrollment policy.

## 7. Completion integration and source fidelity

Read the actual `WorkoutCompleted` in src/tabs/WorkoutTab.jsx and its styles,
plus the approved completion capture. Preserve that hierarchy: Training header,
Live/History/Manage, green success hero, **Back to training**, workout overview,
read-only grouped sets, **View history**, actual five-destination dock. Insert a
compact reward section directly after the main action. No Back to Rankings above
the hero. Secondary score-breakdown action may navigate to Rankings.

The isolated completion fixture uses eight recorded sets: four55kg*8 bench sets
and four80kg*8 Romanian-deadlift sets. Both canonical bilateral total-external
conventions permit4320kg volume;45minutes is explicitly supplied. These are
synthetic visual data, not fabricated production records. Future integration
continues using the actual metrics helper and omits uncertain values.

Success: server-confirmed+80XP and762RP (new executable illustration components
450/237/75). Account total6420XP/Level19 remains illustrative. Loading: workout
saved, rewards updating, no fabricated points. Unavailable: workout saved, no
need to relog; retry recalculation without saving another workout. No fake spinner
timeout simulates server success. Both navigation actions stay usable in all states.
The prototype's History/landing destinations are isolated read-only examples,
not a second production implementation. Full RLS/persistence acceptance is future.

## 8. Approval and remaining gates

Please approve or amend these product decisions together before engineering:

1. Same-day competitive receipt policy, offline/private-only fallback, and public
   All-time earned-XP subset beginning at enrollment.
2. Two-set minimum with10nXP and partial-day C, including lower4-7set XP.
3.21+21 decay/13.5 normalization,42-day placement window and slower return ramp.
4. Eight-week Consistency tuples; unranked Progress collection and staged Exercise.
5. Explicit opt-in for all accounts and separate profile/exercise disclosure.
6. Global pilot / coverage gate, proposed80% of enrolled members with two supported
   contexts, not an unsupported promise of Apex accessibility for every program.

No approval is assumed from provisional visual acceptance. No production source,
schema, history, permissions or deployment was changed. No schema rerun required.
SQL aggregates are live-read evidence only; the secure receipt protocol, adapters,
worker/SQL/RLS tests and real-device acceptance remain unimplemented launch gates.
