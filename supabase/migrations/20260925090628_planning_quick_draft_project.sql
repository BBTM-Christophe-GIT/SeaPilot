-- Drafts remain distinct from operations awaiting validation.
create or replace function public.canonical_project_status(raw_status text)
returns text language sql immutable set search_path = '' as $$
  select case
    when lower(btrim(raw_status)) = 'brouillon' then 'Brouillon'
    when lower(btrim(raw_status)) in ('confirme', 'confirmé', 'en cours', 'valide', 'validé', 'termine', 'terminé') then 'Validé'
    when lower(btrim(raw_status)) in ('stand-by meteo', 'stand-by météo', 'standby meteo', 'standby météo') then 'Stand-by météo'
    when lower(btrim(raw_status)) in ('facture', 'facturé', 'a facturer', 'à facturer') then 'Facturé'
    else 'Non validé'
  end;
$$;

alter table public.projects drop constraint projects_status_check;
alter table public.projects add constraint projects_status_check
  check (status in ('Brouillon', 'Non validé', 'Validé', 'Stand-by météo', 'Facturé'));
alter table public.planning_projects drop constraint planning_projects_status_check;
alter table public.planning_projects add constraint planning_projects_status_check
  check (status in ('Brouillon', 'Non validé', 'Validé', 'Stand-by météo', 'Facturé'));

-- Use the existing business writers in one transaction, with their own company
-- and role guards. Do not restore the retired shortcuts or expose hire details.
create function public.planning_create_quick_project(
  target_title text,
  target_primary_vessel_id bigint,
  target_starts_on date
)
returns table (
  id bigint,
  catalog_project_id bigint,
  title text,
  starts_on date,
  ends_on date,
  primary_vessel_id bigint,
  primary_vessel_name text,
  status text,
  event_type text,
  source_label text
)
language plpgsql security invoker set search_path = '' as $$
declare
  created_project public.projects%rowtype;
  created_occurrence_id bigint;
begin
  if (select auth.uid()) is null
     or not public.has_any_role(array['admin', 'direction']) then
    raise exception 'Insufficient permission to create a project' using errcode = '42501';
  end if;
  if nullif(btrim(target_title), '') is null or length(btrim(target_title)) > 300 then
    raise exception 'Le titre du projet doit contenir entre 1 et 300 caractères.' using errcode = '22023';
  end if;
  if target_starts_on is null or target_primary_vessel_id is null then
    raise exception 'Le navire et la date du planning sont obligatoires.' using errcode = '22023';
  end if;

  select * into created_project from public.projects_save(
    target_title => btrim(target_title),
    target_primary_vessel_id => target_primary_vessel_id,
    target_status => 'Brouillon'
  );

  select occurrence.id into created_occurrence_id from public.projects_save_planning_occurrence(
    target_occurrence_id => null,
    target_project_id => created_project.id,
    target_starts_on => target_starts_on,
    target_ends_on => target_starts_on,
    target_vessel_ids => array[target_primary_vessel_id],
    target_status => 'Brouillon',
    target_description => null,
    target_charter_hire => null,
    target_hire_currency => null,
    target_hire_unit => null
  ) occurrence;

  return query select created_occurrence_id, created_project.id,
    created_project.project_code || ' - ' || created_project.title,
    target_starts_on, target_starts_on, target_primary_vessel_id,
    created_project.primary_vessel_name, 'Brouillon'::text, 'operation'::text, 'seapilot-projects'::text;
end;
$$;

revoke all on function public.planning_create_quick_project(text, bigint, date) from public, anon, authenticated;
grant execute on function public.planning_create_quick_project(text, bigint, date) to authenticated;
comment on function public.planning_create_quick_project(text, bigint, date) is
  'Creates a numbered draft project, its contract and a one-day operation atomically for Admin/Direction.';
