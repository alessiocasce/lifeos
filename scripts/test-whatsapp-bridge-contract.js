import assert from 'node:assert/strict';
import {
  buildWhatsappInboundQuoteEnvelope,
  buildWhatsappReplyDeliveryPayload,
  extractWhatsappProviderMessageId,
} from './whatsapp-bridge-adapter-reference.js';

assert.equal(extractWhatsappProviderMessageId('abc:device:suffix'), 'abc:device:suffix');
assert.equal(extractWhatsappProviderMessageId({ _serialized: 'serialized:id' }), 'serialized:id');
assert.equal(extractWhatsappProviderMessageId({ $1: 'legacy:id' }), 'legacy:id');
assert.equal(extractWhatsappProviderMessageId({ id: { _serialized: 'nested:id' } }), 'nested:id');
assert.equal(extractWhatsappProviderMessageId({ remote: 'chat', id: 'partial' }), null);
assert.equal(extractWhatsappProviderMessageId({}), null);

const quoted = await buildWhatsappInboundQuoteEnvelope({
  hasQuotedMsg: true,
  getQuotedMessage: async () => ({ id: { _serialized: 'quoted:id' }, fromMe: true, from: 'fixture@c.us' }),
});
assert.deepEqual(quoted, {
  has_quoted_message: true,
  quoted_provider_message_id: 'quoted:id',
  quoted_from_me: true,
  quoted_chat_id: 'fixture@c.us',
});
assert.deepEqual(await buildWhatsappInboundQuoteEnvelope({ hasQuotedMsg: false }), { has_quoted_message: false });
assert.equal((await buildWhatsappInboundQuoteEnvelope({ hasQuotedMsg: true, getQuotedMessage: async () => { throw new Error('fixture'); } })).quoted_provider_message_id, null);

assert.deepEqual(buildWhatsappReplyDeliveryPayload({
  inboundResponse: { assistant_message_id: 'assistant', thread_id: 'thread' },
  sentMessage: { id: { $1: 'outgoing:id' } }, recipient: 'fixture@c.us', bridgeId: 'oracle-fixture',
  sentAt: new Date('2026-07-07T18:50:00Z'),
}), {
  action: 'record_reply_delivery', assistant_message_id: 'assistant', thread_id: 'thread',
  recipient: 'fixture@c.us', provider_message_id: 'outgoing:id',
  sent_at: '2026-07-07T18:50:00.000Z', bridge_id: 'oracle-fixture',
});
assert.equal(buildWhatsappReplyDeliveryPayload({ inboundResponse: {}, sentMessage: { id: {} } }), null);

console.log('PASS external WhatsApp bridge ID, quote and reply-delivery contract fixtures');
