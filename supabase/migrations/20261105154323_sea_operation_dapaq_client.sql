-- Extend DAPAQ choices and enforce the declaration mode for client preparation.
do $migration$
declare
  definition text := replace(pg_get_functiondef('sea_operation_private.validate_draft(jsonb,boolean)'::regprocedure), E'\r\n', E'\n');
  choices text := $choices$p_draft #>> '{dapaq,method}' not in ('','nomade','email','s_wing')
    or p_draft #>> '{dapaq,preparedBy}' not in ('','armament','captain','agent')$choices$;
  extended_choices text := $choices$p_draft #>> '{dapaq,method}' not in ('','nomade','email','s_wing','not_applicable')
    or p_draft #>> '{dapaq,preparedBy}' not in ('','armament','captain','agent','client')
    or (p_draft #>> '{dapaq,preparedBy}' = 'client' and p_draft #>> '{dapaq,method}' <> 'not_applicable')$choices$;
begin
  if (length(definition) - length(replace(definition, choices, ''))) / length(choices) <> 1 then
    raise exception 'Expected DAPAQ choice checks missing or ambiguous';
  end if;
  execute replace(definition, choices, extended_choices);
end;
$migration$;

notify pgrst, 'reload schema';
