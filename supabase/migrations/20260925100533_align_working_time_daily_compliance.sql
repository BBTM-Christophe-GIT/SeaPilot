-- Attribute each rolling violation to the last worked interval in its window,
-- exactly as workingTimeCompliance.ts does. A next-morning carry-over must not
-- block a later, compliant day. Existing approvals/signatures are not rewritten.
create or replace function public.working_time_day_violations(
  p_register_id bigint,
  p_local_work_date date
)
returns table (calculation_id bigint, violation_codes text[])
language sql
stable
security definer
set search_path = ''
as $$
  select calculation.id, array_agg(distinct violation.code order by violation.code)
  from public.working_time_registers register
  join public.working_time_calculation_windows calculation
    on calculation.company_id = register.company_id
   and calculation.person_id = register.person_id
   and calculation.local_window_end_date between p_local_work_date and p_local_work_date + 7
   and calculation.is_compliant is false
  cross join lateral unnest(calculation.violation_codes) violation(code)
  cross join lateral (
    select work_interval.local_work_date
    from public.working_time_intervals work_interval
    where work_interval.company_id = register.company_id
      and work_interval.person_id = register.person_id
      and work_interval.voided_at is null
      and work_interval.starts_at < calculation.window_end
      and work_interval.ends_at > calculation.window_end - case
        when violation.code in ('work_7d', 'rest_7d') then interval '168 hours'
        else interval '24 hours'
      end
    order by work_interval.ends_at desc, work_interval.id desc
    limit 1
  ) contributing_day
  where register.id = p_register_id
    and p_local_work_date between register.period_start and register.period_end
    and contributing_day.local_work_date = p_local_work_date
  group by calculation.id;
$$;

-- Internal helpers remain inaccessible through the Data API.
revoke all on function public.working_time_day_violations(bigint, date) from public, anon, authenticated;

create or replace function public.working_time_day_has_non_compliance(
  p_register_id bigint,
  p_local_work_date date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.working_time_day_violations(p_register_id, p_local_work_date)
  );
$$;

revoke all on function public.working_time_day_has_non_compliance(bigint, date) from public, anon, authenticated;

-- Preserve all current authorization and signature checks. Only the frozen
-- non-compliance evidence changes, using the same attribution as the guard.
do $migration$
declare
  definition text;
  old_sql text := $old$  select coalesce(jsonb_agg(jsonb_build_object(
    'local_work_date', calculation.local_window_end_date,
    'violation_codes', calculation.violation_codes,
    'work_24h_seconds', calculation.work_24h_seconds,
    'rest_24h_seconds', calculation.rest_24h_seconds,
    'work_7d_seconds', calculation.work_7d_seconds,
    'rest_7d_seconds', calculation.rest_7d_seconds
  ) order by calculation.window_end), '[]'::jsonb)
  into non_compliance_data from public.working_time_calculation_windows calculation
  where calculation.company_id = target_register.company_id
    and calculation.person_id = target_register.person_id
    and calculation.local_window_end_date = target_approval.local_work_date
    and calculation.is_compliant is false
    and public.working_time_day_has_non_compliance(target_register.id, target_approval.local_work_date);$old$;
  new_sql text := $new$  select coalesce(jsonb_agg(jsonb_build_object(
    'local_work_date', target_approval.local_work_date,
    'window_end', calculation.window_end,
    'local_window_end_date', calculation.local_window_end_date,
    'violation_codes', attributed.violation_codes,
    'work_24h_seconds', calculation.work_24h_seconds,
    'rest_24h_seconds', calculation.rest_24h_seconds,
    'work_7d_seconds', calculation.work_7d_seconds,
    'rest_7d_seconds', calculation.rest_7d_seconds
  ) order by calculation.window_end), '[]'::jsonb)
  into non_compliance_data
  from public.working_time_day_violations(target_register.id, target_approval.local_work_date) attributed
  join public.working_time_calculation_windows calculation on calculation.id = attributed.calculation_id;$new$;
begin
  definition := replace(pg_get_functiondef('public.validate_working_time_day(bigint)'::regprocedure), chr(13), '');
  old_sql := replace(old_sql, chr(13), '');
  new_sql := replace(new_sql, chr(13), '');
  if (length(definition) - length(replace(definition, old_sql, ''))) / length(old_sql) <> 1 then
    raise exception 'Expected exactly one daily non-compliance snapshot query';
  end if;
  execute replace(definition, old_sql, new_sql);
end;
$migration$;

notify pgrst, 'reload schema';
