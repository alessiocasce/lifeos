import { generateGeminiText } from './gemini.js';

const PROACTIVE_REASONS = new Set([
  'accountability',
  'stale_world_model',
  'project_staleness',
  'anomaly',
  'opportunity',
  'positive_evidence',
  'monitor_event',
]);

const BUTLER_SYSTEM = `
You are the LifeOS Butler response renderer.
Turn the supplied structured result into one concise conversational reply.
Do not add actions, facts, promises, praise, guilt, or database narration.
Stay grounded in completed outcomes and supplied residual context.
For WhatsApp, use at most two short sentences. Match the requested language.
Return plain text only.
`;

export function createCompanionResult({
  reason = 'accountability',
  target = null,
  deterministicResult = null,
  semantic = null,
  belief = null,
  residualText = null,
  language = 'it',
  channel = 'whatsapp',
} = {}) {
  const actions = Array.isArray(deterministicResult?.actions) ? deterministicResult.actions : [];
  return {
    contract_version: 1,
    kind: 'compound_proactive_turn',
    proactive_reason: PROACTIVE_REASONS.has(reason) ? reason : 'accountability',
    channel,
    language: language === 'en' ? 'en' : 'it',
    target: target ? {
      source_type: target.source_type || null,
      source_id: target.source_id || null,
      outbox_message_id: target.outbox_message_id || null,
      accountability_kind: target.accountability?.kind || null,
      routine_id: target.accountability?.habit_id || null,
    } : null,
    deterministic: deterministicResult ? {
      handled: true,
      intent: deterministicResult.plan?.intent || null,
      needs_write: Boolean(deterministicResult.plan?.needsWrite),
      action_types: actions.map((action) => action?.type).filter(Boolean),
      action_count: actions.length,
    } : { handled: false, intent: null, needs_write: false, action_types: [], action_count: 0 },
    semantic: semantic ? {
      operation: semantic.operation,
      routine_id: semantic.routine_id || null,
      state: semantic.state || null,
      confidence: Number(semantic.confidence) || 0,
      persisted: Boolean(belief),
      belief_id: belief?.id || null,
      effective_until: belief?.effective_until || semantic.effective_until || null,
    } : null,
    residual: {
      text: cleanText(residualText, 1200),
      disposition: residualText ? 'knowledge_extraction' : 'none',
    },
  };
}

export async function renderCompanionResult({
  result,
  fallbackAnswer,
  generate = generateButlerTextWithModel,
} = {}) {
  const fallback = buildButlerFallback(result, fallbackAnswer);
  if (!result?.semantic?.persisted && !result?.residual?.text) return fallback;
  try {
    const answer = cleanText(await generate({ result }), 600);
    return answer || fallback;
  } catch {
    return fallback;
  }
}

export async function generateButlerTextWithModel({ result }) {
  return generateGeminiText({
    system: BUTLER_SYSTEM,
    prompt: JSON.stringify({
      channel: result?.channel,
      language: result?.language,
      proactive_reason: result?.proactive_reason,
      deterministic: result?.deterministic,
      semantic: result?.semantic,
      residual: result?.residual,
    }),
    temperature: 0.25,
  });
}

export function buildButlerFallback(result, fallbackAnswer = '') {
  const language = result?.language === 'en' ? 'en' : 'it';
  const operation = result?.semantic?.operation;
  if (operation === 'deactivate') {
    return language === 'en' ? "Got it. I won't ask about that routine again." : 'Capito. Non te lo chiedo piu.';
  }
  if (operation === 'suspend') {
    return language === 'en' ? 'Got it. I will pause those check-ins for now.' : 'Va bene. Metto in pausa quei check-in per ora.';
  }
  if (operation === 'reactivate') {
    return language === 'en' ? 'Got it. I will include it in check-ins again.' : 'Capito. Lo rimetto tra i check-in.';
  }
  if (operation === 'stale_assumption') {
    return language === 'en' ? 'Fair. I will pause and check that assumption later.' : 'Ci sta. Metto in pausa e ricontrolliamo piu avanti.';
  }
  const cleanFallback = cleanText(fallbackAnswer, 600);
  if (cleanFallback) return cleanFallback;
  return language === 'en' ? 'Got it.' : 'Capito.';
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  return text && text.length <= maxLength ? text : null;
}
