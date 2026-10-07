-- Plain PostgreSQL assertions against real manager/reader accounts. Every
-- account, document, and custom catalogue fixture is rolled back.
begin;

insert into auth.users (id, email) values
  ('7f000000-0000-0000-0000-000000000001', 'tag-catalogue-admin@example.invalid'),
  ('7f000000-0000-0000-0000-000000000002', 'tag-catalogue-direction@example.invalid'),
  ('7f000000-0000-0000-0000-000000000003', 'tag-catalogue-capitaine@example.invalid'),
  ('7f000000-0000-0000-0000-000000000004', 'tag-catalogue-marin@example.invalid');

insert into public.profiles (id, email, display_name, active_company_id)
select fixture.id::uuid, fixture.email, fixture.display_name, company.id
from (values
  ('7f000000-0000-0000-0000-000000000001', 'tag-catalogue-admin@example.invalid', 'Catalogue Admin'),
  ('7f000000-0000-0000-0000-000000000002', 'tag-catalogue-direction@example.invalid', 'Catalogue Direction'),
  ('7f000000-0000-0000-0000-000000000003', 'tag-catalogue-capitaine@example.invalid', 'Catalogue Capitaine'),
  ('7f000000-0000-0000-0000-000000000004', 'tag-catalogue-marin@example.invalid', 'Catalogue Marin')
) fixture(id, email, display_name)
cross join public.companies company where company.code = 'bbtm';

insert into public.user_roles (user_id, company_id, role_key)
select fixture.id::uuid, company.id, fixture.role_key
from (values
  ('7f000000-0000-0000-0000-000000000001', 'admin'),
  ('7f000000-0000-0000-0000-000000000002', 'direction'),
  ('7f000000-0000-0000-0000-000000000003', 'capitaine'),
  ('7f000000-0000-0000-0000-000000000004', 'marin')
) fixture(id, role_key)
cross join public.companies company where company.code = 'bbtm';

do $$
begin
  if (select count(*) from public.procedure_tag_catalogue where name_key = any(array[
      'role', 'marpol', 'pollution', 'incendie', 'thomsea'])) <> 5 then
    raise exception 'The requested reusable preset list is incomplete';
  end if;
  if exists (
    select 1 from (
      select unnest(tags) as tag from public.procedures
      union all select unnest(tags) from public.published_procedures
    ) existing_tags
    where not exists (
      select 1 from public.procedure_tag_catalogue catalogue
      where catalogue.name_key = lower(regexp_replace(normalize(existing_tags.tag, NFD), U&'[\0300-\036f]', '', 'g'))
    )
  ) then raise exception 'An existing document tag was not seeded into the catalogue'; end if;
  if has_function_privilege('authenticated', 'procedure_tags_private.prepare_catalogue_tag()', 'execute')
    or exists (select 1 from pg_proc function join pg_namespace schema on schema.oid = function.pronamespace
      where schema.nspname = 'procedure_tags_private' and function.proname = 'prepare_catalogue_tag' and function.prosecdef) then
    raise exception 'Catalogue normalization must remain a private invoker trigger';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '7f000000-0000-0000-0000-000000000001', true);

do $$
declare
  source public.procedures;
  publication public.published_procedures;
  invalid_name text;
  changed integer;
