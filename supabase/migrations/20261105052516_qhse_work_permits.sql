-- Operational permits are separate from the legacy SharePoint work_permits library.
create table public.qhse_work_permits (
  id uuid primary key default gen_random_uuid(),
  company_id bigint not null default public.current_planning_company_id()
    references public.companies(id) on delete restrict,
  vessel_id bigint not null references public.vessels(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 250),
  permit_type text not null check (permit_type in (
    'espace-clos', 'palan', 'pression', 'point-chaud', 'electrique', 'hauteur', 'grue', 'chariot'
  )),
  zone text not null default '' check (char_length(zone) <= 250),
  plan_key text check (char_length(btrim(plan_key)) between 1 and 120),
  point_x double precision,
  point_y double precision,
  starts_at timestamptz not null,
  ends_at timestamptz,
  exclusion_zones jsonb not null default '[]'::jsonb,
  checklist_answers jsonb not null default '{}'::jsonb check (jsonb_typeof(checklist_answers) = 'object'),
  closing_answers jsonb not null default '{}'::jsonb check (jsonb_typeof(closing_answers) = 'object'),
  status text not null default 'draft',
  paused_at timestamptz,
  paused_by uuid,
  paused_seconds double precision not null default 0 check (paused_seconds >= 0 and paused_seconds < 'Infinity'::double precision),
  pause_history jsonb not null default '[]'::jsonb check (jsonb_typeof(pause_history) = 'array'),
  captain_signed_at timestamptz,
  captain_signed_by bigint references public.people(id) on delete restrict,
  captain_signer_name text,
  captain_signature_snapshot jsonb,
  closed_at timestamptz,
  closed_by uuid,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint qhse_work_permit_date_order check (isfinite(starts_at) and (ends_at is null or (isfinite(ends_at) and ends_at >= starts_at))),
  constraint qhse_work_permit_point check (
    (point_x is null and point_y is null)
    or (point_x is not null and point_y is not null and plan_key is not null
      and point_x between 0 and 1 and point_y between 0 and 1)
  ),
  constraint qhse_work_permit_lifecycle check (
    (status = 'draft' and captain_signed_at is null and captain_signed_by is null
      and captain_signer_name is null and captain_signature_snapshot is null
      and closed_at is null and closed_by is null and ends_at is null
      and paused_at is null and paused_by is null and paused_seconds = 0 and pause_history = '[]'::jsonb)
    or (status in ('open', 'paused', 'closed') and captain_signed_at is not null and captain_signed_by is not null
      and captain_signer_name is not null and captain_signature_snapshot is not null
      and (
        (status = 'open' and ends_at is null and closed_at is null and closed_by is null
          and paused_at is null and paused_by is null)
        or (status = 'paused' and ends_at is null and closed_at is null and closed_by is null
          and paused_at is not null and paused_at >= starts_at and paused_by is not null)
        or (status = 'closed' and ends_at is not null and closed_at is not null and closed_at = ends_at and closed_by is not null
          and paused_at is null and paused_by is null)
      ))
  )
);

create index qhse_work_permits_company_status_dates_idx
  on public.qhse_work_permits (company_id, status, starts_at, id);
create index qhse_work_permits_vessel_idx on public.qhse_work_permits (vessel_id);
create index qhse_work_permits_captain_idx on public.qhse_work_permits (captain_signed_by)
  where captain_signed_by is not null;

create function private.work_permit_locations()
returns table (id bigint, name text, asset_kind text, can_sign boolean)
language sql stable security definer set search_path = ''
as $$
  with actor as (
    select
      company.id as company_id,
      public.has_company_role(company.id, array['admin', 'direction']) as fleet_scope,
      public.has_company_role(company.id, array['capitaine']) as captain_profile,
      person.id as person_id
    from public.companies company
    join public.company_memberships membership on membership.company_id = company.id
      and membership.user_id = auth.uid() and membership.active
    left join public.people person on person.company_id = company.id
      and person.user_id = membership.user_id and person.active
    where auth.uid() is not null
      and company.id = public.current_planning_company_id()
      and company.active
      and public.has_company_role(company.id, array['admin', 'direction', 'armement', 'capitaine', 'marin'])
  ), assignments as (
    select assignment.vessel_id,
      bool_or(
        (actor.captain_profile and assignment.captain_person_id = actor.person_id)
        or (assignment.crew_person_id = actor.person_id and public.planning_assignment_is_captain(
          assignment.id, (current_timestamp at time zone 'Europe/Paris')::date
        ))
      ) as assigned_captain
    from actor
    join public.planning_assignments assignment on assignment.company_id = actor.company_id
      and actor.person_id in (assignment.crew_person_id, assignment.captain_person_id)
      and assignment.confirmation_status = 'confirmed'
      and assignment.starts_at <= current_timestamp
      and current_timestamp < assignment.ends_at
    group by assignment.vessel_id
  )
  select vessel.id, vessel.name, vessel.asset_kind,
    coalesce(assignments.assigned_captain, false)
  from actor
  join public.vessels vessel on vessel.company_id = actor.company_id
  left join assignments on assignments.vessel_id = vessel.id
  where vessel.asset_kind in ('vessel', 'quay')
    and (actor.fleet_scope or assignments.vessel_id is not null)
  order by vessel.name, vessel.id;
