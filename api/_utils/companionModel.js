// Provider-neutral model adapter for the Jarvis Companion (spec §5.1).
//
// One call = one model request. The agent loop owns multi-step tool use; this
// module only translates a normalized conversation into a provider request,
// normalizes the answer, and reports usage to a mandatory ledger sink so that
// every paid call is accounted for (spec §9).
//
// Normalized conversation entries:
//   { role: 'user', content: string }
//   { role: 'assistant', content: string }                      plain history
//   { role: 'assistant', turn: <result of generateCompanionTurn> } a tool-using turn
//   { role: 'tool_results', results: [{ id, name, providerId?, output, isError? }] }

import Anthropic from '@anthropic-ai/sdk';
import { estimateModelCostUsd } from './companionPricing.js';

export const COMPANION_TIERS = Object.freeze(['fast', 'deep']);

// Chosen by the step 0 comparison on 2026-11-23 (spec §5.1, §10). The deep
// tier is provisional until deep-work evals exist.
const DEFAULT_TIER_MODELS = Object.freeze({
  fast: 'gemini:gemini-3.8-flash',
  deep: 'gemini:gemini-3.8-flash@high',
});

const TIER_ENV = Object.freeze({ fast: 'COMPANION_MODEL_FAST', deep: 'COMPANION_MODEL_DEEP' });
const PROVIDERS = new Set(['anthropic', 'gemini']);
const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);
// Models that accept server-side refusal fallbacks; enabled by default for them.
const ANTHROPIC_FALLBACK_MODELS = new Set(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-2', 'claude-fable-5-1']);
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 8000;
const LEADING_USER_PLACEHOLDER = '(conversazione precedente)';

export class CompanionModelError extends Error {
  constructor(message, { provider, model, status = null, retryable = false } = {}) {
    super(message);
    this.name = 'CompanionModelError';
    this.provider = provider;
    this.model = model;
    this.status = status;
    this.retryable = retryable;
  }
}

// 'anthropic:claude-haiku-5-5@low' -> { provider, model, effort }
export function parseModelSpec(spec) {
  const match = String(spec ?? '').trim().match(/^([a-z]+):([A-Za-z0-9._-]+)(?:@([a-z]+))?$/);
  if (!match || !PROVIDERS.has(match[1])) {
    throw new Error(`Invalid Companion model spec "${spec}". Use provider:model[@effort], e.g. anthropic:claude-haiku-5-5@low.`);
  }
  const effort = match[3] ?? null;
  if (effort && !EFFORTS.has(effort)) throw new Error(`Invalid effort "${effort}" in model spec "${spec}".`);
  return { provider: match[1], model: match[2], effort, spec: String(spec).trim() };
}

export function resolveTierModel(tier, env = process.env) {
  if (!COMPANION_TIERS.includes(tier)) throw new Error(`Unknown Companion model tier: ${tier}`);
  const configured = String(env?.[TIER_ENV[tier]] ?? '').trim();
  return parseModelSpec(configured || DEFAULT_TIER_MODELS[tier]);
}

export async function generateCompanionTurn({
  model,
  tier = null,
  system,
  messages,
  tools = [],
  toolChoice = 'auto',
  maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  usageSink,
  purpose,
  requestId = null,
  env = process.env,
  clients = {},
  now = () => new Date(),
}) {
  if (typeof usageSink !== 'function') throw new Error('generateCompanionTurn requires a usageSink: every model call must be recorded.');
  if (!purpose) throw new Error('generateCompanionTurn requires a purpose for the usage ledger.');
  const spec = typeof model === 'string' ? parseModelSpec(model) : (model ?? resolveTierModel(tier ?? 'fast', env));
  const systemBlocks = normalizeSystem(system);
  const startedAt = Date.now();

  const result = spec.provider === 'anthropic'
    ? await callAnthropic({ spec, systemBlocks, messages, tools, toolChoice, maxOutputTokens, timeoutMs, client: clients.anthropic })
    : await callGemini({ spec, systemBlocks, messages, tools, toolChoice, maxOutputTokens, timeoutMs, env, fetchImpl: clients.fetch ?? fetch });

  const latencyMs = Date.now() - startedAt;
  const occurredAt = now();
  const { costUsd, priced } = estimateModelCostUsd({
    provider: spec.provider,
    model: result.servedModel ?? spec.model,
    usage: result.usage,
    at: occurredAt,
  });
  const turn = {
    provider: spec.provider,
    model: spec.model,
    servedModel: result.servedModel ?? spec.model,
    text: result.text,
    toolCalls: result.toolCalls,
    stopReason: result.stopReason,
    raw: result.raw,
    usage: result.usage,
    costUsd,
    priced,
    latencyMs,
    usageRecorded: false,
  };

  try {
    await usageSink({
      provider: spec.provider,
      model: turn.servedModel,
      tier,
      purpose,
      requestId,
      occurredAt: occurredAt.toISOString(),
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cacheReadTokens: result.usage.cacheReadTokens,
      cacheWriteTokens: result.usage.cacheWriteTokens,
      estimatedCostUsd: costUsd,
      metadata: { priced, latency_ms: latencyMs, stop_reason: result.stopReason, spec: spec.spec },
    });
    turn.usageRecorded = true;
  } catch (error) {
    // A ledger outage must not break the conversation; the caller sees usageRecorded=false.
    console.warn('companion usage ledger write failed', { provider: spec.provider, model: spec.model, error: safeMessage(error?.message) });
  }
  return turn;
}

// ---------------------------------------------------------------------------
// Anthropic (official SDK)

let sharedAnthropicClient = null;

function anthropicClient(injected) {
  if (injected) return injected;
  sharedAnthropicClient ??= new Anthropic({ maxRetries: 1 });
  return sharedAnthropicClient;
}

// toolChoice 'none' keeps the declarations (the history may hold tool calls)
// but forbids new calls, so the model must answer in text.
export function buildAnthropicRequest({ spec, systemBlocks, messages, tools, toolChoice = 'auto', maxOutputTokens }) {
  const params = {
    model: spec.model,
    max_tokens: maxOutputTokens,
    system: systemBlocks.map((block) => ({
      type: 'text',
      text: block.text,
      ...(block.cache ? { cache_control: { type: 'ephemeral' } } : {}),
    })),
    messages: toAnthropicMessages(messages, spec),
    ...(tools.length ? {
      tools: tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.inputSchema })),
      ...(toolChoice === 'none' ? { tool_choice: { type: 'none' } } : {}),
    } : {}),
    ...(spec.effort ? { output_config: { effort: spec.effort } } : {}),
  };
  const useFallbacks = ANTHROPIC_FALLBACK_MODELS.has(spec.model);
  return useFallbacks
    ? { beta: true, params: { ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } }
    : { beta: false, params };
}