begin
  if not exists (select 1 from public.procedure_tag_catalogue where name = 'Rôle') then
    raise exception 'Admin cannot read the reusable catalogue';
  end if;
  insert into public.procedures (procedure_code, title, status, source_label, theme, document_number, tags)
  values ('TAGCAT 987665-A', 'Catalogue source fixture', 'draft', 'test', 'TAGCAT', '987665',
    array[' Catalogue  custom ', 'catalogue custom', 'RÔLE', 'role']) returning * into source;
  perform set_config('test.tag_catalogue.source_id', source.id::text, true);
  if source.tags is distinct from array['Catalogue custom', 'RÔLE'] then
    raise exception 'Document tags do not deduplicate case and accent variants';
  end if;
  if not exists (select 1 from public.procedure_tag_catalogue where name = 'Catalogue custom')
    or (select count(*) from public.procedure_tag_catalogue where name_key = 'role') <> 1 then
    raise exception 'Source tags were not registered without duplicate presets';
  end if;

  insert into public.procedure_tag_catalogue (name) values (E'  Préenregistré\tpersonnalisé  ');
  if not exists (select 1 from public.procedure_tag_catalogue
      where name = 'Préenregistré personnalisé' and name_key = 'preenregistre personnalise') then
    raise exception 'Direct catalogue inserts did not normalize spacing and accents';
  end if;
  begin
    insert into public.procedure_tag_catalogue (name) values ('ROLe');
    raise exception 'An equivalent preset tag was inserted twice';
  exception when unique_violation then null;
  end;
  begin
    insert into public.procedure_tag_catalogue (name) values ('  ');
    raise exception 'An empty catalogue tag was accepted';
  exception when check_violation then null;
  end;
  foreach invalid_name in array array['Multiple, tags', 'Multiple; tags'] loop
    begin
      insert into public.procedure_tag_catalogue (name) values (invalid_name);
      raise exception 'A catalogue choice contains a tag separator';
    exception when check_violation then null;
    end;
  end loop;

  insert into public.published_procedures (procedure_id, procedure_code, title, status, source_label,
    storage_bucket, storage_path, file_name, mime_type, size_bytes)
  values (source.id, source.procedure_code, 'Catalogue linked PDF', 'published', 'test',
    'procedure-documents', 'published/test/catalogue-linked.pdf', 'catalogue-linked.pdf', 'application/pdf', 100)
  returning * into publication;
  if publication.tags is distinct from source.tags then raise exception 'Catalogue workflow broke publication inheritance'; end if;

  update public.procedure_tag_catalogue set active = false where name_key = 'catalogue custom';
  get diagnostics changed = row_count;
  if changed <> 1 or exists (select 1 from public.procedure_tag_catalogue where name_key = 'catalogue custom' and active) then
    raise exception 'Admin cannot remove a choice from the active catalogue';
  end if;
  if (select tags from public.procedures where id = source.id) is distinct from source.tags
    or (select tags from public.published_procedures where id = publication.id) is distinct from source.tags then
    raise exception 'Catalogue removal altered assigned document tags';
  end if;
  update public.procedures set tags = tags where id = source.id;
  update public.published_procedures set tags = tags where id = publication.id;
  if exists (select 1 from public.procedure_tag_catalogue where name_key = 'catalogue custom' and active) then
    raise exception 'Saving old document tags reactivated an archived choice';
  end if;
  insert into public.procedure_tag_catalogue (name, active) values ('Catalogue custom', true)
  on conflict (name_key) do update set name = excluded.name, active = excluded.active;
  if not exists (select 1 from public.procedure_tag_catalogue where name_key = 'catalogue custom' and active) then
    raise exception 'Explicit catalogue creation did not reactivate the archived choice';
  end if;

  update public.procedures set tags = '{}' where id = source.id;
  if not exists (select 1 from public.procedure_tag_catalogue where name = 'Catalogue custom') then
    raise exception 'Removing source tags deleted reusable catalogue entries';
  end if;

  insert into public.published_procedures (procedure_code, title, status, source_label,
    storage_bucket, storage_path, file_name, mime_type, size_bytes, tags)
  values ('TAGCAT 987666-A', 'Catalogue standalone PDF', 'published', 'test',
    'procedure-documents', 'published/test/catalogue-standalone.pdf', 'catalogue-standalone.pdf',
    'application/pdf', 100, array['Publication autonome']) returning * into publication;
  if not exists (select 1 from public.procedure_tag_catalogue where name = 'Publication autonome') then
    raise exception 'Standalone publication tags were not registered';
  end if;
  update public.published_procedures set tags = array['Briefing préalable', 'BRIEFING PREALABLE'] where id = publication.id;
  if not exists (select 1 from public.procedure_tag_catalogue where name_key = 'briefing prealable')
    or (select tags from public.published_procedures where id = publication.id) is distinct from array['Briefing préalable'] then
    raise exception 'Publication edits did not register normalized reusable tags';
  end if;
  update public.published_procedures set tags = '{}' where id = publication.id;
  if not exists (select 1 from public.procedure_tag_catalogue where name_key = 'briefing prealable') then
    raise exception 'Removing publication tags deleted reusable catalogue entries';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '7f000000-0000-0000-0000-000000000002', true);
