begin;
select no_plan();

-- These are independent Auth profiles, not a simulated role in an Admin session.
create temporary table monthly_read_profiles(user_id uuid, role_key text);
insert into monthly_read_profiles values
  ('78830000-0000-0000-0000-000000000001', 'capitaine'),
  ('78830000-0000-0000-0000-000000000002', 'marin'),
  ('78830000-0000-0000-0000-000000000003', 'marin'),
  ('78830000-0000-0000-0000-000000000004', 'admin'),
  ('78830000-0000-0000-0000-000000000005', 'direction'),
  ('78830000-0000-0000-0000-000000000006', 'armement');

insert into public.companies(code, name, active)
values ('monthly-read-a', 'Monthly Read A', true), ('monthly-read-b', 'Monthly Read B', true);
insert into auth.users(id, email)
select user_id, user_id || '@example.invalid' from monthly_read_profiles;
insert into public.profiles(id, email, display_name, active_company_id)
select fixture.user_id, fixture.user_id || '@example.invalid', fixture.role_key, company.id
from monthly_read_profiles fixture cross join public.companies company where company.code='monthly-read-a';
insert into public.company_memberships(user_id, company_id, active)
select user_id, company.id, true from monthly_read_profiles cross join public.companies company
where company.code='monthly-read-a' on conflict (user_id, company_id) do update set active=true;
insert into public.user_roles(user_id, company_id, role_key)
select user_id, company.id, role_key from monthly_read_profiles cross join public.companies company
where company.code='monthly-read-a';
insert into public.people(company_id, user_id, first_name, last_name, function_label, sailor_number, hired_on, active)
select company.id, fixture.user_id, fixture.role_key, 'MONTHLY READ',
  case when fixture.role_key='capitaine' then 'Capitaine' else 'Matelot' end,
  'MONTHLY-' || right(fixture.user_id::text, 1), '2026-09-01', true
from monthly_read_profiles fixture cross join public.companies company where company.code='monthly-read-a';
insert into public.people(company_id, first_name, last_name, function_label, sailor_number, hired_on, active)
select id, 'Other', 'COMPANY', 'Matelot', 'MONTHLY-OTHER', '2026-09-01', true
from public.companies where code='monthly-read-b';
insert into public.vessels(company_id, name, acronym, active)
select id, 'MONTHLY READ VESSEL', 'MRV', true from public.companies where code='monthly-read-a';

create temporary table monthly_read_registers as
select register.id, register.company_id, register.person_id, person.user_id, person.sailor_number
from public.working_time_registers register join public.people person on person.id=register.person_id
where person.sailor_number like 'MONTHLY-%' and register.period_start='2026-09-01';
grant select on monthly_read_registers, monthly_read_profiles to authenticated;

insert into public.planning_assignments(
  company_id, vessel_id, captain_person_id, crew_person_id, starts_on, ends_on, starts_at, ends_at,
  assignment_role, status_label, confirmation_status, watch_group, source_label
)
select person.company_id, vessel.id, captain.id, person.id, '2026-09-01', '2026-09-15',
  '2026-09-01 00:00:00+02', '2026-09-15 23:59:00+02', person.function_label, 'En Mer', 'confirmed',
  case when person.sailor_number='MONTHLY-3' then 'Bordée B' else 'Bordée A' end, 'monthly-read-fixture'
from public.people person join public.vessels vessel on vessel.company_id=person.company_id and vessel.acronym='MRV'
join public.people captain on captain.company_id=person.company_id and captain.sailor_number='MONTHLY-1'
where person.sailor_number in ('MONTHLY-1', 'MONTHLY-2', 'MONTHLY-3');

-- Seed raw evidence independently of mutation rules, which are covered by the
-- existing workflow suites. All trigger changes roll back with this fixture.
alter table public.working_time_intervals disable trigger working_time_intervals_05_register_lock;
alter table public.working_time_day_comments disable trigger working_time_day_comments_05_register_lock;
select set_config('seapilot.defer_working_time_recalculation', 'on', true);
insert into public.working_time_intervals(company_id, register_id, person_id, local_work_date,
  starts_at, ends_at, timezone_name, utc_offset_minutes, source_type)
select company_id, id, person_id, '2026-09-08', '2026-09-08 08:00:00+02',
  '2026-09-08 10:00:00+02', 'Europe/Paris', 120, 'migration' from monthly_read_registers;
insert into public.working_time_day_comments(company_id, register_id, person_id, local_work_date, comment)
select company_id, id, person_id, '2026-09-08', 'Fixture monthly comment' from monthly_read_registers;
insert into public.working_time_validations(company_id, register_id, person_id, event_type,
  previous_status, new_status, subject_identity_snapshot, actor_identity_snapshot)
select company_id, id, person_id, 'signature_requested', 'draft', 'awaiting_sailor_signature', '{}', '{}'
from monthly_read_registers;

