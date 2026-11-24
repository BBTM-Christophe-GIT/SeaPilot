begin;

create function private.fleet_vessel_brochure_cover_is_valid(candidate jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  language_code text;
  localized jsonb;
  property text;
  maximum_length integer;
  translation jsonb;
begin
  if jsonb_typeof(candidate) is distinct from 'object' then
    return false;
  end if;
  if candidate - array['fr', 'en'] <> '{}'::jsonb then
    return false;
  end if;

  for language_code, localized in select key, value from jsonb_each(candidate) loop
    if jsonb_typeof(localized) is distinct from 'object' then
      return false;
    end if;
    if (language_code = 'fr' and localized - 'missionsTitle' <> '{}'::jsonb)
      or (language_code = 'en'
        and localized - array['subtitle', 'summary', 'missionsTitle', 'operations', 'fieldValues'] <> '{}'::jsonb) then
      return false;
    end if;

    for property, maximum_length in
      select name, max_length
      from (values ('subtitle', 100), ('summary', 500), ('missionsTitle', 100)) as limits(name, max_length)
    loop
      if localized ? property and (jsonb_typeof(localized->property) is distinct from 'string'
        or char_length(localized->>property) > maximum_length) then
        return false;
      end if;
    end loop;

    if localized ? 'operations' then
      if jsonb_typeof(localized->'operations') is distinct from 'array' then
        return false;
      end if;
      if jsonb_array_length(localized->'operations') > 24 or exists (
        select 1 from jsonb_array_elements(localized->'operations') as operation(value)
        where jsonb_typeof(operation.value) is distinct from 'string'
          or char_length(operation.value #>> '{}') > 100
      ) then
        return false;
      end if;
    end if;

    if localized ? 'fieldValues' then
      if jsonb_typeof(localized->'fieldValues') is distinct from 'object' then
        return false;
      end if;
      if (select count(*) from jsonb_object_keys(localized->'fieldValues')) > 100 then
        return false;
      end if;
      for property, translation in select key, value from jsonb_each(localized->'fieldValues') loop
        if property !~ '^[a-zA-Z][a-zA-Z0-9_-]{0,63}$'
          or jsonb_typeof(translation) is distinct from 'string'
          or char_length(translation #>> '{}') > 6000 then
          return false;
        end if;
      end loop;
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function private.fleet_vessel_brochure_cover_is_valid(jsonb) from public, anon, authenticated;
grant execute on function private.fleet_vessel_brochure_cover_is_valid(jsonb) to authenticated;

alter table public.vessels
  add column brochure_cover jsonb not null default '{}'::jsonb,
  add constraint vessels_brochure_cover_check check (private.fleet_vessel_brochure_cover_is_valid(brochure_cover));

comment on column public.vessels.brochure_cover is
  'Per-vessel French and English cover overrides and English technical value translations.';

notify pgrst, 'reload schema';

commit;
