import crypto from 'node:crypto';
import { addDays, TIME_ZONE } from './date.js';
import { getActionUserId, getSupabaseAdmin } from './supabaseAdmin.js';

export const MEMORY_KINDS = Object.freeze(['semantic_fact', 'episode', 'decision', 'project_memory', 'goal', 'constraint']);
const KINDS = new Set(MEMORY_KINDS);
const CATEGORIES = new Set(['preference', 'goal', 'constraint', 'project', 'health', 'workout', 'productivity', 'business', 'identity', 'behavior', 'ui_preference', 'other']);
const SOURCES = new Set(['user_explicit', 'assistant_inferred', 'manual']);
const SECRET = /\b(?:api[_ -]?key|bearer|password|passphrase|private[_ -]?key|secret|access[_ -]?token|refresh[_ -]?token|service[_ -]?role|credential)\b/i;
const DAILY_NOISE = /^(?:thanks|thank you|grazie|lol|ok|okay|done|fatto|s[iì]|yes|no|i took creatine|ho preso (?:la )?creatina)[.! ]*$/i;
const ROUTINE_LOG = /\b(?:i (?:took creatine|showered|did skincare)|ho preso (?:la )?creatina|ho fatto (?:la )?doccia|doccia fatta|creatina presa|skincare fatta)\b/i;
const MAX_RETRIEVAL_ROWS = 240;
const MAX_CONTEXT_ITEMS = 8;

export function normalizeAutobiographicalCandidate(input, { capturedAt = new Date(), userMessage = '', source = null } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  if (input.memory_kind && !KINDS.has(input.memory_kind)) return null;
  const memoryKind = input.memory_kind || 'semantic_fact';
  const memorySource = source || input.source || 'assistant_inferred';
  const title = boundedText(input.title, 80);
  const content = boundedText(input.content, 400);
  const category = boundedText(input.category, 40)?.toLowerCase();
  if (!title || !content || !CATEGORIES.has(category) || !SOURCES.has(memorySource) || SECRET.test(`${title} ${content}`)) return null;
  if (DAILY_NOISE.test(content) || DAILY_NOISE.test(userMessage) || ROUTINE_LOG.test(content)) return null;
  if (userMessage && !relevantTerms(content).some((term) => relevantTerms(userMessage).includes(term))) return null;
  if (memorySource === 'assistant_inferred' && /^(?:health|medical|diagnosis)$/i.test(category)) return null;
  const confidence = Number(input.confidence ?? (memorySource === 'assistant_inferred' ? 0.7 : 0.95));
  const importance = Number(input.importance ?? 3);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1 || !Number.isInteger(importance) || importance < 1 || importance > 5) return null;
  const projectId = uuid(input.project_id) ? input.project_id : null;
  const projectName = boundedText(input.project_name, 120);
  if (input.project_id && !projectId) return null;
  if (memoryKind === 'project_memory' && !projectId && !projectName) return null;
  const subjectKey = normalizeSubjectKey(input.subject_key, memoryKind, category, title);
  if (input.subject_key && !subjectKey) return null;
  const time = normalizeMemoryTime(input, { capturedAt, userMessage });
  if (!time) return null;
  return {
    memory_kind: memoryKind, category, title, content, source: memorySource,
    confidence, importance, subject_key: subjectKey, project_id: projectId,
    project_name: projectName, ...time,
  };
}

export async function curateAutobiographicalMemory({
  candidate, userId = getActionUserId(), client = getSupabaseAdmin(),
  capturedAt = new Date(), userMessage = '', provenance = {},
} = {}) {
  const normalized = normalizeAutobiographicalCandidate(candidate, { capturedAt, userMessage });
  if (!normalized) return { status: 'rejected', reason: 'invalid_or_low_value' };
  const project = await groundMemoryProject(normalized, { userId, client });
  if (project.status === 'rejected') return project;
  const projectId = project.project_id;
  const safeProvenance = normalizeMemoryProvenance(provenance, capturedAt, normalized.temporal_precision);
  const dedupeKey = crypto.createHash('sha256').update(JSON.stringify([
    userId, normalized.memory_kind, projectId, normalized.subject_key,
    normalized.content.toLocaleLowerCase().replace(/\s+/g, ' ').trim(),
    normalized.memory_kind === 'episode' ? normalized.occurred_at || normalized.occurred_on : null,
  ])).digest('hex');
  const stored = await client.rpc('curate_autobiographical_memory', {
    p_user_id: userId,
    p_memory_kind: normalized.memory_kind,
    p_category: normalized.category,
    p_title: normalized.title,
    p_content: normalized.content,
    p_source: normalized.source,
    p_confidence: normalized.confidence,
    p_importance: normalized.importance,
    p_subject_key: normalized.subject_key,
    p_project_id: projectId,
    p_occurred_at: normalized.occurred_at,
    p_occurred_on: normalized.occurred_on,
    p_effective_from: normalized.effective_from,
    p_provenance: safeProvenance,
    p_dedupe_key: dedupeKey,
  });
  if (stored.error) throw new Error('Autobiographical memory could not be saved.');
  const row = Array.isArray(stored.data) ? stored.data[0] : stored.data;
  if (!row) throw new Error('Autobiographical memory returned no result.');
  return {
    status: row.dedupe_key === dedupeKey && row.status === 'active' ? (row.supersedes_id ? 'superseded' : 'saved') : 'rejected',
    reason: row.status === 'archived' ? 'historical_memory_not_reactivated'
      : row.dedupe_key === dedupeKey ? null : 'stronger_explicit_memory_exists',
    memory: row,
  };
}

