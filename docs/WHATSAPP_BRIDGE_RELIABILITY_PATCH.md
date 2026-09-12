# Oracle WhatsApp Bridge Reliability Patch

The production bridge source is checked in at `bridge/whatsapp/wts.js`. Provider-ID and quote-envelope behavior lives in `bridge/whatsapp/providerMessageContract.cjs`; `npm run test:bridge` imports that same helper. There is no separate reference adapter.

## Native Reply Contract

`whatsapp-web.js` currently has a compatibility gap: some WhatsApp Web message keys expose `$1`, while upstream `Message.getQuotedMessage()` still reads `id._serialized`. Before calling it, the bridge copies a validated `$1` value to `_serialized`. If quoted-message retrieval still fails, the bridge attempts the bounded raw quoted-message ID fallback.

Provider IDs are accepted only as non-empty strings or recognized message-key shapes: `_serialized`, `$1`, nested `id`, or reconstructable `fromMe`/`remote`/`id` fields. Never use `String(object)` and never accept `[object Object]`.

For each inbound text message the bridge sends:

- the full incoming `message_id`;
- `has_quoted_message` even if quote extraction fails;
- `quoted_provider_message_id` for backward compatibility;
- `quoted_provider_message_ids` containing every validated equivalent representation;
- quoted direction/chat metadata when available.

The backend performs exact user/channel/canonical-recipient lookup. Unknown IDs, recipient mismatch, thread mismatch, non-replyable targets, expired targets, resolved targets, and invalid values remain distinct read-only outcomes.

## Outgoing Delivery Mapping

Both outbound paths map every physical WhatsApp bubble independently:

1. Normal Brain reply: after `sendMessage`, call outbox `action=record_reply_delivery` with `assistant_message_id`, `thread_id`, singular `provider_message_id`, and plural `provider_message_ids`.
2. Proactive outbox: keep `poll -> send -> local durable receipt -> ack`; ACK includes `message_id`, `delivery_attempt`, and singular/plural provider IDs.

The singular field remains compatible with older backends/bridges. Do not comma-join multiple IDs. A user can quote any chunk and resolve it to the same logical assistant/outbox target.

## Safe Diagnostics

With bridge debug enabled, log only provider-ID shape summaries and fingerprints: presence, length, serialized availability, direction, address suffix, candidate count, lookup status, and bounded LifeOS IDs. Never log full message bodies, provider IDs, sessions, secrets, or auth headers.

Useful backend quote lookup statuses are `resolved`, `provider_id_not_found`, `recipient_mismatch`, `resolved_thread_mismatch`, `assistant_message_missing`, and `ambiguous_provider_mapping`.

## Oracle Rollout

Deploy the compatible Vercel backend first, then update the Oracle bridge. Copy/pull both bridge files together:

```bash
pm2 stop lifeos-whatsapp-bridge
# update bridge/whatsapp/wts.js and bridge/whatsapp/providerMessageContract.cjs
node --check wts.js
node --check providerMessageContract.cjs
pm2 restart lifeos-whatsapp-bridge
pm2 status
pm2 logs lifeos-whatsapp-bridge
pm2 save
```

Do not delete `.wwebjs_auth` or `.wwebjs_cache`. Verify the installed `whatsapp-web.js` version and sanitized outgoing/quoted ID shapes before changing dependencies. This patch requires no new database migration; it uses the existing delivery-mapping schema.
