#!/usr/bin/env node
import assert from 'node:assert/strict';
import { curateAutobiographicalMemory, normalizeAutobiographicalCandidate, rankAutobiographicalInsights, searchAutobiographicalMemory } from '../api/_utils/brainAutobiographicalMemory.js';
import { createReliabilityDatabase, fixtureUser } from '../tests/brain/reliabilityDatabase.js';
import { buildLifeOSContext } from '../api/_utils/lifeosContextCompiler.js';
import { archiveMatchingBrainMemory, extractAndPersistBrainKnowledge, formatBrainContextForPrompt, loadBrainContext, shouldExtractMemory } from '../api/_utils/brain.js';

const { db, client } = await createReliabilityDatabase();
const capturedAt = new Date('2026-09-25T12:00:00Z');
const save = (candidate, extra = {}) => curateAutobiographicalMemory({ candidate, userId: fixtureUser, client, capturedAt, ...extra });
const fact = {
  memory_kind: 'semantic_fact', category: 'identity', title: 'Preferred name',
  content: 'My preferred name is Ale.', source: 'user_explicit', confidence: 0.98,
  importance: 4, subject_key: 'identity.preferred_name',
};

try {
  assert.equal(shouldExtractMemory('I launched LifeOS beta yesterday.', 'Noted.', 'analysis'), true);
  assert.equal(shouldExtractMemory('I took creatine today.', 'Done.', 'update_health_log'), false);
  assert.equal(shouldExtractMemory('Thanks!', 'You are welcome.', 'casual_chat'), false);
  assert.deepEqual(rankAutobiographicalInsights([
    { id: 'unrelated', title: 'Food', content: 'Maybe nutrition matters.', created_at: '2026-09-25T11:00:00Z' },
    { id: 'relevant', title: 'Workout', content: 'Maybe bench press progression matters.', created_at: '2026-09-24T11:00:00Z' },
  ], 'How is bench press progression?').map((item) => item.id), ['relevant']);
  const first = await save(fact);
  assert.equal(first.status, 'saved');
  assert.equal(first.memory.status, 'active');
  const same = await save(fact);
  assert.equal(same.memory.id, first.memory.id);
  assert.ok(same.memory.last_confirmed_at);
  const inferred = await save({ ...fact, content: 'My preferred name is Alex.', source: 'assistant_inferred', confidence: 0.6 });
  assert.equal(inferred.status, 'rejected');
  assert.equal(inferred.memory.id, first.memory.id);
  const changed = await save({ ...fact, content: 'My preferred name is Alessandro.' });
  assert.equal(changed.status, 'superseded');
  assert.equal(changed.memory.supersedes_id, first.memory.id);
  assert.equal((await client.from('ai_memories').select('*').eq('id', first.memory.id).single()).data.status, 'archived');
  const restored = await save(fact);
  assert.equal(restored.status, 'superseded');
  assert.notEqual(restored.memory.id, first.memory.id);
  assert.equal(restored.memory.supersedes_id, changed.memory.id);
  assert.equal((await client.from('ai_memories').select('*').eq('id', changed.memory.id).single()).data.status, 'archived');

  const episode = await save({
    memory_kind: 'episode', category: 'project', title: 'Released the beta',
    content: 'I released the LifeOS beta yesterday.', source: 'user_explicit',
    importance: 4,
  }, { userMessage: 'I released the LifeOS beta yesterday.' });
  assert.equal(episode.memory.occurred_on, '2026-09-24');
  assert.equal(episode.memory.occurred_at, null);
  assert.equal(episode.memory.provenance.temporal_precision, 'day');
  const repeatedEpisode = await save({
    memory_kind: 'episode', category: 'project', title: 'Released the beta',
    content: 'I released the LifeOS beta yesterday.', source: 'user_explicit',
    importance: 4, occurred_on: '2026-09-23',
  });
  assert.notEqual(repeatedEpisode.memory.id, episode.memory.id);
  const wrongYesterdayTime = normalizeAutobiographicalCandidate({
    memory_kind: 'episode', category: 'project', title: 'Released beta',
    content: 'I released the beta yesterday at 16:00.', source: 'user_explicit',
    occurred_at: '2026-09-25T10:00:00Z',
  }, { capturedAt, userMessage: 'I released the beta yesterday at 16:00.' });
  assert.equal(wrongYesterdayTime.occurred_at, null);
  assert.equal(wrongYesterdayTime.occurred_on, '2026-09-24');

  const project = (await db.query(`insert into projects(user_id,name,goal_type,current_value,target_value)
    values ($1,'LifeOS','units',0,10) returning id`, [fixtureUser])).rows[0];
  const decision = await save({
    memory_kind: 'project_memory', category: 'project', title: 'LifeOS delivery decision',
    content: 'We chose a WhatsApp-first LifeOS delivery flow.', source: 'user_explicit',
    importance: 5, project_name: 'LifeOS',
  });
  assert.equal(decision.memory.project_id, project.id);
  const unknown = await save({
    memory_kind: 'project_memory', category: 'project', title: 'Unknown project',
    content: 'A decision for an unknown project.', source: 'user_explicit',
    project_name: 'Not a project',
  });
  assert.equal(unknown.status, 'rejected');
  assert.equal(unknown.reason, 'unknown_project');
  const otherUser = '22222222-2222-4222-8222-222222222222';
  await db.query('insert into auth.users(id) values ($1)', [otherUser]);
  const otherProject = (await db.query(`insert into projects(user_id,name,goal_type,current_value,target_value)
    values ($1,'Private project','units',0,10) returning id`, [otherUser])).rows[0];
  const crossUserProject = await save({
    memory_kind: 'project_memory', category: 'project', title: 'Other project',
    content: 'A private project decision.', source: 'user_explicit', project_id: otherProject.id,
  });
  assert.equal(crossUserProject.status, 'rejected');

  assert.equal(normalizeAutobiographicalCandidate({ ...fact, content: 'Bearer abc' }), null);
  assert.equal(normalizeAutobiographicalCandidate({ ...fact, content: 'I took creatine' }), null);
  assert.equal(normalizeAutobiographicalCandidate({ ...fact, content: 'I took creatine today.' }), null);
  assert.equal(normalizeAutobiographicalCandidate({ ...fact, category: 'unbounded_category' }), null);
  assert.equal(normalizeAutobiographicalCandidate({ ...fact, occurred_on: '2026-09-26' }, { capturedAt }), null);
  assert.equal((await save({ ...fact, content: 'My API key is abc' })).status, 'rejected');

  const relevant = await searchAutobiographicalMemory({ userId: fixtureUser, client, query: 'LifeOS WhatsApp delivery', limit: 2 });
  assert.equal(relevant.memories[0].id, decision.memory.id);
  assert.ok(relevant.memories.length <= 2);
  assert.equal(relevant.memories.some((item) => item.id === first.memory.id), false);
  const history = await searchAutobiographicalMemory({ userId: fixtureUser, client, query: 'preferred name', includeHistorical: true, limit: 10 });
  assert.equal(history.memories.some((item) => item.id === first.memory.id && item.temporal_status === 'historical'), true);
  const projectOnly = await searchAutobiographicalMemory({ userId: fixtureUser, client, projectId: project.id });
  assert.equal(projectOnly.memories.length, 1);
  assert.equal(projectOnly.memories[0].kind, 'project_memory');

  const legacy = (await db.query(`insert into ai_memories(user_id,category,title,content)
    values ($1,'preference','Legacy','I prefer concise answers.') returning id`, [fixtureUser])).rows[0];
  const legacySearch = await searchAutobiographicalMemory({ userId: fixtureUser, client, query: 'concise answers' });
  assert.equal(legacySearch.memories.some((item) => item.id === legacy.id), true);
  assert.equal(legacySearch.memories.find((item) => item.id === legacy.id).kind, 'semantic_fact');
  assert.equal((await searchAutobiographicalMemory({ userId: '22222222-2222-4222-8222-222222222222', client, query: 'LifeOS' })).memories.length, 0);

  const currentRows = (await client.from('ai_memories').select('*').eq('user_id', fixtureUser).eq('status', 'active')).data;
  const snapshot = buildLifeOSContext({ rows: {
    memories: currentRows,
    insights: [{ id: 'hypothesis-1', insight_type: 'pattern', title: 'Maybe', content: 'This may be a pattern.', confidence: 0.6 }],
    beliefs: [{
      id: 'belief-1', subject_type: 'identity', subject_key: 'identity.preferred_name', predicate: 'value',
      value: { value: 'Alessandro' }, record_status: 'current', confidence: 0.99,
      source_type: 'user_explicit', effective_from: capturedAt.toISOString(), provenance: {},
    }],
  }, now: capturedAt });
  assert.equal(snapshot.autobiography.current_truth_source, 'brain_beliefs');
  assert.equal(snapshot.autobiography.relevant_facts.some((item) => item.title === 'Preferred name'), false);
  assert.equal(snapshot.autobiography.project_highlights[0].id, decision.memory.id);
  assert.equal(snapshot.autobiography.insights_as_hypotheses[0].id, 'hypothesis-1');
  const brainContext = await loadBrainContext({ client, userId: fixtureUser, message: 'LifeOS WhatsApp delivery', memoryLimit: 4 });
  assert.equal(brainContext.memories[0].id, decision.memory.id);
  assert.match(formatBrainContextForPrompt({ ...brainContext, beliefs: snapshot.beliefs?.preferences || [] }), /autobiographical memory/);
  const beliefInsert = await client.from('brain_beliefs').insert({
    user_id: fixtureUser, subject_type: 'identity', subject_key: 'identity.preferred_name',
    predicate: 'value', value: { value: 'Alessandro' }, confidence: 0.99, source_type: 'user_explicit',
  });
  assert.equal(beliefInsert.error, null);
  const currentNameContext = await loadBrainContext({ client, userId: fixtureUser, message: 'preferred name' });
  assert.equal(currentNameContext.memories.some((item) => item.subject_key === 'identity.preferred_name'), false);
  assert.match(formatBrainContextForPrompt(currentNameContext), /Alessandro/);
  await Promise.all([
    save({ ...fact, subject_key: 'preference.answer_style', category: 'preference', title: 'Answer style', content: 'I prefer concise answers.' }),
    save({ ...fact, subject_key: 'preference.answer_style', category: 'preference', title: 'Answer style', content: 'I prefer detailed answers.' }),
  ]);
  const activeStyle = (await client.from('ai_memories').select('*').eq('user_id', fixtureUser).eq('subject_key', 'preference.answer_style').eq('status', 'active')).data;
  assert.equal(activeStyle.length, 1);
  const appMemory = await extractAndPersistBrainKnowledge({
    userMessage: 'Remember that I prefer clear technical explanations.',
    assistantAnswer: 'I will remember that.', actionType: 'memory_write',
    channel: 'app', client, userId: fixtureUser,
  });
  const whatsappMemory = await extractAndPersistBrainKnowledge({
    userMessage: 'Remember that I prefer clear technical explanations.',
    assistantAnswer: 'I will remember that.', actionType: 'memory_write',
    channel: 'whatsapp', client, userId: fixtureUser,
  });
  assert.equal(appMemory.memories[0].id, whatsappMemory.memories[0].id);
  assert.equal(whatsappMemory.memories[0].provenance.channel, 'app');
  assert.equal(whatsappMemory.memories[0].provenance.last_seen_source.channel, 'whatsapp');
  assert.equal((await searchAutobiographicalMemory({ userId: fixtureUser, client, query: 'technical explanations' })).memories[0].id, appMemory.memories[0].id);
  const forgetContext = await loadBrainContext({ client, userId: fixtureUser, message: 'forget clear technical explanations' });
  const forgotten = await archiveMatchingBrainMemory({
    target: 'clear technical explanations', existingMemories: forgetContext.memories, client, userId: fixtureUser,
  });
  assert.equal(forgotten.status, 'archived');
  assert.equal(forgotten.memory.id, appMemory.memories[0].id);
  assert.equal((await searchAutobiographicalMemory({ userId: fixtureUser, client, query: 'technical explanations' })).memories.some((item) => item.id === appMemory.memories[0].id), false);
  const rememberedAgain = await extractAndPersistBrainKnowledge({
    userMessage: 'Remember that I prefer clear technical explanations.',
    assistantAnswer: 'I will remember that.', actionType: 'memory_write',
    channel: 'app', client, userId: fixtureUser,
  });
  assert.notEqual(rememberedAgain.memories[0].id, appMemory.memories[0].id);
  assert.equal(rememberedAgain.memories[0].status, 'active');

  console.log('PASS curated autobiographical memory dedupes, supersedes, grounds projects, respects time and ranks retrieval');
} finally {
  await db.close();
}
