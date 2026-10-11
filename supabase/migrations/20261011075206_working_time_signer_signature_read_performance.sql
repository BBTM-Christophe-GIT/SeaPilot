-- A signature guard must check only registers that actually name its signer.
-- PostgreSQL may otherwise evaluate the expensive Captain permission helper
-- before the proof predicate for every unrelated register in the company.
create or replace function public.working_time_can_read_signature(target_signature_id bigint)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_signature public.working_time_profile_signatures%rowtype;
  actor_person_id bigint;
begin
  if (select auth.uid()) is null then
    return false;
  end if;
  select * into target_signature from public.working_time_profile_signatures
    where id = target_signature_id;
  if target_signature.id is null or not public.user_belongs_to_company(target_signature.company_id) then
    return false;
  end if;
  actor_person_id := public.current_person_id();
  if target_signature.person_id = actor_person_id
    or public.has_company_role(target_signature.company_id, array['admin', 'direction', 'armement']) then
    return true;
  end if;
  if exists (
    select 1 from public.working_time_registers register
    where register.company_id = target_signature.company_id
      and register.person_id = target_signature.person_id
      and public.working_time_captain_can_access_period(
        register.company_id, register.person_id, register.period_start, register.period_end
      )
  ) then
    return true;
  end if;
  return exists (
    with evidence_registers as materialized (
      select register.id from public.working_time_registers register
      where register.company_id = target_signature.company_id
        and (
          register.requested_captain_person_id = target_signature.person_id
          or exists (
            select 1 from public.working_time_validations validation
            where validation.company_id = register.company_id
              and validation.register_id = register.id
              and validation.person_id = register.person_id
              and validation.event_type = 'captain_validated'
              and (
                validation.actor_person_id = target_signature.person_id
                or validation.signature_snapshot->>'signer_person_id' = target_signature.person_id::text
              )
          )
          or exists (
            select 1 from public.working_time_day_approvals approval
            where approval.company_id = register.company_id
              and approval.register_id = register.id
              and approval.person_id = register.person_id
              and (
                approval.approver_person_id = target_signature.person_id
                or (
                  approval.status = 'validated'
                  and (
                    approval.validated_by_person_id = target_signature.person_id
                    or approval.approver_signature_snapshot->>'signer_person_id' = target_signature.person_id::text
                  )
                )
              )
          )
        )
    )
    select 1 from evidence_registers evidence
    where public.working_time_can_read_register(evidence.id)
  );
end;
$$;

revoke all on function public.working_time_can_read_signature(bigint) from public, anon;
grant execute on function public.working_time_can_read_signature(bigint) to authenticated;

notify pgrst, 'reload schema';
