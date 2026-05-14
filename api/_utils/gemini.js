import { HttpError } from './http.js';

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export async function generateGeminiText({ system, prompt, json = false, temperature = 0.2 }) {
  const apiKey = String(process.env.GEMINI_API_KEY ?? '').trim();
  if (!apiKey) {
    throw new HttpError(500, 'Gemini API key is not configured.');
  }

  const model = String(process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL).trim();
  const response = await fetch(`${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
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

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new HttpError(response.status >= 500 ? 502 : 400, 'Gemini request failed.', {
      providerStatus: response.status,
      providerMessage: payload?.error?.message ?? 'No provider message.',
    });
  }

  const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim();
  if (!text) {
    throw new HttpError(502, 'Gemini returned an empty response.');
  }
  return text;
}

export async function generateGeminiJson({ system, prompt, temperature = 0.1 }) {
  const text = await generateGeminiText({ system, prompt, json: true, temperature });
  return parseGeminiJson(text);
}

function parseGeminiJson(text) {
  const trimmed = text.trim();
  const unfenced = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    throw new HttpError(502, 'Gemini returned invalid JSON.');
  }
}
