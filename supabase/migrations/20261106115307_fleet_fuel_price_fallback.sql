alter table public.project_fuel_price_observations add column recorded_at timestamptz;
alter table public.vessel_fuel_price_observations add column recorded_at timestamptz;

-- Existing observations have a dated quote but no saved time of entry.
update public.project_fuel_price_observations
set recorded_at = price_date::timestamp at time zone 'Europe/Paris';
update public.vessel_fuel_price_observations
set recorded_at = price_date::timestamp at time zone 'Europe/Paris';

alter table public.project_fuel_price_observations alter column recorded_at set not null;
alter table public.vessel_fuel_price_observations alter column recorded_at set not null;

create function sea_operation_private.stamp_fuel_price() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.recorded_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function sea_operation_private.stamp_fuel_price() from public, anon, authenticated, service_role;

create trigger company_fuel_price_stamp before insert or update on public.project_fuel_price_observations
for each row execute function sea_operation_private.stamp_fuel_price();
create trigger vessel_fuel_price_stamp before insert or update on public.vessel_fuel_price_observations
for each row execute function sea_operation_private.stamp_fuel_price();

create or replace view public.project_fuel_latest_vessel_prices with (security_invoker = true) as
select distinct on (company_id, vessel_id)
  company_id, vessel_id, price_date, price_eur_per_liter_ht, source_label, recorded_at
from public.vessel_fuel_price_observations
where price_date <= (now() at time zone 'Europe/Paris')::date
order by company_id, vessel_id, price_date desc;

create view public.project_fuel_latest_fallback_price with (security_invoker = true) as
select distinct on (observation.company_id)
  observation.company_id, observation.vessel_id, observation.price_date,
  observation.price_eur_per_liter_ht, observation.source_label, observation.recorded_at
from (
  select company_id, null::bigint as vessel_id, price_date, price_eur_per_liter_ht, source_label, recorded_at
  from public.project_fuel_price_observations
  union all
  select company_id, vessel_id, price_date, price_eur_per_liter_ht, source_label, recorded_at
  from public.vessel_fuel_price_observations
) observation
where observation.price_date <= (now() at time zone 'Europe/Paris')::date
order by observation.company_id, observation.recorded_at desc, observation.price_date desc, observation.vessel_id nulls first;

revoke all on public.project_fuel_latest_fallback_price from public, anon, authenticated, service_role;
grant select on public.project_fuel_latest_fallback_price to authenticated, service_role;

create or replace function sea_operation_private.consumption_reference(p_record public.sea_operations) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('vesselId', p_record.vessel_id,
    'transitLitersPerNm', rates.transit_rate, 'towageLitersPerNm', rates.towage_rate,
    'pricePerLiter', coalesce(vessel_price.price_eur_per_liter_ht, fallback_price.price_eur_per_liter_ht),
    'priceDate', coalesce(vessel_price.price_date, fallback_price.price_date))
  from (
    select max(rate.fuel_liters / nullif(rate.distance_nm, 0)) filter (where not rate.towing) as transit_rate,
      max(rate.fuel_liters / nullif(rate.distance_nm, 0)) filter (where rate.towing) as towage_rate
    from public.project_fuel_vessel_rates rate
    where rate.company_id = p_record.company_id and rate.vessel_id = p_record.vessel_id
  ) rates
  left join public.project_fuel_latest_vessel_prices vessel_price
    on vessel_price.company_id = p_record.company_id and vessel_price.vessel_id = p_record.vessel_id
  left join public.project_fuel_latest_fallback_price fallback_price
    on fallback_price.company_id = p_record.company_id and vessel_price.vessel_id is null;
$$;

notify pgrst, 'reload schema';
