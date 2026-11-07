-- Use the same final vessel/day reading for stock deductions and annual totals.
create function sea_operation_private.dpr_fuel_days(p_company bigint, p_vessel bigint, p_from date, p_through date)
returns table(report_day date, liters numeric)
language sql stable set search_path = '' as $$
  select distinct on (report.report_date) report.report_date, metrics.fuel_consumed_liters
  from public.dpr_reports report join public.dpr_daily_metrics metrics
    on metrics.dpr_id = report.id and metrics.company_id = report.company_id
  where report.company_id = p_company and report.vessel_id = p_vessel and report.report_date between p_from and p_through
    and report.status = 'validated' and report.deleted_at is null
    and metrics.fuel_consumed_liters >= 0 and metrics.fuel_consumed_liters < 'Infinity'::numeric
  order by report.report_date, (report.source_label <> 'sharepoint') desc,
    coalesce(report.validated_at, report.source_modified_at, report.submitted_at, report.created_at) desc,
    report.version_no desc, report.id desc;
$$;

create or replace function sea_operation_private.dpr_fuel_used_since(p_company bigint, p_vessel bigint, p_from date, p_through date) returns numeric
language sql stable set search_path = '' as $$
  select coalesce(sum(day.liters), 0) from sea_operation_private.dpr_fuel_days(p_company, p_vessel, p_from, p_through) day;
$$;

create function sea_operation_private.fleet_fuel_history(p_vessel_id bigint, p_year integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  company bigint := sea_operation_private.company_id();
  today date := (statement_timestamp() at time zone 'Europe/Paris')::date;
  year_start date;
  year_end date;
begin
  if not coalesce(sea_operation_private.can_read(company), false) or not exists (
    -- Match the current stock's vessel scope without calculating stock or autonomy.
    select 1 from public.vessels vessel
    where vessel.id = p_vessel_id and vessel.company_id = company and vessel.active and vessel.asset_kind = 'vessel'
      and sea_operation_private.fuel_stock_vessel_supported(vessel.name, vessel.acronym)
      and (public.has_company_role(company, array['admin', 'direction', 'armement'])
        or vessel.id = any(private.assigned_vessel_read_scope(company)) or exists (
          select 1 from public.sea_operations operation where operation.company_id = company and operation.vessel_id = vessel.id
            and sea_operation_private.record_is_current(operation.id)
        ))
  ) then
    raise exception 'Navire inaccessible.' using errcode = '42501';
  end if;
  if p_year is null or p_year not between 1900 and extract(year from today) then
    raise exception 'Choisissez une année passée ou en cours.' using errcode = '22023';
  end if;

  year_start := make_date(p_year, 1, 1);
  year_end := least(make_date(p_year, 12, 31), today);

  return (
    with days as materialized (
      select day.report_day, day.liters from sea_operation_private.dpr_fuel_days(company, p_vessel_id, date '1900-01-01', today) day
    ), priced_days as (
      select extract(month from day.report_day)::integer as month, day.liters,
        coalesce(own.price_eur_per_liter_ht, fleet.price_eur_per_liter_ht) as price_per_liter
      from days day
      left join lateral (
        select observation.price_eur_per_liter_ht
        from public.vessel_fuel_price_observations observation
        where observation.company_id = company and observation.vessel_id = p_vessel_id and observation.price_date <= day.report_day
        order by observation.price_date desc limit 1
      ) own on day.liters > 0
      left join lateral (
        select quote.price_eur_per_liter_ht
        from (
          select null::bigint as vessel_id, observation.price_date, observation.price_eur_per_liter_ht, observation.recorded_at
          from public.project_fuel_price_observations observation
          where observation.company_id = company and observation.price_date <= day.report_day
          union all
          select observation.vessel_id, observation.price_date, observation.price_eur_per_liter_ht, observation.recorded_at
          from public.vessel_fuel_price_observations observation
          where observation.company_id = company and observation.price_date <= day.report_day
        ) quote
        order by quote.price_date desc, quote.recorded_at desc, quote.vessel_id nulls first limit 1
      ) fleet on day.liters > 0 and own.price_eur_per_liter_ht is null
      where day.report_day between year_start and year_end
    ), month_totals as (
      select month, sum(liters) as liters,
        case when sum(liters) = 0 then 0 else sum(liters * price_per_liter) filter (where liters > 0) end as cost_euros,
        coalesce(sum(liters) filter (where price_per_liter is null), 0) as unpriced_liters
      from priced_days group by month
    )
    select jsonb_build_object('years', coalesce((
      select jsonb_agg(history.report_year order by history.report_year desc)
      from (select distinct extract(year from report_day)::integer as report_year from days) history
    ), '[]'::jsonb), 'months', (
      select jsonb_agg(jsonb_build_object('month', calendar.month, 'liters', totals.liters, 'costEuros', totals.cost_euros,
        'unpricedLiters', coalesce(totals.unpriced_liters, 0)) order by calendar.month)
      from generate_series(1, 12) calendar(month) left join month_totals totals on totals.month = calendar.month
    ))
  );
end;
$$;

create function public.sea_operation_fleet_fuel_history(p_vessel_id bigint, p_year integer) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select sea_operation_private.fleet_fuel_history(p_vessel_id, p_year);
$$;

revoke all on function sea_operation_private.dpr_fuel_days(bigint, bigint, date, date),
  sea_operation_private.fleet_fuel_history(bigint, integer), public.sea_operation_fleet_fuel_history(bigint, integer)
from public, anon, authenticated, service_role;
grant execute on function sea_operation_private.fleet_fuel_history(bigint, integer), public.sea_operation_fleet_fuel_history(bigint, integer)
to authenticated;

notify pgrst, 'reload schema';
