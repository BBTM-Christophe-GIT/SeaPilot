import { describe, expect, it } from 'vitest';
import { readRequiredEnv } from './env';

describe('readRequiredEnv', () => {
  it('returns a configured value', () => {
    expect(readRequiredEnv({ VITE_SUPABASE_URL: 'https://example.supabase.co' }, 'VITE_SUPABASE_URL')).toBe(
      'https://example.supabase.co',
    );
  });

  it('throws a clear error when a value is missing', () => {
    expect(() => readRequiredEnv({}, 'VITE_SUPABASE_URL')).toThrow(
      'Missing required environment variable: VITE_SUPABASE_URL',
    );
  });
});
