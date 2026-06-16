import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';
import { addDays } from '../utils/date';
import { calculateSleepHoursFromTimes } from '../utils/health';

const requireSupabase = () => {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.');
  }
  return supabase;
};

const throwIfError = ({ data, error }) => {
  if (error) throw error;
  return data;
};

const workoutSelect = `
  id,
  user_id,
  name,
  performed_on,
  started_at,
  ended_at,
  template_id,
  template_snapshot,
  notes,
  created_at,
  updated_at,
  workout_sets (
    id,
    user_id,
    workout_id,
    exercise,
    set_number,
    is_warmup,
    weight,
    reps,
    rpe,
    performed_at,
    notes,
    created_at,
    updated_at
  )
`;

const workoutTemplateSelect = `
  id,
  user_id,
  name,
  notes,
  created_at,
  updated_at,
  workout_template_exercises (
    id,
    user_id,
    template_id,
    exercise,
    exercise_order,
    notes,
    created_at,
    updated_at
  )
`;

const workoutTemplateExerciseSelect = `
  id,
  user_id,
  template_id,
  exercise,
  exercise_order,
  notes,
  created_at,
  updated_at
`;

const healthLogSelect = `
  id,
  user_id,
  logged_on,
  sleep_hours,
  sleep_start,
  wake_time,
  sleep_quality,
  energy,
  coffee,
  water,
  adc,
  mood,
  social_time_minutes,
  main_time_waster,
  notes,
  hygiene,
  created_at,
  updated_at
`;

const expenseSelect = `
  id,
  user_id,
  vendor,
  category,
  amount,
  spent_on,
  notes,
  created_at,
  updated_at
`;

const calendarEventSelect = `
  id,
  user_id,
  title,
  event_date,
  start_time,
  end_time,
  category,
  location,
  notes,
  status,
  created_at,
  updated_at
`;

const memoSelect = `
  id,
  user_id,
  title,
  memo_date,
  memo_time,
  notes,
  status,
  created_at,
  updated_at
`;

const projectSessionSelect = `
  id,
  user_id,
  project_id,
  started_at,
  ended_at,
  duration_minutes,
  target_output,
  proof_of_work,
  progress_delta,
  created_at,
  updated_at
`;

const projectMoneyEntrySelect = `
  id,
  user_id,
  project_id,
  type,
  amount,
  description,
  entry_date,
  created_at,
  updated_at
`;

const projectSelect = `
  id,
  user_id,
  name,
  status,
  goal_type,
  goal_label,
  target_value,
  current_value,
  unit_label,
  overall_cost,
  started_on,
  notes,
  created_at,
  updated_at,
  project_sessions (
    ${projectSessionSelect}
  )
`;

const dailyReviewSelect = `
  id,
  user_id,
  review_on,
  wins,
  risks,
  next_actions,
  score,
  created_at,
  updated_at
`;

const aiChatThreadSelect = `
  id,
  user_id,
  title,
  status,
  metadata,
  created_at,
  updated_at,
  last_message_at
`;

const aiChatMessageSelect = `
  id,
  user_id,
  thread_id,
  role,
  content,
  request_id,
  action_type,
  metadata,
  created_at
`;

const aiMemorySelect = `
  id,
  user_id,
  category,
  title,
  content,
  source,
  confidence,
  importance,
  status,
  last_seen_at,
  metadata,
  created_at,
  updated_at
`;

const aiInsightSelect = `
  id,
  user_id,
  insight_type,
  title,
  content,
  evidence,
  confidence,
  status,
  created_at,
  updated_at
`;

export const authApi = {
  async getSession() {
    return throwIfError(await requireSupabase().auth.getSession());
  },

  async signInWithPassword({ email, password }) {
    return throwIfError(await requireSupabase().auth.signInWithPassword({ email, password }));
  },

  async signUp({ email, password }) {
    return throwIfError(await requireSupabase().auth.signUp({ email, password }));
  },

  async signOut() {
    return throwIfError(await requireSupabase().auth.signOut());
  },

  onAuthStateChange(callback) {
    if (!isSupabaseConfigured || !supabase) return { unsubscribe: () => {} };
    const { data } = supabase.auth.onAuthStateChange(callback);
    return data.subscription;
  },
};

