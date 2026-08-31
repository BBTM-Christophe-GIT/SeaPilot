with module_default as (
  select
    role.key as role_key,
    'billingElements'::text as module_key,
    role.key = any(array['admin', 'direction']::text[]) as is_visible
  from public.roles role
)
insert into public.role_module_permissions (role_key, module_key, is_visible)
select role_key, module_key, is_visible
from module_default
on conflict (role_key, module_key) do update
set is_visible = excluded.is_visible,
    updated_at = now();

comment on table public.role_module_permissions is
  'Administrator-managed visibility and route access for SeaPilot navigation modules by role, including billing elements.';
