-- Plain PostgreSQL assertions, with distinct real-profile users and no pgTAP
-- dependency. The transaction rolls back every account and document fixture.
begin;

insert into auth.users (id, email) values
  ('7e000000-0000-0000-0000-000000000001', 'procedure-tags-admin@example.invalid'),
  ('7e000000-0000-0000-0000-000000000002', 'procedure-tags-direction@example.invalid'),
  ('7e000000-0000-0000-0000-000000000003', 'procedure-tags-capitaine@example.invalid'),
  ('7e000000-0000-0000-0000-000000000004', 'procedure-tags-marin@example.invalid');

insert into public.profiles (id, email, display_name, active_company_id)
select fixture.id::uuid, fixture.email, fixture.display_name, company.id
from (values
  ('7e000000-0000-0000-0000-000000000001', 'procedure-tags-admin@example.invalid', 'Tags Admin'),
  ('7e000000-0000-0000-0000-000000000002', 'procedure-tags-direction@example.invalid', 'Tags Direction'),
  ('7e000000-0000-0000-0000-000000000003', 'procedure-tags-capitaine@example.invalid', 'Tags Capitaine'),
  ('7e000000-0000-0000-0000-000000000004', 'procedure-tags-marin@example.invalid', 'Tags Marin')
) fixture(id, email, display_name)
cross join public.companies company where company.code = 'bbtm';

insert into public.user_roles (user_id, company_id, role_key)
select fixture.id::uuid, company.id, fixture.role_key
from (values
  ('7e000000-0000-0000-0000-000000000001', 'admin'),
  ('7e000000-0000-0000-0000-000000000002', 'direction'),
  ('7e000000-0000-0000-0000-000000000003', 'capitaine'),
  ('7e000000-0000-0000-0000-000000000004', 'marin')
) fixture(id, role_key)
cross join public.companies company where company.code = 'bbtm';

insert into public.procedures (
  procedure_code, title, status, source_label, theme, document_number, version_label,
  source_google_drive_path, source_file_name, source_mime_type, source_size_bytes, tags
) values (
  'TAGS 987655-A', 'Procedure tags fixture', 'draft', 'test', 'TAGS', '987655', 'A',
  'TAGS 987655 A - Procedure tags fixture.docx', 'Procedure tags fixture.docx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 100,
  array[' Initial ', 'initial', '', null, E'\tNavigation\n']
);
select set_config('test.procedure_tags.source_id', (
  select id::text from public.procedures where procedure_code = 'TAGS 987655-A'
), true);

insert into public.procedures (procedure_code, title, status, source_label, theme, document_number)
values ('TAGS 987656-A', 'Procedure without tags fixture', 'draft', 'test', 'TAGS', '987656');

-- Seed invalid historical metadata as postgres. The source synchronization
-- must skip it, even when Administration can see it through its audit policy.
insert into public.published_procedures (
  procedure_id, procedure_code, title, status, source_label,
  storage_bucket, storage_path, file_name, mime_type, size_bytes, tags
) values
  (
    current_setting('test.procedure_tags.source_id')::bigint, 'TAGS 987655-A', 'Tags Storage PDF',
    'published', 'test', 'procedure-documents', 'published/test/procedure-tags-storage.pdf',
    'procedure-tags-storage.pdf', 'application/pdf', 100, array['Caller value must be replaced']
  ),
  (
    current_setting('test.procedure_tags.source_id')::bigint, 'TAGS 987655-A', 'Tags legacy approval',
    'approved', 'test', null, null, null, null, null, '{}'
  ),
  (
    current_setting('test.procedure_tags.source_id')::bigint, 'TAGS 987655-A', 'Tags incomplete PDF',
    'published', 'test', null, null, null, null, null, '{}'
  ),
  (
    null, 'TAGS 987657-A', 'Tags standalone PDF', 'published', 'test',
    'procedure-documents', 'published/test/procedure-tags-standalone.pdf',
    'procedure-tags-standalone.pdf', 'application/pdf', 100, array[' Independent ', 'INDEPENDENT', '']
  );

do $$
begin
  if (select count(*) from pg_proc function join pg_namespace schema on schema.oid = function.pronamespace
      where schema.nspname = 'procedure_tags_private' and not function.prosecdef) <> 2 then
    raise exception 'Tag triggers must be security invoker';
  end if;
  if has_schema_privilege('authenticated', 'procedure_tags_private', 'usage')
    or has_function_privilege('authenticated', 'procedure_tags_private.prepare_document_tags()', 'execute')
    or has_function_privilege('anon', 'procedure_tags_private.sync_publication_tags()', 'execute') then
    raise exception 'Private tag triggers must not become client RPCs';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '7e000000-0000-0000-0000-000000000001', true);

do $$
declare
  source public.procedures;
  drive_pdf public.published_procedures;
  expected text[] := array['Initial', 'Navigation'];
