export class HttpError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function requirePost(req) {
  if (req.method !== 'POST') {
    throw new HttpError(405, 'Method not allowed. Use POST.');
  }
}

export function requireActionAuth(req) {
  const expectedToken = process.env.LIFEOS_ACTION_TOKEN;
  if (!expectedToken) {
    throw new HttpError(500, 'Action API token is not configured.');
  }

  const header = req.headers.authorization || req.headers.Authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (!token || token !== expectedToken) {
    throw new HttpError(401, 'Unauthorized.');
  }
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return parseJson(req.body);

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
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

export function handleApiError(res, error) {
  const status = error instanceof HttpError ? error.status : 500;
  const payload = {
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
