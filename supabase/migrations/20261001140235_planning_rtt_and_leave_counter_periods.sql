-- Congés / RTT use period entitlements, separate from the cumulative crew balance.
alter table public.planning_absences drop constraint planning_absences_type_check;
alter table public.planning_absences add constraint planning_absences_type_check
check(absence_type in ('leave','rtt','illness','training','medical_visit','recovery'));

create function public.planning_absence_balance_has_access(target_person_id bigint, manage boolean default false)
returns boolean language sql stable security invoker set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.people p
    where p.id=target_person_id and p.company_id=public.current_planning_company_id()
      and public.user_belongs_to_company(p.company_id)
      and exists (
        select 1 from public.user_roles r join public.role_module_permissions m on m.role_key=r.role_key
        where r.user_id=auth.uid() and r.company_id=p.company_id and m.module_key='planning' and m.is_visible
      )
      and exists (
        select 1 from public.user_roles r join public.planning_action_permissions a on a.role_key=r.role_key
        where r.user_id=auth.uid() and r.company_id=p.company_id and a.action_key='read'
      )
      and (public.has_any_role(array['admin','direction','armement'])
        or (not manage and p.id=public.current_person_id()))
  );
$$;
revoke all on function public.planning_absence_balance_has_access(bigint,boolean) from public,anon;
grant execute on function public.planning_absence_balance_has_access(bigint,boolean) to authenticated;

create table public.planning_leave_counter_people (
  company_id bigint not null references public.companies(id),
  person_id bigint not null,
  primary key(company_id,person_id),
  foreign key(person_id,company_id) references public.people(id,company_id)
);
create index planning_leave_counter_people_person_company_idx on public.planning_leave_counter_people(person_id,company_id);
alter table public.planning_leave_counter_people enable row level security;
revoke all on public.planning_leave_counter_people from public,anon,authenticated;
grant select on public.planning_leave_counter_people to authenticated;
create policy leave_counter_people_read on public.planning_leave_counter_people for select to authenticated
using(public.planning_absence_balance_has_access(person_id));

-- Resolve actual staff records at deployment; never encode generated person IDs.
do $$
begin
  if (select count(*) from public.people p join public.companies c on c.id=p.company_id
      where c.code='bbtm' and ((lower(btrim(p.first_name))='christophe' and upper(btrim(p.last_name))='MINASSIAN')
        or (lower(btrim(p.first_name))='sophie' and upper(btrim(p.last_name))='HAMEL'))) <> 2 then
    raise exception 'Expected exactly Christophe MINASSIAN and Sophie HAMEL in BBTM';
  end if;
end $$;
insert into public.planning_leave_counter_people(company_id,person_id)
select p.company_id,p.id from public.people p join public.companies c on c.id=p.company_id
where c.code='bbtm' and ((lower(btrim(p.first_name))='christophe' and upper(btrim(p.last_name))='MINASSIAN')
  or (lower(btrim(p.first_name))='sophie' and upper(btrim(p.last_name))='HAMEL'));

create table public.planning_leave_counter_periods (
  id bigint generated always as identity primary key,
  company_id bigint not null,
  person_id bigint not null,
  counter_type text not null check(counter_type in ('leave','rtt')),
  starts_on date not null check(isfinite(starts_on) and starts_on between '1900-01-01'::date and '2100-12-31'::date),
  ends_on date not null check(isfinite(ends_on) and ends_on between '1900-01-01'::date and '2100-12-31'::date
    and ends_on>=starts_on and ends_on-starts_on<3660),
  entitlement numeric(10,2) not null check(entitlement>=0 and entitlement<100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  foreign key(company_id,person_id) references public.planning_leave_counter_people(company_id,person_id),
  unique(company_id,person_id,counter_type,starts_on,ends_on)
);
create index planning_leave_counter_periods_person_idx on public.planning_leave_counter_periods(person_id,company_id);
create index planning_leave_counter_periods_author_idx on public.planning_leave_counter_periods(updated_by);

create function public.guard_planning_leave_counter_period()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op='UPDATE' and row(new.id,new.company_id,new.person_id,new.counter_type,new.starts_on,new.ends_on,new.created_at)
      is distinct from row(old.id,old.company_id,old.person_id,old.counter_type,old.starts_on,old.ends_on,old.created_at) then
    raise exception 'Les bornes et l’identité d’une période de droits sont immuables.' using errcode='23514';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.company_id::text||':leave-counter:'||new.person_id::text||':'||new.counter_type,0));
  if exists (
    select 1 from public.planning_leave_counter_periods p
    where p.company_id=new.company_id and p.person_id=new.person_id and p.counter_type=new.counter_type
      and p.starts_on<=new.ends_on and p.ends_on>=new.starts_on
      and p.id<>new.id
      and not (tg_op='INSERT' and p.starts_on=new.starts_on and p.ends_on=new.ends_on)
  ) then
    raise exception 'PLANNING_LEAVE_COUNTER_PERIOD_OVERLAP' using errcode='23P01';
  end if;
  new.updated_at:=clock_timestamp(); new.updated_by:=auth.uid();
  return new;
