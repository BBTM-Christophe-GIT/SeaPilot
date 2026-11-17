-- Run with psql; all changes are rolled back. Works before and after repair.
\set ON_ERROR_STOP on
begin;

create temporary table duplicate_repair_people_before as
  select id, to_jsonb(person) as snapshot
  from public.people person where id <> 393;

create temporary table duplicate_repair_references_before as
  select constraint_row.conrelid::regclass as relation, column_row.attname as column_name,
    ((xpath('/row/n/text()', query_to_xml(format(
      'select count(*) as n from %s where %I = 368',
      constraint_row.conrelid::regclass, column_row.attname), false, true, '')))[1]::text)::bigint as row_count
  from pg_constraint constraint_row
  cross join lateral unnest(constraint_row.conkey, constraint_row.confkey)
    as key_column(local_number, referenced_number)
  join pg_attribute column_row
    on column_row.attrelid = constraint_row.conrelid and column_row.attnum = key_column.local_number
  join pg_attribute referenced_column
    on referenced_column.attrelid = constraint_row.confrelid and referenced_column.attnum = key_column.referenced_number
  where constraint_row.contype = 'f'
    and constraint_row.confrelid = 'public.people'::regclass
    and referenced_column.attname = 'id';

\ir ../migrations/20261008102754_remove_empty_duplicate_person.sql
\ir ../migrations/20261008102754_remove_empty_duplicate_person.sql

do $$
declare
  reference record;
  actual_count bigint;
begin
  if exists (select 1 from public.people where id = 393) then
    raise exception 'Duplicate still exists';
  end if;
  if not exists (select 1 from public.people person
    join public.profiles profile on profile.id = person.user_id
    where person.id = 368 and person.active and person.company_id = profile.active_company_id) then
    raise exception 'Account-linked active person was not preserved';
  end if;
  if exists (
    (select id, to_jsonb(person) from public.people person
     except select id, snapshot from duplicate_repair_people_before)
    union all
    (select id, snapshot from duplicate_repair_people_before
     except select id, to_jsonb(person) from public.people person)
  ) then
    raise exception 'Another person was changed';
  end if;
  for reference in select * from duplicate_repair_references_before loop
    execute format('select count(*) from %s where %I = 368', reference.relation, reference.column_name)
      into actual_count;
    if actual_count <> reference.row_count then
      raise exception 'Preserved person references changed: %.%', reference.relation, reference.column_name;
    end if;
  end loop;
end;
$$;

rollback;
