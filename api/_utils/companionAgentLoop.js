// Bounded multi-step tool loop for the Jarvis Companion (spec §5.1).
//
// Pure orchestration: the caller injects `generate` (a bound model adapter
// call) and `executeTool` (validation, autonomy checks and execution). This
// keeps the loop identical between the step 0 evals and the real Brain.

export const COMPANION_LOOP_DEFAULTS = Object.freeze({ maxSteps: 6 });

export const COMPANION_FALLBACK_REPLIES = Object.freeze({
  refusal: 'Su questo non posso aiutarti.',
  stuck: 'Mi sono incartato, puoi ripetermelo in un altro modo?',
});

export async function runCompanionTurn({
  generate,
  executeTool,
  system,
  history = [],
  message,
  tools = [],
  maxSteps = COMPANION_LOOP_DEFAULTS.maxSteps,
}) {
  const allowed = new Set(tools.map((tool) => tool.name));
  const messages = [...history, { role: 'user', content: String(message ?? '') }];
  const steps = [];
  const toolCalls = [];
  const startedAt = Date.now();
  let lastText = '';

  for (let index = 0; index < maxSteps; index += 1) {
    const turn = await generate({ system, messages, tools });
    steps.push({ latencyMs: turn.latencyMs, costUsd: turn.costUsd, usage: turn.usage, stopReason: turn.stopReason, toolCalls: turn.toolCalls.length });
    lastText = turn.text || lastText;

    if (turn.stopReason === 'refusal') return finish('refusal', COMPANION_FALLBACK_REPLIES.refusal);
    if (!turn.toolCalls.length) {
      return finish(turn.stopReason === 'max_tokens' ? 'max_tokens' : 'end', turn.text);
    }

    messages.push({ role: 'assistant', turn });
    const results = [];
    for (const call of turn.toolCalls) {
      let output;
      let isError = false;
      if (!allowed.has(call.name)) {
        output = { error: `Unknown tool ${call.name}.` };
        isError = true;
      } else {
        try {
          output = await executeTool(call);
          isError = Boolean(output && output.ok === false);
        } catch (error) {
          output = { error: String(error?.message ?? 'Tool failed.').slice(0, 300) };
          isError = true;
        }
      }
      toolCalls.push({ step: index, name: call.name, input: call.input, output, isError });
      results.push({ id: call.id, providerId: call.providerId ?? null, name: call.name, output, isError });
    }
    messages.push({ role: 'tool_results', results });
  }

  return finish('max_steps', lastText || COMPANION_FALLBACK_REPLIES.stuck);

  function finish(stopReason, reply) {
    const sum = (key) => steps.reduce((total, step) => total + (Number(step.usage?.[key]) || 0), 0);
    return {
      reply: String(reply ?? '').trim(),
      stopReason,
      steps,
      toolCalls,
      messages,
      latencyMs: Date.now() - startedAt,
      modelLatencyMs: steps.reduce((total, step) => total + (step.latencyMs || 0), 0),
      costUsd: Math.round(steps.reduce((total, step) => total + (step.costUsd || 0), 0) * 1_000_000) / 1_000_000,
      usage: {
        inputTokens: sum('inputTokens'),
        outputTokens: sum('outputTokens'),
        cacheReadTokens: sum('cacheReadTokens'),
        cacheWriteTokens: sum('cacheWriteTokens'),
      },
    };
  }
}
