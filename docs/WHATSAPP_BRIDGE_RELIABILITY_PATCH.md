# Oracle WhatsApp Bridge Reliability Patch

The production bridge source is external to this repository and was not modified or runtime-tested here. Apply this contract to the Oracle PM2 bridge before enabling native quote correlation.

## Adapter

Copy or adapt `scripts/whatsapp-bridge-adapter-reference.js`. Run `npm run test:bridge` in LifeOS to verify the reference fixtures. The adapter accepts only full strings and supported whatsapp-web.js ID shapes (`_serialized`, `$1`); it never calls `String(object)`.

For each inbound text message:

1. Reject `fromMe`, groups, and unallowed senders using the existing bridge policy.
2. Extract the full incoming `message.id` and send it as `message_id`.
3. If `message.hasQuotedMsg`, call `await message.getQuotedMessage()` and include `has_quoted_message`, `quoted_provider_message_id`, `quoted_from_me`, and `quoted_chat_id`. Retrieval failure must remain `has_quoted_message: true` with a null ID.
4. A backend `409` for `processing` or `uncertain` is transport state; do not send its error text to WhatsApp.

After sending a normal inbound Brain reply, call the authenticated combined outbox endpoint:

```json
{
  "action": "record_reply_delivery",
  "assistant_message_id": "<inbound response assistant_message_id>",
  "thread_id": "<inbound response thread_id>",
  "recipient": "<canonical configured recipient>",
  "provider_message_id": "<full sendMessage result id>",
  "sent_at": "<ISO timestamp>",
  "bridge_id": "<bounded bridge name>"
}
```

For proactive delivery, keep `poll -> send -> local durable send receipt -> ack`. ACK must echo `message_id`, `delivery_attempt`, and the full outgoing `provider_message_id`. Retry a failed ACK from the local receipt; do not resend a message already known to have been physically sent. A crash where provider outcome is unknown remains uncertain and requires operator reconciliation.

## Oracle Rollout

```bash
pm2 stop lifeos-whatsapp-bridge
# deploy/test the adapter without deleting .wwebjs_auth or .wwebjs_cache
node --check wts.js
pm2 restart lifeos-whatsapp-bridge
pm2 status
pm2 logs lifeos-whatsapp-bridge
pm2 save
```

Verify the installed whatsapp-web.js version and actual outgoing ID shape on Oracle before changing dependencies. Log only shape/status diagnostics, never message bodies, sessions, or secrets.
