import { generateGeminiJson } from './gemini.js';
import { getActionUserId, getSupabaseAdmin } from './supabaseAdmin.js';

const MEMORY_CATEGORIES = new Set([
  'preference',
  'goal',
  'constraint',
  'project',
  'health',
  'workout',
  'productivity',
  'business',
  'identity',
  'behavior',
  'ui_preference',
  'other',
]);
const MEMORY_SOURCES = new Set(['user_explicit', 'assistant_inferred', 'system', 'manual']);
const INSIGHT_TYPES = new Set([
  'daily',
  'weekly',
  'workout',
  'health',
  'project',
  'finance',
  'productivity',
  'pattern',
  'warning',
  'recommendation',
]);
const SIMPLE_ACTION_TYPES = new Set([
  'create_expense',
  'create_calendar_event',
  'create_calendar_events',
  'finite_recurring_calendar_events',
  'create_memo',
  'update_health_log',
]);
const MEMORY_EXTRACTOR_SYSTEM = `
You curate durable memory for the LifeOS personal assistant.
Return strict JSON only:
{
  "memories": [
    {
      "category": "preference",
      "title": "Prefers direct advice",
      "content": "User prefers direct, practical advice.",
      "source": "user_explicit",
      "confidence": 0.95,
      "importance": 4
    }
  ],
  "insights": [
    {
      "insight_type": "productivity",
      "title": "Execution focus",
      "content": "User is concerned about replacing output with tool-building.",
      "confidence": 0.75,
      "evidence": []
    }
  ]
}
Rules:
- Store only durable, useful preferences, goals, constraints, projects, identity, recurring behavior, or meaningful patterns.
- Do not store one-off logs, temporary appointments, today's habits, expenses, raw troubleshooting details, secrets, tokens, passwords, API keys, or credentials.
- Do not store medical diagnoses unless the user explicitly states them and they are durably useful.
- Do not invent facts.
- Use source user_explicit only when the user directly stated the fact. Use assistant_inferred for cautious inferences.
- Inferences must have lower confidence than explicit facts.
- Keep titles under 80 characters and content under 400 characters.
- Return at most 3 memories and 2 insights.
- If nothing durable is present, return empty arrays.
`;

