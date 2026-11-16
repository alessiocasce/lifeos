import { extractExplicitMemoryCommand } from '../brain.js';
import { hasNegativeWriteIntent } from './chatClassification.js';
import {
  isFiniteRecurringCalendarRequest,
  isObviousDayScheduleRequest,
  isObviousExplicitMultiEventCalendarRequest,
  isWorkoutAdviceOnlyRequest,
} from './chatCalendarPlanning.js';
import { isTrueLongTermMemoryRecallRequest } from '../brainTurnArbitration.js';

export function formatMemoryForgetAnswer(result) {
  if (result?.status === 'archived' && result.memory) {
    return `Forgot this memory: ${result.memory.content}`;
  }
  if (result?.status === 'multiple' && Array.isArray(result.matches) && result.matches.length) {
    const options = result.matches.map((memory) => `- ${memory.title}: ${memory.content}`).join('\n');
    return `I found multiple possible memories. Which one should I forget?\n\n${options}`;
  }
  return 'I could not find a matching active memory. You can remove the exact item in **What LifeOS Knows**.';
}

function isExplicitRememberRequest(message) {
  return /^\s*(?:please\s+)?(?:remember that|remember this|ricorda che)\b/i.test(String(message ?? ''));
}

export function isMemoryRecallRequest(message) {
  return isTrueLongTermMemoryRecallRequest(message);
}

export function isMemoryForgetRequest(message) {
  return /^\s*(?:please\s+)?(?:forget that|forget what|dimentica che|dimentica quello)\b/i.test(String(message ?? ''));
}

export function formatMemoryRecallAnswer(brainContext) {
  const memories = Array.isArray(brainContext?.memories) ? brainContext.memories : [];
  if (!memories.length) {
    return 'Memory is still empty. You can say things like: "remember my name is Ale" or "remember that I prefer direct answers."';
  }
  const groups = memories.slice(0, 12).reduce((map, memory) => {
    const key = String(memory.category || 'other').replaceAll('_', ' ');
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(memory);
    return map;
  }, new Map());
  const lines = ["Here's what I remember:"];
  for (const [category, items] of groups) {
    lines.push('', `**${titleCase(category)}**`);
    lines.push(...items.map((memory) => `- ${memory.content}`));
  }
  if (memories.length > 12) lines.push('', `There are ${memories.length - 12} more active memories in **What LifeOS Knows**.`);
  lines.push('', 'You can edit or forget memories in **What LifeOS Knows**.');
  return lines.join('\n');
}

