# Current session handoff

## Jarvis Companion, 2026-11-23 (read first)

Spec: [jarvis-companion.md](../specs/jarvis-companion.md). Parent issue #9, steps #10–#16.

- **Step 0 (#10) is done and closed.**
  - It is committed as `a2f97ec` on branch `jarvis/step-0-foundations`, pushed but **not merged**.
  - A push to `main` deploys production, so merge this branch together with step 1.
  - Work continues on this branch. Check `git status` and `git branch` first.
- **What exists:**
  - the agent loop, persona, tool catalog v1, model adapter, usage ledger with spend guard, and flags (`api/_utils/companion*.js`);
  - the eval bench (`tests/companion/`, `scripts/evals/`).
  - Step 0 itself was inert. Step 1 (below) wires it to WhatsApp and real data, behind `COMPANION_AGENT` (off by default). The old Brain still serves the app.
- **Models** (spec §5.1 and §10):
  - fast tier `gemini:gemini-3.8-flash`, chosen for zero P1 across 174 runs and a p95 of 18.0s, close to the 20s target;
  - deep tier `gemini:gemini-3.8-flash@high`, provisional;
  - Claude is not measured, because the user declined to add `ANTHROPIC_API_KEY` for now.
- **Budget:**
  - The Gemini API has about $60 of credits plus $5 of the user's own money. About $3.5 has been spent.
  - Estimate the cost before each eval run. A full run with 3 models over 87 cases costs about $1.
- **Not done yet:**
  - The usage-ledger migration `20261122150000` is NOT applied. Apply it with the step 1 deploy, after explaining it to the user in plain terms.
  - The private eval cases live in gitignored `evals/private/` (the repo is public). Never commit them or quote them in issues.
- **User rules:**
  - Logging a wake or sleep time that the user stated is correct, not an unwanted write.
  - Keep the real WhatsApp ID in `bridge/whatsapp/README.md` for now.
- **Step 1 (#11) is built and tested locally (2026-11-23). It is UNCOMMITTED** on `jarvis/step-0-foundations`. The user did not ask for a commit. Run `git status` first; the work lives only in the working tree.
  - New:
    - `api/_utils/companionToolExecutors.js`, `companionActionLedger.js`, `companionContext.js` and `companionTurn.js`;
    - migration `supabase/migrations/20261123120000_companion_step1_commitments.sql`;
    - `scripts/tests/test-companion-agent.js` (`npm run test:companion-agent`, 13 checks, wired into `npm test`).
  - Changed:
    - `inbound.js` (`selectWhatsappBrainHandler`, flag read on each request);
    - `beginBrainChat` (optional injected `client`/`userId`);
    - `brainProactiveRules.js` (memo select `*`; `kind='checkin'` goes out once as the question, rule `companion_checkin_due`);
    - `companionTools.js` (shared `validateCompanionToolInput`; `upsert_commitment` no longer requires title/kind, so updates don't rename);
    - the persona (refs, open threads, replying-to);
    - the PGlite test adapter (`delete`, `gt`).
  - Validation: `npm test` (including `test:brain`), `npm run build` and `git diff --check` all pass. The functions count is still 7.
  - Eval run (mock world, `gemini-3.8-flash`, 87 cases × 1 run, about $0.62):
    - 86/87 passed, 0 P1, guarantees 100%, p50 7.0s, p95 15.6s;
    - the one failure is a private training-history case that ran out of steps (P2). Look at it next.
    - Budget spent so far is now about $4.1.
  - Deploy order is in `docs/QA_DEPLOYMENT.md` ("Jarvis Companion Step 1 Deployment"): migrations `20261122150000` and `20261123120000`, then the code with the flag unset, then `COMPANION_AGENT=true` and a redeploy. Explain both migrations to the user in plain terms before applying them. **No schema.sql rerun.**
  - Still open for #11:
    - the deploy;
    - 5–7 days of real use with traces reviewed (zero P1);
    - p95 latency on real data.
- **Deployed 2026-11-23:** step 1 committed as `7415862`, merged to `main` as `c774b16` (Vercel success). Migrations `20261122150000` and `20261123120000` applied to production in one transaction, recorded in `supabase_migrations.schema_migrations`, verified (19 memos all `reminder`, lock probe OK). `COMPANION_AGENT` is still unset; the user sets it in the Vercel dashboard and redeploys (no Vercel CLI here).
- **`COMPANION_AGENT=true` set in Vercel Production** via the CLI (folder now linked with `vercel link`, team `lifeos2`, project `lifeos`) and redeployed. The first live WhatsApp turns were served by the Companion (7.3s, $0.007, correct answer).
- **Step 1 follow-up (built, UNCOMMITTED):**
  - the agent loop makes one final tool-less call (`toolChoice: 'none'`) when the 6 steps run out (`stop_reason: max_steps_answered`);
  - the training reader filters by Italian muscle group via the new `api/_utils/companionTraining.js` (session name or exercise keywords), shared with the eval mock; it returns `total_sessions` and allows 120 workouts / 20 listed sessions;
  - the history window is 40 messages × 1500 characters;
  - persona rule (user decision): workout counts use only logged workouts (`total_sessions`), never done gym reminders; "questo/sto/ultimo mese" = last 30 days. Covered by the public case `training-count-ignores-reminders`.
  - Eval: 86/87, with the one miss a Gemini 503 (rerun 2/2 pass); `real-legs-this-month` now passes. p50 8.4s, p95 21.5s (above the 20s target, watch on real data). About $0.62.
  - **Caution:** `workouts` holds other Community accounts' rows. Always filter by `user_id` when checking an answer.

## Mobile bug follow-up, 2026-11-19

After `aa9cb18`, the user again reports Companion's dock higher on iPhone.
The shared dock frame now anchors from the measured visual viewport top with an
explicit height, bypassing the implicit fixed-position layout-viewport bottom.
The regression covers a visible viewport both taller and shorter than layout,
across actual tab navigation and recovery without focus. The old equal-viewport
tests missed this coordinate-space defect. Physical iPhone rendering remains
unverified; do not claim this browser reproduction proves native acceptance.
This changes navigation CSS only; Companion/keyboard behavior is preserved.

Latest correction after `2ef0d8d`: one fixed body-level frame positions the lower
navigation on every tab; its safe-area-adjusted bottom is lower globally.
Companion locks document panning and uses one effective chat height rather than
separate animated height/padding. Its pull-refresh wrapper and app-added keyboard
motion are removed. Compare rendered rectangles across tabs and a focus/blur cycle,
not only CSS inset values. Earlier "eased dismissal" notes are superseded. Native
iPhone acceptance remains open; see the newest mobile evidence section.

After `a1cd972`, the user reports insufficient typing space, Send requiring prior
keyboard dismissal, Companion's raised dock and cramped exercise results. The
correction holds keyboard state through blur until viewport recovery, preserves
pointer focus, removes duplicate mobile Companion headings and collapses the
toolbar while typing, uses a 54px composer, and gives exercise catalog search the
full visible viewport with one Search/filter/Close row. Acceptance must check
usable space and first-tap actions, not just whether a box fits above the keyboard.
The previous implementation's exercise results measured only 38px in a 360px
visual viewport. Native iPhone acceptance remains open.

The user reopened the iPhone photo zoom and Companion keyboard defects after
`3f7b6dd` reached production. The next correction uses a full-viewport photo
overlay with a native close control, plus a permanent Companion viewport layout
instead of switching positioning modes during keyboard opening. Test loaded square
and portrait photos, not just initials. Safari's native arrows/tick form assistant
bar has no supported PWA opt-out. Preserve that limitation and await user iPhone
acceptance; see the reopened-defect section in the mobile evidence below.

The mobile follow-up fixes pull-to-refresh swallowing small workout-card
taps, isolate photo animation to the circle and remove its container outline,
lower the mobile bar by 6px with visual-viewport tracking from startup, fit
Companion/modal forms above the keyboard, preserve bottom-pinned chat during
resize, and remove the cross-tab workout banner plus Command's Training-in-progress
headline. Training navigation and Command's active-work card still resume the
session. See [mobile bug evidence and device checks](../qa/mobile-bugfixes-2026-11-19.md).
No schema rerun required. Native iPhone keyboard/photo/cold-PWA behavior still
needs physical-device acceptance. The user explicitly authorized committing and
deploying this follow-up. Release through `main` and the existing Vercel Git
integration; confirm READY status and the public build-version SHA for completion.

## Release batch: 2026-11-18 to 2026-11-19

The user explicitly requested the final Delete-button correction, all checks,
updated handoff, commit, push and merge to main. Validation is authorized again;
older instructions to defer tests applied only during the earlier feedback batch.
The validated release branch is `release/ui-refinements-20261118`, based on
`fe8b99c`, with `main` as the authorized merge target. Check current Git refs
for the completed merge rather than relying on older local-only notes.
Release status and final evidence: [UI release checks](../qa/ui-release-2026-11-19.md).

## Preserve these UI decisions

- Training Create/Edit use the same name/appearance/exercise components. The
  labelled title has a subtle underline; color and icon choices are collapsed
  menus. Defaults for new templates are blue and the general dumbbell.
- Approved Manage/Create heading typography and the first-template empty state
  stay. Your templates is the small blue back link above the editor heading.
- Blue Add exercise opens the custom searchable picker. Exercises are staged
  locally with Up/Down/Remove in one contextual row and reversible motion.
  Create/Save is one full-width green final action; confirmed Delete matches
  its size and shape in red. There are no per-exercise write buttons.
- Draft navigation guards, mutation exclusion and partial-save Retry remain.
  `saveDraft` binds each request to the initiating account, uses stable exercise
  IDs, stages unique orders, preserves notes and reads back the saved template.
  Exact attempted order states distinguish retries from external reorders.
  This is a multistep client operation, not a database transaction.
- The empty-workout sheet is compact: heading/X, one labelled name and Start.
  Training's start heading is beside the icon, with no LIVE badge.
- Community author names use @ and regular 18px type with a 44px avatar. Counts
  align at the right: exercises on the title row, sets on every subtitle row.
  Shared detail reuses the author styling, keeps the unboxed date right beside
  the workout title, highlights warmups orange and omits exercise-number badges.
- Community profile photos use Settings' geometric thumbnail-to-circle viewer,
  without edit/delete controls. Settings shows the circle with pencil/bin only;
  its username is vertically centered and Edit stays on the card's right edge.
  Photo motion enlarges/shrinks from the clicked position, without fading.
- Preserve the shared charcoal/blue palette, floating spring mobile bar and
  Companion conversation/context-sheet work included in this release.

## Validation and local artifacts

`npm test` passes, including the durable template-draft helper test. The isolated
attention database now shares its deterministic insertion clock with application
expiry calculation; production schema and expiry constraints are unchanged.
The browser fixtures were updated for current control names, custom menus,
staged templates, mandatory username setup, warmup reset and completion flow.
Async persistence assertions wait for confirmed writes.

All 430 Chromium and 63 focused WebKit cases were validated, including final
focused rechecks after fixture/timing corrections. Exact batch results and
remaining boundaries are recorded in the release evidence.
Physical iPhone/PWA, native photo picker/camera, screen-reader speech and push
notification display require device acceptance; browser emulation does not prove
those. No live database mutations or schema changes were made for release QA.
No schema rerun required.

Private authenticated Community snapshots/photos, screenshots and review probes
remain ignored under `test-results/`. Generated `graphify-out/` and historical
`lifeos-rest-implementation-notes/` scratch remain local and ignored. Durable
source, tests and accumulated documentation are included; rankings documents and
simulations remain design-only and do not implement ranking behavior.

## Resume the local preview

Inspect `git status` first. `node scripts/serve-ui-qa.js` serves current source at
http://127.0.0.1:4178 with isolated fixtures; reuse it if already running. Standard
routes are `/settings`, `/community`, `/workout` and `/assistant`.
The populated, current-database Community review is available locally at
`/test-results/community-preview.html`; its ignored snapshot is dated and is not
live synchronization. Never commit or deploy those private fixture artifacts.

Relevant acceptance details: [Training Manage](../qa/training-manage-apple-design.md),
[Community](../qa/community-apple-design.md), [Settings](../qa/settings-apple-design.md),
[Companion](../qa/companion-apple-design.md), [bottom bar](../qa/apple-bottom-bar.md).
