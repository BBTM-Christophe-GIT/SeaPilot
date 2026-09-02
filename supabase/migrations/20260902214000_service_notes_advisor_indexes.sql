-- Cover every QHSE service-note foreign key used by cascading deletes and joins.

create index qhse_service_notes_author_person_idx
  on public.qhse_service_notes (author_person_id);
create index qhse_service_notes_created_by_idx
  on public.qhse_service_notes (created_by);
create index qhse_service_notes_published_by_idx
  on public.qhse_service_notes (published_by);
create index qhse_service_notes_vessel_idx
  on public.qhse_service_notes (vessel_id);

create index qhse_service_note_attachments_company_idx
  on public.qhse_service_note_attachments (company_id);
create index qhse_service_note_attachments_created_by_idx
  on public.qhse_service_note_attachments (created_by);
create index qhse_service_note_attachments_note_company_idx
  on public.qhse_service_note_attachments (note_id, company_id);

create index qhse_service_note_recipients_company_idx
  on public.qhse_service_note_recipients (company_id);
create index qhse_service_note_recipients_note_company_idx
  on public.qhse_service_note_recipients (note_id, company_id);
create index qhse_service_note_recipients_person_idx
  on public.qhse_service_note_recipients (person_id);

create index qhse_service_note_signatures_company_idx
  on public.qhse_service_note_signatures (company_id);
create index qhse_service_note_signatures_note_company_idx
  on public.qhse_service_note_signatures (note_id, company_id);
create index qhse_service_note_signatures_person_idx
  on public.qhse_service_note_signatures (person_id);
create index qhse_service_note_signatures_recipient_company_idx
  on public.qhse_service_note_signatures (recipient_id, company_id);
create index qhse_service_note_signatures_signature_version_idx
  on public.qhse_service_note_signatures (signature_version_id);
create index qhse_service_note_signatures_user_idx
  on public.qhse_service_note_signatures (user_id);