function formatCasualBrainAnswer(message, brainContext, { negativeWriteIntent = false, classification = null } = {}) {
  const text = String(message ?? '').trim();
  const normalized = normalizeBrainText(text);
  const name = preferredNameFromMemory(brainContext);
  const greetingName = name ? ` ${name}` : '';
  if (classification?.reason === 'Follow-up transform requested without previous assistant answer.') {
    return 'Send me the text you want me to transform, then tell me how to change it.';
  }
  if (negativeWriteIntent) {
    return "Understood - I won't create anything. We can just talk it through.";
  }
  if (/^(?:hello|hi|hey|yo|ciao|buongiorno|buonasera|what'?s up)\b[!. ]*$/i.test(text)) {
    return `Hey${greetingName}. What do you want to work on?`;
  }
  if (/^(?:thanks|thank you|ty|grazie)\b/i.test(normalized)) return 'No problem.';
  if (/^(?:ok|okay|lol|yes|no|nah|yep|nope|sure|alright)\b[!. ]*$/i.test(normalized)) return 'Got it.';
  if (/\b(?:nah|nope|no),?\s+just\s+logging\s+context\b|\bsolo\s+contesto\b|\bsolo\s+per\s+contesto\b/.test(normalized)) {
    return "Got it - I'll keep it as context.";
  }
  if (/\bnot sure though\b|\bnot sure\b|\bnon\s+sono\s+sicuro\b/.test(normalized)) {
    return 'Fair. We can keep it open.';
  }
  if (/\bactually,?\s+nevermind\b|\bnever\s+mind\b|\blascia\s+stare\b/.test(normalized)) {
    return 'Got it.';
  }
  if (/\bi haven'?t trained today\b|\bnon mi sono allenato oggi\b/.test(normalized)) {
    return 'Got it. Are you trying to decide whether to train today, or just logging context?';
  }
  if (/\bi'?m tired\b|\bi am tired\b|\bsono stanco\b/.test(normalized)) {
    return 'Got it. Do you want help deciding what to do next, or are you just noting context?';
  }
  if (hasTentativeWriteLanguage(text)) {
    return "Got it. I won't create anything from that unless you explicitly ask me to.";
  }
  return [
    'Got it.',
    'Do you want advice, analysis, or should I just keep this as conversation context?',
  ].join(' ');
}

export function isFollowUpTransformRequest(message) {
  const text = normalizeBrainText(message);
  if (!text || text.length > 180) return false;
  if (hasNegativeWriteIntent(text) || hasExplicitActionRequest(text) || extractExplicitMemoryCommand(message)) return false;

  const transformLanguage = /\b(?:metti(?:le|li|lo)?\s+in\s+ordine\s+cronologico|ordina(?:le|li|lo)?\s+cronologicamente|cronologico|fammi\s+una\s+tabella|metti(?:lo|li|le)?\s+in\s+tabella|tabella|riscrivilo|riscrivi(?:lo|la|li|le)?|piu\s+breve|piu\s+diretto|piu\s+concreto|riassumi|spiegalo\s+meglio|traduci\s+in\s+inglese|dammi\s+solo\s+i\s+numeri|senza\s+callout|put\s+(?:it|them|this|that)\s+in\s+(?:a\s+)?table|make\s+(?:a\s+)?table|sort\s+(?:it|them|this|that)?\s*chronologically|put\s+(?:it|them|this|that)\s+in\s+chronological\s+order|chronological\s+order|make\s+it\s+shorter|summari[sz]e|rewrite\s+(?:it|this|that)?\s*(?:cleaner|better|shorter)?|translate\s+(?:it|this|that)?\s*to\s+english|only\s+give\s+me\s+the\s+numbers|more\s+direct|more\s+concrete)\b/.test(text);
  if (!transformLanguage) return false;

  const contextReference = /\b(?:it|them|this|that|answer|response|list|table|lo|la|li|le|questo|questa|questi|queste|risposta|lista|mettile|mettili|mettilo|ordinale|ordinarle|riassumi|cronologico|tabella)\b/.test(text);
  const shortImplicitTransform = text.split(/\s+/).length <= 8;
  return contextReference || shortImplicitTransform;
}

function preferredNameFromMemory(brainContext) {
  const memory = (Array.isArray(brainContext?.memories) ? brainContext.memories : []).find((item) => {
    const title = normalizeBrainText(item.title);
    const content = normalizeBrainText(item.content);
    return item.category === 'identity' && (title.includes('name') || content.includes('preferred name') || content.includes('name is'));
  });
  const match = String(memory?.content ?? '').match(/\b(?:is|name is)\s+([\p{L}\p{M}' -]{1,40})\./u);
  return match?.[1]?.trim() || '';
}

export function hasExplicitActionRequest(message) {
  const text = normalizeBrainText(message);
  if (!text || hasNegativeWriteIntent(text)) return false;
  if (/\b(?:create|add|log|schedule|remind me|set a memo|put .*calendar|put it in calendar|put this in calendar|block)\b/.test(text)) return true;
  if (/\b(?:segna|aggiungi|crea|programma|programmamelo|logga|ricordami|segnalo|segnala|metti .*calendario)\b/.test(text)) return true;
  if (/\b(?:sleep start|bedtime|going to sleep|go to sleep|vado a dormire|sto andando a dormire|sto andando a letto|andando a letto|inizio sonno)\b/.test(text)) return true;
  if (/\b(?:blocca|fissa|pianifica|metti|mettimelo|mettilo|segnami|segnamelo)\b/.test(text)
    && /\b(?:oggi|domani|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica|calendario|evento|\d{1,2}(?::\d{2})?|mattina|pomeriggio|sera|dopo pranzo|dopo cena)\b/.test(text)) {
    return true;
  }
  if (/\bremember to\b/.test(text)) return true;
  if (/\b(?:expense|spesa|euro|euros|eur|dollar|dollars|usd|\$)\b/.test(text) && /\d/.test(text)) return true;
  if (isObviousDayScheduleRequest(message) || isObviousExplicitMultiEventCalendarRequest(message) || isFiniteRecurringCalendarRequest(message)) return true;
  return false;
}

export function isReadOnlyAnalysisRequest(message) {
  const text = normalizeBrainText(message);
  return /\b(?:analyze|analyse|analysis|review|status|how am i doing|how should you answer me|how should you respond|what should i do|what should i train|look at my workouts|review my week|dimmi cosa dovrei allenare|analizza|come sto andando|cosa dovrei fare|consigli|advice)\b/.test(text)
    || /\b(?:be brutally honest|be honest|too complicated|becoming too complicated)\b/.test(text)
    || /\b(?:what should we build|build next|what should i build|product strategy|roadmap|saas|architecture|architettura|feature roadmap)\b/.test(text)
    || (/\blifeos\b/.test(text) && /\b(?:build|ship|feature|roadmap|product|business|architecture|ui|ux)\b/.test(text))
    || isWorkoutAdviceOnlyRequest(message);
}

export function isCasualBrainMessage(message) {
  const text = normalizeBrainText(message);
  if (/^(?:hello|hi|hey|yo|ciao|ok|okay|thanks|thank you|grazie|lol|no|yes|yep|nope|nah|sure|not sure|actually)\b/.test(text)) return true;
  if (text.length <= 80 && !hasExplicitActionRequest(message) && !isReadOnlyAnalysisRequest(message)) return true;
  return false;
}

export function hasTentativeWriteLanguage(message) {
  const text = normalizeBrainText(message);
  return /\b(?:might need|maybe i need|i think i might|i could|maybe|forse dovrei|magari|potrei aver bisogno|potrei)\b/.test(text);
}

export function memoNeedsTimeClarification(message, args = {}) {
  if (!hasExplicitActionRequest(message)) return false;
  const text = normalizeBrainText(message);
  const rawTime = args?.memo_time ?? args?.time ?? args?.due_time;
  const rawDate = args?.memo_date ?? args?.date ?? args?.due_date;
  const partOfDay = /\b(?:afternoon|evening|morning|tonight|pomeriggio|sera|mattina|stanotte)\b/.test(text);
  const hasExactTime = /\b\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?\b/.test(text);
  if (partOfDay && !hasExactTime) return true;
  if (rawTime && /[a-z]/i.test(String(rawTime)) && !/\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?/i.test(String(rawTime))) return true;
  return Boolean(rawDate && partOfDay && !hasExactTime);
}

export function normalizeBrainText(value) {
  return String(value ?? '')
    .replace(/['\u2019]/g, "'")
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCase(value) {
  return String(value ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