export const workoutApi = {
  async list(limit = 25) {
    const rows = throwIfError(
      await requireSupabase()
        .from('workouts')
        .select(workoutSelect)
        .order('performed_on', { ascending: false })
        .order('started_at', { ascending: false })
        .limit(limit),
    );

    return normalizeWorkouts(rows);
  },

  async create(payload) {
    const row = throwIfError(
      await requireSupabase()
        .from('workouts')
        .insert({
          name: payload.name,
          performed_on: payload.performed_on,
          started_at: payload.started_at || new Date().toISOString(),
          ended_at: payload.ended_at || null,
          template_id: payload.template_id || null,
          template_snapshot: Array.isArray(payload.template_snapshot) ? payload.template_snapshot : [],
          notes: payload.notes || null,
        })
        .select(workoutSelect)
        .single(),
    );

    return normalizeWorkout(row);
  },

  async update(id, patch) {
    const row = throwIfError(
      await requireSupabase().from('workouts').update(prepareWorkoutPayload(patch)).eq('id', id).select(workoutSelect).single(),
    );
    return normalizeWorkout(row);
  },

  async delete(id) {
    return throwIfError(await requireSupabase().from('workouts').delete().eq('id', id));
  },
};

export const workoutSetApi = {
  async create(payload) {
    return throwIfError(
      await requireSupabase()
        .from('workout_sets')
        .insert({
          workout_id: payload.workout_id,
          exercise: payload.exercise,
          set_number: Number(payload.set_number),
          is_warmup: Boolean(payload.is_warmup),
          weight: Number(payload.weight),
          reps: Number(payload.reps),
          rpe: normalizeNullableNumber(payload.rpe),
          performed_at: payload.performed_at,
          notes: payload.notes || null,
        })
        .select(
          'id, user_id, workout_id, exercise, set_number, is_warmup, weight, reps, rpe, performed_at, notes, created_at, updated_at',
        )
        .single(),
    );
  },

  async update(id, patch) {
    return throwIfError(
      await requireSupabase()
        .from('workout_sets')
        .update(prepareWorkoutSetPayload(patch))
        .eq('id', id)
        .select(
          'id, user_id, workout_id, exercise, set_number, is_warmup, weight, reps, rpe, performed_at, notes, created_at, updated_at',
        )
        .single(),
    );
  },

  async delete(id) {
    return throwIfError(await requireSupabase().from('workout_sets').delete().eq('id', id));
  },
};

export const workoutTemplateApi = {
  async list(limit = 50) {
    const rows = throwIfError(
      await requireSupabase()
        .from('workout_templates')
        .select(workoutTemplateSelect)
        .order('name', { ascending: true })
        .limit(limit),
    );

    return normalizeWorkoutTemplates(rows);
  },

  async create(payload) {
    const row = throwIfError(
      await requireSupabase()
        .from('workout_templates')
        .insert({
          name: payload.name,
          notes: payload.notes || null,
        })
        .select(workoutTemplateSelect)
        .single(),
    );

    return normalizeWorkoutTemplate(row);
  },

  async update(id, patch) {
    const row = throwIfError(
      await requireSupabase()
        .from('workout_templates')
        .update(prepareWorkoutTemplatePayload(patch))
        .eq('id', id)
        .select(workoutTemplateSelect)
        .single(),
    );
    return normalizeWorkoutTemplate(row);
  },

  async delete(id) {
    return throwIfError(await requireSupabase().from('workout_templates').delete().eq('id', id));
  },
};

export const workoutTemplateExerciseApi = {
  async create(payload) {
    return throwIfError(
      await requireSupabase()
        .from('workout_template_exercises')
        .insert({
          template_id: payload.template_id,
          exercise: payload.exercise,
          exercise_order: Number(payload.exercise_order),
          notes: payload.notes || null,
        })
        .select(workoutTemplateExerciseSelect)
        .single(),
    );
  },

  async update(id, patch) {
    return throwIfError(
      await requireSupabase()
        .from('workout_template_exercises')
        .update(prepareWorkoutTemplateExercisePayload(patch))
        .eq('id', id)
        .select(workoutTemplateExerciseSelect)
        .single(),
    );
  },

  async delete(id) {
    return throwIfError(await requireSupabase().from('workout_template_exercises').delete().eq('id', id));
  },

  async reorder(updates) {
    const client = requireSupabase();
    await Promise.all(
      updates.map(async (update) =>
        throwIfError(
          await client
            .from('workout_template_exercises')
            .update({ exercise_order: Number(update.exercise_order) + 10000 })
            .eq('id', update.id)
            .select(workoutTemplateExerciseSelect)
            .single(),
        ),
      ),
    );
    const rows = await Promise.all(
      updates.map(async (update) =>
        throwIfError(
          await client
            .from('workout_template_exercises')
            .update({ exercise_order: Number(update.exercise_order) })
            .eq('id', update.id)
            .select(workoutTemplateExerciseSelect)
            .single(),
        ),
      ),
    );
    return rows;
  },
};

