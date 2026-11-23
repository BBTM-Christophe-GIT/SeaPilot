-- Bind future RH end-date edits to the start of the employment period they describe.
create or replace function public.patch_hr_employment_contract_details(p_person_id bigint, p_patch jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  target_company bigint := public.current_planning_company_id();
  employment_start date;
  result jsonb;
begin
  if auth.uid() is null or not public.has_company_role(target_company, array['admin', 'direction']) then
    raise exception 'Les données contractuelles sont réservées à Administration et Direction.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_patch) is distinct from 'object' or octet_length(p_patch::text) > 10000 then
    raise exception 'Les informations du contrat sont invalides.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_each(p_patch) field
    where field.key not in (
      'socialSecurityNumber', 'vesselNames', 'collectiveAgreement', 'grossMonthlySalary', 'endDate',
      'employerRepresentative', 'salaryGridRowId', 'annualGrossSalary', 'salaryGridRevision'
    )
    or jsonb_typeof(field.value) <> 'string'
    or length(field.value #>> '{}') > case when field.key in ('vesselNames', 'collectiveAgreement') then 1200 else 240 end
  ) then
    raise exception 'Champ contractuel inconnu ou valeur invalide.' using errcode = '22023';
  end if;
  select p.hired_on into employment_start from public.people p
  where p.id = p_person_id and p.company_id = target_company;
  if not found then
    raise exception 'Fiche RH introuvable dans cette entreprise.' using errcode = '42501';
  end if;
  if p_patch ? 'endDate' then
    p_patch := p_patch || jsonb_build_object('endDateEmploymentStart', to_char(employment_start, 'YYYY-MM-DD'));
  end if;
  insert into public.hr_employment_contract_details as details (person_id, company_id, input_data)
  values (p_person_id, target_company, p_patch)
  on conflict (person_id) do update set input_data = details.input_data || excluded.input_data
  returning input_data - 'endDateEmploymentStart' into result;
  return result;
end;
$$;

create or replace function public.organigramme_snapshot_v4(p_chart_id bigint, p_as_of date default current_date)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with snapshot as materialized (
    select public.organigramme_snapshot_v3(p_chart_id, p_as_of) as data
  ), staff as (
    select card, position, nullif(btrim(person.contract_type), '') as contract_type,
      case when upper(btrim(person.contract_type)) = 'CDD' then
        coalesce(
          case when draft.date >= person.hired_on and (
            details.input_data->>'endDateEmploymentStart' = to_char(person.hired_on, 'YYYY-MM-DD')
            or (not (details.input_data ? 'endDateEmploymentStart') and not exists (
              select 1
              from jsonb_array_elements(person.employment_periods) with ordinality as period(value, number)
              where period.number < jsonb_array_length(person.employment_periods)
                and upper(btrim(period.value->>'contractType')) = 'CDD'
            ))
          ) then draft.date end,
          issued.date
        )
      end as cdd_end,
      -- Contract expiry is inclusive, while RH departure dates exclude the departure day.
      case when lower(btrim(person.departure_reason)) = 'fin de contrat'
        and (person.hired_on is null or person.departed_on > person.hired_on)
        then person.departed_on - 1
      end as recorded_end
    from snapshot
    cross join lateral jsonb_array_elements(snapshot.data->'people') with ordinality as people(card, position)
    join public.people person on person.id = (people.card->>'id')::bigint
      and person.company_id = public.current_planning_company_id()
    left join public.hr_employment_contract_details details
      on details.person_id = person.id and details.company_id = person.company_id
    cross join lateral (
      select case when details.input_data->>'endDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        and pg_input_is_valid(details.input_data->>'endDate', 'date')
        then (details.input_data->>'endDate')::date
      end as date
    ) draft
    left join lateral (
      select contract_end.date
      from public.hr_employment_contracts contract
      cross join lateral (
        select case when contract.input_data->>'endDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          and pg_input_is_valid(contract.input_data->>'endDate', 'date')
          then (contract.input_data->>'endDate')::date
        end as date
      ) contract_end
      where contract.company_id = person.company_id and contract.person_id = person.id
        and contract.contract_type = 'CDD' and upper(btrim(person.contract_type)) = 'CDD'
        and contract.input_data->>'startDate' = to_char(person.hired_on, 'YYYY-MM-DD')
        and details.input_data->>'endDate' is distinct from ''
        and contract_end.date >= person.hired_on
      order by contract.created_at desc, contract.id desc
      limit 1
    ) issued on true
  )
  select snapshot.data || jsonb_build_object(
    'people', coalesce((
      select jsonb_agg(card || jsonb_build_object(
        'contractType', contract_type,
        'contractEndDate', to_char(coalesce(cdd_end, recorded_end), 'YYYY-MM-DD')
      ) order by position)
      from staff
    ), '[]'::jsonb)
  ) || (
    select jsonb_build_object(
      'cardColors', coalesce(jsonb_object_agg(person_id, color) filter (where color is not null), '{}'::jsonb),
      'temporaryFunctions', coalesce(jsonb_object_agg(person_id, temporary_function_label)
        filter (where temporary_function_label is not null), '{}'::jsonb)
    )
    from public.organigramme_card_settings
    where company_id = public.current_planning_company_id() and chart_id = p_chart_id
  )
  from snapshot;
$$;

notify pgrst, 'reload schema';
