# Achievements, titles and cosmetics

> Historical archive; not current implementation instructions. Read [PROJECT_CONTEXT.md](../../../../PROJECT_CONTEXT.md) and the parent archive index before using this record.

> ARCHIVED DESIGN HISTORY. Do not implement from this document. See ../PRODUCT-SPEC.md
> for the single current specification and ../FINAL-APPROVAL.md for pending approvals.

## Revision 2 - current proposal, owner approval pending

Qualifying activity days now follow two-set /10nXP rules; badges still award0XP. Existing lifetime achievement disclosure requires separate affirmative show_progression consent, not public ranking enrollment or Workout Sharing. Titles/cosmetics remain non-competitive. Recompute source-dependent achievements under the accepted rule version.

The [final corrections](17-final-product-corrections.md) take precedence over conflicting text below.
## Version 1 reference and comparison (superseded where noted)

Badges are permanent with respect to inactivity, but revocable if their source
conditions were invalidated by corrections/deletion or confirmed abuse. All
awards are one per account per badge code, nonrepeatable, **0 bonus XP**, and
pinnable. Thus the reward cap is one cosmetic unlock, never an XP feedback loop.
Do not remove a valid achievement merely because its rolling window has ended;
retain the historical evidence snapshot, subject to source correction.

An active week has >=2 credited dates, not a daily streak. q=corrected lifetime
credited days after the best-four-per-week cap, not every logged training date.
Baseline windows count canonical context.

| Code / badge | Family | Exact condition | Visual library cue |
|---|---|---|---|
| first_step / First Step | First | q>=1 | Check |
| routine_builder / Routine Builder | First | q>=12 | Layers |
| foundation / Steady Foundation | Consistency | 4 consecutive active ISO weeks | Shield |
| twelve_weeks / Twelve Weeks Strong | Consistency | 12 consecutive active weeks | Calendar |
| quarter / Quarter Built | Dedication | 13 active weeks total | Blocks |
| long_game / Long Game | Dedication | 52 active weeks total | History |
| century / Century Club | Dedication | q>=100 | Medal |
| three_hundred / Built to Last | Dedication | q>=300 | Award |
| first_progress / First Breakthrough | Progress | 1 retained corroborated event | Target |
| ten_progress / Progress Architect | Progress | 10 retained events on >=3 canonical exercises | TrendingUp |
| patient_progress / Patient Progress | Progress | 3 events spaced across >=180 days | Hourglass |
| comeback / Return to Form | Comeback | 3 qualifying dates within 14 days after >=28 inactive days | ArrowRight |
| second_year / Another Chapter | Lifetime | Qualifying dates in two different calendar years | BookOpen |
| level10 / Established | Level | Corrected level>=10 | Star |
| level25 / The Long View | Level | Corrected level>=25 | Compass |
| level50 / Enduring | Level | Corrected level>=50 | Mountain |
| diamond / Diamond Reached | Competitive | First valid published Diamond league | Gem |
| apex / Apex Reached | Competitive | First valid published Apex league including placement gate | Crown |
| bench_progress / Bench Builder | Exercise | 3 corroborated events on approved bench IDs over >=56 days | Dumbbell |
| movement_range / Broad Foundation | Variety | >=2 qualifying dates in each of 3 primary muscle categories over a 90-day span | Grid2X2 |

Variety excludes ambiguous/custom categories; it is a slow cosmetic milestone,
never a prompt to add exercises to today's program. Comeback is once lifetime,
so cycling inactivity cannot farm unlocks or XP. Competitive badges store the
published snapshot and underlying revision references; a correction invalidating
that peak can revoke the badge and equipped title, with a neutral explanation.

## Titles: one equipped, optional, plain readable text

Getting Started: first_step (common); The Builder: routine_builder (common);
The Consistent: foundation (uncommon); Twelve Weeks Strong: twelve_weeks
(uncommon); Century Member: century (rare); Progress Architect: ten_progress
(rare); Patient Practitioner: patient_progress (rare); Back in Motion: comeback
(uncommon); The Long Game: level25 (rare); Enduring: level50 (epic);
Diamond Member: diamond (rare); Apex Member: apex (epic).

Rarity is editorial unlock difficulty, not a fabricated percentage of users.
Titles never show as identity verification. If an equipped title is revoked,
fall back to no title. User-authored usernames/display names are unchanged.

## Cosmetics and ownership

Up to three pinned badges. Unlock a plain steel avatar frame at Level20, a
restrained long-view frame at Level25, and a milestone profile accent treatment
at Level50. Current league emblem is always separately labeled and reflects
current league; earned frames never impersonate active Apex status. Plain is
available to every member; cosmetics can be hidden without losing entitlements.
Preserve user accent selection; rank-specific colors are confined to emblems
and league identity, not a full-page forced theme.

No animation by default on rows/profiles. A one-time 250ms promotion/achievement
entrance may respect reduced motion and has an immediate Continue button. No
confetti, forced modal queue, purchases, popularity bonuses or scarcity timers.
