create table public.vessel_fuel_reference_samples (
  company_id bigint not null,
  vessel_id bigint not null,
  towing boolean not null,
  source_key text not null check (length(trim(source_key)) between 1 and 160),
  source_label text not null check (length(trim(source_label)) between 1 and 160),
  voyage_count integer not null check (voyage_count > 0),
  distance_nm numeric(14, 3) not null check (distance_nm > 0 and distance_nm <> 'NaN'::numeric),
  fuel_liters numeric(14, 3) not null check (fuel_liters > 0 and fuel_liters <> 'NaN'::numeric),
  primary key (company_id, vessel_id, towing, source_key),
  foreign key (vessel_id, company_id) references public.vessels(id, company_id) on delete restrict
);

comment on table public.vessel_fuel_reference_samples is
  'Validated voyage totals by vessel, towing mode and independent source batch. Replace an existing source key on correction and exclude voyages already covered by another batch.';

alter table public.vessel_fuel_reference_samples enable row level security;
revoke all on public.vessel_fuel_reference_samples from public, anon, authenticated, service_role;
grant select on public.vessel_fuel_reference_samples to authenticated;
grant select, insert, update on public.vessel_fuel_reference_samples to service_role;

create policy vessel_fuel_reference_samples_read on public.vessel_fuel_reference_samples
  for select to authenticated using (
    company_id = (select public.current_planning_company_id())
    and public.has_company_role(company_id, array['admin', 'direction'])
  );

create view public.project_fuel_vessel_rates with (security_invoker = true) as
select company_id, vessel_id, towing, sum(voyage_count) as sample_count,
       sum(distance_nm) as distance_nm, sum(fuel_liters) as fuel_liters
from public.vessel_fuel_reference_samples
group by company_id, vessel_id, towing;

revoke all on public.project_fuel_vessel_rates from public, anon, authenticated, service_role;
grant select on public.project_fuel_vessel_rates to authenticated, service_role;

create table public.project_fuel_price_observations (
  company_id bigint not null default public.current_planning_company_id()
    references public.companies(id) on delete restrict,
  price_date date not null check (isfinite(price_date)),
  price_eur_per_liter_ht numeric(12, 4) not null
    check (price_eur_per_liter_ht > 0 and price_eur_per_liter_ht <> 'NaN'::numeric),
  source_label text not null check (length(trim(source_label)) between 1 and 160),
  fuel_code text not null default 'zaphir-taxable' check (fuel_code = 'zaphir-taxable'),
  primary key (company_id, price_date)
);

comment on table public.project_fuel_price_observations is
  'Dated EUR per litre excluding tax for Zaphir TAXABLE - GASOIL Pêche UN1202. A source label identifies the applicable quote or observed price.';

alter table public.project_fuel_price_observations enable row level security;
revoke all on public.project_fuel_price_observations from public, anon, authenticated, service_role;
grant select, insert, update on public.project_fuel_price_observations to authenticated, service_role;

create policy project_fuel_price_observations_read on public.project_fuel_price_observations
  for select to authenticated using (
    company_id = (select public.current_planning_company_id())
    and public.has_company_role(company_id, array['admin', 'direction'])
  );

create policy project_fuel_price_observations_insert on public.project_fuel_price_observations
  for insert to authenticated with check (
    company_id = (select public.current_planning_company_id())
    and public.has_company_role(company_id, array['admin', 'direction'])
  );

create policy project_fuel_price_observations_update on public.project_fuel_price_observations
  for update to authenticated using (
    company_id = (select public.current_planning_company_id())
    and public.has_company_role(company_id, array['admin', 'direction'])
  ) with check (
    company_id = (select public.current_planning_company_id())
    and public.has_company_role(company_id, array['admin', 'direction'])
  );

-- Aggregate only completed, non-overlapping, positive fuel readings for passages
-- of at least 10 NM between distinct locations. Keep workbook details out of Git.
insert into public.vessel_fuel_reference_samples (
  company_id, vessel_id, towing, source_key, source_label, voyage_count, distance_nm, fuel_liters
)
select vessel.company_id, vessel.id, source.towing, source.source_key, source.source_label,
       source.voyage_count, source.distance_nm, source.fuel_liters
from (values
  ('937905', '228098070', false, 'cx-3-rzl', 'Suivi des consommations · LE ROZEL', 236, 20792.940, 174611.623),
  ('937905', '228098070', true,  'cx-3-rzl', 'Suivi des consommations · LE ROZEL', 80,  11990.710, 160374.297),
  ('926637', '227779340', false, 'cx-3-sur', 'Suivi des consommations · SUROIT',   42,  2973.100,  38278.800),
  ('926637', '227779340', true,  'cx-3-sur', 'Suivi des consommations · SUROIT',   32,  1741.500,  30527.000)
) as source(registration_number, mmsi, towing, source_key, source_label, voyage_count, distance_nm, fuel_liters)
join public.vessels vessel on vessel.registration_number = source.registration_number
  and vessel.mmsi = source.mmsi and vessel.asset_kind = 'vessel'
join public.companies company on company.id = vessel.company_id and company.code = 'bbtm';
