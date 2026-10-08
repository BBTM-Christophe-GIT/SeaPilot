-- Crew see only the vessel on their own current, non-cancelled planning assignment.
-- Keep the existing company and confidential-report restrictions for every role.
create or replace function public.action_plan_current_vessel_scope()
returns bigint[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct assignment.vessel_id), '{}'::bigint[])
  from public.planning_assignments assignment
  where (select auth.uid()) is not null
    and assignment.company_id = public.current_planning_company_id()
    and assignment.crew_person_id = public.current_person_id()
    and assignment.confirmation_status <> 'cancelled'
    and (current_timestamp at time zone 'Europe/Paris')::date
      between assignment.starts_on and assignment.ends_on;
$$;

revoke all on function public.action_plan_current_vessel_scope() from public, anon;
grant execute on function public.action_plan_current_vessel_scope() to authenticated;

create or replace function public.action_item_user_can_read(target_action_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.action_items action
    where (select auth.uid()) is not null
      and action.id = target_action_id
      and action.company_id = public.current_planning_company_id()
      and (
        public.has_company_role(action.company_id, array['admin', 'direction', 'armement'])
        or not public.has_company_role(action.company_id, array['capitaine', 'marin'])
        or action.vessel_id = any(public.action_plan_current_vessel_scope())
      )
      and case
        when action.action_type_key = 'discrimination_human_rights' then
          action.issuer_person_id = public.current_person_id()
          or action.approver_person_id = public.current_person_id()
        else
          public.has_company_role(action.company_id, array['admin', 'direction', 'armement'])
          or public.has_company_role(action.company_id, array['capitaine', 'marin'])
          or action.issuer_person_id = public.current_person_id()
          or (action.approver_person_id = public.current_person_id() and action.workflow_status = 'pending_approval')
          or public.action_item_user_is_assignee(action.id)
      end
  );
$$;

revoke all on function public.action_item_user_can_read(bigint) from public, anon;
grant execute on function public.action_item_user_can_read(bigint) to authenticated;

comment on function public.action_item_user_can_read(bigint) is
  'Action plan access: company and confidentiality rules; Marin/Capitaine limited to their current non-cancelled vessel assignment unless they also hold a management role.';
