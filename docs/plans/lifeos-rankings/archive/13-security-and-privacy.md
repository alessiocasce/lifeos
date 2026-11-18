# Security, privacy and healthy incentives

> Historical archive; not current implementation instructions. Read [PROJECT_CONTEXT.md](../../../../PROJECT_CONTEXT.md) and the parent archive index before using this record.

> ARCHIVED DESIGN HISTORY. Do not implement from this document. See ../PRODUCT-SPEC.md
> for the single current specification and ../FINAL-APPROVAL.md for pending approvals.

## Revision 2 - current proposal, owner approval pending

REPLACE the<=3-day rule: timely claimed date must equal immutable server receipt day; set inventory is sealed per date. Receipts prove server receipt, not physical training. Offline/late logs remain valid History/private XP but no RP/public earned XP. New/existing public enrollment defaults OFF independently of sharing. See document17 threat comparison and tests.

The [final corrections](17-final-product-corrections.md) take precedence over conflicting text below.
## Version 1 reference and comparison (superseded where noted)

| Threat / failure | Required control | Acceptance proof |
|---|---|---|
| Replayed completion or double click | Server source revision + unique entitlements/events | Retry same operation100x: unchanged XP/RP/event count |
| Fake heavy weight | No activity multiplier; outlier progress hold, corroboration/high-water | Changing weight alone does not change C/W; held P has explicit reason |
| Many sets or custom aliases | 4/exercise,8/day,4 dates/week caps | 8->100 sets and canonical alias rewrite yield same entitlement |
| Split sessions | Aggregate by owner/local day | One versus three workouts with same sets yields same credit |
| Backdating | Frozen server receipt; <=3-day initial tolerance | Changing performed_on after award cannot move competitive day |
| Old record edits | Signed reconciliation, replay dependencies | Downstream invalid milestone revoked, no new celebration |
| Delete source row | Retained minimal source fingerprint + hourly anti-join/digest audit | Lost queue mark still repairs deleted credited source |
| Concurrent worker/edit | Per-user revision fence, idempotent publication | Delayed older worker cannot publish over newer source revision |
| Browser writes arbitrary XP | No client table mutation or worker grant | Authenticated A UPDATE score/ledger rejected |
| Cross-user access | Owner predicates + actor from auth.uid, not supplied IDs | A cannot read B's private facts, receipts or source notes |
| Private score leak | Read-time rankings/show_progression gates | Prior snapshot/cursor/profile URL cannot reveal opted-out row |
| Exercise-name leak | Separate exercise_rankings_visible=false by default | Global opt-in alone cannot reveal which movements were trained |
| Anonymous scraping | Revoke anon reads/executes, authenticated-only projections | Anon rejected on all rank/profile progression RPCs |
| Unsafe definer helper | Fixed empty search_path, qualified names, narrow grants | Role-level SQL tests and advisors pass |
| Auth switch | Account keyed hooks + generation guards | Delayed A response never appears under B |
| Offline timestamp fiction | No reward before server save; bounded late policy | Draft-only / future / >3-day RP cases do not award competitive credit |
| Looping comeback/badge awards | One logical award,0 bonus XP | Repeated inactivity/return cannot mint rewards |
| Popularity/pay-to-win | No score input from follows, reactions, purchases | Input schema excludes those sources |
| Scoring outage | Workout-save independence; stale/as-of labels | Saved workout survives worker/queue outage and reward failure |

Source workout tables remain owner-scoped. Never make them directly readable to
members for rankings convenience. Public RPCs return only authorized aggregates;
do not send source IDs or comparison history to another user's browser and then
hide them with CSS. Cached boards must recheck privacy at read time. Opt-out
mutation acknowledges only after the server gate is committed. No longer-visible
cached rows are removed on invalidation/focus; don't promise removal of screenshots
already taken by another member.

Users can see private XP while not ranked publicly. New accounts default visible;
existing explicit workout opt-outs are grandfathered hidden. Rankings consent is
not notes consent. Public exercise-specific participation is an additional opt-in
because naming an exercise can disclose training detail even without raw sets.
Public progression, all-time XP and badge/title display also honor show_progression.

## What the system cannot prove

Self-reported logs can be fabricated consistently. Repetition, caps and anomaly
holds cannot establish physical truth. Do not add phone-camera/sensor surveillance,
health-data collection, mandatory weigh-ins or hidden behavioral profiling to
pretend otherwise. A low-stakes social system needs proportionate controls:
report member, internal review, reversible score exclusion, and a clear appeal.
No automatic public cheating label based on a weight outlier. Private logging
still works during review. Moderator writes require an explicit server role,
reason code and audit; never trust user-editable account metadata.

## Health/incentive constraints

Training frequency is a product reward cap, not an exercise prescription. No
points for pain, failure, max attempts, calories or duration. No rest-day
notifications, debt, red streak-loss banners or guilt messages. Recovery/deload
can lower current RP while lifetime investment remains. Explain the difference
without calling the user inconsistent. The highest league is not a health goal.
Five daily sessions cannot buy a fifth rated date; no badge rewards seven-day
streaks. Advanced users have repetition/tick-based milestones instead of needing
large percentage gains; still no guarantee that every plateau reaches Apex.

Security recommendations follow Supabase's documented ownership/RLS model:
https://supabase.com/docs/guides/database/postgres/row-level-security . Proposed
grants are not tested production policies; future two-user/anon SQL acceptance
is mandatory before an engineering release.
