create function sea_operation_private.fleet_fuel_history(
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
      select extract(month from invoice_date)::integer as month, sum(amount_ht) as cost_euros
      from invoices where invoice_date >= make_date(p_year, 1, 1) and invoice_date <= make_date(p_year, 12, 31)
      group by 1
    )
    select history || jsonb_build_object('years',
      coalesce((select jsonb_agg(year order by year desc) from available_years), '[]'::jsonb))
      || case when exists (select 1 from billing_months) then jsonb_build_object(
        'costSource', 'billing',
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

-- Keep the original two-argument endpoint's DPR contract for earlier clients.
create function public.sea_operation_fleet_fuel_history(
  p_vessel_id bigint, p_year integer, p_include_billing boolean
) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select sea_operation_private.fleet_fuel_history(p_vessel_id, p_year, p_include_billing);
$$;

revoke all on function sea_operation_private.fleet_fuel_history(bigint, integer, boolean),
  public.sea_operation_fleet_fuel_history(bigint, integer, boolean)
from public, anon, authenticated, service_role;
grant execute on function sea_operation_private.fleet_fuel_history(bigint, integer, boolean),
  public.sea_operation_fleet_fuel_history(bigint, integer, boolean)
to authenticated;

notify pgrst, 'reload schema';
