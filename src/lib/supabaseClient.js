import { createClient } from '@supabase/supabase-js';
import { SUPABASE_AUTH_OPTIONS } from './authRedirect';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey, { auth: SUPABASE_AUTH_OPTIONS }) : null;
