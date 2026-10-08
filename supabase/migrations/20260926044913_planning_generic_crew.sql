-- Draft positions belong to a watch group, never to the HR/person/account catalog.
create table public.planning_generic_crew_rows (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  vessel_id bigint not null references public.vessels(id) on delete cascade,
  watch_group text not null check (length(trim(watch_group)) between 1 and 120),
  function_label text not null check (length(trim(function_label)) between 1 and 120),
  periods jsonb not null default '[]'::jsonb check (jsonb_typeof(periods) = 'array'),
  revision integer not null default 1,
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid()
);
create index planning_generic_crew_company_vessel_idx on public.planning_generic_crew_rows(company_id,vessel_id);
alter table public.planning_generic_crew_rows enable row level security;
revoke all on public.planning_generic_crew_rows from public, anon, authenticated;
grant select on public.planning_generic_crew_rows to authenticated;
create policy generic_crew_read on public.planning_generic_crew_rows for select to authenticated using (
  company_id = public.current_planning_company_id()
  and public.has_company_role(company_id,array['admin','direction','armement'])
);

create function public.planning_save_generic_crew_row(
  p_vessel_id bigint, p_watch_group text, p_function_label text,
  p_row_id bigint default null, p_expected_revision integer default null, p_periods jsonb default '[]'::jsonb
) returns public.planning_generic_crew_rows
language plpgsql security definer set search_path = '' as $$
declare
  target_company bigint := public.current_planning_company_id();
  saved public.planning_generic_crew_rows;
  period jsonb;
begin
  if auth.uid() is null or not public.has_company_role(target_company,array['admin','direction','armement'])
    or not public.planning_user_can('edit_event',target_company,p_vessel_id,null,null) then
    raise exception 'Accès refusé aux bordées génériques.' using errcode='42501';
  end if;
  if not exists(select 1 from public.vessels where id=p_vessel_id and company_id=target_company) then
    raise exception 'Navire introuvable.' using errcode='P0002';
  end if;
  if p_periods is null or jsonb_typeof(p_periods)<>'array' or jsonb_array_length(p_periods)>500 then
    raise exception 'Liste de périodes invalide.' using errcode='22023';
  end if;
  for period in select value from jsonb_array_elements(p_periods) loop
    if jsonb_typeof(period)<>'object' or coalesce(period->>'id','')=''
      or coalesce(period->>'startsOn','') !~ '^\d{4}-\d{2}-\d{2}$'
      or coalesce(period->>'endsOn','') !~ '^\d{4}-\d{2}-\d{2}$'
      or (period->>'endsOn')::date < (period->>'startsOn')::date
      or coalesce(period->>'status','') not in ('En Mer','A Terre','Extra','Repos','Vacance','Arrêt Maladie','Arrêt de travail','Formation')
      or length(coalesce(period->>'comments',''))>5000 then
      raise exception 'Dates ou statut de la période invalides.' using errcode='22023';
    end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_periods) with ordinality a(value,n)
    join jsonb_array_elements(p_periods) with ordinality b(value,n) on a.n<b.n
    where a.value->>'id'=b.value->>'id' or (
      (a.value->>'startsOn')::date <= (b.value->>'endsOn')::date and
      (b.value->>'startsOn')::date <= (a.value->>'endsOn')::date)) then
    raise exception 'Les périodes du poste fictif ne peuvent pas se chevaucher.' using errcode='22023';
  end if;
  if p_row_id is null then
    insert into public.planning_generic_crew_rows(company_id,vessel_id,watch_group,function_label,periods)
    values(target_company,p_vessel_id,trim(p_watch_group),trim(p_function_label),p_periods) returning * into saved;
  else
    update public.planning_generic_crew_rows set periods=p_periods,revision=revision+1
    where id=p_row_id and company_id=target_company and revision=p_expected_revision
      and vessel_id=p_vessel_id and watch_group=p_watch_group and function_label=p_function_label returning * into saved;
    if not found then raise exception 'Ce poste a changé. Actualisez le planning avant de réessayer.' using errcode='40001'; end if;
  end if;
  return saved;
end;
$$;

-- In one transaction, create the real row and assignments, then remove the draft.
-- All existing assignment triggers (company, locks, controls, audit) still execute.
create function public.planning_resolve_generic_crew_row(
  p_row_id bigint, p_expected_revision integer, p_person_id bigint default null, p_reference_month date default null
) returns bigint language plpgsql security definer set search_path = '' as $$
declare
  target public.planning_generic_crew_rows;
  person public.people;
  period jsonb;
  saved_id bigint;
begin
  select * into target from public.planning_generic_crew_rows
  where id=p_row_id and company_id=public.current_planning_company_id() for update;
  if not found then raise exception 'Poste fictif introuvable. Actualisez le planning.' using errcode='P0002'; end if;
  if auth.uid() is null or not public.has_company_role(target.company_id,array['admin','direction','armement'])
    or not public.planning_user_can('edit_event',target.company_id,target.vessel_id,null,null) then
    raise exception 'Accès refusé aux bordées génériques.' using errcode='42501';
  end if;
  if p_expected_revision is distinct from target.revision then
    raise exception 'Ce poste a changé. Actualisez le planning avant de réessayer.' using errcode='40001';
  end if;
  if p_person_id is null then
    if jsonb_array_length(target.periods)>0 then raise exception 'Supprimez les périodes avant de retirer ce poste.' using errcode='22023'; end if;
  else
    select * into person from public.people where id=p_person_id and company_id=target.company_id for update;
    if not found then raise exception 'Marin introuvable.' using errcode='P0002'; end if;
    saved_id := public.add_planning_board_row_for_month(target.vessel_id,target.watch_group,p_person_id,p_reference_month);
    for period in select value from jsonb_array_elements(target.periods) loop
      if (person.hired_on is not null and (period->>'startsOn')::date < person.hired_on)
        or (person.departed_on is not null and (period->>'endsOn')::date > person.departed_on) then
        raise exception 'Une période préparée est hors de la période d’emploi de ce marin.' using errcode='22023';
      end if;
      if exists(select 1 from public.planning_assignments a where a.company_id=target.company_id
        and a.crew_person_id=p_person_id and a.confirmation_status<>'cancelled'
        and a.starts_on<=(period->>'endsOn')::date and a.ends_on>=(period->>'startsOn')::date) then
        raise exception 'Ce marin possède déjà une affectation sur les dates préparées. Le poste fictif est conservé.' using errcode='23505';
      end if;
      insert into public.planning_assignments(company_id,vessel_id,crew_person_id,starts_on,ends_on,
        assignment_role,status_label,confirmation_status,watch_group,comments,source_label)
      values(target.company_id,target.vessel_id,p_person_id,(period->>'startsOn')::date,(period->>'endsOn')::date,
        target.function_label,period->>'status','confirmed',target.watch_group,nullif(period->>'comments',''),'seapilot');
    end loop;
  end if;
  delete from public.planning_generic_crew_rows where id=target.id;
  return saved_id;
end;
$$;
revoke all on function public.planning_save_generic_crew_row(bigint,text,text,bigint,integer,jsonb) from public, anon;
revoke all on function public.planning_resolve_generic_crew_row(bigint,integer,bigint,date) from public, anon;
grant execute on function public.planning_save_generic_crew_row(bigint,text,text,bigint,integer,jsonb) to authenticated;
grant execute on function public.planning_resolve_generic_crew_row(bigint,integer,bigint,date) to authenticated;
