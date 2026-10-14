-- Real PostgreSQL roles and tenant memberships; all fixtures and changes roll back.
begin;
-- Match the Storage API's transaction flag for synthetic metadata deletion tests.
-- This is local to the rolled-back transaction; no bucket file is deleted.
select set_config('storage.allow_delete_query', 'true', true);
create temporary table branding_actors(actor uuid, role_key text, company_id bigint, active boolean);
grant select on branding_actors to authenticated;

insert into public.companies(code, name, active) values ('branding-other-test', 'Other branding tenant', true);
do $$
declare role_name text; actor_id uuid; company bigint; n integer := 0;
begin
  foreach role_name in array array['admin', 'direction', 'armement', 'marin', 'capitaine', 'foreign-admin', 'inactive-admin'] loop
    n := n + 1; actor_id := ('ba870000-0000-4000-8000-00000000000' || n)::uuid;
    select id into strict company from public.companies where code = case when role_name = 'foreign-admin' then 'branding-other-test' else 'bbtm' end;
    insert into auth.users(id, email) values (actor_id, role_name || '-branding@example.invalid');
    insert into public.profiles(id, email, display_name, active_company_id)
    values (actor_id, role_name || '-branding@example.invalid', 'Branding fixture', company);
    insert into public.company_memberships(company_id, user_id, active) values (company, actor_id, role_name <> 'inactive-admin')
    on conflict(company_id, user_id) do update set active = excluded.active;
    insert into public.user_roles(user_id, company_id, role_key)
    values (actor_id, company, case when role_name in ('foreign-admin', 'inactive-admin') then 'admin' else role_name end);
    insert into branding_actors values (actor_id, role_name, company, role_name <> 'inactive-admin');
  end loop;
end $$;
update application_branding_private.settings set logo_path = null, revision = 0, updated_by = null, updated_at = null;

insert into storage.objects(bucket_id, name, owner_id, metadata)
values
  ('application-branding', 'logos/ba870000-0000-4000-8000-000000000001/ba870000-0000-4000-8000-000000000101.png', 'ba870000-0000-4000-8000-000000000001', '{"mimetype":"image/png","size":128}'),
  ('application-branding', 'logos/ba870000-0000-4000-8000-000000000001/ba870000-0000-4000-8000-000000000102.webp', 'ba870000-0000-4000-8000-000000000001', '{"mimetype":"image/webp","size":256}'),
  ('application-branding', 'logos/ba870000-0000-4000-8000-000000000001/ba870000-0000-4000-8000-000000000103.png', 'ba870000-0000-4000-8000-000000000006', '{"mimetype":"image/png","size":128}'),
  ('application-branding', 'logos/ba870000-0000-4000-8000-000000000001/ba870000-0000-4000-8000-000000000104.png', 'ba870000-0000-4000-8000-000000000001', '{"mimetype":"image/svg+xml","size":128}'),
  ('application-branding', 'logos/ba870000-0000-4000-8000-000000000001/ba870000-0000-4000-8000-000000000105.png', 'ba870000-0000-4000-8000-000000000001', '{"mimetype":"image/png","size":2097153}'),
  ('application-branding', 'logos/ba870000-0000-4000-8000-000000000001/ba870000-0000-4000-8000-000000000106.png', 'ba870000-0000-4000-8000-000000000001', '{"mimetype":"image/png","size":"invalid"}');

