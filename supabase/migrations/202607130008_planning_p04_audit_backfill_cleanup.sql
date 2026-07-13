-- Planning P0.4: remove audit noise produced by the company_id backfill.
--
-- The P0.4 governance migration adds company_id before replacing the legacy
-- audit trigger. PostgreSQL therefore recorded each backfilled Planning row as
-- a business update. These rows have no actor and their before/after payloads
-- differ only by company_id, so they can be identified without timestamps or
-- environment-specific identifiers.
--
-- Replay safety: the predicate becomes empty after the first execution.
-- Rollback: no business state is changed. If technical backfill audit rows are
-- intentionally required, restore the pre-migration database snapshot; they
-- cannot be reconstructed reliably after deletion.

delete from public.planning_change_log
where entity_kind in ('assignment', 'day', 'period', 'project')
  and action = 'update'
  and changed_by is null
  and changed_by_name is null
  and jsonb_typeof(payload -> 'before') = 'object'
  and jsonb_typeof(payload -> 'after') = 'object'
  and payload -> 'before' -> 'company_id' = 'null'::jsonb
  and payload -> 'after' ->> 'company_id' = company_id::text
  and (payload -> 'before') - 'company_id' = (payload -> 'after') - 'company_id';

comment on table public.planning_change_log is
  'Semantic Planning history. P0.4 excludes technical company_id backfills and retains user and lifecycle actions.';
