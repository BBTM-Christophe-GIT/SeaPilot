begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_temp;
select plan(22);

create temporary table calculation_day_example as
select * from private.working_time_calculation_day_metrics(
  -1, '2026-10-13 22:00:00+00', '2026-10-14 22:00:00+00', 'UTC', null, null, null,
  '[
    {"starts_at":"2026-10-13T06:00:00Z","ends_at":"2026-10-13T12:00:00Z"},
    {"starts_at":"2026-10-13T13:00:00Z","ends_at":"2026-10-13T18:30:00Z"},
    {"starts_at":"2026-10-14T02:00:00Z","ends_at":"2026-10-14T07:00:00Z"},
    {"starts_at":"2026-10-14T08:00:00Z","ends_at":"2026-10-14T12:00:00Z"},
    {"starts_at":"2026-10-14T18:00:00Z","ends_at":"2026-10-14T22:00:00Z"}
  ]'::jsonb, 6
);
select is((select current_day_starts_at from calculation_day_example), '2026-10-14 12:00:00+00'::timestamptz,
  'the new calculation day starts at the beginning of the six-hour rest');
select is((select current_day_work_seconds from calculation_day_example), 14400::numeric,
  'the current day contains four hours, with no false threshold at 21:00');
select is((select work_seconds from calculation_day_example), 32400::numeric,
  'the maximum relevant day has nine work hours');
select is((select rest_seconds from calculation_day_example), 39600::numeric,
  'total rolling rest is independently eleven hours');
select is((select calculation_days->0->>'ends_at' from calculation_day_example), '2026-10-14T12:00:00+00:00',
  'the previous calculation day closes at the same rest-start instant');
select is((select (calculation_days->0->>'work_seconds')::numeric from calculation_day_example), 32400::numeric,
  'the closed calculation day keeps its nine work hours');
select is((select maximum_amplitude_seconds from calculation_day_example), 36000::numeric,
  'the largest work amplitude is 02:00 to 12:00');

select is((select work_seconds from private.working_time_calculation_day_metrics(
  -1,'2026-10-14 00:00+00','2026-10-15 00:00+00','UTC',null,null,null,
  '[{"starts_at":"2026-10-14T00:00:00Z","ends_at":"2026-10-14T13:00:00Z"},
    {"starts_at":"2026-10-14T19:00:00Z","ends_at":"2026-10-14T22:00:00Z"}]',6)),46800::numeric,
  'a thirteen-hour closed-day violation survives a later compliant day');
select is((select work_seconds from private.working_time_calculation_day_metrics(
  -1,'2026-10-14 00:00+00','2026-10-15 00:00+00','UTC',null,null,null,
  '[{"starts_at":"2026-10-14T00:00:00Z","ends_at":"2026-10-14T08:00:00Z"},
    {"starts_at":"2026-10-14T13:59:00Z","ends_at":"2026-10-14T19:59:00Z"}]',6)),50400::numeric,
  '5h59 rest does not divide the calculation day');
select is((select work_seconds from private.working_time_calculation_day_metrics(
  -1,'2026-10-14 00:00+00','2026-10-15 00:00+00','UTC',null,null,null,
  '[{"starts_at":"2026-10-14T02:00:00Z","ends_at":"2026-10-14T07:00:00Z"},
    {"starts_at":"2026-10-14T08:00:00Z","ends_at":"2026-10-14T12:00:00Z"},
    {"starts_at":"2026-10-14T18:00:00Z","ends_at":"2026-10-14T22:00:00Z"}]',8)),46800::numeric,
  'the split uses the configured eight-hour minimum, not a hard-coded six');
select is((select work_seconds from private.working_time_calculation_day_metrics(
  -1,'2026-10-08 22:00+00','2026-10-15 22:00+00','UTC',null,null,null,
  '[{"starts_at":"2026-10-14T02:00:00Z","ends_at":"2026-10-14T07:00:00Z"},
    {"starts_at":"2026-10-14T08:00:00Z","ends_at":"2026-10-14T12:00:00Z"},
    {"starts_at":"2026-10-14T18:00:00Z","ends_at":"2026-10-14T22:00:00Z"}]',6)),46800::numeric,
  'the seven-day work total is never reset');
select is((select work_seconds from private.working_time_calculation_day_metrics(
  -1,'2026-10-14 10:00+00','2026-10-15 10:00+00','UTC',null,null,null,
  '[{"starts_at":"2026-10-14T00:00:00Z","ends_at":"2026-10-14T13:00:00Z"},
    {"starts_at":"2026-10-14T18:00:00Z","ends_at":"2026-10-14T22:00:00Z"}]',6)),61200::numeric,
  'the work before the rolling window is retained when its unbroken calculation day overlaps');
select is(private.working_time_rest_24h_satisfied(28800,21600,10,6),false,
  'six consecutive hours never replace the separate ten-hour cumulative-rest requirement');
select is(private.working_time_rest_24h_satisfied(36000,18000,10,6),true,
  'the cumulative rest helper checks only cumulative rest');
select is((select maximum_rest_interval_seconds from private.working_time_calculation_day_metrics(
  -1,'2026-10-14 10:00+00','2026-10-15 10:00+00','UTC',null,null,null,
  '[{"starts_at":"2026-10-14T00:00:00Z","ends_at":"2026-10-15T00:00:00Z"}]',6)),86400::numeric,
  'continuous work crossing the rolling boundary retains its full interval-between-rests duration');
select ok(not has_function_privilege('authenticated',
  'private.working_time_calculation_day_metrics(bigint,timestamptz,timestamptz,text,time,time,bigint,jsonb,numeric)','EXECUTE'),
  'the privileged metric helper is not a browser RPC');
select ok(to_regprocedure('public.save_planning_work_rest_policy(bigint,text,text,bigint,date,date,numeric,numeric,numeric,numeric,numeric,integer,time,time,numeric,boolean,boolean,text)') is null,
  'the old policy signature was removed without an ambiguous overload');
select ok(has_function_privilege('authenticated',
  'public.save_planning_work_rest_policy(bigint,text,text,bigint,date,date,numeric,numeric,numeric,numeric,numeric,integer,time,time,numeric,boolean,boolean,text,numeric,numeric)','EXECUTE'),
  'signed-in users can invoke the guarded extended policy RPC');
select ok(not has_function_privilege('anon',
  'public.save_planning_work_rest_policy(bigint,text,text,bigint,date,date,numeric,numeric,numeric,numeric,numeric,integer,time,time,numeric,boolean,boolean,text,numeric,numeric)','EXECUTE'),
  'anonymous users cannot invoke the policy RPC');
select matches(pg_get_functiondef('public.save_planning_work_rest_policy(bigint,text,text,bigint,date,date,numeric,numeric,numeric,numeric,numeric,integer,time,time,numeric,boolean,boolean,text,numeric,numeric)'::regprocedure),
  'has_company_role\(target_company_id, array\[''admin''\]\)', 'extended threshold editing keeps the administrator-only guard');
select matches(pg_get_functiondef('public.working_time_interval_recommendation(bigint,timestamptz,timestamptz,text,bigint,text,bigint)'::regprocedure),
  'working_time_window_metrics_with_proposals_v4', 'single-period recommendations use the same v4 engine');
select matches(pg_get_functiondef('public.working_time_phases_recommendation(bigint,jsonb,text,bigint,text,bigint)'::regprocedure),
  'working_time_window_metrics_with_phase_json_v4', 'multi-period recommendations use the same v4 engine');
select * from finish();
rollback;
