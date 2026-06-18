import crypto from 'node:crypto';

const MAX_JSON_BODY_BYTES = 32 * 1024;
const CORS_METHODS = 'POST, OPTIONS';
const CORS_HEADERS = 'Authorization, Content-Type, x-lifeos-whatsapp-secret, x-lifeos-debug';

export class HttpError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function createRequestContext(req, res) {
  const incomingId = String(req.headers['x-request-id'] ?? '').trim();
  const requestId = /^[a-zA-Z0-9._:-]{8,80}$/.test(incomingId) ? incomingId : crypto.randomUUID();
  setCorsHeaders(res);
  return { requestId };
}

export function handleOptions(req, res) {
  if (req.method !== 'OPTIONS') return false;
  res.statusCode = 204;
  res.end();
  return true;
}

export function requirePost(req) {
  if (req.method !== 'POST') {
    throw new HttpError(405, 'Method not allowed. Use POST.');
  }
}

export function requireActionAuth(req) {
  const expectedToken = String(process.env.LIFEOS_ACTION_TOKEN ?? '').trim();
  if (!expectedToken) {
    throw new HttpError(500, 'Action API token is not configured.');
  }

  const token = getBearerToken(req);
  if (!token || !constantTimeEqual(token, expectedToken)) {
    throw new HttpError(401, 'Unauthorized.');
  }
}

export function getBearerToken(req) {
  const header = String(req.headers.authorization || req.headers.Authorization || '').trim();
  const match = header.match(/^Bearer ([^\s]+)$/);
  return match?.[1] ?? '';
}

export function matchesSecret(value, secret) {
  const expected = String(secret ?? '').trim();
  return Boolean(value && expected && constantTimeEqual(String(value), expected));
}

export async function readJsonBody(req) {
  const contentLength = Number(req.headers['content-length'] ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BODY_BYTES) {
    throw new HttpError(413, 'Request body is too large. Limit JSON payloads to 32kb.');
  }

  if (req.body && typeof req.body === 'object') {
    assertBodySize(JSON.stringify(req.body));
    return req.body;
  }

  if (typeof req.body === 'string') {
    assertBodySize(req.body);
    return parseJson(req.body);
  }

  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_JSON_BODY_BYTES) {
      throw new HttpError(413, 'Request body is too large. Limit JSON payloads to 32kb.');
    }
    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return parseJson(raw);
}

export function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export function sendSuccess(res, status, data, context = {}) {
  const payload = {
    ok: true,
    requestId: context.requestId,
    data,
  };
  if (data?.debug && typeof data.debug === 'object') payload.debug = data.debug;
  sendJson(res, status, payload);
}

export function handleApiError(res, error, context = {}) {
  const status = error instanceof HttpError ? error.status : 500;
  const payload = {
    ok: false,
    requestId: context.requestId,
    error: error instanceof Error ? error.message : 'Unexpected server error.',
  };
  if (error instanceof HttpError && error.details) payload.details = error.details;
  sendJson(res, status, payload);
}

function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
}

function setCorsHeaders(res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', CORS_METHODS);
  res.setHeader('access-control-allow-headers', CORS_HEADERS);
  res.setHeader('access-control-max-age', '86400');
  res.setHeader('vary', 'Origin');
}

function assertBodySize(raw) {
  if (Buffer.byteLength(raw, 'utf8') > MAX_JSON_BODY_BYTES) {
    throw new HttpError(413, 'Request body is too large. Limit JSON payloads to 32kb.');
  }
}

function constantTimeEqual(a, b) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) {
    const maxLength = Math.max(aBuffer.length, bBuffer.length, 1);
    crypto.timingSafeEqual(Buffer.alloc(maxLength), Buffer.alloc(maxLength));
    return false;
  }
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}
