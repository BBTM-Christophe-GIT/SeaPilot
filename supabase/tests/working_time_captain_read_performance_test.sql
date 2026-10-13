begin;

select plan(53);

-- Every access assertion runs under the actual authenticated PostgreSQL role.
-- Fixture identifiers live in a temporary table so denied people/register RLS
-- cannot turn an assertion into a comparison against a missing identifier.
create temporary table wt_read_accounts (
  fixture_key text primary key,
  user_id uuid not null,
  role_key text not null,
  function_label text,
  active boolean not null default true,
  company_code text not null default 'bbtm',
  person_id bigint,
  company_id bigint
);
insert into wt_read_accounts (fixture_key, user_id, role_key, function_label, active, company_code)
values
  ('chief', '7e130000-0000-0000-0000-000000000001', 'capitaine', 'Chef Mécanicien', true, 'bbtm'),
  ('hr', '7e130000-0000-0000-0000-000000000002', 'capitaine', 'Capitaine', true, 'bbtm'),
  ('daily', '7e130000-0000-0000-0000-000000000003', 'marin', '2nd Capitaine', true, 'bbtm'),
  ('raw', '7e130000-0000-0000-0000-000000000004', 'marin', '2nd Capitaine', true, 'bbtm'),
  ('crew', '7e130000-0000-0000-0000-000000000005', 'marin', 'Matelot', true, 'bbtm'),
  ('outside', '7e130000-0000-0000-0000-000000000006', 'marin', 'Matelot', true, 'bbtm'),
  ('historical', '7e130000-0000-0000-0000-000000000007', 'marin', '2nd Capitaine', true, 'bbtm'),
  ('historical_crew', '7e130000-0000-0000-0000-000000000008', 'marin', 'Matelot', true, 'bbtm'),
  ('unconfirmed', '7e130000-0000-0000-0000-000000000009', 'capitaine', '2nd Capitaine', true, 'bbtm'),
  ('inactive', '7e130000-0000-0000-0000-000000000010', 'capitaine', 'Capitaine', false, 'bbtm'),
  ('unlinked', '7e130000-0000-0000-0000-000000000011', 'capitaine', null, true, 'bbtm'),
  ('foreign', '7e130000-0000-0000-0000-000000000012', 'marin', 'Matelot', true, 'wt-read-foreign');

insert into public.companies (code, name) values ('wt-read-foreign', 'Working Time read foreign fixture');
update wt_read_accounts fixture set company_id = company.id
from public.companies company where company.code = fixture.company_code;
insert into auth.users (id, email)
select user_id, 'wt-read-' || fixture_key || '@example.invalid' from wt_read_accounts;
insert into public.profiles (id, email, display_name, active_company_id)
select user_id, 'wt-read-' || fixture_key || '@example.invalid', 'Working Time read ' || fixture_key, company_id
from wt_read_accounts;
insert into public.user_roles (user_id, company_id, role_key)
select user_id, company_id, role_key from wt_read_accounts;
insert into public.people (company_id, user_id, first_name, last_name, function_label, sailor_number, hired_on, active)
select company_id, user_id, 'Read', fixture_key, function_label, 'WT-READ-' || fixture_key, current_date - 500, active
from wt_read_accounts where fixture_key <> 'unlinked';
update wt_read_accounts fixture set person_id = person.id
from public.people person where person.user_id = fixture.user_id;

insert into public.vessels (company_id, name, acronym, active)
select id, 'Working Time read ' || code, case when code = 'bbtm' then 'WTR' else 'WTRF' end, true
from public.companies where code in ('bbtm', 'wt-read-foreign');

create temporary table wt_read_rows (
  fixture_key text primary key,
  company_id bigint not null,
  person_id bigint not null,
  vessel_id bigint not null,
  starts_on date not null,
  work_date date not null,
  assignment_id bigint,
  register_id bigint,
  comment_id bigint,
  interval_id bigint,
  calculation_id bigint
);
insert into wt_read_rows (fixture_key, company_id, person_id, vessel_id, starts_on, work_date)
select account.fixture_key, account.company_id, account.person_id, vessel.id,
  current_date - case when account.fixture_key in ('historical', 'historical_crew') then 400 else 14 end,
  current_date - case when account.fixture_key in ('historical', 'historical_crew') then 398 else 12 end
