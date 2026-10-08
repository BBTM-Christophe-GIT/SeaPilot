-- Offer only active vessels in the register. Archived DPRs remain in the
-- unrestricted vessel history and fleet totals; no fleet or DPR data is deleted.
create or replace function private.emergency_exercises_people()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  company bigint := public.current_planning_company_id();
  actor bigint := public.current_person_id();
  scope text;
  people_json jsonb;
  vessels_json jsonb;
begin
  if auth.uid() is null or company is null or not public.user_belongs_to_company(company)
    or not exists (select 1 from public.user_roles r join public.role_module_permissions p
      on p.role_key=r.role_key and p.module_key='emergencyExercises' and p.is_visible
      where r.user_id=auth.uid() and r.company_id=company) then
    raise exception 'Accès au registre des exercices refusé.' using errcode='42501';
  end if;
  scope := case
    when public.has_company_role(company,array['admin','direction','armement']) then 'fleet'
    when public.has_company_role(company,array['capitaine']) then 'watch'
    when public.has_company_role(company,array['marin']) then 'self'
    else null end;
  if scope is null then raise exception 'Accès refusé.' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'name',trim(concat_ws(' ',p.first_name,p.last_name)),
    'current',coalesce(p.hired_on <= current_date and (p.departed_on is null or p.departed_on > current_date),false),
    'former',coalesce(p.hired_on <= p.departed_on and p.departed_on <= current_date,false)
  ) order by p.last_name,p.first_name,p.id),'[]'::jsonb) into people_json
  from public.people p
  where p.company_id=company and p.employment_population='offshore'
    and (scope='fleet' or p.id=actor
      or (scope='watch' and public.captain_shares_watch_with_person(company,p.id)));
  select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'iconUrl',v.illustration_thumbnail_url,'lengthOverall',v.length_overall)
    order by v.name),'[]'::jsonb) into vessels_json
  from public.vessels v where v.company_id=company and v.active and v.asset_kind='vessel'
    and (scope='fleet' or exists (
      select 1 from public.dpr_reports r join public.dpr_crew_members c on c.dpr_id=r.id and c.company_id=r.company_id
      where r.vessel_id=v.id and r.company_id=company and r.deleted_at is null
        and exists (select 1 from jsonb_array_elements(people_json) p where (p->>'id')::bigint=c.person_id)
    ));
  return jsonb_build_object('scope',scope,'people',people_json,'vessels',vessels_json);
end;
$$;