async function callAnthropic({ spec, systemBlocks, messages, tools, toolChoice, maxOutputTokens, timeoutMs, client }) {
  const request = buildAnthropicRequest({ spec, systemBlocks, messages, tools, toolChoice, maxOutputTokens });
  const api = anthropicClient(client);
  let response;
  try {
    response = request.beta
      ? await api.beta.messages.create(request.params, { timeout: timeoutMs })
      : await api.messages.create(request.params, { timeout: timeoutMs });
  } catch (error) {
    throw anthropicError(error, spec);
  }
  return normalizeAnthropicResponse(response);
}

export function normalizeAnthropicResponse(response) {
  const content = Array.isArray(response?.content) ? response.content : [];
  const text = content.filter((block) => block.type === 'text').map((block) => block.text).join('').trim();
  const toolCalls = content
    .filter((block) => block.type === 'tool_use')
    .map((block) => ({ id: block.id, name: block.name, input: block.input ?? {} }));
  const usage = response?.usage ?? {};
  return {
    text,
    toolCalls,
    stopReason: mapAnthropicStop(response?.stop_reason, toolCalls.length),
    raw: content,
    servedModel: response?.model ?? null,
    usage: {
      inputTokens: Number(usage.input_tokens) || 0,
      outputTokens: Number(usage.output_tokens) || 0,
      cacheReadTokens: Number(usage.cache_read_input_tokens) || 0,
      cacheWriteTokens: Number(usage.cache_creation_input_tokens) || 0,
    },
  };
}

