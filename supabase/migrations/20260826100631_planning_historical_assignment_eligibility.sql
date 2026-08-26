-- Keep historical Planning writes aligned with the employment-date eligibility
-- already used by the month-aware board-row picker.

do $migration$
declare
  function_signature regprocedure;
  previous_definition text;
  next_definition text;
begin
  function_signature := 'public.apply_planning_grid_cells(jsonb)'::regprocedure;
  select pg_get_functiondef(function_signature) into previous_definition;
  next_definition := replace(
    previous_definition,
    E'      and person.active;',
    E'      and (person.hired_on is null or person.hired_on <= target_date)\n      and (person.departed_on is null or person.departed_on >= target_date);'
  );
  if next_definition = previous_definition then
    raise exception 'Expected active-person Planning grid guard was not found in %', function_signature;
  end if;
  execute next_definition;

  function_signature := 'public.create_planning_board_assignments(bigint,text,date,date,jsonb)'::regprocedure;
  select pg_get_functiondef(function_signature) into previous_definition;
  next_definition := replace(
    previous_definition,
    'if not exists (select 1 from public.people where id = target_person_id and company_id = target_company_id and active) then',
    E'if not exists (\n      select 1\n      from public.people\n      where id = target_person_id\n        and company_id = target_company_id\n        and (hired_on is null or hired_on <= p_ends_on)\n        and (departed_on is null or departed_on >= p_starts_on)\n    ) then'
  );
  if next_definition = previous_definition then
    raise exception 'Expected active-person Planning board guard was not found in %', function_signature;
  end if;
  execute next_definition;

  function_signature := 'public.enforce_planning_assignment_blockers()'::regprocedure;
  select pg_get_functiondef(function_signature) into previous_definition;
  next_definition := replace(
    previous_definition,
    E'    not person_row.active\n    or (person_row.hired_on is not null and person_row.hired_on > new.ends_on)',
    E'    (person_row.hired_on is not null and person_row.hired_on > new.ends_on)'
  );
  if next_definition = previous_definition then
    raise exception 'Expected active-person assignment blocker was not found in %', function_signature;
  end if;
  execute next_definition;
end
$migration$;

comment on function public.apply_planning_grid_cells(jsonb) is
  'Applies validated Planning grid cells when each sailor employment period covers the requested historical or current date.';
comment on function public.create_planning_board_assignments(bigint, text, date, date, jsonb) is
  'Creates a company-scoped provisional vessel board for sailors whose employment dates overlap the requested period.';
comment on function public.enforce_planning_assignment_blockers() is
  'Blocks assignments outside employment dates and other configured rules without treating a historical inactive flag as a date constraint.';

notify pgrst, 'reload schema';
