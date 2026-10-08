-- Standalone integration assertions; always roll back fixtures and mutations.
begin;
insert into public.companies(code,name) values ('generic-crew-fixture','Generic crew fixture'),('generic-crew-other','Other fixture');
insert into auth.users(id,email) select ('7c927000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  'generic-crew-'||n||'@example.invalid' from generate_series(1,5) n;
insert into public.profiles(id,email,display_name,active_company_id)
select u.id,u.email,'Generic fixture',c.id from auth.users u cross join public.companies c
where u.email like 'generic-crew-%@example.invalid' and c.code='generic-crew-fixture';
insert into public.company_memberships(company_id,user_id,active)
select active_company_id,id,true from public.profiles where email like 'generic-crew-%@example.invalid'
on conflict(company_id,user_id) do update set active=true;
insert into public.user_roles(user_id,company_id,role_key)
select ('7c927000-0000-0000-0000-'||lpad(f.n::text,12,'0'))::uuid,c.id,f.role
from (values(1,'admin'),(2,'direction'),(3,'armement'),(4,'capitaine'),(5,'marin')) f(n,role)
cross join public.companies c where c.code='generic-crew-fixture';
insert into public.vessels(company_id,name,acronym) select id,'GENERIC TEST','GNT' from public.companies where code='generic-crew-fixture';
insert into public.vessels(company_id,name,acronym) select id,'GENERIC OTHER','GNO' from public.companies where code='generic-crew-other';
insert into public.people(company_id,first_name,last_name,function_label,hired_on,active)
select id,'Generic','Target','2nd Capitaine','2026-01-01',true from public.companies where code='generic-crew-fixture';
create temporary table generic_fixture_ids as select c.id company_id,v.id vessel_id,p.id person_id
from public.companies c join public.vessels v on v.company_id=c.id join public.people p on p.company_id=c.id
where c.code='generic-crew-fixture';
grant select on generic_fixture_ids to authenticated;
insert into public.planning_generic_crew_rows(company_id,vessel_id,watch_group,function_label,created_by)
select c.id,v.id,'Other','Capitaine','7c927000-0000-0000-0000-000000000001' from public.companies c
join public.vessels v on v.company_id=c.id where c.code='generic-crew-other';

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','7c927000-0000-0000-0000-000000000001',true);
do $$
declare f record; draft public.planning_generic_crew_rows; saved public.planning_generic_crew_rows; board_id bigint; profile integer;
begin
  select * into f from generic_fixture_ids;
  assert (select count(*)=0 from public.planning_generic_crew_rows), 'other company draft leaked';
  assert not has_table_privilege('authenticated','public.planning_generic_crew_rows','INSERT'), 'direct draft insert allowed';
  assert not has_table_privilege('anon','public.planning_generic_crew_rows','SELECT'), 'anonymous read allowed';
  assert not has_function_privilege('anon','public.planning_resolve_generic_crew_row(bigint,integer,bigint,date)','EXECUTE'), 'anonymous replacement allowed';
  perform public.planning_save_personal_display_settings(true);
  for profile in 1..3 loop
    perform set_config('request.jwt.claim.sub','7c927000-0000-0000-0000-'||lpad(profile::text,12,'0'),true);
    if profile>1 then assert (select count(*)=0 from public.planning_personal_display_settings), 'personal filter leaked'; end if;
    draft := public.planning_save_generic_crew_row(f.vessel_id,'Bordée '||profile,'Capitaine');
    saved := public.planning_save_generic_crew_row(f.vessel_id,draft.watch_group,'Capitaine',draft.id,draft.revision,
      '[{"id":"sea","startsOn":"2026-10-01","endsOn":"2026-10-03","status":"En Mer","comments":"Préparation"},
        {"id":"rest","startsOn":"2026-10-04","endsOn":"2026-10-05","status":"Repos","comments":"Relève"}]');
    begin
      perform public.planning_resolve_generic_crew_row(saved.id,draft.revision,f.person_id,'2026-10-01');
      raise exception 'stale replacement succeeded';
    exception when serialization_failure then null; end;
    if profile=1 then
      board_id := public.planning_resolve_generic_crew_row(saved.id,saved.revision,f.person_id,'2026-10-01');
      assert board_id is not null, 'replacement row missing';
      assert not exists(select 1 from public.planning_generic_crew_rows where id=saved.id), 'resolved draft kept';
      assert (select count(*)=2 from public.planning_assignments where crew_person_id=f.person_id), 'periods lost';
      assert exists(select 1 from public.planning_assignments where crew_person_id=f.person_id and assignment_role='Capitaine'
        and starts_on='2026-10-04' and ends_on='2026-10-05' and status_label='Repos' and comments='Relève'), 'dates/status/function/notes lost';
    else
      begin
        perform public.planning_resolve_generic_crew_row(saved.id,saved.revision,f.person_id,'2026-10-01');
        raise exception 'overlap accepted';
      exception when unique_violation then null; end;
      assert exists(select 1 from public.planning_generic_crew_rows where id=saved.id and periods=saved.periods), 'failed replacement lost draft';
      assert not exists(select 1 from public.planning_board_rows where person_id=f.person_id and watch_group=saved.watch_group), 'failed replacement left partial row';
    end if;
    begin
      perform public.planning_save_generic_crew_row(f.vessel_id,'Bordée 4','Matelot',null,null,
        '[{"id":"a","startsOn":"2026-10-01","endsOn":"2026-10-03","status":"En Mer"},
          {"id":"b","startsOn":"2026-10-03","endsOn":"2026-10-04","status":"Repos"}]');
      raise exception 'overlapping draft periods accepted';
    exception when invalid_parameter_value then null; end;
  end loop;
  for profile in 4..5 loop
    perform set_config('request.jwt.claim.sub','7c927000-0000-0000-0000-'||lpad(profile::text,12,'0'),true);
    assert (select count(*)=0 from public.planning_generic_crew_rows), 'Marin/Capitaine read unpublished drafts';
    begin
      perform public.planning_save_generic_crew_row(f.vessel_id,'Bordée 6','Capitaine');
      raise exception 'Marin/Capitaine created draft';
    exception when insufficient_privilege then null; end;
    begin
      perform public.planning_resolve_generic_crew_row(saved.id,saved.revision,f.person_id,'2026-10-01');
      raise exception 'Marin/Capitaine resolved draft';
    exception when insufficient_privilege then null; end;
    perform public.planning_save_personal_display_settings(false);
    assert (select count(*)=1 from public.planning_personal_display_settings), 'personal filter isolation failed';
    begin
      insert into public.planning_personal_display_settings(company_id,user_id,active_filter_enabled)
      values(f.company_id,'7c927000-0000-0000-0000-000000000001',false)
      on conflict(company_id,user_id) do update set active_filter_enabled=false;
      raise exception 'another account preference overwritten';
    exception when insufficient_privilege then null; end;
  end loop;
end;
$$;
rollback;
