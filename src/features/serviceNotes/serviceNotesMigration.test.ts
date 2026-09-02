import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260902205314_service_notes_shared_signature_workflow.sql'),
  'utf8',
);
const advisorIndexes = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260902214000_service_notes_advisor_indexes.sql'),
  'utf8',
);

describe('QHSE service notes database contract', () => {
  it('isolates the module from the pre-existing legacy service_notes table', () => {
    expect(migration).toContain('create table public.qhse_service_notes');
    expect(migration).not.toContain('create table public.service_notes');
  });

  it('protects drafts and grants published-note access to real company profiles', () => {
    expect(migration).toContain("note.status = 'draft'");
    expect(migration).toContain("public.has_company_role(note.company_id, array['admin', 'direction'])");
    expect(migration).toContain("note.status in ('published', 'archived')");
    expect(migration).toContain('public.user_belongs_to_company(note.company_id)');
    expect(migration).toContain("'serviceNotes'::text as module_key, true as is_visible");
  });

  it('creates all recipients and only one immutable signature per account on the shared note', () => {
    expect(migration).toContain('from public.company_memberships membership');
    expect(migration).toContain('from public.profiles profile');
    expect(migration).toContain('qhse_service_note_signatures_unique_user unique (note_id, user_id)');
    expect(migration).toContain('clock_timestamp()');
    expect(migration).toContain("message = 'SERVICE_NOTE_ACTIVE_SIGNATURE_REQUIRED.'");
  });

  it('enables RLS and explicitly exposes only the authenticated Data API surface', () => {
    for (const table of ['qhse_service_notes', 'qhse_service_note_attachments', 'qhse_service_note_recipients', 'qhse_service_note_signatures']) {
      expect(migration).toContain(`alter table public.${table} enable row level security;`);
      expect(migration).toContain(`revoke all on table public.${table} from anon, authenticated;`);
    }
    expect(migration).toContain("values ('service-note-files', 'service-note-files', false, 52428800, null)");
  });

  it('covers the composite and direct foreign keys used by the shared register', () => {
    expect(advisorIndexes).toContain('qhse_service_note_attachments_note_company_idx');
    expect(advisorIndexes).toContain('qhse_service_note_recipients_note_company_idx');
    expect(advisorIndexes).toContain('qhse_service_note_signatures_recipient_company_idx');
    expect(advisorIndexes).toContain('qhse_service_note_signatures_signature_version_idx');
  });
});
