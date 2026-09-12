import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { fingerprintWhatsappProviderMessageId } from '../api/_utils/brainWhatsappReliability.js';
import providerContract from '../bridge/whatsapp/providerMessageContract.cjs';

const {
  buildWhatsappInboundQuoteEnvelope,
  buildWhatsappOutboxAckPayload,
  buildWhatsappReplyDeliveryPayload,
  ensureWhatsappSerializedIdCompatibility,
  describeWhatsappProviderId,
  extractWhatsappProviderMessageId,
  extractWhatsappProviderMessageIds,
  sendWhatsappMessageWithProviderIdentity,
} = providerContract;

assert.equal(extractWhatsappProviderMessageId('abc:device:suffix'), 'abc:device:suffix');
assert.equal(extractWhatsappProviderMessageId({ _serialized: 'serialized:id' }), 'serialized:id');
assert.equal(extractWhatsappProviderMessageId({ $1: 'legacy:id' }), 'legacy:id');
assert.deepEqual(extractWhatsappProviderMessageIds({ $1: 'current:id', _serialized: 'historical:id' }), ['current:id', 'historical:id']);
assert.equal(extractWhatsappProviderMessageId({ id: { _serialized: 'nested:id' } }), 'nested:id');
assert.equal(extractWhatsappProviderMessageId({ fromMe: true, remote: 'chat@c.us', id: 'partial' }), 'true_chat@c.us_partial');
assert.equal(extractWhatsappProviderMessageId({}), null);
const safeShape = describeWhatsappProviderId('true_fixture@lid_PRIVATE_SUFFIX');
assert.equal(safeShape.address_type, 'lid');
assert.equal(safeShape.fingerprint.length, 12);
assert.equal(JSON.stringify(safeShape).includes('PRIVATE_SUFFIX'), false);
assert.equal(safeShape.fingerprint, fingerprintWhatsappProviderMessageId('true_fixture@lid_PRIVATE_SUFFIX'));

const fallbackClient = new EventEmitter();
fallbackClient.sendMessage = async (recipient, body) => {
  queueMicrotask(() => fallbackClient.emit('message_create', {
    fromMe: true,
    to: recipient,
    body,
    id: { fromMe: true, remote: recipient, id: 'OUTBOUND_EVENT', $1: `true_${recipient}_OUTBOUND_EVENT` },
  }));
  return undefined;
};
const capturedSend = await sendWhatsappMessageWithProviderIdentity({
  client: fallbackClient,
  recipient: 'fixture@lid',
  body: 'fixture proactive body',
  timeoutMs: 500,
});
assert.equal(capturedSend.identity_source, 'message_create');
assert.equal(extractWhatsappProviderMessageId(capturedSend.message.id), 'true_fixture@lid_OUTBOUND_EVENT');

const directClient = new EventEmitter();
directClient.sendMessage = async (recipient) => ({
  fromMe: true,
  to: recipient,
  id: { $1: `true_${recipient}_DIRECT` },
});
const directSend = await sendWhatsappMessageWithProviderIdentity({
  client: directClient,
  recipient: 'fixture@lid',
  body: 'direct fixture',
});
assert.equal(directSend.identity_source, 'send_result');
assert.equal(extractWhatsappProviderMessageId(directSend.message.id), 'true_fixture@lid_DIRECT');

const missingIdentityClient = new EventEmitter();
missingIdentityClient.sendMessage = async () => undefined;
await assert.rejects(sendWhatsappMessageWithProviderIdentity({
  client: missingIdentityClient,
  recipient: 'fixture@lid',
  body: 'missing identity fixture',
  timeoutMs: 100,
}), (error) => error?.code === 'WHATSAPP_PROVIDER_ID_UNAVAILABLE');

