-- Editable company salary reference. Annual source columns are kept as given;
-- monthly contract salary is the selected last annual column divided by twelve.
create function public.hr_validate_salary_grid_rows(p_rows jsonb)
returns void language plpgsql immutable security invoker set search_path='' as $$
declare item jsonb; field_name text; numeric_value numeric; identifiers text[]:=array[]::text[];
begin
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 100
    or octet_length(p_rows::text)>200000 then
    raise exception 'La grille doit contenir entre 1 et 100 postes.' using errcode='22023';
  end if;
  for item in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(item) is distinct from 'object' or not (item ?& array['id','positionLabel','ccn','enimCategory','conventionalAnnualBase','indexationPercent','annualGross','annualPremium','totalAnnualBase','active'])
      or exists(select 1 from jsonb_object_keys(item) k where k not in ('id','positionLabel','ccn','enimCategory','conventionalAnnualBase','indexationPercent','annualGross','annualPremium','totalAnnualBase','active')) then
      raise exception 'Les colonnes de la grille sont invalides.' using errcode='22023';
    end if;
    if jsonb_typeof(item->'id')<>'string' or item->>'id' !~ '^[a-z0-9][a-z0-9_-]{0,79}$' or item->>'id'=any(identifiers)
      or jsonb_typeof(item->'active')<>'boolean' then
      raise exception 'Chaque poste doit avoir un identifiant stable unique et un état valide.' using errcode='22023';
    end if;
    identifiers:=array_append(identifiers,item->>'id');
    foreach field_name in array array['positionLabel','ccn','enimCategory'] loop
      if jsonb_typeof(item->field_name)<>'string' or length(btrim(item->>field_name)) not between 1 and (case when field_name='positionLabel' then 500 else 120 end) then
        raise exception 'Les libellés du poste, de la CCN et de la catégorie ENIM sont obligatoires.' using errcode='22023';
      end if;
    end loop;
    foreach field_name in array array['conventionalAnnualBase','indexationPercent','annualGross','annualPremium','totalAnnualBase'] loop
      if jsonb_typeof(item->field_name)<>'number' then
        raise exception 'Les montants et taux doivent être numériques.' using errcode='22023';
      end if;
      numeric_value:=(item->>field_name)::numeric;
      if numeric_value<0 or numeric_value>(case when field_name='indexationPercent' then 1000 else 100000000 end)
        or round(numeric_value,2)<>numeric_value then
        raise exception 'Les montants et taux doivent être positifs ou nuls, avec deux décimales au maximum.' using errcode='22023';
      end if;
    end loop;
  end loop;
end $$;
revoke all on function public.hr_validate_salary_grid_rows(jsonb) from public,anon;
grant execute on function public.hr_validate_salary_grid_rows(jsonb) to authenticated;

create table public.hr_salary_grids (
  company_id bigint primary key references public.companies(id) on delete cascade,
  rows jsonb not null,
  revision bigint not null default 1 check(revision>0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) default auth.uid()
);
create index hr_salary_grids_actor_idx on public.hr_salary_grids(updated_by);
alter table public.hr_salary_grids enable row level security;
revoke all on public.hr_salary_grids from public,anon,authenticated;
grant select,insert,update on public.hr_salary_grids to authenticated;
create policy hr_salary_grids_read on public.hr_salary_grids for select to authenticated
using(public.has_company_role(company_id,array['admin','direction']));
create policy hr_salary_grids_insert on public.hr_salary_grids for insert to authenticated
with check(public.has_company_role(company_id,array['admin','direction']));
create policy hr_salary_grids_update on public.hr_salary_grids for update to authenticated
using(public.has_company_role(company_id,array['admin','direction']))
with check(public.has_company_role(company_id,array['admin','direction']));

create function public.hr_salary_grid_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is not null and not public.has_company_role(new.company_id,array['admin','direction']) then
    raise exception 'La grille salariale est réservée à Administration et Direction.' using errcode='42501';
  end if;
  perform public.hr_validate_salary_grid_rows(new.rows);
  if tg_op='UPDATE' then
    if new.company_id<>old.company_id then raise exception 'Entreprise immuable.' using errcode='23514'; end if;
    if new.revision<>old.revision+1 then raise exception 'La grille a changé. Rechargez-la avant de l’enregistrer.' using errcode='40001'; end if;
  elsif new.revision<>1 then raise exception 'Révision initiale invalide.' using errcode='22023'; end if;
  new.updated_by:=auth.uid(); new.updated_at:=clock_timestamp();
  return new;
