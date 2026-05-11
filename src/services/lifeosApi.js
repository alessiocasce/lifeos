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

export const workoutSetApi = {
  async list(limit = 50) {
    const client = requireSupabase();
    return throwIfError(
      await client
        .from('workout_sets')
        .select('id, workout_id, exercise, weight, reps, rpe, performed_at, notes, created_at, updated_at')
        .order('performed_at', { ascending: false })
        .limit(limit),
    );
  },

  async create(payload) {
    const client = requireSupabase();
    return throwIfError(
      await client
        .from('workout_sets')
        .insert({
          exercise: payload.exercise,
          weight: Number(payload.weight),
          reps: Number(payload.reps),
          rpe: Number(payload.rpe),
          performed_at: new Date(payload.date).toISOString(),
          notes: payload.notes || null,
        })
        .select('id, workout_id, exercise, weight, reps, rpe, performed_at, notes, created_at, updated_at')
        .single(),
    );
  },

  async update(id, patch) {
    const client = requireSupabase();
    return throwIfError(
      await client
        .from('workout_sets')
        .update(patch)
        .eq('id', id)
        .select('id, workout_id, exercise, weight, reps, rpe, performed_at, notes, created_at, updated_at')
        .single(),
    );
  },

  async delete(id) {
    const client = requireSupabase();
    return throwIfError(await client.from('workout_sets').delete().eq('id', id));
  },
};

export const lifeosApi = {
  workouts: {
    list: async () => throwIfError(await requireSupabase().from('workouts').select('*').order('performed_on', { ascending: false })),
    create: async (payload) => throwIfError(await requireSupabase().from('workouts').insert(payload).select('*').single()),
    update: async (id, patch) => throwIfError(await requireSupabase().from('workouts').update(patch).eq('id', id).select('*').single()),
    delete: async (id) => throwIfError(await requireSupabase().from('workouts').delete().eq('id', id)),
  },
  workoutSets: workoutSetApi,
  healthLogs: {
    list: async () => throwIfError(await requireSupabase().from('health_logs').select('*').order('logged_on', { ascending: false })),
    create: async (payload) => throwIfError(await requireSupabase().from('health_logs').insert(payload).select('*').single()),
    update: async (id, patch) => throwIfError(await requireSupabase().from('health_logs').update(patch).eq('id', id).select('*').single()),
    delete: async (id) => throwIfError(await requireSupabase().from('health_logs').delete().eq('id', id)),
  },
  expenses: {
    list: async () => throwIfError(await requireSupabase().from('expenses').select('*').order('spent_on', { ascending: false })),
    create: async (payload) => throwIfError(await requireSupabase().from('expenses').insert(payload).select('*').single()),
    update: async (id, patch) => throwIfError(await requireSupabase().from('expenses').update(patch).eq('id', id).select('*').single()),
    delete: async (id) => throwIfError(await requireSupabase().from('expenses').delete().eq('id', id)),
  },
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
