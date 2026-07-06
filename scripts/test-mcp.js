#!/usr/bin/env node
import crypto from 'node:crypto';
import {
  createMcpHealthPayload,
  handleMcpJsonRpcRequest,
  listMcpPrompts,
  listMcpResources,
  listMcpTools,
  validateMcpAuth,
} from '../api/mcp.js';
import { clampMcpDays, clampMcpLimit, compactWorkout, getWorkoutSetTruncationInfo, sanitizeMcpOutput } from '../api/_utils/mcpLifeosData.js';
import { buildLifeOSContext, buildOpenLoops, rankOpenLoops } from '../api/_utils/lifeosContextCompiler.js';
import {
  buildAuthorizationServerMetadata,
  buildWwwAuthenticateHeader,
  getMcpOAuthRequestKind,
  signAccessTokenForTest,
  verifyOAuthAccessTokenForTest,
  verifyPkceForTest,
} from '../api/_utils/mcpOAuth.js';
import { resolveActionName } from '../api/actions.js';

const checks = [];

test('health payload is read-only and advertises MCP capabilities', () => {
  const health = createMcpHealthPayload();
  assertEqual(health.ok, true);
  assertEqual(health.read_only, true);
  assertEqual(health.endpoint, '/api/mcp');
  assert(health.capabilities.tools >= 10, 'expected at least 10 tools');
});

test('initialize returns MCP server info', async () => {
  const response = await handleMcpJsonRpcRequest({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {},
  }, { userId: 'test-user' });
  assertEqual(response.result.serverInfo.name, 'lifeos-mcp');
});

test('tools/list includes expected tools', () => {
  const tools = listMcpTools().map((tool) => tool.name);
  for (const name of [
    'get_lifeos_snapshot',
    'get_lifeos_context',
    'get_recent_workouts',
    'get_health_summary',
    'get_open_memos',
    'get_brain_debug_context',
    'get_whatsapp_proactive_debug',
    'search_lifeos_vault',
  ]) {
    assert(tools.includes(name), `missing tool ${name}`);
  }
  const firstTool = listMcpTools()[0];
  assert(firstTool.annotations.readOnlyHint, 'tool missing read-only annotation');
  assertEqual(firstTool.securitySchemes[0].type, 'oauth2');
  assert(firstTool.securitySchemes[0].scopes.includes('lifeos.read'), 'tool missing lifeos.read scope');
});

test('resources/list includes expected resources', () => {
  const resources = listMcpResources().map((resource) => resource.uri);
  for (const uri of [
    'lifeos://snapshot',
    'lifeos://context/today',
    'lifeos://today',
    'lifeos://brain/debug',
    'lifeos://whatsapp/outbox/recent',
    'lifeos://whatsapp/proactive-debug',
    'lifeos://vault/recent',
  ]) {
    assert(resources.includes(uri), `missing resource ${uri}`);
  }
});

test('prompts/list includes expected prompts', () => {
  const prompts = listMcpPrompts().map((prompt) => prompt.name);
  for (const name of [
    'lifeos_morning_brief',
    'lifeos_evening_review',
    'lifeos_weekly_review',
    'lifeos_brain_bug_analysis',
  ]) {
    assert(prompts.includes(name), `missing prompt ${name}`);
  }
});

test('unknown method returns JSON-RPC method error', async () => {
  const response = await handleMcpJsonRpcRequest({
    jsonrpc: '2.0',
    id: 2,
    method: 'unknown/method',
  }, { userId: 'test-user' });
  assertEqual(response.error.code, -32601);
});

test('unknown tool returns JSON-RPC params error', async () => {
  const response = await handleMcpJsonRpcRequest({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'write_everything', arguments: {} },
  }, { userId: 'test-user' });
  assertEqual(response.error.code, -32602);
});

test('auth accepts bearer and fallback header only with matching token', () => {
  const env = { LIFEOS_MCP_TOKEN: 'test-token' };
  assertEqual(validateMcpAuth({ headers: { authorization: 'Bearer test-token' } }, env).ok, true);
  assertEqual(validateMcpAuth({ headers: { 'x-lifeos-mcp-token': 'test-token' } }, env).ok, true);
  assertEqual(validateMcpAuth({ headers: { authorization: 'Bearer wrong' } }, env).status, 401);
  assertEqual(validateMcpAuth({ headers: {} }, env).status, 401);
  assert(validateMcpAuth({ headers: {} }, env).wwwAuthenticate.includes('/api/mcp?mcp_oauth=protected-resource'), 'missing direct WWW-Authenticate metadata');
});