export const healthLogApi = {
  async list(limit = 30) {
    return throwIfError(
      await requireSupabase()
        .from('health_logs')
        .select(healthLogSelect)
        .order('logged_on', { ascending: false })
        .limit(limit),
    );
  },

  async getByDate(loggedOn) {
    return throwIfError(
      await requireSupabase()
        .from('health_logs')
        .select(healthLogSelect)
        .eq('logged_on', loggedOn)
        .maybeSingle(),
    );
  },

  async create(payload) {
    const client = requireSupabase();
    const row = throwIfError(
      await client
        .from('health_logs')
        .insert(prepareHealthLogPayload(payload))
        .select(healthLogSelect)
        .single(),
    );
    await recalculateHealthSleepAfterChange(client, row.logged_on, Object.keys(payload));
    return throwIfError(await client.from('health_logs').select(healthLogSelect).eq('id', row.id).single());
  },

  async update(id, patch) {
    const client = requireSupabase();
    const row = throwIfError(
      await client
        .from('health_logs')
        .update(prepareHealthLogPayload(patch))
        .eq('id', id)
        .select(healthLogSelect)
        .single(),
    );
    await recalculateHealthSleepAfterChange(client, row.logged_on, Object.keys(patch));
    return throwIfError(await client.from('health_logs').select(healthLogSelect).eq('id', row.id).single());
  },
};

export const expenseApi = {
  async list(limit = 100) {
    return throwIfError(
      await requireSupabase()
        .from('expenses')
        .select(expenseSelect)
        .order('spent_on', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit),
    );
  },

  async listByDateRange(startDate, endDate, limit = 500) {
    return throwIfError(
      await requireSupabase()
        .from('expenses')
        .select(expenseSelect)
        .gte('spent_on', startDate)
        .lt('spent_on', endDate)
        .order('spent_on', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit),
    );
  },

  async create(payload) {
    return throwIfError(
      await requireSupabase()
        .from('expenses')
        .insert(prepareExpensePayload(payload))
        .select(expenseSelect)
        .single(),
    );
  },

  async update(id, patch) {
    return throwIfError(
      await requireSupabase()
        .from('expenses')
        .update(prepareExpensePayload(patch))
        .eq('id', id)
        .select(expenseSelect)
        .single(),
    );
  },

  async delete(id) {
    return throwIfError(await requireSupabase().from('expenses').delete().eq('id', id));
  },
};

