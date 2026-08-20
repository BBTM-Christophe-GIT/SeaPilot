-- Production applied the canonical 20260820084731 migration under this
-- timestamp before the Git migration history was synchronized.
--
-- This migration is intentionally a no-op: fresh databases already receive
-- the complete change from 20260820084731_fix_fleet_certificate_renewal_dates.sql.
select 1;
