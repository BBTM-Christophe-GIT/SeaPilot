-- Accept paternity leave in the existing Planning workflows. Preserve their
-- authorization guards, function settings and ACLs; fail closed on source drift.
do $migration$
declare
  function_signature regprocedure;
  previous_definition text;
  next_definition text;
  previous_statuses constant text := $$('En Mer', 'A Terre', 'Extra', 'Formation', 'Vacance', 'Repos', 'Arrêt Maladie', 'Accident du Travail')$$;
  next_statuses constant text := $$('En Mer', 'A Terre', 'Extra', 'Formation', 'Vacance', 'Repos', 'Arrêt Maladie', 'Accident du Travail', 'Congés Paternités')$$;
begin
  foreach function_signature in array array[
    'public.save_planning_assignment_day_details(bigint,date,text,text,text)'::regprocedure,
    'public.apply_planning_grid_cells(jsonb)'::regprocedure
  ] loop
    select pg_get_functiondef(function_signature) into previous_definition;
    next_definition := replace(previous_definition, previous_statuses, next_statuses);
    if next_definition = previous_definition then
      raise exception 'Expected Planning status validation was not found in %', function_signature;
    end if;
    execute next_definition;
  end loop;

  function_signature := 'public.planning_save_generic_crew_row(bigint,text,text,bigint,integer,jsonb)'::regprocedure;
  select pg_get_functiondef(function_signature) into previous_definition;
  next_definition := replace(previous_definition,
    $$('En Mer','A Terre','Extra','Repos','Vacance','Arrêt Maladie','Arrêt de travail','Formation')$$,
    $$('En Mer','A Terre','Extra','Repos','Vacance','Arrêt Maladie','Arrêt de travail','Formation','Congés Paternités')$$);
  if next_definition = previous_definition then
    raise exception 'Expected generic Planning status validation was not found in %', function_signature;
  end if;
  execute next_definition;
end;
$migration$;

notify pgrst, 'reload schema';