end $$;
revoke all on function public.guard_planning_leave_counter_period() from public,anon,authenticated;
create trigger guard_planning_leave_counter_period before insert or update on public.planning_leave_counter_periods
for each row execute function public.guard_planning_leave_counter_period();

alter table public.planning_leave_counter_periods enable row level security;
revoke all on public.planning_leave_counter_periods from public,anon,authenticated;
grant select on public.planning_leave_counter_periods to authenticated;
grant insert(company_id,person_id,counter_type,starts_on,ends_on,entitlement),update(entitlement)
on public.planning_leave_counter_periods to authenticated;
grant usage on sequence public.planning_leave_counter_periods_id_seq to authenticated;
create policy leave_counter_periods_read on public.planning_leave_counter_periods for select to authenticated
using(public.planning_absence_balance_has_access(person_id));
create policy leave_counter_periods_insert on public.planning_leave_counter_periods for insert to authenticated
with check(company_id=(select public.current_planning_company_id()) and public.planning_absence_balance_has_access(person_id,true));
create policy leave_counter_periods_update on public.planning_leave_counter_periods for update to authenticated
using(public.planning_absence_balance_has_access(person_id,true))
with check(company_id=(select public.current_planning_company_id()) and public.planning_absence_balance_has_access(person_id,true));

create function public.save_planning_leave_counter_period(
  p_person_id bigint,p_counter_type text,p_starts_on date,p_ends_on date,p_entitlement numeric
)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare target_company bigint; target_id bigint;
begin
  if p_counter_type is null or p_counter_type not in ('leave','rtt') or p_starts_on is null or p_ends_on is null
    or not isfinite(p_starts_on) or not isfinite(p_ends_on) or p_ends_on<p_starts_on
    or p_starts_on not between '1900-01-01'::date and '2100-12-31'::date
    or p_ends_on not between '1900-01-01'::date and '2100-12-31'::date or p_ends_on-p_starts_on>=3660
    or p_entitlement is null or p_entitlement<0 or p_entitlement>=100000 or p_entitlement<>round(p_entitlement,2) then
    raise exception 'PLANNING_LEAVE_COUNTER_PERIOD_INVALID' using errcode='22023';
  end if;
  if not public.planning_absence_balance_has_access(p_person_id,true) then
    raise exception 'PLANNING_PERMISSION_DENIED: compteur congés et RTT.' using errcode='42501';
  end if;
  select company_id into target_company from public.planning_leave_counter_people where person_id=p_person_id
    and company_id=public.current_planning_company_id();
  if target_company is null then
    raise exception 'PLANNING_LEAVE_COUNTER_PERSON_REQUIRED' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target_company::text||':leave-counter:'||p_person_id::text||':'||p_counter_type,0));
  insert into public.planning_leave_counter_periods(company_id,person_id,counter_type,starts_on,ends_on,entitlement)
  values(target_company,p_person_id,p_counter_type,p_starts_on,p_ends_on,p_entitlement)
  on conflict(company_id,person_id,counter_type,starts_on,ends_on) do update set entitlement=excluded.entitlement
  returning id into target_id;
  return target_id;
end $$;
revoke all on function public.save_planning_leave_counter_period(bigint,text,date,date,numeric) from public,anon;
grant execute on function public.save_planning_leave_counter_period(bigint,text,date,date,numeric) to authenticated;

-- NFD + ASCII filtering is the same exact-name rule as normalizePlanningText.
create function public.planning_balance_normalized_name(value text)
returns text language sql immutable security invoker set search_path = '' as $$
  select upper(regexp_replace(normalize(coalesce(value,''),NFD),'[^A-Za-z0-9]+','','g'));
$$;
revoke all on function public.planning_balance_normalized_name(text) from public,anon,authenticated;