$$;

create function public.list_work_permit_locations()
returns table (id bigint, name text, asset_kind text, can_sign boolean)
language sql stable security invoker set search_path = ''
as $$ select * from private.work_permit_locations(); $$;

alter table public.qhse_work_permits enable row level security;

create policy qhse_work_permits_read on public.qhse_work_permits for select to authenticated
using (
  company_id = (select public.current_planning_company_id())
  and vessel_id in (select location.id from private.work_permit_locations() location)
);

create policy qhse_work_permits_insert on public.qhse_work_permits for insert to authenticated
with check (
  company_id = (select public.current_planning_company_id())
  and vessel_id in (select location.id from private.work_permit_locations() location)
  and created_by = (select auth.uid())
  and status = 'draft'
);

create policy qhse_work_permits_update on public.qhse_work_permits for update to authenticated
using (
  company_id = (select public.current_planning_company_id())
  and vessel_id in (select location.id from private.work_permit_locations() location)
  and status in ('draft', 'open', 'paused')
)
with check (
  company_id = (select public.current_planning_company_id())
  and vessel_id in (select location.id from private.work_permit_locations() location)
  and status in ('draft', 'open', 'paused')
);

revoke all on public.qhse_work_permits from public, anon, authenticated;
grant select on public.qhse_work_permits to authenticated;
grant insert (vessel_id, title, permit_type, zone, plan_key, point_x, point_y, starts_at, exclusion_zones,
  checklist_answers, closing_answers) on public.qhse_work_permits to authenticated;
grant update (title, permit_type, zone, plan_key, point_x, point_y, starts_at, exclusion_zones,
  checklist_answers, closing_answers) on public.qhse_work_permits to authenticated;

create function private.prepare_work_permit_write()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare
  asset_name text;
  allowed_plan_keys text[];
  polygon jsonb;
  vertices jsonb;
  vertex jsonb;
  next_vertex jsonb;
  i integer;
  area numeric;
