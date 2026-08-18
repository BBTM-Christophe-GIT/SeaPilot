begin;

select plan(8);

select has_column(
  'public', 'planning_manning_matrices', 'navigation_genre',
  'staffing situations store their navigation genre'
);
select has_column(
  'public', 'planning_manning_matrices', 'activity_description',
  'staffing situations store their operating activity description'
);
select col_type_is(
  'public', 'planning_manning_matrices', 'navigation_genre', 'text',
  'the navigation genre uses a stable text value'
);
select col_type_is(
  'public', 'planning_manning_matrices', 'activity_description', 'text',
  'custom operating descriptions are preserved as text'
);
select has_function(
  'public', 'save_planning_manning_matrix',
  array['bigint', 'bigint', 'text', 'text', 'text', 'date', 'date', 'text', 'text', 'jsonb'],
  'the staffing save function accepts navigation and activity context'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.save_planning_manning_matrix(bigint,bigint,text,text,text,date,date,text,text,jsonb)',
    'execute'
  ),
  'authenticated managers can call the updated staffing save function'
);
select matches(
  pg_get_functiondef('public.save_planning_manning_matrix(bigint,bigint,text,text,text,date,date,text,text,jsonb)'::regprocedure),
  '(?is)navigation_genre.*activity_description',
  'the save function persists both new context fields'
);
select matches(
  pg_get_constraintdef(
    (select oid from pg_constraint where conname = 'planning_manning_matrices_navigation_genre_check')
  ),
  'CI-CABOTAGE INTERNATIONAL.*CN-CABOTAGE NATIONAL.*NC-NAVIGATION COTIERE',
  'the database constrains navigation genres to the requested choices'
);

select * from finish();
rollback;
