begin;

alter table public.documentary_audits
  add column client_name text,
  add constraint documentary_audits_client_name_check check (
    client_name is null or (
      kind = 'client'
      and length(client_name) between 1 and 200
      and client_name = btrim(regexp_replace(client_name, '[[:space:]]+', ' ', 'g'))
    )
  );

-- Unnamed legacy audits and all other audit kinds keep the previous yearly slot.
-- Named client audits use a distinct slot for each case-insensitive client name.
create unique index documentary_audits_client_slot_key
  on public.documentary_audits (company_id, kind, year, vessel_id, lower(coalesce(client_name, '')));

alter table public.documentary_audits
  drop constraint documentary_audits_company_id_kind_year_vessel_id_key;

comment on table public.documentary_audits is 'Documentary dossier per company, type, campaign year and vessel. Client audits may have one dossier per named client.';
comment on column public.documentary_audits.client_name is 'Required by the save RPC for new client audit dossiers. NULL is retained on legacy dossiers without an identified client and on other audit kinds.';

create or replace function documentary_audit_private.save_audit(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_company_id bigint:=internal_audit_private.assert_manager(p_payload); old_audit public.documentary_audits;
  target public.documentary_audits; vessel public.vessels; evidence jsonb; planned_date date; v_client_name text; v_constraint_name text;
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
  if jsonb_typeof(p_payload->'clientName') not in ('string', 'null') then
    raise exception 'Nom du client invalide.' using errcode='22023';
  end if;
  v_client_name := case when p_payload ? 'clientName'
    then nullif(btrim(regexp_replace(p_payload->>'clientName', '[[:space:]]+', ' ', 'g')), '')
    else old_audit.client_name end;
  if p_payload->>'kind' = 'client' then
    if (old_audit.id is null or old_audit.client_name is not null) and v_client_name is null then
      raise exception 'Renseignez le nom du client.' using errcode='22023';
    end if;
    if length(v_client_name) > 200 then
      raise exception 'Le nom du client est limité à 200 caractères.' using errcode='22023';
    end if;
  elsif v_client_name is not null then
    raise exception 'Le nom du client est réservé aux audits clients.' using errcode='22023';
  end if;

  select * into vessel from public.vessels v where v.id=(p_payload->>'siteId')::bigint and v.company_id=v_company_id and v.active;
  if vessel.id is null then raise exception 'Choisissez un navire actif de cette société.' using errcode='22023'; end if;
  evidence:=documentary_audit_private.validate_file_refs(coalesce(p_payload->'files',old_audit.files,'[]'::jsonb),v_company_id,(p_payload->>'id')::uuid,(p_payload->>'id')::uuid,'audit',coalesce(old_audit.files,'[]'::jsonb));
  insert into public.documentary_audits(id,company_id,kind,site_id,vessel_id,year,title,planned_on,audited_on,auditor_name,files,client_name)
  values((p_payload->>'id')::uuid,v_company_id,p_payload->>'kind',vessel.id,vessel.id,(p_payload->>'year')::integer,btrim(p_payload->>'title'),planned_date,(p_payload->>'auditedOn')::date,coalesce(btrim(p_payload->>'auditorName'),''),evidence,v_client_name)
  on conflict(id) do update set title=excluded.title,planned_on=excluded.planned_on,audited_on=excluded.audited_on,auditor_name=excluded.auditor_name,files=excluded.files,client_name=excluded.client_name,updated_at=clock_timestamp()
  where old_audit.id is not null and documentary_audits.company_id=excluded.company_id and documentary_audits.kind=excluded.kind
    and documentary_audits.year=excluded.year and documentary_audits.vessel_id=excluded.vessel_id
  returning * into target;
  if target.id is null then raise exception 'Dossier inaccessible ou identité modifiée simultanément.' using errcode='42501'; end if;
  return to_jsonb(target);
exception when unique_violation then
  get stacked diagnostics v_constraint_name = constraint_name;
  if v_constraint_name = 'documentary_audits_client_slot_key' and p_payload->>'kind' = 'client' then
    raise exception 'Un audit existe déjà pour ce client, ce navire et cette année.' using errcode='23505';
  end if;
  raise;
end;
$$;

notify pgrst,'reload schema';

commit;
