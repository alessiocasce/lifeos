# LifeOS progression blueprint

1. **[FINAL-APPROVAL.md](FINAL-APPROVAL.md)** - read first; recommendations and approvals.
2. **[PRODUCT-SPEC.md](PRODUCT-SPEC.md)** - ONLY current normative product rules.
3. [IMPLEMENTATION.md](IMPLEMENTATION.md) - tickets, dependencies, tests/security/rollback.
4. [design-qa.md](design-qa.md) - actual browser/visual evidence and limitations.
5. [DECISION-CHANGELOG.md](DECISION-CHANGELOG.md) - why decisions changed.

Earlier numbered files are in `archive/`, explicitly non-normative. Original
engine/run/results are v1 comparison data. Current: revision-engine.mjs,
revision.mjs and revision-report.json. Do not choose defaults from the archive.

## Local preview

Existing isolated QA server: `node scripts/serve-ui-qa.js` on4178. The prototype
imports no production auth/API/data modules and persists no personal state.

- [Success](http://127.0.0.1:4178/docs/plans/lifeos-rankings/prototypes/index.html?rewards=success#training)
- [Pending](http://127.0.0.1:4178/docs/plans/lifeos-rankings/prototypes/index.html?rewards=loading#training)
- [Unavailable](http://127.0.0.1:4178/docs/plans/lifeos-rankings/prototypes/index.html?rewards=unavailable#training)
- [Long completion](http://127.0.0.1:4178/docs/plans/lifeos-rankings/prototypes/index.html?rewards=success&long=1#training)
- [Concept1 Rankings](http://127.0.0.1:4178/docs/plans/lifeos-rankings/prototypes/index.html#overview)
- [Charts](http://127.0.0.1:4178/docs/plans/lifeos-rankings/simulations/results/index.html?chart=revision-decay)

## Reproduce

```
node docs/plans/lifeos-rankings/simulations/revision.mjs
node docs/plans/lifeos-rankings/validate.mjs
```

38 current deterministic assertions, executable examples, four new charts;
aggregate coverage in simulations/results/coverage-audit.json. SQL in
simulations/coverage-audit.sql is read-only reproduction, NOT a migration/rerun.
The original planning validation used source baseline `23a4b6256c9b86b8f8cf64bc458fc3f0429623ac`; that is a historical baseline, not the current repository HEAD. The rankings work remains design-only and has not added production scoring, enrollment or rewards. Current source/release status is in [PROJECT_CONTEXT.md](../../../PROJECT_CONTEXT.md). No schema rerun required for the planning artifacts.