export async function beginBrainChat({ threadId, source, message, requestId }) {
  if (source !== 'app') return null;
  const client = getSupabaseAdmin();
  const userId = getActionUserId();
  let thread = null;

  if (isUuid(threadId)) {
    const result = await client
      .from('ai_chat_threads')
      .select('id, title, status, metadata, created_at, updated_at, last_message_at')
      .eq('id', threadId)
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();
    if (result.error) throw result.error;
    thread = result.data;
  }

  if (!thread && !threadId) {
    const result = await client
      .from('ai_chat_threads')
      .select('id, title, status, metadata, created_at, updated_at, last_message_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (result.error) throw result.error;
    thread = result.data;
  }

  if (!thread) {
    const result = await client
      .from('ai_chat_threads')
      .insert({
        user_id: userId,
        title: generateThreadTitle(message),
        status: 'active',
        metadata: { created_by: 'brain_chat' },
      })
      .select('id, title, status, metadata, created_at, updated_at, last_message_at')
      .single();
    if (result.error) throw result.error;
    thread = result.data;
  } else if (!thread.title || thread.title === 'New Chat') {
    const result = await client
      .from('ai_chat_threads')
      .update({ title: generateThreadTitle(message) })
      .eq('id', thread.id)
      .eq('user_id', userId)
      .select('id, title, status, metadata, created_at, updated_at, last_message_at')
      .single();
    if (result.error) throw result.error;
    thread = result.data;
  }

  const historyResult = await client
    .from('ai_chat_messages')
    .select('id, role, content, created_at')
    .eq('thread_id', thread.id)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(24);
  if (historyResult.error) throw historyResult.error;
  const conversationHistory = (historyResult.data ?? []).reverse();

  const now = new Date().toISOString();
  const messageResult = await client
    .from('ai_chat_messages')
    .insert({
      user_id: userId,
      thread_id: thread.id,
      role: 'user',
      content: String(message).trim(),
      request_id: uuidOrNull(requestId),
      metadata: { source: 'app' },
    })
    .select('id, thread_id, role, content, request_id, action_type, metadata, created_at')
    .single();
  if (messageResult.error) throw messageResult.error;

  const updateResult = await client
    .from('ai_chat_threads')
    .update({ last_message_at: now })
    .eq('id', thread.id)
    .eq('user_id', userId);
  if (updateResult.error) throw updateResult.error;

  return {
    thread: { ...thread, last_message_at: now },
    userMessage: messageResult.data,
    conversationHistory,
    assistantPersisted: false,
  };
}

export async function persistBrainAssistantMessage({ chat, answer, requestId, actionType, actions, plan, recordRefs }) {
  if (!chat?.thread?.id || !answer || chat.assistantPersisted) return null;
  const client = getSupabaseAdmin();
  const userId = getActionUserId();
  const now = new Date().toISOString();
  const result = await client
    .from('ai_chat_messages')
    .insert({
      user_id: userId,
      thread_id: chat.thread.id,
      role: 'assistant',
      content: String(answer).trim(),
      request_id: uuidOrNull(requestId),
      action_type: actionType || null,
      metadata: {
        planner_intent: plan?.intent ?? null,
        action_count: countActions(actions),
        record_refs: Array.isArray(recordRefs) ? recordRefs.slice(0, 80) : [],
        source_path: findActionSourcePath(actions),
      },
    })
    .select('id, thread_id, role, content, request_id, action_type, metadata, created_at')
    .single();
  if (result.error) throw result.error;

  const updateResult = await client
    .from('ai_chat_threads')
    .update({ last_message_at: now })
    .eq('id', chat.thread.id)
    .eq('user_id', userId);
  if (updateResult.error) throw updateResult.error;
  chat.assistantPersisted = true;
  return result.data;
}

export async function persistBrainErrorMessage({ chat, error, requestId }) {
  if (!chat?.thread?.id || chat.assistantPersisted) return null;
  const status = Number(error?.status ?? 500);
  const content = status >= 500
    ? 'LifeOS Brain could not complete that request. Try again shortly.'
    : String(error?.message || 'LifeOS Brain could not complete that request.').slice(0, 500);
  return persistBrainAssistantMessage({
    chat,
    answer: content,
    requestId,
    actionType: 'error',
    actions: [],
    plan: null,
    recordRefs: [],
  });
}

export async function loadBrainContext({ memoryLimit = 30, insightLimit = 8 } = {}) {
  const client = getSupabaseAdmin();
  const userId = getActionUserId();
  const [memoryResult, insightResult] = await Promise.all([
    client
      .from('ai_memories')
      .select('id, category, title, content, source, confidence, importance, last_seen_at, updated_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('importance', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(memoryLimit),
    client
      .from('ai_insights')
      .select('id, insight_type, title, content, evidence, confidence, created_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(insightLimit),
  ]);
  if (memoryResult.error) throw memoryResult.error;
  if (insightResult.error) throw insightResult.error;
  return {
    memories: memoryResult.data ?? [],
    insights: insightResult.data ?? [],
  };
}

export function formatBrainContextForPrompt(brainContext) {
  const memories = Array.isArray(brainContext?.memories) ? brainContext.memories : [];
  const insights = Array.isArray(brainContext?.insights) ? brainContext.insights : [];
  if (!memories.length && !insights.length) return 'No saved user memories or insights are available.';

  const lines = [
    'User Memory Context:',
    ...memories.map((memory) => `- [${memory.category}] ${memory.content}`),
  ];
  if (insights.length) {
    lines.push('Recent Brain Insights:');
    lines.push(...insights.map((insight) => `- [${insight.insight_type}] ${insight.content}`));
  }
  lines.push('Treat these as helpful context, not absolute truth. Prefer the current user message when it conflicts.');
  return lines.join('\n');
}

export function formatBrainConversationForPrompt(chat) {
  const history = Array.isArray(chat?.conversationHistory) ? chat.conversationHistory : [];
  if (!history.length) return 'No earlier messages in this conversation.';
  return [
    'Recent Conversation Context:',
    ...history.map((message) => `${String(message.role || 'user').toUpperCase()}: ${cleanText(message.content, 1200)}`),
    'The current user message is authoritative when it conflicts with earlier conversation.',
  ].join('\n');
}

export function shouldExtractMemory(userMessage, assistantAnswer, actionType) {
  const message = String(userMessage ?? '').trim();
  const answer = String(assistantAnswer ?? '').trim();
  if (message.length < 12 || containsSecretLikeText(message)) return false;
  if (/\bremember that\b|\bremember this\b|\bricorda che\b|\bprefer\b|\bpreferisco\b|\bi (?:like|love|hate|dislike)\b|\bmy goal\b|\bil mio obiettivo\b/i.test(message)) {
    return true;
  }
  if (SIMPLE_ACTION_TYPES.has(actionType)) return false;
  const durableLanguage = /\b(long[- ]term|building|business|saas|project|goal|constraint|always|usually|often|struggle|pattern|prefer|dislike|training seriously|progressive overload|interfac|workflow|productivity)\b/i.test(message);
  const meaningfulAnalysis = message.length >= 80 && answer.length >= 180 && /\b(analy[sz]e|advice|strategy|improve|why|pattern|coach|consigli|analizza|strategia|migliorare)\b/i.test(message);
  return durableLanguage || meaningfulAnalysis;
}

export async function extractAndPersistBrainKnowledge({ userMessage, assistantAnswer, actionType, existingMemories = [] }) {
  if (!shouldExtractMemory(userMessage, assistantAnswer, actionType)) return { memories: [], insights: [] };
  const explicit = explicitMemoryFallback(userMessage);
  let extracted;
  if (explicit) {
    extracted = { memories: [explicit], insights: [] };
  } else {
    const prompt = JSON.stringify({
      userMessage: String(userMessage).slice(0, 3000),
      assistantAnswer: String(assistantAnswer).slice(0, 5000),
      existingMemories: existingMemories.slice(0, 30).map((memory) => ({
        category: memory.category,
        title: memory.title,
        content: memory.content,
      })),
    });
    extracted = await generateGeminiJson({
      system: MEMORY_EXTRACTOR_SYSTEM,
      prompt,
      temperature: 0,
      invalidMessage: 'Gemini returned invalid memory candidates.',
      repair: true,
    });
  }

  const client = getSupabaseAdmin();
  const userId = getActionUserId();
  const currentMemories = existingMemories.length
    ? existingMemories
    : (await loadBrainContext({ memoryLimit: 100, insightLimit: 1 })).memories;
  const savedMemories = [];
  for (const rawCandidate of Array.isArray(extracted?.memories) ? extracted.memories.slice(0, 3) : []) {
    const candidate = normalizeMemoryCandidate(rawCandidate);
    if (!candidate) continue;
    const existing = findSimilarMemory(currentMemories, candidate);
    if (existing) {
      const result = await client
        .from('ai_memories')
        .update({
          content: candidate.content,
          confidence: Math.max(Number(existing.confidence ?? 0), candidate.confidence),
          importance: Math.max(Number(existing.importance ?? 1), candidate.importance),
          last_seen_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .eq('user_id', userId)
        .select('id, category, title, content, source, confidence, importance, status, last_seen_at, metadata, created_at, updated_at')
        .single();
      if (result.error) throw result.error;
      savedMemories.push(result.data);
      continue;
    }

    const result = await client
      .from('ai_memories')
      .insert({
        user_id: userId,
        ...candidate,
        status: 'active',
        last_seen_at: new Date().toISOString(),
        metadata: { extracted_by: 'brain_v1' },
      })
      .select('id, category, title, content, source, confidence, importance, status, last_seen_at, metadata, created_at, updated_at')
      .single();
    if (result.error) throw result.error;
    savedMemories.push(result.data);
    currentMemories.push(result.data);
  }

  const savedInsights = [];
  for (const rawInsight of Array.isArray(extracted?.insights) ? extracted.insights.slice(0, 2) : []) {
    const insight = normalizeInsightCandidate(rawInsight);
    if (!insight) continue;
    const duplicate = await client
      .from('ai_insights')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .eq('title', insight.title)
      .maybeSingle();
    if (duplicate.error) throw duplicate.error;
    if (duplicate.data) continue;
    const result = await client
      .from('ai_insights')
      .insert({
        user_id: userId,
        ...insight,
        status: 'active',
      })
      .select('id, insight_type, title, content, evidence, confidence, status, created_at, updated_at')
      .single();
    if (result.error) throw result.error;
    savedInsights.push(result.data);
  }
  return { memories: savedMemories, insights: savedInsights };
}

export function generateThreadTitle(message) {
  const cleaned = String(message ?? '')
    .replace(/^\s*(?:please|can you|could you|would you|i want you to|remember that)\s+/i, '')
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = cleaned.split(' ').filter(Boolean).slice(0, 7);
  if (!words.length) return 'New Chat';
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ').slice(0, 80);
}

function normalizeMemoryCandidate(candidate) {
  const category = MEMORY_CATEGORIES.has(candidate?.category) ? candidate.category : 'other';
  const title = cleanText(candidate?.title, 80);
  const content = cleanText(candidate?.content, 400);
  if (!title || !content || containsSecretLikeText(content)) return null;
  return {
    category,
    title,
    content,
    source: MEMORY_SOURCES.has(candidate?.source) ? candidate.source : 'assistant_inferred',
    confidence: clampNumber(candidate?.confidence, 0, 1, 0.7),
    importance: Math.round(clampNumber(candidate?.importance, 1, 5, 3)),
  };
}

function normalizeInsightCandidate(candidate) {
  const title = cleanText(candidate?.title, 100);
  const content = cleanText(candidate?.content, 600);
  if (!title || !content || containsSecretLikeText(content)) return null;
  return {
    insight_type: INSIGHT_TYPES.has(candidate?.insight_type) ? candidate.insight_type : 'pattern',
    title,
    content,
    evidence: Array.isArray(candidate?.evidence) ? candidate.evidence.slice(0, 10) : [],
    confidence: clampNumber(candidate?.confidence, 0, 1, 0.7),
  };
}

function explicitMemoryFallback(message) {
  const match = String(message ?? '').match(/\b(?:remember that|remember this|ricorda che)\s+(.+)/i);
  if (!match?.[1]) return null;
  const content = cleanText(match[1], 400);
  if (!content || containsSecretLikeText(content)) return null;
  return {
    category: 'other',
    title: generateThreadTitle(content),
    content,
    source: 'user_explicit',
    confidence: 0.98,
    importance: 4,
  };
}

function findSimilarMemory(existingMemories, candidate) {
  const normalizedTitle = normalizeText(candidate.title);
  const candidateTerms = keyTerms(`${candidate.title} ${candidate.content}`);
  return existingMemories.find((memory) => {
    if (normalizeText(memory.title) === normalizedTitle) return true;
    if (memory.category !== candidate.category) return false;
    const existingTerms = keyTerms(`${memory.title} ${memory.content}`);
    const shared = candidateTerms.filter((term) => existingTerms.includes(term)).length;
    return shared >= 3 && shared / Math.max(1, Math.min(candidateTerms.length, existingTerms.length)) >= 0.5;
  });
}

function countActions(actions) {
  return (Array.isArray(actions) ? actions : []).reduce((count, action) => {
    if (Array.isArray(action?.data?.created)) return count + action.data.created.length;
    return String(action?.type ?? '').startsWith('blocked') ? count : count + 1;
  }, 0);
}

function findActionSourcePath(actions) {
  for (const action of Array.isArray(actions) ? actions : []) {
    if (action?.data?.sourcePath) return String(action.data.sourcePath).slice(0, 80);
  }
  return null;
}

function containsSecretLikeText(value) {
  return /\b(password|passcode|api key|secret key|bearer token|access token|service role|private key)\b/i.test(String(value ?? ''));
}

function keyTerms(value) {
  return [...new Set(normalizeText(value).split(' ').filter((term) => term.length >= 4))].slice(0, 30);
}

function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanText(value, maxLength) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, maxLength) : '';
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback;
}

function uuidOrNull(value) {
  return isUuid(value) ? value : null;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? ''));
}
