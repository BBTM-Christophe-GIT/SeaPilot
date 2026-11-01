-- CI ONLY: copied into the disposable SeaPilotCI migration snapshot as
-- 20260909070843_ci_reference_data.sql, immediately before the historical
-- lifting-register import. Never copy this file into supabase/migrations or deploy it.
-- No Auth account, membership, role or credential is created.

-- 20260820070225 already imports the fleet reference, including SUROIT, GOURY
-- and LANDEMER. Do not insert duplicates: 20260922093349 checks there is exactly
-- one active GOURY and LANDEMER. Only the legacy acronym is missing on a fresh
-- database and is required by the strict 20260909070844 lifting import.
update public.vessels vessel
set acronym = 'SUR'
from public.companies company
where company.id = vessel.company_id and company.code = 'bbtm' and vessel.name = 'SUROIT';

-- These exact names are also hard prerequisites, not optional UPDATE targets:
--   20261001140235 raises unless exactly these two BBTM people exist.
--   20261002191208 raises unless both are enrolled by the preceding migration.
-- Keep the placeholders inactive and unlinked to avoid creating working-time
-- registers or granting a test identity access to office staff records.
insert into public.people (company_id, first_name, last_name, active)
select company.id, fixture.first_name, fixture.last_name, false
from public.companies company
cross join (values ('Christophe', 'MINASSIAN'), ('Sophie', 'HAMEL'))
  fixture(first_name, last_name)
where company.code = 'bbtm'
  and not exists (
    select 1 from public.people existing
    where existing.company_id = company.id
      and existing.first_name = fixture.first_name and existing.last_name = fixture.last_name
  );