end $$;
revoke all on function public.hr_salary_grid_guard() from public,anon,authenticated;
create trigger hr_salary_grid_guard before insert or update on public.hr_salary_grids
for each row execute function public.hr_salary_grid_guard();

create function public.get_hr_salary_grid()
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare company bigint:=public.current_planning_company_id(); result jsonb;
begin
  if auth.uid() is null or not public.has_company_role(company,array['admin','direction']) then
    raise exception 'La grille salariale est réservée à Administration et Direction.' using errcode='42501';
  end if;
  select to_jsonb(g) into result from public.hr_salary_grids g where g.company_id=company;
  return coalesce(result,jsonb_build_object('company_id',company,'rows','[]'::jsonb,'revision',0,'updated_at',null));
end $$;
create function public.save_hr_salary_grid(p_rows jsonb,p_expected_revision bigint)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare company bigint:=public.current_planning_company_id(); saved public.hr_salary_grids%rowtype;
begin
  if auth.uid() is null or not public.has_company_role(company,array['admin','direction']) then
    raise exception 'La grille salariale est réservée à Administration et Direction.' using errcode='42501';
  end if;
  if p_expected_revision is null or p_expected_revision<0 then raise exception 'Révision invalide.' using errcode='22023'; end if;
  perform public.hr_validate_salary_grid_rows(p_rows);
  if p_expected_revision=0 then
    insert into public.hr_salary_grids(company_id,rows,revision) values(company,p_rows,1)
    on conflict(company_id) do nothing returning * into saved;
  else
    update public.hr_salary_grids set rows=p_rows,revision=revision+1
    where company_id=company and revision=p_expected_revision returning * into saved;
  end if;
  if saved.company_id is null then raise exception 'La grille a changé. Rechargez-la avant de l’enregistrer.' using errcode='40001'; end if;
  return to_jsonb(saved);
end $$;
revoke all on function public.get_hr_salary_grid() from public,anon;
revoke all on function public.save_hr_salary_grid(jsonb,bigint) from public,anon;
grant execute on function public.get_hr_salary_grid(),public.save_hr_salary_grid(jsonb,bigint) to authenticated;

-- Company salary references are confidential business data and are initialized
-- separately through an authenticated private import. Keep this public migration
-- schema-only; no employee/company salary values belong in the repository.

-- Salary-grid evidence is kept on each private RH contract record as strings,
-- alongside the monthly amount. Existing issued contract snapshots are untouched.
create or replace function public.patch_hr_employment_contract_details(p_person_id bigint,p_patch jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare target_company bigint:=public.current_planning_company_id(); result jsonb;
begin
  if auth.uid() is null or not public.has_company_role(target_company,array['admin','direction']) then
    raise exception 'Les données contractuelles sont réservées à Administration et Direction.' using errcode='42501';
  end if;
  if jsonb_typeof(p_patch) is distinct from 'object' or octet_length(p_patch::text)>10000 then
    raise exception 'Les informations du contrat sont invalides.' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_each(p_patch) field where field.key not in
    ('socialSecurityNumber','vesselNames','collectiveAgreement','grossMonthlySalary','endDate','employerRepresentative','salaryGridRowId','annualGrossSalary','salaryGridRevision')
    or jsonb_typeof(field.value)<>'string'
    or length(field.value #>> '{}')>(case when field.key in ('vesselNames','collectiveAgreement') then 1200 else 240 end)) then
    raise exception 'Champ contractuel inconnu ou valeur invalide.' using errcode='22023';
  end if;
  if not exists(select 1 from public.people p where p.id=p_person_id and p.company_id=target_company) then
    raise exception 'Fiche RH introuvable dans cette entreprise.' using errcode='42501';
  end if;
  insert into public.hr_employment_contract_details as details(person_id,company_id,input_data) values(p_person_id,target_company,p_patch)
  on conflict(person_id) do update set input_data=details.input_data || excluded.input_data returning input_data into result;
  return result;
end $$;
notify pgrst,'reload schema';