export const calendarEventApi = {
  async list(limit = 500) {
    return throwIfError(
      await requireSupabase()
        .from('calendar_events')
        .select(calendarEventSelect)
        .order('event_date', { ascending: true })
        .order('start_time', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(limit),
    );
  },

  async listByRange(startDate, endDate, limit = 250) {
    return throwIfError(
      await requireSupabase()
        .from('calendar_events')
        .select(calendarEventSelect)
        .gte('event_date', startDate)
        .lt('event_date', endDate)
        .order('event_date', { ascending: true })
        .order('start_time', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(limit),
    );
  },

  async create(payload) {
    return throwIfError(
      await requireSupabase()
        .from('calendar_events')
        .insert(prepareCalendarEventPayload(payload))
        .select(calendarEventSelect)
        .single(),
    );
  },

  async update(id, patch) {
    return throwIfError(
      await requireSupabase()
        .from('calendar_events')
        .update(prepareCalendarEventPayload(patch))
        .eq('id', id)
        .select(calendarEventSelect)
        .single(),
    );
  },

  async delete(id) {
    return throwIfError(await requireSupabase().from('calendar_events').delete().eq('id', id));
  },
};

export const memoApi = {
  async list(limit = 250) {
    return throwIfError(
      await requireSupabase()
        .from('memos')
        .select(memoSelect)
        .order('status', { ascending: true })
        .order('memo_date', { ascending: true, nullsFirst: false })
        .order('memo_time', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(limit),
    );
  },

  async create(payload) {
    return throwIfError(
      await requireSupabase()
        .from('memos')
        .insert(prepareMemoPayload(payload))
        .select(memoSelect)
        .single(),
    );
  },

  async update(id, patch) {
    return throwIfError(
      await requireSupabase()
        .from('memos')
        .update(prepareMemoPayload(patch))
        .eq('id', id)
        .select(memoSelect)
        .single(),
    );
  },

  async delete(id) {
    return throwIfError(await requireSupabase().from('memos').delete().eq('id', id));
  },
};

export const projectApi = {
  async list(limit = 100) {
    const rows = throwIfError(
      await requireSupabase()
        .from('projects')
        .select(projectSelect)
        .order('status', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(limit),
    );

    return normalizeProjects(rows);
  },

  async create(payload) {
    const row = throwIfError(
      await requireSupabase()
        .from('projects')
        .insert(prepareProjectPayload(payload))
        .select(projectSelect)
        .single(),
    );

    return normalizeProject(row);
  },

  async update(id, patch) {
    const row = throwIfError(
      await requireSupabase()
        .from('projects')
        .update(prepareProjectPayload(patch))
        .eq('id', id)
        .select(projectSelect)
        .single(),
    );
    return normalizeProject(row);
  },

  async delete(id) {
    return throwIfError(await requireSupabase().from('projects').delete().eq('id', id));
  },
};

export const projectSessionApi = {
  async list(limit = 500) {
    const rows = throwIfError(
      await requireSupabase()
        .from('project_sessions')
        .select(projectSessionSelect)
        .order('started_at', { ascending: false })
        .limit(limit),
    );

    return normalizeProjectSessions(rows);
  },

  async create(payload) {
    const row = throwIfError(
      await requireSupabase()
        .from('project_sessions')
        .insert(prepareProjectSessionPayload(payload))
        .select(projectSessionSelect)
        .single(),
    );

    return normalizeProjectSession(row);
  },

  async update(id, patch) {
    const row = throwIfError(
      await requireSupabase()
        .from('project_sessions')
        .update(prepareProjectSessionPayload(patch))
        .eq('id', id)
        .select(projectSessionSelect)
        .single(),
    );

    return normalizeProjectSession(row);
  },

  async delete(id) {
    return throwIfError(await requireSupabase().from('project_sessions').delete().eq('id', id));
  },
};

export const projectMoneyEntryApi = {
  async list(limit = 500) {
    const rows = throwIfError(
      await requireSupabase()
        .from('project_money_entries')
        .select(projectMoneyEntrySelect)
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit),
    );

    return normalizeProjectMoneyEntries(rows);
  },

  async create(payload) {
    const row = throwIfError(
      await requireSupabase()
        .from('project_money_entries')
        .insert(prepareProjectMoneyEntryPayload(payload))
        .select(projectMoneyEntrySelect)
        .single(),
    );

    return normalizeProjectMoneyEntry(row);
  },

  async update(id, patch) {
    const row = throwIfError(
      await requireSupabase()
        .from('project_money_entries')
        .update(prepareProjectMoneyEntryPayload(patch))
        .eq('id', id)
        .select(projectMoneyEntrySelect)
        .single(),
    );

    return normalizeProjectMoneyEntry(row);
  },

  async delete(id) {
    return throwIfError(await requireSupabase().from('project_money_entries').delete().eq('id', id));
  },
};

export const dailyReviewApi = {
  async list(limit = 30) {
    return throwIfError(
      await requireSupabase()
        .from('daily_reviews')
        .select(dailyReviewSelect)
        .order('review_on', { ascending: false })
        .limit(limit),
    );
  },

  async getByDate(reviewOn) {
    return throwIfError(
      await requireSupabase()
        .from('daily_reviews')
        .select(dailyReviewSelect)
        .eq('review_on', reviewOn)
        .maybeSingle(),
    );
  },

  async create(payload) {
    return throwIfError(
      await requireSupabase()
        .from('daily_reviews')
        .insert(prepareDailyReviewPayload(payload))
        .select(dailyReviewSelect)
        .single(),
    );
  },

  async update(id, patch) {
    return throwIfError(
      await requireSupabase()
        .from('daily_reviews')
        .update(prepareDailyReviewPayload(patch))
        .eq('id', id)
        .select(dailyReviewSelect)
        .single(),
    );
  },

  async delete(id) {
    return throwIfError(await requireSupabase().from('daily_reviews').delete().eq('id', id));
  },
};

export const aiActionLogApi = {
  async list(limit = 10) {
    const { data, error } = await requireSupabase().auth.getSession();
    if (error) throw error;
    const token = data.session?.access_token;
    if (!token) throw new Error('Sign in before loading AI action history.');

    const response = await fetch(`/api/ai/actions?limit=${encodeURIComponent(limit)}`, {
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error || 'Failed to load AI action history.');
    }
    return payload.data?.logs ?? [];
  },
};

export const aiChatThreadApi = {
  async list(limit = 50) {
    return throwIfError(
      await requireSupabase()
        .from('ai_chat_threads')
        .select(aiChatThreadSelect)
        .order('updated_at', { ascending: false })
        .limit(limit),
    );
  },

  async create(payload = {}) {
    return throwIfError(
      await requireSupabase()
        .from('ai_chat_threads')
        .insert({
          title: payload.title?.trim() || 'New Chat',
          status: payload.status || 'active',
          metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
        })
        .select(aiChatThreadSelect)
        .single(),
    );
  },

  async update(id, patch) {
    return throwIfError(
      await requireSupabase()
        .from('ai_chat_threads')
        .update(prepareAiChatThreadPayload(patch))
        .eq('id', id)
        .select(aiChatThreadSelect)
        .single(),
    );
  },

  async archive(id) {
    return this.update(id, { status: 'archived' });
  },

  async delete(id) {
    return throwIfError(await requireSupabase().from('ai_chat_threads').delete().eq('id', id));
  },
};

export const aiChatMessageApi = {
  async list(threadId, { limit = 200 } = {}) {
    return throwIfError(
      await requireSupabase()
        .from('ai_chat_messages')
        .select(aiChatMessageSelect)
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true })
        .limit(limit),
    );
  },

  async create(payload) {
    return throwIfError(
      await requireSupabase()
        .from('ai_chat_messages')
        .insert(prepareAiChatMessagePayload(payload))
        .select(aiChatMessageSelect)
        .single(),
    );
  },

  async delete(id) {
    return throwIfError(await requireSupabase().from('ai_chat_messages').delete().eq('id', id));
  },
};

export const aiMemoryApi = {
  async list({ status = 'active', limit = 100 } = {}) {
    let query = requireSupabase()
      .from('ai_memories')
      .select(aiMemorySelect)
      .order('importance', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (status) query = query.eq('status', status);
    return throwIfError(await query);
  },

  async create(payload) {
    return throwIfError(
      await requireSupabase()
        .from('ai_memories')
        .insert(prepareAiMemoryPayload(payload))
        .select(aiMemorySelect)
        .single(),
    );
  },

  async update(id, patch) {
    return throwIfError(
      await requireSupabase()
        .from('ai_memories')
        .update(prepareAiMemoryPayload(patch))
        .eq('id', id)
        .select(aiMemorySelect)
        .single(),
    );
  },

  async archive(id) {
    return this.update(id, { status: 'archived' });
  },

  async delete(id) {
    return throwIfError(await requireSupabase().from('ai_memories').delete().eq('id', id));
  },
};

export const aiInsightApi = {
  async list({ status = 'active', limit = 30 } = {}) {
    let query = requireSupabase()
      .from('ai_insights')
      .select(aiInsightSelect)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (status) query = query.eq('status', status);
    return throwIfError(await query);
  },

  async archive(id) {
    return throwIfError(
      await requireSupabase()
        .from('ai_insights')
        .update({ status: 'archived' })
        .eq('id', id)
        .select(aiInsightSelect)
        .single(),
    );
  },
};

export const aiReportApi = {
  async list({ limit = 20, type = '', status = 'active' } = {}) {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if (type) params.set('type', type);
    if (status) params.set('status', status);
    const payload = await fetchAiReports(`/api/ai/reports?${params.toString()}`);
    return payload.documents ?? [];
  },

  async create(payload) {
    const result = await fetchAiReports('/api/ai/reports', {
      method: 'POST',
      body: JSON.stringify({
        action: 'create',
        ...prepareAiReportPayload(payload),
      }),
    });
    return result.document;
  },

  async archive(id) {
    const result = await fetchAiReports('/api/ai/reports', {
      method: 'POST',
      body: JSON.stringify({ action: 'archive', id }),
    });
    return result.document;
  },

  async saveMessage(payload) {
    const result = await fetchAiReports('/api/ai/reports', {
      method: 'POST',
      body: JSON.stringify({
        action: 'save_message',
        ...prepareAiReportPayload(payload),
      }),
    });
    return result.document;
  },

  async reembed(payload = {}) {
    const result = await fetchAiReports('/api/ai/reports', {
      method: 'POST',
      body: JSON.stringify({
        action: 'reembed',
        limit: payload.limit ?? 25,
        statuses: payload.statuses,
        includeWrongModel: payload.includeWrongModel ?? true,
      }),
    });
    return result.result;
  },
};

export const lifeosApi = {
  workouts: workoutApi,
  workoutSets: workoutSetApi,
  workoutTemplates: workoutTemplateApi,
  workoutTemplateExercises: workoutTemplateExerciseApi,
  healthLogs: healthLogApi,
  expenses: expenseApi,
  calendarEvents: calendarEventApi,
  memos: memoApi,
  projects: projectApi,
  projectSessions: projectSessionApi,
  projectMoneyEntries: projectMoneyEntryApi,
  dailyReviews: dailyReviewApi,
  aiActionLogs: aiActionLogApi,
  aiChatThreads: aiChatThreadApi,
  aiChatMessages: aiChatMessageApi,
  aiMemories: aiMemoryApi,
  aiInsights: aiInsightApi,
  aiReports: aiReportApi,
  chatMessages: {
    list: async () => throwIfError(await requireSupabase().from('chat_messages').select('*').order('created_at', { ascending: true })),
    create: async (payload) => throwIfError(await requireSupabase().from('chat_messages').insert(payload).select('*').single()),
    update: async (id, patch) => throwIfError(await requireSupabase().from('chat_messages').update(patch).eq('id', id).select('*').single()),
    delete: async (id) => throwIfError(await requireSupabase().from('chat_messages').delete().eq('id', id)),
  },
};

function prepareHealthLogPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  );
}

