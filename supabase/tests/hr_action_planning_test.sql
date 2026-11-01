-- Transactional role fixtures, no profile simulation or production writes.
begin;
create temporary table hr_action_test_roles(user_id uuid, role_key text);
insert into hr_action_test_roles values
  ('79000000-0000-0000-0000-000000000201', 'admin'),
  ('79000000-0000-0000-0000-000000000202', 'direction'),
  ('79000000-0000-0000-0000-000000000203', 'armement'),
  ('79000000-0000-0000-0000-000000000204', 'marin'),
  ('79000000-0000-0000-0000-000000000205', 'capitaine');
grant select on hr_action_test_roles to authenticated;
insert into auth.users(id,email)
select user_id, role_key || '-hr-actions@example.invalid' from hr_action_test_roles;
insert into public.profiles(id,email,display_name,active_company_id)
select fixture.user_id, fixture.role_key || '-hr-actions@example.invalid', 'RH action fixture', company.id
from hr_action_test_roles fixture cross join public.companies company where company.code = 'bbtm';
insert into public.company_memberships(company_id,user_id,active)
select company.id,fixture.user_id,true from hr_action_test_roles fixture
cross join public.companies company where company.code = 'bbtm'
on conflict(company_id,user_id) do update set active = true;
insert into public.user_roles(user_id,company_id,role_key)
select fixture.user_id, company.id, fixture.role_key
from hr_action_test_roles fixture cross join public.companies company where company.code = 'bbtm';
insert into public.people(company_id,user_id,first_name,last_name,active)
select company.id,fixture.user_id,'RHAction',fixture.role_key,true
from hr_action_test_roles fixture cross join public.companies company where company.code = 'bbtm';
insert into public.hr_action_plans(company_id,person_id,kind,title,scheduled_on,location)
select p.company_id,p.id,'medical_visit','Action fixture',current_date + 10,'Le Havre'
from public.people p join hr_action_test_roles fixture on fixture.user_id = p.user_id;
create temporary table hr_action_test_scope(key text primary key,id bigint,company_id bigint);
grant select on hr_action_test_scope to authenticated;
insert into public.companies(code,name) values('hr-action-other-fixture','RH action other company');
with inserted as (
  insert into public.people(company_id,first_name,last_name,active)
  select id,'Other','RHActionCompany',true from public.companies where code = 'hr-action-other-fixture' returning id,company_id
) insert into hr_action_test_scope select 'other-person',id,company_id from inserted;
with inserted as (
  insert into public.hr_documents(company_id,person_id,category_key,title,status)
  select company_id,id,'certificate','Foreign action document','valid' from hr_action_test_scope where key = 'other-person' returning id,company_id
) insert into hr_action_test_scope select 'other-document',id,company_id from inserted;
insert into public.hr_action_plans(company_id,person_id,kind,title,scheduled_on,location)
select company_id,id,'medical_visit','Other company appointment',current_date + 10,'Other port'
from hr_action_test_scope where key = 'other-person';
with inserted as (
  insert into public.hr_documents(company_id,person_id,category_key,title,status)
  select p.company_id,p.id,'certificate','Different employee certificate','valid'
  from public.people p where p.user_id = '79000000-0000-0000-0000-000000000202' returning id,company_id
) insert into hr_action_test_scope select 'different-person-document',id,company_id from inserted;
insert into public.vessels(company_id,name,acronym,active)
select id,'HR ACTION TEST WATCH','HRAT',true from public.companies where code = 'bbtm';
insert into public.planning_assignments(company_id,vessel_id,crew_person_id,captain_person_id,starts_on,ends_on,watch_group,confirmation_status,source_label)
select company.id,vessel.id,person.id,captain.id,current_date,current_date + 15,'HR-ACTION-WATCH','confirmed','hr-action-fixture'
from public.companies company join public.vessels vessel on vessel.company_id = company.id and vessel.name = 'HR ACTION TEST WATCH'
join public.people person on person.company_id = company.id and person.user_id in ('79000000-0000-0000-0000-000000000204','79000000-0000-0000-0000-000000000205')
join public.people captain on captain.company_id = company.id and captain.user_id = '79000000-0000-0000-0000-000000000205'
where company.code = 'bbtm';
insert into public.hr_action_plans(company_id,person_id,kind,title,scheduled_on,location)
select company_id,id,'annual_review','Private review action',current_date + 10,'Bureau'
from public.people where user_id = '79000000-0000-0000-0000-000000000204';

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
do $$
declare fixture record; person_value bigint; action_value bigint; affected integer; foreign_value bigint; foreign_company bigint;
begin
  for fixture in select * from hr_action_test_roles loop
    perform set_config('request.jwt.claim.sub',fixture.user_id::text,true);
    person_value := public.current_person_id();
    select id into action_value from public.hr_action_plans where person_id = person_value and title = 'Action fixture';
    assert action_value is not null, 'Each real profile reads own appointment';
    assert not exists(select 1 from public.hr_action_plans where title = 'Other company appointment'), 'Every profile is isolated from other company actions';
    if fixture.role_key in ('admin','direction','armement') then
      insert into public.hr_action_plans(person_id,kind,title,due_on,scheduled_on,location)
      values(person_value,'certificate','Managers can plan',current_date + 30,current_date + 10,'Formation Le Havre') returning id into action_value;
      begin
        update public.hr_action_plans set scheduled_on = null where id = action_value;
        raise exception 'Incomplete planned booking was accepted';
      exception when check_violation then null;
      end;
      if fixture.role_key <> 'direction' then
        select id into foreign_value from hr_action_test_scope where key = 'different-person-document';
        begin
          update public.hr_action_plans set document_id = foreign_value where id = action_value;
          raise exception 'Different employee document link was accepted';
        exception when check_violation then null;
        end;
      end if;
      select id,company_id into foreign_value,foreign_company from hr_action_test_scope where key = 'other-person';
      begin
        update public.hr_action_plans set person_id = foreign_value where id = action_value;
        raise exception 'Cross-company person link was accepted';
      exception when check_violation then null;
      end;
      begin
        update public.hr_action_plans set company_id = foreign_company where id = action_value;
        raise exception 'Cross-company reassignment was accepted';
      exception when check_violation or insufficient_privilege then null;
      end;
      select id into foreign_value from hr_action_test_scope where key = 'other-document';
      begin
        update public.hr_action_plans set document_id = foreign_value where id = action_value;
        raise exception 'Cross-company document link was accepted';
      exception when check_violation then null;
      end;
      update public.hr_action_plans set owner_name = 'RH',notes = 'Booking confirmed' where id = action_value;
      get diagnostics affected = row_count;
      assert affected = 1, 'Managers share appointment updates';
      begin
        update public.hr_action_plans set status = 'completed',completed_on = current_date + 1 where id = action_value;
        raise exception 'Future completion was accepted';
      exception when check_violation then null;
      end;
      update public.hr_action_plans set status = 'completed',completed_on = current_date where id = action_value;
      assert exists(select 1 from public.hr_action_plans where id = action_value and completed_on = current_date), 'Real completion can be recorded';
      delete from public.hr_action_plans where id = action_value;
      get diagnostics affected = row_count;
      assert affected = 1, 'Managers delete an appointment';
    else
      begin
        insert into public.hr_action_plans(person_id,kind,title,scheduled_on,location)
        values(person_value,'certificate','Forbidden',current_date + 10,'Le Havre');
        raise exception 'Restricted profile inserted an appointment';
      exception when insufficient_privilege then null;
      end;
      update public.hr_action_plans set location = 'Forbidden' where id = action_value;
      get diagnostics affected = row_count;
      assert affected = 0, 'Marin and Capitaine cannot edit appointments';
      delete from public.hr_action_plans where id = action_value;
      get diagnostics affected = row_count;
      assert affected = 0, 'Marin and Capitaine cannot delete appointments';
      if fixture.role_key = 'marin' then
        assert not exists(select 1 from public.hr_action_plans where person_id <> person_value and title = 'Action fixture'), 'Marin cannot read other employees appointments';
      end if;
      if fixture.role_key = 'capitaine' then
        assert exists(select 1 from public.hr_action_plans a join public.people p on p.id = a.person_id
          where p.user_id = '79000000-0000-0000-0000-000000000204' and a.title = 'Action fixture'), 'Captain reads same-watch teammate appointment';
        assert not exists(select 1 from public.hr_action_plans a join public.people p on p.id = a.person_id
          where p.user_id = '79000000-0000-0000-0000-000000000202' and a.title = 'Action fixture'), 'Captain cannot read unrelated employee appointment';
        assert not exists(select 1 from public.hr_action_plans where title = 'Private review action'), 'Captain watch access does not disclose private review planning';
      end if;
    end if;
    if fixture.role_key = 'armement' then
      begin
        insert into public.hr_action_plans(person_id,kind,title,scheduled_on,location)
        values(person_value,'annual_review','Forbidden interview',current_date + 10,'Le Havre');
        raise exception 'Armement bypassed annual interview write restriction';
      exception when insufficient_privilege then null;
      end;
    end if;
  end loop;
end;
$$;
reset role;
select 'PASS: RH action manager CRUD, real completion, company/document isolation and real Marin/Capitaine watch boundaries' as result;
rollback;
