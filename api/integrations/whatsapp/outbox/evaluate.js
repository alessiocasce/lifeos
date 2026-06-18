import {
  createRequestContext,
  handleApiError,
  handleOptions,
  readJsonBody,
  requirePost,
  sendJson,
} from '../../../_utils/http.js';
import { getActionUserId } from '../../../_utils/supabaseAdmin.js';
import { getDebugFlags, sanitizeTraceValue } from '../../../_utils/brainTrace.js';
import { requireWhatsappBridgeSecret, validateWhatsappSender, cleanWhatsappText } from '../../../_utils/whatsappBridge.js';
import { evaluateProactiveCandidates } from '../../../_utils/brainProactiveRules.js';
import { enqueueOutboxMessage } from '../../../_utils/brainOutbox.js';

export default async function handler(req, res) {
  const context = createRequestContext(req, res);
  const debugFlags = getDebugFlags(req);
  try {
    if (handleOptions(req, res)) return;
    requirePost(req);
    requireWhatsappBridgeSecret(req);
    const body = await readJsonBody(req);
    const recipient = validateWhatsappSender(body.recipient ?? body.to ?? body.from, Boolean(body.is_group ?? body.isGroup));
    const bridgeId = cleanWhatsappText(body.bridge_id ?? body.bridgeId, 120);
    const userId = getActionUserId();
    const evaluation = await evaluateProactiveCandidates({ userId, recipient });
    const queued = [];
    const skipped = [...evaluation.skipped];

    for (const candidate of evaluation.candidates) {
      const result = await enqueueOutboxMessage({
        userId,
        channel: candidate.channel,
        recipient: candidate.recipient,
        body: candidate.body,
        priority: candidate.priority,
        ruleKey: candidate.rule_key,
        sourceType: candidate.source_type,
        sourceId: candidate.source_id,
        idempotencyKey: candidate.idempotency_key,
        scheduledFor: candidate.scheduled_for,
        expiresAt: candidate.expires_at,
        metadata: {
          ...candidate.metadata,
          bridge_id: bridgeId,
          proactive_trace: {
            ...(candidate.metadata?.proactive_trace ?? {}),
            decision: result.duplicate ? 'duplicate' : 'queued',
          },
        },
      });
      if (result.duplicate) {
        skipped.push({ candidate, reason: 'duplicate' });
      } else {
        queued.push(result.row);
      }
    }

    return sendJson(res, 200, {
      ok: true,
      requestId: context.requestId,
      evaluated: true,
      queued: queued.length,
      skipped: skipped.length,
      ...(debugFlags.enabled ? {
        debug: {
          candidates: sanitizeTraceValue(evaluation.candidates.map(compactCandidate)),
          queued: sanitizeTraceValue(queued.map(compactOutbox)),
          skipped: sanitizeTraceValue(skipped.map((item) => ({
            reason: item.reason,
            candidate: compactCandidate(item.candidate),
          }))),
        },
      } : {}),
    });
  } catch (error) {
    return handleApiError(res, error, context);
  }
}

function compactCandidate(candidate) {
  return {
    rule_key: candidate?.rule_key,
    source_type: candidate?.source_type,
    source_id: candidate?.source_id,
    idempotency_key: candidate?.idempotency_key,
    scheduled_for: candidate?.scheduled_for,
    expires_at: candidate?.expires_at,
    body_preview: String(candidate?.body ?? '').slice(0, 160),
  };
}

function compactOutbox(row) {
  return {
    id: row?.id,
    status: row?.status,
    rule_key: row?.rule_key,
    source_type: row?.source_type,
    source_id: row?.source_id,
    scheduled_for: row?.scheduled_for,
  };
}
