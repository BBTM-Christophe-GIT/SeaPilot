alter table public.fleet_certificate_findings
  add column if not exists corrective_action text not null default '';

comment on column public.fleet_certificate_findings.corrective_action is
  'Contenu HTML enrichi et assaini décrivant l’action corrective prévue ou réalisée.';
