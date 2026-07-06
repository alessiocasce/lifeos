import { HttpError, matchesSecret } from './http.js';

export function requireWhatsappBridgeSecret(req) {
  const configuredSecret = String(process.env.LIFEOS_WHATSAPP_BRIDGE_SECRET ?? '').trim();
  if (!configuredSecret) {
    if (isProduction()) {
      throw new HttpError(500, 'WhatsApp bridge secret is not configured.');
    }
    console.warn('[LifeOS WhatsApp] LIFEOS_WHATSAPP_BRIDGE_SECRET is not configured; development request allowed.');
    return;
  }

  const provided = String(req.headers['x-lifeos-whatsapp-secret'] ?? '').trim();
  if (!matchesSecret(provided, configuredSecret)) {
    throw new HttpError(401, 'Unauthorized.');
  }
}

export function validateWhatsappSender(sender, isGroup = false) {
  const raw = normalizeWhatsappSenderId(sender);
  if (!raw) throw new HttpError(400, 'recipient is required.');
  const canonical = canonicalizeWhatsappSender(raw);

  const allowedSenders = getAllowedWhatsappSenders();
  if (!allowedSenders.size) {
    if (isProduction()) {
      throw new HttpError(500, 'WhatsApp allowed sender list is not configured.');
    }
    if (isGroup) {
      throw new HttpError(403, 'WhatsApp group messages require an explicit allowed sender.');
    }
    console.warn('[LifeOS WhatsApp] LIFEOS_WHATSAPP_ALLOWED_SENDERS is not configured; development sender allowed.');
    return canonical;
  }

  const allowedCanonicalSenders = getAllowedCanonicalWhatsappSenders();
  if (!allowedSenders.has(raw) && !allowedCanonicalSenders.has(canonical)) {
    throw new HttpError(403, 'Sender is not allowed.');
  }
  return canonical;
}

export function getAllowedWhatsappSenders(env = process.env) {
  return new Set(
    String(env.LIFEOS_WHATSAPP_ALLOWED_SENDERS ?? '')
      .split(',')
      .map((item) => normalizeWhatsappSenderId(item))
      .filter(Boolean),
  );
}

export function getAllowedCanonicalWhatsappSenders(env = process.env) {
  return new Set([...getAllowedWhatsappSenders(env)].map((sender) => canonicalizeWhatsappSender(sender, env)));
}

export function normalizeWhatsappSenderId(raw) {
  return cleanText(raw, 180);
}

export function canonicalizeWhatsappSender(raw, env = process.env) {
  const normalized = normalizeWhatsappSenderId(raw);
  if (!normalized) return null;
  return getWhatsappSenderAliasMap(env).get(normalized) || normalized;
}

export function getWhatsappSenderAliasMap(env = process.env) {
  const aliases = new Map();
  const config = String(env.LIFEOS_WHATSAPP_SENDER_ALIASES ?? '').trim();
  if (!config) return aliases;
  for (const group of config.split(';')) {
    const [canonicalRaw, aliasRaw = ''] = group.split('=');
    const canonical = normalizeWhatsappSenderId(canonicalRaw);
    if (!canonical) continue;
    aliases.set(canonical, canonical);
    for (const alias of aliasRaw.split(',')) {
      const normalizedAlias = normalizeWhatsappSenderId(alias);
      if (normalizedAlias) aliases.set(normalizedAlias, canonical);
    }
  }
  return aliases;
}

export function getWhatsappSenderAliasesForCanonical(canonicalRaw, env = process.env) {
  const canonical = canonicalizeWhatsappSender(canonicalRaw, env);
  if (!canonical) return [];
  const aliases = [canonical];
  for (const [alias, mappedCanonical] of getWhatsappSenderAliasMap(env)) {
    if (mappedCanonical === canonical) aliases.push(alias);
  }
  return [...new Set(aliases)];
}

export function describeWhatsappSender(raw, env = process.env) {
  const normalized = normalizeWhatsappSenderId(raw);
  const canonical = canonicalizeWhatsappSender(normalized, env);
  return {
    raw: normalized,
    canonical,
    aliased: Boolean(normalized && canonical && normalized !== canonical),
  };
}

export function cleanWhatsappText(value, maxLength = 180) {
  return cleanText(value, maxLength);
}

function cleanText(value, maxLength) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, maxLength) : null;
}

function isProduction() {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
}
