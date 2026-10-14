-- Shared operational notices and vessel exercise totals use the assignment read window.
-- Personal recipient acknowledgements, personnel rosters, signing and all writes retain their legacy scope.
create or replace function private.service_note_legacy_reader(target_note_id bigint)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.qhse_service_notes note
    where note.id=target_note_id and public.user_belongs_to_company(note.company_id)
      and (public.has_company_role(note.company_id,array['admin','direction'])
        or (note.status in ('published','archived') and exists (
          select 1 from public.qhse_service_note_recipients recipient
          where recipient.note_id=note.id and recipient.user_id=(select auth.uid())
        )))
  );
$$;
revoke all on function private.service_note_legacy_reader(bigint) from public,anon;
grant execute on function private.service_note_legacy_reader(bigint) to authenticated;

create or replace function public.service_note_can_read(target_note_id bigint)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.service_note_legacy_reader(target_note_id) or exists (
    select 1 from public.qhse_service_notes note
    where note.id=target_note_id
      and note.company_id=public.current_planning_company_id()
      and note.status in ('published','archived') and note.scope='vessels'
      and (private.can_read_assigned_vessel(note.company_id,note.vessel_id) or exists (
        select 1 from public.qhse_service_note_target_vessels target
        where target.note_id=note.id and private.can_read_assigned_vessel(note.company_id,target.vessel_id)
      ))
  );
$$;
revoke all on function public.service_note_can_read(bigint) from public,anon;
grant execute on function public.service_note_can_read(bigint) to authenticated;

alter policy qhse_service_note_recipients_read on public.qhse_service_note_recipients
using ((select private.service_note_legacy_reader(note_id)));
alter policy qhse_service_note_signatures_read on public.qhse_service_note_signatures
using ((select private.service_note_legacy_reader(note_id)));
alter policy qhse_service_note_target_people_read on public.qhse_service_note_target_people
using ((select private.service_note_legacy_reader(note_id)));
alter policy service_note_signature_snapshot_read on storage.objects using (
  bucket_id='working-time-signatures' and (
    exists (select 1 from public.qhse_service_note_signatures signature
      where signature.signature_snapshot->>'storage_bucket'=objects.bucket_id
        and signature.signature_snapshot->>'storage_path'=objects.name
        and private.service_note_legacy_reader(signature.note_id))
    or exists (select 1 from public.qhse_service_notes note
      where note.author_signature_snapshot->>'storage_bucket'=objects.bucket_id
        and note.author_signature_snapshot->>'storage_path'=objects.name
        and public.service_note_can_read(note.id))
  )
);

-- Aggregate summaries expose counts of vessel operations, never extra personnel.
CREATE OR REPLACE FUNCTION private.emergency_exercises_people()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  company bigint := public.current_planning_company_id();
  actor bigint := public.current_person_id();
  scope text;
  people_json jsonb;
  vessels_json jsonb;
  vessel_read_ids bigint[] := private.assigned_vessel_read_scope(company);
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
    and (scope='fleet' or v.id=any(vessel_read_ids) or exists (
      select 1 from public.dpr_reports r join public.dpr_crew_members c on c.dpr_id=r.id and c.company_id=r.company_id
      where r.vessel_id=v.id and r.company_id=company and r.deleted_at is null
        and exists (select 1 from jsonb_array_elements(people_json) p where (p->>'id')::bigint=c.person_id)
    ));
  return jsonb_build_object('scope',scope,'people',people_json,'vessels',vessels_json,'vesselReadIds',to_jsonb(vessel_read_ids));
end;
$function$;

CREATE OR REPLACE FUNCTION private.emergency_exercises_report(target_person_id bigint, target_year integer, target_vessel_id bigint DEFAULT NULL::bigint, target_population text DEFAULT 'current'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  roster jsonb := private.emergency_exercises_people();
  person jsonb;
  counts jsonb;
  company bigint := public.current_planning_company_id();
  vessel jsonb;
  allowed_people bigint[];
  vessel_summary boolean := roster->>'scope'<>'fleet' and target_person_id is null and target_vessel_id is not null
    and private.can_read_assigned_vessel(company,target_vessel_id);
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
      and (vessel_summary or exists (select 1 from public.dpr_crew_members crew where crew.dpr_id=r.id
        and crew.company_id=r.company_id and crew.person_id=any(allowed_people)))
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
$function$;
