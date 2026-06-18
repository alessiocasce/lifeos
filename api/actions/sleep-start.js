import {
  createRequestContext,
  handleApiError,
  handleOptions,
  readJsonBody,
  requireActionAuth,
  requirePost,
  sendSuccess,
} from '../_utils/http.js';
import { logSleepStart, readSleepStartLoggedOn, readSleepStartTime, resolveSleepStartLoggedOn } from '../_utils/healthActions.js';
import { optionalText } from '../_utils/validation.js';

export default async function handler(req, res) {
  const context = createRequestContext(req, res);
  try {
    if (handleOptions(req, res)) return;
    requirePost(req);
    requireActionAuth(req);

    const body = await readJsonBody(req);
    const sleepStart = readSleepStartTime(body);
    const loggedOn = readSleepStartLoggedOn(body, sleepStart);
    const notes = optionalText(body.notes, 'notes', { max: 1000 });
    const result = await logSleepStart({ time: sleepStart, loggedOn, notes });
    sendSuccess(res, 200, result, context);
  } catch (error) {
    handleApiError(res, error, context);
  }
}

export { resolveSleepStartLoggedOn };
