# LifeOS WhatsApp Bridge

The WhatsApp bridge is a local process that forwards whitelisted WhatsApp messages into LifeOS Brain.

LifeOS exposes:

```text
POST /api/integrations/whatsapp/inbound
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
```

The bridge only needs the LifeOS base URL, shared WhatsApp bridge secret, and sender whitelist. Do not put Supabase service keys, Gemini keys, or other LifeOS server secrets in the bridge.

Local session folders such as `.wwebjs_auth/` and `.wwebjs_cache/` must stay uncommitted.
