-- P0.1 stabilisation: preserve the existing model, repair one invalid civil date,
-- add missing FK indexes, and keep the same Planning permissions with cached RLS helpers.
--
-- Rollback strategy:
--   1. Drop planning_days_disembark_after_work_date.
--   2. Drop the *_by_idx indexes created below if write overhead must be reverted.
--   3. Recreate the previous policies from 202607120003_planning_admin_editor.sql.
--   4. The pre-repair planning_days value is retained in planning_change_log.payload->'before'
--      by the transactional audit trigger and can be restored after dropping the constraint.

update public.planning_days
set disembark_on = work_date,
    updated_at = now()
where disembark_on is not null
  and disembark_on < work_date;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'planning_days_disembark_after_work_date'
      and conrelid = 'public.planning_days'::regclass
  ) then
    alter table public.planning_days
      add constraint planning_days_disembark_after_work_date
      check (disembark_on is null or disembark_on >= work_date)
      not valid;
  end if;
end $$;

alter table public.planning_days
  validate constraint planning_days_disembark_after_work_date;

create index if not exists planning_change_log_changed_by_idx
  on public.planning_change_log (changed_by);
create index if not exists planning_rules_created_by_idx
  on public.planning_rules (created_by);
create index if not exists planning_rules_updated_by_idx
  on public.planning_rules (updated_by);
create index if not exists planning_publications_submitted_by_idx
  on public.planning_publications (submitted_by);
create index if not exists planning_publications_validated_by_idx
  on public.planning_publications (validated_by);
create index if not exists planning_publications_published_by_idx
  on public.planning_publications (published_by);
create index if not exists planning_publications_locked_by_idx
  on public.planning_publications (locked_by);
create index if not exists planning_publications_created_by_idx
  on public.planning_publications (created_by);
create index if not exists planning_publications_updated_by_idx
  on public.planning_publications (updated_by);
create index if not exists planning_versions_created_by_idx
  on public.planning_versions (created_by);

drop policy if exists planning_role_read on public.planning_assignments;
create policy planning_role_read on public.planning_assignments
  for select to authenticated
  using (
    (select public.has_any_role(array['admin', 'direction', 'armement']))
    or (
      (select public.has_role('capitaine'))
      and captain_person_id = (select public.current_person_id())
    )
    or crew_person_id = (select public.current_person_id())
  );

drop policy if exists planning_admin_write on public.planning_assignments;
create policy planning_admin_write on public.planning_assignments
  for all to authenticated
  using ((select public.has_role('admin')))
  with check ((select public.has_role('admin')));

drop policy if exists planning_days_role_read on public.planning_days;
create policy planning_days_role_read on public.planning_days
  for select to authenticated
  using ((select public.has_any_role(array['admin', 'direction', 'armement', 'capitaine', 'marin'])));

drop policy if exists planning_days_admin_write on public.planning_days;
create policy planning_days_admin_write on public.planning_days
  for all to authenticated
  using ((select public.has_role('admin')))
  with check ((select public.has_role('admin')));

drop policy if exists planning_periods_role_read on public.planning_periods;
create policy planning_periods_role_read on public.planning_periods
  for select to authenticated
  using ((select public.has_any_role(array['admin', 'direction', 'armement', 'capitaine', 'marin'])));

drop policy if exists planning_periods_admin_write on public.planning_periods;
create policy planning_periods_admin_write on public.planning_periods
  for all to authenticated
  using ((select public.has_role('admin')))
  with check ((select public.has_role('admin')));

drop policy if exists planning_projects_role_read on public.planning_projects;
create policy planning_projects_role_read on public.planning_projects
  for select to authenticated
  using ((select public.has_any_role(array['admin', 'direction', 'armement', 'capitaine'])));

drop policy if exists planning_projects_admin_write on public.planning_projects;
create policy planning_projects_admin_write on public.planning_projects
  for all to authenticated
  using ((select public.has_role('admin')))
  with check ((select public.has_role('admin')));

drop policy if exists vessels_admin_write on public.vessels;
create policy vessels_admin_write on public.vessels
  for all to authenticated
  using ((select public.has_role('admin')))
  with check ((select public.has_role('admin')));

drop policy if exists planning_change_log_admin_read on public.planning_change_log;
create policy planning_change_log_admin_read on public.planning_change_log
  for select to authenticated
  using ((select public.has_role('admin')));

drop policy if exists planning_change_log_admin_insert on public.planning_change_log;
create policy planning_change_log_admin_insert on public.planning_change_log
  for insert to authenticated
  with check ((select public.has_role('admin')));

comment on constraint planning_days_disembark_after_work_date on public.planning_days is
  'P0.1: a disembarkation civil date cannot precede the represented work day.';
