alter table public.fleet_certificates
  alter column renaming_rule_key set default 'vessel-title-issued-on';

update public.fleet_certificates
set renaming_rule_key = 'vessel-title-issued-on'
where renaming_rule_key = 'vessel-title-expiry-year';

comment on column public.fleet_certificates.renaming_rule_key is
  'Document naming strategy. vessel-title-issued-on produces: Vessel - Document title - YYYY-MM-DD.ext.';