begin
  if tg_op = 'INSERT' or (new.plan_key, new.exclusion_zones) is distinct from (old.plan_key, old.exclusion_zones) then
    if jsonb_typeof(new.exclusion_zones) is distinct from 'array' then
      raise exception 'Les zones de danger doivent être une liste.' using errcode = '23514';
    end if;
    if jsonb_array_length(new.exclusion_zones) > 30 then
      raise exception 'Un permis peut contenir au maximum 30 zones de danger.' using errcode = '23514';
    end if;

    if new.plan_key is not null or jsonb_array_length(new.exclusion_zones) > 0 then
      select regexp_replace(lower(btrim(location.name)), '[[:space:]-]+', ' ', 'g') into asset_name
      from private.work_permit_locations() location
      where location.id = new.vessel_id;

      allowed_plan_keys := case asset_name
        when 'goury' then array['pont-principal', 'pont-superieur', 'sous-pont-principal', 'profil']
        when 'yard le havre' then array['yard-3d']
        when 'yard du havre' then array['yard-3d']
        else array[]::text[]
      end;

      if new.plan_key is not null and not new.plan_key = any(allowed_plan_keys) then
        raise exception 'Ce plan ne correspond pas au lieu du permis.' using errcode = '23514';
      end if;

      for polygon in select value from jsonb_array_elements(new.exclusion_zones) loop
        vertices := polygon->'points';
        if jsonb_typeof(polygon) is distinct from 'object'
          or jsonb_typeof(polygon->'planKey') is distinct from 'string'
          or not (polygon->>'planKey') = any(allowed_plan_keys)
          or jsonb_typeof(vertices) is distinct from 'array'
        then
          raise exception 'Chaque zone doit être rattachée à un plan de ce lieu.' using errcode = '23514';
        end if;
        if jsonb_array_length(vertices) not between 3 and 40 then
          raise exception 'Une zone doit comporter entre 3 et 40 sommets.' using errcode = '23514';
        end if;

        for vertex in select value from jsonb_array_elements(vertices) loop
          if jsonb_typeof(vertex->'x') is distinct from 'number'
            or jsonb_typeof(vertex->'y') is distinct from 'number'
          then
            raise exception 'Les coordonnées des sommets doivent être numériques.' using errcode = '23514';
          end if;
          if (vertex->>'x')::numeric not between 0 and 1 or (vertex->>'y')::numeric not between 0 and 1 then
            raise exception 'Les sommets doivent être à l’intérieur du plan.' using errcode = '23514';
          end if;
        end loop;

        area := 0;
        for i in 0..jsonb_array_length(vertices) - 1 loop
          vertex := vertices->i;
          next_vertex := vertices->((i + 1) % jsonb_array_length(vertices));
          area := area + (vertex->>'x')::numeric * (next_vertex->>'y')::numeric
            - (vertex->>'y')::numeric * (next_vertex->>'x')::numeric;
        end loop;
        if area = 0 then
          raise exception 'Une zone de danger doit délimiter une surface.' using errcode = '23514';
        end if;
      end loop;
    end if;
  end if;

  if tg_op = 'INSERT' then
    if (new.starts_at at time zone 'Europe/Paris')::date <> (current_timestamp at time zone 'Europe/Paris')::date then
      raise exception 'La date de début doit être celle du jour à Paris.' using errcode = '23514';
    end if;
    return new;
  end if;

  if old.status = 'closed' then
    raise exception 'Un permis clôturé est archivé.' using errcode = '55000';
  end if;

  if (new.starts_at at time zone 'Europe/Paris')::date <> (old.starts_at at time zone 'Europe/Paris')::date then
    raise exception 'La date du permis est fixe.' using errcode = '23514';
  end if;

  -- Opening fields constitute the signed scope. Moving/removing a display pin
  -- inside the same named zone or completing closure checks keeps it intact.
  if old.status in ('open', 'paused') and new.status = old.status
    and (new.title, new.permit_type, new.zone, new.plan_key, new.starts_at, new.checklist_answers, new.exclusion_zones)
      is distinct from
        (old.title, old.permit_type, old.zone, old.plan_key, old.starts_at, old.checklist_answers, old.exclusion_zones)
  then
    if old.status = 'paused' or old.pause_history <> '[]'::jsonb then
      raise exception 'Le périmètre signé d’un permis déjà suspendu ne peut plus être modifié.' using errcode = '55000';
    end if;
    new.status := 'draft';
    new.captain_signed_at := null;
    new.captain_signed_by := null;
    new.captain_signer_name := null;
    new.captain_signature_snapshot := null;
  end if;

  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end;
$$;

create trigger qhse_work_permits_before_write
before insert or update on public.qhse_work_permits
for each row execute function private.prepare_work_permit_write();

create function private.sign_work_permit(p_permit_id uuid, p_expected_updated_at timestamptz)
returns public.qhse_work_permits
language plpgsql security definer set search_path = ''
as $$
declare
  target public.qhse_work_permits;
  signer bigint := public.current_person_id();
  signature_snapshot jsonb;
begin
  select permit.* into target
  from public.qhse_work_permits permit
  where permit.id = p_permit_id
    and permit.company_id = public.current_planning_company_id()
    and permit.vessel_id in (select location.id from private.work_permit_locations() location where location.can_sign)
  for update;

  if auth.uid() is null or signer is null or not found then
    raise exception 'Seul un capitaine affecté peut signer ce permis.' using errcode = '42501';
  end if;
  if target.updated_at is distinct from p_expected_updated_at then
    raise exception 'Le permis a été modifié. Actualisez-le avant de signer.' using errcode = '40001';
  end if;
  if target.status <> 'draft' or btrim(target.zone) = '' then
    raise exception 'Seul un brouillon avec une zone de travaux peut être signé.' using errcode = '55000';
  end if;

  signature_snapshot := public.working_time_active_signature_snapshot(target.company_id, signer);
  if signature_snapshot = '{}'::jsonb
    or signature_snapshot->>'signer_user_id' is distinct from auth.uid()::text
    or nullif(btrim(signature_snapshot->>'signer_name'), '') is null
  then
    raise exception 'Enregistrez une signature active dans votre dossier RH avant de valider un permis.' using errcode = '55000';
  end if;

  update public.qhse_work_permits
  set status = 'open',
      captain_signed_at = (signature_snapshot->>'signed_at')::timestamptz,
      captain_signed_by = signer,
      captain_signer_name = signature_snapshot->>'signer_name',
      captain_signature_snapshot = signature_snapshot
  where id = target.id
  returning * into target;
  return target;