export async function searchAutobiographicalMemory({
  userId = getActionUserId(), client = getSupabaseAdmin(), query = '',
  kind = null, projectId = null, limit = MAX_CONTEXT_ITEMS, includeHistorical = false,
} = {}) {
  const max = Math.min(Math.max(Number(limit) || MAX_CONTEXT_ITEMS, 1), 20);
  const terms = relevantTerms(String(query || '').slice(0, 240)).slice(0, 16);
  let request = client.from('ai_memories').select('id, category, title, content, source, confidence, importance, status, memory_kind, subject_key, project_id, occurred_at, occurred_on, effective_from, effective_until, provenance, last_seen_at, last_confirmed_at, created_at, updated_at')
    .eq('user_id', userId).order('updated_at', { ascending: false }).limit(MAX_RETRIEVAL_ROWS);
  if (!includeHistorical) request = request.eq('status', 'active');
  if (kind) {
    if (!KINDS.has(kind)) return { memories: [], returned_count: 0, limit: max };
    request = request.eq('memory_kind', kind);
  }
  if (projectId) {
    if (!uuid(projectId)) return { memories: [], returned_count: 0, limit: max };
    request = request.eq('project_id', projectId);
  }
  const result = await request;
  if (result.error) throw result.error;
  const ranked = (result.data || []).filter((row) => !SECRET.test(`${row.title || ''} ${row.content || ''}`))
    .map((row) => ({ row, score: scoreMemory(row, terms, projectId) }))
    .filter((item) => !terms.length || item.score > 0)
    .sort((a, b) => b.score - a.score || Date.parse(b.row.updated_at) - Date.parse(a.row.updated_at))
    .slice(0, max)
    .map(({ row }) => serializeAutobiographicalMemory(row));
  return { memories: ranked, returned_count: ranked.length, limit: max };
}

export function serializeAutobiographicalMemory(row, { now = new Date() } = {}) {
  const age = new Date(now).getTime() - Date.parse(row.last_confirmed_at || row.last_seen_at || row.updated_at || row.created_at);
  const temporalStatus = row.status === 'archived' ? 'historical'
    : !Number.isFinite(age) ? 'needs_review'
      : age > 365 * 86400000 ? 'stale' : 'fresh';
  return {
    id: row.id, kind: row.memory_kind || 'semantic_fact', category: row.category,
    status: row.status,
    title: row.title, content: row.content, source: row.source,
    confidence: Number(row.confidence), importance: Number(row.importance),
    subject_key: row.subject_key || null, project_id: row.project_id || null,
    occurred_at: row.occurred_at || null, occurred_on: row.occurred_on || null,
    effective_from: row.effective_from || null, effective_until: row.effective_until || null,
    temporal_status: temporalStatus,
    updated_at: row.updated_at,
    provenance: {
      source_system: row.provenance?.source_system || null,
      channel: row.provenance?.channel || null,
      last_seen_channel: row.provenance?.last_seen_source?.channel || row.provenance?.channel || null,
      captured_at: row.provenance?.captured_at || null,
      temporal_precision: row.provenance?.temporal_precision || null,
    },
  };
}

export function formatAutobiographicalContext(memories = [], { maxItems = MAX_CONTEXT_ITEMS, maxChars = 2200 } = {}) {
  const lines = [];
  let used = 0;
  for (const item of memories.slice(0, maxItems)) {
    const line = `[${item.temporal_status || 'historical'} ${item.kind || item.memory_kind || 'semantic_fact'}] ${boundedText(item.content, 300)}`;
    if (used + line.length > maxChars) break;
    lines.push(line);
    used += line.length;
  }
  return lines.join('\n');
}

export function rankAutobiographicalInsights(insights = [], query = '', limit = 4) {
  const terms = relevantTerms(query).slice(0, 16);
  return insights.map((insight) => ({ insight, score: terms.filter((term) => relevantTerms(`${insight.title || ''} ${insight.content || ''}`).includes(term)).length }))
    .filter((item) => !terms.length || item.score > 0)
    .sort((a, b) => b.score - a.score || Date.parse(b.insight.created_at) - Date.parse(a.insight.created_at))
    .slice(0, Math.min(Math.max(Number(limit) || 4, 1), 8))
    .map((item) => item.insight);
}

