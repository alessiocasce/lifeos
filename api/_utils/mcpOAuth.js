import crypto from 'node:crypto';
import { matchesSecret, sendJson } from './http.js';
import { getActionUserId } from './supabaseAdmin.js';

const CODE_TTL_SECONDS = 5 * 60;
const ACCESS_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const SUPPORTED_SCOPE = 'lifeos.read';
const CODE_KIND = 'mcp_auth_code';
const ACCESS_KIND = 'mcp_access_token';
const MAX_FORM_BYTES = 32 * 1024;

export function getMcpOAuthRequestKind(req) {
  if (req.query?.mcp_oauth) return String(req.query.mcp_oauth);
  const url = getRequestUrl(req);
  const queryKind = url.searchParams.get('mcp_oauth');
  if (queryKind) return queryKind;
  const path = url.pathname.replace(/\/+$/, '');
  if (path.endsWith('/.well-known/oauth-protected-resource')) return 'protected-resource';
  if (path.endsWith('/.well-known/oauth-authorization-server')) return 'authorization-server';
  if (path.endsWith('/.well-known/openid-configuration')) return 'openid-configuration';
  if (path.endsWith('/oauth/authorize')) return 'authorize';
  if (path.endsWith('/oauth/token')) return 'token';
  return '';
}

export async function handleMcpOAuthRequest(req, res) {
  const kind = getMcpOAuthRequestKind(req);
  if (!kind) return false;

  try {
    if (kind === 'protected-resource' && req.method === 'GET') {
      sendJson(res, 200, buildProtectedResourceMetadata(req));
      return true;
    }
    if ((kind === 'authorization-server' || kind === 'openid-configuration') && req.method === 'GET') {
      sendJson(res, 200, buildAuthorizationServerMetadata(req));
      return true;
    }
    if (kind === 'authorize' && req.method === 'GET') {
      handleAuthorizeGet(req, res);
      return true;
    }
    if (kind === 'authorize' && req.method === 'POST') {
      await handleAuthorizePost(req, res);
      return true;
    }
    if (kind === 'token' && req.method === 'POST') {
      await handleTokenPost(req, res);
      return true;
    }
    sendJson(res, 405, { error: 'method_not_allowed' });
    return true;
  } catch (error) {
    sendSafeOAuthError(res, error);
    return true;
  }
}

export function validateMcpBearerAuth(req, env = process.env) {
  const staticToken = String(env.LIFEOS_MCP_TOKEN ?? '').trim();
  const bearer = getBearerToken(req);
  const fallback = bearer ? '' : String(req.headers?.['x-lifeos-mcp-token'] ?? req.headers?.['X-LifeOS-MCP-Token'] ?? '').trim();
  const token = bearer || fallback;
  const wwwAuthenticate = buildWwwAuthenticateHeader(req, env);
  if (!staticToken && !isOAuthEnabled(env)) {
    return { ok: false, status: 500, error: 'MCP auth is not configured.', wwwAuthenticate };
  }

  if (!token) return { ok: false, status: 401, error: 'Unauthorized.', wwwAuthenticate };
  if (staticToken && matchesSecret(token, staticToken)) {
    return { ok: true, status: 200, error: null, authType: 'static' };
  }

  if (isOAuthEnabled(env)) {
    const payload = verifySignedToken(token, ACCESS_KIND, env);
    if (payload && isAccessPayloadValid(payload, req)) {
      return { ok: true, status: 200, error: null, authType: 'oauth', tokenPayload: payload };
    }
  }

  return { ok: false, status: 401, error: 'Unauthorized.', wwwAuthenticate };
}

export function buildWwwAuthenticateHeader(req, env = process.env) {
  return `Bearer resource_metadata="${getProtectedResourceMetadataUrl(req, env)}", scope="${SUPPORTED_SCOPE}"`;
}

export function buildProtectedResourceMetadata(req, env = process.env) {
  return {
    resource: getMcpResourceUrl(req, env),
    authorization_servers: [getIssuer(req, env)],
    scopes_supported: [SUPPORTED_SCOPE],
    resource_documentation: getMcpResourceUrl(req, env),
  };
}

