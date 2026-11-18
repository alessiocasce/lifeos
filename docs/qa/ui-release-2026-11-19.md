# UI release checks: 2026-11-19

Scope: accumulated Settings, mobile navigation, Companion, Community, Training
and documentation work since `fe8b99c`, plus the final full-width red Delete
button matching Save template. User explicitly authorized commit, push and merge.

## Checks

- `npm test`: PASS, including Brain and the durable template-draft service test.
- Supplemental social-training, Community, rest coordinator/adapter/rest, workout
  push harness, PWA and function-budget checks: PASS.
- Production build: PASS; existing non-fatal large-chunk warning remains.
- Italian dictionary generation and Git whitespace: PASS.
- Chromium: all 430 selected cases validated. Full run passed 426; four
  timeout/fixture-timing cases passed in the focused final recheck (4/4).
- WebKit: all 63 selected cases validated. Full run passed 59; four picker,
  localized-unavailable-state and persistence-timing cases passed in final
  focused recheck (4/4). Browser batches used isolated fixtures.
- Final mobile (390px), scrolled action clearance and desktop (1440px) editor
  renders inspected: Add is blue, Save green and equally sized Delete red.
- Changed Markdown relative links and UTF-8 text: PASS.

Initial broad runs exposed older UI test contracts and an isolated monitor clock
mismatch. Fixtures now exercise current labels, custom menus, staged templates,
username setup and completion behavior; persistence assertions await writes.
The final browser rechecks corrected localized unavailable labels, awaited
confirmed creation/history writes and utility-menu dismissal. The 12-viewport
accessibility screenshot case and image encode/upload/remove case have explicit
budgets; no assertions were skipped. The isolated WebKit picker passed its
rerun without a production animation change.

The monitor fixture uses a deterministic database insertion clock, retaining the
real expires-after-creation constraint. There is no production schema change.

## Review

Standards review: no hard documented-standard breach. One P2 external-reorder
conflict finding was corrected and re-reviewed without further actionable issue.
Spec review: the same P2 finding was corrected and re-reviewed without further
finding. Exact attempted order snapshots allow lost-response retries while
rejecting a reorder saved by another editor before this save starts. Regression
also confirms metadata-only changes avoid exercise writes.

The preflight read and client writes are not a transaction: simultaneous changes
after that read retain the existing transaction-level concurrency limitation.

## Boundaries

No schema rerun required. No production account mutations, test messages or push
notifications were sent. Browser tests use isolated fixture services. Physical
phones, native picker choices and screen readers were not accepted by this run.
Private real-data preview snapshots and generated analysis/scratch stay local.
Rankings plans/simulations in the accumulated docs remain design-only.

Release branch: `release/ui-refinements-20261118`; authorized target: `main`.
All source validation and both review axes are complete. The release is ready
for push and fast-forward merge. Resolve the release SHA from Git history and
verify the hosted `build-version.json` against it after the main push; local
validation alone does not establish deployment readiness.
