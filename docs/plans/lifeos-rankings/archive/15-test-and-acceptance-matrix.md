# Test and acceptance matrix

> Historical archive; not current implementation instructions. Read [PROJECT_CONTEXT.md](../../../../PROJECT_CONTEXT.md) and the parent archive index before using this record.

> ARCHIVED DESIGN HISTORY. Do not implement from this document. See ../PRODUCT-SPEC.md
> for the single current specification and ../FINAL-APPROVAL.md for pending approvals.

## Revision 2 - current proposal, owner approval pending

Add23 deterministic revision tests, including exact360XP/378RP reproduction, one-date mitigation, public earned-XP exclusion, late set top-up, client rankDay rejection, min2/3/4, kernel/league/recovery/return parity, consistency ties and explicit unenrolled defaults. Future SQL still must prove unforgeable receipts, ownership, privacy and atomicity; arithmetic tests do not prove DB security.

The [final corrections](17-final-product-corrections.md) take precedence over conflicting text below.
## Version 1 reference and comparison (superseded where noted)

Executed planning evidence is deliberately separate from future release tests.

| Area | Executed now | Future engineering acceptance |
|---|---|---|
| XP/RP arithmetic | 20 profiles, 365 dates, three models, 16 assertions | JS/SQL golden parity, exact calendar integration |
| Levels | First10,000 thresholds invert; 1-5 frequencies; five-year run | BIGINT/decimal string browser limits and overflow |
| Progress | Representative corroboration, context/cooldown/high-water tests | Real set representative extraction, whitelist/tick/setup validation, replay evidence |
| Anti-farming | Same-day split,100sets,duplicatepayload,weight-only,late edits | Sealed receipt grants,fingerprint deletion audit,concurrent DB workers |
| Privacy/RLS | Source policies inspected; no SQL changes | Two authenticated identities+anon attempt every proposed RPC/table write/read |
| UI | Isolated prototype browser capture/interaction evidence in design-qa | Production component integration,auth switch,read revocation |
| Physical mobile | Not executed | Safari controls/keyboard,standalone launch,source draft continuity |

## Deterministic golden cases

- n=0/3 =>0 XP; n=4=>60; n=8/100=>80; all warmups=>0.
- One exercise with8sets caps4=>60; two with4each=>80; alias sameUUID cannot
  become a second exercise. Unknown aliases still cannot exceed8/day/4daysweek.
- Weekly n=8 days:1/2/3/4/5 ->80/170/270/360/360 XP; fifth better day replaces,
  never appends another daily base. Delete replacement day correctly restores next.
- All signs/zero/NaN/decimal reps/invalid dates/future dates handled without
  rejecting otherwise valid source logging merely because score is ineligible.
- At activity age14 k=1, age15=13/14, age27=1/14, age28=0. No extra multiplier.
- Placement fourdates spanning14; Apex ten spanning21; tests at exact thresholds.
- Demote below entry-20 on two consecutive as-of dates; no fake worker sample
  from a second retry on the same date. At0 or placementlost=>Unranked.
- Visual760 fixture => exact446.428571+238.888889+75,RP760; displayed446/239/75.
- Candidate 50x8baseline,52.5x8 atday21, repeatday28 ->oneunit; one isolated
  high set,no repeat,contextchange,oldHWMregain,no baseline ->noaward.
- 150->152.5 tick qualifies; 10->12 and40->42 produce same unit, not percentage
  point bonuses. More than20% load jump or5reps above baseline held pending review.

## Security and failure scenarios to implement

User A cannot mutate B's workouts/preferences/facts/style or acknowledge B's
announcement. Anon cannot enumerate rows. Authenticated cannot write ledger or
server receipts via REST, RPC or inserted source timestamps. User-editable JWT
metadata never authorizes admin actions. RLS source predicates stay unchanged.
Opt-out hides cached/snapshot/profile/old-cursor results immediately, while private
XP remains. Exercise board opt-in is independently OFF by default. Notes never
enter rank responses. SharingOFF+RankON reveals only approved aggregates.

Fault tests: crash after source write/before queue consumption, lost-mark deletion
repaired by retained source fingerprint audit, duplicate lease, stale worker publish, error mid-ledger transaction,
historical date moves bothweeks,source deletion invalidates downstream milestone,
new rules/replay/backfill not another celebration. Real workout remains saved
when ranking code fails. Do not claim fail-open plus eventual deletion correction
without a proven retained fingerprint/anti-join repair path.

## UI/browser checklist

At390x844 capture all12named views, compare overview with selected reference.
At375/430 check every view for horizontal overflow, button/dock clearance and
long labels. Interact: overview->score->lifetime; board->filters->category;
search noresult->clear; loadmore; row->correctmember; profile->customize->title/
frame/accent/pins->Done; hide rank->board excludes self; badge requirements dialog
Escape/focus restore; index transitions; promotion/return/train attachment.
Check visible images are loaded, console has no fatal errors and no auth/network
calls escape prototype. Use only the selected in-app browser for visual QA.

No owner production records are created. No migrations, repository-wide tests,
production deployments, Rankings endpoints or real award writes are needed to
validate this design. Future implementation tests are not marked passed here.
