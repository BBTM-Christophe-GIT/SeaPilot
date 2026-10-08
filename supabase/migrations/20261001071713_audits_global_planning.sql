-- Planned documentary dates are independent from actual audited dates. The
-- Planning feed exposes only calendar metadata through existing Planning
-- permissions, while full audit content retains its stricter audit RLS.
alter table public.documentary_audits add column planned_on date;
create index documentary_audits_company_planned_idx on public.documentary_audits(company_id,planned_on)
  where planned_on is not null;
comment on column public.documentary_audits.planned_on is 'Optional planned audit day, distinct from audited_on. NULL excludes the dossier from the global Planning audit feed.';

create function internal_audit_private.planning_overview()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_company_id bigint:=public.current_planning_company_id();
begin
  if (select auth.uid()) is null or not public.user_belongs_to_company(v_company_id) then
    raise exception 'Authentification requise pour consulter le Planning.' using errcode='42501'; end if;
  return coalesce((
    select jsonb_agg(item order by planned_on,id,kind) from (
      select audit.planned_on,audit.id,'internal_ism'::text kind,jsonb_build_object(
        'id',audit.id::text,'kind','internal_ism','siteId',site.id::text,'siteName',site.name,'vesselId',site.vessel_id,
        'plannedOn',audit.planned_on,'performedOn',audit.performed_on,'title','Audit ISM Interne · '||site.name,
        'status',audit.status,'canOpen',internal_audit_private.can_read_audit(audit.id)) item
      from public.internal_audits audit join public.internal_audit_sites site on site.id=audit.site_id and site.company_id=audit.company_id
      where audit.company_id=v_company_id and case when site.vessel_id is null
        then public.planning_user_can('read',v_company_id,null,null,null)
        else public.planning_can_read_row(v_company_id,site.vessel_id,null,audit.planned_on,audit.planned_on) end
      union all
      select audit.planned_on,audit.id,audit.kind,jsonb_build_object(
        'id',audit.id::text,'kind',audit.kind,'siteId',audit.site_id::text,'siteName',vessel.name,'vesselId',audit.vessel_id,
        'plannedOn',audit.planned_on,'performedOn',audit.audited_on,'title',audit.title,
        'status',case when audit.audited_on is not null then 'completed' else 'planned' end,
        'canOpen',documentary_audit_private.can_read_audit(audit.id)) item
      from public.documentary_audits audit join public.vessels vessel on vessel.id=audit.vessel_id and vessel.company_id=audit.company_id
      where audit.company_id=v_company_id and audit.planned_on is not null
        and public.planning_can_read_row(v_company_id,audit.vessel_id,null,audit.planned_on,audit.planned_on)
    ) visible
  ),'[]'::jsonb);
end;
$$;
create function public.planning_audits_overview()
returns jsonb language sql stable security invoker set search_path='' as $$select internal_audit_private.planning_overview();$$;
revoke all on function internal_audit_private.planning_overview(),public.planning_audits_overview() from public,anon,authenticated;
grant execute on function internal_audit_private.planning_overview(),public.planning_audits_overview() to authenticated;
comment on function public.planning_audits_overview() is 'Minimal planned audit metadata authorized by real Planning row permissions. canOpen is separately computed using full audit read permission; no answers, findings or file references are returned.';

create or replace function documentary_audit_private.save_audit(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_company_id bigint:=internal_audit_private.assert_manager(p_payload); old_audit public.documentary_audits;
  target public.documentary_audits; vessel public.vessels; evidence jsonb; planned_date date;
begin
  if p_payload->>'id' is null or p_payload->>'kind' is null or p_payload->>'kind' not in ('ovid','ecmid','external_ism','client')
    or p_payload->>'year' is null or (p_payload->>'year')::integer not between 1900 and 9998
    or jsonb_typeof(p_payload->'title') is distinct from 'string' or length(btrim(p_payload->>'title')) not between 1 and 200 then raise exception 'Dossier invalide.' using errcode='22023'; end if;
  select * into old_audit from public.documentary_audits audit where audit.id=(p_payload->>'id')::uuid for update;
  if old_audit.id is not null and old_audit.company_id<>v_company_id then raise exception 'Dossier inaccessible.' using errcode='42501'; end if;
  if p_payload ? 'plannedOn' then
    if jsonb_typeof(p_payload->'plannedOn') not in ('string','null')
      or (p_payload->>'plannedOn' is not null and p_payload->>'plannedOn' !~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$') then
      raise exception 'Date prévue invalide.' using errcode='22023'; end if;
    begin
      planned_date:=(p_payload->>'plannedOn')::date;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception 'Date prévue invalide.' using errcode='22023';
    end;
  else planned_date:=old_audit.planned_on;
  end if;
  if old_audit.id is not null and (old_audit.kind<>p_payload->>'kind' or old_audit.site_id is distinct from (p_payload->>'siteId')::bigint or old_audit.year<>(p_payload->>'year')::integer) then
    raise exception 'Le type, le navire et l’année d’un dossier existant sont conservés.' using errcode='22023'; end if;
  select * into vessel from public.vessels v where v.id=(p_payload->>'siteId')::bigint and v.company_id=v_company_id and v.active;
  if vessel.id is null then raise exception 'Choisissez un navire actif de cette société.' using errcode='22023'; end if;
  evidence:=documentary_audit_private.validate_file_refs(coalesce(p_payload->'files',old_audit.files,'[]'::jsonb),v_company_id,(p_payload->>'id')::uuid,(p_payload->>'id')::uuid,'audit',coalesce(old_audit.files,'[]'::jsonb));
  insert into public.documentary_audits(id,company_id,kind,site_id,vessel_id,year,title,planned_on,audited_on,auditor_name,files)
  values((p_payload->>'id')::uuid,v_company_id,p_payload->>'kind',vessel.id,vessel.id,(p_payload->>'year')::integer,btrim(p_payload->>'title'),planned_date,(p_payload->>'auditedOn')::date,coalesce(btrim(p_payload->>'auditorName'),''),evidence)
  on conflict(id) do update set title=excluded.title,planned_on=excluded.planned_on,audited_on=excluded.audited_on,auditor_name=excluded.auditor_name,files=excluded.files,updated_at=clock_timestamp()
  where old_audit.id is not null and documentary_audits.company_id=excluded.company_id and documentary_audits.kind=excluded.kind
    and documentary_audits.year=excluded.year and documentary_audits.vessel_id=excluded.vessel_id
  returning * into target;
  if target.id is null then raise exception 'Dossier inaccessible ou identité modifiée simultanément.' using errcode='42501'; end if;
  return to_jsonb(target);
end;
$$;

notify pgrst,'reload schema';
