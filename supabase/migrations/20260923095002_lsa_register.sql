-- Copy and verify before removing the four requested categories from fleet certificates.
-- apply_migration runs this file in one transaction; no Storage object is deleted.
create table public.lsa_items (like public.fleet_certificates including defaults including constraints including identity);
alter table public.lsa_items add primary key(id),
  add unique(company_id,id),
  add foreign key(company_id) references public.companies(id),
  add foreign key(vessel_id) references public.vessels(id),
  add constraint lsa_items_category_check check(category_key in
    ('07-2-life-jacket','07-4-gmdss','07-6-pyrotechnie','07-8-bouee-feux-retournement-mob'));
create index lsa_items_vessel_idx on public.lsa_items(company_id,vessel_id,category_key);

create table public.lsa_versions (like public.fleet_certificate_versions including defaults including constraints including identity);
alter table public.lsa_versions add primary key(id), add unique(certificate_id,version_no),
  add unique(storage_bucket,storage_path), add unique(company_id,certificate_id,id),
  add foreign key(company_id,certificate_id) references public.lsa_items(company_id,id) on delete restrict;
create unique index lsa_versions_current_idx on public.lsa_versions(certificate_id) where is_current;

create table public.lsa_renewal_events (like public.fleet_certificate_renewal_events including defaults including constraints including identity);
alter table public.lsa_renewal_events add primary key(id),
  add foreign key(company_id,certificate_id) references public.lsa_items(company_id,id) on delete restrict,
  add foreign key(company_id,certificate_id,version_id) references public.lsa_versions(company_id,certificate_id,id) on delete restrict;
create index lsa_events_certificate_idx on public.lsa_renewal_events(company_id,certificate_id,created_at);
create index lsa_events_version_idx on public.lsa_renewal_events(company_id,certificate_id,version_id);

create table private.lsa_transfer_audit (
  source_table text not null, source_id bigint not null, snapshot jsonb not null,
  copied_at timestamptz not null default now(), primary key(source_table,source_id)
);
alter table private.lsa_transfer_audit enable row level security;
revoke all on private.lsa_transfer_audit from public,anon,authenticated;

lock table public.fleet_certificates, public.fleet_certificate_versions,
  public.fleet_certificate_renewal_events, public.fleet_certificate_findings,
  public.fleet_certificate_provider_links, public.fleet_certificate_visits,
  public.lifting_inspections in share row exclusive mode;

insert into private.lsa_transfer_audit(source_table,source_id,snapshot)
select 'fleet_certificates',id,to_jsonb(c) from public.fleet_certificates c
where category_key in ('07-2-life-jacket','07-4-gmdss','07-6-pyrotechnie','07-8-bouee-feux-retournement-mob');

-- Fail closed if a new kind of linked business record appeared since the inventory audit.
do $$ begin
  if exists(select 1 from public.fleet_certificate_findings where certificate_id in(select source_id from private.lsa_transfer_audit where source_table='fleet_certificates'))
    or exists(select 1 from public.fleet_certificate_visits where certificate_id in(select source_id from private.lsa_transfer_audit where source_table='fleet_certificates'))
    or exists(select 1 from public.fleet_certificate_provider_links where certificate_id in(select source_id from private.lsa_transfer_audit where source_table='fleet_certificates'))
    or exists(select 1 from public.lifting_inspections where certificate_id in(select source_id from private.lsa_transfer_audit where source_table='fleet_certificates')) then
    raise exception 'Transfert LSA interrompu : dépendances supplémentaires à conserver.';
  end if;
end $$;

insert into private.lsa_transfer_audit(source_table,source_id,snapshot)
select 'fleet_certificate_versions',id,to_jsonb(v) from public.fleet_certificate_versions v
where certificate_id in(select source_id from private.lsa_transfer_audit where source_table='fleet_certificates');
insert into private.lsa_transfer_audit(source_table,source_id,snapshot)
select 'fleet_certificate_renewal_events',id,to_jsonb(e) from public.fleet_certificate_renewal_events e
where certificate_id in(select source_id from private.lsa_transfer_audit where source_table='fleet_certificates');

insert into public.lsa_items overriding system value select c.* from public.fleet_certificates c
where id in(select source_id from private.lsa_transfer_audit where source_table='fleet_certificates');
insert into public.lsa_versions overriding system value select v.* from public.fleet_certificate_versions v
where id in(select source_id from private.lsa_transfer_audit where source_table='fleet_certificate_versions');
insert into public.lsa_renewal_events overriding system value select e.* from public.fleet_certificate_renewal_events e
where id in(select source_id from private.lsa_transfer_audit where source_table='fleet_certificate_renewal_events');

