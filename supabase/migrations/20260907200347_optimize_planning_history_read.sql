-- Keep the recent Planning history feed below the PostgREST statement timeout.
--
-- The client orders the RLS-protected journal globally by changed_at and keeps
-- the newest 250 rows. The existing (company_id, changed_at) index cannot serve
-- that ordering until the row-dependent policy has resolved the company for
-- every candidate row, so PostgreSQL scans and sorts the full journal first.
-- A global chronological index lets the executor evaluate RLS from newest to
-- oldest and stop as soon as the requested page is complete.
--
-- Data safety: this migration changes no Planning data or access policy.
-- Rollback: drop index public.planning_change_log_changed_at_read_idx.

create index if not exists planning_change_log_changed_at_read_idx
  on public.planning_change_log (changed_at desc);

comment on index public.planning_change_log_changed_at_read_idx is
  'Supports the RLS-protected recent Planning history feed ordered across companies.';
