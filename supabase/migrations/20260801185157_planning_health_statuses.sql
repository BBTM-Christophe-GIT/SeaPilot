-- Extend the existing Planning day-state workflows without creating a parallel
-- status table. The source migrations define the accepted values inside the
-- two RPC bodies, so this migration updates those definitions in place while
-- failing closed if a preceding definition ever changes unexpectedly.

do $migration$
declare
  function_signature regprocedure;
  previous_definition text;
  next_definition text;
  previous_statuses constant text := $$('En Mer', 'A Terre', 'Vacance', 'Repos')$$;
  next_statuses constant text := $$('En Mer', 'A Terre', 'Vacance', 'Repos', 'Arrêt Maladie', 'Accident du Travail')$$;
begin
  foreach function_signature in array array[
    'public.save_planning_assignment_day_state(bigint,date,text,text)'::regprocedure,
    'public.apply_planning_grid_cells(jsonb)'::regprocedure
  ] loop
    select pg_get_functiondef(function_signature) into previous_definition;
    next_definition := replace(previous_definition, previous_statuses, next_statuses);

    if next_definition = previous_definition then
      raise exception 'Expected Planning status validation was not found in %', function_signature;
    end if;

    execute next_definition;
  end loop;
end
$migration$;

comment on function public.save_planning_assignment_day_state(bigint, date, text, text) is
  'Persists a daily Planning state, including sick leave and workplace accident statuses, with an optional short note.';
comment on function public.apply_planning_grid_cells(jsonb) is
  'Applies validated Planning grid cells in bulk, including sick leave and workplace accident statuses.';