begin
  select * into source from public.procedures where id = current_setting('test.procedure_tags.source_id')::bigint;
  if source.tags is distinct from expected then raise exception 'Source tags were not normalized'; end if;
  if (select tags from public.procedures where procedure_code = 'TAGS 987656-A') is distinct from '{}'::text[] then
    raise exception 'Existing/default source tags must be empty';
  end if;
  if (select tags from public.published_procedures where title = 'Tags Storage PDF') is distinct from expected then
    raise exception 'Storage publication did not inherit source tags';
  end if;
  if (select tags from public.published_procedures where title = 'Tags standalone PDF') is distinct from array['Independent'] then
    raise exception 'Standalone publication tags were not normalized';
  end if;

  drive_pdf := public.publish_procedure_drive(source.id, public.procedure_drive_pdf_name(source), 100, repeat('a', 64));
  if drive_pdf.tags is distinct from expected then raise exception 'Drive receipt did not inherit source tags'; end if;
  perform set_config('test.procedure_tags.drive_id', drive_pdf.id::text, true);

  update public.procedures set tags = array[' sécurité ', 'SÉCURITÉ', 'machine', null, ''] where id = source.id;
  expected := array['sécurité', 'machine'];
  if (select tags from public.procedures where id = source.id) is distinct from expected then
    raise exception 'Admin source tags were not persisted';
  end if;
  if exists (select 1 from public.published_procedures where procedure_id = source.id
      and mime_type = 'application/pdf' and tags is distinct from expected) then
    raise exception 'Admin changes did not synchronize Storage and Drive PDFs';
  end if;
  if exists (select 1 from public.published_procedures where procedure_id = source.id
      and title in ('Tags legacy approval', 'Tags incomplete PDF') and tags is distinct from array['Initial', 'Navigation']) then
    raise exception 'Synchronization changed invalid legacy rows';
  end if;
  if (select tags from public.published_procedures where title = 'Tags standalone PDF') is distinct from array['Independent'] then
    raise exception 'Synchronization changed an unrelated publication';
  end if;

  update public.procedures set tags = '{}' where id = source.id;
  if exists (select 1 from public.published_procedures where procedure_id = source.id
      and mime_type = 'application/pdf' and tags is distinct from '{}'::text[]) then
    raise exception 'Removing tags did not clear linked PDF tags';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '7e000000-0000-0000-0000-000000000002', true);
do $$
declare changed integer;
begin
  update public.procedures set tags = array[' Navigation ', 'navigation', 'Pont']
  where id = current_setting('test.procedure_tags.source_id')::bigint;
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'Direction could not edit source tags'; end if;
  if exists (select 1 from public.published_procedures
      where procedure_id = current_setting('test.procedure_tags.source_id')::bigint
        and mime_type = 'application/pdf' and tags is distinct from array['Navigation', 'Pont']) then
    raise exception 'Direction changes did not synchronize published tags';
  end if;

  update public.published_procedures set tags = array[E' Autonome  en\tmer ', 'AUTONOME EN MER', '', null]
  where title = 'Tags standalone PDF';
  get diagnostics changed = row_count;
  if changed <> 1 or (select tags from public.published_procedures where title = 'Tags standalone PDF')
      is distinct from array['Autonome en mer'] then
    raise exception 'Direction could not edit standalone publication tags';
  end if;
end;
$$;

do $$
declare
  profile text;
  changed integer;
begin
  foreach profile in array array[
    '7e000000-0000-0000-0000-000000000003',
    '7e000000-0000-0000-0000-000000000004'
  ] loop
    perform set_config('request.jwt.claim.sub', profile, true);
    if exists (select 1 from public.procedures where procedure_code like 'TAGS 98765%') then
      raise exception 'Reader profile % can see private source metadata', profile;
    end if;
    if (select count(*) from public.published_procedures where procedure_code = 'TAGS 987655-A') <> 2
      or (select count(*) from public.published_procedures where procedure_code = 'TAGS 987655-A'
        and 'Navigation' = any(tags) and tags = array['Navigation', 'Pont']) <> 2 then
      raise exception 'Reader profile % cannot find both complete PDFs by their tags', profile;
    end if;
    if (select tags from public.published_procedures where title = 'Tags standalone PDF') is distinct from array['Autonome en mer'] then
      raise exception 'Reader profile % cannot read standalone PDF tags', profile;
    end if;

    update public.procedures set tags = array['tampered']
    where id = current_setting('test.procedure_tags.source_id')::bigint;
    get diagnostics changed = row_count;
    if changed <> 0 then raise exception 'Reader profile % changed source tags', profile; end if;
    update public.published_procedures set tags = array['tampered'] where procedure_code like 'TAGS 98765%';
    get diagnostics changed = row_count;
    if changed <> 0 then raise exception 'Reader profile % changed PDF tags', profile; end if;
    begin
      insert into public.published_procedures (title, status, source_label, storage_bucket, storage_path, file_name, mime_type, tags)
      values ('Reader tag write', 'published', 'test', 'procedure-documents',
        'published/test/procedure-tags-reader.pdf', 'procedure-tags-reader.pdf', 'application/pdf', array['tampered']);
      raise exception 'Reader profile % inserted PDF tags', profile;
    exception when insufficient_privilege then null;
    end;
  end loop;
end;
$$;

select set_config('request.jwt.claim.sub', '7e000000-0000-0000-0000-000000000001', true);
do $$
begin
  if (select tags from public.procedures where id = current_setting('test.procedure_tags.source_id')::bigint)
      is distinct from array['Navigation', 'Pont']
    or (select tags from public.published_procedures where id = current_setting('test.procedure_tags.drive_id')::bigint)
      is distinct from array['Navigation', 'Pont'] then
    raise exception 'Reader attempts altered persisted source or Drive tags';
  end if;
end;
$$;

select 'Procedure tags: normalization, persistence, publication inheritance, synchronization, legacy isolation, and four real-profile permissions passed.' as result;
rollback;
