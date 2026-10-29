export async function captureSettingsIdentity(client, expectedUserId) {
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (sessionError || !token) throw new Error('Sign in before loading settings.');
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user || (expectedUserId && data.user.id !== expectedUserId)) {
    throw new Error('Reload settings before saving.');
  }
  // Bind each request to this identity even if the shared auth client switches accounts.
  return { userId: data.user.id, authorize: (query) => query.setHeader('Authorization', `Bearer ${token}`) };
}
