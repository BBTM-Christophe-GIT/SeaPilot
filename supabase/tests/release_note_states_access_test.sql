-- Real authenticated identities for every profile; all changes roll back.
begin;
do $$
declare
  company bigint;
  actor uuid;
  other_actor uuid := gen_random_uuid();
  role_name text;
  affected integer;
begin
  select id into strict company from public.companies where code = 'bbtm';
  insert into auth.users(id,email) values(other_actor, other_actor::text || '@example.invalid');
  insert into public.user_release_note_states(user_id,note_id) values(other_actor,'fixture-other');
  foreach role_name in array array['admin','direction','armement','capitaine','marin'] loop
    actor := gen_random_uuid();
    insert into auth.users(id,email) values(actor, actor::text || '@example.invalid');
    insert into public.profiles(id,email,display_name,active_company_id) values(actor,actor::text || '@example.invalid','Release notes fixture',company);
    insert into public.company_memberships(company_id,user_id,active) values(company,actor,true) on conflict(company_id,user_id) do update set active=true;
    insert into public.user_roles(user_id,company_id,role_key) values(actor,company,role_name);
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    assert (select count(*) = 0 from public.user_release_note_states), 'Other users reading states leaked';
    insert into public.user_release_note_states(note_id) values('fixture-release');
    assert (select read_at is null from public.user_release_note_states where note_id='fixture-release'), 'Deferred note was marked read';
    update public.user_release_note_states set read_at=now() where note_id='fixture-release';
    get diagnostics affected = row_count;
    assert affected=1, 'Own acknowledgement denied';
    insert into public.user_release_note_states(note_id) values('fixture-release') on conflict(user_id,note_id) do nothing;
    assert (select read_at is not null from public.user_release_note_states where note_id='fixture-release'), 'Concurrent defer cleared acknowledgement';
    update public.user_release_note_states set read_at=now() where user_id=other_actor;
    get diagnostics affected = row_count;
    assert affected=0, 'Other account can be updated';
    begin
      insert into public.user_release_note_states(user_id,note_id) values(other_actor,'fixture-forged');
      raise exception 'Cross-account insert accepted';
    exception when insufficient_privilege then null;
    end;
    begin
      update public.user_release_note_states set user_id=other_actor where note_id='fixture-release';
      raise exception 'Ownership transfer accepted';
    exception when insufficient_privilege then null;
    end;
    begin
      delete from public.user_release_note_states where note_id='fixture-release';
      raise exception 'Client deletion accepted';
    exception when insufficient_privilege then null;
    end;
    execute 'reset role';
  end loop;
  execute 'set local role anon';
  begin
    perform * from public.user_release_note_states;
    raise exception 'Anonymous read accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.user_release_note_states(user_id,note_id) values(other_actor,'anon');
    raise exception 'Anonymous write accepted';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
end $$;
select 'release note RLS: five real profiles, isolation and persistence checks passed' as result;
rollback;