from wt_read_accounts account
join public.vessels vessel on vessel.company_id = account.company_id
  and vessel.acronym = case when account.company_code = 'bbtm' then 'WTR' else 'WTRF' end
where account.person_id is not null;

insert into public.planning_assignments (
  company_id, vessel_id, crew_person_id, starts_on, ends_on, starts_at, ends_at,
  assignment_role, status_label, confirmation_status, watch_group, source_label
)
select fixture.company_id, fixture.vessel_id, fixture.person_id, fixture.starts_on, fixture.starts_on + 6,
  fixture.starts_on::timestamp at time zone 'Europe/Paris',
  (fixture.starts_on + 6 + time '23:59:59') at time zone 'Europe/Paris',
  case when fixture.fixture_key in ('raw', 'historical', 'unconfirmed') then 'Capitaine'
    when fixture.fixture_key = 'hr' then '2nd Capitaine' else account.function_label end,
  'En Mer', case when fixture.fixture_key = 'unconfirmed' then 'provisional' else 'confirmed' end,
  case when fixture.fixture_key = 'outside' then 'Other watch' else 'Read watch' end,
  'working_time_read_performance_test'
from wt_read_rows fixture join wt_read_accounts account using (fixture_key);
update wt_read_rows fixture set assignment_id = assignment.id
from public.planning_assignments assignment
where assignment.crew_person_id = fixture.person_id and assignment.source_label = 'working_time_read_performance_test';

insert into public.planning_days (company_id, person_id, vessel_id, work_date, function_label, sailor_status, slot365, source_label)
select company_id, person_id, vessel_id, work_date, ' Capitaine ', 'En Mer',
  'assignment:' || assignment_id::text, 'seapilot-assignment-note'
from wt_read_rows where fixture_key = 'daily';

insert into public.working_time_registers (company_id, person_id, period_kind, period_start, period_end, status)
select company_id, person_id, 'weekly', starts_on, starts_on + 6, 'draft' from wt_read_rows;
insert into public.working_time_registers (company_id, person_id, period_kind, period_start, period_end, status)
select company_id, person_id, 'weekly', work_date + 1, work_date + 7, 'draft'
from wt_read_rows where fixture_key = 'crew';
create temporary table wt_read_following_register as
select register.id from public.working_time_registers register
join wt_read_rows fixture on fixture.fixture_key = 'crew' and fixture.person_id = register.person_id
where register.period_kind = 'weekly' and register.period_start = fixture.work_date + 1;
update wt_read_rows fixture set register_id = register.id
from public.working_time_registers register
where register.person_id = fixture.person_id and register.period_kind = 'weekly' and register.period_start = fixture.starts_on;
-- Seed historical read fixtures without pretending to authorize edits to old
-- days. Only the two edit-lock triggers are paused; foreign keys, company
-- consistency, audit and recalculation triggers keep running. Restore the locks
-- before switching to authenticated actors and checking any access.
alter table public.working_time_day_comments disable trigger working_time_day_comments_05_register_lock;
alter table public.working_time_intervals disable trigger working_time_intervals_05_register_lock;
insert into public.working_time_day_comments (company_id, person_id, register_id, local_work_date, comment)
select company_id, person_id, register_id, work_date, 'Working Time read fixture' from wt_read_rows;
update wt_read_rows fixture set comment_id = day_comment.id
from public.working_time_day_comments day_comment where day_comment.register_id = fixture.register_id;

insert into public.working_time_intervals (
  company_id, person_id, register_id, local_work_date, starts_at, ends_at,
  timezone_name, utc_offset_minutes, vessel_id, watch_group, source_type
)
select fixture.company_id, fixture.person_id, fixture.register_id, fixture.work_date,
  bounds.starts_at, bounds.starts_at + interval '1 hour', 'Europe/Paris',
  (extract(epoch from ((bounds.starts_at at time zone 'Europe/Paris') - (bounds.starts_at at time zone 'UTC'))) / 60)::smallint,
  fixture.vessel_id, case when fixture.fixture_key = 'outside' then 'Other watch' else 'Read watch' end, 'migration'