do $$
declare changed integer;
begin
  if not exists (select 1 from public.procedure_tag_catalogue where name_key = 'catalogue custom') then
    raise exception 'Direction cannot reuse a tag registered by Admin';
  end if;
  update public.procedures set tags = array['Direction catalogue']
  where id = current_setting('test.tag_catalogue.source_id')::bigint;
  get diagnostics changed = row_count;
  if changed <> 1 or not exists (select 1 from public.procedure_tag_catalogue where name = 'Direction catalogue') then
    raise exception 'Direction cannot register new source tags';
  end if;
  if (select tags from public.published_procedures where title = 'Catalogue linked PDF') is distinct from array['Direction catalogue'] then
    raise exception 'Catalogue registration broke source-to-publication synchronization';
  end if;
  update public.procedure_tag_catalogue set active = false where name_key = 'direction catalogue';
  get diagnostics changed = row_count;
  if changed <> 1 or exists (select 1 from public.procedure_tag_catalogue where name_key = 'direction catalogue' and active) then
    raise exception 'Direction cannot archive a catalogue choice';
  end if;
  update public.procedures set tags = tags where id = current_setting('test.tag_catalogue.source_id')::bigint;
  if exists (select 1 from public.procedure_tag_catalogue where name_key = 'direction catalogue' and active) then
    raise exception 'Direction document saving reactivated an archived choice';
  end if;

  insert into public.procedure_tag_catalogue (name) values ('Direction option');
  update public.procedure_tag_catalogue set name = 'Direction option renommée' where name_key = 'direction option';
  get diagnostics changed = row_count;
  if changed <> 1 or not exists (select 1 from public.procedure_tag_catalogue where name_key = 'direction option renommee') then
    raise exception 'Direction cannot update catalogue choices';
  end if;
  update public.procedure_tag_catalogue set active = false where name_key = 'direction option renommee';
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'Direction cannot archive an unused catalogue choice'; end if;
end;
$$;

do $$
declare profile text; changed integer;
begin
  foreach profile in array array[
    '7f000000-0000-0000-0000-000000000003', '7f000000-0000-0000-0000-000000000004'
  ] loop
    perform set_config('request.jwt.claim.sub', profile, true);
    if exists (select 1 from public.procedure_tag_catalogue) then
      raise exception 'Reader profile % can access the managers catalogue', profile;
    end if;
    if (select tags from public.published_procedures where title = 'Catalogue linked PDF')
        is distinct from array['Direction catalogue'] then
      raise exception 'Reader profile % cannot see published document tags', profile;
    end if;
    begin
      insert into public.procedure_tag_catalogue (name) values ('Reader catalogue write');
      raise exception 'Reader profile % added a catalogue tag', profile;
    exception when insufficient_privilege then null;
    end;
    update public.procedure_tag_catalogue set name = 'Reader catalogue write' where name_key = 'role';
    get diagnostics changed = row_count;
    if changed <> 0 then raise exception 'Reader profile % edited a catalogue tag', profile; end if;
    update public.procedure_tag_catalogue set active = true where name_key = 'direction catalogue';
    get diagnostics changed = row_count;
    if changed <> 0 then raise exception 'Reader profile % reactivated a catalogue tag', profile; end if;
    delete from public.procedure_tag_catalogue where name_key = 'role';
    get diagnostics changed = row_count;
    if changed <> 0 then raise exception 'Reader profile % deleted a catalogue tag', profile; end if;
    update public.procedures set tags = array['Reader catalogue write']
    where id = current_setting('test.tag_catalogue.source_id')::bigint;
    get diagnostics changed = row_count;
    if changed <> 0 then raise exception 'Reader profile % registered a source tag', profile; end if;
  end loop;
end;
$$;

set local role anon;
do $$
begin
  begin
    perform name from public.procedure_tag_catalogue;
    raise exception 'Anonymous catalogue access was granted';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select 'Procedure tag catalogue: presets, inheritance, reuse, archive/reactivation, persistence, uniqueness, and real-profile permissions passed.' as result;
rollback;