test('auth accepts signed OAuth access tokens without accepting wrong tokens', () => {
  const env = {
    LIFEOS_MCP_TOKEN: 'static-token',
    LIFEOS_MCP_OAUTH_SIGNING_SECRET: 'oauth-signing-secret',
  };
  const req = { headers: { host: 'lifeos-ruby-gamma.vercel.app', 'x-forwarded-proto': 'https' } };
  const token = signAccessTokenForTest({
    iss: 'https://lifeos-ruby-gamma.vercel.app',
    aud: 'https://lifeos-ruby-gamma.vercel.app/api/mcp',
    sub: 'test-user',
    scope: 'lifeos.read',
    client_id: 'test-client',
  }, env);
  assertEqual(verifyOAuthAccessTokenForTest(token, req, env), true);
  assertEqual(validateMcpAuth({ headers: { ...req.headers, authorization: `Bearer ${token}` } }, env).ok, true);
  assertEqual(validateMcpAuth({ headers: { ...req.headers, authorization: 'Bearer wrong' } }, env).status, 401);
});

test('PKCE verifier matches S256 challenge', async () => {
  const verifier = 'test-code-verifier';
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  assertEqual(verifyPkceForTest(verifier, challenge), true);
});

test('OAuth route detection supports rewrite query and original paths', () => {
  assertEqual(getMcpOAuthRequestKind({ query: { mcp_oauth: 'token' }, headers: {}, url: '/api/mcp' }), 'token');
  assertEqual(getMcpOAuthRequestKind({ headers: { host: 'example.com' }, url: '/.well-known/oauth-protected-resource' }), 'protected-resource');
  assertEqual(getMcpOAuthRequestKind({ headers: { host: 'example.com' }, url: '/oauth/authorize' }), 'authorize');
});

test('OAuth metadata advertises direct API authorize and token URLs', () => {
  const req = { headers: { host: 'lifeos-ruby-gamma.vercel.app', 'x-forwarded-proto': 'https' }, url: '/api/mcp' };
  const metadata = buildAuthorizationServerMetadata(req, {});
  assertEqual(metadata.authorization_endpoint, 'https://lifeos-ruby-gamma.vercel.app/api/mcp?mcp_oauth=authorize');
  assertEqual(metadata.token_endpoint, 'https://lifeos-ruby-gamma.vercel.app/api/mcp?mcp_oauth=token');
  assert(buildWwwAuthenticateHeader(req, {}).includes('/api/mcp?mcp_oauth=protected-resource'), 'WWW-Authenticate should use direct API metadata URL');
});

test('consolidated Action API resolves supported action names only', () => {
  assertEqual(resolveActionName('expense'), 'expense');
  assertEqual(resolveActionName('sleep_start'), 'sleep-start');
  assertEqual(resolveActionName('wake-time'), 'wake');
  assertEqual(resolveActionName('calendar'), 'calendar');
  assertEqual(resolveActionName('delete-everything'), null);
});

test('MCP data clamps excessive limits and day windows', () => {
  assertEqual(clampMcpLimit(999, 30, 50), 50);
  assertEqual(clampMcpLimit(-3, 30, 50), 1);
  assertEqual(clampMcpDays(999), 30);
  assertEqual(clampMcpDays(-3), 1);
});

test('MCP sanitizer removes secret-like fields', () => {
  const sanitized = sanitizeMcpOutput({
    ok: true,
    api_key: 'secret',
    nested: {
      authorization: 'Bearer secret',
      value: 'visible',
    },
  });
  assertEqual(sanitized.ok, true);
  assertEqual(sanitized.api_key, undefined);
  assertEqual(sanitized.nested.authorization, undefined);
  assertEqual(sanitized.nested.value, 'visible');
});

test('LifeOS open loops engine detects and ranks structured loops', () => {
  const rows = buildContextFixtureRows();
  const result = buildOpenLoops({
    rows,
    now: new Date('2026-06-18T08:00:00.000Z'),
    days: 7,
    limit: 20,
  });
  const types = result.loops.map((loop) => loop.type);
  for (const type of [
    'failed_action',
    'whatsapp_outbox_issue',
    'overdue_memo',
    'due_today_memo',
    'calendar_prep',
    'stale_project',
    'project_session_carryover',
    'brain_pending_action',
    'recovery_gap',
    'workout_gap',
  ]) {
    assert(types.includes(type), `missing loop type ${type}`);
  }
  assertEqual(result.loops[0].severity, 'high');
  assert(result.severity_counts.high >= 3, 'expected multiple high severity loops');
  const overdue = result.loops.find((loop) => loop.type === 'overdue_memo');
  assertEqual(overdue.can_be_proactive, true);
  assertEqual(overdue.source_table, 'memos');
});

