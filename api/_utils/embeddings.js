import { HttpError } from './http.js';

export const EMBEDDING_PROVIDER = 'gemini';
export const EMBEDDING_DIMENSIONS = 1536;
export const EMBEDDING_MODEL = stripGeminiModelPrefix(process.env.GEMINI_EMBEDDING_MODEL ?? 'gemini-embedding-2');

const GEMINI_EMBEDDING_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export function isEmbeddingConfigured() {
  return Boolean(String(process.env.GEMINI_API_KEY ?? '').trim());
}

export function formatEmbeddingInput({ text, title = '', inputType = 'document' } = {}) {
  const content = String(text ?? '').replace(/\s+/g, ' ').trim();
  const cleanTitle = String(title ?? '').replace(/\s+/g, ' ').trim() || 'none';
  if (inputType === 'query') return `task: search result | query: ${content}`;
  if (inputType === 'question') return `task: question answering | query: ${content}`;
  return `title: ${cleanTitle} | text: ${content}`;
}

export async function generateEmbedding(text, options = {}) {
  const input = formatEmbeddingInput({ text, ...options });
  if (!String(text ?? '').trim() || !isEmbeddingConfigured()) return null;

  const apiKey = String(process.env.GEMINI_API_KEY ?? '').trim();
  const endpointModel = stripGeminiModelPrefix(EMBEDDING_MODEL);
  const modelName = normalizeGeminiModelName(EMBEDDING_MODEL);
  let response;
  try {
    response = await fetch(`${GEMINI_EMBEDDING_ENDPOINT}/${encodeURIComponent(endpointModel)}:embedContent`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        model: modelName,
        content: {
          parts: [{ text: input.slice(0, 24000) }],
        },
        output_dimensionality: EMBEDDING_DIMENSIONS,
      }),
    });
  } catch {
    throw new HttpError(502, 'Gemini embedding provider is temporarily unavailable.');
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new HttpError(response.status >= 500 ? 502 : 400, 'Gemini embedding provider rejected the request.', {
      providerStatus: response.status,
      providerMessage: safeProviderMessage(payload?.error?.message),
    });
  }

  const values = extractGeminiEmbeddingValues(payload);
  if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS) {
    throw new HttpError(502, 'Gemini embedding provider returned an invalid vector.', {
      providerMessage: `Expected ${EMBEDDING_DIMENSIONS} dimensions, received ${Array.isArray(values) ? values.length : 'none'}.`,
    });
  }
  return values.map((value) => Number(value));
}

function normalizeGeminiModelName(model) {
  const value = String(model ?? '').trim() || 'gemini-embedding-2';
  return value.startsWith('models/') ? value : `models/${value}`;
}

function stripGeminiModelPrefix(model) {
  return String(model ?? '').trim().replace(/^models\//, '') || 'gemini-embedding-2';
}

function extractGeminiEmbeddingValues(payload) {
  if (Array.isArray(payload?.embedding?.values)) return payload.embedding.values;
  if (Array.isArray(payload?.embeddings?.[0]?.values)) return payload.embeddings[0].values;
  if (Array.isArray(payload?.embeddings?.[0]?.embedding?.values)) return payload.embeddings[0].embedding.values;
  return null;
}

function safeProviderMessage(message) {
  return String(message ?? 'No provider message.')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
    .replace(/\s+/g, ' ')
    .slice(0, 300);
}