export function buildAuthorizationServerMetadata(req, env = process.env) {
  const issuer = getIssuer(req, env);
  return {
    issuer,
    authorization_endpoint: getMcpOAuthEndpointUrl(req, 'authorize', env),
    token_endpoint: getMcpOAuthEndpointUrl(req, 'token', env),
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    client_id_metadata_document_supported: true,
    scopes_supported: [SUPPORTED_SCOPE],
  };
}

export function signOAuthCodeForTest(params, env = process.env) {
  return signPayload(CODE_KIND, {
    kind: CODE_KIND,
    iss: params.iss,
    aud: params.aud,
    client_id: params.client_id,
    redirect_uri: params.redirect_uri,
    code_challenge: params.code_challenge,
    code_challenge_method: 'S256',
    scope: normalizeScope(params.scope),
    exp: nowSeconds() + CODE_TTL_SECONDS,
    jti: crypto.randomUUID(),
  }, env);
}

export function signAccessTokenForTest(params, env = process.env) {
  return signAccessToken(params, env);
}

export function verifyOAuthAccessTokenForTest(token, req, env = process.env) {
  const payload = verifySignedToken(token, ACCESS_KIND, env);
  return Boolean(payload && isAccessPayloadValid(payload, req));
}

export function verifyPkceForTest(verifier, challenge) {
  return verifyPkce(verifier, challenge);
}

async function handleAuthorizeGet(req, res) {
  const params = Object.fromEntries(getRequestUrl(req).searchParams.entries());
  const validation = validateAuthorizeParams(params, req);
  if (!validation.ok) {
    sendHtml(res, 400, renderErrorPage(validation.error));
    return;
  }
  sendHtml(res, 200, renderAuthorizePage(params, getMcpOAuthEndpointUrl(req, 'authorize')));
}

async function handleAuthorizePost(req, res) {
  const params = await readFormBody(req);
  const validation = validateAuthorizeParams(params, req);
  if (!validation.ok) {
    sendHtml(res, 400, renderErrorPage(validation.error));
    return;
  }
  const expectedSecret = getLinkSecret(process.env);
  if (!expectedSecret || !matchesSecret(params.link_secret, expectedSecret)) {
    sendHtml(res, 401, renderErrorPage('Invalid link secret.'));
    return;
  }

  const code = signPayload(CODE_KIND, {
    kind: CODE_KIND,
    iss: getIssuer(req),
    aud: getMcpResourceUrl(req),
    client_id: params.client_id,
    redirect_uri: params.redirect_uri,
    code_challenge: params.code_challenge,
    code_challenge_method: 'S256',
    scope: normalizeScope(params.scope),
    exp: nowSeconds() + CODE_TTL_SECONDS,
    jti: crypto.randomUUID(),
  });
  const redirect = new URL(params.redirect_uri);
  redirect.searchParams.set('code', code);
  if (params.state) redirect.searchParams.set('state', params.state);
  res.statusCode = 302;
  res.setHeader('location', redirect.toString());
  res.end();
}

async function handleTokenPost(req, res) {
  const params = await readFormBody(req);
  if (params.grant_type !== 'authorization_code') {
    sendJson(res, 400, { error: 'unsupported_grant_type' });
    return;
  }
  const codePayload = verifySignedToken(params.code, CODE_KIND);
  if (!codePayload) {
    sendJson(res, 400, { error: 'invalid_grant' });
    return;
  }
  if (
    codePayload.client_id !== params.client_id
    || codePayload.redirect_uri !== params.redirect_uri
    || codePayload.code_challenge_method !== 'S256'
    || !verifyPkce(params.code_verifier, codePayload.code_challenge)
  ) {
    sendJson(res, 400, { error: 'invalid_grant' });
    return;
  }

  const accessToken = signAccessToken({
    iss: getIssuer(req),
    aud: codePayload.aud,
    sub: getActionUserId(),
    scope: codePayload.scope || SUPPORTED_SCOPE,
    client_id: codePayload.client_id,
  });
  sendJson(res, 200, {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    scope: SUPPORTED_SCOPE,
  });
}

function validateAuthorizeParams(params, req) {
  if (params.response_type !== 'code') return { ok: false, error: 'response_type must be code.' };
  if (!params.client_id) return { ok: false, error: 'client_id is required.' };
  if (!params.redirect_uri || !isAllowedRedirectUri(params.redirect_uri)) return { ok: false, error: 'redirect_uri is not allowed.' };
  if (!params.code_challenge) return { ok: false, error: 'code_challenge is required.' };
  if (params.code_challenge_method !== 'S256') return { ok: false, error: 'code_challenge_method must be S256.' };
  if (!isScopeAllowed(params.scope)) return { ok: false, error: 'unsupported scope.' };
  if (params.resource && !sameUrl(params.resource, getMcpResourceUrl(req))) return { ok: false, error: 'resource is not allowed.' };
  return { ok: true, error: null };
}

