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
const publicationChronology = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260903044914_service_notes_publication_chronology.sql'),
  'utf8',
);
const recallLifecycle = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260903053700_service_notes_recall_and_draft_delete.sql'),
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

  it('allocates chronology under lock only when the note is published', () => {
    expect(publicationChronology).toContain("target_company_id,\n    '',");
    expect(publicationChronology).toContain("pg_advisory_xact_lock");
    expect(publicationChronology).toContain("note.id <> target_note.id");
    expect(publicationChronology).toContain("set chronology_code = format('NS %s-%s'");
  });

  it('returns the KROKDUR import to a private, unsigned draft', () => {
    expect(publicationChronology).toContain("chronology_code = 'NS 07-26-KROKDUR'");
    expect(publicationChronology).toContain("set status = 'draft'");
    expect(publicationChronology).toContain('published_at = null');
    expect(publicationChronology).toContain('delete from public.qhse_service_note_recipients');
    expect(publicationChronology).toContain('delete from public.qhse_service_note_signatures');
  });

  it('makes recalled notes manager-only and removes their active chronology code', () => {
    expect(recallLifecycle).toContain("status in ('draft', 'recalled')");
    expect(recallLifecycle).toContain('set last_recalled_chronology_code = target_note.chronology_code');
    expect(recallLifecycle).toContain("chronology_code = ''");
    expect(recallLifecycle).toContain("status = 'recalled'");
    expect(recallLifecycle).toContain("array['admin', 'direction']");
    expect(recallLifecycle).toContain('service_note_can_read(note_id)');
  });

  it('allows only the latest published note to be recalled under a lifecycle lock', () => {
    expect(recallLifecycle).toContain('create or replace function public.recall_service_note');
    expect(recallLifecycle).toContain("format('service-notes-lifecycle:%s'");
    expect(recallLifecycle).toContain("note.status = 'published'");
    expect(recallLifecycle).toContain('order by note.published_at desc nulls last, note.id desc');
    expect(recallLifecycle).toContain("message = 'SERVICE_NOTE_RECALL_LATEST_ONLY.'");
  });

  it('restarts distribution when recalled and permanently deletes only private drafts', () => {
    expect(recallLifecycle).toContain("if target_note.status = 'recalled' then");
    expect(recallLifecycle).toContain('delete from public.qhse_service_note_signatures');
    expect(recallLifecycle).toContain('delete from public.qhse_service_note_recipients');
    expect(recallLifecycle).toContain('create or replace function public.delete_service_note_draft');
    expect(recallLifecycle).toContain("target_note.status <> 'draft'");
    expect(recallLifecycle).toContain('grant execute on function public.delete_service_note_draft(bigint) to authenticated');
  });
});
