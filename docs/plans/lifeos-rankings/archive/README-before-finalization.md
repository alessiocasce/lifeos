# LifeOS Rankings Blueprint

> Historical archive; not current implementation instructions. Read [PROJECT_CONTEXT.md](../../../../PROJECT_CONTEXT.md) and the parent archive index before using this record.

> ARCHIVED INDEX. Start at ../FINAL-APPROVAL.md and ../PRODUCT-SPEC.md instead.

## Revision 2 - final corrections, awaiting product approval

Start with [Final product corrections and before/after](17-final-product-corrections.md).
It supersedes conflicting v1 policy in documents00-16. Run
`node docs/plans/lifeos-rankings/simulations/revision.mjs` for23 new assertions,
the reproduced backdating exploit and its mitigation, minimum-set comparisons,
three decay/league/recovery/return mechanisms and revised illustration.

Completion prototype: [success](http://127.0.0.1:4178/docs/plans/lifeos-rankings/prototypes/index.html?rewards=success#training),
[loading](http://127.0.0.1:4178/docs/plans/lifeos-rankings/prototypes/index.html?rewards=loading#training),
[unavailable](http://127.0.0.1:4178/docs/plans/lifeos-rankings/prototypes/index.html?rewards=unavailable#training).
Live read-only aggregate coverage is documented; no source records are exposed.
Original model results remain explicitly labeled comparison evidence.

Public boards remain proposed, but enrollment is now recommended OFF until an
explicit independent choice for all accounts, not inherited from Workout Sharing.
This reverses the earlier recommendation below and requires owner approval.

Design-only work, based on commit 23a4b6256c9b86b8f8cf64bc458fc3f0429623ac.
Date: 2026-11-03 (Europe/Rome). No production code, records, schema, policies,
deployment or git history may be changed by this planning project.

## Approved owner decisions

- Hybrid consistency / meaningful work / personal improvement competition.
- Lifetime progression and separate activity-sensitive competitive standing.
- Permanent competition; no seasonal resets.
- Global, lifetime, consistency, progress and exercise leaderboards.
- Badges, titles, profile cosmetics; no pay-to-win.
- Highest league attainable on a sustained 3-4 days/week program.
- Rankings public to authenticated members by default, with an independent opt-out.
- Preserve existing Workout Sharing OFF members' privacy at enrollment.

## Start here

- [Executive recommendation](00-executive-summary.md)
- [Executed simulation evidence](06-algorithm-simulations.md)
- [Future engineering milestones](14-implementation-plan.md)
- [Launch blockers and readiness](16-risks-and-open-decisions.md)
- [Visual QA evidence](design-qa-before-finalization.md)

Local prototype (isolated QA Vite server already running on4178):
http://127.0.0.1:4178/docs/plans/lifeos-rankings/prototypes/index.html

Chart viewer:
http://127.0.0.1:4178/docs/plans/lifeos-rankings/simulations/results/index.html

If that server is stopped, run `node scripts/serve-ui-qa.js` from the repository
root and open the URL. It substitutes test services for the existing app, but
the ranking prototype itself imports no LifeOS data/API/auth modules. No backend
is connected, no credentials are required, no prototype state is persisted.
Do not deploy these planning artifacts as production functionality.

## Blueprint index

0. [Summary](00-executive-summary.md)
1. [Actual architecture](01-current-architecture.md)
2. [Decisions and model comparison](02-product-decisions.md)
3. [Lifetime XP and levels](03-lifetime-xp.md)
4. [Competitive ranking and decay](04-competitive-ranking.md)
5. [Personal progress](05-personal-progress-algorithm.md)
6. [Simulations](06-algorithm-simulations.md)
7. [Leaderboards](07-leaderboards.md)
8. [Badges, titles and rewards](08-badges-titles-rewards.md)
9. [Community and profiles](09-community-and-profiles.md)
10. [UX and completion contract](10-ux-interactions.md)
11. [Visual system](11-visual-design-system.md)
12. [Technical design](12-technical-architecture.md)
13. [Security/privacy](13-security-and-privacy.md)
14. [Tickets and rollout](14-implementation-plan.md)
15. [Tests and acceptance](15-test-and-acceptance-matrix.md)
16. [Risks/approvals](16-risks-and-open-decisions.md)

## Reproduce

`node docs/plans/lifeos-rankings/simulations/run.mjs` executes20synthetic profiles,
three models, sensitivity comparisons and16assertions. Outputs stay inside this
folder. `node docs/plans/lifeos-rankings/validate.mjs` validates documents, numeric
results, JSX syntax, recorded browser measurements/screenshots and scope safety.
It assumes the original baseline commit is still HEAD and no unrelated local
changes have been added; adapt only that scope assertion for a later task.

Results: [JSON](../simulations/results/report.json), [CSV](../simulations/results/summary.csv),
[daily trajectories](../simulations/results/trajectories.json),
[reproducible760RP fixture](../simulations/results/visual-fixture.json).
Chart SVGs are generated; PNGs are actual in-app-browser captures, not fake charts.
The `screenshots/` folder holds source references, the selected/alternative image
concepts, twelve individual390x844screens and36responsive measurements.

## Prototype screens

[Overview](../prototypes/index.html#overview) /
[Global](../prototypes/index.html#leaderboard) /
[Filters](../prototypes/index.html#filters) /
[Lifetime](../prototypes/index.html#lifetime) /
[Rank](../prototypes/index.html#rank) /
[Profile](../prototypes/index.html#profile) /
[Badges](../prototypes/index.html#badges) /
[Customize](../prototypes/index.html#customize) /
[Promotion](../prototypes/index.html#promotion) /
[Achievement](../prototypes/index.html#achievement) /
[Return](../prototypes/index.html#return) /
[Training attachment](../prototypes/index.html#training).

Prototype accounts and event scenes are synthetic. It demonstrates interactions
and hierarchy, not authenticated SQL/RLS, live XP, device acceptance or implemented
production scoring. Existing Training/Community behavior remains untouched.
