-- Administrative lifecycle is separate from the immutable signed declaration.
create table sea_operation_private.record_administration (
  operation_id uuid primary key references public.sea_operations(id) on delete restrict,
  superseded_by_id uuid unique references public.sea_operations(id) on delete restrict deferrable initially deferred,
  revised_at timestamptz,
  revised_by uuid references public.profiles(id) on delete restrict,
  revised_by_name text,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete restrict,
  deleted_by_name text,
  check (operation_id is distinct from superseded_by_id),
  check ((superseded_by_id is null and revised_at is null and revised_by is null and revised_by_name is null)
    or (superseded_by_id is not null and revised_at is not null and revised_by is not null and revised_by_name is not null)),
  check ((deleted_at is null and deleted_by is null and deleted_by_name is null)
    or (deleted_at is not null and deleted_by is not null and deleted_by_name is not null)),
  check ((superseded_by_id is not null)::integer+(deleted_at is not null)::integer=1)
);
alter table sea_operation_private.record_administration enable row level security;
revoke all on sea_operation_private.record_administration from public,anon,authenticated,service_role;
create index sea_operation_administration_revised_by_idx on sea_operation_private.record_administration(revised_by) where revised_by is not null;
create index sea_operation_administration_deleted_by_idx on sea_operation_private.record_administration(deleted_by) where deleted_by is not null;

