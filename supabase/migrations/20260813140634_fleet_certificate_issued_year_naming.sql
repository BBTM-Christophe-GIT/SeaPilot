alter table public.fleet_certificates
  alter column renaming_rule_key set default 'vessel-title-issued-year';

update public.fleet_certificates
set renaming_rule_key = 'vessel-title-issued-year'
where renaming_rule_key in (
  'vessel-title-expiry-year',
  'vessel-title-issued-on'
);

comment on column public.fleet_certificates.renaming_rule_key is
  'Document naming strategy. vessel-title-issued-year produces: Vessel - Document title - YYYY.ext.';
