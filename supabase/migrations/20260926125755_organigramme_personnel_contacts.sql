create or replace function public.organigramme_snapshot(p_as_of date default current_date)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare company bigint := public.current_planning_company_id(); result jsonb;
begin
  if not public.organigramme_has_access(company) then raise exception 'Accès refusé à l’organigramme.' using errcode='42501'; end if;
  if p_as_of is null then raise exception 'Date de situation obligatoire.' using errcode='22023'; end if;
  with staff as (
    select p.id, concat_ws(' ',p.first_name,p.last_name) as name,
      coalesce(nullif(trim(p.function_label),''),p.grade_label,'') as function_label, p.employment_population, p.email, p.phone
    from public.people p where p.company_id=company
      and (p.hired_on<=p_as_of or (p.hired_on is null and p.active))
      and (p.departed_on is null or p.departed_on>p_as_of)
      and (p.active or p.departed_on>p_as_of)
  ), ships as (
    select v.id,v.name,v.length_overall from public.vessels v where v.company_id=company
      and v.asset_kind='vessel' and (v.active or v.fleet_exit_on>p_as_of)
      and (v.fleet_exit_on is null or v.fleet_exit_on>p_as_of)
  ), membership as (
    select b.person_id,b.vessel_id,b.watch_group,b.function_label,'board'::text as source
      from public.planning_board_rows b where b.company_id=company
    union all
    select a.crew_person_id,a.vessel_id,a.watch_group,a.assignment_role,'assignment'
      from public.planning_assignments a where a.company_id=company
      and a.starts_on<=p_as_of and coalesce(a.ends_on,p_as_of)>=p_as_of
      and a.confirmation_status<>'cancelled'
    union all
    select p.person_id,p.vessel_id,p.watch_group,p.function_label,'period'
      from public.planning_periods p where p.company_id=company
      and p.starts_on<=p_as_of and coalesce(p.ends_on,p_as_of)>=p_as_of
    union all
    select d.person_id,d.vessel_id,d.watch_group,d.function_label,'day'
      from public.planning_days d where d.company_id=company and d.work_date=p_as_of
  )
  select jsonb_build_object(
    'people',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'functionLabel',s.function_label,'population',s.employment_population,'email',s.email,'phone',s.phone) order by s.name) from staff s),'[]'::jsonb),
    'vessels',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'lengthOverall',v.length_overall) order by v.id) from ships v),'[]'::jsonb),
    'memberships',coalesce((select jsonb_agg(jsonb_build_object('personId',m.person_id,'vesselId',m.vessel_id,'watchGroup',coalesce(m.watch_group,''),'functionLabel',coalesce(nullif(trim(m.function_label),''),s.function_label),'source',m.source) order by m.person_id,m.vessel_id,m.watch_group,m.function_label) from membership m join staff s on s.id=m.person_id join ships v on v.id=m.vessel_id),'[]'::jsonb),
    'support',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'personId',e.person_id,'name',coalesce(s.name,e.name),'functionLabel',e.function_label,'category',e.category,'position',e.position) order by e.position,e.id) from public.organigramme_support e left join staff s on s.id=e.person_id where e.company_id=company and (e.person_id is null or s.id is not null)),'[]'::jsonb)
  ) into result;
  return result || jsonb_build_object(
    'categoryLabels',coalesce((select jsonb_object_agg(c.key,c.label) from public.organigramme_categories c where c.company_id=company),'{}'::jsonb),
    'links',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'sourceCategory',l.source_category,'targetKind',l.target_kind,'targetKey',l.target_key,'targetSection',l.target_section,'label',l.label) order by l.id) from public.organigramme_links l where l.company_id=company),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.organigramme_snapshot(date) from public, anon;
grant execute on function public.organigramme_snapshot(date) to authenticated;
comment on function public.organigramme_snapshot(date) is 'Company-scoped Admin/Direction organization chart. Live dated memberships take precedence over permanent board rows in the client; Only requested personnel email/phone are included; no family emergency contacts, availability or private HR dossiers are returned.';
