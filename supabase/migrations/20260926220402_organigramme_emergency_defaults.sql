-- Shared selection only: contact details remain sourced from the HR records.
create table public.organigramme_emergency_defaults (
  company_id bigint primary key references public.companies(id) on delete cascade,
  person_ids bigint[] not null,
  updated_at timestamptz not null default now(),
  constraint organigramme_emergency_default_size check (cardinality(person_ids) <= 2000)
);
alter table public.organigramme_emergency_defaults enable row level security;
revoke all on public.organigramme_emergency_defaults from public, anon;
grant select, insert, update on public.organigramme_emergency_defaults to authenticated;

create function public.organigramme_emergency_people_valid(p_company_id bigint, p_person_ids bigint[])
returns boolean language sql stable security invoker set search_path = '' as $$
  select p_person_ids is not null and cardinality(p_person_ids) <= 2000
    and not exists (
      select 1 from unnest(p_person_ids) as selected(id)
      where selected.id is null or not exists (
        select 1 from public.people p where p.id=selected.id and p.company_id=p_company_id
      )
    );
$$;
revoke all on function public.organigramme_emergency_people_valid(bigint,bigint[]) from public, anon;
grant execute on function public.organigramme_emergency_people_valid(bigint,bigint[]) to authenticated;

create policy organigramme_emergency_defaults_read on public.organigramme_emergency_defaults
for select to authenticated using (public.organigramme_has_access(company_id));
create policy organigramme_emergency_defaults_insert on public.organigramme_emergency_defaults
for insert to authenticated with check (
  public.organigramme_has_access(company_id) and public.organigramme_emergency_people_valid(company_id,person_ids)
);
create policy organigramme_emergency_defaults_update on public.organigramme_emergency_defaults
for update to authenticated using (public.organigramme_has_access(company_id)) with check (
  public.organigramme_has_access(company_id) and public.organigramme_emergency_people_valid(company_id,person_ids)
);

create function public.save_organigramme_emergency_default(p_person_ids bigint[])
returns void language plpgsql security invoker set search_path = '' as $$
declare company bigint := public.current_planning_company_id();
begin
  if not public.organigramme_has_access(company) then
    raise exception 'Accès refusé à l’organigramme.' using errcode='42501';
  end if;
  if not public.organigramme_emergency_people_valid(company,p_person_ids) then
    raise exception 'Sélection de contacts invalide pour cette entreprise.' using errcode='42501';
  end if;
  insert into public.organigramme_emergency_defaults(company_id,person_ids)
    values(company,array(select distinct id from unnest(p_person_ids) as selected(id) order by id))
  on conflict(company_id) do update set person_ids=excluded.person_ids,updated_at=now();
end;
$$;
revoke all on function public.save_organigramme_emergency_default(bigint[]) from public, anon;
grant execute on function public.save_organigramme_emergency_default(bigint[]) to authenticated;
comment on table public.organigramme_emergency_defaults is 'Shared Admin/Direction emergency contact selection. No row means sedentary staff; an empty array is an explicitly empty selection. HR dates still filter exports.';
create or replace function public.organigramme_snapshot_v2(p_as_of date default current_date)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare company bigint := public.current_planning_company_id(); result jsonb;
begin
  if not public.organigramme_has_access(company) then raise exception 'Accès refusé à l’organigramme.' using errcode='42501'; end if;
  if p_as_of is null then raise exception 'Date de situation obligatoire.' using errcode='22023'; end if;
  with staff as (
    select p.id, p.first_name, p.last_name, concat_ws(' ',p.first_name,p.last_name) as name,
      coalesce(nullif(trim(p.function_label),''),p.grade_label,'') as function_label, p.employment_population, p.email, p.phone, p.photo_storage_path
    from public.people p where p.company_id=company
      and (p.hired_on<=p_as_of or (p.hired_on is null and p.active))
      and (p.departed_on is null or p.departed_on>p_as_of)
      and (p.active or p.departed_on>p_as_of)
  ), ships as (
    select v.id,v.name,v.length_overall,v.illustration_thumbnail_url from public.vessels v where v.company_id=company
      and v.asset_kind='vessel' and (v.active or v.fleet_exit_on>p_as_of)
      and (v.fleet_exit_on is null or v.fleet_exit_on>p_as_of)
  ), membership as (
    select m.person_id,w.vessel_id,w.name as watch_group,m.function_label,'manual'::text as source
    from public.organigramme_watch_members m join public.organigramme_watches w on w.id=m.watch_id and w.company_id=m.company_id
    where m.company_id=company
  )
  select jsonb_build_object(
    'people',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'firstName',s.first_name,'lastName',s.last_name,'functionLabel',s.function_label,'population',s.employment_population,'email',s.email,'phone',s.phone,'photoPath',s.photo_storage_path) order by s.name) from staff s),'[]'::jsonb),
    'vessels',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'lengthOverall',v.length_overall,'iconUrl',v.illustration_thumbnail_url) order by v.id) from ships v),'[]'::jsonb),
    'memberships',coalesce((select jsonb_agg(jsonb_build_object('personId',m.person_id,'vesselId',m.vessel_id,'watchGroup',coalesce(m.watch_group,''),'functionLabel',m.function_label,'source',m.source) order by m.person_id,m.vessel_id,m.watch_group,m.function_label) from membership m join staff s on s.id=m.person_id join ships v on v.id=m.vessel_id),'[]'::jsonb),
    'support',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'personId',e.person_id,'name',coalesce(s.name,e.name),'functionLabel',e.function_label,'category',e.category,'position',e.position,'rank',e.hierarchy_rank) order by e.position,e.id) from public.organigramme_support e left join staff s on s.id=e.person_id where e.company_id=company and (e.person_id is null or s.id is not null)),'[]'::jsonb)
  ) into result;
  return result || jsonb_build_object(
    'watches',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'vesselId',w.vessel_id,'name',w.name) order by w.name,w.id) from public.organigramme_watches w join public.vessels v on v.id=w.vessel_id and v.company_id=company and v.asset_kind='vessel' and (v.active or v.fleet_exit_on>p_as_of) and (v.fleet_exit_on is null or v.fleet_exit_on>p_as_of) where w.company_id=company),'[]'::jsonb),
    'emergencyDefaultIds',(select to_jsonb(d.person_ids) from public.organigramme_emergency_defaults d where d.company_id=company),
    'categoryLabels',coalesce((select jsonb_object_agg(c.key,c.label) from public.organigramme_categories c where c.company_id=company),'{}'::jsonb),
    'links',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'sourceCategory',l.source_category,'targetKind',l.target_kind,'targetKey',l.target_key,'targetSection',l.target_section,'label',l.label) order by l.id) from public.organigramme_links l where l.company_id=company),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.organigramme_snapshot_v2(date) from public, anon;
grant execute on function public.organigramme_snapshot_v2(date) to authenticated;
comment on function public.organigramme_snapshot_v2(date) is 'Admin/Direction only. Manual default watches and hierarchical responsibilities, independent of Planning. Date filters HR/fleet eligibility, not the saved composition.';
