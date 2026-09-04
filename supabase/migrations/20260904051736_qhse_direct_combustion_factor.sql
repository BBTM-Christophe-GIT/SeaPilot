alter table public.qhse_environment_parameters
  add column if not exists direct_combustion_factor_tco2e_per_m3 numeric(10, 6)
  not null default 2.85
  check (direct_combustion_factor_tco2e_per_m3 > 0);

comment on column public.qhse_environment_parameters.direct_combustion_factor_tco2e_per_m3 is
  'Direct-combustion MDO factor in tonnes CO2e per cubic metre; BBTM validated value: 2.85.';
