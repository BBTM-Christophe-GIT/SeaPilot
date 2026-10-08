-- Originals remain in Ressources Humaines/<collaborator>/ through the existing
-- verified Drive workflow. Only a small display copy is stored in this private bucket.
alter table public.people
  add column photo_document_id bigint references public.hr_documents(id),
  add column photo_storage_path text,
  add constraint people_photo_pair check ((photo_document_id is null) = (photo_storage_path is null));
create index people_photo_document_idx on public.people(photo_document_id) where photo_document_id is not null;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('hr-portraits','hr-portraits',false,262144,array['image/jpeg']);

create policy hr_portraits_read on storage.objects for select to authenticated using (
  bucket_id='hr-portraits' and exists (
    select 1 from public.people p where split_part(name,'/',1)=p.id::text
    and (p.photo_storage_path=name or public.has_any_role(array['admin','direction','armement']))
  )
);
create policy hr_portraits_insert on storage.objects for insert to authenticated with check (
  bucket_id='hr-portraits' and name ~ '^[1-9][0-9]*/[a-f0-9-]{36}[.]jpg$'
  and public.has_any_role(array['admin','direction','armement'])
  and exists (select 1 from public.people p where p.id::text=split_part(name,'/',1)
    and p.company_id=public.current_planning_company_id())
);
-- Replacements always use a fresh path. No UPDATE/upsert policy is needed.
create policy hr_portraits_delete on storage.objects for delete to authenticated using (
  bucket_id='hr-portraits' and public.has_any_role(array['admin','direction','armement'])
  and exists (select 1 from public.people p where p.id::text=split_part(name,'/',1)
    and p.company_id=public.current_planning_company_id() and p.photo_storage_path is distinct from name)
);

create function public.validate_hr_portrait_reference()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if new.photo_storage_path is not distinct from old.photo_storage_path
      and new.photo_document_id is not distinct from old.photo_document_id then return new; end if;
  end if;
  if auth.uid() is not null and (not public.has_any_role(array['admin','direction','armement'])
    or new.company_id<>public.current_planning_company_id()) then
    raise exception 'Modification de la photo refusée.' using errcode='42501';
  end if;
  if new.photo_storage_path is null then return new; end if;
  if new.photo_storage_path !~ ('^'||new.id::text||'/[a-f0-9-]{36}[.]jpg$')
    or not exists(select 1 from public.hr_documents d where d.id=new.photo_document_id
      and d.person_id=new.id and d.company_id=new.company_id and d.drive_path is not null
      and d.mime_type in ('image/png','image/jpeg'))
    or not exists(select 1 from storage.objects o where o.bucket_id='hr-portraits' and o.name=new.photo_storage_path) then
    raise exception 'Référence de photo RH invalide.' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function public.validate_hr_portrait_reference() from public,anon;
create trigger validate_hr_portrait_reference before insert or update on public.people
for each row execute function public.validate_hr_portrait_reference();

-- This is a presentation responsibility; preserve the underlying HR qualification.
update public.organigramme_support s
set function_label='Capitaine d’Armement - Superintendant Technique'
from public.people p
where s.person_id=p.id and s.company_id=p.company_id and s.category='office'
  and lower(trim(p.first_name))='julien' and lower(trim(p.last_name))='lecocq';

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
    'categoryLabels',coalesce((select jsonb_object_agg(c.key,c.label) from public.organigramme_categories c where c.company_id=company),'{}'::jsonb),
    'links',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'sourceCategory',l.source_category,'targetKind',l.target_kind,'targetKey',l.target_key,'targetSection',l.target_section,'label',l.label) order by l.id) from public.organigramme_links l where l.company_id=company),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.organigramme_snapshot_v2(date) from public, anon;
grant execute on function public.organigramme_snapshot_v2(date) to authenticated;
comment on function public.organigramme_snapshot_v2(date) is 'Admin/Direction only. Manual default watches and hierarchical responsibilities, independent of Planning. Date filters HR/fleet eligibility, not the saved composition.';