-- Prove restrictive guards survive another permissive policy on the shared table.
create policy application_branding_fixture_broad on storage.objects for all to authenticated, anon using (true) with check (true);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'ba870000-0000-4000-8000-000000000001', true);
do $$
declare result jsonb; path text := 'logos/ba870000-0000-4000-8000-000000000001/ba870000-0000-4000-8000-000000000101.png'; affected integer; suffix text;
begin
  result := public.get_application_branding();
  assert result = '{"logoPath":null,"revision":0,"canManage":true,"updatedAt":null}'::jsonb, 'Initial branding or admin capability incorrect';
  insert into storage.objects(bucket_id, name, owner_id, metadata)
  values ('application-branding', 'logos/ba870000-0000-4000-8000-000000000001/ba870000-0000-4000-8000-000000000109.jpg', 'ba870000-0000-4000-8000-000000000001', '{"mimetype":"image/jpeg","size":128}');
  assert exists(select 1 from storage.objects where bucket_id = 'application-branding' and name like '%109.jpg'), 'Administrator upload policy rejected a valid JPEG';
  begin update application_branding_private.settings set logo_path = path; raise exception 'Direct table update accepted'; exception when insufficient_privilege then null; end;
  begin insert into application_branding_private.settings(singleton, owner_company_id) values (true, 1); raise exception 'Direct insert accepted'; exception when insufficient_privilege then null; end;
  begin delete from application_branding_private.settings; raise exception 'Direct delete accepted'; exception when insufficient_privilege then null; end;
  begin perform public.save_application_logo('https://example.invalid/logo.png', 0); raise exception 'Arbitrary URL accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.save_application_logo('logos/ba870000-0000-4000-8000-000000000006/ba870000-0000-4000-8000-000000000101.png', 0); raise exception 'Foreign path accepted'; exception when invalid_parameter_value then null; end;
  foreach suffix in array array['103', '104', '105', '106', '999'] loop
    begin
      perform public.save_application_logo('logos/ba870000-0000-4000-8000-000000000001/ba870000-0000-4000-8000-000000000' || suffix || '.png', 0);
      raise exception 'Invalid or missing object accepted: %', suffix;
    exception when invalid_parameter_value then null; end;
  end loop;
  result := public.save_application_logo(path, 0);
  assert result->>'logoPath' = path and (result->>'revision')::integer = 1 and result->>'updatedAt' is not null, 'Upload publication failed';
  begin perform public.save_application_logo(null, 0); raise exception 'Stale revision accepted'; exception when serialization_failure then null; end;
  begin perform public.save_application_logo(null, null); raise exception 'Missing revision accepted'; exception when serialization_failure then null; end;
  delete from storage.objects where bucket_id = 'application-branding' and name = path;
  get diagnostics affected = row_count;
  assert affected = 0 and exists(select 1 from storage.objects where bucket_id = 'application-branding' and name = path), 'Current logo was deleted';
  update storage.objects set metadata = '{"mimetype":"image/png","size":1}' where bucket_id = 'application-branding' and name = path;
  get diagnostics affected = row_count;
  assert affected = 0, 'Immutable logo bytes metadata could be overwritten';
  delete from storage.objects where bucket_id = 'application-branding' and name = 'logos/ba870000-0000-4000-8000-000000000001/ba870000-0000-4000-8000-000000000102.webp';
  get diagnostics affected = row_count;
  assert affected = 1, 'Unused owned upload cleanup failed';
  begin
    insert into storage.objects(bucket_id, name, owner_id, metadata)
    values ('application-branding', 'logos/ba870000-0000-4000-8000-000000000001/ba870000-0000-4000-8000-000000000107.png', 'ba870000-0000-4000-8000-000000000006', '{"mimetype":"image/png","size":128}');
    raise exception 'Spoofed upload owner accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);
do $$
declare result jsonb;
begin
  result := public.get_application_branding();
  assert result->>'logoPath' = 'logos/ba870000-0000-4000-8000-000000000001/ba870000-0000-4000-8000-000000000101.png'
    and (result->>'revision')::integer = 1 and result->'canManage' = 'false'::jsonb, 'Pre-login published logo is unreadable';
  assert not exists(select 1 from storage.objects where bucket_id = 'application-branding'), 'Anonymous published logo metadata leaked';
  begin perform public.save_application_logo(null, 1); raise exception 'Anonymous published logo reset accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'ba870000-0000-4000-8000-000000000001', true);
