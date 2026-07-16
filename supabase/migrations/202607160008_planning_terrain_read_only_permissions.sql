-- Captains and sailors only read the latest release and request their own leave.
-- Remove legacy terrain write and governance capabilities from the matrix.

delete from public.planning_action_permissions
where role_key in ('capitaine', 'marin')
  and action_key in ('manage_conflict', 'manage_dependency', 'view_history');
