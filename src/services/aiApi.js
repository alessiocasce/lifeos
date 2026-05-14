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
    throw new Error(payload?.error || 'LifeOS assistant request failed.');
  }
  return payload.data;
}
