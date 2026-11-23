# Companion evals

Step 0 of the [Jarvis Companion spec](../../docs/specs/jarvis-companion.md): a test bench for the agent Brain before step 1 ships.

## What runs

- `scripts/evals/run-companion-evals.js` replays each case through the real agent loop (`api/_utils/companionAgentLoop.js`) and model adapter (`api/_utils/companionModel.js`). It uses the v1 tool catalog (`api/_utils/companionTools.js`) against a mock LifeOS world (`mockWorld.js`). Nothing touches real LifeOS data.
- `evalAssertions.js` scores every run deterministically: expected tool calls, forbidden calls, unwanted writes, confirmation for deletes, Italian replies, no debug output, reply length. No model acts as a judge.
- Severity follows spec §8. An unwanted visible write, a destructive action without confirmation, a wrong-language reply or leaked debug output is **P1**. A missed expected call takes the case's `severity` (default P2).
- Every model call writes a usage-ledger row. Rows go to Supabase `brain_usage_ledger` once migration `20261122150000` is applied; until then they go to `evals/results/*-usage.jsonl`.

## Cases

- **Public** (`evalCases.js`): invented, synthetic paraphrases. Every guarantee in spec §7 has at least one tagged case (`guarantee:*`). The default clock is Friday 2026-11-20, 18:30 Europe/Rome.
- **Private** (`evals/private/cases.json`): built from real conversations. The whole `evals/` folder is gitignored, because the repository is public. Never copy private cases, results or replies into tracked files, issues or PRs.

## Commands

```bash
npm run test:companion-foundations          # deterministic, no network
npm run eval:companion:export -- --days 120  # real messages -> evals/private/candidates.json
npm run eval:companion                       # all cases, default candidate models
npm run eval:companion -- --models anthropic:claude-haiku-5-5@low --cases private --filter sleep --repeat 3
```

Model specs are `provider:model[@effort]`. The effort sets Claude's `output_config.effort` and Gemini's `thinkingLevel`. Gemini needs `GEMINI_API_KEY` and Claude needs `ANTHROPIC_API_KEY`, both in `.env.local`. Every run spends real money. Check the cost column before repeating large runs.

## Reviewing private cases

Each private case has a `review` field:
- `proposed`: labelled by Claude from the old Brain's behaviour and the conversation;
- `approved`: checked by the user;
- `rejected`: skipped by the runner.

Fix `expect` wherever the label is wrong. A real conversation that went badly makes a good case: add it with the behaviour you wanted.
