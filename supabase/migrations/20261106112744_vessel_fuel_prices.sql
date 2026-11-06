create table public.vessel_fuel_price_observations (
  company_id bigint not null default public.current_planning_company_id(),
  vessel_id bigint not null,
  price_date date not null check (isfinite(price_date)),
  price_eur_per_liter_ht numeric(12, 4) not null
    check (price_eur_per_liter_ht > 0 and price_eur_per_liter_ht <> 'NaN'::numeric),
  source_label text not null check (length(trim(source_label)) between 1 and 160),
  fuel_code text not null default 'zaphir-taxable' check (fuel_code = 'zaphir-taxable'),
  primary key (company_id, vessel_id, price_date),
  foreign key (vessel_id, company_id) references public.vessels(id, company_id) on delete restrict
);

comment on table public.vessel_fuel_price_observations is
  'Dated fuel prices in EUR per litre excluding tax, independently recorded for each vessel.';

alter table public.vessel_fuel_price_observations enable row level security;
revoke all on public.vessel_fuel_price_observations from public, anon, authenticated, service_role;
grant select, insert, update on public.vessel_fuel_price_observations to authenticated, service_role;

create policy vessel_fuel_prices_read on public.vessel_fuel_price_observations
  for select to authenticated using (
    company_id = (select public.current_planning_company_id())
    and public.has_company_role(company_id, array['admin', 'direction'])
  );
create policy vessel_fuel_prices_insert on public.vessel_fuel_price_observations
  for insert to authenticated with check (
    company_id = (select public.current_planning_company_id())
    and public.has_company_role(company_id, array['admin', 'direction'])
  );
create policy vessel_fuel_prices_update on public.vessel_fuel_price_observations
  for update to authenticated using (
    company_id = (select public.current_planning_company_id())
    and public.has_company_role(company_id, array['admin', 'direction'])
  ) with check (
    company_id = (select public.current_planning_company_id())
    and public.has_company_role(company_id, array['admin', 'direction'])
  );

create view public.project_fuel_latest_vessel_prices with (security_invoker = true) as
select distinct on (company_id, vessel_id)
  company_id, vessel_id, price_date, price_eur_per_liter_ht, source_label
from public.vessel_fuel_price_observations
where price_date <= (now() at time zone 'Europe/Paris')::date
order by company_id, vessel_id, price_date desc;

revoke all on public.project_fuel_latest_vessel_prices from public, anon, authenticated, service_role;
grant select on public.project_fuel_latest_vessel_prices to authenticated, service_role;

-- Historical refuelling prices from LE ROZEL (RELEVES D461:R461)
-- and SUROIT (RELEVES D390:R390). Preserve an existing observation on rerun.
insert into public.vessel_fuel_price_observations (
  company_id, vessel_id, price_date, price_eur_per_liter_ht, source_label
)
select vessel.company_id, vessel.id, source.price_date, source.price, source.label
from (values
  ('937905', '228098070', date '2026-10-31', 1.254, 'Suivi des consommations · LE ROZEL · 31/10/2026'),
  ('926637', '227779340', date '2026-09-22', 1.115, 'Suivi des consommations · SUROIT · 22/09/2026')
) as source(registration_number, mmsi, price_date, price, label)
join public.vessels vessel on vessel.registration_number = source.registration_number
  and vessel.mmsi = source.mmsi and vessel.asset_kind = 'vessel'
join public.companies company on company.id = vessel.company_id and company.code = 'bbtm'
on conflict (company_id, vessel_id, price_date) do nothing;

create or replace function sea_operation_private.consumption_reference(p_record public.sea_operations) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('vesselId', p_record.vessel_id,
    'transitLitersPerNm', rates.transit_rate, 'towageLitersPerNm', rates.towage_rate,
    'pricePerLiter', coalesce(vessel_price.price_eur_per_liter_ht, company_price.price_eur_per_liter_ht),
    'priceDate', coalesce(vessel_price.price_date, company_price.price_date))
  from (
    select max(rate.fuel_liters / nullif(rate.distance_nm, 0)) filter (where not rate.towing) as transit_rate,
      max(rate.fuel_liters / nullif(rate.distance_nm, 0)) filter (where rate.towing) as towage_rate
    from public.project_fuel_vessel_rates rate
    where rate.company_id = p_record.company_id and rate.vessel_id = p_record.vessel_id
  ) rates
  left join public.project_fuel_latest_vessel_prices vessel_price
    on vessel_price.company_id = p_record.company_id and vessel_price.vessel_id = p_record.vessel_id
  left join lateral (
    select observation.price_eur_per_liter_ht, observation.price_date
    from public.project_fuel_price_observations observation
    where observation.company_id = p_record.company_id and observation.price_date <= (now() at time zone 'Europe/Paris')::date
    order by observation.price_date desc limit 1
  ) company_price on vessel_price.vessel_id is null;
$$;

-- Keep price publication atomic with the completed annex and voyage sample.
do $migration$
declare
  definition text := replace(pg_get_functiondef('sea_operation_private.save_consumption(uuid,integer,jsonb)'::regprocedure), E'\r\n', E'\n');
  previous_price_write text := $old$    insert into public.project_fuel_price_observations(company_id, price_date, price_eur_per_liter_ht, source_label)
    values (operation.company_id, (clock_timestamp() at time zone 'Europe/Paris')::date,
      price_per_liter, left('Relevé Conso · ' || vessel_name, 160))
    on conflict (company_id, price_date) do update$old$;
  vessel_price_write text := $new$    insert into public.vessel_fuel_price_observations(company_id, vessel_id, price_date, price_eur_per_liter_ht, source_label)
    values (operation.company_id, operation.vessel_id, (clock_timestamp() at time zone 'Europe/Paris')::date,
      price_per_liter, left('Relevé Conso · ' || vessel_name, 160))
    on conflict (company_id, vessel_id, price_date) do update$new$;
begin
  if (length(definition) - length(replace(definition, previous_price_write, ''))) / length(previous_price_write) <> 1 then
    raise exception 'Expected one Conso price write.';
  end if;
  execute replace(definition, previous_price_write, vessel_price_write);
end;
$migration$;

notify pgrst, 'reload schema';
