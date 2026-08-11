alter table public.fleet_certificate_findings
  drop constraint fleet_certificate_findings_finding_type_check;

alter table public.fleet_certificate_findings
  add constraint fleet_certificate_findings_finding_type_check
  check (finding_type in (
    'major_non_conformity',
    'minor_non_conformity',
    'class_condition',
    'remark',
    'prescription',
    'finding'
  ));

comment on constraint fleet_certificate_findings_finding_type_check
  on public.fleet_certificate_findings is
  'Types d’écarts et de constats acceptés par le module Certificats flotte.';
