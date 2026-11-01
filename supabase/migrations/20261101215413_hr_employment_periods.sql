-- Employment history remains under the existing company-scoped people RLS.
alter table public.people add column if not exists employment_periods jsonb not null default '[]'::jsonb;

create or replace function public.sync_hr_employment_periods()
returns trigger language plpgsql set search_path = '' as $$
declare
  item jsonb;
  latest jsonb;
  periods jsonb;
  hired date;
  departed date;
  previous_departure date;
  period_index integer := 0;
begin
  periods := new.employment_periods;
  if jsonb_typeof(periods) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Les périodes d’emploi doivent être une liste.';
  end if;
  if tg_op = 'UPDATE' then
    if periods is not distinct from old.employment_periods
       and (new.hired_on, new.departed_on, new.contract_type, new.departure_reason)
           is distinct from (old.hired_on, old.departed_on, old.contract_type, old.departure_reason)
       and jsonb_array_length(periods) > 0 then
      periods := jsonb_set(periods, array[(jsonb_array_length(periods) - 1)::text], jsonb_build_object(
        'hiredOn', coalesce(new.hired_on::text, ''), 'departedOn', coalesce(new.departed_on::text, ''),
        'contractType', coalesce(new.contract_type, ''), 'departureReason', coalesce(new.departure_reason, '')
      ));
    end if;
    if periods = '[]'::jsonb and old.employment_periods <> '[]'::jsonb then
      raise exception using errcode = '22023', message = 'Conservez au moins une période d’emploi.';
    end if;
  end if;
  if periods = '[]'::jsonb and new.hired_on is not null then
    periods := jsonb_build_array(jsonb_build_object(
      'hiredOn', new.hired_on::text, 'departedOn', coalesce(new.departed_on::text, ''),
      'contractType', coalesce(new.contract_type, ''), 'departureReason', coalesce(new.departure_reason, '')
    ));
  end if;
  if jsonb_typeof(periods) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Les périodes d’emploi doivent être une liste.';
  end if;
  -- Store in chronological order. Gaps are intentional, overlaps are rejected.
  select coalesce(jsonb_agg(value order by value->>'hiredOn'), '[]'::jsonb) into periods
  from jsonb_array_elements(periods);
  for item in select value from jsonb_array_elements(periods) loop
    if jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item->'hiredOn') is distinct from 'string'
      or coalesce(item->>'hiredOn', '') !~ '^\d{4}-\d{2}-\d{2}$'
      or jsonb_typeof(item->'departedOn') is distinct from 'string'
      or (item->>'departedOn' <> '' and item->>'departedOn' !~ '^\d{4}-\d{2}-\d{2}$')
      or jsonb_typeof(item->'contractType') is distinct from 'string'
      or jsonb_typeof(item->'departureReason') is distinct from 'string' then
      raise exception using errcode = '22023', message = 'Période d’emploi incomplète ou dates invalides.';
    end if;
    hired := (item->>'hiredOn')::date;
    departed := nullif(item->>'departedOn', '')::date;
    if departed is not null and departed < hired then
      raise exception using errcode = '22023', message = 'Le départ ne peut pas précéder la date d’embauche.';
    end if;
    if period_index > 0 and (previous_departure is null or previous_departure > hired) then
      raise exception using errcode = '22023', message = 'Les périodes d’emploi ne doivent pas se chevaucher.';
    end if;
    previous_departure := departed;
    period_index := period_index + 1;
    latest := item;
  end loop;
  new.employment_periods := periods;
  if latest is not null then
    new.hired_on := (latest->>'hiredOn')::date;
    new.departed_on := nullif(latest->>'departedOn', '')::date;
    new.contract_type := nullif(latest->>'contractType', '');
    new.departure_reason := nullif(latest->>'departureReason', '');
  end if;
  return new;
end;
$$;

revoke all on function public.sync_hr_employment_periods() from public, anon, authenticated;
create trigger people_employment_periods_sync
before insert or update on public.people
for each row execute function public.sync_hr_employment_periods();

-- Legacy rows keep their existing employment dates; the trigger seeds the history.
update public.people set employment_periods = employment_periods
where hired_on is not null and employment_periods = '[]'::jsonb;
comment on column public.people.employment_periods is
  'Chronological, non-overlapping employment periods; current legacy employment columns mirror the latest period. Hire inclusive, departure exclusive.';
notify pgrst, 'reload schema';
