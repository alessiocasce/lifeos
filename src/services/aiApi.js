import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';

export async function sendLifeOSAiMessage(message) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured.');
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in before using the LifeOS assistant.');

  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ message }),
  });

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