-- More than one API page, and a late window outside the Captain assignment.
insert into public.working_time_calculation_windows(company_id, person_id, window_end, local_window_end_date,
  timezone_name, vessel_id, work_24h_seconds, rest_24h_seconds, longest_rest_24h_seconds,
  rest_period_count_24h, work_7d_seconds, rest_7d_seconds)
select register.company_id, register.person_id, evidence_window.ends_at, (evidence_window.ends_at at time zone 'Europe/Paris')::date,
  'Europe/Paris', vessel.id, 7200, 79200, 79200, 1, 7200, 597600
from monthly_read_registers register
left join public.vessels vessel on vessel.company_id=register.company_id and vessel.acronym='MRV'
cross join lateral (
  select '2026-09-08 00:00:00+02'::timestamptz + n * interval '1 minute' as ends_at from generate_series(1, 550) n
  union all select '2026-09-29 18:00:00+02'::timestamptz
) evidence_window;

-- Save the existing SECURITY DEFINER helpers' results as the access oracle.
-- Then exercise the optimized policies as authenticated for each real profile.
create temporary table monthly_read_expected(user_id uuid, table_name text, ids bigint[]);
do $$
declare actor record;
begin
  for actor in select * from monthly_read_profiles loop
    perform set_config('request.jwt.claim.sub', actor.user_id::text, true);
    insert into monthly_read_expected
    select actor.user_id, 'registers', coalesce(array_agg(register.id order by register.id), '{}'::bigint[])
    from public.working_time_registers register join monthly_read_registers fixture on fixture.id=register.id
    where public.working_time_can_read_register(register.id);
    insert into monthly_read_expected
    with contexts as materialized (
      select distinct calculation.company_id, calculation.person_id, calculation.local_window_end_date, calculation.vessel_id
      from public.working_time_calculation_windows calculation join monthly_read_registers fixture on fixture.person_id=calculation.person_id
    ), allowed_contexts as materialized (
      select * from contexts where public.working_time_can_read_calculation(company_id, person_id, local_window_end_date, vessel_id)
    )
    select actor.user_id, 'calculations', coalesce(array_agg(calculation.id order by calculation.id), '{}'::bigint[])
    from public.working_time_calculation_windows calculation join allowed_contexts scope
      on scope.company_id=calculation.company_id and scope.person_id=calculation.person_id
        and scope.local_window_end_date=calculation.local_window_end_date
        and scope.vessel_id is not distinct from calculation.vessel_id;
  end loop;
end;
$$;
grant select on monthly_read_expected to authenticated;

create function pg_temp.verify_monthly_read_profiles()
returns setof text language plpgsql security invoker as $$
declare actor record; actual_ids bigint[]; expected_ids bigint[]; started_at timestamptz;
begin
  for actor in select * from monthly_read_profiles loop
    perform set_config('request.jwt.claim.sub', actor.user_id::text, true);
    select ids into expected_ids from monthly_read_expected where user_id=actor.user_id and table_name='registers';
    select coalesce(array_agg(register.id order by register.id), '{}'::bigint[]) into actual_ids
    from public.working_time_registers register join monthly_read_registers fixture on fixture.id=register.id;
    return next extensions.is(actual_ids, expected_ids, actor.role_key || ' register RLS preserves existing rights');
    return next extensions.is((select count(*) from public.working_time_intervals evidence join monthly_read_registers fixture on fixture.id=evidence.register_id),
      cardinality(expected_ids)::bigint, actor.role_key || ' interval RLS follows authorized registers');
    return next extensions.is((select count(*) from public.working_time_day_comments evidence join monthly_read_registers fixture on fixture.id=evidence.register_id),
      cardinality(expected_ids)::bigint, actor.role_key || ' comment RLS follows authorized registers');
    return next extensions.is((select count(*) from public.working_time_validations evidence join monthly_read_registers fixture on fixture.id=evidence.register_id),
      cardinality(expected_ids)::bigint, actor.role_key || ' validation RLS follows authorized registers');
    started_at := clock_timestamp();
    select coalesce(array_agg(calculation.id order by calculation.id), '{}'::bigint[]) into actual_ids
    from public.working_time_calculation_windows calculation join monthly_read_registers fixture on fixture.person_id=calculation.person_id
    where local_window_end_date between '2026-09-01' and '2026-10-07';
    select ids into expected_ids from monthly_read_expected where user_id=actor.user_id and table_name='calculations';
    return next extensions.is(actual_ids, expected_ids, actor.role_key || ' calculation RLS preserves exact date and vessel rights');
    return next extensions.ok(clock_timestamp()-started_at < interval '8 seconds', actor.role_key || ' reads September below the authenticated timeout');
  end loop;
end;
$$;
set local role authenticated;
select * from pg_temp.verify_monthly_read_profiles();

