import { createClient } from '@supabase/supabase-js';
import { loadAppEnv } from './env';

const env = loadAppEnv();

export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
