begin;

select plan(13);

select has_column('public', 'people', 'enim_function_code', 'people exposes the ENIM function code');
select col_type_is('public', 'people', 'enim_function_code', 'text', 'the ENIM function code is text');
select has_column('public', 'people', 'enim_category', 'people exposes the ENIM category');
select col_type_is('public', 'people', 'enim_category', 'integer', 'the ENIM category is an integer');

select is(
  (
    select is_generated
    from information_schema.columns
    where table_schema = 'public' and table_name = 'people' and column_name = 'enim_function_code'
  ),
  'ALWAYS',
  'the ENIM function code is generated from the HR function'
);

select is(
  (
    select is_generated
    from information_schema.columns
    where table_schema = 'public' and table_name = 'people' and column_name = 'enim_category'
  ),
  'ALWAYS',
  'the ENIM category is generated from the HR function'
);

insert into public.people (company_id, first_name, last_name, function_label, active)
select company.id, 'Test', '_CODEX_ENIM_' || mapping.function_label, mapping.function_label, false
from public.companies company
cross join (values
  ('Capitaine'),
  ('2nd Capitaine'),
  ('Chef mécanicien'),
  ('2nd Mécanicien'),
  ('Maître d''Equipage'),
  ('Matelot qualifié'),
  ('Matelot Polyvalent')
) as mapping(function_label)
where company.code = 'bbtm';

select is(
  (
    with expected(function_label, function_code, category) as (values
      ('Capitaine', 'AA01A', 15),
      ('2nd Capitaine', 'CA01A', 12),
      ('Chef mécanicien', 'CB01A', 15),
      ('2nd Mécanicien', 'EB01A', 12),
      ('Maître d''Equipage', 'MA01A', 7),
      ('Matelot qualifié', 'PA01A', 5),
      ('Matelot Polyvalent', 'PA01A', 5)
    )
    select count(*)::integer
    from public.people person
    join expected on expected.function_label = person.function_label
    where person.last_name like '\_CODEX\_ENIM\_%' escape '\'
      and (
        person.enim_function_code is distinct from expected.function_code
        or person.enim_category is distinct from expected.category
      )
  ),
  0,
  'all requested HR functions receive the expected ENIM classification on creation'
);

update public.people
set function_label = 'Second Mécanicien',
    updated_at = date_trunc('month', current_date) + interval '10 days'
where last_name = '_CODEX_ENIM_Capitaine';

select results_eq(
  $$
    select enim_function_code, enim_category
    from public.people
    where last_name = '_CODEX_ENIM_Capitaine'
  $$,
  $$ values ('EB01A'::text, 12::integer) $$,
  'a function change during the month recalculates both ENIM values'
);

update public.people
set function_label = 'Stagiaire'
where last_name = '_CODEX_ENIM_2nd Capitaine';

select results_eq(
  $$
    select enim_function_code, enim_category
    from public.people
    where last_name = '_CODEX_ENIM_2nd Capitaine'
  $$,
  $$ values (null::text, null::integer) $$,
  'an unmapped function clears the ENIM classification'
);

select throws_ok(
  $$
    update public.people
    set enim_function_code = 'BAD'
    where last_name = '_CODEX_ENIM_Chef mécanicien'
  $$,
  '428C9',
  null,
  'generated ENIM values cannot be overridden manually'
);

select ok(
  not exists (
    select 1
    from public.people person
    where lower(trim(person.function_label)) in (
      'capitaine', '2nd capitaine', 'chef mécanicien', '2nd mécanicien',
      'maître d''equipage', 'matelot qualifié', 'matelot polyvalent'
    )
      and (person.enim_function_code is null or person.enim_category is null)
  ),
  'existing mapped people are backfilled automatically'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.people'::regclass),
  'people RLS remains enabled'
);

select is(
  (
    select item_label
    from public.hr_visibility_rules
    where scope = 'function' and item_key = '2nd-mecanicien'
  ),
  '2nd Mécanicien',
  'the new HR function keyword is registered for role visibility'
);

select * from finish();
rollback;
