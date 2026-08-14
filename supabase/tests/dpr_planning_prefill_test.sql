begin;

select no_plan();

select is(
  (select label from public.port_call_reason_types where key = 'off-hire' and active),
  'Off-Hire',
  'Off-Hire is an active port-call reason'
);

select ok(
  exists (select 1 from pg_proc where oid = 'public.dpr_entry_context(date,bigint)'::regprocedure and prosecdef),
  'the DPR Planning context function is security definer'
);

select ok(
  has_function_privilege('authenticated', 'public.dpr_entry_context(date,bigint)', 'execute'),
  'authenticated users can request DPR Planning context'
);

select ok(
  not has_function_privilege('anon', 'public.dpr_entry_context(date,bigint)', 'execute'),
  'anonymous users cannot request DPR Planning context'
);

select matches(
  pg_get_functiondef('public.dpr_entry_context(date,bigint)'::regprocedure),
  '(?i)person\.active.*hired_on.*departed_on',
  'the context restricts personnel to the selected employment period'
);

select matches(
  pg_get_functiondef('public.dpr_entry_context(date,bigint)'::regprocedure),
  '(?i)planning_assignments.*watch_group.*planning_projects',
  'the context derives watch, vessel and project from Planning'
);

select matches(
  pg_get_functiondef('public.dpr_entry_context(date,bigint)'::regprocedure),
  '(?i)join public\.projects.*project_code.*jsonb_build_object',
  'the context returns the selected project snapshot without broad catalog access'
);

select matches(
  pg_get_functiondef('public.dpr_entry_context(date,bigint)'::regprocedure),
  '(?i)planning_status_is_working.*planning_effective_person_status',
  'the embarked crew excludes non-working Planning statuses'
);

select * from finish();
rollback;
