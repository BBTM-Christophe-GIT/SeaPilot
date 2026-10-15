-- Extend the existing day, grid and generic-position workflows. Keep their
-- authorization, conflict, revision and audit guards unchanged. Daily ranges,
-- legacy states and moved/pasted cells reuse the day/grid validators. Draft
-- resolution consumes the periods validated by the generic-position save RPC.
-- No parallel absence type is added.
-- A deployed legacy label has a trailing "s" (Congés Paternités). Accept both
-- known preceding definitions and retain that alias without rewriting any row.
do $migration$
declare
  signature regprocedure;
  previous_definition text;
  next_definition text;
  matched_statuses text;
  previous_statuses constant text := $$('En Mer', 'A Terre', 'Extra', 'Formation', 'Vacance', 'Repos', 'Arrêt Maladie', 'Accident du Travail')$$;
  legacy_statuses constant text := $$('En Mer', 'A Terre', 'Extra', 'Formation', 'Vacance', 'Repos', 'Arrêt Maladie', 'Accident du Travail', 'Congés Paternités')$$;
  next_statuses constant text := $$('En Mer', 'A Terre', 'Extra', 'Formation', 'Vacance', 'Repos', 'Congés Paternité', 'Arrêt Maladie', 'Accident du Travail', 'Congés Paternités')$$;
begin
  foreach signature in array array[
    'public.save_planning_assignment_day_details(bigint,date,text,text,text)'::regprocedure,
    'public.apply_planning_grid_cells(jsonb)'::regprocedure
  ] loop
    select pg_get_functiondef(signature) into previous_definition;
    matched_statuses := case when strpos(previous_definition, legacy_statuses) > 0 then legacy_statuses else previous_statuses end;
    if length(previous_definition) - length(replace(previous_definition, matched_statuses, '')) <> length(matched_statuses) then
      raise exception 'Expected exactly one Planning status validation in %', signature;
    end if;
    next_definition := replace(previous_definition, matched_statuses, next_statuses);
    execute next_definition;
  end loop;

  signature := 'public.planning_save_generic_crew_row(bigint,text,text,bigint,integer,jsonb)'::regprocedure;
  select pg_get_functiondef(signature) into previous_definition;
  matched_statuses := case when strpos(previous_definition,
    $$('En Mer','A Terre','Extra','Repos','Vacance','Arrêt Maladie','Arrêt de travail','Formation','Congés Paternités')$$) > 0
    then $$('En Mer','A Terre','Extra','Repos','Vacance','Arrêt Maladie','Arrêt de travail','Formation','Congés Paternités')$$
    else $$('En Mer','A Terre','Extra','Repos','Vacance','Arrêt Maladie','Arrêt de travail','Formation')$$ end;
  if length(previous_definition) - length(replace(previous_definition, matched_statuses, '')) <> length(matched_statuses) then
    raise exception 'Expected exactly one Planning generic crew status validation in %', signature;
  end if;
  next_definition := replace(previous_definition, matched_statuses,
    $$('En Mer','A Terre','Extra','Repos','Vacance','Congés Paternité','Arrêt Maladie','Accident du Travail','Arrêt de travail','Formation','Congés Paternités')$$);
  execute next_definition;
end
$migration$;
