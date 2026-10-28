-- Accept the additional DAPAQ declaration mode without changing signing,
-- delegation, company/profile access or historical payloads.
do $migration$
declare
  definition text := pg_get_functiondef('sea_operation_private.validate_draft(jsonb,boolean)'::regprocedure);
  needle text := 'p_draft #>> ''{dapaq,method}'' not in ('''',''nomade'',''email'')';
  replacement text := 'p_draft #>> ''{dapaq,method}'' not in ('''',''nomade'',''email'',''s_wing'')';
begin
  if (length(definition)-length(replace(definition,needle,'')))/length(needle) <> 1 then
    raise exception 'Expected DAPAQ declaration mode whitelist missing or ambiguous';
  end if;
  execute replace(definition,needle,replacement);
end;
$migration$;

notify pgrst,'reload schema';
