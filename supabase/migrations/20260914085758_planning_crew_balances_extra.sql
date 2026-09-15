-- A checkpoint is the balance at END of day. Subsequent days are calculated
-- from the planning, not materialized, so corrections immediately propagate.
create table public.planning_crew_balance_checkpoints (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id),
  person_id bigint not null references public.people(id),
  as_of date not null check (isfinite(as_of)),
  balance numeric(10,2) not null check (balance between -99999999.99 and 99999999.99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) default auth.uid(),
  unique (company_id, person_id, as_of)
);
create index planning_crew_balance_person_idx on public.planning_crew_balance_checkpoints(person_id, as_of);
create index planning_crew_balance_author_idx on public.planning_crew_balance_checkpoints(updated_by);
alter table public.planning_crew_balance_checkpoints enable row level security;
revoke all on public.planning_crew_balance_checkpoints from public, anon, authenticated;
grant select on public.planning_crew_balance_checkpoints to authenticated;
grant insert (company_id, person_id, as_of, balance), update (balance) on public.planning_crew_balance_checkpoints to authenticated;
grant usage on sequence public.planning_crew_balance_checkpoints_id_seq to authenticated;
create policy crew_balance_read on public.planning_crew_balance_checkpoints for select to authenticated
using (public.planning_can_read_row(company_id, null, person_id, as_of, as_of));
create policy crew_balance_insert on public.planning_crew_balance_checkpoints for insert to authenticated
with check (public.planning_user_can('edit_event', company_id, null, as_of, as_of)
  and exists (select 1 from public.people p where p.id = person_id and p.company_id = planning_crew_balance_checkpoints.company_id));
create policy crew_balance_update on public.planning_crew_balance_checkpoints for update to authenticated
using (public.planning_user_can('edit_event', company_id, null, as_of, as_of))
with check (public.planning_user_can('edit_event', company_id, null, as_of, as_of));

create function public.stamp_planning_crew_balance() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  new.updated_at := now(); new.updated_by := auth.uid();
  return new;
end;
$$;
revoke all on function public.stamp_planning_crew_balance() from public, anon, authenticated;
create trigger stamp_planning_crew_balance before insert or update on public.planning_crew_balance_checkpoints
for each row execute function public.stamp_planning_crew_balance();

create function public.save_planning_crew_balance(p_person_id bigint, p_as_of date, p_balance numeric)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare target_company bigint;
begin
  if p_as_of is null or not isfinite(p_as_of) or p_balance is null
     or p_balance not between -99999999.99 and 99999999.99 or p_balance <> round(p_balance, 2) then
    raise exception 'Date ou solde invalide.';
  end if;
  select company_id into target_company from public.people where id = p_person_id;
  if target_company is null or not public.planning_user_can('edit_event', target_company, null, p_as_of, p_as_of) then
    raise exception 'Droits insuffisants pour modifier un solde équipage.' using errcode = '42501';
  end if;
  insert into public.planning_crew_balance_checkpoints (company_id, person_id, as_of, balance)
  values (target_company, p_person_id, p_as_of, p_balance)
  on conflict (company_id, person_id, as_of) do update set balance = excluded.balance;
end;
$$;
revoke all on function public.save_planning_crew_balance(bigint,date,numeric) from public, anon;
grant execute on function public.save_planning_crew_balance(bigint,date,numeric) to authenticated;

-- Return one JSON value so the API row cap cannot truncate the overview.
-- The original RPC checks the scope, and the join additionally obeys RLS.
create function public.planning_assignment_overview_with_revisions() returns jsonb
language sql stable security invoker set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(a) || jsonb_build_object('updated_at', p.updated_at) order by a.id), '[]'::jsonb)
  from public.planning_assignment_overview() a join public.planning_assignments p on p.id = a.id;
$$;
revoke all on function public.planning_assignment_overview_with_revisions() from public, anon;
grant execute on function public.planning_assignment_overview_with_revisions() to authenticated;

do $migration$
declare signature regprocedure; previous text; next text;
begin
  foreach signature in array array[
    'public.save_planning_assignment_day_state(bigint,date,text,text)'::regprocedure,
    'public.apply_planning_grid_cells(jsonb)'::regprocedure
  ] loop
    select pg_get_functiondef(signature) into previous;
    next := replace(previous,
      $$('En Mer', 'A Terre', 'Vacance', 'Repos', 'Arrêt Maladie', 'Accident du Travail')$$,
      $$('En Mer', 'A Terre', 'Extra', 'Formation', 'Vacance', 'Repos', 'Arrêt Maladie', 'Accident du Travail')$$);
    if next = previous then raise exception 'Expected status validation missing in %', signature; end if;
    execute next;
  end loop;
end;
$migration$;

-- Future immutable releases carry the same revision priority as the live grid.
do $migration$
declare previous text; next text;
begin
  select pg_get_functiondef('public.planning_release_snapshot(bigint)'::regprocedure) into previous;
  next := replace(previous, 'assignment.source_label', 'assignment.source_label, assignment.updated_at');
  if next = previous then raise exception 'Expected release assignment projection missing'; end if;
  execute next;
end;
$migration$;
