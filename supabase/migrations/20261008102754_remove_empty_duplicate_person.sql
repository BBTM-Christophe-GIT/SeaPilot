-- Retain the complete, account-linked RH record (368) and remove only its
-- unlinked duplicate (393). No related data is merged or deleted.
-- Abort if either identity or the duplicate's dependencies changed since review.
do $$
declare
  keeper public.people%rowtype;
  duplicate public.people%rowtype;
  reference record;
  has_reference boolean;
begin
  select * into duplicate from public.people where id = 393 for update;
  if not found then
    return; -- Already repaired: safe to replay.
  end if;

  select * into keeper from public.people where id = 368 for update;
  if not found
     or keeper.company_id <> 1
     or duplicate.company_id <> keeper.company_id
     or keeper.user_id is distinct from '088fbe5b-5446-425c-a839-5543ac3fb7eb'::uuid
     or duplicate.user_id is not null
     or btrim(keeper.sailor_number) is distinct from '20265185'
     or lower(btrim(duplicate.first_name)) is distinct from lower(btrim(keeper.first_name))
     or lower(btrim(duplicate.last_name)) is distinct from lower(btrim(keeper.last_name))
     or lower(btrim(duplicate.email)) is distinct from lower(btrim(keeper.email))
     or btrim(duplicate.sailor_number) is distinct from btrim(keeper.sailor_number)
     or not (
       jsonb_strip_nulls(to_jsonb(duplicate) - array['id', 'user_id', 'created_at', 'updated_at'])
       <@ jsonb_strip_nulls(to_jsonb(keeper) - array['id', 'user_id', 'created_at', 'updated_at'])
     ) then
    raise exception 'DUPLICATE_PERSON_REPAIR_IDENTITY_CHANGED';
  end if;

  -- Include composite foreign keys and tables introduced after this migration
  -- was written. Check every reference before DELETE can cascade or set null.
  for reference in
    select distinct constraint_row.conrelid::regclass as relation, column_row.attname as column_name
    from pg_constraint constraint_row
    cross join lateral unnest(constraint_row.conkey, constraint_row.confkey)
      as key_column(local_number, referenced_number)
    join pg_attribute column_row
      on column_row.attrelid = constraint_row.conrelid
     and column_row.attnum = key_column.local_number
    join pg_attribute referenced_column
      on referenced_column.attrelid = constraint_row.confrelid
     and referenced_column.attnum = key_column.referenced_number
    where constraint_row.contype = 'f'
      and constraint_row.confrelid = 'public.people'::regclass
      and referenced_column.attname = 'id'
  loop
    execute format('select exists (select 1 from %s where %I = $1)',
      reference.relation, reference.column_name)
      into has_reference using duplicate.id;
    if has_reference then
      raise exception 'DUPLICATE_PERSON_REPAIR_HAS_REFERENCES: %.%',
        reference.relation, reference.column_name;
    end if;
  end loop;

  -- These optional modules store person IDs without a foreign key.
  if to_regclass('public.planning_leave_counter_periods') is not null then
    lock table public.planning_leave_counter_periods in share mode;
    execute 'select exists (select 1 from public.planning_leave_counter_periods where person_id = $1)'
      into has_reference using duplicate.id;
    if has_reference then
      raise exception 'DUPLICATE_PERSON_REPAIR_HAS_LEAVE_PERIODS';
    end if;
  end if;
  if to_regclass('public.organigramme_emergency_defaults') is not null then
    lock table public.organigramme_emergency_defaults in share mode;
    execute 'select exists (select 1 from public.organigramme_emergency_defaults where $1 = any(person_ids))'
      into has_reference using duplicate.id;
    if has_reference then
      raise exception 'DUPLICATE_PERSON_REPAIR_HAS_EMERGENCY_ROLES';
    end if;
  end if;

  delete from public.people where id = duplicate.id;
end;
$$;
