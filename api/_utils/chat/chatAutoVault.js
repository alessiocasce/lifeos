import { AUTO_SAVE_SKILLS } from './chatShared.js';
import { createVaultDocument } from '../brainVault.js';
import { getActionUserId, getSupabaseAdmin } from '../supabaseAdmin.js';
import { localDate } from '../lifeosTools.js';

export async function safeAutoSaveBrainReport({ context, assistantMessage, answer, actions, selectedSkill, brainRoute, workingContext, userMessage }) {
  try {
    if (!shouldAutoSaveBrainReport({ assistantMessage, answer, actions, selectedSkill, brainRoute })) {
      return { saved: false, reason: 'not_eligible' };
    }
    const userId = getActionUserId();
    const duplicate = await getSupabaseAdmin()
      .from('ai_vault_documents')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .contains('metadata', { source_message_id: assistantMessage.id })
      .maybeSingle();
    if (duplicate.error) throw duplicate.error;
    if (duplicate.data?.id) return { saved: false, reason: 'duplicate', document_id: duplicate.data.id };

    const skillId = selectedSkill?.id || selectedSkill?.skill?.id || brainRoute?.primary_skill || 'brain';
    const documentType = autoVaultDocumentType(skillId);
    const title = autoVaultTitle({ skillId, userMessage, answer });
    const document = await createVaultDocument({
      userId,
      title,
      documentType,
      sourceType: 'brain',
      sourceRef: {
        thread_id: context?.brainChat?.thread?.id ?? null,
        message_id: assistantMessage.id,
      },
      contentMd: String(answer ?? '').trim(),
      tags: autoVaultTags({ skillId, documentType, brainRoute, userMessage, answer }),
      metadata: {
        created_by: 'brain_auto_save',
        auto_saved: true,
        source_thread_id: context?.brainChat?.thread?.id ?? null,
        source_message_id: assistantMessage.id,
        client_request_id: context?.clientRequestId ?? null,
        selected_skill: selectedSkill ?? null,
        brain_route: brainRoute ?? null,
        working_context: compactAutoSaveWorkingContext(workingContext),
      },
    });
    console.info('[LifeOS Brain Vault auto-save]', JSON.stringify({
      requestId: context?.requestId,
      documentId: document?.id,
      documentType,
      skillId,
    }));
    return { saved: true, reason: 'saved', document_id: document?.id ?? null, document_type: documentType };
  } catch (error) {
    console.error('[LifeOS Brain Vault auto-save warning]', JSON.stringify({
      requestId: context?.requestId,
      stage: 'vault_auto_save',
      error: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
    }));
    return { saved: false, reason: 'error', error_code: error instanceof Error ? error.message : String(error ?? 'Unknown error') };
  }
}

function shouldAutoSaveBrainReport({ assistantMessage, answer, actions, selectedSkill, brainRoute }) {
  if (!assistantMessage?.id) return false;
  const content = String(answer ?? '').trim();
  if (content.length < 600) return false;
  if (Array.isArray(actions) && actions.some((action) => action?.type && !String(action.type).startsWith('blocked'))) return false;
  const skillId = selectedSkill?.id || selectedSkill?.skill?.id || brainRoute?.primary_skill || '';
  if (!AUTO_SAVE_SKILLS.has(skillId)) return false;
  const mode = brainRoute?.mode || '';
  if (['casual_chat', 'clarification', 'memory_write', 'memory_recall', 'memory_forget', 'follow_up_transform'].includes(mode)) return false;
  if (mode && !['read_only_analysis'].includes(mode)) return false;
  if (looksLikeShortOperationalReply(content)) return false;
  return true;
}

function autoVaultDocumentType(skillId) {
  if (skillId === 'workout_coach') return 'workout_report';
  if (skillId === 'project_ops_coach') return 'project_report';
  if (skillId === 'finance_analyst') return 'finance_report';
  if (skillId === 'product_builder') return 'product_report';
  if (skillId === 'life_review') return 'life_review';
  if (skillId === 'health_coach') return 'daily_report';
  return 'brain_answer';
}

function autoVaultTitle({ skillId, userMessage, answer }) {
  const date = localDate();
  const text = `${userMessage || ''} ${answer || ''}`.toLowerCase();
  if (skillId === 'workout_coach') {
    if (/\b(back|schiena|pull|pulley|row)\b/.test(text)) return `Back Day Review - ${date}`;
    if (/\b(chest|petto|push|bench|panca)\b/.test(text)) return `Push Workout Review - ${date}`;
    if (/\b(legs?|gambe|squat|leg press)\b/.test(text)) return `Leg Day Review - ${date}`;
    return `Workout Analysis - ${date}`;
  }
  if (skillId === 'health_coach') {
    if (/\b(sleep|sonno|recovery|recupero)\b/.test(text)) return `Sleep & Recovery Review - ${date}`;
    return `Health Review - ${date}`;
  }
  if (skillId === 'project_ops_coach') {
    if (/\b(ai ofm|ofm)\b/.test(text)) return `AI OFM Project Review - ${date}`;
    return `Ops Review - ${date}`;
  }
  if (skillId === 'finance_analyst') return `Finance Review - ${date}`;
  if (skillId === 'product_builder') return `LifeOS Product Strategy - ${date}`;
  if (skillId === 'life_review') return `Life Review - ${date}`;
  return `Brain Report - ${date}`;
}

function autoVaultTags({ skillId, documentType, brainRoute, userMessage, answer }) {
  const tags = new Set([documentType, skillId, brainRoute?.mode].filter(Boolean));
  const text = `${userMessage || ''} ${answer || ''}`.toLowerCase();
  const pairs = [
    ['workout', /\b(workout|allenamento|training|palestra)\b/],
    ['back', /\b(back|schiena|pulley|row)\b/],
    ['chest', /\b(chest|petto|bench|panca)\b/],
    ['sleep', /\b(sleep|sonno|wake|sveglia)\b/],
    ['recovery', /\b(recovery|recupero|fatigue|fatica)\b/],
    ['lifeos', /\b(lifeos|brain|vault)\b/],
    ['product', /\b(product|saas|roadmap|ux|ui)\b/],
    ['ai-ofm', /\b(ai ofm|ofm)\b/],
    ['ops', /\b(ops|project|progetto|deep work)\b/],
    ['finance', /\b(finance|expense|spese|soldi|money)\b/],
  ];
  pairs.forEach(([tag, pattern]) => {
    if (pattern.test(text)) tags.add(tag);
  });
  return Array.from(tags).slice(0, 12);
}

function compactAutoSaveWorkingContext(workingContext) {
  if (!workingContext || typeof workingContext !== 'object') return null;
  return {
    language: workingContext.language || null,
    last_subject: workingContext.last_subject
      ? {
          type: workingContext.last_subject.type,
          label: workingContext.last_subject.label,
          date: workingContext.last_subject.date,
          start_time: workingContext.last_subject.start_time,
          end_time: workingContext.last_subject.end_time,
        }
      : null,
    last_action_result: workingContext.last_action_result
      ? {
          action_type: workingContext.last_action_result.action_type,
          status: workingContext.last_action_result.status,
        }
      : null,
  };
}

export function looksLikeShortOperationalReply(content) {
  const text = String(content ?? '').trim().toLowerCase();
  return /^(saved|created|added|updated|done|got it|ok|salvato|creato|aggiunto|fatto|ricevuto)\b/.test(text)
    || /\b(what time|che orario|mi manca|i need|ho bisogno)\b/.test(text.slice(0, 220));
}
