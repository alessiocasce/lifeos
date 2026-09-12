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

Do not assume `client.sendMessage()` always returns the sent `Message`. Some provider builds deliver successfully but resolve the promise with `undefined`. The bridge registers a `message_create` listener before each send and captures the matching outgoing message by direction, recipient, and body. Physical sends are serialized to keep that fallback deterministic. If neither the return value nor the event yields a validated ID, a proactive message is not acknowledged as sent.

The backend rejects a proactive `status=sent` ACK with zero provider IDs before changing the claimed row. For accepted ACKs it persists the proactive assistant message, upserts one delivery row per physical ID, and returns a debug-only mapping summary. A duplicate sent ACK repeats these idempotent mapping writes, which repairs a previous partial ACK attempt.

## Safe Diagnostics

With bridge debug enabled, log only provider-ID shape summaries and fingerprints: identity source (`send_result` or `message_create`), presence, length, serialized availability, direction, address suffix, candidate count, lookup status, and bounded LifeOS IDs. The backend ACK debug response includes received/persisted/inserted/duplicate counts and the same fingerprints. Never log full message bodies, provider IDs, sessions, secrets, or auth headers.

Useful backend quote lookup statuses are `resolved`, `provider_id_not_found`, `recipient_mismatch`, `resolved_thread_mismatch`, `assistant_message_missing`, and `ambiguous_provider_mapping`.

For one physical bubble, verify the outgoing, persisted, and quoted fingerprint are identical. A successful HTTP ACK without a nonzero persisted mapping count is not a successful delivery-correlation test.

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
