create index fleet_certificate_findings_certificate_fk_idx
  on public.fleet_certificate_findings (certificate_id);
create index fleet_certificate_findings_responsible_fk_idx
  on public.fleet_certificate_findings (responsible_person_id)
  where responsible_person_id is not null;
create index fleet_certificate_findings_created_by_fk_idx
  on public.fleet_certificate_findings (created_by)
  where created_by is not null;
create index fleet_certificate_findings_updated_by_fk_idx
  on public.fleet_certificate_findings (updated_by)
  where updated_by is not null;
create index fleet_certificate_findings_validated_by_fk_idx
  on public.fleet_certificate_findings (validated_by)
  where validated_by is not null;
create index fleet_certificate_finding_attachments_finding_company_fk_idx
  on public.fleet_certificate_finding_attachments (finding_id, company_id);
create index fleet_certificate_finding_events_finding_company_fk_idx
  on public.fleet_certificate_finding_events (finding_id, company_id);
