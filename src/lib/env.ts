export type EnvSource = Record<string, string | boolean | undefined>;

export interface AppEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
  appBaseUrl: string;
}

export function readRequiredEnv(source: EnvSource, key: string): string {
  const value = source[key];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

export function loadAppEnv(source: EnvSource = import.meta.env): AppEnv {
  return {
    supabaseUrl: readRequiredEnv(source, 'VITE_SUPABASE_URL'),
    supabaseAnonKey: readRequiredEnv(source, 'VITE_SUPABASE_ANON_KEY'),
    appBaseUrl: readRequiredEnv(source, 'VITE_APP_BASE_URL'),
  };
}
