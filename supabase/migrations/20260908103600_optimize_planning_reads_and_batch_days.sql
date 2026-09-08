-- One RLS-protected response replaces sequential OFFSET pages. The revision
-- includes the complete visible data, authenticated identity and company, so
-- changes, deletions and permission changes all invalidate the browser cache.
create or replace function public.read_planning_periods(p_known_revision text default null)
returns jsonb
language plpgsql stable security invoker
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_company_id bigint := public.current_planning_company_id();
  visible_periods jsonb;
  revision text;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'PLANNING_PERMISSION_DENIED';
  end if;
  select coalesce(jsonb_agg(to_jsonb(period) order by period.starts_on, period.crew_name, period.id), '[]'::jsonb)
  into visible_periods
  from (
    select p.id, p.person_id, p.vessel_id, p.crew_name, p.vessel_name, p.manual_vessel_name,
      p.watch_group, p.function_label, p.sailor_status, p.starts_on, p.ends_on, p.year_number,
      p.comments, p.slot365_source_id, p.slot365_source_key, p.source_label
    from public.planning_periods p
    where p.company_id = target_company_id
  ) period;
  revision := encode(sha256(convert_to(jsonb_build_array(actor_id, target_company_id, visible_periods)::text, 'UTF8')), 'hex');
  return jsonb_build_object('revision', revision,
    'periods', case when revision = p_known_revision then null else visible_periods end);
end;
$$;
revoke all on function public.read_planning_periods(text) from public, anon;
grant execute on function public.read_planning_periods(text) to authenticated;

-- Reuse the original daily RPC, its RLS, guards and audit triggers for each day
-- within one transaction. No assignment is split or recreated by this wrapper.
create or replace function public.save_planning_assignment_day_states(
  p_assignment_id bigint, p_starts_on date, p_ends_on date, p_status text, p_note text
)
returns integer
language plpgsql security invoker
set search_path = ''
as $$
declare
  work_date date := p_starts_on;
  saved_days integer := 0;
begin
  if p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on then
    raise exception using errcode = '22023', message = 'PLANNING_ASSIGNMENT_DAY_STATE_INVALID';
  end if;
  perform 1 from public.planning_assignments a
  where a.id = p_assignment_id and a.company_id = (select public.current_planning_company_id())
    and a.confirmation_status <> 'cancelled'
    and a.starts_on <= p_starts_on and a.ends_on >= p_ends_on
  for update;
  if not found then
    raise exception using errcode = '23503', message = 'PLANNING_ASSIGNMENT_DAY_STATE_ASSIGNMENT_NOT_FOUND';
  end if;
  while work_date <= p_ends_on loop
    perform public.save_planning_assignment_day_state(p_assignment_id, work_date, p_status, p_note);
    saved_days := saved_days + 1;
    work_date := work_date + 1;
  end loop;
  return saved_days;
end;
$$;
revoke all on function public.save_planning_assignment_day_states(bigint,date,date,text,text) from public, anon;
grant execute on function public.save_planning_assignment_day_states(bigint,date,date,text,text) to authenticated;

-- Only row-invariant identity/role checks become initPlans. Correlated captain
-- crew/watch checks remain evaluated against each row, with the same predicates.
alter policy people_planning_company_read on public.people using (
  company_id = (select public.current_planning_company_id()) and (
    user_id = (select auth.uid())
    or (select public.has_any_role(array['admin','direction','armement']))
    or ((select public.has_role('capitaine')) and public.captain_shares_watch_with_person(company_id, id))
  )
);
alter policy hr_documents_company_read on public.hr_documents using (
  company_id = (select public.current_planning_company_id()) and (
    person_id = (select public.current_person_id())
    or (select public.has_any_role(array['admin','direction','armement']))
    or ((select public.has_role('capitaine')) and public.captain_shares_watch_with_person(company_id, person_id))
  )
);
alter policy hr_documents_company_office_write on public.hr_documents using (
  company_id = (select public.current_planning_company_id()) and (
    (select public.has_any_role(array['admin','direction']))
    or ((select public.has_any_role(array['armement'])) and category_key <> 'annual_review')
  )
);

-- Same key/order as planning_change_log_company_date_idx. Preserve that index
-- and the separate chronological index introduced in v3.39.1.
drop index if exists public.planning_change_log_company_changed_at_read_idx;