-- Narrow definer endpoint: selected person only, no broad planning/HR data access.
create function public.get_planning_absence_balance_context(p_person_id bigint)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare target public.people; is_counter_person boolean; person_json jsonb; absences_json jsonb;
  counters_json jsonb; checkpoints_json jsonb; assignments_json jsonb; periods_json jsonb; days_json jsonb;
  first_last text; last_first text; source_floor date;
  today_date date := (now() at time zone 'Europe/Paris')::date;
begin
  if not public.planning_absence_balance_has_access(p_person_id) then
    raise exception 'PLANNING_PERMISSION_DENIED: lecture solde personnel.' using errcode='42501';
  end if;
  select * into target from public.people p where p.id=p_person_id and p.company_id=public.current_planning_company_id();
  if target.id is null then raise exception 'PLANNING_PERMISSION_DENIED: lecture solde personnel.' using errcode='42501'; end if;
  person_json:=jsonb_build_object('id',target.id,'first_name',target.first_name,'last_name',target.last_name,
    'hired_on',target.hired_on,'departed_on',target.departed_on,'active',target.active);
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'absence_type',a.absence_type,'starts_at',a.starts_at,
    'ends_at',a.ends_at,'status',a.status,'updated_at',a.updated_at) order by a.starts_at,a.id),'[]'::jsonb)
  into absences_json from public.planning_absences a where a.company_id=target.company_id and a.person_id=target.id;
  select exists(select 1 from public.planning_leave_counter_people p where p.company_id=target.company_id and p.person_id=target.id)
  into is_counter_person;
  if is_counter_person then
    select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'counter_type',p.counter_type,'starts_on',p.starts_on,
      'ends_on',p.ends_on,'entitlement',p.entitlement,'updated_at',p.updated_at) order by p.counter_type,p.starts_on,p.id),'[]'::jsonb)
    into counters_json from public.planning_leave_counter_periods p where p.company_id=target.company_id and p.person_id=target.id;
    return jsonb_build_object('kind','leave_rtt','person',person_json,'counter_periods',counters_json,'absences',absences_json,
      'crew_checkpoints','[]'::jsonb,'crew_sources',jsonb_build_object('assignments','[]'::jsonb,'periods','[]'::jsonb,'days','[]'::jsonb));
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('person_id',p.person_id,'as_of',p.as_of,'balance',p.balance) order by p.as_of,p.id),'[]'::jsonb)
  into checkpoints_json from public.planning_crew_balance_checkpoints p where p.company_id=target.company_id and p.person_id=target.id;
  select max(p.as_of) into source_floor from public.planning_crew_balance_checkpoints p
  where p.company_id=target.company_id and p.person_id=target.id and p.as_of<=today_date;
  if source_floor is null then
    return jsonb_build_object('kind','crew','person',person_json,'counter_periods','[]'::jsonb,'absences',absences_json,
      'crew_checkpoints',checkpoints_json,'crew_sources',jsonb_build_object('assignments','[]'::jsonb,'periods','[]'::jsonb,'days','[]'::jsonb));
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'vessel_id',a.vessel_id,'crew_person_id',a.crew_person_id,
    'starts_on',a.starts_on,'ends_on',a.ends_on,'status_label',a.status_label,'confirmation_status',a.confirmation_status,
    'updated_at',a.updated_at) order by a.starts_on,a.id),'[]'::jsonb)
  into assignments_json from public.planning_assignments a where a.company_id=target.company_id and a.crew_person_id=target.id
    and a.ends_on>=source_floor and a.starts_on<=today_date;
  first_last:=public.planning_balance_normalized_name(concat_ws(' ',target.first_name,target.last_name));
  last_first:=public.planning_balance_normalized_name(concat_ws(' ',target.last_name,target.first_name));
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'vessel_id',p.vessel_id,'person_id',p.person_id,'crew_name',p.crew_name,
    'starts_on',p.starts_on,'ends_on',p.ends_on,'sailor_status',p.sailor_status,'updated_at',p.updated_at) order by p.starts_on,p.id),'[]'::jsonb)
  into periods_json from public.planning_periods p where p.company_id=target.company_id
    and p.ends_on>=source_floor and p.starts_on<=today_date
    and (p.person_id=target.id or (p.person_id is null and first_last<>'' and public.planning_balance_normalized_name(p.crew_name) in (first_last,last_first)));
  select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'vessel_id',d.vessel_id,'person_id',d.person_id,'crew_name',d.crew_name,
    'work_date',d.work_date,'sailor_status',d.sailor_status,'day_status',d.day_status,'source_label',d.source_label,
    'slot365',d.slot365,'updated_at',d.updated_at) order by d.work_date,d.id),'[]'::jsonb)
  into days_json from public.planning_days d where d.company_id=target.company_id and coalesce(d.source_label,'')<>'seapilot-vessel-location'
    and d.work_date between source_floor and today_date
    and (d.person_id=target.id or (d.person_id is null and first_last<>'' and public.planning_balance_normalized_name(d.crew_name) in (first_last,last_first)));
  return jsonb_build_object('kind','crew','person',person_json,'counter_periods','[]'::jsonb,'absences',absences_json,
    'crew_checkpoints',checkpoints_json,'crew_sources',jsonb_build_object('assignments',assignments_json,'periods',periods_json,'days',days_json));
