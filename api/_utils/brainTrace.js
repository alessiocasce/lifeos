const SECRET_KEY_PATTERN = /(authorization|bearer|token|secret|password|service_role|api[_-]?key|gemini|supabase)/i;
const SAFE_SECRET_STATUS_KEYS = new Set(['secret_validated']);
const MAX_DECISION_STEPS = 80;
const MAX_STRING = 500;
const MAX_FULL_TEXT = 8000;

export function createBrainTrace({
  source = 'unknown',
  responseMode = null,
  clientRequestId = null,
  userText = '',
  channelMetadata = null,
  endpoint = null,
  full = false,
} = {}) {
  const now = new Date();
  return {
    trace_id: `brain_trace_${now.getTime()}_${Math.random().toString(36).slice(2, 10)}`,
    created_at: now.toISOString(),
    source: cleanText(source, 40) || 'unknown',
    response_mode: cleanText(responseMode, 40) || cleanText(source, 40) || 'unknown',
    client_request_id: cleanText(clientRequestId, 140),
    whatsapp_sender: cleanText(channelMetadata?.whatsapp_sender, 180),
    whatsapp_message_id: cleanText(channelMetadata?.whatsapp_message_id, 180),
    user_text_preview: safePreview(userText),
    ...(full ? { user_text_full: cleanText(userText, MAX_FULL_TEXT) } : {}),
    endpoint: sanitizeTraceValue(endpoint),
    decision_path: [],
    pending_action: { found: false },
    pending_reply_intent: null,
    pending_resolution: null,
    route: null,
    selected_skill: null,
    command_draft: null,
    working_context: { used: false },
    vault: { attempted: false, used: false, chunks: 0, documents: 0 },
    tools: [],
    auto_save: null,
    final_response_type: null,
    error_code: null,
    _start_time: now.getTime(),
    _full: Boolean(full),
  };
}

export function addBrainTraceStep(trace, stepName, data = {}) {
  if (!trace || !stepName) return trace;
  const startedAt = Number(trace._start_time) || Date.now();
  const decisionPath = Array.isArray(trace.decision_path) ? trace.decision_path : [];
  if (decisionPath.length >= MAX_DECISION_STEPS) return trace;
  decisionPath.push({
    step: cleanText(stepName, 80),
    at_ms: Math.max(0, Date.now() - startedAt),
    data: sanitizeTraceValue(data),
  });
  trace.decision_path = decisionPath;
  return trace;
}

export function finishBrainTrace(trace, finalData = {}) {
  if (!trace) return null;
  const startedAt = Number(trace._start_time) || Date.now();
  const finished = {
    ...trace,
    ...sanitizeTraceValue(finalData),
    latency_ms: Math.max(0, Date.now() - startedAt),
  };
  delete finished._start_time;
  delete finished._full;
  return sanitizeTraceValue(finished);
}

export function sanitizeTraceValue(value, depth = 0) {
  if (value === undefined) return null;
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    return Number.isFinite(value) || typeof value !== 'number' ? value : null;
  }
  if (typeof value === 'string') return cleanText(value, MAX_STRING);
  if (value instanceof Error) {
    return {
      name: cleanText(value.name, 80),
      message: cleanText(value.message, 300),
      status: Number(value.status) || null,
    };
  }
  if (depth >= 4) return '[truncated]';
  if (Array.isArray(value)) {
    return value.slice(0, 30).map((item) => sanitizeTraceValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    const output = {};
    for (const [key, raw] of Object.entries(value)) {
      if (!key || key.startsWith('_')) continue;
      if (SECRET_KEY_PATTERN.test(key) && !SAFE_SECRET_STATUS_KEYS.has(key)) continue;
      output[cleanText(key, 80)] = sanitizeTraceValue(raw, depth + 1);
    }
    return output;
  }
  return cleanText(String(value), MAX_STRING);
}

export function getDebugFlags(req = {}) {
  const header = String(req.headers?.['x-lifeos-debug'] ?? '').trim().toLowerCase();
  const requested = ['1', 'true', 'yes', 'on'].includes(header);
  const env = String(process.env.LIFEOS_BRAIN_DEBUG ?? '').trim().toLowerCase();
  const fullEnv = String(process.env.LIFEOS_BRAIN_DEBUG_FULL ?? '').trim().toLowerCase();
  const enabled = requested || ['1', 'true', 'yes', 'on'].includes(env);
  const full = ['1', 'true', 'yes', 'on'].includes(fullEnv);
  return { enabled, requested, full };
}

export function safePreview(text, maxChars = 200) {
  return cleanText(text, maxChars);
}

function cleanText(value, max = MAX_STRING) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, Math.max(0, max - 3))}...` : text;
}