from wt_read_rows fixture
cross join lateral (select (fixture.work_date + time '08:00') at time zone 'Europe/Paris' as starts_at) bounds;
update wt_read_rows fixture set interval_id = work_interval.id
from public.working_time_intervals work_interval where work_interval.register_id = fixture.register_id;

-- Distinct timestamps identify the test windows even when interval triggers
-- also generated rolling calculations. All policy-dependent flags remain null.
insert into public.working_time_calculation_windows (
  company_id, person_id, window_end, local_window_end_date, timezone_name, vessel_id,
  work_24h_seconds, rest_24h_seconds, longest_rest_24h_seconds, rest_period_count_24h,
  work_7d_seconds, rest_7d_seconds
)
select company_id, person_id, (work_date + time '13:27') at time zone 'Europe/Paris', work_date, 'Europe/Paris', vessel_id,
  0, 86400, 86400, 1, 0, 604800 from wt_read_rows;
update wt_read_rows fixture set calculation_id = calculation.id
from public.working_time_calculation_windows calculation
where calculation.person_id = fixture.person_id
  and calculation.window_end = (fixture.work_date + time '13:27') at time zone 'Europe/Paris';

alter table public.working_time_day_comments enable trigger working_time_day_comments_05_register_lock;
alter table public.working_time_intervals enable trigger working_time_intervals_05_register_lock;
grant select on wt_read_accounts, wt_read_rows, wt_read_following_register to authenticated;

select has_function('private', 'working_time_actor_has_captain_duties', array[]::text[],
  'Captain reads have a caller-scoped eligibility guard');
select has_function('public', 'working_time_readable_calculation_ids', array[]::text[],
  'rolling calculation reads expose a caller-scoped authorization set');
select ok(not has_function_privilege('anon', 'private.working_time_actor_has_captain_duties()', 'EXECUTE'),
  'anonymous clients cannot invoke the Captain eligibility guard');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '7e130000-0000-0000-0000-000000000001', true);
select is(private.working_time_actor_has_captain_duties(), false,
  'a real Capitaine account with only Chef Mécanicien duties skips Captain expansion');
select is((select count(*)::integer from public.working_time_registers where id = (select register_id from wt_read_rows where fixture_key = 'chief')), 1,
  'the Chef Mécanicien still reads their own register');
select is((select count(*)::integer from public.working_time_registers where id = (select register_id from wt_read_rows where fixture_key = 'crew')), 0,
  'the application Capitaine role alone does not expose crew registers');
select is((select count(*)::integer from public.working_time_day_comments where id = (select comment_id from wt_read_rows where fixture_key = 'chief')), 1,
  'the guard preserves personal comments');
select is((select count(*)::integer from public.working_time_day_comments where id = (select comment_id from wt_read_rows where fixture_key = 'crew')), 0,
  'crew comments remain hidden from the Chef Mécanicien');
select is((select count(*)::integer from public.working_time_intervals where id = (select interval_id from wt_read_rows where fixture_key = 'chief')), 1,
  'the guard preserves personal work intervals');
select is((select count(*)::integer from public.working_time_intervals where id = (select interval_id from wt_read_rows where fixture_key = 'crew')), 0,
  'crew intervals remain hidden from the Chef Mécanicien');
select is((select count(*)::integer from public.working_time_calculation_windows where id = (select calculation_id from wt_read_rows where fixture_key = 'chief')), 1,
  'early exit preserves personal rolling calculations');
select is((select count(*)::integer from public.working_time_calculation_windows where id = (select calculation_id from wt_read_rows where fixture_key = 'crew')), 0,
  'early exit does not expose crew rolling calculations');
select is((select count(*)::integer from public.working_time_readable_calculation_ids() readable(id)
  join public.working_time_calculation_windows calculation on calculation.id = readable.id
  where calculation.person_id <> (select person_id from wt_read_accounts where fixture_key = 'chief')), 0,
  'the calculation authorization set contains only the Chef Mécanicien own scope');

