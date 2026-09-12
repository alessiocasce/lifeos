const fs = require('fs');
const path = require('path');
const axios = require('axios');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const {
  buildWhatsappInboundQuoteEnvelope,
  buildWhatsappOutboxAckPayload,
  buildWhatsappReplyDeliveryPayload,
  describeWhatsappProviderId,
  extractWhatsappProviderMessageId,
  extractWhatsappProviderMessageIds,
  sendWhatsappMessageWithProviderIdentity,
} = require('./providerMessageContract.cjs');

/**
 * LifeOS WhatsApp Bridge v2.3
 *
 * Runs locally / on an always-on machine.
 *
 * Inbound:
 * - Receives WhatsApp messages from whitelisted senders.
 * - Forwards them to LifeOS Vercel.
 * - Replies with Brain output.
 *
 * Outbound proactive:
 * - Periodically asks LifeOS to evaluate proactive rules.
 * - Polls LifeOS outbox.
 * - Sends queued WhatsApp messages.
 * - ACKs sent/failed delivery back to LifeOS.
 * - Echoes delivery_attempt so stale ACKs from older claims can be rejected.
 * - Preserves native WhatsApp quoted-message context for deterministic target resolution.
 * - Records provider-message mappings for Brain replies.
 *
 * IMPORTANT:
 * Proactive outbox uses ONE combined Vercel endpoint:
 * POST /api/integrations/whatsapp/outbox
 *
 * with body.action:
 * - evaluate
 * - poll
 * - ack
 * - record_reply_delivery
 *
 * No dotenv dependency needed: this file includes a tiny .env loader.
 */

// -----------------------------------------------------------------------------
// Tiny .env loader
// -----------------------------------------------------------------------------

function loadDotEnv(filePath = path.join(__dirname, '.env')) {
  if (!fs.existsSync(filePath)) return;

  const raw = fs.readFileSync(filePath, 'utf8');

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalIndex = trimmed.indexOf('=');
    if (equalIndex === -1) continue;

    const key = trimmed.slice(0, equalIndex).trim();
    let value = trimmed.slice(equalIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadDotEnv();

// -----------------------------------------------------------------------------
// Config
// -----------------------------------------------------------------------------

const CONFIG = {
  lifeosBaseUrl: normalizeBaseUrl(
    process.env.LIFEOS_BASE_URL || 'https://lifeos-ruby-gamma.vercel.app'
  ),
  bridgeSecret: process.env.LIFEOS_WHATSAPP_BRIDGE_SECRET || '',
  allowedSenders: parseCsv(process.env.WHATSAPP_ALLOWED_SENDERS || ''),
  debug: toBool(process.env.WHATSAPP_DEBUG, false),
  dryRun: toBool(process.env.DRY_RUN, false),
  headless: toBool(process.env.HEADLESS, true),
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 120000),
  maxIncomingChars: Number(process.env.MAX_INCOMING_CHARS || 4000),
  maxReplyChunkChars: Number(process.env.MAX_REPLY_CHUNK_CHARS || 2800),
  processedMessageTtlMs: Number(
    process.env.PROCESSED_MESSAGE_TTL_MS || 1000 * 60 * 60
  ),
  clientId:
    process.env.WHATSAPP_CLIENT_ID || 'lifeos-whatsapp-bridge',

  // Proactive outbox loop
  proactiveEnabled: toBool(
    process.env.WHATSAPP_OUTBOX_ENABLED,
    true
  ),
  outboxPollSeconds: Number(
    process.env.WHATSAPP_OUTBOX_POLL_SECONDS || 60
  ),
  outboxPollLimit: Number(
    process.env.WHATSAPP_OUTBOX_POLL_LIMIT || 3
  ),
  outboxEvaluateBeforePoll: toBool(
    process.env.WHATSAPP_OUTBOX_EVALUATE_BEFORE_POLL,
    true
  ),
  outboxAckDryRunAsSent: toBool(
    process.env.WHATSAPP_OUTBOX_DRY_RUN_ACK_SENT,
    false
  ),
};

function normalizeBaseUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  return ['1', 'true', 'yes', 'y', 'on'].includes(
    String(value).toLowerCase()
  );
}

