begin;

select plan(9);

select has_function(
  'public', 'working_time_entry_date_is_open', array['date', 'date'],
  'the manual-entry cutoff is centralised server-side'
);
select ok(
  public.working_time_entry_date_is_open(date '2026-08-31', date '2026-09-01'),
  'the previous month remains open on the first day'
);
select ok(
  public.working_time_entry_date_is_open(date '2026-08-31', date '2026-09-05'),
  'the previous month remains open on the fifth day'
);
select ok(
  not public.working_time_entry_date_is_open(date '2026-08-31', date '2026-09-06'),
  'the previous month closes on the sixth day'
);
select ok(
  public.working_time_entry_date_is_open(date '2026-12-31', date '2027-01-05'),
  'the grace period crosses the year boundary'
);
select ok(
  not public.working_time_entry_date_is_open(date '2026-12-31', date '2027-01-06'),
  'the year-boundary grace period also closes on the sixth day'
);
select ok(
  not has_function_privilege('authenticated', 'public.working_time_entry_date_is_open(date,date)', 'execute'),
  'authenticated clients cannot call the internal cutoff helper directly'
);
select has_function(
  'public', 'working_time_day_approval_entry_window_guard', array[]::text[],
  'submission is protected by a server-side approval trigger'
);
select matches(
  pg_get_functiondef('public.working_time_actor_can_edit_day(bigint,date)'::regprocedure),
  '(?is)approval.status = ''submitted''.*working_time_entry_date_is_open.*Europe/Paris',
  'draft entry uses Paris local time while submitted-day approval remains available'
);

select * from finish();
rollback;