do $$ begin
  if exists(select 1 from private.lsa_transfer_audit a left join public.lsa_items c on c.id=a.source_id
    where a.source_table='fleet_certificates' and a.snapshot is distinct from to_jsonb(c))
    or exists(select 1 from private.lsa_transfer_audit a left join public.lsa_versions v on v.id=a.source_id
    where a.source_table='fleet_certificate_versions' and a.snapshot is distinct from to_jsonb(v))
    or exists(select 1 from private.lsa_transfer_audit a left join public.lsa_renewal_events e on e.id=a.source_id
    where a.source_table='fleet_certificate_renewal_events' and a.snapshot is distinct from to_jsonb(e)) then
    raise exception 'Transfert LSA interrompu : la copie ne correspond pas intégralement à la source.';
  end if;
  if exists(select 1 from public.lsa_versions v left join storage.objects o on o.bucket_id=v.storage_bucket and o.name=v.storage_path
    where o.id is null or (v.file_size_bytes is not null and (o.metadata->>'size')::bigint is distinct from v.file_size_bytes))
    or exists(select 1 from public.lsa_items c left join storage.objects o on o.bucket_id=c.storage_bucket and o.name=c.storage_path
    where c.storage_path is not null and (o.id is null or (c.file_size_bytes is not null and (o.metadata->>'size')::bigint is distinct from c.file_size_bytes))) then
    raise exception 'Transfert LSA interrompu : fichier absent ou taille différente.';
  end if;
end $$;

-- Cascaded versions/events have already been copied and compared field by field above.
delete from public.fleet_certificates where id in
  (select source_id from private.lsa_transfer_audit where source_table='fleet_certificates');
alter table public.fleet_certificates add constraint fleet_certificates_lsa_moved_check
  check(category_key not in ('07-2-life-jacket','07-4-gmdss','07-6-pyrotechnie','07-8-bouee-feux-retournement-mob'));
select setval(pg_get_serial_sequence('public.lsa_items','id'),coalesce(max(id),1),count(*)>0) from public.lsa_items;
select setval(pg_get_serial_sequence('public.lsa_versions','id'),coalesce(max(id),1),count(*)>0) from public.lsa_versions;
select setval(pg_get_serial_sequence('public.lsa_renewal_events','id'),coalesce(max(id),1),count(*)>0) from public.lsa_renewal_events;

insert into public.role_module_permissions(role_key,module_key,is_visible)
select role_key,'lsa',is_visible from public.role_module_permissions where module_key='certificates'
on conflict(role_key,module_key) do nothing;

create function private.lsa_has_access() returns boolean language sql stable security invoker set search_path='' as $$
  select auth.uid() is not null and exists(
    select 1 from public.user_roles r join public.role_module_permissions p on p.role_key=r.role_key
    where r.user_id=auth.uid() and r.company_id=public.current_planning_company_id()
      and p.module_key='lsa' and p.is_visible
  );
$$;
revoke all on function private.lsa_has_access() from public,anon;
grant execute on function private.lsa_has_access() to authenticated;

alter table public.lsa_items enable row level security;
alter table public.lsa_versions enable row level security;
alter table public.lsa_renewal_events enable row level security;
revoke all on public.lsa_items,public.lsa_versions,public.lsa_renewal_events from anon,authenticated;
grant select on public.lsa_items,public.lsa_versions,public.lsa_renewal_events to authenticated;
create policy lsa_items_read on public.lsa_items for select to authenticated using (
  (select private.lsa_has_access()) and company_id=(select public.current_planning_company_id())
  and public.planning_can_read_row(company_id,vessel_id,null,coalesce(issued_on,current_date),coalesce(expires_on,current_date))
);
create policy lsa_versions_read on public.lsa_versions for select to authenticated using (
  exists(select 1 from public.lsa_items i where i.id=certificate_id and i.company_id=lsa_versions.company_id)
);
create policy lsa_events_read on public.lsa_renewal_events for select to authenticated using (
  exists(select 1 from public.lsa_items i where i.id=certificate_id and i.company_id=lsa_renewal_events.company_id)
);

