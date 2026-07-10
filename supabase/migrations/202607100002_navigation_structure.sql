with module_defaults (module_key, allowed_roles) as (
  values
    ('workingTime', array['admin', 'direction', 'armement', 'capitaine', 'marin']::text[]),
    ('marad', array['admin', 'direction', 'armement', 'capitaine', 'marin']::text[]),
    ('technicalDocuments', array['admin', 'direction', 'armement', 'capitaine', 'marin']::text[]),
    ('lifting', array['admin', 'direction', 'armement', 'capitaine', 'marin']::text[])
),
configured_permissions as (
  select
    roles.key as role_key,
    module_defaults.module_key,
    roles.key = any(module_defaults.allowed_roles) as is_visible
  from public.roles
  cross join module_defaults
)
insert into public.role_module_permissions (role_key, module_key, is_visible)
select role_key, module_key, is_visible
from configured_permissions
on conflict (role_key, module_key) do nothing;

comment on table public.role_module_permissions is
  'Administrator-managed visibility and route access for the SeaPilot menu and submenu structure.';
