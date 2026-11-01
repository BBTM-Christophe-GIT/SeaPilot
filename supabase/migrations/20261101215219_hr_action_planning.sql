-- Shared appointments do not change document validity or annual review evidence.
create table public.hr_action_plans (
  id bigint generated always as identity primary key,
  company_id bigint not null default public.current_planning_company_id() references public.companies(id) on delete cascade,
  person_id bigint not null references public.people(id) on delete cascade,
  document_id bigint references public.hr_documents(id) on delete set null,
  kind text not null check (kind in ('certificate', 'medical_visit', 'training', 'annual_review')),
  title text not null check (length(btrim(title)) between 1 and 300),
  status text not null default 'planned' check (status in ('planned', 'completed', 'cancelled')),
  due_on date,
  scheduled_on date,
  completed_on date,
  location text not null default '' check (length(location) <= 500),
  owner_name text not null default '' check (length(owner_name) <= 200),
  notes text not null default '' check (length(notes) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_action_plans_completion_check check (
    (status = 'completed' and completed_on is not null) or
    (status <> 'completed' and completed_on is null)
  ),
  constraint hr_action_plans_booking_check check (
    status <> 'planned' or (scheduled_on is not null and length(btrim(location)) > 0)
  )
);

create index hr_action_plans_company_person_idx on public.hr_action_plans(company_id, person_id, id);
create index hr_action_plans_document_idx on public.hr_action_plans(document_id) where document_id is not null;

-- A document link may never identify a different employee/company. Run as invoker:
-- access checks below use exactly the same protected people/documents as the UI.
create function public.check_hr_action_plan_scope()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.people p where p.id = new.person_id and p.company_id = new.company_id) then
    raise exception 'HR_ACTION_PERSON_SCOPE' using errcode = '23514';
  end if;
  if new.document_id is not null and not exists (
    select 1 from public.hr_documents d where d.id = new.document_id
      and d.person_id = new.person_id and d.company_id = new.company_id
  ) then
    raise exception 'HR_ACTION_DOCUMENT_SCOPE' using errcode = '23514';
  end if;
  if new.status = 'completed' and new.completed_on > (now() at time zone 'Europe/Paris')::date then
    raise exception 'HR_ACTION_FUTURE_COMPLETION' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.check_hr_action_plan_scope() from public, anon;
grant execute on function public.check_hr_action_plan_scope() to authenticated, service_role;
create trigger hr_action_plans_check before insert or update on public.hr_action_plans
  for each row execute function public.check_hr_action_plan_scope();

revoke all on public.hr_action_plans from anon, authenticated;
grant select, insert, update, delete on public.hr_action_plans to authenticated;
grant all on public.hr_action_plans to service_role;
grant usage, select on sequence public.hr_action_plans_id_seq to authenticated, service_role;
alter table public.hr_action_plans enable row level security;

create policy hr_action_plans_read on public.hr_action_plans for select to authenticated
using (
  company_id = (select public.current_planning_company_id())
  and (kind <> 'annual_review'
    or person_id = (select public.current_person_id())
    or (select public.has_any_role(array['admin', 'direction']))) and (
    (select public.has_any_role(array['admin', 'direction', 'armement']))
    or person_id = (select public.current_person_id())
    or ((select public.has_role('capitaine')) and public.captain_shares_watch_with_person(company_id, person_id))
  )
);
create policy hr_action_plans_insert on public.hr_action_plans for insert to authenticated
with check (
  company_id = (select public.current_planning_company_id())
  and ((select public.has_any_role(array['admin', 'direction']))
    or (kind <> 'annual_review' and (select public.has_role('armement'))))
);
create policy hr_action_plans_update on public.hr_action_plans for update to authenticated
using (
  company_id = (select public.current_planning_company_id())
  and ((select public.has_any_role(array['admin', 'direction']))
    or (kind <> 'annual_review' and (select public.has_role('armement'))))
)
with check (
  company_id = (select public.current_planning_company_id())
  and ((select public.has_any_role(array['admin', 'direction']))
    or (kind <> 'annual_review' and (select public.has_role('armement'))))
);
create policy hr_action_plans_delete on public.hr_action_plans for delete to authenticated
using (
  company_id = (select public.current_planning_company_id())
  and ((select public.has_any_role(array['admin', 'direction']))
    or (kind <> 'annual_review' and (select public.has_role('armement'))))
);
