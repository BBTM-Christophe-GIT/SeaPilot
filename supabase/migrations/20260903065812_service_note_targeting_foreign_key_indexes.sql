create index if not exists qhse_service_note_target_vessels_company_idx
  on public.qhse_service_note_target_vessels (company_id);

create index if not exists qhse_service_note_target_vessels_note_company_idx
  on public.qhse_service_note_target_vessels (note_id, company_id);

create index if not exists qhse_service_note_target_vessels_vessel_idx
  on public.qhse_service_note_target_vessels (vessel_id);

create index if not exists qhse_service_note_target_people_company_idx
  on public.qhse_service_note_target_people (company_id);

create index if not exists qhse_service_note_target_people_note_company_idx
  on public.qhse_service_note_target_people (note_id, company_id);

create index if not exists qhse_service_note_target_people_person_idx
  on public.qhse_service_note_target_people (person_id);

create index if not exists qhse_service_notes_last_recalled_by_idx
  on public.qhse_service_notes (last_recalled_by);
