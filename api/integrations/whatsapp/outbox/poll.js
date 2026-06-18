import {
  createRequestContext,
  handleApiError,
  handleOptions,
  readJsonBody,
  requirePost,
  sendJson,
} from '../../../_utils/http.js';
import { getDebugFlags, sanitizeTraceValue } from '../../../_utils/brainTrace.js';
import { requireWhatsappBridgeSecret, validateWhatsappSender, cleanWhatsappText } from '../../../_utils/whatsappBridge.js';
import { pollOutboxMessages } from '../../../_utils/brainOutbox.js';

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
    const messages = await pollOutboxMessages({
      recipient,
      bridgeId,
      limit: body.limit,
    });

    return sendJson(res, 200, {
      ok: true,
      requestId: context.requestId,
      messages: messages.map(formatBridgeMessage),
      ...(debugFlags.enabled ? {
        debug: {
          claimed: sanitizeTraceValue(messages.map((item) => ({
            id: item.id,
            rule_key: item.rule_key,
            status: item.status,
            attempts: item.attempts,
            scheduled_for: item.scheduled_for,
          }))),
        },
      } : {}),
    });
  } catch (error) {
    return handleApiError(res, error, context);
  }
}

function formatBridgeMessage(row) {
  return {
    id: row.id,
    to: row.recipient,
    body: row.body,
    rule_key: row.rule_key,
    source_type: row.source_type,
    source_id: row.source_id,
    metadata: {
      expected_reply_type: row.metadata?.expected_reply_type ?? null,
      language: row.metadata?.language ?? null,
    },
  };
}
