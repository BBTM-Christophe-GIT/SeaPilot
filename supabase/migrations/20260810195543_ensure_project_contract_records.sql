create or replace function public.ensure_project_contract_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.project_contracts (
    company_id,
    project_id,
    source_label,
    created_by,
    updated_by
  ) values (
    new.company_id,
    new.id,
    'seapilot',
    new.created_by,
    new.updated_by
  )
  on conflict (project_id, company_id) do nothing;

  return new;
end;
$$;

revoke all on function public.ensure_project_contract_after_insert()
  from public, anon, authenticated;

comment on function public.ensure_project_contract_after_insert() is
  'Maintains the invariant that every catalog project has one structured contract record.';

drop trigger if exists projects_ensure_contract_after_insert on public.projects;
create trigger projects_ensure_contract_after_insert
after insert on public.projects
for each row
execute function public.ensure_project_contract_after_insert();

insert into public.project_contracts (
  company_id,
  project_id,
  source_label,
  created_by,
  updated_by
)
select
  project.company_id,
  project.id,
  'seapilot',
  project.created_by,
  project.updated_by
from public.projects project
where project.archived_at is null
on conflict (project_id, company_id) do nothing;
