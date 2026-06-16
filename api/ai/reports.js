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
import {
  archiveVaultDocument,
  createVaultDocument,
  createVaultDocumentFromMessage,
  getVaultDocument,
  listVaultDocuments,
  reembedVaultChunks,
  updateVaultDocument,
} from '../_utils/brainVault.js';

export default async function handler(req, res) {
  const context = createRequestContext(req, res);
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  try {
    if (handleOptions(req, res)) return;
    await requireBrainReportsAccess(req);

    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const id = url.searchParams.get('id');
      if (id) {
        const document = await getVaultDocument({ id });
        return sendSuccess(res, 200, { document }, context);
      }
      const documents = await listVaultDocuments({
        limit: url.searchParams.get('limit') ?? 20,
        documentType: url.searchParams.get('type'),
        status: url.searchParams.get('status') || 'active',
      });
      return sendSuccess(res, 200, { documents }, context);
    }

    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed. Use GET or POST.');
    const body = await readJsonBody(req);
    const action = String(body.action ?? 'create').trim().toLowerCase();

    if (action === 'save_message' || action === 'save-message') {
      const document = await createVaultDocumentFromMessage({
        sourceMessageId: body.source_message_id ?? body.sourceMessageId,
        contentMd: body.content_md ?? body.contentMd,
        title: body.title,
        documentType: body.document_type ?? body.documentType ?? 'brain_answer',
        tags: body.tags,
        entities: body.entities,
        metadata: body.metadata,
      });
      return sendSuccess(res, 201, { document }, context);
    }

    if (action === 'archive') {
      const document = await archiveVaultDocument({ id: body.id });
      return sendSuccess(res, 200, { document }, context);
    }

    if (action === 'update') {
      const document = await updateVaultDocument({ id: body.id, patch: body.patch ?? body });
      return sendSuccess(res, 200, { document }, context);
    }

    if (action === 'reembed') {
      const result = await reembedVaultChunks({
        limit: body.limit,
        statuses: body.statuses,
        includeWrongModel: body.includeWrongModel,
      });
      return sendSuccess(res, 200, { result }, context);
    }

    if (action !== 'create') throw new HttpError(400, 'Unsupported reports action.');
    const document = await createVaultDocument({
      title: body.title,
      documentType: body.document_type ?? body.documentType,
      sourceType: body.source_type ?? body.sourceType,
      sourceRef: body.source_ref ?? body.sourceRef,
      contentMd: body.content_md ?? body.contentMd,
      summary: body.summary,
      tags: body.tags,
      entities: body.entities,
      metadata: body.metadata,
    });
    return sendSuccess(res, 201, { document }, context);
  } catch (error) {
    handleApiError(res, error, context);
  }
}

async function requireBrainReportsAccess(req) {
  const token = getBearerToken(req);
  if (!token) throw new HttpError(401, 'Unauthorized.');

  if (matchesSecret(token, process.env.LIFEOS_ACTION_TOKEN)) {
    getActionUserId();
    return { type: 'action-token' };
  }

  const user = await requireConfiguredUserAccess(token);
  return { type: 'supabase-session', user };
}