test('LifeOS open loops engine dedupes repeated pending action rows', () => {
  const rows = buildContextFixtureRows();
  rows.brainMessages.push({
    ...rows.brainMessages[0],
    id: 'brain-message-duplicate',
    created_at: '2026-06-18T07:55:00.000Z',
  });
  const result = buildOpenLoops({
    rows,
    now: new Date('2026-06-18T08:00:00.000Z'),
    days: 7,
    limit: 20,
  });
  assertEqual(result.loops.filter((loop) => loop.type === 'brain_pending_action').length, 1);
});

test('LifeOS context compiler produces compact Morning-Brief-ready shape', () => {
  const snapshot = buildLifeOSContext({
    rows: buildContextFixtureRows(),
    now: new Date('2026-06-18T08:00:00.000Z'),
    days: 7,
    limit: 20,
  });
  assertEqual(snapshot.scope.today, '2026-06-18');
  assertEqual(snapshot.today.date, '2026-06-18');
  assert(snapshot.open_loops.loops.length > 0, 'expected ranked open loops');
  assert(snapshot.memos.overdue_count >= 1, 'expected overdue memo count');
  assert(snapshot.projects.stale_count >= 1, 'expected stale project count');
  assertEqual(snapshot.health.sleep_status, 'low');
  assertEqual(snapshot.whatsapp.counts_by_status.failed, 1);
});

test('LifeOS open loop ranking prefers high severity before low severity', () => {
  const ranked = rankOpenLoops([
    { type: 'unscheduled_memo', title: 'Low', severity: 'low', id: 'low' },
    { type: 'failed_action', title: 'High', severity: 'high', id: 'high' },
    { type: 'calendar_prep', title: 'Medium', severity: 'medium', id: 'medium' },
  ]);
  assertEqual(ranked[0].id, 'high');
  assertEqual(ranked[1].id, 'medium');
  assertEqual(ranked[2].id, 'low');
});

test('MCP workout compactor keeps exact set-level details and aggregates', () => {
  const workout = compactWorkout({
    id: 'workout-1',
    name: 'Push',
    performed_on: '2026-06-18',
    started_at: '2026-06-18T10:00:00.000Z',
    ended_at: '2026-06-18T11:05:00.000Z',
    notes: 'Good session',
  }, [
    {
      id: 'set-2',
      workout_id: 'workout-1',
      exercise: 'Bench Press',
      set_number: 2,
      is_warmup: false,
      weight: 50,
      reps: 7,
      rpe: 8,
      performed_at: '2026-06-18T10:12:00.000Z',
      notes: '',
    },
    {
      id: 'set-1',
      workout_id: 'workout-1',
      exercise: 'Bench Press',
      set_number: 1,
      is_warmup: false,
      weight: 50,
      reps: 8,
      rpe: 7.5,
      performed_at: '2026-06-18T10:09:00.000Z',
      notes: 'Clean',
    },
    {
      id: 'set-0',
      workout_id: 'workout-1',
      exercise: 'Bench Press',
      set_number: 0,
      is_warmup: true,
      weight: 20,
      reps: 10,
      rpe: null,
      performed_at: '2026-06-18T10:05:00.000Z',
      notes: 'warmup',
    },
  ]);

  assertEqual(workout.duration_minutes, 65);
  assertEqual(workout.set_count, 3);
  assertEqual(workout.exercise_count, 1);
  assertEqual(workout.sets.length, 3);
  assertEqual(workout.sets[0].id, 'set-0');
  assertEqual(workout.sets[1].id, 'set-1');
  assertEqual(workout.sets[2].id, 'set-2');
  assertEqual(workout.sets[1].weight, 50);
  assertEqual(workout.sets[1].reps, 8);
  assertEqual(workout.sets[1].rpe, 7.5);
  const bench = workout.exercises[0];
  assertEqual(bench.exercise, 'Bench Press');
  assertEqual(bench.set_count, 3);
  assertEqual(bench.working_set_count, 2);
  assertEqual(bench.warmup_set_count, 1);
  assertEqual(bench.top_weight, 50);
  assertEqual(bench.total_reps, 25);
  assertEqual(bench.average_reps, 8.3);
  assertEqual(bench.average_rpe, 7.8);
  assertEqual(bench.sets.length, 3);
  assertEqual(bench.top_set.id, 'set-1');
});

