import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve('supabase/migrations/20260903123000_fleet_finding_corrective_action.sql'), 'utf8');

describe('fleet certificate corrective action database contract', () => {
  it('stores corrective actions as non-null rich-text content', () => {
    expect(migration).toContain('add column if not exists corrective_action text not null default');
    expect(migration).toContain('comment on column public.fleet_certificate_findings.corrective_action');
  });
});
