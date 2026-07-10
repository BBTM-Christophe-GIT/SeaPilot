create table if not exists public.role_module_permissions (
  role_key text not null references public.roles(key) on delete cascade,
  module_key text not null,
  is_visible boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  primary key (role_key, module_key)
);

with module_defaults (module_key, allowed_roles) as (
  values
    ('home', array['admin', 'direction', 'armement', 'capitaine', 'marin']::text[]),
    ('kpi', array['admin', 'direction', 'armement', 'capitaine', 'marin']::text[]),
    ('qhse', array['admin', 'direction', 'armement', 'capitaine', 'marin']::text[]),
    ('certificates', array['admin', 'direction', 'armement', 'capitaine', 'marin']::text[]),
    ('procedures', array['admin', 'direction', 'armement', 'capitaine', 'marin']::text[]),
    ('actionPlan', array['admin', 'direction', 'armement', 'capitaine', 'marin']::text[]),
    ('dpr', array['admin', 'direction', 'armement', 'capitaine', 'marin']::text[]),
    ('purchaseRequests', array['admin', 'direction', 'armement', 'capitaine', 'marin']::text[]),
    ('planning', array['admin', 'direction', 'armement', 'capitaine', 'marin']::text[]),
    ('humanResources', array['admin', 'direction', 'armement', 'capitaine', 'marin']::text[]),
    ('projects', array['admin', 'direction']::text[]),
    ('admin', array['admin']::text[])
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

create index if not exists role_module_permissions_module_key_idx
  on public.role_module_permissions (module_key);

grant select, insert, update, delete on public.role_module_permissions to authenticated;

alter table public.role_module_permissions enable row level security;

create policy role_module_permissions_authenticated_read on public.role_module_permissions
  for select to authenticated
  using (true);

create policy role_module_permissions_admin_write on public.role_module_permissions
  for all to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

comment on table public.role_module_permissions is
  'Administrator-managed visibility and route access for SeaPilot navigation modules by role.';