select set_config('request.jwt.claim.sub', '7e130000-0000-0000-0000-000000000002', true);
select is(private.working_time_actor_has_captain_duties(), true,
  'an exact HR Capitaine remains eligible with a different Planning duty label');
select is((select count(*)::integer from public.working_time_registers where id = (select register_id from wt_read_rows where fixture_key = 'crew')), 1,
  'the HR Capitaine reads the register from the same vessel and watch');
select is((select count(*)::integer from public.working_time_registers where id = (select register_id from wt_read_rows where fixture_key = 'outside')), 0,
  'the cheap guard does not bypass the watch restriction');
select is((select count(*)::integer from public.working_time_registers where id = (select register_id from wt_read_rows where fixture_key = 'foreign')), 0,
  'the cheap guard does not bypass the company restriction');
select is((select count(*)::integer from public.working_time_day_comments where id = (select comment_id from wt_read_rows where fixture_key = 'crew')), 1,
  'same-watch comments inherit the allowed register scope');
select is((select count(*)::integer from public.working_time_intervals where id = (select interval_id from wt_read_rows where fixture_key = 'crew')), 1,
  'same-watch work intervals inherit the allowed register scope');
select is((select count(*)::integer from public.working_time_calculation_windows where id = (select calculation_id from wt_read_rows where fixture_key = 'crew')), 1,
  'same-watch rolling calculations retain Captain access');
select is((select count(*)::integer from public.working_time_calculation_windows where id = (select calculation_id from wt_read_rows where fixture_key = 'foreign')), 0,
  'the calculation authorization set excludes foreign-company rows');

select set_config('request.jwt.claim.sub', '7e130000-0000-0000-0000-000000000004', true);
select is(private.working_time_actor_has_captain_duties(), true,
  'a Marin with a confirmed raw Capitaine assignment is eligible');
select is((select count(*)::integer from public.working_time_registers where id = (select register_id from wt_read_rows where fixture_key = 'crew')), 1,
  'temporary raw Capitaine duties grant same-watch register access');
select is((select count(*)::integer from public.working_time_calculation_windows where id = (select calculation_id from wt_read_rows where fixture_key = 'crew')), 1,
  'temporary raw Capitaine duties grant same-watch calculation access');

reset role;
update public.planning_assignments set status_label = 'Repos'
where id = (select assignment_id from wt_read_rows where fixture_key = 'raw');
set local role authenticated;
select is(private.working_time_actor_has_captain_duties(), true,
  'the eligibility guard remains a necessary superset when the Captain is resting');
select is((select count(*)::integer from public.working_time_registers where id = (select register_id from wt_read_rows where fixture_key = 'crew')), 0,
  'the full Captain rule still denies crew registers on resting assignments');
select is((select count(*)::integer from public.working_time_calculation_windows where id = (select calculation_id from wt_read_rows where fixture_key = 'crew')), 0,
  'the full Captain rule still denies crew calculations on resting assignments');

select set_config('request.jwt.claim.sub', '7e130000-0000-0000-0000-000000000003', true);
select is(private.working_time_actor_has_captain_duties(), true,
  'a Marin with a trimmed daily Capitaine override is eligible');
select is((select count(*)::integer from public.working_time_registers where id = (select register_id from wt_read_rows where fixture_key = 'crew')), 1,
  'the daily replacement reads a crew register containing the replacement day');
select is((select count(*)::integer from public.working_time_calculation_windows where id = (select calculation_id from wt_read_rows where fixture_key = 'crew')), 1,
  'the daily replacement reads the rolling window covering their duty day');
select is((select count(*)::integer from public.working_time_registers where id = (select id from wt_read_following_register)), 0,
  'daily eligibility does not expose a register entirely after the replacement day');

reset role;
update public.planning_days set source_label = 'other-source'
where slot365 = 'assignment:' || (select assignment_id::text from wt_read_rows where fixture_key = 'daily');
set local role authenticated;
select is(private.working_time_actor_has_captain_duties(), false, 'an unrelated note source grants no Captain eligibility');
select is((select count(*)::integer from public.working_time_registers where id = (select register_id from wt_read_rows where fixture_key = 'crew')), 0,
  'an unrelated note source grants no crew register access');
