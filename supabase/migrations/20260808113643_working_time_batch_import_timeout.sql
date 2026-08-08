-- Annual imports can contain hundreds of intervals. Recalculating every rolling
-- window after each individual INSERT makes the authenticated Data API request
-- exceed its statement timeout. Defer those recalculations inside the guarded
-- import RPC and rebuild the affected person's windows once before commit.

create or replace function private.working_time_recalculate_interval_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  old_person_id bigint;
  new_person_id bigint;
  impact_start timestamptz;
  impact_end timestamptz;
begin
  if coalesce(current_setting('seapilot.defer_working_time_recalculation', true), 'off') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  old_person_id := case when tg_op in ('UPDATE', 'DELETE') then old.person_id end;
  new_person_id := case when tg_op in ('INSERT', 'UPDATE') then new.person_id end;
  impact_start := least(
    case when tg_op in ('UPDATE', 'DELETE') then old.starts_at end,
    case when tg_op in ('INSERT', 'UPDATE') then new.starts_at end
  );
  impact_end := greatest(
    case when tg_op in ('UPDATE', 'DELETE') then old.ends_at end,
    case when tg_op in ('INSERT', 'UPDATE') then new.ends_at end
  );

  if impact_start is null then
    impact_start := case when tg_op = 'DELETE' then old.starts_at else new.starts_at end;
  end if;
  if impact_end is null then
    impact_end := case when tg_op = 'DELETE' then old.ends_at else new.ends_at end;
  end if;

  if old_person_id is not null and old_person_id is distinct from new_person_id then
    perform private.working_time_recalculate_person(old_person_id, impact_start, impact_end);
  end if;
  if new_person_id is not null then
    perform private.working_time_recalculate_person(new_person_id, impact_start, impact_end);
  elsif old_person_id is not null then
    perform private.working_time_recalculate_person(old_person_id, impact_start, impact_end);
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

alter function public.commit_working_time_import(bigint)
  rename to commit_working_time_import_unbatched;

revoke all on function public.commit_working_time_import_unbatched(bigint)
  from public, anon, authenticated;

create or replace function public.commit_working_time_import(p_batch_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '60s'
as $$
declare
  target_person_id bigint;
  import_result jsonb;
begin
  select batch.selected_person_id
  into target_person_id
  from public.working_time_import_batches batch
  where batch.id = p_batch_id;

  perform set_config('seapilot.defer_working_time_recalculation', 'on', true);
  import_result := public.commit_working_time_import_unbatched(p_batch_id);
  perform set_config('seapilot.defer_working_time_recalculation', 'off', true);

  if target_person_id is not null then
    perform private.working_time_recalculate_person(target_person_id, null, null);
  end if;

  return import_result;
end;
$$;

alter function public.preview_working_time_import(bigint,bigint,integer,text,text,text,jsonb,jsonb)
  set statement_timeout = '30s';

revoke all on function public.commit_working_time_import(bigint)
  from public, anon, authenticated;
grant execute on function public.commit_working_time_import(bigint)
  to authenticated;

comment on function public.commit_working_time_import(bigint) is
  'Commits one approved XLSM batch atomically, defers interval recalculation, then rebuilds authoritative rolling windows once.';
