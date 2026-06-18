# LifeOS WhatsApp Bridge

The WhatsApp bridge is a local process that forwards whitelisted WhatsApp messages into LifeOS Brain.

LifeOS exposes:

```text
POST /api/integrations/whatsapp/inbound
POST /api/integrations/whatsapp/outbox/evaluate
POST /api/integrations/whatsapp/outbox/poll
POST /api/integrations/whatsapp/outbox/ack
```

The local bridge should send:

```json
{
  "from": "111780936298528@lid",
  "author": null,
  "message_id": "whatsapp-message-id",
  "body": "come stai?",
  "timestamp": 1234567890,
  "type": "chat",
  "is_group": false,
  "source": "whatsapp"
}
```

Required bridge env:

```env
LIFEOS_BASE_URL=https://lifeos-ruby-gamma.vercel.app
LIFEOS_WHATSAPP_BRIDGE_SECRET=change_me
WHATSAPP_ALLOWED_SENDERS=111780936298528@lid
WHATSAPP_DEBUG=false
DRY_RUN=false
HEADLESS=true
WHATSAPP_OUTBOX_POLL_SECONDS=60
```

The bridge only needs the LifeOS base URL, shared WhatsApp bridge secret, and sender whitelist. Do not put Supabase service keys, Gemini keys, or other LifeOS server secrets in the bridge.

## Proactive Outbox Loop

Proactive WhatsApp v1A is memo-only. The bridge should poll LifeOS instead of expecting server push:

1. Every `WHATSAPP_OUTBOX_POLL_SECONDS`, call `POST /api/integrations/whatsapp/outbox/evaluate` with `{ "recipient": "111780936298528@lid", "bridge_id": "local-main" }`.
2. Call `POST /api/integrations/whatsapp/outbox/poll` with the same recipient.
3. For each returned message, send `body` to `to` through `client.sendMessage(to, body)`.
4. Call `POST /api/integrations/whatsapp/outbox/ack` with `status: "sent"` or `status: "failed"`.

In `DRY_RUN`, print outbound messages instead of sending them. Do not ack as `sent` unless intentionally testing the ack endpoint.

Local session folders such as `.wwebjs_auth/` and `.wwebjs_cache/` must stay uncommitted.