function toAnthropicMessages(messages, spec) {
  const out = [];
  for (const entry of messages ?? []) {
    if (entry.role === 'user') out.push({ role: 'user', content: String(entry.content ?? '') });
    else if (entry.role === 'assistant' && entry.turn) {
      const sameModel = entry.turn.provider === 'anthropic' && entry.turn.model === spec.model && Array.isArray(entry.turn.raw);
      // Replay the exact content (thinking blocks included) for the same model.
      out.push({
        role: 'assistant',
        content: sameModel ? entry.turn.raw : [
          ...(entry.turn.text ? [{ type: 'text', text: entry.turn.text }] : []),
          ...entry.turn.toolCalls.map((call) => ({ type: 'tool_use', id: call.id, name: call.name, input: call.input })),
        ],
      });
    } else if (entry.role === 'assistant') out.push({ role: 'assistant', content: String(entry.content ?? '') });
    else if (entry.role === 'tool_results') {
      out.push({
        role: 'user',
        content: entry.results.map((result) => ({
          type: 'tool_result',
          tool_use_id: result.id,
          content: stringifyToolOutput(result.output),
          ...(result.isError ? { is_error: true } : {}),
        })),
      });
    } else throw new Error(`Unsupported conversation role: ${entry.role}`);
  }
  if (out[0]?.role === 'assistant') out.unshift({ role: 'user', content: LEADING_USER_PLACEHOLDER });
  return out;
}

function mapAnthropicStop(reason, toolCallCount) {
  if (reason === 'refusal') return 'refusal';
  if (reason === 'max_tokens') return 'max_tokens';
  if (reason === 'tool_use' || toolCallCount > 0) return 'tool_use';
  if (reason === 'end_turn' || reason === 'stop_sequence') return 'end';
  return 'other';
}

function anthropicError(error, spec) {
  const status = Number(error?.status) || null;
  const retryable = error instanceof Anthropic.RateLimitError
    || error instanceof Anthropic.InternalServerError
    || error instanceof Anthropic.APIConnectionError
    || (status !== null && status >= 500);
  const label = error instanceof Anthropic.AuthenticationError ? 'Anthropic authentication failed'
    : error instanceof Anthropic.RateLimitError ? 'Anthropic rate limit reached'
      : error instanceof Anthropic.BadRequestError ? 'Anthropic rejected the request'
        : error instanceof Anthropic.APIConnectionError ? 'Anthropic is unreachable'
          : 'Anthropic request failed';
  return new CompanionModelError(`${label}: ${safeMessage(error?.message)}`, { provider: 'anthropic', model: spec.model, status, retryable });
}

// ---------------------------------------------------------------------------
// Gemini (REST, same style as api/_utils/gemini.js)

export function buildGeminiRequest({ spec, systemBlocks, messages, tools, toolChoice = 'auto', maxOutputTokens }) {
  return {
    systemInstruction: { parts: systemBlocks.map((block) => ({ text: block.text })) },
    contents: toGeminiContents(messages, spec),
    ...(tools.length ? {
      tools: [{
        functionDeclarations: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: toGeminiSchema(tool.inputSchema),
        })),
      }],
      toolConfig: { functionCallingConfig: { mode: toolChoice === 'none' ? 'NONE' : 'AUTO' } },
    } : {}),
    generationConfig: {
      maxOutputTokens,
      ...(spec.effort ? { thinkingConfig: { thinkingLevel: spec.effort } } : {}),
    },
  };
}