function isAccessPayloadValid(payload, req) {
  return payload.kind === ACCESS_KIND
    && payload.exp > nowSeconds()
    && payload.scope?.split(/\s+/).includes(SUPPORTED_SCOPE)
    && sameUrl(payload.aud, getMcpResourceUrl(req));
}

function signAccessToken(params, env = process.env) {
  return signPayload(ACCESS_KIND, {
    kind: ACCESS_KIND,
    iss: params.iss,
    aud: params.aud,
    sub: params.sub,
    scope: normalizeScope(params.scope),
    iat: nowSeconds(),
    exp: nowSeconds() + ACCESS_TOKEN_TTL_SECONDS,
    client_id: params.client_id,
    jti: crypto.randomUUID(),
  }, env);
}

function signPayload(kind, payload, env = process.env) {
  const secret = getSigningSecret(env);
  if (!secret) throw new Error('OAuth signing secret is not configured.');
  const body = base64urlEncode(JSON.stringify(payload));
  const signature = hmac(`${kind}.${body}`, secret);
  return `${kind}.${body}.${signature}`;
}

function verifySignedToken(token, expectedKind, env = process.env) {
  const secret = getSigningSecret(env);
  if (!secret || typeof token !== 'string') return null;
  const [kind, body, signature] = token.split('.');
  if (kind !== expectedKind || !body || !signature) return null;
  const expected = hmac(`${kind}.${body}`, secret);
  if (!timingSafeEqual(signature, expected)) return null;
  let payload;
  try {
    payload = JSON.parse(base64urlDecode(body));
  } catch {
    return null;
  }
  if (!payload || payload.kind !== expectedKind || Number(payload.exp) <= nowSeconds()) return null;
  return payload;
}

function verifyPkce(verifier, challenge) {
  if (!verifier || !challenge) return false;
  const digest = crypto.createHash('sha256').update(String(verifier)).digest();
  return timingSafeEqual(base64urlEncode(digest), String(challenge));
}

async function readFormBody(req) {
  if (req.body && typeof req.body === 'object') return normalizeFormObject(req.body);
  if (typeof req.body === 'string') return Object.fromEntries(new URLSearchParams(req.body));

  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_FORM_BYTES) throw new Error('Form body is too large.');
    chunks.push(buffer);
  }
  return Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString('utf8')));
}

function normalizeFormObject(body) {
  const normalized = {};
  for (const [key, value] of Object.entries(body)) {
    normalized[key] = Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '');
  }
  return normalized;
}

function renderAuthorizePage(params, actionUrl) {
  const hidden = [
    'response_type',
    'client_id',
    'redirect_uri',
    'state',
    'code_challenge',
    'code_challenge_method',
    'resource',
    'scope',
  ].map((key) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(params[key] ?? '')}">`).join('\n');
  return htmlPage('Link LifeOS MCP to ChatGPT', `
    <main>
      <h1>Link LifeOS MCP to ChatGPT</h1>
      <p>Enter your private LifeOS MCP link secret to grant read-only access.</p>
      <form method="post" action="${escapeHtml(actionUrl)}" autocomplete="off">
        ${hidden}
        <label>
          Link secret
          <input type="password" name="link_secret" autocomplete="off" required autofocus>
        </label>
        <button type="submit">Authorize read-only access</button>
      </form>
    </main>
  `);
}

function renderErrorPage(message) {
  return htmlPage('LifeOS MCP authorization error', `
    <main>
      <h1>Authorization error</h1>
      <p>${escapeHtml(message)}</p>
    </main>
  `);
}

