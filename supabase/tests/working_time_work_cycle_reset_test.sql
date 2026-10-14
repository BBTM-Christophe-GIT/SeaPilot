-- V4 window maxima retain closed calculation days; the current-day counter is separate.
begin;

select plan(11);

select ok(
  not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.working_time_calculation_windows'::regclass
      and conname = 'working_time_calculation_windows_total_24h_check'
  ),
  'cycle work and total 24-hour rest are stored as independent measures'
);

select matches(
  col_description('public.working_time_calculation_windows'::regclass, (
    select attnum
    from pg_attribute
    where attrelid = 'public.working_time_calculation_windows'::regclass
      and attname = 'work_24h_seconds'
  )),
  '(?i)maximum work total of calculation days',
  'the legacy work column documents the maximum of relevant calculation days'
);

select is(
  (select work_seconds
   from private.working_time_window_metrics_with_phase_json(
     -1,
     '2026-09-01 00:00:00+00', '2026-09-02 00:00:00+00',
     'UTC', null, null, null,
     '[
       {"starts_at":"2026-09-01T00:00:00Z","ends_at":"2026-09-01T08:00:00Z"},
       {"starts_at":"2026-09-01T14:00:00Z","ends_at":"2026-09-01T20:00:00Z"}
     ]'::jsonb
   )),
  28800::numeric,
  'a completed rest separates days without erasing the larger earlier day in the window'
);

select is(
  (select rest_seconds
   from private.working_time_window_metrics_with_phase_json(
     -1,
     '2026-09-01 00:00:00+00', '2026-09-02 00:00:00+00',
     'UTC', null, null, null,
     '[
       {"starts_at":"2026-09-01T00:00:00Z","ends_at":"2026-09-01T08:00:00Z"},
       {"starts_at":"2026-09-01T14:00:00Z","ends_at":"2026-09-01T20:00:00Z"}
     ]'::jsonb
   )),
  36000::numeric,
  'the total-rest control remains measured over the full rolling 24 hours'
);

select is(
  (select work_seconds
   from private.working_time_window_metrics_with_phase_json(
     -1,
     '2026-09-01 00:00:00+00', '2026-09-02 00:00:00+00',
     'UTC', null, null, null,
     '[
       {"starts_at":"2026-09-01T00:00:00Z","ends_at":"2026-09-01T08:00:00Z"},
       {"starts_at":"2026-09-01T13:59:00Z","ends_at":"2026-09-01T19:59:00Z"}
     ]'::jsonb
   )),
  50400::numeric,
  'five hours and fifty-nine minutes of rest do not reset the counter'
);

select is(
  (select work_seconds
   from private.working_time_window_metrics_with_phase_json(
     -1,
     '2026-09-01 00:00:00+00', '2026-09-02 00:00:00+00',
     'UTC', null, null, null,
     '[{"starts_at":"2026-09-01T00:00:00Z","ends_at":"2026-09-01T08:00:00Z"}]'::jsonb
   )),
  28800::numeric,
  'a completed trailing rest preserves the closed day in the window maximum'
);

select is(
  (select current_day_work_seconds
   from private.working_time_window_metrics_with_phase_json_v4(
     -1, '2026-09-01 00:00:00+00', '2026-09-02 00:00:00+00',
     'UTC', null, null, null,
     '[{"starts_at":"2026-09-01T00:00:00Z","ends_at":"2026-09-01T08:00:00Z"}]'::jsonb, 6
   )),
  0::numeric,
  'the separate current-day counter is zero after a completed trailing rest'
);
select is(
  (select work_seconds
   from private.working_time_window_metrics_with_proposals(
     -1,
     '2026-09-01 00:00:00+00', '2026-09-02 00:00:00+00',
     'UTC', null, null, null,
     '2026-09-01 00:00:00+00', '2026-09-01 08:00:00+00',
     '2026-09-01 14:00:00+00', '2026-09-01 20:00:00+00'
   )),
  28800::numeric,
  'single-interval metrics preserve the same relevant-day maximum'
);

select is(
  (select work_seconds
   from private.working_time_window_metrics_with_phase_json(
     -1,
     '2026-09-01 00:00:00+00', '2026-09-08 00:00:00+00',
     'UTC', null, null, null,
     '[
       {"starts_at":"2026-09-01T00:00:00Z","ends_at":"2026-09-01T08:00:00Z"},
       {"starts_at":"2026-09-01T14:00:00Z","ends_at":"2026-09-01T20:00:00Z"}
     ]'::jsonb
   )),
  50400::numeric,
  'the seven-day work total is not reset by the six-hour cycle rule'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.working_time_window_metrics_with_phase_json(bigint,timestamptz,timestamptz,text,time,time,bigint,jsonb)',
    'EXECUTE'
  ),
  'the internal cycle calculation remains unavailable to browser clients'
);

select matches(
  pg_get_functiondef('public.working_time_queue_non_compliance_notification(bigint)'::regprocedure),
  '(?i)travail maximal par journée de calcul',
  'notifications describe the calculation-day maximum accurately'
);

select * from finish();
rollback;
