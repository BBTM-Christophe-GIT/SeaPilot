begin;

select no_plan();

select has_table(
  'public', 'planning_staffing_derogations',
  'staffing credential derogations are stored and audited'
);
select has_function(
  'public', 'planning_staffing_board_status', array['bigint', 'text', 'date'],
  'staffing compliance is evaluated for one vessel, board and day'
);
select has_column(
  'public', 'companies', 'staffing_decision_planning_enabled',
  'the Planning integration is controlled by a company feature switch'
);
select has_column(
  'public', 'vessels', 'asset_kind',
  'the mixed SharePoint source is classified as vessel, office or quay'
);
select has_column(
  'public', 'vessels', 'photo_storage_path',
  'a vessel can reference an uploaded photo'
);
select has_column(
  'public', 'vessels', 'brochure_subtitle',
  'structured brochure characteristics are stored with the vessel'
);
select has_function(
  'public', 'planning_staffing_alerts', array['date', 'date'],
  'administrators can load staffing alerts for the visible planning range'
);
select has_function(
  'public', 'confirm_planning_board_functions', array['bigint', 'text', 'date', 'jsonb'],
  'administrators can confirm Planning-only functions for joined assignments'
);
select has_function(
  'public', 'grant_planning_staffing_derogation',
  array['bigint', 'text', 'date', 'date', 'bigint', 'text', 'text'],
  'a motivated missing-credential derogation can be recorded'
);
select ok(
  has_function_privilege('authenticated', 'public.planning_staffing_alerts(date,date)', 'execute'),
  'authenticated users reach the server-side alert guard'
);
select ok(
  not has_table_privilege('authenticated', 'public.planning_staffing_derogations', 'INSERT'),
  'clients cannot bypass the derogation RPC'
);
select matches(
  pg_get_functiondef('public.planning_staffing_board_status(bigint,text,date)'::regprocedure),
  '(?is)person.function_label = ''Capitaine''.*assignment.assignment_role = ''Capitaine''',
  'captain eligibility combines the exact HR truth with the confirmed Planning function'
);
select matches(
  pg_get_functiondef('public.confirm_planning_board_functions(bigint,text,date,jsonb)'::regprocedure),
  '(?is)update public.planning_assignments.*assignment_role.*confirmation_status = ''confirmed''',
  'function confirmation updates the complete joined Planning assignments'
);
select matches(
  pg_get_functiondef('public.publish_planning_release()'::regprocedure),
  '(?is)planning_staffing_release_has_blockers.*PLANNING_STAFFING_REVIEW_REQUIRED',
  'the dormant publication hook remains available for future reactivation'
);
select matches(
  pg_get_functiondef('public.planning_staffing_release_has_blockers(bigint)'::regprocedure),
  '(?is)staffing_decision_planning_enabled.*return false',
  'publication ignores staffing discrepancies while the switch is disabled'
);
select matches(
  pg_get_functiondef('public.planning_staffing_alerts(date,date)'::regprocedure),
  '(?is)staffing_decision_planning_enabled.*return',
  'Planning alerts are silent while the switch is disabled'
);

select * from finish();
rollback;