reset role;
update public.planning_days set source_label = 'seapilot-assignment-note', slot365 = 'unrelated-slot'
where source_label = 'other-source' and person_id = (select person_id from wt_read_rows where fixture_key = 'daily');
set local role authenticated;
select is(private.working_time_actor_has_captain_duties(), false, 'an unrelated note slot grants no Captain eligibility');
select is((select count(*)::integer from public.working_time_registers where id = (select register_id from wt_read_rows where fixture_key = 'crew')), 0,
  'an unrelated note slot grants no crew register access');
reset role;
update public.planning_days set slot365 = 'assignment:' || (select assignment_id::text from wt_read_rows where fixture_key = 'daily'),
  work_date = (select starts_on + 7 from wt_read_rows where fixture_key = 'daily')
where slot365 = 'unrelated-slot' and person_id = (select person_id from wt_read_rows where fixture_key = 'daily');
set local role authenticated;
select is(private.working_time_actor_has_captain_duties(), false, 'a note beyond its assignment dates grants no Captain eligibility');
select is((select count(*)::integer from public.working_time_registers where id = (select register_id from wt_read_rows where fixture_key = 'crew')), 0,
  'a note beyond its assignment dates grants no crew register access');

select set_config('request.jwt.claim.sub', '7e130000-0000-0000-0000-000000000009', true);
select is(private.working_time_actor_has_captain_duties(), false, 'a provisional Capitaine assignment is not eligible');
select is((select count(*)::integer from public.working_time_registers where id = (select register_id from wt_read_rows where fixture_key = 'crew')), 0,
  'a provisional Capitaine assignment grants no crew access');

select set_config('request.jwt.claim.sub', '7e130000-0000-0000-0000-000000000007', true);
select is(private.working_time_actor_has_captain_duties(), true, 'historical confirmed Captain duties remain eligible');
select is((select count(*)::integer from public.working_time_registers where id = (select register_id from wt_read_rows where fixture_key = 'historical_crew')), 1,
  'historical Captain access to the corresponding crew register is preserved');
select is((select count(*)::integer from public.working_time_calculation_windows where id = (select calculation_id from wt_read_rows where fixture_key = 'historical_crew')), 1,
  'historical Captain access to the corresponding rolling calculation is preserved');
select is((select count(*)::integer from public.working_time_registers where id = (select register_id from wt_read_rows where fixture_key = 'crew')), 0,
  'historical duties do not grant access outside their assignment period');

select set_config('request.jwt.claim.sub', '7e130000-0000-0000-0000-000000000010', true);
select is(private.working_time_actor_has_captain_duties(), false, 'an inactive HR Capitaine is not eligible');
select is((select count(*)::integer from public.working_time_registers where id = (select register_id from wt_read_rows where fixture_key = 'crew')), 0,
  'an inactive HR Capitaine receives no crew register access');

select set_config('request.jwt.claim.sub', '7e130000-0000-0000-0000-000000000011', true);
select is(private.working_time_actor_has_captain_duties(), false, 'an unlinked Capitaine account is not eligible');
select is((select count(*)::integer from public.working_time_registers where id in (select register_id from wt_read_rows)), 0,
  'an unlinked Capitaine account cannot read any fixture register');
select is((select count(*)::integer from public.working_time_readable_calculation_ids()), 0,
  'an unlinked Capitaine account receives no calculation identifiers');

select set_config('request.jwt.claim.sub', '', true);
select is(private.working_time_actor_has_captain_duties(), false, 'missing authentication cannot produce Captain eligibility');
select is((select count(*)::integer from public.working_time_registers where id in (select register_id from wt_read_rows)), 0,
  'missing authentication cannot read fixture registers');
select is((select count(*)::integer from public.working_time_readable_calculation_ids()), 0,
  'missing authentication cannot receive calculation identifiers');

set local role anon;
select throws_ok('select private.working_time_actor_has_captain_duties()', '42501', null,
  'anonymous callers cannot execute the eligibility helper');
select throws_ok('select id from public.working_time_registers limit 1', '42501', null,
  'anonymous callers cannot read Working Time registers');
reset role;

select * from finish();
rollback;
