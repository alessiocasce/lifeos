import {
  HttpError,
  createRequestContext,
  getBearerToken,
  handleApiError,
  handleOptions,
  matchesSecret,
  sendSuccess,
} from '../_utils/http.js';
import { getActionUserId, requireConfiguredUserAccess } from '../_utils/supabaseAdmin.js';
import { listAiActionLogs } from '../_utils/lifeosTools.js';

export default async function handler(req, res) {
  const context = createRequestContext(req, res);
  res.setHeader('access-control-allow-methods', 'GET, OPTIONS');
  try {
    if (handleOptions(req, res)) return;
    if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed. Use GET.');
    await requireActionLogAccess(req);

    const url = new URL(req.url, 'http://localhost');
    const logs = await listAiActionLogs({ limit: url.searchParams.get('limit') ?? 10 });
    sendSuccess(res, 200, { logs }, context);
  } catch (error) {
    handleApiError(res, error, context);
  }
}

async function requireActionLogAccess(req) {
  const token = getBearerToken(req);
  if (!token) throw new HttpError(401, 'Unauthorized.');

  if (matchesSecret(token, process.env.LIFEOS_ACTION_TOKEN)) {
    getActionUserId();
    return { type: 'action-token' };
  }

  const user = await requireConfiguredUserAccess(token);
  return { type: 'supabase-session', user };
}
