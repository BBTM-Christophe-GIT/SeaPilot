begin;

-- A layout contains only labels and ordering. Vessel values stay on public.vessels.
create function private.fleet_vessel_layout_is_valid(candidate jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  category jsonb;
  field jsonb;
  category_ids text[] := '{}';
  field_ids text[] := '{}';
  item_id text;
  item_label text;
begin
  if jsonb_typeof(candidate) is distinct from 'array' or pg_column_size(candidate) > 32768 then
    return false;
  end if;
  if jsonb_array_length(candidate) not between 1 and 16 then
    return false;
  end if;

  for category in select value from jsonb_array_elements(candidate) loop
    if jsonb_typeof(category) is distinct from 'object' then
      return false;
    end if;
    if jsonb_typeof(category->'id') is distinct from 'string'
      or jsonb_typeof(category->'label') is distinct from 'string'
      or (category ? 'labelEn' and (jsonb_typeof(category->'labelEn') is distinct from 'string'
        or char_length(category->>'labelEn') > 100 or category->>'labelEn' ~ '[[:cntrl:]]'))
      or jsonb_typeof(category->'fields') is distinct from 'array'
      or category - array['id', 'label', 'labelEn', 'fields'] <> '{}'::jsonb then
      return false;
    end if;

    item_id := category->>'id';
    item_label := category->>'label';
    if item_id !~ '^[a-zA-Z][a-zA-Z0-9_-]{0,63}$' or item_id = any(category_ids)
      or char_length(item_label) > 100 or item_label !~ '[^[:space:]]'
      or item_label ~ '[[:cntrl:]]' then
      return false;
    end if;
    category_ids := array_append(category_ids, item_id);

    for field in select value from jsonb_array_elements(category->'fields') loop
      if jsonb_typeof(field) is distinct from 'object' then
        return false;
      end if;
      if jsonb_typeof(field->'id') is distinct from 'string'
        or jsonb_typeof(field->'label') is distinct from 'string'
        or (field ? 'labelEn' and (jsonb_typeof(field->'labelEn') is distinct from 'string'
          or char_length(field->>'labelEn') > 100 or field->>'labelEn' ~ '[[:cntrl:]]'))
        or field - array['id', 'label', 'labelEn'] <> '{}'::jsonb then
        return false;
      end if;

      item_id := field->>'id';
      item_label := field->>'label';
      if item_id !~ '^[a-zA-Z][a-zA-Z0-9_-]{0,63}$' or item_id = any(field_ids)
        or char_length(item_label) > 100 or item_label !~ '[^[:space:]]'
        or item_label ~ '[[:cntrl:]]' then
        return false;
      end if;
      field_ids := array_append(field_ids, item_id);
      if cardinality(field_ids) > 100 then
        return false;
      end if;
    end loop;
  end loop;

  return cardinality(field_ids) > 0;
end;
$$;

revoke all on function private.fleet_vessel_layout_is_valid(jsonb) from public, anon, authenticated;
grant execute on function private.fleet_vessel_layout_is_valid(jsonb) to authenticated;

create table public.fleet_vessel_layouts (
  company_id bigint primary key references public.companies(id) on delete cascade,
  layout jsonb not null check (private.fleet_vessel_layout_is_valid(layout)),
  updated_at timestamptz not null default now()
);

comment on table public.fleet_vessel_layouts is
  'Shared display and brochure category and field order and labels for the entire company fleet.';

create function private.fleet_vessel_layout_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.fleet_vessel_layout_touch() from public, anon, authenticated;

create trigger fleet_vessel_layouts_touch
  before update on public.fleet_vessel_layouts
  for each row execute function private.fleet_vessel_layout_touch();

alter table public.fleet_vessel_layouts enable row level security;
revoke all on table public.fleet_vessel_layouts from public, anon, authenticated;
grant select on table public.fleet_vessel_layouts to authenticated;
grant insert (company_id, layout), update (company_id, layout)
  on table public.fleet_vessel_layouts to authenticated;

create policy fleet_vessel_layouts_read on public.fleet_vessel_layouts
  for select to authenticated
  using ((select public.user_belongs_to_company(company_id)));

create policy fleet_vessel_layouts_admin_insert on public.fleet_vessel_layouts
  for insert to authenticated
  with check ((select public.has_company_role(company_id, array['admin'])));

create policy fleet_vessel_layouts_admin_update on public.fleet_vessel_layouts
  for update to authenticated
  using ((select public.has_company_role(company_id, array['admin'])))
  with check ((select public.has_company_role(company_id, array['admin'])));

notify pgrst, 'reload schema';

commit;
