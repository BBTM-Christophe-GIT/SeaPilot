-- Working-time approval is based on the exact HR function "Capitaine".
-- Planning assignment_role describes the onboard duty and can legitimately be
-- "2nd Capitaine" for that same HR captain. Requiring both labels to be
-- "Capitaine" left valid watches without an approver.

do $migration$
declare
  function_signature regprocedure;
  previous_definition text;
  next_definition text;
begin
  foreach function_signature in array array[
    'public.working_time_captain_can_access_period(bigint,bigint,date,date,bigint,text)'::regprocedure,
    'public.working_time_day_context(bigint,date)'::regprocedure,
    'public.working_time_captain_matches_day(bigint,bigint,bigint,date)'::regprocedure
  ] loop
    select pg_get_functiondef(function_signature) into previous_definition;
    next_definition := regexp_replace(
      previous_definition,
      E'\n[[:space:]]*and captain_assignment\\.assignment_role = ''Capitaine''',
      '',
      'g'
    );

    if next_definition = previous_definition then
      raise exception 'Expected Planning captain-role guard was not found in %', function_signature;
    end if;

    execute next_definition;
  end loop;
end
$migration$;

comment on function public.working_time_captain_can_access_period(bigint, bigint, date, date, bigint, text) is
  'Allows an exact HR Capitaine to access crew registers for the same confirmed Planning vessel and watch, regardless of the onboard assignment-role label.';
comment on function public.working_time_day_context(bigint, date) is
  'Returns the effective Planning assignment and exact HR Capitaine candidates from the same confirmed vessel and watch, regardless of their onboard assignment-role label.';
comment on function public.working_time_captain_matches_day(bigint, bigint, bigint, date) is
  'Checks that an exact HR Capitaine and subject share a confirmed Planning vessel and watch, regardless of the captain onboard assignment-role label.';

notify pgrst, 'reload schema';
