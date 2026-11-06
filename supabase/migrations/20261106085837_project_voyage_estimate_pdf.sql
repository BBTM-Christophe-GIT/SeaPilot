-- Preserve the three export modes without rewriting existing plans.
do $migration$
declare definition text; needle text; replacement text;
begin
  definition := replace(pg_get_functiondef('project_location_private.normalize_plan(jsonb,boolean)'::regprocedure), E'\r\n', E'\n');
  needle := '  foreach field in array array[''waypoints'',''points'',''zones''] loop';
  if (length(definition) - length(replace(definition, needle, ''))) / length(needle) <> 1 then
    raise exception 'Expected project location collections anchor.';
  end if;
  replacement := E'  if p_value ? ''includeVoyageEstimateInPdf'' then\n'
    || E'    if jsonb_typeof(p_value->''includeVoyageEstimateInPdf'') is distinct from ''boolean'' then\n'
    || E'      raise exception ''Option d’estimation PDF invalide.'' using errcode=''22023'';\n'
    || E'    end if;\n'
    || E'    result := result || jsonb_build_object(''includeVoyageEstimateInPdf'', p_value->''includeVoyageEstimateInPdf'');\n'
    || E'  end if;\n';
  execute replace(definition, needle, replacement || needle);

  definition := replace(pg_get_functiondef('project_location_private.validate_overlay(jsonb,jsonb)'::regprocedure), E'\r\n', E'\n');
  needle := E'\nbegin\n';
  if (length(definition) - length(replace(definition, needle, ''))) / length(needle) <> 1 then
    raise exception 'Expected project location overlay entry point.';
  end if;
  replacement := E'  if p_overlay ? ''includeVoyageEstimateInPdf'' then\n'
    || E'    raise exception ''L’option d’estimation PDF est réservée à la localisation du projet.'' using errcode=''22023'';\n'
    || E'  end if;\n';
  execute replace(definition, needle, needle || replacement);
end;
$migration$;