function htmlPage(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body{margin:0;min-height:100vh;background:#0a0a0a;color:#f4f4f5;font-family:Inter,system-ui,sans-serif;display:grid;place-items:center}
    main{width:min(420px,calc(100vw - 32px));background:#121212;border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:24px}
    h1{font-size:22px;margin:0 0 12px}
    p{color:#a1a1aa;line-height:1.5}
    label{display:grid;gap:8px;margin-top:18px;color:#d4d4d8}
    input{background:#050505;border:1px solid #3f3f46;border-radius:8px;color:#fff;font-size:16px;padding:12px}
    button{margin-top:18px;width:100%;border:0;border-radius:8px;background:#22d3ee;color:#041014;font-weight:700;padding:12px;cursor:pointer}
  </style>
</head>
<body>${body}</body>
</html>`;
}

function sendHtml(res, status, html) {
  res.statusCode = status;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(html);
}

function sendSafeOAuthError(res) {
  sendJson(res, 500, { error: 'server_error' });
}

function getBearerToken(req) {
  const header = String(req.headers?.authorization || req.headers?.Authorization || '').trim();
  return header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? '';
}

function isOAuthEnabled(env = process.env) {
  if (String(env.LIFEOS_MCP_OAUTH_ENABLED ?? '').trim().toLowerCase() === 'false') return false;
  return Boolean(getSigningSecret(env));
}

function getSigningSecret(env = process.env) {
  return String(env.LIFEOS_MCP_OAUTH_SIGNING_SECRET || env.LIFEOS_MCP_TOKEN || '').trim();
}

function getLinkSecret(env = process.env) {
  return String(env.LIFEOS_MCP_LINK_SECRET || env.LIFEOS_MCP_TOKEN || '').trim();
}

function getProtectedResourceMetadataUrl(req, env = process.env) {
  return getMcpOAuthEndpointUrl(req, 'protected-resource', env);
}

function getMcpResourceUrl(req, env = process.env) {
  return String(env.LIFEOS_MCP_RESOURCE_URL || `${getIssuer(req, env)}/api/mcp`).replace(/\/+$/, '');
}

function getMcpOAuthEndpointUrl(req, kind, env = process.env) {
  const url = new URL(getMcpResourceUrl(req, env));
  url.searchParams.set('mcp_oauth', kind);
  return url.toString();
}

function getIssuer(req, env = process.env) {
  const configured = String(env.LIFEOS_MCP_ISSUER || '').trim();
  if (configured) return configured.replace(/\/+$/, '');
  const proto = String(req.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim() || 'https';
  const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || 'lifeos-ruby-gamma.vercel.app').split(',')[0].trim();
  return `${proto}://${host}`.replace(/\/+$/, '');
}

function getRequestUrl(req) {
  const host = req.headers?.host ?? 'lifeos-ruby-gamma.vercel.app';
  return new URL(req.url ?? '/', `https://${host}`);
}

function isAllowedRedirectUri(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.origin === 'https://chatgpt.com' && url.pathname.startsWith('/connector/oauth/')) return true;
  if (url.origin === 'https://chatgpt.com' && url.pathname === '/connector_platform_oauth_redirect') return true;
  if (String(process.env.LIFEOS_MCP_OAUTH_ALLOW_LOCAL_REDIRECTS ?? '').toLowerCase() === 'true') {
    return ['http://localhost', 'http://127.0.0.1'].includes(url.origin)
      || url.hostname === 'localhost'
      || url.hostname === '127.0.0.1';
  }
  return false;
}

function isScopeAllowed(scope) {
  return normalizeScope(scope) === SUPPORTED_SCOPE;
}

function normalizeScope(scope) {
  const values = String(scope || SUPPORTED_SCOPE).split(/\s+/).filter(Boolean);
  if (!values.length) return SUPPORTED_SCOPE;
  return [...new Set(values)].sort().join(' ');
}

function sameUrl(a, b) {
  try {
    return new URL(a).toString().replace(/\/+$/, '') === new URL(b).toString().replace(/\/+$/, '');
  } catch {
    return false;
  }
}

function hmac(value, secret) {
  return base64urlEncode(crypto.createHmac('sha256', secret).update(value).digest());
}

function base64urlEncode(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64urlDecode(value) {
  const padded = String(value).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function timingSafeEqual(a, b) {
  const aBuffer = Buffer.from(String(a));
  const bBuffer = Buffer.from(String(b));
  if (aBuffer.length !== bBuffer.length) {
    const maxLength = Math.max(aBuffer.length, bBuffer.length, 1);
    crypto.timingSafeEqual(Buffer.alloc(maxLength), Buffer.alloc(maxLength));
    return false;
  }
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}
