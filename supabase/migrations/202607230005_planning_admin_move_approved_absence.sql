-- Planning v3.6.7
-- Allow administrators to move an approved leave period without reopening it.

create or replace function public.move_planning_approved_absence(
  p_absence_id bigint,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.planning_absences%rowtype;
begin
  if not public.has_role('admin') then
    raise exception using errcode = '42501', message = 'PLANNING_PERMISSION_DENIED: déplacement vacances validées.';
  end if;

  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception using errcode = '22023', message = 'PLANNING_ABSENCE_INVALID: période incohérente.';
  end if;

  select absence.* into target
  from public.planning_absences absence
  where absence.id = p_absence_id
    and absence.company_id = public.current_planning_company_id()
  for update;

  if target.id is null then
    raise exception using errcode = 'P0002', message = 'PLANNING_ABSENCE_NOT_FOUND';
  end if;

  if target.status <> 'approved' or target.absence_type <> 'leave' then
    raise exception using errcode = '42501', message = 'PLANNING_APPROVED_LEAVE_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target.company_id::text || ':absence:' || target.person_id::text, 0));

  if exists (
    select 1
    from public.planning_absences absence
    where absence.company_id = target.company_id
      and absence.person_id = target.person_id
      and absence.id <> target.id
      and absence.status in ('requested', 'approved')
      and absence.starts_at < p_ends_at
      and absence.ends_at > p_starts_at
  ) then
    raise exception using errcode = '23P01', message = 'PLANNING_ABSENCE_OVERLAP';
  end if;

  update public.planning_absences
  set starts_at = p_starts_at,
      ends_at = p_ends_at,
      updated_by = auth.uid(),
      updated_at = now()
  where id = target.id
    and company_id = target.company_id;

  return target.id;
end;
$$;

revoke all on function public.move_planning_approved_absence(bigint, timestamptz, timestamptz) from public, anon;
grant execute on function public.move_planning_approved_absence(bigint, timestamptz, timestamptz) to authenticated;

comment on function public.move_planning_approved_absence(bigint, timestamptz, timestamptz) is
  'Moves an approved leave period for an administrator while preserving approval state and audit history.';