async function callGemini({ spec, systemBlocks, messages, tools, toolChoice, maxOutputTokens, timeoutMs, env, fetchImpl }) {
  const apiKey = String(env?.GEMINI_API_KEY ?? '').trim();
  if (!apiKey) throw new CompanionModelError('Gemini API key is not configured.', { provider: 'gemini', model: spec.model });
  const body = buildGeminiRequest({ spec, systemBlocks, messages, tools, toolChoice, maxOutputTokens });
  let response;
  try {
    response = await fetchImpl(`${GEMINI_ENDPOINT}/${encodeURIComponent(spec.model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new CompanionModelError(`Gemini is unreachable: ${safeMessage(error?.message)}`, { provider: 'gemini', model: spec.model, retryable: true });
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new CompanionModelError(`Gemini request failed (${response.status}): ${safeMessage(payload?.error?.message)}`, {
      provider: 'gemini',
      model: spec.model,
      status: response.status,
      retryable: response.status === 429 || response.status >= 500,
    });
  }
  return normalizeGeminiResponse(payload);
}

export function normalizeGeminiResponse(payload) {
  const candidate = payload?.candidates?.[0] ?? null;
  const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
  const text = parts.filter((part) => typeof part.text === 'string' && !part.thought).map((part) => part.text).join('').trim();
  const toolCalls = parts
    .filter((part) => part.functionCall)
    .map((part, index) => ({
      id: part.functionCall.id ?? `gemini_call_${index}`,
      providerId: part.functionCall.id ?? null,
      name: part.functionCall.name,
      input: part.functionCall.args ?? {},
    }));
  const usage = payload?.usageMetadata ?? {};
  const promptTokens = Number(usage.promptTokenCount) || 0;
  const cachedTokens = Number(usage.cachedContentTokenCount) || 0;
  return {
    text,
    toolCalls,
    stopReason: payload?.promptFeedback?.blockReason ? 'refusal' : mapGeminiStop(candidate?.finishReason, toolCalls.length),
    raw: candidate?.content ?? { role: 'model', parts: [] },
    servedModel: null,
    usage: {
      inputTokens: Math.max(0, promptTokens - cachedTokens),
      outputTokens: (Number(usage.candidatesTokenCount) || 0) + (Number(usage.thoughtsTokenCount) || 0),
      cacheReadTokens: cachedTokens,
      cacheWriteTokens: 0,
    },
  };
}

function toGeminiContents(messages, spec) {
  const out = [];
  for (const entry of messages ?? []) {
    if (entry.role === 'user') out.push({ role: 'user', parts: [{ text: String(entry.content ?? '') }] });
    else if (entry.role === 'assistant' && entry.turn) {
      const sameModel = entry.turn.provider === 'gemini' && entry.turn.model === spec.model && entry.turn.raw?.parts;
      // Replay the exact content so Gemini thought signatures survive tool use.
      out.push(sameModel ? entry.turn.raw : {
        role: 'model',
        parts: [
          ...(entry.turn.text ? [{ text: entry.turn.text }] : []),
          ...entry.turn.toolCalls.map((call) => ({ functionCall: { name: call.name, args: call.input } })),
        ],
      });
    } else if (entry.role === 'assistant') out.push({ role: 'model', parts: [{ text: String(entry.content ?? '') }] });
    else if (entry.role === 'tool_results') {
      out.push({
        role: 'user',
        parts: entry.results.map((result) => ({
          functionResponse: {
            name: result.name,
            ...(result.providerId ? { id: result.providerId } : {}),
            response: result.isError ? { error: result.output } : { result: result.output },
          },
        })),
      });
    } else throw new Error(`Unsupported conversation role: ${entry.role}`);
  }
  if (out[0]?.role === 'model') out.unshift({ role: 'user', parts: [{ text: LEADING_USER_PLACEHOLDER }] });
  return out;
}

function mapGeminiStop(reason, toolCallCount) {
  if (toolCallCount > 0) return 'tool_use';
  if (reason === 'STOP') return 'end';
  if (reason === 'MAX_TOKENS') return 'max_tokens';
  if (['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION'].includes(reason)) return 'refusal';
  return 'other';
}

const GEMINI_SCHEMA_KEYS = new Set(['type', 'description', 'properties', 'required', 'items', 'enum', 'nullable', 'minimum', 'maximum', 'minItems', 'maxItems']);

export function toGeminiSchema(schema) {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'type' && Array.isArray(value)) {
      const types = value.filter((type) => type !== 'null');
      out.type = types[0] ?? 'string';
      if (types.length !== value.length) out.nullable = true;
    } else if (key === 'properties') {
      out.properties = Object.fromEntries(Object.entries(value).map(([name, child]) => [name, toGeminiSchema(child)]));
    } else if (GEMINI_SCHEMA_KEYS.has(key)) {
      out[key] = key === 'items' ? toGeminiSchema(value) : value;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------

function normalizeSystem(system) {
  const blocks = typeof system === 'string' ? [{ text: system, cache: true }] : (system ?? []);
  return blocks
    .map((block) => (typeof block === 'string' ? { text: block, cache: false } : { text: String(block.text ?? ''), cache: Boolean(block.cache) }))
    .filter((block) => block.text.trim());
}

function stringifyToolOutput(output) {
  return typeof output === 'string' ? output : JSON.stringify(output ?? null);
}

function safeMessage(message) {
  return String(message ?? 'no provider message')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted]')
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
    .replace(/\s+/g, ' ')
    .slice(0, 300);
}