select set_config('request.jwt.claim.sub', '78830000-0000-0000-0000-000000000001', true);
select is((select count(*) from public.working_time_registers register join monthly_read_registers fixture on fixture.id=register.id),
  2::bigint, 'real Captain reads self and same-watch Marin, excluding the other watch and company');
select is((select count(*) from public.working_time_calculation_windows calculation join monthly_read_registers fixture on fixture.person_id=calculation.person_id
  where fixture.sailor_number='MONTHLY-2' and calculation.local_window_end_date='2026-09-29'),
  0::bigint, 'Captain cannot read crew calculations outside the effective assignment window');
select set_config('request.jwt.claim.sub', '78830000-0000-0000-0000-000000000002', true);
select is((select count(*) from public.working_time_registers register join monthly_read_registers fixture on fixture.id=register.id),
  1::bigint, 'real Marin sees only their own September register');
select ok(not has_table_privilege('authenticated', 'public.working_time_calculation_windows', 'INSERT'),
  'calculation writes remain unavailable to the browser');
select ok(not has_table_privilege('authenticated', 'public.working_time_intervals', 'UPDATE'),
  'interval writes remain protected by workflow RPCs');
select ok(not has_function_privilege('anon', 'public.working_time_readable_calculation_ids()', 'EXECUTE'),
  'anonymous callers cannot enumerate authorized calculation IDs');
reset role;

update public.company_memberships set active=false where user_id='78830000-0000-0000-0000-000000000002';
set local role authenticated;
select is((select count(*) from public.working_time_registers register join monthly_read_registers fixture on fixture.id=register.id),
  0::bigint, 'revoked membership denies the own register');
select is((select count(*) from public.working_time_calculation_windows calculation join monthly_read_registers fixture on fixture.person_id=calculation.person_id),
  0::bigint, 'revoked membership denies the own calculations');

-- Exercise the optimized policy for a real Marin appointed temporary Captain,
-- including the daily function override rather than an Admin role simulation.
reset role;
delete from public.user_roles where user_id='78830000-0000-0000-0000-000000000001';
insert into public.user_roles(user_id,company_id,role_key)
select '78830000-0000-0000-0000-000000000001',company_id,'marin' from monthly_read_registers where sailor_number='MONTHLY-1';
update public.people set function_label='2nd Capitaine' where sailor_number='MONTHLY-1';
set local role authenticated;
select set_config('request.jwt.claim.sub','78830000-0000-0000-0000-000000000001',true);
select is((select count(*) from public.working_time_calculation_windows calculation join monthly_read_registers fixture on fixture.person_id=calculation.person_id
  where fixture.sailor_number='MONTHLY-2'),550::bigint,
  'a real Marin with a confirmed temporary Captain duty reads same-watch crew calculations');
reset role;
update public.planning_assignments set assignment_role='2nd Capitaine'
where crew_person_id=(select person_id from monthly_read_registers where sailor_number='MONTHLY-1');
set local role authenticated;
select is((select count(*) from public.working_time_calculation_windows calculation join monthly_read_registers fixture on fixture.person_id=calculation.person_id
  where fixture.sailor_number='MONTHLY-2'),0::bigint,
  'removing the temporary Captain duty immediately removes crew calculation access');
reset role;
insert into public.planning_days(company_id,person_id,vessel_id,work_date,function_label,sailor_status,slot365,source_label)
select assignment.company_id,assignment.crew_person_id,assignment.vessel_id,'2026-09-08','Capitaine','En Mer',
  'assignment:' || assignment.id,'seapilot-assignment-note'
from public.planning_assignments assignment
where assignment.crew_person_id=(select person_id from monthly_read_registers where sailor_number='MONTHLY-1');
set local role authenticated;
select is((select count(*) from public.working_time_calculation_windows calculation join monthly_read_registers fixture on fixture.person_id=calculation.person_id
  where fixture.sailor_number='MONTHLY-2'),550::bigint,
  'a daily temporary Captain override grants the matching rolling contexts');
select is((select count(*) from public.working_time_calculation_windows calculation join monthly_read_registers fixture on fixture.person_id=calculation.person_id
  where fixture.sailor_number='MONTHLY-2' and local_window_end_date='2026-09-29'),0::bigint,
  'a daily Captain override does not grant distant rolling contexts');
reset role;
update public.planning_days set function_label='2nd Capitaine'
where person_id=(select person_id from monthly_read_registers where sailor_number='MONTHLY-1') and source_label='seapilot-assignment-note';
set local role authenticated;
select is((select count(*) from public.working_time_calculation_windows calculation join monthly_read_registers fixture on fixture.person_id=calculation.person_id
  where fixture.sailor_number='MONTHLY-2'),0::bigint,
  'a non-Captain daily override revokes the previous temporary scope');
select * from finish();
rollback;
