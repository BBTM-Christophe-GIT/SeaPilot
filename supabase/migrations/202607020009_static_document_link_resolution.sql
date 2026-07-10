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
  person_count integer;
  vessel_count integer;
begin
  update public.document_assets document
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
    );
  get diagnostics person_count = row_count;

  update public.document_assets document
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
    );
  get diagnostics vessel_count = row_count;
  return query values ('document_assets', person_count, vessel_count);

  update public.fleet_documents document
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
    );
  get diagnostics person_count = row_count;

  update public.fleet_documents document
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
    );
  get diagnostics vessel_count = row_count;
  return query values ('fleet_documents', person_count, vessel_count);

  update public.work_permits document
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
    );
  get diagnostics person_count = row_count;

  update public.work_permits document
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
    );
  get diagnostics vessel_count = row_count;
  return query values ('work_permits', person_count, vessel_count);

  update public.work_time_documents document
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
    );
  get diagnostics person_count = row_count;

  update public.work_time_documents document
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
    );
  get diagnostics vessel_count = row_count;
  return query values ('work_time_documents', person_count, vessel_count);

  update public.document_archive document
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
    );
  get diagnostics person_count = row_count;

  update public.document_archive document
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
    );
  get diagnostics vessel_count = row_count;
  return query values ('document_archive', person_count, vessel_count);

  update public.service_notes document
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
    );
  get diagnostics person_count = row_count;

  update public.service_notes document
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
    );
  get diagnostics vessel_count = row_count;
  return query values ('service_notes', person_count, vessel_count);

  update public.safety_alerts document
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
    );
  get diagnostics person_count = row_count;

  update public.safety_alerts document
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
    );
  get diagnostics vessel_count = row_count;
  return query values ('safety_alerts', person_count, vessel_count);

  update public.technical_documents document
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
    );
  get diagnostics person_count = row_count;

  update public.technical_documents document
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
    );
  get diagnostics vessel_count = row_count;
  return query values ('technical_documents', person_count, vessel_count);

  update public.vessel_equipment_documents document
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
    );
  get diagnostics person_count = row_count;

  update public.vessel_equipment_documents document
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
    );
  get diagnostics vessel_count = row_count;
  return query values ('vessel_equipment_documents', person_count, vessel_count);

  update public.lifting_reports document
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
    );
  get diagnostics person_count = row_count;

  update public.lifting_reports document
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
    );
  get diagnostics vessel_count = row_count;
  return query values ('lifting_reports', person_count, vessel_count);

  update public.shared_documents document
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
    );
  get diagnostics person_count = row_count;

  update public.shared_documents document
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
    );
  get diagnostics vessel_count = row_count;
  return query values ('shared_documents', person_count, vessel_count);
end;
$$;

revoke all on function public.resolve_sharepoint_document_links() from public;
grant execute on function public.resolve_sharepoint_document_links() to authenticated;
