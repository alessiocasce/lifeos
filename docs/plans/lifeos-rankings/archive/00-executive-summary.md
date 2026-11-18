# Executive recommendation

> Historical archive; not current implementation instructions. Read [PROJECT_CONTEXT.md](../../../../PROJECT_CONTEXT.md) and the parent archive index before using this record.

> ARCHIVED DESIGN HISTORY. Do not implement from this document. See ../PRODUCT-SPEC.md
> for the single current specification and ../FINAL-APPROVAL.md for pending approvals.

## Revision 2 - current proposal, owner approval pending

Recommend same-day server-owned competitive receipts; private historical XP stays separate from public timely earned XP. Two-set /10nXP,21+21 decay normalized by13.5, explicit public opt-in, useful eight-week Consistency and staged Progress/Exercise. Global competition remains a coverage-gated opt-in pilot, not universally fair launch-ready scoring.

The [final corrections](17-final-product-corrections.md) take precedence over conflicting text below.
## Version 1 reference and comparison (superseded where noted)

Recommend Model B: **Lifetime XP + a 0-1,000 current Rank Points score**.
XP records training investment; RP measures recent self-reported training, not
verified athletic ability. Neither rewards popularity, money, RPE 10 or raw kg.

| System | Recommended rule |
|---|---|
| Qualifying day | Completed workout(s), 4 eligible working sets after per-exercise caps |
| Counted sets | Max 4/exercise/day, 8/day; warmups excluded |
| Lifetime XP | 40 + 5n per qualifying day; best 4 days per Monday-Sunday week |
| Weekly bonus | 0/0/10/30/40 XP for 0/1/2/3/4 counted days |
| Maximum | 80/day; 360/week; split sessions share the daily allowance |
| Level | Start 1; next level costs 100 + 25L; no product maximum |
| Competitive | round(450C + 400W + 150P), each component in [0,1] |
| Activity memory | 14 days full weight, then linear fading to zero at age 28 |
| Competition ceiling | 3-4 days/week; fifth day cannot add a fifth rated day |
| Progress | Comparable improvement repeated on another day; never participation mislabeled as improvement |
| Leagues | Bronze 1, Silver 250, Gold 450, Platinum 650, Diamond 800, Apex 900 |
| Rewards | Badges/titles/cosmetics; badge awards grant 0 additional XP |

The owner selected visual concept 1 (competitive standing first). The prototype
is isolated from production; the existing History and completion layouts are
not replaced. The proposed completion reward is an additive attachment only.

## What was actually evaluated

The executable experiment covers 20 synthetic profiles over 365 days, plus
five-year lifetime progression, candidate comparisons, sensitivity sweeps and
16 assertions. Artifacts: simulations/results/report.json, trajectories.json,
summary.csv and five SVG charts. No private production workout rows were read.

For 52 complete weeks at eight eligible sets/day, 1/2/3/4/5 weekly days yield
4,160 / 8,840 / 14,040 / 18,720 / 18,720 XP and levels 15/23/30/35/35.
At a steady plateau, average RP is approximately 290/580/846/850/850.
A plateau remains competitive; it does not automatically earn Apex. Progress
is only 15% so a stronger athlete is not required to PR every session.

## Approval and launch gates

These are tested **design recommendations**, not an implemented or clinically
validated system. Current curl identity ambiguity, immutable competitive receipt
tracking, progress context capture and SQL authorization/replay tests must be
resolved before an engineering rollout. Machine contexts cannot be inferred.
All acceptance gaps are tracked in 16-risks-and-open-decisions.md.

No production files, schema, RLS, workout records, commits or deployment change
in this project. Future implementation requires a separate task and approval.
