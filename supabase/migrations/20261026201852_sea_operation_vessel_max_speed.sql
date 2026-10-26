-- Map-only route estimates reuse the existing company/profile-scoped overview.
-- No Fleet permission, draft snapshot, grant or business record is changed.
do $migration$
declare
  definition text := pg_get_functiondef('sea_operation_private.overview()'::regprocedure);
  needle text := '''draft_m'',vessel.draft_m,''weather_matrix'',vessel.weather_matrix,';
begin
  if (length(definition)-length(replace(definition,needle,'')))/length(needle) <> 1 then
    raise exception 'Expected sea-operation vessel overview fields missing or ambiguous';
  end if;
  execute replace(definition,needle,
    '''draft_m'',vessel.draft_m,''max_speed_knots'',vessel.max_speed_knots,''weather_matrix'',vessel.weather_matrix,');
end;
$migration$;
notify pgrst,'reload schema';
