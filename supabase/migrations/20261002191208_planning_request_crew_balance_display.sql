-- Enrollment controls rights management; only the two identified office staff
-- use leave/RTT cards in requests. The choice is persisted by person ID.
alter table public.planning_leave_counter_people
  add column request_balance_kind text not null default 'crew'
  constraint planning_leave_counter_people_request_balance_kind_check
  check (request_balance_kind in ('crew','leave_rtt'));

do $bootstrap$
declare matched_count integer; distinct_names integer;
begin
  select count(*),count(distinct public.planning_balance_normalized_name(concat_ws(' ',p.first_name,p.last_name)))
  into matched_count,distinct_names
  from public.planning_leave_counter_people eligible
  join public.people p on p.id=eligible.person_id and p.company_id=eligible.company_id
  join public.companies c on c.id=p.company_id
  where c.code='bbtm' and public.planning_balance_normalized_name(concat_ws(' ',p.first_name,p.last_name))
    in ('CHRISTOPHEMINASSIAN','SOPHIEHAMEL');
  if matched_count<>2 or distinct_names<>2 then
    raise exception 'PLANNING_REQUEST_BALANCE_BOOTSTRAP: Christophe and Sophie must each match one enrolled BBTM person.';
  end if;
  update public.planning_leave_counter_people eligible set request_balance_kind='leave_rtt'
  from public.people p,public.companies c
  where p.id=eligible.person_id and p.company_id=eligible.company_id and c.id=p.company_id and c.code='bbtm'
    and public.planning_balance_normalized_name(concat_ws(' ',p.first_name,p.last_name))
      in ('CHRISTOPHEMINASSIAN','SOPHIEHAMEL');
end $bootstrap$;

-- Existing INSERT grants name only company_id/person_id; never grant client
-- INSERT/UPDATE of this server-owned display choice. Annual enrollment defaults to crew.
comment on column public.planning_leave_counter_people.request_balance_kind is
  'Persisted request display, independent of editable annual rights: leave_rtt for bootstrapped Christophe/Sophie IDs; crew for every other collaborator. No client write grant.';

create or replace function public.get_planning_absence_balance_context(p_person_id bigint)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare target public.people; is_counter_person boolean; request_kind text; management_kind text;
  person_json jsonb; absences_json jsonb; counters_json jsonb;
  checkpoints_json jsonb; assignments_json jsonb; periods_json jsonb; days_json jsonb;
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
  select p.request_balance_kind into request_kind from public.planning_leave_counter_people p
  where p.company_id=target.company_id and p.person_id=target.id;
  request_kind:=coalesce(request_kind,'crew');
  management_kind:=case when is_counter_person then 'leave_rtt' else 'crew' end;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'counter_type',p.counter_type,'starts_on',p.starts_on,
    'ends_on',p.ends_on,'entitlement',p.entitlement,'updated_at',p.updated_at) order by p.counter_type,p.starts_on,p.id),'[]'::jsonb)
  into counters_json from public.planning_leave_counter_periods p where p.company_id=target.company_id and p.person_id=target.id;
  if request_kind='leave_rtt' then
    return jsonb_build_object('kind',management_kind,'request_balance_kind',request_kind,'person',person_json,
      'counter_periods',counters_json,'absences',absences_json,'crew_checkpoints','[]'::jsonb,
      'crew_sources',jsonb_build_object('assignments','[]'::jsonb,'periods','[]'::jsonb,'days','[]'::jsonb));
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('person_id',p.person_id,'as_of',p.as_of,'balance',p.balance) order by p.as_of,p.id),'[]'::jsonb)
  into checkpoints_json from public.planning_crew_balance_checkpoints p where p.company_id=target.company_id and p.person_id=target.id;
  select max(p.as_of) into source_floor from public.planning_crew_balance_checkpoints p
  where p.company_id=target.company_id and p.person_id=target.id and p.as_of<=today_date;
  if source_floor is null then
    return jsonb_build_object('kind',management_kind,'request_balance_kind',request_kind,'person',person_json,
      'counter_periods',counters_json,'absences',absences_json,'crew_checkpoints',checkpoints_json,
      'crew_sources',jsonb_build_object('assignments','[]'::jsonb,'periods','[]'::jsonb,'days','[]'::jsonb));
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
  return jsonb_build_object('kind',management_kind,'request_balance_kind',request_kind,'person',person_json,
    'counter_periods',counters_json,'absences',absences_json,'crew_checkpoints',checkpoints_json,
    'crew_sources',jsonb_build_object('assignments',assignments_json,'periods',periods_json,'days',days_json));
end $$;
revoke all on function public.get_planning_absence_balance_context(bigint) from public,anon;
grant execute on function public.get_planning_absence_balance_context(bigint) to authenticated;
comment on function public.get_planning_absence_balance_context(bigint) is
  'Selected-person projection for real office managers or self in the active company/module: kind is rights enrollment; request_balance_kind selects display. Crew sources also returned for enrolled crew-display people, with no private comments or HR fields.';

-- Crew uses the existing Planning/Équipages ledger, even if old rights exist.
-- Reads preserve that history; direct writes cannot bypass the RPC restriction.
alter policy leave_counter_periods_insert on public.planning_leave_counter_periods
with check(company_id=(select public.current_planning_company_id())
  and public.planning_absence_balance_has_access(person_id,true)
  and exists(select 1 from public.planning_leave_counter_people eligible
    where eligible.company_id=planning_leave_counter_periods.company_id
      and eligible.person_id=planning_leave_counter_periods.person_id and eligible.request_balance_kind='leave_rtt'));
