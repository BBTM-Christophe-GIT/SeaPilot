begin;

select plan(6);

select has_column(
  'public', 'project_chargeable_expenses', 'supplier_specialties',
  'chargeable expenses preserve their supplier specialty snapshot'
);

select col_type_is(
  'public', 'project_chargeable_expenses', 'supplier_specialties', 'text[]',
  'supplier specialties use a stable text array'
);

select ok(
  (
    select attnotnull
    from pg_attribute
    where attrelid = 'public.project_chargeable_expenses'::regclass
      and attname = 'supplier_specialties'
      and not attisdropped
  ),
  'the supplier specialty snapshot is always present'
);

select matches(
  (
    select pg_get_constraintdef(oid)
    from pg_constraint
    where conrelid = 'public.vessel_visits'::regclass
      and conname = 'vessel_visits_type_check'
  ),
  'technical_stop',
  'the vessel visit constraint accepts technical stops'
);

select matches(
  pg_get_functiondef('public.save_vessel_visit(bigint,bigint,text,bigint,text,timestamptz[])'::regprocedure),
  'technical_stop',
  'the secured vessel visit writer accepts technical stops'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.save_vessel_visit(bigint,bigint,text,bigint,text,timestamptz[])',
    'EXECUTE'
  ),
  'authenticated users retain access to the secured visit writer'
);

select * from finish();
rollback;
