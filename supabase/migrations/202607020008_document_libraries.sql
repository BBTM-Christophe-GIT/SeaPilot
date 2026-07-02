do $$
declare
  document_table text;
  document_tables text[] := array[
    'document_assets',
    'fleet_documents',
    'work_permits',
    'work_time_documents',
    'document_archive',
    'service_notes',
    'safety_alerts',
    'technical_documents',
    'vessel_equipment_documents',
    'lifting_reports',
    'shared_documents'
  ];
begin
  foreach document_table in array document_tables loop
    execute format($sql$
      create table if not exists public.%I (
        id bigint generated always as identity primary key,
        person_id bigint references public.people(id) on delete set null,
        person_sharepoint_item_id text,
        person_name text,
        vessel_id bigint references public.vessels(id) on delete set null,
        vessel_sharepoint_item_id text,
        vessel_name text,
        category_key text,
        document_date date,
        expires_on date,
        revision_label text,
        status text,
        title text not null,
        source_label text not null default 'sharepoint',
        source_sharepoint_id text,
        file_url text,
        notes text,
        sharepoint_site_url text,
        sharepoint_list_id text,
        sharepoint_list_title text,
        sharepoint_item_id text,
        sharepoint_unique_id text,
        sharepoint_file_ref text,
        sharepoint_encoded_abs_url text,
        source_modified_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    $sql$, document_table);

    execute format('create index if not exists %I on public.%I (person_id)', document_table || '_person_id_idx', document_table);
    execute format('create index if not exists %I on public.%I (person_sharepoint_item_id)', document_table || '_person_sharepoint_item_id_idx', document_table);
    execute format('create index if not exists %I on public.%I (public.normalize_import_label(person_name))', document_table || '_person_name_normalized_idx', document_table);
    execute format('create index if not exists %I on public.%I (vessel_id)', document_table || '_vessel_id_idx', document_table);
    execute format('create index if not exists %I on public.%I (vessel_sharepoint_item_id)', document_table || '_vessel_sharepoint_item_id_idx', document_table);
    execute format('create index if not exists %I on public.%I (public.normalize_import_label(vessel_name))', document_table || '_vessel_name_normalized_idx', document_table);
    execute format('create index if not exists %I on public.%I (category_key)', document_table || '_category_key_idx', document_table);
    execute format('create index if not exists %I on public.%I (document_date)', document_table || '_document_date_idx', document_table);
    execute format('create index if not exists %I on public.%I (expires_on)', document_table || '_expires_on_idx', document_table);
    execute format('create index if not exists %I on public.%I (status)', document_table || '_status_idx', document_table);
    execute format('create index if not exists %I on public.%I (sharepoint_list_id, sharepoint_item_id)', document_table || '_sharepoint_item_idx', document_table);
    execute format('create unique index if not exists %I on public.%I (sharepoint_list_id, sharepoint_item_id)', document_table || '_sharepoint_item_unique_idx', document_table);

    execute format('grant select, insert, update, delete on public.%I to authenticated', document_table);
    execute format('grant usage on sequence public.%I to authenticated', document_table || '_id_seq');
    execute format('alter table public.%I enable row level security', document_table);

    execute format('drop policy if exists %I on public.%I', document_table || '_role_read', document_table);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select public.has_any_role(array[''admin'', ''direction'', ''armement'', ''capitaine'', ''marin''])))',
      document_table || '_role_read',
      document_table
    );

    execute format('drop policy if exists %I on public.%I', document_table || '_office_write', document_table);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select public.has_any_role(array[''admin'', ''direction'', ''armement'']))) with check ((select public.has_any_role(array[''admin'', ''direction'', ''armement''])))',
      document_table || '_office_write',
      document_table
    );
  end loop;