async function fetchAiReports(url, options = {}) {
  const { data, error } = await requireSupabase().auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in before using Brain Vault.');

  const response = await fetch(url, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || 'Brain Vault request failed.');
  }
  return payload.data ?? {};
}

function prepareAiReportPayload(payload = {}) {
  return {
    ...(payload.source_message_id || payload.sourceMessageId ? { source_message_id: payload.source_message_id ?? payload.sourceMessageId } : {}),
    ...(payload.content_md || payload.contentMd ? { content_md: payload.content_md ?? payload.contentMd } : {}),
    ...(payload.title !== undefined ? { title: payload.title } : {}),
    ...(payload.document_type || payload.documentType ? { document_type: payload.document_type ?? payload.documentType } : {}),
    ...(payload.source_type || payload.sourceType ? { source_type: payload.source_type ?? payload.sourceType } : {}),
    ...(payload.source_ref || payload.sourceRef ? { source_ref: payload.source_ref ?? payload.sourceRef } : {}),
    ...(payload.summary !== undefined ? { summary: payload.summary } : {}),
    ...(payload.tags !== undefined ? { tags: payload.tags } : {}),
    ...(payload.entities !== undefined ? { entities: payload.entities } : {}),
    ...(payload.metadata !== undefined ? { metadata: payload.metadata } : {}),
  };
}

