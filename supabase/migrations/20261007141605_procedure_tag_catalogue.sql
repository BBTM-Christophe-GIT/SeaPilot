-- Reusable choices belong to the procedure managers. Removing a tag from a
-- document never removes it from this shared catalogue.
create table public.procedure_tag_catalogue (
  name text not null check (name <> ''),
  name_key text generated always as (
    lower(regexp_replace(normalize(name, NFD), U&'[\0300-\036f]', '', 'g'))
  ) stored primary key,
  created_at timestamptz not null default now()
);

alter table public.procedure_tag_catalogue enable row level security;
revoke all on table public.procedure_tag_catalogue from public, anon, authenticated;
grant select, insert, update, delete on table public.procedure_tag_catalogue to authenticated;

create policy procedure_tag_catalogue_manager_access
on public.procedure_tag_catalogue for all to authenticated
using (public.has_any_role(array['admin', 'direction']))
with check (public.has_any_role(array['admin', 'direction']));

create function procedure_tags_private.prepare_catalogue_tag()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.name := normalize(btrim(regexp_replace(new.name, '[[:space:]]+', ' ', 'g')), NFC);
  return new;
end;
$$;
revoke all on function procedure_tags_private.prepare_catalogue_tag() from public, anon, authenticated;

create trigger procedure_tag_catalogue_normalize_name
before insert or update of name on public.procedure_tag_catalogue
for each row execute function procedure_tags_private.prepare_catalogue_tag();

-- Prefer the preset spelling when an existing document already uses an
-- equivalent label. Other existing tags are also reusable immediately.
insert into public.procedure_tag_catalogue (name)
select name from (
  select name, 0 as priority
  from unnest(array[
    'Rôle', 'MARPOL', 'Pollution', 'Incendie', 'THOMSEA'
  ]) as preset(name)
  union all
  select tag, 1 from public.procedures source cross join lateral unnest(source.tags) as tags(tag)
  union all
  select tag, 2 from public.published_procedures publication cross join lateral unnest(publication.tags) as tags(tag)
) initial_tags
where nullif(btrim(name), '') is not null
order by priority, name
on conflict (name_key) do nothing;

create or replace function procedure_tags_private.prepare_document_tags()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  source_tags text[];
begin
  -- Keep publication inheritance and locking from the original tag workflow.
  if tg_table_name = 'published_procedures' and tg_op = 'INSERT' then
    if new.procedure_id is not null then
      select source.tags into source_tags
      from public.procedures source where source.id = new.procedure_id for share;
      if found then new.tags := source_tags; end if;
    end if;
  end if;

  select coalesce(array_agg(tag order by ordinal), '{}'::text[])
  into new.tags
  from (
    select tag, ordinal,
      row_number() over (
        partition by lower(regexp_replace(normalize(tag, NFD), U&'[\0300-\036f]', '', 'g'))
        order by ordinal
      ) as duplicate_rank
    from (
      select normalize(btrim(regexp_replace(value, '[[:space:]]+', ' ', 'g')), NFC) as tag, ordinal
      from unnest(coalesce(new.tags, '{}'::text[])) with ordinality as supplied(value, ordinal)
    ) trimmed
    where nullif(tag, '') is not null
  ) normalized
  where duplicate_rank = 1;

  -- This insert runs with the caller's existing manager permissions. Concurrent
  -- saves and case/accent variants converge on one reusable catalogue entry.
  insert into public.procedure_tag_catalogue (name)
  select tag from unnest(new.tags) as tags(tag)
  on conflict (name_key) do nothing;
  return new;
end;
$$;
revoke all on function procedure_tags_private.prepare_document_tags() from public, anon, authenticated;

comment on table public.procedure_tag_catalogue is
  'Shared reusable procedure tags for Administration and Direction, seeded with the requested choices and retained independently of documents.';
comment on column public.procedure_tag_catalogue.name_key is
  'Generated case- and accent-insensitive unique key matching the procedure tag editor.';
