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
import { ackOutboxMessage } from '../../../_utils/brainOutbox.js';

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
    const row = await ackOutboxMessage({
      recipient,
      messageId: body.message_id ?? body.messageId ?? body.id,
      status: body.status,
      error: body.error,
      metadata: {
        bridge_id: bridgeId,
        provider_message_id: cleanWhatsappText(body.provider_message_id ?? body.providerMessageId, 180),
        dry_run: Boolean(body.dry_run ?? body.dryRun),
      },
    });

    return sendJson(res, 200, {
      ok: true,
      requestId: context.requestId,
      status: row.status,
      message_id: row.id,
      ...(debugFlags.enabled ? {
        debug: {
          outbox: sanitizeTraceValue({
            id: row.id,
            status: row.status,
            rule_key: row.rule_key,
            attempts: row.attempts,
            sent_at: row.sent_at,
            failed_at: row.failed_at,
            last_error: row.last_error,
            ack_metadata: row.ack_metadata,
          }),
        },
      } : {}),
    });
  } catch (error) {
    return handleApiError(res, error, context);
  }
}