do $$
declare result jsonb; affected integer;
begin
  result := public.save_application_logo(null, 1);
  assert result->'logoPath' = 'null'::jsonb and (result->>'revision')::integer = 2, 'Default logo reset failed';
  delete from storage.objects where bucket_id = 'application-branding' and name = 'logos/ba870000-0000-4000-8000-000000000001/ba870000-0000-4000-8000-000000000101.png';
  get diagnostics affected = row_count;
  assert affected = 1, 'Former published logo cannot be cleaned after reset';
end $$;

do $$
declare actor record; result jsonb; affected integer;
begin
  for actor in select * from branding_actors where role_key <> 'admin' loop
    perform set_config('request.jwt.claim.sub', actor.actor::text, true);
    result := public.get_application_branding();
    assert result->'canManage' = 'false'::jsonb and (result->>'revision')::integer = 2, 'Restricted account received management access';
    assert not exists(select 1 from storage.objects where bucket_id = 'application-branding'), 'Restricted account listed logo metadata';
    delete from storage.objects where bucket_id = 'application-branding';
    get diagnostics affected = row_count;
    assert affected = 0, 'Restricted account deleted logo objects';
    begin perform public.save_application_logo(null, 2); raise exception 'Restricted account reset logo: %', actor.role_key; exception when insufficient_privilege then null; end;
    begin
      insert into storage.objects(bucket_id, name, owner_id, metadata)
      values ('application-branding', 'logos/' || actor.actor || '/ba870000-0000-4000-8000-000000000108.png', actor.actor::text, '{"mimetype":"image/png","size":128}');
      raise exception 'Restricted account uploaded logo: %', actor.role_key;
    exception when insufficient_privilege then null; end;
  end loop;
  perform set_config('request.jwt.claim.sub', '', true);
  assert public.get_application_branding()->'canManage' = 'false'::jsonb, 'Missing account can manage branding';
  begin perform public.save_application_logo(null, 2); raise exception 'Authenticated role without user wrote logo'; exception when insufficient_privilege then null; end;
end $$;
reset role;

do $$
begin
  begin update application_branding_private.settings set owner_company_id = (select id from public.companies where code = 'branding-other-test'); raise exception 'Global owner changed'; exception when check_violation then null; end;
  assert (select public from storage.buckets where id = 'application-branding'), 'Login logo bucket is not public';
  assert (select file_size_limit = 2097152 and allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'] from storage.buckets where id = 'application-branding'), 'Bucket image limits incorrect';
  assert not has_schema_privilege('anon', 'application_branding_private', 'USAGE'), 'Anonymous private schema access';
  assert not has_function_privilege('anon', 'public.save_application_logo(text,integer)', 'EXECUTE'), 'Anonymous save RPC access';
  assert not has_function_privilege('anon', 'application_branding_private.save_logo(text,integer)', 'EXECUTE'), 'Anonymous private writer access';
  assert not has_table_privilege('authenticated', 'application_branding_private.settings', 'SELECT,INSERT,UPDATE,DELETE'), 'Direct table privileges leaked';
end $$;
set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);
do $$
declare result jsonb;
begin
  result := public.get_application_branding();
  assert result->'logoPath' = 'null'::jsonb and (result->>'revision')::integer = 2 and result->'canManage' = 'false'::jsonb, 'Anonymous safe read failed';
  assert (select array_agg(key order by key) from jsonb_object_keys(result) key) = array['canManage', 'logoPath', 'revision', 'updatedAt'], 'Public response exposes private metadata';
  assert not exists(select 1 from storage.objects where bucket_id = 'application-branding'), 'Anonymous object metadata leaked';
  begin perform public.save_application_logo(null, 2); raise exception 'Anonymous reset accepted'; exception when insufficient_privilege then null; end;
  begin perform * from application_branding_private.settings; raise exception 'Anonymous direct table read accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'APPLICATION_BRANDING_LOGO_TEST_PASS' as result;