function maskSecret(value) {
  if (!value) return '[missing]';
  if (value.length <= 6) return '***';
  return `${value.slice(0, 3)}***${value.slice(-3)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function short(text, max = 160) {
  const clean = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (clean.length <= max) return clean;

  return `${clean.slice(0, max - 1)}…`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function apiHeaders() {
  const headers = {
    'Content-Type': 'application/json',
    'x-lifeos-whatsapp-secret': CONFIG.bridgeSecret,
  };

  if (CONFIG.debug) {
    headers['x-lifeos-debug'] = 'true';
  }

  return headers;
}

function logAxiosError(label, error) {
  console.error(`[${nowIso()}] ${label}:`, error.message);

  if (error.response) {
    console.error(
      `HTTP ${error.response.status}:`,
      safeJson(error.response.data)
    );
  } else if (error.request) {
    console.error('No response received from LifeOS.');
  }
}

// -----------------------------------------------------------------------------
// WhatsApp provider IDs / quoted reply context
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// Startup checks
// -----------------------------------------------------------------------------

console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('LifeOS WhatsApp Bridge');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`LifeOS URL:        ${CONFIG.lifeosBaseUrl}`);
console.log(
  `Allowed senders:   ${
    CONFIG.allowedSenders.length
      ? CONFIG.allowedSenders.join(', ')
      : '[none]'
  }`
);
console.log(`Secret:            ${maskSecret(CONFIG.bridgeSecret)}`);
console.log(`Dry run:           ${CONFIG.dryRun ? 'ON' : 'OFF'}`);
console.log(`Debug logs:        ${CONFIG.debug ? 'ON' : 'OFF'}`);
console.log(`Headless:          ${CONFIG.headless ? 'ON' : 'OFF'}`);
console.log(
  `Outbox enabled:    ${CONFIG.proactiveEnabled ? 'ON' : 'OFF'}`
);
console.log(`Outbox interval:   ${CONFIG.outboxPollSeconds}s`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');

if (!CONFIG.allowedSenders.length) {
  console.warn(
    '⚠️  WHATSAPP_ALLOWED_SENDERS is empty. The bridge will ignore all messages and skip outbox polling.'
  );
}

if (!CONFIG.dryRun && !CONFIG.bridgeSecret) {
  console.warn(
    '⚠️  LIFEOS_WHATSAPP_BRIDGE_SECRET is missing. Vercel endpoints should reject requests.'
  );
}

if (CONFIG.outboxPollSeconds < 15) {
  console.warn(
    '⚠️  WHATSAPP_OUTBOX_POLL_SECONDS is very low. Recommended: 30–60 seconds.'
  );
}

// -----------------------------------------------------------------------------
// In-memory dedupe + per-sender queue
// -----------------------------------------------------------------------------

const processedMessages = new Map();
const senderQueues = new Map();

function cleanupProcessedMessages() {
  const cutoff = Date.now() - CONFIG.processedMessageTtlMs;

  for (const [messageId, timestamp] of processedMessages.entries()) {
    if (timestamp < cutoff) {
      processedMessages.delete(messageId);
    }
  }
}

setInterval(
  cleanupProcessedMessages,
  1000 * 60 * 10
).unref();

function hasProcessed(messageId) {
  if (!messageId) return false;
  return processedMessages.has(messageId);
}

function markProcessed(messageId) {
  if (!messageId) return;

  processedMessages.set(
    messageId,
    Date.now()
  );
}

function enqueueForSender(senderId, task) {
  const previous =
    senderQueues.get(senderId) || Promise.resolve();

  const next = previous
    .catch(() => undefined)
    .then(task)
    .finally(() => {
      if (senderQueues.get(senderId) === next) {
        senderQueues.delete(senderId);
      }
    });

  senderQueues.set(senderId, next);

  return next;
}

// -----------------------------------------------------------------------------
// WhatsApp client
// -----------------------------------------------------------------------------

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: CONFIG.clientId,
    dataPath: path.join(
      __dirname,
      '.wwebjs_auth'
    ),
  }),

  puppeteer: {
    headless: CONFIG.headless,

    executablePath:
      process.env.PUPPETEER_EXECUTABLE_PATH ||
      '/usr/bin/chromium',

    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote',
      '--disable-crash-reporter',
      '--disable-crashpad',
      '--disable-features=Crashpad',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-extensions',
    ],
  },
});

let whatsappReady = false;
let outboxInterval = null;
let outboxLoopRunning = false;
let outboundSendQueue = Promise.resolve();

client.on('qr', (qr) => {
  console.log('');
  console.log('📲 Scan this QR with WhatsApp:');

  qrcode.generate(qr, {
    small: true,
  });

  console.log('');
});

client.on('ready', () => {
  whatsappReady = true;

  console.log(
    `[${nowIso()}] ✅ WhatsApp bridge ready.`
  );

  if (CONFIG.proactiveEnabled) {
    startOutboxLoop();
  }
});

client.on('authenticated', () => {
  console.log(
    `[${nowIso()}] 🔐 WhatsApp authenticated.`
  );
});

client.on('auth_failure', (message) => {
  console.error(
    `[${nowIso()}] ❌ WhatsApp auth failure:`,
    message
  );
});

client.on('disconnected', (reason) => {
  whatsappReady = false;

  console.error(
    `[${nowIso()}] ⚠️ WhatsApp disconnected:`,
    reason
  );
});

client.on(
  'loading_screen',
  (percent, message) => {
    if (CONFIG.debug) {
      console.log(
        `[${nowIso()}] Loading WhatsApp: ${percent}% ${
          message || ''
        }`
      );
    }
  }
);

// -----------------------------------------------------------------------------
// Inbound message handling
// -----------------------------------------------------------------------------

client.on('message', async (msg) => {
  try {
    const messageId = getMessageId(msg);
    const from = msg.from;

    if (hasProcessed(messageId)) {
      if (CONFIG.debug) {
        console.log(
          `[${nowIso()}] Duplicate ignored: ${messageId}`
        );
      }

      return;
    }

    markProcessed(messageId);

    if (msg.fromMe) {
      if (CONFIG.debug) {
        console.log(
          `[${nowIso()}] Ignored own message.`
        );
      }

      return;
    }

    if (from === 'status@broadcast') {
      if (CONFIG.debug) {
        console.log(
          `[${nowIso()}] Ignored status broadcast.`
        );
      }

      return;
    }

    const body = String(
      msg.body || ''
    ).trim();

    if (!body) {
      if (CONFIG.debug) {
        console.log(
          `[${nowIso()}] Ignored empty/non-text message from ${from}`
        );
      }

      return;
    }

    if (
      body.length >
      CONFIG.maxIncomingChars
    ) {
      console.warn(
        `[${nowIso()}] Message too long from ${from}: ${body.length} chars`
      );

      await safeReply(
        msg,
        '⚠️ Messaggio troppo lungo per LifeOS. Mandamelo più corto.'
      );

      return;
    }

    const chat = await safeGetChat(msg);
    const isGroup = Boolean(
      chat && chat.isGroup
    );

    if (
      isGroup &&
      !isSenderAllowed(from)
    ) {
      console.log(
        `[${nowIso()}] Ignored non-whitelisted group/chat: ${from}`
      );

      return;
    }

    if (!isSenderAllowed(from)) {
      console.log(
        `[${nowIso()}] Ignored unknown sender: ${from}`
      );

      if (CONFIG.debug) {
        console.log(
          `Message preview: ${short(body)}`
        );
      }

      return;
    }

    console.log(
      `[${nowIso()}] 📩 Accepted message from ${from}`
    );

    if (CONFIG.debug) {
      console.log(`Body: ${body}`);
    } else {
      console.log(
        `Body preview: ${short(body)}`
      );
    }

    const quoteEnvelope =
      await buildWhatsappInboundQuoteEnvelope(
        msg
      );

    if (CONFIG.debug && quoteEnvelope.has_quoted_message) {
      console.log(
        `[${nowIso()}] Native quote:`,
        safeJson({
          resolution: quoteEnvelope.quote_resolution,
          provider_id_count: quoteEnvelope.quoted_provider_message_ids?.length || 0,
          provider_id_shape: describeWhatsappProviderId(
            quoteEnvelope.quoted_provider_message_id
          ),
        })
      );
    }

    await enqueueForSender(
      from,
      async () => {
        await handleAcceptedMessage(msg, {
          from,
          body,
          messageId,
          type: msg.type || 'chat',
          timestamp:
            msg.timestamp || null,
          author:
            msg.author || null,
          isGroup,
          ...quoteEnvelope,
        });
      }
    );
  } catch (error) {
    console.error(
      `[${nowIso()}] Fatal message handler error:`,
      error
    );
  }
});

function getMessageId(msg) {
  return extractWhatsappProviderMessageId(msg?.id)
    || `unknown:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

async function safeGetChat(msg) {
  try {
    if (
      typeof msg.getChat !==
      'function'
    ) {
      return null;
    }

    return await msg.getChat();
  } catch (error) {
    if (CONFIG.debug) {
      console.warn(
        `[${nowIso()}] Could not read chat info:`,
        error.message
      );
    }

    return null;
  }
}

function isSenderAllowed(senderId) {
  return CONFIG.allowedSenders.includes(
    senderId
  );
}

async function handleAcceptedMessage(
  msg,
  payload
) {
  try {
    let reply;
    let inboundResponse = null;

    if (CONFIG.dryRun) {
      reply =
        buildDryRunReply(payload);
    } else {
      inboundResponse =
        await sendToLifeOS(payload);

      reply =
        inboundResponse &&
        typeof inboundResponse.reply ===
          'string'
          ? inboundResponse.reply.trim()
          : '';

      if (
        CONFIG.debug &&
        inboundResponse &&
        inboundResponse.debug
      ) {
        console.log(
          `[${nowIso()}] Inbound debug:`,
          safeJson(inboundResponse.debug)
        );
      }
    }

    if (!reply) {
      if (CONFIG.debug) {
        console.log(
          `[${nowIso()}] No reply returned by LifeOS.`
        );
      }

      return;
    }

    const sentMessages =
      await sendLongReply(
        msg,
        reply
      );

    // Only real Brain responses have assistant/thread IDs that can be mapped.
    if (
      !CONFIG.dryRun &&
      inboundResponse
    ) {
      for (
        const sentMessage of sentMessages
      ) {
        try {
          await recordWhatsappReplyDelivery({
            inboundResponse,
            sentMessage,
            recipient: payload.from,
          });
        } catch (error) {
          logAxiosError(
            'Could not record WhatsApp reply delivery',
            error
          );
        }
      }
    }
  } catch (error) {
    logAxiosError(
      'Error while processing LifeOS message',
      error
    );

    await safeReply(
      msg,
      '⚠️ LifeOS non è riuscito a rispondere ora.'
    );
  }
}

function buildDryRunReply(payload) {
  return [
    '✅ Bridge LifeOS attivo.',
    '',
    `Ho ricevuto: "${short(
      payload.body,
      500
    )}"`,
    '',
    'DRY_RUN=true, quindi non ho ancora chiamato Brain su Vercel.',
  ].join('\n');
}

async function sendToLifeOS(payload) {
  const url =
    `${CONFIG.lifeosBaseUrl}/api/integrations/whatsapp/inbound`;

  const body = {
    from: payload.from,
    author: payload.author,
    message_id:
      payload.messageId,
    body: payload.body,
    timestamp:
      payload.timestamp,
    type: payload.type,
    is_group:
      payload.isGroup,
    source: 'whatsapp',
    has_quoted_message:
      payload.has_quoted_message === true,
    quoted_provider_message_id:
      payload.quoted_provider_message_id || null,
    quoted_provider_message_ids:
      payload.quoted_provider_message_ids || [],
    quoted_from_me:
      payload.quoted_from_me ?? null,
    quoted_chat_id:
      payload.quoted_chat_id || null,
  };

  const response =
    await axios.post(
      url,
      body,
      {
        timeout:
          CONFIG.requestTimeoutMs,
        headers:
          apiHeaders(),
        validateStatus:
          (status) =>
            status >= 200 &&
            status < 500,
      }
    );

  if (
    response.status >= 400
  ) {
    const err = new Error(
      `LifeOS inbound endpoint returned HTTP ${response.status}`
    );

    err.response = response;
    throw err;
  }

  return response.data || {};
}

// -----------------------------------------------------------------------------
// Proactive outbox loop
// -----------------------------------------------------------------------------

function startOutboxLoop() {
  if (outboxInterval) return;

  if (
    !CONFIG.allowedSenders.length
  ) {
    console.warn(
      `[${nowIso()}] Outbox loop not started: WHATSAPP_ALLOWED_SENDERS is empty.`
    );

    return;
  }

  if (!CONFIG.bridgeSecret) {
    console.warn(
      `[${nowIso()}] Outbox loop not started: LIFEOS_WHATSAPP_BRIDGE_SECRET is missing.`
    );

    return;
  }

  const intervalMs =
    Math.max(
      CONFIG.outboxPollSeconds,
      15
    ) * 1000;

  console.log(
    `[${nowIso()}] 🔁 Starting proactive outbox loop every ${Math.round(
      intervalMs / 1000
    )}s.`
  );

  setTimeout(() => {
    runOutboxLoopOnce().catch(
      (error) => {
        logAxiosError(
          'Initial outbox loop failed',
          error
        );
      }
    );
  }, 3000).unref();

  outboxInterval =
    setInterval(() => {
      runOutboxLoopOnce().catch(
        (error) => {
          logAxiosError(
            'Outbox loop failed',
            error
          );
        }
      );
    }, intervalMs);

  outboxInterval.unref();
}

async function runOutboxLoopOnce() {
  if (!whatsappReady) {
    if (CONFIG.debug) {
      console.log(
        `[${nowIso()}] Outbox skipped: WhatsApp not ready.`
      );
    }

    return;
  }

  if (outboxLoopRunning) {
    if (CONFIG.debug) {
      console.log(
        `[${nowIso()}] Outbox skipped: previous loop still running.`
      );
    }

    return;
  }

  outboxLoopRunning = true;

  try {
    for (
      const recipient of
      CONFIG.allowedSenders
    ) {
      await runOutboxForRecipient(
        recipient
      );
    }
  } finally {
    outboxLoopRunning = false;
  }
}

async function runOutboxForRecipient(
  recipient
) {
  if (!recipient) return;

  if (
    CONFIG.outboxEvaluateBeforePoll
  ) {
    await evaluateOutbox(
      recipient
    );
  }

  const messages =
    await pollOutbox(
      recipient
    );

  if (!messages.length) {
    if (CONFIG.debug) {
      console.log(
        `[${nowIso()}] Outbox: no messages for ${recipient}.`
      );
    }

    return;
  }

  console.log(
    `[${nowIso()}] 📬 Outbox: ${messages.length} message(s) for ${recipient}.`
  );

  for (
    const message of messages
  ) {
    await handleOutboxMessage(
      recipient,
      message
    );
  }
}

async function evaluateOutbox(
  recipient
) {
  const url =
    `${CONFIG.lifeosBaseUrl}/api/integrations/whatsapp/outbox`;

  const body = {
    action: 'evaluate',
    recipient,
    bridge_id:
      CONFIG.clientId,
  };

  const response =
    await axios.post(
      url,
      body,
      {
        timeout:
          CONFIG.requestTimeoutMs,
        headers:
          apiHeaders(),
        validateStatus:
          (status) =>
            status >= 200 &&
            status < 500,
      }
    );

  if (
    response.status >= 400
  ) {
    const err = new Error(
      `LifeOS outbox evaluate returned HTTP ${response.status}`
    );

    err.response = response;
    throw err;
  }

  const data =
    response.data || {};

  if (CONFIG.debug) {
    console.log(
      `[${nowIso()}] Outbox evaluate for ${recipient}: queued=${
        data.queued ?? '?'
      } skipped=${
        data.skipped ?? '?'
      }`
    );

    if (data.debug) {
      console.log(
        `[${nowIso()}] Outbox evaluate debug:`,
        safeJson(data.debug)
      );
    }
  }

  return data;
}

async function pollOutbox(
  recipient
) {
  const url =
    `${CONFIG.lifeosBaseUrl}/api/integrations/whatsapp/outbox`;

  const body = {
    action: 'poll',
    recipient,
    bridge_id:
      CONFIG.clientId,
    limit:
      CONFIG.outboxPollLimit,
  };

  const response =
    await axios.post(
      url,
      body,
      {
        timeout:
          CONFIG.requestTimeoutMs,
        headers:
          apiHeaders(),
        validateStatus:
          (status) =>
            status >= 200 &&
            status < 500,
      }
    );

  if (
    response.status >= 400
  ) {
    const err = new Error(
      `LifeOS outbox poll returned HTTP ${response.status}`
    );

    err.response = response;
    throw err;
  }

  const data =
    response.data || {};

  if (
    CONFIG.debug &&
    data.debug
  ) {
    console.log(
      `[${nowIso()}] Outbox poll debug:`,
      safeJson(data.debug)
    );
  }

  return Array.isArray(
    data.messages
  )
    ? data.messages
    : [];
}

async function handleOutboxMessage(
  recipient,
  message
) {
  const messageId =
    message && message.id;

  const deliveryAttempt =
    message &&
    message.delivery_attempt != null
      ? Number(
          message.delivery_attempt
        )
      : null;

  const to =
    message &&
    (message.to ||
      message.recipient ||
      recipient);

  const body =
    message &&
    typeof message.body ===
      'string'
      ? message.body.trim()
      : '';

  if (
    !messageId ||
    !to ||
    !body
  ) {
    console.warn(
      `[${nowIso()}] Invalid outbox message:`,
      safeJson(message)
    );

    return;
  }

  console.log(
    `[${nowIso()}] 📤 Sending proactive message ${messageId} to ${to}` +
      (deliveryAttempt != null
        ? ` (attempt ${deliveryAttempt})`
        : '')
  );

  console.log(
    `Outbox preview: ${short(
      body
    )}`
  );

  if (CONFIG.dryRun) {
    console.log('');
    console.log(
      '━━━━━━━━━━ DRY_RUN OUTBOX MESSAGE ━━━━━━━━━━'
    );
    console.log(
      `To: ${to}`
    );
    console.log(
      `ID: ${messageId}`
    );

    if (
      deliveryAttempt != null
    ) {
      console.log(
        `Delivery attempt: ${deliveryAttempt}`
      );
    }

    console.log(body);

    console.log(
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
    );
    console.log('');

    if (
      CONFIG.outboxAckDryRunAsSent
    ) {
      await ackOutbox({
        recipient,
        messageId,
        deliveryAttempt,
        status: 'sent',
        providerMessageId:
          `dry_run:${Date.now()}`,
        metadata: {
          dry_run: true,
          bridge_id:
            CONFIG.clientId,
        },
      });
    } else {
      await ackOutbox({
        recipient,
        messageId,
        deliveryAttempt,
        status: 'failed',
        error:
          'DRY_RUN=true: message printed locally, not sent',
        metadata: {
          dry_run: true,
          bridge_id:
            CONFIG.clientId,
        },
      });
    }

    return;
  }

  try {
    const sentResults =
      await sendLongMessage(
        to,
        body
      );

    const providerMessageIds = [
      ...new Set(
        sentResults.flatMap((result) =>
          extractWhatsappProviderMessageIds(
            result?.id ?? result
          )
        )
      ),
    ];

    if (CONFIG.debug) {
      console.log(
        `[${nowIso()}] Proactive provider identity:`,
        safeJson({
          outbox_message_id: messageId,
          provider_id_count: providerMessageIds.length,
          provider_id_fingerprints: providerMessageIds
            .map((id) => describeWhatsappProviderId(id).fingerprint)
            .filter(Boolean),
        })
      );
    }

    await ackOutbox({
      recipient,
      messageId,
      deliveryAttempt,
      status: 'sent',
      providerMessageId:
        providerMessageIds[0] ||
        null,
      providerMessageIds,
      metadata: {
        bridge_id:
          CONFIG.clientId,
        chunks:
          sentResults.length,
      },
    });

    console.log(
      `[${nowIso()}] ✅ Outbox message sent and acked: ${messageId}` +
        (deliveryAttempt != null
          ? ` (attempt ${deliveryAttempt})`
          : '')
    );
  } catch (error) {
    console.error(
      `[${nowIso()}] ❌ Failed to send outbox message ${messageId}:`,
      error.message
    );

    await ackOutbox({
      recipient,
      messageId,
      deliveryAttempt,
      status: 'failed',
      error:
        error.message,
      metadata: {
        bridge_id:
          CONFIG.clientId,
      },
    });
  }
}

async function recordWhatsappReplyDelivery({
  inboundResponse,
  sentMessage,
  recipient,
}) {
  const payload =
    buildWhatsappReplyDeliveryPayload({
      inboundResponse,
      sentMessage,
      recipient,
      bridgeId:
        CONFIG.clientId,
    });

  if (!payload) {
    if (CONFIG.debug) {
      console.warn(
        `[${nowIso()}] Reply delivery mapping skipped: missing assistant/thread/provider ID.`
      );
    }

    return null;
  }

  const url =
    `${CONFIG.lifeosBaseUrl}/api/integrations/whatsapp/outbox`;

  const response =
    await axios.post(
      url,
      payload,
      {
        timeout:
          CONFIG.requestTimeoutMs,
        headers:
          apiHeaders(),
        validateStatus:
          (status) =>
            status >= 200 &&
            status < 500,
      }
    );

  if (
    response.status >= 400
  ) {
    const err = new Error(
      `LifeOS record_reply_delivery returned HTTP ${response.status}`
    );

    err.response = response;
    throw err;
  }

  if (CONFIG.debug) {
    console.log(
      `[${nowIso()}] Recorded WhatsApp provider mapping:`,
      safeJson({
        provider_id_count: payload.provider_message_ids.length,
        provider_id_shape: describeWhatsappProviderId(
          payload.provider_message_id
        ),
        assistant_message_id: payload.assistant_message_id,
      })
    );
  }

  return response.data || {};
}

async function ackOutbox({
  recipient,
  messageId,
  deliveryAttempt = null,
  status,
  providerMessageId = null,
  providerMessageIds = [],
  error = null,
  metadata = {},
}) {
  const url =
    `${CONFIG.lifeosBaseUrl}/api/integrations/whatsapp/outbox`;

  const body = buildWhatsappOutboxAckPayload({
    recipient,
    messageId,
    deliveryAttempt,
    status,
    providerMessageId,
    providerMessageIds,
    error,
    bridgeId: CONFIG.clientId,
    metadata,
  });

  const response =
    await axios.post(
      url,
      body,
      {
        timeout:
          CONFIG.requestTimeoutMs,
        headers:
          apiHeaders(),
        validateStatus:
          (code) =>
            code >= 200 &&
            code < 500,
      }
    );

  if (
    response.status >= 400
  ) {
    const err = new Error(
      `LifeOS outbox ack returned HTTP ${response.status}`
    );

    err.response = response;
    throw err;
  }

  if (
    CONFIG.debug &&
    response.data &&
    response.data.debug
  ) {
    console.log(
      `[${nowIso()}] Outbox ack debug:`,
      safeJson(
        response.data.debug
      )
    );
  }

  return response.data || {};
}

// -----------------------------------------------------------------------------
// Reply / message splitting
// -----------------------------------------------------------------------------

async function sendLongReply(
  msg,
  text
) {
  const chunks =
    splitReply(
      text,
      CONFIG.maxReplyChunkChars
    );

  const sentMessages = [];

  for (
    let i = 0;
    i < chunks.length;
    i += 1
  ) {
    const prefix =
      chunks.length > 1
        ? `(${i + 1}/${chunks.length}) `
        : '';

    const sentMessage =
      await safeReply(
        msg,
        `${prefix}${chunks[i]}`
      );

    if (sentMessage) {
      sentMessages.push(sentMessage);
    }

    if (
      i <
      chunks.length - 1
    ) {
      await sleep(500);
    }
  }

  return sentMessages;
}

async function sendLongMessage(
  to,
  text
) {
  const chunks =
    splitReply(
      text,
      CONFIG.maxReplyChunkChars
    );

  const results = [];

  for (
    let i = 0;
    i < chunks.length;
    i += 1
  ) {
    const prefix =
      chunks.length > 1
        ? `(${i + 1}/${chunks.length}) `
        : '';

    const result = await sendMessageWithCapturedIdentity(
      to,
      `${prefix}${chunks[i]}`
    );

    results.push(result);

    if (
      i <
      chunks.length - 1
    ) {
      await sleep(500);
    }
  }

  return results;
}

function splitReply(
  text,
  maxChars
) {
  const clean =
    String(text || '').trim();

  if (!clean) return [];

  if (
    clean.length <= maxChars
  ) {
    return [clean];
  }

  const paragraphs =
    clean.split(/\n{2,}/);

  const chunks = [];
  let current = '';

  for (
    const paragraph of paragraphs
  ) {
    const candidate =
      current
        ? `${current}\n\n${paragraph}`
        : paragraph;

    if (
      candidate.length <=
      maxChars
    ) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = '';
    }

    if (
      paragraph.length <=
      maxChars
    ) {
      current = paragraph;
      continue;
    }

    const hardChunks =
      hardSplit(
        paragraph,
        maxChars
      );

    chunks.push(
      ...hardChunks.slice(
        0,
        -1
      )
    );

    current =
      hardChunks[
        hardChunks.length - 1
      ] || '';
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function hardSplit(
  text,
  maxChars
) {
  const chunks = [];
  let rest =
    String(text || '');

  while (
    rest.length > maxChars
  ) {
    let cut =
      rest.lastIndexOf(
        '\n',
        maxChars
      );

    if (
      cut <
      maxChars * 0.5
    ) {
      cut =
        rest.lastIndexOf(
          ' ',
          maxChars
        );
    }

    if (
      cut <
      maxChars * 0.5
    ) {
      cut = maxChars;
    }

    chunks.push(
      rest
        .slice(0, cut)
        .trim()
    );

    rest =
      rest
        .slice(cut)
        .trim();
  }

  if (rest) {
    chunks.push(rest);
  }

  return chunks;
}

async function safeReply(
  msg,
  text
) {
  try {
    const sentMessage = await sendMessageWithCapturedIdentity(
      msg.from,
      text
    );

    console.log(
      `[${nowIso()}] 📤 Replied.`
    );

    return sentMessage;
  } catch (error) {
    console.error(
      `[${nowIso()}] Failed to reply:`,
      error.message
    );

    return null;
  }
}

function sendMessageWithCapturedIdentity(recipient, body) {
  const run = outboundSendQueue.then(async () => {
    const result = await sendWhatsappMessageWithProviderIdentity({
      client,
      recipient,
      body,
    });
    if (CONFIG.debug) {
      const ids = extractWhatsappProviderMessageIds(result.message?.id ?? result.message);
      console.log(
        `[${nowIso()}] Outgoing provider identity:`,
        safeJson({
          source: result.identity_source,
          provider_id_count: ids.length,
          provider_id_fingerprints: ids
            .map((id) => describeWhatsappProviderId(id).fingerprint)
            .filter(Boolean),
        })
      );
    }
    return result.message;
  });
  outboundSendQueue = run.catch(() => null);
  return run;
}

// -----------------------------------------------------------------------------
// Graceful shutdown
// -----------------------------------------------------------------------------

let shuttingDown = false;

async function shutdown(
  signal
) {
  if (shuttingDown) return;

  shuttingDown = true;

  console.log('');

  console.log(
    `[${nowIso()}] ${signal} received. Shutting down WhatsApp bridge...`
  );

  if (outboxInterval) {
    clearInterval(
      outboxInterval
    );

    outboxInterval = null;
  }

  try {
    await client.destroy();
  } catch (error) {
    if (
      error.message &&
      error.message.includes(
        'The process'
      ) &&
      error.message.includes(
        'not found'
      )
    ) {
      if (CONFIG.debug) {
        console.log(
          `[${nowIso()}] Browser process already terminated.`
        );
      }
    } else {
      console.error(
        `[${nowIso()}] Error while destroying client:`,
        error.message
      );
    }
  }

  process.exit(0);
}

process.on(
  'SIGINT',
  () => shutdown('SIGINT')
);

process.on(
  'SIGTERM',
  () => shutdown('SIGTERM')
);

function isHarmlessProcessError(
  err
) {
  const msg =
    err &&
    (err.message ||
      String(err));

  return (
    msg &&
    msg.includes(
      'The process'
    ) &&
    msg.includes(
      'not found'
    )
  );
}

process.on(
  'unhandledRejection',
  (reason) => {
    if (
      shuttingDown &&
      isHarmlessProcessError(
        reason
      )
    ) {
      return;
    }

    console.error(
      `[${nowIso()}] Unhandled rejection:`,
      reason
    );
  }
);

process.on(
  'uncaughtException',
  (error) => {
    if (
      shuttingDown &&
      isHarmlessProcessError(
        error
      )
    ) {
      return;
    }

    console.error(
      `[${nowIso()}] Uncaught exception:`,
      error
    );
  }
);

// -----------------------------------------------------------------------------
// Start
// -----------------------------------------------------------------------------

client
  .initialize()
  .catch((error) => {
    console.error(
      `[${nowIso()}] Failed to initialize WhatsApp client:`,
      error
    );

    process.exit(1);
  });
