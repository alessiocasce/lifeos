// Model prices for the Companion usage ledger, in USD per 1M tokens.
// Checked 2026-11-22 against https://aistudio.google.com/docs/pricing and
// https://platform.claude.com/docs/en/about-claude/pricing. Prices change:
// re-check before each build step that depends on them (spec §9, §13).
//
// `inputTokens` in a usage record means *uncached* input. Thinking tokens are
// billed as output by both providers and must already be included in
// `outputTokens`.

const GEMINI_FLASH_INTRO_UNTIL = '2026-12-31';

const PRICES = {
  'anthropic:claude-haiku-5-5': [{ input: 0.10, output: 0.50, cacheRead: 0.01, cacheWrite: 0.125 }],
  'anthropic:claude-sonnet-5-5': [{ input: 2.00, output: 10.00, cacheRead: 0.10, cacheWrite: 2.50 }],
  'anthropic:claude-opus-5-5': [{ input: 4.00, output: 20.00, cacheRead: 0.20, cacheWrite: 5.00 }],
  'gemini:gemini-3.1-flash-lite': [{ input: 0.25, output: 1.50, cacheRead: 0.025 }],
  'gemini:gemini-3.5-flash-lite': [{ input: 0.30, output: 2.50, cacheRead: 0.03 }],
  'gemini:gemini-3-flash-preview': [{ input: 0.50, output: 3.00, cacheRead: 0.05 }],
  'gemini:gemini-3.6-flash': [
    { until: GEMINI_FLASH_INTRO_UNTIL, input: 0.75, output: 3.75, cacheRead: 0.075 },
    { input: 1.50, output: 7.50, cacheRead: 0.15 },
  ],
  'gemini:gemini-3.8-flash': [
    { until: GEMINI_FLASH_INTRO_UNTIL, input: 0.75, output: 3.75, cacheRead: 0.075 },
    { input: 1.50, output: 7.50, cacheRead: 0.15 },
  ],
  'gemini:gemini-2.5-flash': [{ input: 0.30, output: 2.50, cacheRead: 0.03 }],
  'gemini:gemini-2.5-flash-lite': [{ input: 0.10, output: 0.40, cacheRead: 0.01 }],
};

export function modelPrice(provider, model, at = new Date()) {
  const periods = PRICES[`${provider}:${model}`];
  if (!periods) return null;
  const day = romeDate(at);
  return periods.find((period) => !period.until || day <= period.until) ?? periods[periods.length - 1];
}

export function estimateModelCostUsd({ provider, model, usage = {}, at = new Date() }) {
  const price = modelPrice(provider, model, at);
  if (!price) return { costUsd: 0, priced: false };
  const tokens = (value) => Math.max(0, Number(value) || 0);
  const cost = (
    tokens(usage.inputTokens) * price.input
    + tokens(usage.cacheReadTokens) * (price.cacheRead ?? price.input)
    + tokens(usage.cacheWriteTokens) * (price.cacheWrite ?? price.input)
    + tokens(usage.outputTokens) * price.output
  ) / 1_000_000;
  return { costUsd: roundUsd(cost), priced: true };
}

export function roundUsd(value) {
  return Math.round((Number(value) || 0) * 1_000_000) / 1_000_000;
}

function romeDate(at) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(at instanceof Date ? at : new Date(at));
}
