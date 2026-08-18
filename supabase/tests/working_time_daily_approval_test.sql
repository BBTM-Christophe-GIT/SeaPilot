begin;

select no_plan();

select has_table(
  'public', 'working_time_day_approvals',
  'daily work-time workflow state is stored independently from the monthly register'
);
select has_table(
  'public', 'working_time_day_approval_events',
  'daily approval decisions retain an immutable audit stream'
);
select has_function(
  'public', 'submit_working_time_day', array['bigint', 'date'],
  'a sailor can submit one worked day'
);
select has_function(
  'public', 'validate_working_time_day', array['bigint'],
  'a planning captain can validate one submitted day'
);
select has_function(
  'public', 'validate_working_time_day_with_comment',
  array['bigint', 'text', 'text', 'text', 'text', 'text'],
  'a captain can atomically save the justification and validate a non-compliant day'
);
select has_column(
  'public', 'working_time_day_approvals', 'subject_signature_snapshot',
  'the subject signature is frozen independently'
);
select has_column(
  'public', 'working_time_day_approvals', 'approver_signature_snapshot',
  'the approver signature is frozen independently'
);
select has_function(
  'public', 'planning_status_is_working', array['text'],
  'planning duty statuses are normalised server-side'
);
select ok(
  has_function_privilege('authenticated', 'public.submit_working_time_day(bigint,date)', 'execute'),
  'authenticated sailors may invoke the daily submission RPC'
);
select ok(
  has_function_privilege('authenticated', 'public.validate_working_time_day(bigint)', 'execute'),
  'authenticated approvers may invoke the daily validation RPC'
);
select ok(
  not has_function_privilege('authenticated', 'public.approve_own_working_time_register(bigint,date)', 'execute'),
  'the former captain self-validation shortcut is no longer callable'
);
select ok(
  not has_function_privilege('authenticated', 'public.transition_working_time_register(bigint,text,text)', 'execute'),
  'clients cannot close or reopen an entire monthly register'
);
select ok(
  not has_table_privilege('authenticated', 'public.working_time_day_approvals', 'INSERT'),
  'clients cannot bypass daily workflow RPC checks'
);
select matches(
  pg_get_functiondef('public.working_time_day_has_non_compliance(bigint,date)'::regprocedure),
  '(?is)working_time_intervals.*voided_at is null.*working_time_calculation_windows',
  'a rolling-window breach is attached to a day only when that day contains actual work'
);
select matches(
  pg_get_functiondef('public.validate_working_time_day(bigint)'::regprocedure),
  '(?is)function_label = ''Capitaine''.*working_time_captain_matches_day',
  'daily captain eligibility comes from the exact HR function and Planning board'
);
select matches(
  pg_get_functiondef('public.submit_working_time_day(bigint,date)'::regprocedure),
  '(?is)target_person.function_label = ''Capitaine''.*next_status := ''validated''',
  'an exact HR Capitaine can validate their own compliant signed day'
);
select matches(
  pg_get_functiondef('public.dpr_entry_context(date,bigint)'::regprocedure),
  '(?is)planning_status_is_working.*selected_crew.*matching_project',
  'DPR crew and project defaults are both derived from the selected Planning scope'
);

select * from finish();
rollback;
