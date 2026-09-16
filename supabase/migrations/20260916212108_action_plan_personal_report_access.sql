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
        or action.issuer_person_id = public.current_person_id()
        or public.action_item_user_is_assignee(action.id)
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
  'Action plan access: company and confidentiality rules; Marin/Capitaine see their current vessel and reports they authored or are responsible for, including other vessels; management retains company scope.';
