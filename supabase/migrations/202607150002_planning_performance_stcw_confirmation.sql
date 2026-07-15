-- Planning read-path indexes and STCW catalogue inventory confirmation.
--
-- Data safety:
--   * no planning or STCW row is inserted, updated or deleted;
--   * the SharePoint inventory is confirmed only after the 54 imported source
--     items are present in the read-only STCW catalogue;
--   * indexes are created idempotently and preserve existing data.
--
-- Replay safety:
--   * every index uses IF NOT EXISTS;
--   * the inventory UPDATE writes the same verified values on every replay;
--   * future STCW additions do not invalidate the minimum catalogue check.
--
-- Rollback:
--   1. Drop the three *_read_idx indexes below if query plans regress.
--   2. Set sharepoint_sources.confirmed back to false for lookup-brevet only
--      if the STCW catalogue is intentionally withdrawn.

create index if not exists planning_days_company_work_date_crew_read_idx
  on public.planning_days (company_id, work_date, crew_name);

create index if not exists planning_periods_company_start_crew_read_idx
  on public.planning_periods (company_id, starts_on, crew_name);

create index if not exists planning_change_log_company_changed_at_read_idx
  on public.planning_change_log (company_id, changed_at desc);

do $$
declare
  imported_stcw_count integer;
begin
  select count(*)::integer
  into imported_stcw_count
  from public.stcw_certificates
  where source_list_id = '8c8561d7-9fb4-420f-8290-b66309d07e92'
    and active;

  if imported_stcw_count < 54 then
    raise exception using
      errcode = '23514',
      message = format('STCW_CATALOGUE_INCOMPLETE: expected at least 54 active source items, found %s', imported_stcw_count);
  end if;

  update public.sharepoint_sources
  set confirmed = true,
      notes = 'Catalogue STCW vérifié et chargé dans public.stcw_certificates (54 éléments source au 15/07/2026).',
      updated_at = now()
  where key = 'lookup-brevet';
end;
$$;

comment on index public.planning_days_company_work_date_crew_read_idx is
  'Supports company-scoped chronological Planning day reads.';
comment on index public.planning_periods_company_start_crew_read_idx is
  'Supports company-scoped chronological Planning period reads.';
comment on index public.planning_change_log_company_changed_at_read_idx is
  'Supports the recent company Planning history feed.';
