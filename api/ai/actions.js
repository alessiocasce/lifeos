import {
  HttpError,
  createRequestContext,
  getBearerToken,
  handleApiError,
  handleOptions,
  matchesSecret,
  readJsonBody,
  sendSuccess,
} from '../_utils/http.js';
import { getActionUserId, requireConfiguredUserAccess } from '../_utils/supabaseAdmin.js';
import { listAiActionLogs } from '../_utils/lifeosTools.js';
import { readProjectWatch, mutateCompanionApp } from '../_utils/companionApp.js';
import { loadMonitorPermissions } from '../_utils/brainMonitorPermissions.js';

export function createActionsHandler({ requireUser = requireConfiguredUserAccess, readWatch = readProjectWatch,
  mutate = mutateCompanionApp, permissions = loadMonitorPermissions } = {}) {
  return async function handler(req, res) {
    const context = createRequestContext(req, res);
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    try {
      if (handleOptions(req, res)) return;
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'POST' || url.searchParams.has('view')) {
        if (!['GET', 'POST'].includes(req.method)) throw new HttpError(405, 'Method not allowed.');
        // Unlike legacy action-log reads, app control never accepts automation tokens.
        const token = getBearerToken(req);
        if (!token || matchesSecret(token, process.env.LIFEOS_ACTION_TOKEN)) throw new HttpError(401, 'Sign in to use Companion controls.');
        const user = await requireUser(token);
        let result;
        if (req.method === 'POST') result = await mutate({ userId: user.id, body: await readJsonBody(req) });
        else if (url.searchParams.get('view') === 'project_watch') result = await readWatch({ userId: user.id, projectId: url.searchParams.get('project_id') });
        else if (url.searchParams.get('view') === 'companion_permissions') result = { permissions: await permissions({ userId: user.id }) };
        else throw new HttpError(400, 'Unknown view.');
        res.setHeader('cache-control', 'no-store');
        return sendSuccess(res, 200, result, context);
      }
      if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed. Use GET.');
      await requireActionLogAccess(req);
      const logs = await listAiActionLogs({ limit: url.searchParams.get('limit') ?? 10 });
      sendSuccess(res, 200, { logs }, context);
    } catch (error) {
      handleApiError(res, error, context);
    }
  };
}

export default createActionsHandler();

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