end $$;
revoke all on function public.get_planning_absence_balance_context(bigint) from public,anon;
grant execute on function public.get_planning_absence_balance_context(bigint) to authenticated;

comment on table public.planning_leave_counter_periods is 'Total leave/RTT entitlement for inclusive custom period. Remaining and approved working days are derived; no fabricated initial entitlement and no duplicate stored counter.';
comment on function public.get_planning_absence_balance_context(bigint) is 'Strict selected-person balance projection for office managers or self, active company and visible Planning/read permission. No comments, requester/reviewer identities, identity documents or HR records.';

-- Preserve all existing request permissions, overlap guards and legacy alias normalization.
create or replace function public.save_planning_absence(
  p_absence_id bigint,
  p_person_id bigint,
  p_absence_type text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_reason text default null
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint;
  target_id bigint;
  existing_absence public.planning_absences%rowtype;
  can_manage_company boolean;
  normalized_reason text := trim(coalesce(p_reason, ''));
begin
  select company_id into target_company_id from public.people where id = p_person_id;
  can_manage_company := target_company_id is not null
    and public.planning_user_can('request_absence', target_company_id, null, null, null);
  if target_company_id is null
    or not public.user_belongs_to_company(target_company_id)
    or (not can_manage_company and p_person_id is distinct from public.current_person_id()) then
    raise exception using errcode = '42501', message = 'PLANNING_PERMISSION_DENIED: demande d absence.';
  end if;
  if p_absence_type not in ('leave', 'rtt', 'illness', 'training', 'medical_visit', 'unavailability', 'recovery')
    or p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at
    or length(normalized_reason) > 1000 then
    raise exception using errcode = '22023', message = 'PLANNING_ABSENCE_INVALID: type et dates obligatoires.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_company_id::text || ':absence:' || p_person_id::text, 0));

  if p_absence_id is not null then
    select * into existing_absence from public.planning_absences where id = p_absence_id for update;
    if existing_absence.id is null or existing_absence.company_id is distinct from target_company_id
      or existing_absence.person_id is distinct from p_person_id or existing_absence.status <> 'requested'
      or (not can_manage_company and existing_absence.requested_by is distinct from auth.uid()) then
      raise exception using errcode = '42501', message = 'PLANNING_ABSENCE_NOT_EDITABLE';
    end if;
  end if;

  if exists (
    select 1
    from public.planning_absences absence
    where absence.company_id = target_company_id
      and absence.person_id = p_person_id
      and absence.status in ('requested', 'approved')
      and (p_absence_id is null or absence.id <> p_absence_id)
      and absence.starts_at < p_ends_at
      and absence.ends_at > p_starts_at
  ) then
    raise exception using errcode = '23P01', message = 'PLANNING_ABSENCE_OVERLAP';
  end if;

  if p_absence_id is null then
    insert into public.planning_absences (
      company_id,
      person_id,
      absence_type,
      starts_at,
      ends_at,
      reason
    )
    values (
      target_company_id,
      p_person_id,
      p_absence_type,
      p_starts_at,
      p_ends_at,
      normalized_reason
    )
    returning id into target_id;
  else
    update public.planning_absences
    set absence_type = p_absence_type,
        starts_at = p_starts_at,
        ends_at = p_ends_at,
        reason = normalized_reason,
        updated_by = auth.uid(),
        updated_at = now()
    where id = p_absence_id
    returning id into target_id;
  end if;

  return target_id;
end;
$$;

-- RTT follows the same approved-request move flow; administrator-only rights stay unchanged.
create or replace function public.move_planning_approved_absence(
  p_absence_id bigint,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.planning_absences%rowtype;
begin
  if not public.has_role('admin') then
    raise exception using errcode = '42501', message = 'PLANNING_PERMISSION_DENIED: déplacement vacances validées.';
  end if;

  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception using errcode = '22023', message = 'PLANNING_ABSENCE_INVALID: période incohérente.';
  end if;

  select absence.* into target
  from public.planning_absences absence
  where absence.id = p_absence_id
    and absence.company_id = public.current_planning_company_id()
  for update;

  if target.id is null then
    raise exception using errcode = 'P0002', message = 'PLANNING_ABSENCE_NOT_FOUND';
  end if;

  if target.status <> 'approved' or target.absence_type not in ('leave','rtt') then
    raise exception using errcode = '42501', message = 'PLANNING_APPROVED_LEAVE_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target.company_id::text || ':absence:' || target.person_id::text, 0));

  if exists (
    select 1
    from public.planning_absences absence
    where absence.company_id = target.company_id
      and absence.person_id = target.person_id
      and absence.id <> target.id
      and absence.status in ('requested', 'approved')
      and absence.starts_at < p_ends_at
      and absence.ends_at > p_starts_at
  ) then
    raise exception using errcode = '23P01', message = 'PLANNING_ABSENCE_OVERLAP';
  end if;

  update public.planning_absences
  set starts_at = p_starts_at,
      ends_at = p_ends_at,
      updated_by = auth.uid(),
      updated_at = now()
  where id = target.id
    and company_id = target.company_id;

  return target.id;
end;
$$;

-- Reuse decision recipient/fingerprint rules, without replaying historical notices.
create or replace function public.planning_notify_absence()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  decision_title text;
  decision_body text;
  person_name text;
  request_label text;
begin
  -- Editing a decided request must not recreate or overwrite its decision notice.
  if tg_op = 'UPDATE' and new.absence_type in ('leave','rtt')
    and new.status in ('approved', 'rejected') and old.status = new.status then
    return new;
  end if;

  perform public.planning_queue_notification(new.company_id, 'absence', case when new.status = 'approved' then 'warning' else 'information' end,
    'Absence ' || new.status, new.absence_type || ' · du ' || new.starts_at::date::text || ' au ' || new.ends_at::date::text,
    'absence', new.id, new.person_id, null, (new.starts_at at time zone 'Europe/Paris')::date,
    'absence:' || new.id || ':' || new.status, false);

  if new.absence_type in ('leave','rtt') and new.status in ('approved', 'rejected') then
    select concat_ws(' ', person.first_name, person.last_name) into person_name
    from public.people person where person.id = new.person_id and person.company_id = new.company_id;
    request_label := case new.absence_type when 'rtt' then 'RTT' else 'Congés' end;
    decision_title := request_label || case new.status when 'approved' then ' acceptés' else ' refusés' end;
    decision_body := 'La demande de ' || lower(request_label) || ' pour ' || coalesce(person_name, 'le marin')
      || ' du ' || to_char(new.starts_at at time zone 'Europe/Paris', 'DD/MM/YYYY HH24:MI')
      || ' au ' || to_char(new.ends_at at time zone 'Europe/Paris', 'DD/MM/YYYY HH24:MI')
      || case new.status when 'approved' then ' a été acceptée.' else ' a été refusée.' end
      || case when nullif(btrim(new.review_comment), '') is not null
        then E'\nCommentaire : ' || btrim(new.review_comment) else '' end;

    insert into public.planning_notifications (
      company_id, recipient_user_id, notification_type, severity, title, body,
      entity_kind, entity_id, person_id, due_on, fingerprint
    ) values (
      new.company_id, new.requested_by, 'absence',
      case new.status when 'approved' then 'information' else 'warning' end,
      decision_title, left(decision_body, 2000), 'absence_decision', new.id, new.person_id,
      (new.starts_at at time zone 'Europe/Paris')::date, 'absence:' || new.id || ':' || new.status
    ) on conflict (company_id, recipient_user_id, fingerprint) do update set
      title = excluded.title, body = excluded.body, severity = excluded.severity,
      entity_kind = excluded.entity_kind, entity_id = excluded.entity_id,
      person_id = excluded.person_id, due_on = excluded.due_on,
      read_at = null, created_at = now();
  end if;
  return new;
end;
$$;
