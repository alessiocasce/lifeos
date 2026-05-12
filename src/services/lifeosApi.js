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
    weight,
    reps,
    rpe,
    performed_at,
    notes,
    created_at,
    updated_at
  )
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
          weight: Number(payload.weight),
          reps: Number(payload.reps),
          rpe: Number(payload.rpe),
          performed_at: payload.performed_at,
          notes: payload.notes || null,
        })
        .select(
          'id, user_id, workout_id, exercise, set_number, weight, reps, rpe, performed_at, notes, created_at, updated_at',
        )
        .single(),
    );
  },

  async update(id, patch) {
    return throwIfError(
      await requireSupabase()
        .from('workout_sets')
        .update(patch)
        .eq('id', id)
        .select(
          'id, user_id, workout_id, exercise, set_number, weight, reps, rpe, performed_at, notes, created_at, updated_at',
        )
        .single(),
    );
  },

  async delete(id) {
    return throwIfError(await requireSupabase().from('workout_sets').delete().eq('id', id));
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

export const lifeosApi = {
  workouts: workoutApi,
  workoutSets: workoutSetApi,
  healthLogs: healthLogApi,
  expenses: expenseApi,
  dailyReviews: {
    list: async () => throwIfError(await requireSupabase().from('daily_reviews').select('*').order('review_on', { ascending: false })),
    create: async (payload) => throwIfError(await requireSupabase().from('daily_reviews').insert(payload).select('*').single()),
    update: async (id, patch) => throwIfError(await requireSupabase().from('daily_reviews').update(patch).eq('id', id).select('*').single()),
    delete: async (id) => throwIfError(await requireSupabase().from('daily_reviews').delete().eq('id', id)),
  },
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

function normalizeWorkouts(rows = []) {
  return rows.map(normalizeWorkout);
}

function normalizeWorkout(row) {
  return {
    ...row,
    workout_sets: [...(row.workout_sets ?? [])].sort((a, b) => {
      if (a.performed_at !== b.performed_at) return new Date(b.performed_at) - new Date(a.performed_at);
      return Number(a.set_number) - Number(b.set_number);
    }),
  };
}