async function recalculateHealthSleepAfterChange(client, loggedOn, changedFields) {
  const changed = new Set(changedFields);
  if (changed.has('wake_time')) await recalculateHealthSleepForDate(client, loggedOn);
  if (changed.has('sleep_start')) await recalculateHealthSleepForDate(client, addDays(loggedOn, 1));
}

async function recalculateHealthSleepForDate(client, loggedOn) {
  const previousDate = addDays(loggedOn, -1);
  const [previousResult, currentResult] = await Promise.all([
    client.from('health_logs').select('sleep_start').eq('logged_on', previousDate).maybeSingle(),
    client.from('health_logs').select('id, wake_time').eq('logged_on', loggedOn).maybeSingle(),
  ]);
  if (previousResult.error) throw previousResult.error;
  if (currentResult.error) throw currentResult.error;
  if (!currentResult.data) return null;

  const sleepHours = calculateSleepHoursFromTimes(previousResult.data?.sleep_start, currentResult.data.wake_time);
  return throwIfError(
    await client
      .from('health_logs')
      .update({ sleep_hours: sleepHours })
      .eq('id', currentResult.data.id)
      .select(healthLogSelect)
      .single(),
  );
}

function prepareExpensePayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  );
}

function prepareWorkoutSetPayload(payload) {
  return Object.fromEntries(
    Object.entries({
      ...payload,
      is_warmup: payload.is_warmup === undefined ? undefined : Boolean(payload.is_warmup),
      rpe: payload.rpe === undefined ? undefined : normalizeNullableNumber(payload.rpe),
    }).filter(([, value]) => value !== undefined),
  );
}

