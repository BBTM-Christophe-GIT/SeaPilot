-- Return the latest source date contributing to the selected year's cumulative chart.
create or replace function sea_operation_private.fleet_fuel_history(p_vessel_id bigint, p_year integer) returns jsonb
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
      select day.report_day, extract(month from day.report_day)::integer as month, day.liters,
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
      select month, max(report_day) as last_report_day, sum(liters) as liters,
        case when sum(liters) = 0 then 0 else sum(liters * price_per_liter) filter (where liters > 0) end as cost_euros,
        coalesce(sum(liters) filter (where price_per_liter is null), 0) as unpriced_liters
      from priced_days group by month
    )
    select jsonb_build_object('lastEntryDate', (select max(last_report_day) from month_totals), 'years', coalesce((
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

create or replace function sea_operation_private.fleet_fuel_history(
  p_vessel_id bigint, p_year integer, p_include_billing boolean
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  history jsonb := sea_operation_private.fleet_fuel_history(p_vessel_id, p_year);
  company bigint := sea_operation_private.company_id();
  today date := (statement_timestamp() at time zone 'Europe/Paris')::date;
begin
  history := history || jsonb_build_object('costSource', 'dpr');

  -- The original function checks the caller's vessel scope before any billing lookup.
  -- Match the existing expense SELECT policy and identify the BBTM vessel by its registration.
  if p_include_billing is distinct from true or not coalesce(public.user_belongs_to_company(company), false)
    or not exists (
      select 1 from public.vessels vessel join public.companies owner on owner.id = vessel.company_id
      where vessel.id = p_vessel_id and vessel.company_id = company and owner.code = 'bbtm'
        and vessel.imo_number = '9213870' and vessel.registration_number = '934968'
    )
  then
    return history;
  end if;

  return (
    with invoices as materialized (
      select expense.invoice_date, expense.amount_ht
      from public.project_chargeable_expenses expense
      join public.projects project on project.id = expense.project_id and project.company_id = expense.company_id
      where expense.company_id = company and expense.invoice_date between date '1900-01-01' and today
        and expense.currency = 'EUR' and expense.amount_ht >= 0 and expense.amount_ht < 'Infinity'::numeric
        and exists (
          select 1 from unnest(expense.supplier_specialties) specialty(label)
          where lower(regexp_replace(specialty.label, '^\s+|\s+$', '', 'g')) = 'fuel'
        )
        and case when expense.dpr_report_id is not null then exists (
          select 1 from public.dpr_reports report
          where report.id = expense.dpr_report_id and report.company_id = expense.company_id
            and report.project_id = expense.project_id and report.vessel_id = p_vessel_id and report.deleted_at is null
        ) else (
          -- An unlinked expense requires an unambiguous project vessel.
          p_vessel_id in (project.primary_vessel_id, project.secondary_vessel_id)
          and coalesce(project.primary_vessel_id, p_vessel_id) = p_vessel_id
          and coalesce(project.secondary_vessel_id, p_vessel_id) = p_vessel_id
          and (project.primary_vessel_id is not null or lower(btrim(coalesce(project.primary_vessel_name, ''))) in ('', 'goury'))
          and (project.secondary_vessel_id is not null or lower(btrim(coalesce(project.secondary_vessel_name, ''))) in ('', 'goury'))
        ) end
    ), available_years as (
      select extract(year from invoice_date)::integer as year from invoices
      union
      select year::integer from jsonb_array_elements_text(history->'years') dpr(year)
    ), billing_months as (
      select extract(month from invoice_date)::integer as month, sum(amount_ht) as cost_euros,
        max(invoice_date) as last_invoice_date
      from invoices where invoice_date >= make_date(p_year, 1, 1) and invoice_date <= make_date(p_year, 12, 31)
      group by 1
    )
    select history || jsonb_build_object('years',
      coalesce((select jsonb_agg(year order by year desc) from available_years), '[]'::jsonb))
      || case when exists (select 1 from billing_months) then jsonb_build_object(
        'costSource', 'billing',
        'lastEntryDate', greatest((history->>'lastEntryDate')::date, (select max(last_invoice_date) from billing_months)),
        'months', (
          select jsonb_agg(dpr.month_data || jsonb_build_object(
            'costEuros', billing.cost_euros, 'unpricedLiters', 0) order by dpr.month_data->'month')
          from jsonb_array_elements(history->'months') dpr(month_data)
          left join billing_months billing on billing.month = (dpr.month_data->>'month')::integer
        )
      ) else '{}'::jsonb end
  );
end;
$$;

notify pgrst, 'reload schema';
