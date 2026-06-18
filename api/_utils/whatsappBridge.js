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
  const normalized = cleanText(sender, 180);
  if (!normalized) throw new HttpError(400, 'recipient is required.');

  const allowedSenders = getAllowedWhatsappSenders();
  if (!allowedSenders.size) {
    if (isProduction()) {
      throw new HttpError(500, 'WhatsApp allowed sender list is not configured.');
    }
    if (isGroup) {
      throw new HttpError(403, 'WhatsApp group messages require an explicit allowed sender.');
    }
    console.warn('[LifeOS WhatsApp] LIFEOS_WHATSAPP_ALLOWED_SENDERS is not configured; development sender allowed.');
    return normalized;
  }

  if (!allowedSenders.has(normalized)) {
    throw new HttpError(403, 'Sender is not allowed.');
  }
  return normalized;
}

export function getAllowedWhatsappSenders() {
  return new Set(
    String(process.env.LIFEOS_WHATSAPP_ALLOWED_SENDERS ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );
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
