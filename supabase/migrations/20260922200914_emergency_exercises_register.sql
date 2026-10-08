-- The register exposes only authorised identities and monthly exercise counts.
-- Existing DPR/HR RLS remains unchanged; sailors can read their complete own
-- exercise history without gaining access to other contents of those DPRs.
insert into public.role_module_permissions (role_key,module_key,is_visible)
select key,'emergencyExercises',true from public.roles
where key in ('admin','direction','armement','capitaine','marin')
on conflict (role_key,module_key) do nothing;

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
  select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'iconUrl',v.icon_url)
    order by v.name),'[]'::jsonb) into vessels_json
  from public.vessels v where v.company_id=company and v.asset_kind='vessel'
    and (scope='fleet' or exists (
      select 1 from public.dpr_reports r join public.dpr_crew_members c on c.dpr_id=r.id and c.company_id=r.company_id
      where r.vessel_id=v.id and r.company_id=company and r.deleted_at is null
        and exists (select 1 from jsonb_array_elements(people_json) p where (p->>'id')::bigint=c.person_id)
    ));
  return jsonb_build_object('scope',scope,'people',people_json,'vessels',vessels_json);
end;
$$;

create or replace function private.emergency_exercises_report(target_person_id bigint,target_year integer,
  target_vessel_id bigint default null,target_population text default 'current')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  roster jsonb := private.emergency_exercises_people();
  person jsonb;
  counts jsonb;
  company bigint := public.current_planning_company_id();
  vessel jsonb;
  allowed_people bigint[];
begin
  if target_year is null or target_year < 1900 or target_year > 2100 then
    raise exception 'Année invalide (1900 à 2100).' using errcode='22023';
  end if;
  if target_population is null or target_population not in ('current','former','all') then
    raise exception 'Filtre de personnel invalide.' using errcode='22023';
  end if;
  select p into person from jsonb_array_elements(roster->'people') p where (p->>'id')::bigint=target_person_id;
  if target_person_id is not null and person is null then
    raise exception 'Ce marin ne fait pas partie de votre périmètre.' using errcode='42501';
  end if;
  select v into vessel from jsonb_array_elements(roster->'vessels') v where (v->>'id')::bigint=target_vessel_id;
  if target_vessel_id is not null and vessel is null then
    raise exception 'Ce navire ne fait pas partie de votre périmètre.' using errcode='42501';
  end if;
  select array_agg((p->>'id')::bigint) into allowed_people from jsonb_array_elements(roster->'people') p
  where (target_person_id is null or (p->>'id')::bigint=target_person_id)
    and (target_person_id is not null or roster->>'scope'<>'fleet' or target_population='all'
      or (target_population='current' and (p->>'current')::boolean)
      or (target_population='former' and (p->>'former')::boolean));
  select coalesce(jsonb_agg(to_jsonb(c) order by c.exercise_name,c.month),'[]'::jsonb) into counts
  from (
    select e.exercise_type_key as exercise_key,t.label as exercise_name,
      extract(month from r.report_date)::integer as month,count(*)::integer as count
    from public.dpr_reports r
    join public.dpr_emergency_exercises e on e.dpr_id=r.id and e.company_id=r.company_id
    join public.emergency_exercise_types t on t.key=e.exercise_type_key
    where r.company_id=company and r.deleted_at is null and r.status in ('submitted','validated')
      and (target_vessel_id is null or r.vessel_id=target_vessel_id)
      and r.report_date >= make_date(target_year,1,1) and r.report_date < make_date(target_year+1,1,1)
      and exists (select 1 from public.dpr_crew_members crew where crew.dpr_id=r.id
        and crew.company_id=r.company_id and crew.person_id=any(allowed_people))
    group by e.exercise_type_key,t.label,extract(month from r.report_date)
  ) c;
  return jsonb_build_object('person',person,'year',target_year,'vessel',vessel,'counts',counts);
end;
$$;

create or replace function public.emergency_exercises_people()
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.emergency_exercises_people(); $$;
create or replace function public.emergency_exercises_report(target_person_id bigint,target_year integer,
  target_vessel_id bigint default null,target_population text default 'current')
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.emergency_exercises_report(target_person_id,target_year,target_vessel_id,target_population); $$;

revoke all on function private.emergency_exercises_people(),private.emergency_exercises_report(bigint,integer,bigint,text),
  public.emergency_exercises_people(),public.emergency_exercises_report(bigint,integer,bigint,text) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.emergency_exercises_people(),private.emergency_exercises_report(bigint,integer,bigint,text),
  public.emergency_exercises_people(),public.emergency_exercises_report(bigint,integer,bigint,text) to authenticated;
notify pgrst,'reload schema';
