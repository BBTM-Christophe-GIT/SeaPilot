begin;

select plan(6);

select is(
  (select label from public.port_call_reason_types where key = 'off-hire' and active),
  'Off-Hire',
  'Off-Hire is an active port-call reason'
);

select ok(
  exists (select 1 from pg_proc where oid = 'public.dpr_entry_context(date)'::regprocedure and prosecdef),
  'the DPR Planning context function is security definer'
);

select ok(
  has_function_privilege('authenticated', 'public.dpr_entry_context(date)', 'execute'),
  'authenticated users can request DPR Planning context'
);

select ok(
  not has_function_privilege('anon', 'public.dpr_entry_context(date)', 'execute'),
  'anonymous users cannot request DPR Planning context'
);

select matches(
  pg_get_functiondef('public.dpr_entry_context(date)'::regprocedure),
  '(?i)person\.active.*hired_on.*departed_on',
  'the context restricts personnel to the selected employment period'
);

select matches(
  pg_get_functiondef('public.dpr_entry_context(date)'::regprocedure),
  '(?i)planning_assignments.*watch_group.*planning_projects',
  'the context derives watch, vessel and project from Planning'
);

select * from finish();
rollback;
