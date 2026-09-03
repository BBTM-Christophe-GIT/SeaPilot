-- A monthly register stays in the legacy "draft" state while its individual
-- days move through the daily approval workflow. The former discard RPC only
-- checked the monthly status, so the roster X action could physically delete
-- already recorded, submitted or validated hours. Only truly empty registers
-- may now be discarded.

create or replace function public.discard_working_time_draft(p_register_id bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_register public.working_time_registers%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: authentification requise.';
  end if;

  select * into target_register
  from public.working_time_registers register
  where register.id = p_register_id
  for update;

  if target_register.id is null
    or not public.user_belongs_to_company(target_register.company_id) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: registre.';
  end if;

  if target_register.status <> 'draft'
    or exists (
      select 1
      from public.working_time_validations validation
      where validation.register_id = target_register.id
    )
    or exists (
      select 1
      from public.working_time_day_approvals approval
      where approval.register_id = target_register.id
    )
    or exists (
      select 1
      from public.working_time_intervals work_interval
      where work_interval.register_id = target_register.id
    )
    or exists (
      select 1
      from public.working_time_day_comments day_comment
      where day_comment.register_id = target_register.id
    ) then
    raise exception using errcode = '55000', message = 'WORKING_TIME_DRAFT_DISCARD_FORBIDDEN.';
  end if;

  if not (
    public.working_time_can_manage_entry_scope(target_register.company_id)
    or target_register.person_id = public.current_person_id()
    or public.working_time_captain_can_access_period(
      target_register.company_id,
      target_register.person_id,
      target_register.period_start,
      target_register.period_end
    )
  ) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: suppression du brouillon.';
  end if;

  update public.working_time_registers
  set discarded_at = clock_timestamp(),
      discarded_by = (select auth.uid()),
      discard_reason = 'Brouillon vide abandonne',
      updated_by = (select auth.uid()),
      updated_at = now()
  where id = target_register.id;

  return target_register.id;
end;
$$;

revoke all on function public.discard_working_time_draft(bigint)
from public, anon, authenticated;
grant execute on function public.discard_working_time_draft(bigint)
to authenticated;

comment on function public.discard_working_time_draft(bigint) is
  'Hides only a truly empty draft register; recorded intervals, comments, daily approvals and validation evidence are never deleted.';

notify pgrst, 'reload schema';
