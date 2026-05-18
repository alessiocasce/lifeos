import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';

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
          notes: payload.notes || null,
        })
        .select(workoutSelect)
        .single(),
    );

    return normalizeWorkout(row);
  },

  async update(id, patch) {
    const row = throwIfError(
      await requireSupabase().from('workouts').update(patch).eq('id', id).select(workoutSelect).single(),
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
          rpe: Number(payload.rpe),
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
    return throwIfError(
      await requireSupabase()
        .from('health_logs')
        .insert(prepareHealthLogPayload(payload))
        .select(healthLogSelect)
        .single(),
    );
  },

  async update(id, patch) {
    return throwIfError(
      await requireSupabase()
        .from('health_logs')
        .update(prepareHealthLogPayload(patch))
        .eq('id', id)
        .select(healthLogSelect)
        .single(),
    );
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

export const lifeosApi = {
  workouts: workoutApi,
  workoutSets: workoutSetApi,
  workoutTemplates: workoutTemplateApi,
  workoutTemplateExercises: workoutTemplateExerciseApi,
  healthLogs: healthLogApi,
  expenses: expenseApi,
  calendarEvents: calendarEventApi,
  dailyReviews: dailyReviewApi,
  aiActionLogs: aiActionLogApi,
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

function prepareDailyReviewPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  );
}

function normalizeWorkouts(rows = []) {
  return rows.map(normalizeWorkout);
}

function normalizeWorkout(row) {
  return {
    ...row,
    workout_sets: [...(row.workout_sets ?? [])]
      .map((set) => ({ ...set, is_warmup: Boolean(set.is_warmup) }))
      .sort(compareWorkoutSetOrder),
  };
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