function prepareWorkoutPayload(payload) {
  return Object.fromEntries(
    Object.entries({
      ...payload,
      template_id: payload.template_id === undefined ? undefined : payload.template_id || null,
      template_snapshot: payload.template_snapshot === undefined
        ? undefined
        : Array.isArray(payload.template_snapshot) ? payload.template_snapshot : [],
    }).filter(([, value]) => value !== undefined),
  );
}

function prepareWorkoutTemplatePayload(payload) {
  return Object.fromEntries(
    Object.entries({
      ...payload,
      name: payload.name === undefined ? undefined : payload.name?.trim(),
      notes: payload.notes === undefined ? undefined : payload.notes?.trim() || null,
    }).filter(([, value]) => value !== undefined),
  );
}

function prepareWorkoutTemplateExercisePayload(payload) {
  return Object.fromEntries(
    Object.entries({
      ...payload,
      exercise: payload.exercise === undefined ? undefined : payload.exercise?.trim(),
      exercise_order: payload.exercise_order === undefined ? undefined : Number(payload.exercise_order),
      notes: payload.notes === undefined ? undefined : payload.notes?.trim() || null,
    }).filter(([, value]) => value !== undefined),
  );
}

function prepareCalendarEventPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  );
}

function prepareMemoPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  );
}

function prepareProjectPayload(payload) {
  return Object.fromEntries(
    Object.entries({
      ...payload,
      name: payload.name === undefined ? undefined : payload.name?.trim(),
      goal_label: payload.goal_label === undefined ? undefined : payload.goal_label?.trim() || null,
      unit_label: payload.unit_label === undefined ? undefined : payload.unit_label?.trim() || null,
      target_value: payload.target_value === undefined ? undefined : Number(payload.target_value),
      current_value: payload.current_value === undefined ? undefined : Number(payload.current_value),
      overall_cost: payload.overall_cost === undefined ? undefined : Number(payload.overall_cost),
      notes: payload.notes === undefined ? undefined : payload.notes?.trim() || null,
    }).filter(([, value]) => value !== undefined),
  );
}

function prepareProjectSessionPayload(payload) {
  return Object.fromEntries(
    Object.entries({
      ...payload,
      duration_minutes: payload.duration_minutes === undefined || payload.duration_minutes === null ? payload.duration_minutes : Number(payload.duration_minutes),
      progress_delta: payload.progress_delta === undefined ? undefined : Number(payload.progress_delta),
      target_output: payload.target_output === undefined ? undefined : payload.target_output?.trim() || null,
      proof_of_work: payload.proof_of_work === undefined ? undefined : payload.proof_of_work?.trim() || null,
    }).filter(([, value]) => value !== undefined),
  );
}

function prepareProjectMoneyEntryPayload(payload) {
  return Object.fromEntries(
    Object.entries({
      ...payload,
      type: payload.type === undefined ? undefined : payload.type,
      amount: payload.amount === undefined ? undefined : Number(payload.amount),
      description: payload.description === undefined ? undefined : payload.description?.trim() || null,
    }).filter(([, value]) => value !== undefined),
  );
}

function prepareDailyReviewPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  );
}

function prepareAiChatThreadPayload(payload) {
  return Object.fromEntries(
    Object.entries({
      ...payload,
      title: payload.title === undefined ? undefined : payload.title?.trim() || 'New Chat',
      status: payload.status === undefined ? undefined : payload.status,
      metadata: payload.metadata === undefined ? undefined : payload.metadata,
    }).filter(([, value]) => value !== undefined),
  );
}