alter policy leave_counter_periods_update on public.planning_leave_counter_periods
using(public.planning_absence_balance_has_access(person_id,true)
  and exists(select 1 from public.planning_leave_counter_people eligible
    where eligible.company_id=planning_leave_counter_periods.company_id
      and eligible.person_id=planning_leave_counter_periods.person_id and eligible.request_balance_kind='leave_rtt'))
with check(company_id=(select public.current_planning_company_id())
  and public.planning_absence_balance_has_access(person_id,true)
  and exists(select 1 from public.planning_leave_counter_people eligible
    where eligible.company_id=planning_leave_counter_periods.company_id
      and eligible.person_id=planning_leave_counter_periods.person_id and eligible.request_balance_kind='leave_rtt'));

create or replace function public.save_planning_leave_counter_period(
  p_person_id bigint,p_counter_type text,p_starts_on date,p_ends_on date,p_entitlement numeric
)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare target_company bigint; target_id bigint;
begin
  if not public.planning_absence_balance_has_access(p_person_id,true)
    or not exists(select 1 from public.planning_leave_counter_people eligible
      where eligible.person_id=p_person_id and eligible.company_id=public.current_planning_company_id()
        and eligible.request_balance_kind='leave_rtt') then
    raise exception 'PLANNING_PERMISSION_DENIED: droits congés et RTT réservés aux compteurs dédiés.' using errcode='42501';
  end if;
  if p_counter_type is null or p_counter_type not in ('leave','rtt') or p_starts_on is null or p_ends_on is null
    or not isfinite(p_starts_on) or not isfinite(p_ends_on) or p_ends_on<p_starts_on
    or p_starts_on not between '1900-01-01'::date and '2100-12-31'::date
    or p_ends_on not between '1900-01-01'::date and '2100-12-31'::date or p_ends_on-p_starts_on>=3660
    or p_entitlement is null or p_entitlement<0 or p_entitlement>=100000 or p_entitlement<>round(p_entitlement,2) then
    raise exception 'PLANNING_LEAVE_COUNTER_PERIOD_INVALID' using errcode='22023';
  end if;
  target_company:=public.current_planning_company_id();
  perform pg_advisory_xact_lock(hashtextextended(target_company::text||':leave-counter:'||p_person_id::text||':'||p_counter_type,0));
  insert into public.planning_leave_counter_periods(company_id,person_id,counter_type,starts_on,ends_on,entitlement)
  values(target_company,p_person_id,p_counter_type,p_starts_on,p_ends_on,p_entitlement)
  on conflict(company_id,person_id,counter_type,starts_on,ends_on) do update set entitlement=excluded.entitlement
  returning id into target_id;
  return target_id;
end $$;
revoke all on function public.save_planning_leave_counter_period(bigint,text,date,date,numeric) from public,anon;
grant execute on function public.save_planning_leave_counter_period(bigint,text,date,date,numeric) to authenticated;

create or replace function public.save_planning_leave_rights_period(
  p_person_id bigint,p_starts_on date,p_ends_on date,p_leave_entitlement numeric,p_rtt_entitlement numeric
)
returns void language plpgsql security invoker set search_path = '' as $$
declare target_company bigint;
begin
  if not public.planning_absence_balance_has_access(p_person_id,true)
    or not exists(select 1 from public.planning_leave_counter_people eligible
      where eligible.person_id=p_person_id and eligible.company_id=public.current_planning_company_id()
        and eligible.request_balance_kind='leave_rtt') then
    raise exception 'PLANNING_PERMISSION_DENIED: droits congés et RTT réservés aux compteurs dédiés.' using errcode='42501';
  end if;
  if p_starts_on is null or p_ends_on is null or not isfinite(p_starts_on) or not isfinite(p_ends_on)
    or p_starts_on not between '1900-06-01'::date and '2099-06-01'::date
    or extract(month from p_starts_on)<>6 or extract(day from p_starts_on)<>1
    or p_ends_on<>(p_starts_on+interval '1 year'-interval '1 day')::date
    or p_leave_entitlement is null or p_leave_entitlement<0 or p_leave_entitlement>=100000
    or p_leave_entitlement<>round(p_leave_entitlement,2)
    or p_rtt_entitlement is null or p_rtt_entitlement<0 or p_rtt_entitlement>=100000
    or p_rtt_entitlement<>round(p_rtt_entitlement,2) then
    raise exception 'PLANNING_LEAVE_RIGHTS_PERIOD_INVALID' using errcode='22023';
  end if;
  target_company:=public.current_planning_company_id();
  perform pg_advisory_xact_lock(hashtextextended(target_company::text||':leave-counter:'||p_person_id::text||':leave',0));
  perform pg_advisory_xact_lock(hashtextextended(target_company::text||':leave-counter:'||p_person_id::text||':rtt',0));
  perform public.save_planning_leave_counter_period(p_person_id,'leave',p_starts_on,p_ends_on,p_leave_entitlement);
  perform public.save_planning_leave_counter_period(p_person_id,'rtt',p_starts_on,p_ends_on,p_rtt_entitlement);
end $$;
revoke all on function public.save_planning_leave_rights_period(bigint,date,date,numeric,numeric) from public,anon;
grant execute on function public.save_planning_leave_rights_period(bigint,date,date,numeric,numeric) to authenticated;
comment on function public.save_planning_leave_rights_period(bigint,date,date,numeric,numeric) is
  'Atomic June 1–May 31 Congés/RTT totals for persisted dedicated counters only; managers in active company/module; crew annual rights denied and legacy rows preserved.';
notify pgrst,'reload schema';
