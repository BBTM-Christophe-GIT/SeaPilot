alter table public.hr_documents
  alter column person_id drop not null,
  add column if not exists person_sharepoint_item_id text,
  add column if not exists person_name text;

create unique index if not exists people_sharepoint_item_unique_idx
  on public.people (sharepoint_list_id, sharepoint_item_id);

create unique index if not exists vessels_sharepoint_item_unique_idx
  on public.vessels (sharepoint_list_id, sharepoint_item_id);

create unique index if not exists planning_assignments_sharepoint_item_unique_idx
  on public.planning_assignments (sharepoint_list_id, sharepoint_item_id);

create unique index if not exists hr_documents_sharepoint_item_unique_idx
  on public.hr_documents (sharepoint_list_id, sharepoint_item_id);

create unique index if not exists planning_days_sharepoint_item_unique_full_idx
  on public.planning_days (sharepoint_list_id, sharepoint_item_id);

create unique index if not exists planning_periods_sharepoint_item_unique_full_idx
  on public.planning_periods (sharepoint_list_id, sharepoint_item_id);

create unique index if not exists planning_projects_sharepoint_item_unique_full_idx
  on public.planning_projects (sharepoint_list_id, sharepoint_item_id);

create index if not exists hr_documents_person_sharepoint_item_id_idx
  on public.hr_documents (person_sharepoint_item_id);

create index if not exists hr_documents_person_name_normalized_idx
  on public.hr_documents (public.normalize_import_label(person_name));

insert into public.sharepoint_field_mappings (
  source_key,
  field_label,
  internal_name,
  data_type,
  target_table,
  target_column,
  required,
  notes
)
values
  ('library-brevets-visites-medicales', 'Collaborateur SharePoint ID', 'CollaborateurId', 'Lookup', 'hr_documents', 'person_sharepoint_item_id', false, null),
  ('library-brevets-visites-medicales', 'Collaborateur', 'Collaborateur', 'Lookup/Text', 'hr_documents', 'person_name', false, null),
  ('library-brevets-visites-medicales', 'URL fichier', 'EncodedAbsUrl', 'Text/Url', 'hr_documents', 'file_url', false, null),
  ('library-brevets-visites-medicales', 'Chemin fichier', 'FileRef', 'Text', 'hr_documents', 'notes', false, null)
on conflict (source_key, internal_name, target_table, target_column) do update
set field_label = excluded.field_label,
    data_type = excluded.data_type,
    required = excluded.required,
    notes = excluded.notes,
    updated_at = now();

create or replace function public.resolve_sharepoint_hr_document_links()
returns table (
  target_table text,
  resolved_documents integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  resolved_count integer := 0;
begin
  update public.hr_documents document
  set person_id = person.id,
      updated_at = now()
  from public.people person
  where document.person_id is null
    and (
      (
        document.person_sharepoint_item_id is not null
        and person.sharepoint_item_id = document.person_sharepoint_item_id
      )
      or (
        public.normalize_import_label(document.person_name) is not null
        and (
          public.normalize_import_label(document.person_name) =
            public.normalize_import_label(concat_ws(' ', person.first_name, person.last_name))
          or public.normalize_import_label(document.person_name) =
            public.normalize_import_label(concat_ws(' ', person.last_name, person.first_name))
        )
      )
    );

  get diagnostics resolved_count = row_count;

  return query
  values ('hr_documents', resolved_count);
end;
$$;

revoke all on function public.resolve_sharepoint_hr_document_links() from public;
grant execute on function public.resolve_sharepoint_hr_document_links() to authenticated;
