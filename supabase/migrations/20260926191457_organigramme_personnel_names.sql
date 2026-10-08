-- Preserve structured names for surname sorting, including compound names.
create or replace function public.organigramme_snapshot_v2(p_as_of date default current_date)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare company bigint := public.current_planning_company_id(); result jsonb;
begin
  if not public.organigramme_has_access(company) then raise exception 'Accès refusé à l’organigramme.' using errcode='42501'; end if;
  if p_as_of is null then raise exception 'Date de situation obligatoire.' using errcode='22023'; end if;
  with staff as (
    select p.id, p.first_name, p.last_name, concat_ws(' ',p.first_name,p.last_name) as name,
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
    select m.person_id,w.vessel_id,w.name as watch_group,m.function_label,'manual'::text as source
    from public.organigramme_watch_members m join public.organigramme_watches w on w.id=m.watch_id and w.company_id=m.company_id
    where m.company_id=company
  )
  select jsonb_build_object(
    'people',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'firstName',s.first_name,'lastName',s.last_name,'functionLabel',s.function_label,'population',s.employment_population,'email',s.email,'phone',s.phone) order by s.name) from staff s),'[]'::jsonb),
    'vessels',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'lengthOverall',v.length_overall) order by v.id) from ships v),'[]'::jsonb),
    'memberships',coalesce((select jsonb_agg(jsonb_build_object('personId',m.person_id,'vesselId',m.vessel_id,'watchGroup',coalesce(m.watch_group,''),'functionLabel',m.function_label,'source',m.source) order by m.person_id,m.vessel_id,m.watch_group,m.function_label) from membership m join staff s on s.id=m.person_id join ships v on v.id=m.vessel_id),'[]'::jsonb),
    'support',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'personId',e.person_id,'name',coalesce(s.name,e.name),'functionLabel',e.function_label,'category',e.category,'position',e.position,'rank',e.hierarchy_rank) order by e.position,e.id) from public.organigramme_support e left join staff s on s.id=e.person_id where e.company_id=company and (e.person_id is null or s.id is not null)),'[]'::jsonb)
  ) into result;
  return result || jsonb_build_object(
    'watches',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'vesselId',w.vessel_id,'name',w.name) order by w.name,w.id) from public.organigramme_watches w join public.vessels v on v.id=w.vessel_id and v.company_id=company and v.asset_kind='vessel' and (v.active or v.fleet_exit_on>p_as_of) and (v.fleet_exit_on is null or v.fleet_exit_on>p_as_of) where w.company_id=company),'[]'::jsonb),
    'categoryLabels',coalesce((select jsonb_object_agg(c.key,c.label) from public.organigramme_categories c where c.company_id=company),'{}'::jsonb),
    'links',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'sourceCategory',l.source_category,'targetKind',l.target_kind,'targetKey',l.target_key,'targetSection',l.target_section,'label',l.label) order by l.id) from public.organigramme_links l where l.company_id=company),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.organigramme_snapshot_v2(date) from public, anon;
grant execute on function public.organigramme_snapshot_v2(date) to authenticated;
comment on function public.organigramme_snapshot_v2(date) is 'Admin/Direction only. Manual default watches and hierarchical responsibilities, independent of Planning. Date filters HR/fleet eligibility, not the saved composition.';
