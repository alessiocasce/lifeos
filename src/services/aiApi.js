import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';

export async function sendLifeOSAiMessage(message, threadId, options = {}) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured.');
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in before using the LifeOS assistant.');

  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : 90_000;
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abortFromCaller = () => controller.abort();
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener('abort', abortFromCaller, { once: true });
  }

  let response;
  try {
    response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        message,
        ...(threadId ? { thread_id: threadId } : {}),
        ...(options.clientRequestId ? { client_request_id: options.clientRequestId } : {}),
      }),
    });
  } catch (error) {
    if (timedOut || error?.name === 'AbortError') {
      const timeoutError = new Error(timedOut ? 'Brain took too long to respond. Try again.' : 'Brain request was cancelled.');
      timeoutError.code = timedOut ? 'BRAIN_TIMEOUT' : 'BRAIN_ABORTED';
      throw timeoutError;
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
    if (options.signal) options.signal.removeEventListener('abort', abortFromCaller);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    const error = new Error(payload?.error || 'LifeOS assistant request failed.');
    error.requestId = payload?.requestId;
    error.status = response.status;
    error.details = payload?.details;
    error.providerStatus = payload?.details?.providerStatus;
    error.providerMessage = payload?.details?.providerMessage;
    throw error;
  }
  return payload.data;
}
