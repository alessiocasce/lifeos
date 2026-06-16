import { HttpError } from './http.js';

export const EMBEDDING_DIMENSIONS = 1536;

const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
const OPENAI_EMBEDDINGS_ENDPOINT = 'https://api.openai.com/v1/embeddings';

export const EMBEDDING_PROVIDER = String(process.env.EMBEDDING_PROVIDER ?? 'openai').trim().toLowerCase();
export const EMBEDDING_MODEL = String(process.env.EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL).trim();

export function isEmbeddingConfigured() {
  if (EMBEDDING_PROVIDER !== 'openai') return false;
  return Boolean(String(process.env.OPENAI_API_KEY ?? '').trim());
}

export async function generateEmbedding(text) {
  const input = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!input || !isEmbeddingConfigured()) return null;
  if (EMBEDDING_PROVIDER !== 'openai') return null;

  const apiKey = String(process.env.OPENAI_API_KEY ?? '').trim();
  let response;
  try {
    response = await fetch(OPENAI_EMBEDDINGS_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: input.slice(0, 24000),
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });
  } catch {
    throw new HttpError(502, 'Embedding provider is temporarily unavailable.');
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new HttpError(response.status >= 500 ? 502 : 400, 'Embedding provider rejected the request.', {
      providerStatus: response.status,
      providerMessage: safeProviderMessage(payload?.error?.message),
    });
  }

  const embedding = payload?.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new HttpError(502, 'Embedding provider returned an invalid vector.');
  }
  return embedding.map((value) => Number(value));
}

function safeProviderMessage(message) {
  return String(message ?? 'No provider message.')
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, '[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
    .replace(/\s+/g, ' ')
    .slice(0, 300);
}
