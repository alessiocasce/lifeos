import { HttpError } from './http.js';

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const JSON_REPAIR_SYSTEM = `
Return valid JSON only.
No markdown.
No commentary.
Preserve the intended object shape and values.
`;

export async function generateGeminiText({ system, prompt, json = false, temperature = 0.2 }) {
  const apiKey = String(process.env.GEMINI_API_KEY ?? '').trim();
  if (!apiKey) {
    throw new HttpError(500, 'Gemini API key is not configured.');
  }

  const model = String(process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL).trim();
  let response;
  try {
    response = await fetch(`${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: system }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature,
          ...(json ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    });
  } catch {
    throw new HttpError(502, 'Gemini is temporarily unavailable. Try again shortly.', {
      providerMessage: 'Network request to Gemini failed.',
    });
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw geminiProviderError(response.status, payload);
  }

  const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim();
  if (!text) {
    throw new HttpError(502, 'Gemini returned an empty response.');
  }
  return text;
}

export async function generateGeminiJson({ system, prompt, temperature = 0.1, invalidMessage = 'Gemini returned an invalid JSON response.', repair = false }) {
  const text = await generateGeminiText({ system, prompt, json: true, temperature });
  const parsed = tryParseGeminiJson(text);
  if (parsed.ok) return parsed.value;

  if (repair) {
    const repairPrompt = JSON.stringify({
      instruction: 'Convert this into valid JSON matching the requested schema. Return JSON only.',
      invalidResponse: text,
    });
    const repairedText = await generateGeminiText({
      system: JSON_REPAIR_SYSTEM,
      prompt: repairPrompt,
      json: true,
      temperature: 0,
    });
    const repaired = tryParseGeminiJson(repairedText);
    if (repaired.ok) return repaired.value;
  }

  throw new HttpError(502, invalidMessage);
}

function tryParseGeminiJson(text) {
  const unfenced = extractJsonCandidate(text);
  try {
    return { ok: true, value: JSON.parse(unfenced) };
  } catch {
    return { ok: false };
  }
}

function extractJsonCandidate(text) {
  const trimmed = String(text ?? '').trim();
  const unfenced = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  if (unfenced.startsWith('{') && unfenced.endsWith('}')) return unfenced;

  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return unfenced.slice(start, end + 1).trim();
  }

  return unfenced;
}

function geminiProviderError(status, payload) {
  const providerMessage = safeProviderMessage(payload?.error?.message);
  const details = {
    providerStatus: status,
    providerMessage,
  };

  if (status === 429) {
    return new HttpError(429, 'Gemini rate limit reached. Try again shortly.', details);
  }
  if (status === 400) {
    return new HttpError(400, 'Gemini rejected the request.', details);
  }
  if (status >= 500) {
    return new HttpError(502, 'Gemini is temporarily unavailable. Try again shortly.', details);
  }
  return new HttpError(400, 'Gemini request failed.', details);
}

function safeProviderMessage(message) {
  const text = String(message ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return 'No provider message.';
  return text
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
    .slice(0, 300);
}