const currentShapeMessage = {
  id: { fromMe: false, remote: 'fixture@lid', id: 'INBOUND', $1: 'false_fixture@lid_INBOUND' },
  hasQuotedMsg: true,
  async getQuotedMessage() {
    assert.equal(this.id._serialized, this.id.$1, 'bridge must restore the field used by whatsapp-web.js');
    return { id: { fromMe: true, remote: 'fixture@lid', id: 'OUTBOUND', $1: 'true_fixture@lid_OUTBOUND' }, fromMe: true, from: 'fixture@lid' };
  },
};
assert.equal(ensureWhatsappSerializedIdCompatibility(currentShapeMessage), true);
delete currentShapeMessage.id._serialized;
const currentQuote = await buildWhatsappInboundQuoteEnvelope(currentShapeMessage);
assert.equal(currentQuote.quoted_provider_message_id, 'true_fixture@lid_OUTBOUND');
assert.equal(currentQuote.quote_resolution, 'get_quoted_message');
assert.equal(
  fingerprintWhatsappProviderMessageId(currentQuote.quoted_provider_message_id),
  fingerprintWhatsappProviderMessageId('true_fixture@lid_OUTBOUND'),
);
assert.equal(buildWhatsappReplyDeliveryPayload({
  inboundResponse: { assistant_message_id: 'assistant', thread_id: 'thread' },
  sentMessage: { id: { $1: 'true_fixture@lid_OUTBOUND' } },
  recipient: 'fixture@lid',
}).provider_message_id, currentQuote.quoted_provider_message_id);

const quoted = await buildWhatsappInboundQuoteEnvelope({
  hasQuotedMsg: true,
  getQuotedMessage: async () => ({ id: { _serialized: 'quoted:id' }, fromMe: true, from: 'fixture@c.us' }),
});
assert.deepEqual(quoted, {
  has_quoted_message: true,
  quoted_provider_message_id: 'quoted:id',
  quoted_provider_message_ids: ['quoted:id'],
  quoted_from_me: true,
  quoted_chat_id: 'fixture@c.us',
  quote_resolution: 'get_quoted_message',
});
assert.deepEqual(await buildWhatsappInboundQuoteEnvelope({ hasQuotedMsg: false }), { has_quoted_message: false });
const rawFallback = await buildWhatsappInboundQuoteEnvelope({
  id: { $1: 'false_fixture@lid_INBOUND2' },
  hasQuotedMsg: true,
  rawData: { quotedMsg: { id: { fromMe: true, remote: 'fixture@lid', id: 'RAW', $1: 'true_fixture@lid_RAW' } } },
  getQuotedMessage: async () => { throw new Error('fixture'); },
});
assert.equal(rawFallback.quoted_provider_message_id, 'true_fixture@lid_RAW');
assert.equal(rawFallback.quote_resolution, 'raw_data_fallback');

assert.deepEqual(buildWhatsappReplyDeliveryPayload({
  inboundResponse: { assistant_message_id: 'assistant', thread_id: 'thread' },
  sentMessage: { id: { $1: 'outgoing:id' } }, recipient: 'fixture@c.us', bridgeId: 'oracle-fixture',
  sentAt: new Date('2026-07-07T18:50:00Z'),
}), {
  action: 'record_reply_delivery', assistant_message_id: 'assistant', thread_id: 'thread',
  recipient: 'fixture@c.us', provider_message_id: 'outgoing:id',
  provider_message_ids: ['outgoing:id'],
  sent_at: '2026-07-07T18:50:00.000Z', bridge_id: 'oracle-fixture',
});
assert.equal(buildWhatsappReplyDeliveryPayload({ inboundResponse: {}, sentMessage: { id: {} } }), null);

assert.deepEqual(buildWhatsappOutboxAckPayload({
  recipient: 'fixture@lid',
  messageId: 'outbox-one',
  deliveryAttempt: 2,
  status: 'sent',
  providerMessageId: 'true_fixture@lid_ONE',
  bridgeId: 'oracle-fixture',
}), {
  action: 'ack',
  recipient: 'fixture@lid',
  message_id: 'outbox-one',
  delivery_attempt: 2,
  status: 'sent',
  provider_message_id: 'true_fixture@lid_ONE',
  provider_message_ids: ['true_fixture@lid_ONE'],
  error: null,
  bridge_id: 'oracle-fixture',
  metadata: {},
});
assert.deepEqual(buildWhatsappOutboxAckPayload({
  recipient: 'fixture@lid',
  messageId: 'outbox-many',
  status: 'sent',
  providerMessageIds: [
    'true_fixture@lid_A',
    'true_fixture@lid_B',
    'true_fixture@lid_C',
  ],
}), {
  action: 'ack',
  recipient: 'fixture@lid',
  message_id: 'outbox-many',
  delivery_attempt: null,
  status: 'sent',
  provider_message_id: 'true_fixture@lid_A',
  provider_message_ids: [
    'true_fixture@lid_A',
    'true_fixture@lid_B',
    'true_fixture@lid_C',
  ],
  error: null,
  metadata: {},
});

console.log('PASS real WhatsApp bridge ID, quote compatibility and reply-delivery contract fixtures');