create function sea_operation_private.record_is_deleted(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from sea_operation_private.record_administration where operation_id=p_id and deleted_at is not null);
$$;
create function sea_operation_private.record_is_current(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists(select 1 from sea_operation_private.record_administration where operation_id=p_id);
$$;
create function sea_operation_private.can_admin(p_company bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select sea_operation_private.can_read(p_company) and public.has_company_role(p_company,array['admin']);
$$;

alter policy sea_operations_read on public.sea_operations to authenticated
using (sea_operation_private.can_read(company_id) and not sea_operation_private.record_is_deleted(id));

create or replace function sea_operation_private.can_edit(p_record public.sea_operations) returns boolean
language sql stable set search_path = '' as $$
  select p_record.status='draft' and sea_operation_private.can_read(p_record.company_id)
    and sea_operation_private.record_is_current(p_record.id)
    and (p_record.created_by=(select auth.uid()) or public.has_company_role(p_record.company_id,array['admin','direction','armement'])
      or sea_operation_private.can_sign_record(p_record));
$$;
create or replace function sea_operation_private.can_sign_record(p_record public.sea_operations) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare selected text:=p_record.draft#>>'{planning,captainPersonId}';
begin
  if p_record.status<>'draft' or not coalesce(sea_operation_private.can_read(p_record.company_id),false)
    or not sea_operation_private.record_is_current(p_record.id) then return false; end if;
  return exists(select 1 from sea_operation_private.captains(p_record.company_id,p_record.vessel_id,sea_operation_private.record_date(p_record)) captain
    where captain.user_id=(select auth.uid()) and (selected is null or selected=captain.person_id::text));
end;
$$;
create or replace function sea_operation_private.record_json(p_record public.sea_operations) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare administration sea_operation_private.record_administration; previous_id uuid;
begin
  if not coalesce(sea_operation_private.can_read(p_record.company_id),false) or sea_operation_private.record_is_deleted(p_record.id)
    or not exists(select 1 from public.sea_operations where id=p_record.id and company_id=p_record.company_id) then
    raise exception 'Opération inaccessible.' using errcode='42501'; end if;
  select * into administration from sea_operation_private.record_administration where operation_id=p_record.id;
  select operation_id into previous_id from sea_operation_private.record_administration where superseded_by_id=p_record.id;
  return to_jsonb(p_record)||jsonb_build_object('can_edit',sea_operation_private.can_edit(p_record),
    'can_sign',sea_operation_private.can_sign_record(p_record),
    'can_revise',p_record.status='signed' and sea_operation_private.record_is_current(p_record.id) and sea_operation_private.can_admin(p_record.company_id),
    'can_delete',sea_operation_private.record_is_current(p_record.id) and sea_operation_private.can_admin(p_record.company_id),
    'previous_revision_id',previous_id,'superseded_by_id',administration.superseded_by_id);
end;
$$;

create or replace function sea_operation_private.detail(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare operation public.sea_operations;
begin
  select * into operation from public.sea_operations where id=p_id;
  if operation.id is null or not coalesce(sea_operation_private.can_read(operation.company_id),false)
    or sea_operation_private.record_is_deleted(p_id) then raise exception 'Opération inaccessible.' using errcode='42501'; end if;
  return sea_operation_private.record_json(operation);
end;
$$;

-- Preserve all current vessel projections, including draft and the Hs/period matrix.
do $migration$
declare definition text:=pg_get_functiondef('sea_operation_private.overview()'::regprocedure);
begin
  if position('where record.company_id = company)' in definition)=0 then raise exception 'Expected overview guard missing'; end if;
  execute replace(definition,'where record.company_id = company)',
    'where record.company_id = company and sea_operation_private.record_is_current(record.id))');
end;
$migration$;

create function sea_operation_private.is_admin_revision_clone(p_record public.sea_operations) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_record.status='draft' and p_record.version=1 and p_record.created_by=(select auth.uid()) and p_record.updated_by=(select auth.uid())
    and p_record.signature_snapshot='{}'::jsonb and p_record.signed_by is null and p_record.signed_by_name is null
    and p_record.signed_at is null and p_record.captain_name is null and sea_operation_private.can_admin(p_record.company_id)
    and exists(select 1 from sea_operation_private.record_administration administration
      join public.sea_operations original on original.id=administration.operation_id and original.company_id=p_record.company_id
      where administration.superseded_by_id=p_record.id and administration.revised_by=(select auth.uid()) and original.status='signed'
        and p_record.vessel_id is not distinct from original.vessel_id
        and p_record.draft=jsonb_set(jsonb_set(original.draft,'{decision}','""'),'{signature,acknowledged}','false'));
$$;

create or replace function sea_operation_private.capture_vessel_weather_matrix() returns trigger
language plpgsql set search_path = '' as $$
declare supplied jsonb:=new.draft#>'{vessel,weatherMatrix}'; canonical jsonb;
begin
  -- The only exception is an exact historical clone linked by the admin RPC in
  -- this transaction. No client-controlled flag or session variable grants it.
  if tg_op='INSERT' and sea_operation_private.is_admin_revision_clone(new) then return new; end if;
  if supplied is not null and supplied<>'null'::jsonb and not sea_operation_private.valid_weather_matrix(supplied) then
    raise exception 'La matrice Hs × période du navire est invalide.' using errcode='22023'; end if;
  if new.status='draft' then
    if new.vessel_id is null then new.draft:=new.draft#-'{vessel,weatherMatrix}';
    else
      select vessel.weather_matrix into canonical from public.vessels vessel where vessel.id=new.vessel_id and vessel.company_id=new.company_id
        and vessel.active and vessel.asset_kind='vessel';
      if not found then raise exception 'Navire inaccessible.' using errcode='42501'; end if;
      new.draft:=jsonb_set(new.draft,'{vessel,weatherMatrix}',coalesce(canonical,'null'::jsonb));
    end if;
  end if;
  return new;
end;
$$;

create function sea_operation_private.revise(p_id uuid,p_version integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare original public.sea_operations; revised public.sea_operations; next_id uuid:=gen_random_uuid(); actor text;
begin
  select * into original from public.sea_operations where id=p_id for update;
  if original.id is null or not coalesce(sea_operation_private.can_admin(original.company_id),false) then
    raise exception 'Seul un administrateur autorisé peut réviser cette opération.' using errcode='42501'; end if;
  if p_version is distinct from original.version or not sea_operation_private.record_is_current(p_id) then
    raise exception 'L’opération a été modifiée ou retirée. Rechargez-la avant de continuer.' using errcode='40001'; end if;
  if original.status<>'signed' then raise exception 'Seule une opération signée nécessite une nouvelle révision.' using errcode='22023'; end if;
  actor:=sea_operation_private.actor_name(original.company_id);
  insert into sea_operation_private.record_administration(operation_id,superseded_by_id,revised_at,revised_by,revised_by_name)
    values(p_id,next_id,clock_timestamp(),(select auth.uid()),actor);
  -- Keep the original planning snapshot even when that historical planning no
  -- longer exists. A later save/sign follows the usual current business guards.
  insert into public.sea_operations(id,company_id,vessel_id,draft,created_by,created_by_name,updated_by,updated_by_name,signature_snapshot)
    values(next_id,original.company_id,original.vessel_id,
      jsonb_set(jsonb_set(original.draft,'{decision}','""'),'{signature,acknowledged}','false'),
      (select auth.uid()),actor,(select auth.uid()),actor,'{}'::jsonb) returning * into revised;
  return sea_operation_private.record_json(revised);
end;
$$;
create function sea_operation_private.delete_record(p_id uuid,p_version integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare operation public.sea_operations;
begin
  select * into operation from public.sea_operations where id=p_id for update;
  if operation.id is null or not coalesce(sea_operation_private.can_admin(operation.company_id),false) then
    raise exception 'Seul un administrateur autorisé peut supprimer cette opération.' using errcode='42501'; end if;
  if p_version is distinct from operation.version or not sea_operation_private.record_is_current(p_id) then
    raise exception 'L’opération a été modifiée ou retirée. Rechargez-la avant de continuer.' using errcode='40001'; end if;
  insert into sea_operation_private.record_administration(operation_id,deleted_at,deleted_by,deleted_by_name)
    values(p_id,clock_timestamp(),(select auth.uid()),sea_operation_private.actor_name(operation.company_id));
  return jsonb_build_object('id',p_id,'deleted',true);
end;
$$;
create function public.sea_operation_revise(p_id uuid,p_version integer) returns jsonb
language sql security invoker set search_path = '' as $$select sea_operation_private.revise(p_id,p_version);$$;
create function public.sea_operation_delete(p_id uuid,p_version integer) returns jsonb
language sql security invoker set search_path = '' as $$select sea_operation_private.delete_record(p_id,p_version);$$;

create or replace function sea_operation_private.can_read_signature(p_bucket text,p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and (
    exists(select 1 from public.sea_operations operation where sea_operation_private.can_read(operation.company_id)
      and not sea_operation_private.record_is_deleted(operation.id)
      and operation.signature_snapshot->>'storage_bucket'=p_bucket and operation.signature_snapshot->>'storage_path'=p_path)
    or exists(select 1 from sea_operation_private.signature_preview_grants scope where scope.user_id=(select auth.uid())
      and sea_operation_private.can_read(scope.company_id) and scope.storage_bucket=p_bucket and scope.storage_path=p_path and scope.expires_at>now()));
$$;

-- Keep observations and queue rows. Superseded signed versions still collect;
-- deleted versions cannot be read, newly claimed or completed by an old lease.
do $migration$
declare definition text; needle text;
begin
  definition:=pg_get_functiondef('sea_operation_private.weather_observations(uuid)'::regprocedure);
  needle:='if operation.id is null or not coalesce(sea_operation_private.can_read(operation.company_id),false) then';
  if position(needle in definition)=0 then raise exception 'Expected observation read guard missing'; end if;
  execute replace(definition,needle,'if operation.id is null or not coalesce(sea_operation_private.can_read(operation.company_id),false) or sea_operation_private.record_is_deleted(p_id) then');
  definition:=pg_get_functiondef('sea_operation_private.claim_weather_observations(integer)'::regprocedure);
  needle:='where completed_at is null and next_attempt_at <= clock_timestamp() and expires_at > clock_timestamp()';
  if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>3 then raise exception 'Expected three observation claim guards missing'; end if;
  execute replace(definition,needle,needle||' and not sea_operation_private.record_is_deleted(operation_id)');
  definition:=pg_get_functiondef('sea_operation_private.complete_weather_observation(uuid,text,uuid,jsonb)'::regprocedure);
  needle:='if observation.operation_id is null then return false; end if;';
  if position(needle in definition)=0 then raise exception 'Expected observation lease guard missing'; end if;
  execute replace(definition,needle,'if observation.operation_id is null then return false; end if;
  -- Serialize with an administrative deletion before testing its tombstone.
  -- Delete locks only the parent, so this introduces no parent/annex lock cycle.
  perform 1 from public.sea_operations where id=observation.operation_id for key share;
  if sea_operation_private.record_is_deleted(observation.operation_id) then return false; end if;');
end;
$migration$;

revoke all on function sea_operation_private.record_is_deleted(uuid),sea_operation_private.record_is_current(uuid),sea_operation_private.can_admin(bigint),
  sea_operation_private.is_admin_revision_clone(public.sea_operations),sea_operation_private.revise(uuid,integer),sea_operation_private.delete_record(uuid,integer),
  public.sea_operation_revise(uuid,integer),public.sea_operation_delete(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function sea_operation_private.record_is_deleted(uuid),sea_operation_private.record_is_current(uuid),sea_operation_private.can_admin(bigint),
  sea_operation_private.is_admin_revision_clone(public.sea_operations),sea_operation_private.revise(uuid,integer),sea_operation_private.delete_record(uuid,integer),
  public.sea_operation_revise(uuid,integer),public.sea_operation_delete(uuid,integer) to authenticated;
-- Internal save_core remains inaccessible to callers; signing retains the real
-- assigned captain requirement. No table write or administrative role is added.
revoke all on function sea_operation_private.save_core(uuid,integer,jsonb) from public,anon,authenticated;
notify pgrst,'reload schema';