end;
$$;

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
  ('library-logos-systeme', 'Nom fichier', 'FileLeafRef', 'Text', 'document_assets', 'title', true, null),
  ('library-logos-systeme', 'URL fichier', 'EncodedAbsUrl', 'Text/Url', 'document_assets', 'file_url', false, null),
  ('library-vehicules', 'Navire SharePoint ID', 'NavireId', 'Lookup', 'fleet_documents', 'vessel_sharepoint_item_id', false, null),
  ('library-vehicules', 'Navire', 'Navire', 'Lookup/Text', 'fleet_documents', 'vessel_name', false, null),
  ('library-vehicules', 'Nom fichier', 'FileLeafRef', 'Text', 'fleet_documents', 'title', true, null),
  ('library-permis-travail', 'Navire SharePoint ID', 'NavireId', 'Lookup', 'work_permits', 'vessel_sharepoint_item_id', false, null),
  ('library-permis-travail', 'Navire', 'Navire', 'Lookup/Text', 'work_permits', 'vessel_name', false, null),
  ('library-permis-travail', 'Categorie', 'Categorie', 'Choice/Text', 'work_permits', 'category_key', false, null),
  ('library-permis-travail', 'Nom fichier', 'FileLeafRef', 'Text', 'work_permits', 'title', true, null),
  ('library-suivi-temps-travail', 'Collaborateur SharePoint ID', 'CollaborateurId', 'Lookup', 'work_time_documents', 'person_sharepoint_item_id', false, null),
  ('library-suivi-temps-travail', 'Collaborateur', 'Collaborateur', 'Lookup/Text', 'work_time_documents', 'person_name', false, null),
  ('library-suivi-temps-travail', 'Nom fichier', 'FileLeafRef', 'Text', 'work_time_documents', 'title', true, null),
  ('library-archive-documentaire', 'Categorie', 'Categorie', 'Choice/Text', 'document_archive', 'category_key', false, null),
  ('library-archive-documentaire', 'Nom fichier', 'FileLeafRef', 'Text', 'document_archive', 'title', true, null),
  ('library-notes-service', 'Date document', 'DateDocument', 'DateTime', 'service_notes', 'document_date', false, null),
  ('library-notes-service', 'Nom fichier', 'FileLeafRef', 'Text', 'service_notes', 'title', true, null),
  ('library-alerte-securite', 'Date document', 'DateDocument', 'DateTime', 'safety_alerts', 'document_date', false, null),
  ('library-alerte-securite', 'Categorie', 'Categorie', 'Choice/Text', 'safety_alerts', 'category_key', false, null),
  ('library-alerte-securite', 'Nom fichier', 'FileLeafRef', 'Text', 'safety_alerts', 'title', true, null),
  ('library-documentation-technique', 'Navire SharePoint ID', 'NavireId', 'Lookup', 'technical_documents', 'vessel_sharepoint_item_id', false, null),
  ('library-documentation-technique', 'Navire', 'Navire', 'Lookup/Text', 'technical_documents', 'vessel_name', false, null),
  ('library-documentation-technique', 'Collaborateur SharePoint ID', 'CollaborateurId', 'Lookup', 'technical_documents', 'person_sharepoint_item_id', false, null),
  ('library-documentation-technique', 'Collaborateur', 'Collaborateur', 'Lookup/Text', 'technical_documents', 'person_name', false, null),
  ('library-documentation-technique', 'Categorie', 'Categorie', 'Choice/Text', 'technical_documents', 'category_key', false, null),
  ('library-documentation-technique', 'Nom fichier', 'FileLeafRef', 'Text', 'technical_documents', 'title', true, null),
  ('library-fiche-navire-equipement', 'Navire SharePoint ID', 'NavireId', 'Lookup', 'vessel_equipment_documents', 'vessel_sharepoint_item_id', false, null),
  ('library-fiche-navire-equipement', 'Navire', 'Navire', 'Lookup/Text', 'vessel_equipment_documents', 'vessel_name', false, null),
  ('library-fiche-navire-equipement', 'Nom fichier', 'FileLeafRef', 'Text', 'vessel_equipment_documents', 'title', true, null),
  ('library-registre-apparaux-levage', 'Navire SharePoint ID', 'NavireId', 'Lookup', 'lifting_reports', 'vessel_sharepoint_item_id', false, null),
  ('library-registre-apparaux-levage', 'Navire', 'Navire', 'Lookup/Text', 'lifting_reports', 'vessel_name', false, null),
  ('library-registre-apparaux-levage', 'Date echeance', 'DateEcheance', 'DateTime', 'lifting_reports', 'expires_on', false, null),
  ('library-registre-apparaux-levage', 'Nom fichier', 'FileLeafRef', 'Text', 'lifting_reports', 'title', true, null),
  ('library-documents-partages', 'Categorie', 'Categorie', 'Choice/Text', 'shared_documents', 'category_key', false, null),
  ('library-documents-partages', 'Nom fichier', 'FileLeafRef', 'Text', 'shared_documents', 'title', true, null)
on conflict (source_key, internal_name, target_table, target_column) do update
set field_label = excluded.field_label,
    data_type = excluded.data_type,
    required = excluded.required,
    notes = excluded.notes,
    updated_at = now();

create or replace function public.resolve_sharepoint_document_links()
returns table (
  target_table text,
  resolved_people integer,
  resolved_vessels integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  document_table text;
  person_count integer;
  vessel_count integer;
  document_tables text[] := array[
    'document_assets',
    'fleet_documents',
    'work_permits',
    'work_time_documents',
    'document_archive',
    'service_notes',
    'safety_alerts',
    'technical_documents',
    'vessel_equipment_documents',
    'lifting_reports',
    'shared_documents'
  ];
begin
  foreach document_table in array document_tables loop
    execute format($sql$
      update public.%I document
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
              public.normalize_import_label(document.person_name) = public.normalize_import_label(concat_ws(' ', person.first_name, person.last_name))
              or public.normalize_import_label(document.person_name) = public.normalize_import_label(concat_ws(' ', person.last_name, person.first_name))
              or public.normalize_import_label(document.person_name) = public.normalize_import_label(person.email)
            )
          )
        )
    $sql$, document_table);

    get diagnostics person_count = row_count;

    execute format($sql$
      update public.%I document
      set vessel_id = vessel.id,
          updated_at = now()
      from public.vessels vessel
      where document.vessel_id is null
        and (
          (
            document.vessel_sharepoint_item_id is not null
            and vessel.sharepoint_item_id = document.vessel_sharepoint_item_id
          )
          or (
            public.normalize_import_label(document.vessel_name) is not null
            and (
              public.normalize_import_label(document.vessel_name) = public.normalize_import_label(vessel.name)
              or public.normalize_import_label(document.vessel_name) = public.normalize_import_label(vessel.acronym)
            )
          )
        )
    $sql$, document_table);

    get diagnostics vessel_count = row_count;

    target_table := document_table;
    resolved_people := person_count;
    resolved_vessels := vessel_count;
    return next;
  end loop;
end;
$$;

revoke all on function public.resolve_sharepoint_document_links() from public;
grant execute on function public.resolve_sharepoint_document_links() to authenticated;