async function groundMemoryProject(candidate, { userId, client }) {
  if (!candidate.project_id && !candidate.project_name) return { project_id: null };
  const result = await client.from('projects').select('id, name').eq('user_id', userId).limit(300);
  if (result.error) throw new Error('Project grounding is temporarily unavailable.');
  const normalize = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  const matches = (result.data || []).filter((row) => candidate.project_id
    ? row.id === candidate.project_id && (!candidate.project_name || normalize(row.name) === normalize(candidate.project_name))
    : normalize(row.name) === normalize(candidate.project_name));
  return matches.length === 1 ? { project_id: matches[0].id } : { status: 'rejected', reason: matches.length ? 'ambiguous_project' : 'unknown_project' };
}

function normalizeMemoryTime(input, { capturedAt, userMessage }) {
  const captured = new Date(capturedAt);
  if (Number.isNaN(captured.getTime())) return null;
  const text = String(userMessage || '');
  const yesterday = /\b(?:yesterday|ieri)\b/i.test(text);
  const lastWeek = /\b(?:last week|la settimana scorsa)\b/i.test(text);
  const explicitTime = /\b(?:alle|at)\s+\d{1,2}[:.]\d{2}\b/i.test(text);
  let occurredAt = optionalPastIso(input.occurred_at, captured);
  let occurredOn = validDateOnly(input.occurred_on) ? input.occurred_on : null;
  if (input.occurred_on && !occurredOn) return null;
  if (occurredOn && occurredOn > dateInTimeZone(captured, TIME_ZONE)) return null;
  let precision = occurredAt ? 'instant' : occurredOn ? 'day' : 'unknown';
  if (yesterday) {
    occurredOn = addDays(dateInTimeZone(captured, TIME_ZONE), -1);
    if (occurredAt && dateInTimeZone(new Date(occurredAt), TIME_ZONE) !== occurredOn) occurredAt = null;
    if (!explicitTime) occurredAt = null;
    precision = explicitTime && occurredAt ? 'instant' : 'day';
  } else if (lastWeek) {
    occurredAt = null;
    occurredOn = null;
    precision = 'week';
  }
  if (input.occurred_at && !occurredAt && !yesterday && !lastWeek) return null;
  const effectiveFrom = optionalPastIso(input.effective_from, captured);
  if (input.effective_from && !effectiveFrom) return null;
  return { occurred_at: occurredAt, occurred_on: occurredOn, effective_from: effectiveFrom || captured.toISOString(), temporal_precision: precision };
}

function normalizeMemoryProvenance(input, capturedAt, temporalPrecision) {
  const captured = new Date(capturedAt).toISOString();
  const safe = {};
  for (const [key, max] of [['source_system', 40], ['channel', 24], ['reference', 120], ['evidence_summary', 180]]) {
    const value = boundedText(input?.[key], max);
    if (value && !SECRET.test(value)) safe[key] = value;
  }
  return { ...safe, captured_at: captured, temporal_precision: temporalPrecision };
}

function scoreMemory(row, terms, projectId) {
  let score = 0;
  const title = relevantTerms(row.title);
  const content = relevantTerms(row.content);
  for (const term of terms) score += (title.includes(term) ? 6 : 0) + (content.includes(term) ? 2 : 0);
  if (projectId && row.project_id === projectId) score += 12;
  if (!terms.length) score += Number(row.importance || 1) * 2;
  if (row.source === 'user_explicit') score += 1;
  if (row.status === 'archived') score -= 4;
  return score;
}

function relevantTerms(value) {
  const stop = new Set(['the', 'and', 'for', 'what', 'when', 'with', 'about', 'that', 'this', 'have', 'does', 'come', 'per', 'che', 'del', 'non', 'con', 'sono', 'cosa', 'come', 'della', 'delle', 'quale', 'quali', 'perche']);
  return [...new Set(String(value || '').toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9]{3,}/g) || [])].filter((term) => !stop.has(term));
}

function normalizeSubjectKey(value, kind, category, title) {
  if (value != null && value !== '') {
    const key = String(value).trim().toLowerCase();
    return /^[a-z][a-z0-9_.:-]{2,179}$/.test(key) ? key : null;
  }
  if (kind === 'episode' || kind === 'decision') return null;
  if (category === 'identity' && /\bname\b|\bnome\b/i.test(title)) return 'identity.preferred_name';
  return null;
}

function boundedText(value, max) {
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/\s+/g, ' ');
  return text && text.length <= max && !/[\u0000-\u001f\u007f]/.test(text) ? text : null;
}

function optionalPastIso(value, capturedAt) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed <= capturedAt.getTime() + 5 * 60000 ? new Date(parsed).toISOString() : null;
}

function dateInTimeZone(date, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function uuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function validDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
