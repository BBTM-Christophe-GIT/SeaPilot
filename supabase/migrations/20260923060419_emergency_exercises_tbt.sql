-- TBT are exercises with a free-text theme, already recorded in DPR HSE actions.
-- Count one TBT per eligible DPR, independently of predefined exercise types.
-- Keep the existing authenticated roster and all person/vessel/population filters.
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
  with eligible_reports as (
    select r.id,r.company_id,extract(month from r.report_date)::integer as month
    from public.dpr_reports r
    where r.company_id=company and r.deleted_at is null and r.status in ('submitted','validated')
      and (target_vessel_id is null or r.vessel_id=target_vessel_id)
      and r.report_date >= make_date(target_year,1,1) and r.report_date < make_date(target_year+1,1,1)
      and exists (select 1 from public.dpr_crew_members crew where crew.dpr_id=r.id
        and crew.company_id=r.company_id and crew.person_id=any(allowed_people))
  ), exercises as (
    select e.exercise_type_key as exercise_key,t.label as exercise_name,r.month
    from eligible_reports r
    join public.dpr_emergency_exercises e on e.dpr_id=r.id and e.company_id=r.company_id
    join public.emergency_exercise_types t on t.key=e.exercise_type_key
    union all
    select 'tbt' as exercise_key,'TBT — thème libre' as exercise_name,r.month
    from eligible_reports r
    join public.dpr_hse_actions h on h.dpr_id=r.id and h.company_id=r.company_id
    where h.tbt_performed
  )
  select coalesce(jsonb_agg(to_jsonb(c) order by c.exercise_name,c.month),'[]'::jsonb) into counts
  from (
    select exercise_key,exercise_name,month,count(*)::integer as count
    from exercises group by exercise_key,exercise_name,month
  ) c;
  return jsonb_build_object('person',person,'year',target_year,'vessel',vessel,'counts',counts);
end;
$$;

revoke all on function private.emergency_exercises_report(bigint,integer,bigint,text) from public,anon;
grant execute on function private.emergency_exercises_report(bigint,integer,bigint,text) to authenticated;
notify pgrst,'reload schema';
