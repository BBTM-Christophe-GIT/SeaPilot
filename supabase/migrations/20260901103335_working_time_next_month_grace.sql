-- Keep manual working-time entry open through the fifth calendar day of the
-- following month. Submitted days remain available to their approver so that
-- the validation and non-compliance workflow is never blocked by the cutoff.

create or replace function public.working_time_entry_date_is_open(
  p_local_work_date date,
  p_reference_date date
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_local_work_date is not null
    and p_reference_date is not null
    and p_reference_date <= (
      date_trunc('month', p_local_work_date)::date
      + interval '1 month 4 days'
    )::date;
$$;

create or replace function public.working_time_actor_can_edit_day(
  p_register_id bigint,
  p_local_work_date date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.working_time_registers register
    join public.people subject
      on subject.id = register.person_id
     and subject.company_id = register.company_id
    left join public.working_time_day_approvals approval
      on approval.register_id = register.id
     and approval.local_work_date = p_local_work_date
    left join public.people actor
      on actor.id = public.current_person_id()
     and actor.company_id = register.company_id
    where register.id = p_register_id
      and public.user_belongs_to_company(register.company_id)
      and coalesce(approval.status, 'draft') <> 'validated'
      and (
        approval.status = 'submitted'
        or session_user = 'postgres'
        or public.working_time_entry_date_is_open(
          p_local_work_date,
          (timezone('Europe/Paris', statement_timestamp()))::date
        )
      )
      and (
        public.working_time_can_manage_entry_scope(register.company_id)
        or (
          approval.status = 'submitted'
          and approval.approver_person_id = actor.id
          and actor.function_label = 'Capitaine'
          and public.working_time_captain_matches_day(
            register.company_id,
            register.person_id,
            actor.id,
            p_local_work_date
          )
        )
        or (
          approval.id is null
          and register.person_id = actor.id
          and (
            actor.function_label = 'Capitaine'
            or public.has_company_role(register.company_id, array['marin', 'capitaine'])
          )
        )
        or (
          approval.id is null
          and actor.id <> register.person_id
          and actor.function_label = 'Capitaine'
          and public.working_time_captain_matches_day(
            register.company_id,
            register.person_id,
            actor.id,
            p_local_work_date
          )
        )
      )
  );
$$;

create or replace function public.working_time_day_approval_entry_window_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if session_user <> 'postgres'
    and new.status in ('submitted', 'validated')
    and not public.working_time_entry_date_is_open(
      new.local_work_date,
      (timezone('Europe/Paris', statement_timestamp()))::date
    ) then
    if tg_op = 'INSERT' then
      raise exception using errcode = '55000', message = 'WORKING_TIME_ENTRY_WINDOW_CLOSED.';
    elsif old.status not in ('submitted', 'validated') then
      raise exception using errcode = '55000', message = 'WORKING_TIME_ENTRY_WINDOW_CLOSED.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists working_time_day_approval_entry_window
on public.working_time_day_approvals;
create trigger working_time_day_approval_entry_window
before insert or update of status, local_work_date
on public.working_time_day_approvals
for each row execute function public.working_time_day_approval_entry_window_guard();

revoke all on function public.working_time_entry_date_is_open(date, date)
from public, anon, authenticated;
revoke all on function public.working_time_actor_can_edit_day(bigint, date)
from public, anon, authenticated;
revoke all on function public.working_time_day_approval_entry_window_guard()
from public, anon, authenticated;

comment on function public.working_time_entry_date_is_open(date, date) is
  'Returns true through the fifth day of the month following the supplied local work date.';
comment on function public.working_time_actor_can_edit_day(bigint, date) is
  'Allows authorised manual entry through the fifth day of the following month while keeping submitted-day approval available afterward.';
comment on function public.working_time_day_approval_entry_window_guard() is
  'Prevents a draft day from being submitted or directly validated after its manual-entry cutoff; existing submitted days may still be approved.';

notify pgrst, 'reload schema';
