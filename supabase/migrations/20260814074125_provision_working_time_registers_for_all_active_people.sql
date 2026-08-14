-- Every active HR profile owns a current monthly working-time register.
-- Register provisioning is deliberately independent from account linkage and roles:
-- an HR profile can exist before its SeaPilot account is created or assigned a role.

create or replace function public.working_time_ensure_current_register_for_person(target_person_id bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_person public.people%rowtype;
  target_start date := date_trunc('month', current_date)::date;
  target_end date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
  saved_id bigint;
begin
  select *
  into target_person
  from public.people person
  where person.id = target_person_id;

  if target_person.id is null or not target_person.active then
    return null;
  end if;

  insert into public.working_time_registers (
    company_id,
    person_id,
    period_kind,
    period_start,
    period_end,
    created_by,
    updated_by
  ) values (
    target_person.company_id,
    target_person.id,
    'monthly',
    target_start,
    target_end,
    null,
    null
  )
  on conflict (company_id, person_id, period_kind, period_start, period_end)
  do update set
    discarded_at = null,
    discarded_by = null,
    discard_reason = null,
    updated_at = case
      when public.working_time_registers.discarded_at is null
        then public.working_time_registers.updated_at
      else clock_timestamp()
    end
  returning id into saved_id;

  return saved_id;
end;
$$;

comment on function public.working_time_ensure_current_register_for_person(bigint) is
  'Idempotently provisions the current monthly register for any active HR profile, including profiles without a linked account.';

-- Role assignment is no longer part of register provisioning. The people trigger
-- remains the single source of automation for new and reactivated HR profiles.
drop trigger if exists working_time_role_register on public.user_roles;
drop function if exists public.working_time_role_register_trigger();

insert into public.working_time_registers (
  company_id,
  person_id,
  period_kind,
  period_start,
  period_end,
  created_by,
  updated_by
)
select
  person.company_id,
  person.id,
  'monthly',
  date_trunc('month', current_date)::date,
  (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
  null,
  null
from public.people person
where person.active
on conflict (company_id, person_id, period_kind, period_start, period_end)
do update set
  discarded_at = null,
  discarded_by = null,
  discard_reason = null,
  updated_at = case
    when public.working_time_registers.discarded_at is null
      then public.working_time_registers.updated_at
    else clock_timestamp()
  end;

revoke all on function public.working_time_ensure_current_register_for_person(bigint)
  from public, anon, authenticated;