test('MCP workout truncation flags are explicit', () => {
  assertEqual(getWorkoutSetTruncationInfo(12, 600).sets_truncated, false);
  assertEqual(getWorkoutSetTruncationInfo(600, 600).sets_truncated, true);
  assertEqual(getWorkoutSetTruncationInfo(600, 600).set_limit, 600);
  assertEqual(getWorkoutSetTruncationInfo(600, 600).returned_set_count, 600);
});

test('MCP sanitizer preserves normal nested workout set fields', () => {
  const sanitized = sanitizeMcpOutput({
    workouts: [{
      exercises: [{
        sets: [{
          id: 'set-1',
          set_number: 1,
          weight: 50,
          reps: 8,
          rpe: 7.5,
        }],
      }],
    }],
  });
  assertEqual(sanitized.workouts[0].exercises[0].sets[0].weight, 50);
  assertEqual(sanitized.workouts[0].exercises[0].sets[0].reps, 8);
});

for (const check of checks) {
  try {
    await check.fn();
    console.log(`PASS ${check.name}`);
  } catch (error) {
    console.error(`FAIL ${check.name}`);
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

if (!process.exitCode) console.log('All MCP checks passed.');

function test(name, fn) {
  checks.push({ name, fn });
}

function assert(condition, message = 'assertion failed') {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected) {
  if (actual !== expected) {
    throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function buildContextFixtureRows() {
  return {
    memos: [
      {
        id: 'memo-overdue',
        title: 'Pagare bolletta',
        memo_date: '2026-06-17',
        memo_time: '09:30',
        status: 'open',
        notes: 'Da fare',
      },
      {
        id: 'memo-today',
        title: 'Fare matematica',
        memo_date: '2026-06-18',
        memo_time: '10:00',
        status: 'open',
        notes: '',
      },
      {
        id: 'memo-unscheduled',
        title: 'Idea senza data',
        memo_date: null,
        memo_time: null,
        status: 'open',
        notes: '',
      },
    ],
    calendarEvents: [
      {
        id: 'event-prep',
        title: 'Lezione matematica',
        event_date: '2026-06-18',
        start_time: '11:00',
        end_time: '12:00',
        category: 'Study',
        location: 'Online',
        status: 'planned',
        notes: 'Prepara esercizi',
      },
    ],
    projects: [
      {
        id: 'project-stale',
        name: 'LifeOS',
        status: 'active',
        goal_type: 'hours',
        target_value: 20,
        current_value: 4,
        unit_label: 'h',
        started_on: '2026-06-01',
        notes: '',
        created_at: '2026-06-01T08:00:00.000Z',
        updated_at: '2026-06-02T08:00:00.000Z',
      },
    ],
    projectSessions: [
      {
        id: 'session-carry',
        project_id: 'project-stale',
        started_at: '2026-06-09T08:00:00.000Z',
        ended_at: '2026-06-09T09:00:00.000Z',
        duration_minutes: 60,
        target_output: 'Finish MCP context',
        proof_of_work: '',
      },
    ],
    healthLogs: [
      {
        id: 'health-today',
        logged_on: '2026-06-18',
        sleep_hours: 5,
        sleep_start: '03:00',
        wake_time: '08:00',
        energy: 4,
        coffee: 1,
        mood: 5,
        notes: '',
      },
    ],
    workouts: [
      {
        id: 'workout-old',
        name: 'Push',
        performed_on: '2026-06-10',
        started_at: '2026-06-10T10:00:00.000Z',
        ended_at: '2026-06-10T11:00:00.000Z',
      },
    ],
    actionLogs: [
      {
        id: 'action-failed',
        request_id: 'request-1',
        source: 'whatsapp',
        action_type: 'create_memo',
        status: 'error',
        error_message: 'Safe test failure',
        created_at: '2026-06-18T07:30:00.000Z',
      },
    ],
    outboxMessages: [
      {
        id: 'outbox-failed',
        channel: 'whatsapp',
        recipient: '111@lid',
        status: 'failed',
        priority: 'normal',
        rule_key: 'timed_memo_due',
        source_type: 'memo',
        source_id: 'memo-overdue',
        scheduled_for: '2026-06-18T07:00:00.000Z',
        claimed_at: null,
        attempts: 3,
        last_error: 'bridge failed',
      },
    ],
    brainMessages: [
      {
        id: 'brain-message-1',
        thread_id: 'thread-1',
        created_at: '2026-06-18T07:45:00.000Z',
        metadata: {
          pending_action: {
            id: 'pending-1',
            action_type: 'create_calendar_event',
            status: 'awaiting_fields',
            summary: 'Bloccare studio',
            missing_fields: ['start_time'],
          },
        },
      },
    ],
  };
}
