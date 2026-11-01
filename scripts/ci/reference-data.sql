-- CI ONLY: copied into the disposable SeaPilotCI migration snapshot as
-- 20260811121021_ci_reference_data.sql, immediately before the historical fleet
-- certificate import. Never copy this file into supabase/migrations or deploy it.
-- IDs are generated locally. These are reference placeholders, not production
-- records, and no Auth account, membership, role or credential is created.

-- Hard prerequisites in historical data migrations:
--   20260909070844: SUROIT / SUR must exist for its lifting-register import.
--   20260922093349: exactly one active GOURY and LANDEMER must exist.
insert into public.vessels (company_id, name, acronym, active)
select company.id, fixture.name, fixture.acronym, true
from public.companies company
cross join (values ('SUROIT', 'SUR'), ('GOURY', 'GRY'), ('LANDEMER', 'LAN'))
  fixture(name, acronym)
where company.code = 'bbtm'
  and not exists (
    select 1 from public.vessels existing
    where existing.company_id = company.id and existing.name = fixture.name
  );

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
