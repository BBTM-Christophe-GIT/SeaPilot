-- PostgREST returns timestamptz values with PostgreSQL microseconds, while a
-- JavaScript Date only preserves milliseconds. The application now sends the raw
-- concurrency token back to these RPCs. Keep stale-write failures outside the
-- transaction-rollback SQLSTATE class as well, so a genuine conflict is
-- returned immediately instead of being retried until the API gateway times out.
do $migration$
declare
  target_function oid;
  function_definition text;
  patched_definition text;
  discovered_functions integer := 0;
begin
  for target_function in
    select routine.oid
    from pg_proc routine
    where routine.pronamespace = 'public'::regnamespace
      and routine.proname in ('clients_save', 'projects_save')
  loop
    discovered_functions := discovered_functions + 1;
    function_definition := pg_get_functiondef(target_function);

    if position('errcode = ''40001''' in function_definition) > 0 then
      patched_definition := replace(
        function_definition,
        'errcode = ''40001''',
        'errcode = ''P0001'''
      );
      execute patched_definition;
    elsif position('errcode = ''P0001''' in function_definition) = 0 then
      raise exception 'Expected stale-write guard was not found in function %', target_function::regprocedure;
    end if;
  end loop;

  if discovered_functions <> 2 then
    raise exception 'Expected two project-domain save functions, found %', discovered_functions;
  end if;
end;
$migration$;