end;
$$;

create function private.transition_work_permit(
  p_permit_id uuid, p_expected_updated_at timestamptz, p_action text
)
returns public.qhse_work_permits
language plpgsql security definer set search_path = ''
as $$
declare
  target public.qhse_work_permits;
  actor uuid := auth.uid();
  action_at timestamptz;
begin
  select permit.* into target
  from public.qhse_work_permits permit
  where permit.id = p_permit_id
    and permit.company_id = public.current_planning_company_id()
    and permit.vessel_id in (select location.id from private.work_permit_locations() location)
  for update;

  if actor is null or not found then
    raise exception 'Accès à ce permis refusé.' using errcode = '42501';
  end if;
  if target.updated_at is distinct from p_expected_updated_at then
    raise exception 'Le permis a été modifié. Actualisez-le avant de continuer.' using errcode = '40001';
  end if;

  action_at := clock_timestamp();
  if action_at < target.starts_at then
    raise exception 'Cette action est disponible à partir de l’heure de début.' using errcode = '55000';
  end if;

  if p_action = 'pause' and target.status = 'open' then
    update public.qhse_work_permits
    set status = 'paused', paused_at = action_at, paused_by = actor
    where id = target.id
    returning * into target;
  elsif (p_action = 'resume' and target.status = 'paused')
    or (p_action = 'close' and target.status in ('open', 'paused')) then
    update public.qhse_work_permits
    set status = case when p_action = 'close' then 'closed' else 'open' end,
        paused_seconds = target.paused_seconds + coalesce(extract(epoch from action_at - target.paused_at), 0),
        pause_history = case when target.status = 'paused' then
          target.pause_history || jsonb_build_array(jsonb_build_object(
            'started_at', target.paused_at, 'started_by', target.paused_by,
            'ended_at', action_at, 'ended_by', actor, 'ended_with', p_action
          )) else target.pause_history end,
        paused_at = null,
        paused_by = null,
        ends_at = case when p_action = 'close' then action_at end,
        closed_at = case when p_action = 'close' then action_at end,
        closed_by = case when p_action = 'close' then actor end
    where id = target.id
    returning * into target;
  else
    raise exception 'Cette action est incompatible avec l’état du permis.' using errcode = '55000';
  end if;
  return target;
end;
$$;

create function public.sign_work_permit(p_permit_id uuid, p_expected_updated_at timestamptz)
returns public.qhse_work_permits
language sql security invoker set search_path = ''
as $$ select private.sign_work_permit(p_permit_id, p_expected_updated_at); $$;

create function public.close_work_permit(p_permit_id uuid, p_expected_updated_at timestamptz)
returns public.qhse_work_permits
language sql security invoker set search_path = ''
as $$ select private.transition_work_permit(p_permit_id, p_expected_updated_at, 'close'); $$;

create function public.pause_work_permit(p_permit_id uuid, p_expected_updated_at timestamptz)
returns public.qhse_work_permits
language sql security invoker set search_path = ''
as $$ select private.transition_work_permit(p_permit_id, p_expected_updated_at, 'pause'); $$;

create function public.resume_work_permit(p_permit_id uuid, p_expected_updated_at timestamptz)
returns public.qhse_work_permits
language sql security invoker set search_path = ''
as $$ select private.transition_work_permit(p_permit_id, p_expected_updated_at, 'resume'); $$;

revoke all on function private.prepare_work_permit_write() from public, anon, authenticated;
revoke all on function private.work_permit_locations(), public.list_work_permit_locations(),
  private.sign_work_permit(uuid, timestamptz), public.sign_work_permit(uuid, timestamptz),
  private.transition_work_permit(uuid, timestamptz, text), public.close_work_permit(uuid, timestamptz),
  public.pause_work_permit(uuid, timestamptz), public.resume_work_permit(uuid, timestamptz)
  from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.work_permit_locations(), public.list_work_permit_locations(),
  private.sign_work_permit(uuid, timestamptz), public.sign_work_permit(uuid, timestamptz),
  private.transition_work_permit(uuid, timestamptz, text), public.close_work_permit(uuid, timestamptz),
  public.pause_work_permit(uuid, timestamptz), public.resume_work_permit(uuid, timestamptz)
  to authenticated;

insert into public.role_module_permissions (role_key, module_key, is_visible)
select key, 'workPermits', true
from public.roles
where key in ('admin', 'direction', 'armement', 'capitaine', 'marin')
on conflict (role_key, module_key) do nothing;

notify pgrst, 'reload schema';