function prepareAiChatMessagePayload(payload) {
  return Object.fromEntries(
    Object.entries({
      ...payload,
      content: payload.content?.trim(),
      metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
    }).filter(([, value]) => value !== undefined),
  );
}

function prepareAiMemoryPayload(payload) {
  return Object.fromEntries(
    Object.entries({
      ...payload,
      category: payload.category === undefined ? undefined : payload.category?.trim(),
      title: payload.title === undefined ? undefined : payload.title?.trim(),
      content: payload.content === undefined ? undefined : payload.content?.trim(),
      confidence: payload.confidence === undefined ? undefined : Number(payload.confidence),
      importance: payload.importance === undefined ? undefined : Number(payload.importance),
      metadata: payload.metadata === undefined ? undefined : payload.metadata,
    }).filter(([, value]) => value !== undefined),
  );
}

function normalizeWorkouts(rows = []) {
  return rows.map(normalizeWorkout);
}

function normalizeWorkout(row) {
  return {
    ...row,
    template_snapshot: Array.isArray(row.template_snapshot) ? row.template_snapshot : [],
    workout_sets: [...(row.workout_sets ?? [])]
      .map((set) => ({
        ...set,
        is_warmup: Boolean(set.is_warmup),
        rpe: set.rpe === null || set.rpe === undefined ? null : Number(set.rpe),
      }))
      .sort(compareWorkoutSetOrder),
  };
}

function normalizeNullableNumber(value) {
  if (value === null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function compareWorkoutSetOrder(a, b) {
  const aTime = new Date(a.performed_at ?? a.created_at ?? 0).getTime();
  const bTime = new Date(b.performed_at ?? b.created_at ?? 0).getTime();
  if (aTime !== bTime) return aTime - bTime;
  if (Boolean(a.is_warmup) !== Boolean(b.is_warmup)) return Boolean(a.is_warmup) ? -1 : 1;
  if (Number(a.set_number) !== Number(b.set_number)) return Number(a.set_number) - Number(b.set_number);
  return String(a.id).localeCompare(String(b.id));
}

function normalizeWorkoutTemplates(rows = []) {
  return rows.map(normalizeWorkoutTemplate).sort(compareWorkoutTemplates);
}

function normalizeWorkoutTemplate(row) {
  return {
    ...row,
    workout_template_exercises: [...(row.workout_template_exercises ?? [])].sort(compareWorkoutTemplateExerciseOrder),
  };
}

function compareWorkoutTemplates(a, b) {
  return String(a.name ?? '').localeCompare(String(b.name ?? ''));
}

function compareWorkoutTemplateExerciseOrder(a, b) {
  if (Number(a.exercise_order) !== Number(b.exercise_order)) return Number(a.exercise_order) - Number(b.exercise_order);
  return String(a.id).localeCompare(String(b.id));
}

function normalizeProjects(rows = []) {
  return rows.map(normalizeProject);
}

function normalizeProject(row) {
  return {
    ...row,
    target_value: Number(row.target_value ?? 0),
    current_value: Number(row.current_value ?? 0),
    overall_cost: Number(row.overall_cost ?? 0),
    project_sessions: normalizeProjectSessions(row.project_sessions ?? []),
  };
}

function normalizeProjectSessions(rows = []) {
  return rows.map(normalizeProjectSession).sort(compareProjectSessions);
}

function normalizeProjectSession(row) {
  return {
    ...row,
    duration_minutes: row.duration_minutes === null || row.duration_minutes === undefined ? null : Number(row.duration_minutes),
    progress_delta: Number(row.progress_delta ?? 0),
  };
}

function compareProjectSessions(a, b) {
  return new Date(b.started_at ?? b.created_at ?? 0) - new Date(a.started_at ?? a.created_at ?? 0);
}

function normalizeProjectMoneyEntries(rows = []) {
  return rows.map(normalizeProjectMoneyEntry).sort(compareProjectMoneyEntries);
}

function normalizeProjectMoneyEntry(row) {
  return {
    ...row,
    amount: Number(row.amount ?? 0),
  };
}

function compareProjectMoneyEntries(a, b) {
  if ((a.entry_date || '') !== (b.entry_date || '')) return String(b.entry_date || '').localeCompare(String(a.entry_date || ''));
  return new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0);
}