create function public.lsa_available_vessels() returns setof public.vessels
language sql stable security invoker set search_path='' as $$
  select v.* from public.vessels v where v.asset_kind='vessel' and private.lsa_has_access()
    and v.company_id=public.current_planning_company_id()
    and ((v.active and public.planning_can_read_row(v.company_id,v.id,null,current_date,current_date))
      or exists(select 1 from public.lsa_items i where i.vessel_id=v.id)) order by v.name;
$$;
revoke all on function public.lsa_available_vessels() from public,anon;
grant execute on function public.lsa_available_vessels() to authenticated;

create function private.save_lsa_item(p_vessel_id bigint,p_item jsonb,p_id bigint,p_expected_updated_at timestamptz)
returns bigint language plpgsql security definer set search_path='' as $$
declare
  company bigint := public.current_planning_company_id(); result_id bigint; selected_category_label text; vessel_name text;
begin
  if not private.lsa_has_access() or not public.has_company_role(company,array['admin','direction','armement']) then
    raise exception 'Modification du registre LSA non autorisée.' using errcode='42501';
  end if;
  select v.name into vessel_name from public.vessels v where v.id=p_vessel_id and v.company_id=company and v.asset_kind='vessel';
  if vessel_name is null then raise exception 'Navire non autorisé.' using errcode='42501'; end if;
  selected_category_label := case p_item->>'category_key'
    when '07-2-life-jacket' then '07.2 - Life Jacket' when '07-4-gmdss' then '07.4 - GMDSS'
    when '07-6-pyrotechnie' then '07.6 - Pyrotechnie' when '07-8-bouee-feux-retournement-mob' then '07.8 - Bouée, Feux à retournement et MOB' end;
  if selected_category_label is null or coalesce(length(btrim(p_item->>'document_title')),0) not between 1 and 2000 then
    raise exception 'Renseignez le type et la désignation du matériel.' using errcode='22023'; end if;
  if nullif(p_item->>'expires_on','')::date < nullif(p_item->>'issued_on','')::date then
    raise exception 'L’échéance doit suivre la date d’émission.' using errcode='22023'; end if;
  if p_id is null then
    insert into public.lsa_items(company_id,vessel_id,vessel_name,category_key,category_label,title,document_title,issued_on,expires_on,planned_on,provider_name,visit_location,notes,renewal_notes,source_label,status)
    values(company,p_vessel_id,vessel_name,p_item->>'category_key',selected_category_label,btrim(p_item->>'document_title'),btrim(p_item->>'document_title'),
      nullif(p_item->>'issued_on','')::date,nullif(p_item->>'expires_on','')::date,nullif(p_item->>'planned_on','')::date,
      p_item->>'provider_name',p_item->>'visit_location',p_item->>'notes',p_item->>'renewal_notes','seapilot','missing') returning id into result_id;
  else
    update public.lsa_items i set category_key=p_item->>'category_key',category_label=selected_category_label,
      title=btrim(p_item->>'document_title'),document_title=btrim(p_item->>'document_title'),
      issued_on=nullif(p_item->>'issued_on','')::date,expires_on=nullif(p_item->>'expires_on','')::date,planned_on=nullif(p_item->>'planned_on','')::date,
      provider_name=p_item->>'provider_name',visit_location=p_item->>'visit_location',notes=p_item->>'notes',renewal_notes=p_item->>'renewal_notes',updated_at=clock_timestamp()
    where i.id=p_id and i.company_id=company and i.vessel_id=p_vessel_id and i.updated_at=p_expected_updated_at returning id into result_id;
    if result_id is null then raise exception 'Fiche modifiée ou inaccessible. Rechargez le registre avant de réessayer.' using errcode='40001'; end if;
  end if;
  return result_id;
end $$;
revoke all on function private.save_lsa_item(bigint,jsonb,bigint,timestamptz) from public,anon;
grant execute on function private.save_lsa_item(bigint,jsonb,bigint,timestamptz) to authenticated;
create function public.save_lsa_item(p_vessel_id bigint,p_item jsonb,p_id bigint default null,p_expected_updated_at timestamptz default null)
returns bigint language sql security invoker set search_path='' as $$
  select private.save_lsa_item(p_vessel_id,p_item,p_id,p_expected_updated_at);
$$;
revoke all on function public.save_lsa_item(bigint,jsonb,bigint,timestamptz) from public,anon;
grant execute on function public.save_lsa_item(bigint,jsonb,bigint,timestamptz) to authenticated;
notify pgrst,'reload schema';
