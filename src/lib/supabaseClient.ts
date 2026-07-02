import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadAppEnv, type EnvSource } from './env';

let cachedClient: SupabaseClient | null = null;

export function createSupabaseBrowserClient(source?: EnvSource): SupabaseClient {
  const env = loadAppEnv(source);

  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

export function getSupabaseClient(): SupabaseClient {
  if (!cachedClient) {
    cachedClient = createSupabaseBrowserClient();
  }

  return cachedClient;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, property, receiver) {
    const client = getSupabaseClient();
    const value = Reflect.get(client, property, receiver);

    return typeof value === 'function' ? value.bind(client) : value;
  },
});
