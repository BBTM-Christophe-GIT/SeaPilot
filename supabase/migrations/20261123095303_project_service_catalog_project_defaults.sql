create table public.project_service_catalog_defaults (
  company_id bigint not null,
  service_catalog_id bigint not null,
  project_id bigint not null,
  primary key (company_id, service_catalog_id, project_id),
  foreign key (company_id, service_catalog_id)
    references public.project_service_catalog (company_id, id) on delete cascade,
  foreign key (project_id, company_id)
    references public.projects (id, company_id) on delete cascade
);

create index project_service_catalog_defaults_project_idx
  on public.project_service_catalog_defaults (project_id, company_id);

alter table public.project_service_catalog_defaults enable row level security;
revoke all on public.project_service_catalog_defaults from public, anon, authenticated;
grant select, insert, delete on public.project_service_catalog_defaults to authenticated;

create policy project_service_catalog_defaults_manager_read on public.project_service_catalog_defaults
  for select to authenticated
  using (
    public.user_belongs_to_company(company_id)
    and public.has_company_role(company_id, array['admin', 'direction'])
  );

create policy project_service_catalog_defaults_manager_insert on public.project_service_catalog_defaults
  for insert to authenticated
  with check (
    public.user_belongs_to_company(company_id)
    and public.has_company_role(company_id, array['admin', 'direction'])
  );

create policy project_service_catalog_defaults_manager_delete on public.project_service_catalog_defaults
  for delete to authenticated
  using (
    public.user_belongs_to_company(company_id)
    and public.has_company_role(company_id, array['admin', 'direction'])
  );

comment on table public.project_service_catalog_defaults is
  'Projects for which a catalog entry is proposed automatically in BBTM billing.';

create function public.save_project_service_catalog_entry(
  p_entry jsonb,
  p_default_project_ids bigint[],
  p_catalog_id bigint default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  draft public.project_service_catalog := jsonb_populate_record(null::public.project_service_catalog, p_entry);
  saved public.project_service_catalog;
begin
  if p_catalog_id is null then
    insert into public.project_service_catalog (
      category, vessel_id, vessel_name, unit_amount_ht, description_html, active,
      quantity_mode, quantity_operation_types, default_quantity, client_reference
    ) values (
      draft.category, draft.vessel_id, coalesce(draft.vessel_name, ''), draft.unit_amount_ht,
      coalesce(draft.description_html, ''), coalesce(draft.active, true), draft.quantity_mode,
      coalesce(draft.quantity_operation_types, '{}'::text[]), draft.default_quantity,
      coalesce(draft.client_reference, '')
    )
    returning * into saved;
  else
    -- The update locks this catalog row for the whole assignment replacement.
    update public.project_service_catalog as catalog
    set category = draft.category,
        vessel_id = draft.vessel_id,
        vessel_name = draft.vessel_name,
        unit_amount_ht = draft.unit_amount_ht,
        description_html = draft.description_html,
        active = draft.active,
        updated_at = now(),
        quantity_mode = case when p_entry ? 'quantity_mode' then draft.quantity_mode else catalog.quantity_mode end,
        quantity_operation_types = coalesce(draft.quantity_operation_types, catalog.quantity_operation_types),
        default_quantity = case when p_entry ? 'default_quantity' then draft.default_quantity else catalog.default_quantity end,
        client_reference = coalesce(draft.client_reference, catalog.client_reference)
    where catalog.id = p_catalog_id
    returning * into strict saved;
  end if;

  if p_default_project_ids is not null then
    delete from public.project_service_catalog_defaults
    where company_id = saved.company_id and service_catalog_id = saved.id;

    insert into public.project_service_catalog_defaults (company_id, service_catalog_id, project_id)
    select distinct saved.company_id, saved.id, project_id
      from unnest(p_default_project_ids) as project_id;
  end if;

  return to_jsonb(saved) || jsonb_build_object('default_projects', coalesce((
    select jsonb_agg(jsonb_build_object('project_id', defaults.project_id) order by defaults.project_id)
    from public.project_service_catalog_defaults as defaults
    where defaults.company_id = saved.company_id and defaults.service_catalog_id = saved.id
  ), '[]'::jsonb));
end;
$$;

revoke all on function public.save_project_service_catalog_entry(jsonb, bigint[], bigint) from public, anon;
grant execute on function public.save_project_service_catalog_entry(jsonb, bigint[], bigint) to authenticated;
