-- Real authenticated role fixtures; every row and mutation is rolled back.
begin;

insert into public.companies(code,name) values
  ('paternity-status-fixture','Paternity status fixture'),
  ('paternity-status-other','Other paternity fixture');
insert into auth.users(id,email)
select ('7c928000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  'paternity-status-'||n||'@example.invalid' from generate_series(1,5) n;
insert into public.profiles(id,email,display_name,active_company_id)
select u.id,u.email,'Paternity fixture',c.id from auth.users u cross join public.companies c
where u.id::text like '7c928000-%' and c.code='paternity-status-fixture';
insert into public.company_memberships(company_id,user_id,active)
select active_company_id,id,true from public.profiles where id::text like '7c928000-%'
on conflict(company_id,user_id) do update set active=true;
insert into public.user_roles(user_id,company_id,role_key)
select ('7c928000-0000-0000-0000-'||lpad(f.n::text,12,'0'))::uuid,c.id,f.role
from (values(1,'admin'),(2,'direction'),(3,'armement'),(4,'marin'),(5,'capitaine')) f(n,role)
cross join public.companies c where c.code='paternity-status-fixture';
insert into public.vessels(company_id,name,acronym,active)
select id,'PATERNITY TEST','PAT',true from public.companies where code='paternity-status-fixture';
insert into public.vessels(company_id,name,acronym,active)
select id,'PATERNITY OTHER','PAO',true from public.companies where code='paternity-status-other';
insert into public.people(company_id,user_id,first_name,last_name,function_label,active)
select c.id,case when n>3 then ('7c928000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid end,
  'Paternity','Fixture '||n,case when n=5 then 'Capitaine' else 'Matelot' end,true
from public.companies c cross join generate_series(1,5) n where c.code='paternity-status-fixture';
insert into public.people(company_id,first_name,last_name,function_label,active)
select id,'Paternity','Foreign fixture','Matelot',true from public.companies where code='paternity-status-other';
insert into public.planning_assignments(company_id,vessel_id,crew_person_id,starts_on,ends_on,
  assignment_role,status_label,watch_group,confirmation_status)
select p.company_id,v.id,p.id,current_date+10,current_date+16,p.function_label,'En Mer','Paternity','confirmed'
from public.people p join public.vessels v on v.company_id=p.company_id
where p.last_name like 'Fixture %' and v.name='PATERNITY TEST';
insert into public.planning_assignments(company_id,vessel_id,crew_person_id,starts_on,ends_on,
  assignment_role,status_label,watch_group,confirmation_status)
select p.company_id,v.id,p.id,current_date+10,current_date+16,'Matelot','En Mer','Foreign','confirmed'
from public.people p join public.vessels v on v.company_id=p.company_id where p.last_name='Foreign fixture';

create temporary table paternity_fixture_ids as
select p.company_id,v.id vessel_id,p.id person_id,a.id assignment_id,p.user_id,
  case when p.last_name='Foreign fixture' then 0 else right(p.last_name,1)::integer end profile_number,
  a.starts_on
from public.people p join public.vessels v on v.company_id=p.company_id
join public.planning_assignments a on a.crew_person_id=p.id and a.vessel_id=v.id
where v.name in ('PATERNITY TEST','PATERNITY OTHER');
grant select on paternity_fixture_ids to authenticated;

do $$
declare signature regprocedure;
begin
  foreach signature in array array[
    'public.save_planning_assignment_day_details(bigint,date,text,text,text)'::regprocedure,
    'public.save_planning_assignment_day_details_range(bigint,date,date,text,text,text)'::regprocedure,
    'public.save_planning_assignment_day_state(bigint,date,text,text)'::regprocedure,
    'public.save_planning_assignment_day_states(bigint,date,date,text,text)'::regprocedure,
    'public.apply_planning_grid_cells(jsonb)'::regprocedure,
    'public.move_planning_grid_cells(jsonb,jsonb,text)'::regprocedure,
    'public.planning_save_generic_crew_row(bigint,text,text,bigint,integer,jsonb)'::regprocedure
  ] loop
    assert not has_function_privilege('anon',signature,'EXECUTE'), 'anonymous write granted';
    assert has_function_privilege('authenticated',signature,'EXECUTE'), 'authenticated RPC grant lost';
  end loop;
  assert not (select prosecdef from pg_proc where oid='public.save_planning_assignment_day_details(bigint,date,text,text,text)'::regprocedure), 'daily RPC unexpectedly privileged';
  assert not (select prosecdef from pg_proc where oid='public.apply_planning_grid_cells(jsonb)'::regprocedure), 'grid RPC unexpectedly privileged';
  assert (select prosecdef from pg_proc where oid='public.planning_save_generic_crew_row(bigint,text,text,bigint,integer,jsonb)'::regprocedure), 'existing generic security model changed';
  assert not public.planning_status_is_working('Congés Paternité'), 'paternity incorrectly counted as operational work';
  assert private.planning_calendar_status('Congés Paternité')='Indisponible', 'personal calendar leaks absence reason';
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);

do $$
declare
  f record; other_company record; profile integer; reader integer;
  draft public.planning_generic_crew_rows; revised public.planning_generic_crew_rows;
  result jsonb; payload jsonb; source_id bigint;
begin
  select * into other_company from paternity_fixture_ids where profile_number=0;
  for profile in 1..3 loop
    perform set_config('request.jwt.claim.sub','7c928000-0000-0000-0000-'||lpad(profile::text,12,'0'),true);
    select * into f from paternity_fixture_ids where profile_number=profile;
    assert not exists(select 1 from public.planning_assignments where id=other_company.assignment_id), 'foreign assignment leaked';
    perform public.save_planning_assignment_day_details(f.assignment_id,f.starts_on,'Congés Paternité','Naissance','Matelot');
    perform public.save_planning_assignment_day_details_range(f.assignment_id,f.starts_on+1,f.starts_on+2,'Congés Paternité','Famille','Matelot');
    perform public.save_planning_assignment_day_states(f.assignment_id,f.starts_on+3,f.starts_on+4,'Congés Paternité','Famille');
    perform public.save_planning_assignment_day_note(f.assignment_id,f.starts_on,'Commentaire conservé');
    perform public.apply_planning_grid_cells(jsonb_build_array(jsonb_build_object(
      'assignmentId',f.assignment_id,'personId',f.person_id,'vesselId',f.vessel_id,'workDate',f.starts_on+5,
      'watchGroup','Paternity','functionLabel','Matelot','status','Congés Paternité','note','Grille')));
    assert (select count(*)=6 from public.planning_days where slot365='assignment:'||f.assignment_id and sailor_status='Congés Paternité'), 'daily/range/grid paternity state lost';
    assert exists(select 1 from public.planning_days where slot365='assignment:'||f.assignment_id and work_date=f.starts_on and comments='Commentaire conservé'), 'legacy comment lost paternity status';
    assert exists(select 1 from public.planning_assignments where id=f.assignment_id and status_label='En Mer'), 'daily override rewrote base assignment';
    begin
      perform public.save_planning_assignment_day_details_range(f.assignment_id,f.starts_on+6,f.starts_on+7,'Congés Paternité','Invalid','Matelot');
      raise exception 'out-of-assignment range accepted';
    exception when foreign_key_violation then null; end;
    assert not exists(select 1 from public.planning_days where slot365='assignment:'||f.assignment_id and work_date=f.starts_on+6), 'failed range left partial day';
    begin
      perform public.save_planning_assignment_day_state(f.assignment_id,f.starts_on,'Statut inconnu','');
      raise exception 'unknown status accepted';
    exception when invalid_parameter_value then null; end;
    perform public.save_planning_assignment_day_state(f.assignment_id,f.starts_on+6,'Congés Paternités','Historique');
    perform public.save_planning_assignment_day_note(f.assignment_id,f.starts_on+6,'Commentaire historique');
    assert exists(select 1 from public.planning_days where slot365='assignment:'||f.assignment_id and work_date=f.starts_on+6 and sailor_status='Congés Paternités' and comments='Commentaire historique'), 'comment update lost legacy plural status';

    -- Painted cells compact to a native period. Pasted and moved cells keep it.
    result := public.apply_planning_grid_cells(jsonb_build_array(
      jsonb_build_object('personId',f.person_id,'vesselId',f.vessel_id,'workDate',f.starts_on+10,'watchGroup','Paternity','functionLabel','Matelot','status','Congés Paternité','note',''),
      jsonb_build_object('personId',f.person_id,'vesselId',f.vessel_id,'workDate',f.starts_on+11,'watchGroup','Paternity','functionLabel','Matelot','status','Congés Paternité','note','')));
    assert result->>'createdAssignments'='1' and result->>'savedCells'='2', 'painted paternity period did not compact';
    assert exists(select 1 from public.planning_assignments where crew_person_id=f.person_id and starts_on=f.starts_on+10 and ends_on=f.starts_on+11 and status_label='Congés Paternité'), 'native paternity period missing';
    perform public.apply_planning_grid_cells(jsonb_build_array(jsonb_build_object(
      'personId',f.person_id,'vesselId',f.vessel_id,'workDate',f.starts_on+12,'watchGroup','Paternity','functionLabel','Matelot','status','Congés Paternité','note','Copie')));
    select id into source_id from public.planning_assignments where crew_person_id=f.person_id and starts_on=f.starts_on+12;
    perform public.move_planning_grid_cells(
      jsonb_build_array(jsonb_build_object('assignmentId',source_id,'workDate',f.starts_on+12)),
      jsonb_build_array(jsonb_build_object('personId',f.person_id,'vesselId',f.vessel_id,'workDate',f.starts_on+13,'watchGroup','Paternity','functionLabel','Matelot','status','Congés Paternité','note','Copie')),
      'Déplacement de recette');
    assert not exists(select 1 from public.planning_assignments where id=source_id), 'moved source retained';
    assert exists(select 1 from public.planning_assignments where crew_person_id=f.person_id and starts_on=f.starts_on+13 and status_label='Congés Paternité'), 'moved target status lost';
    assert exists(select 1 from public.planning_change_log where company_id=f.company_id and entity_id=source_id and action='unassign'), 'move audit missing';
    perform public.apply_planning_grid_cells(jsonb_build_array(jsonb_build_object(
      'personId',f.person_id,'vesselId',f.vessel_id,'workDate',f.starts_on+14,'watchGroup','Paternity','functionLabel','Matelot','status','Congés Paternités','note','Historique')));
    assert exists(select 1 from public.planning_assignments where crew_person_id=f.person_id and starts_on=f.starts_on+14 and status_label='Congés Paternités'), 'legacy plural grid status no longer writable';

    payload := jsonb_build_array(
      jsonb_build_object('id','paternity','startsOn',f.starts_on+20,'endsOn',f.starts_on+20,'status','Congés Paternité','comments','Naissance'),
      jsonb_build_object('id','accident','startsOn',f.starts_on+21,'endsOn',f.starts_on+21,'status','Accident du Travail'),
      jsonb_build_object('id','illness','startsOn',f.starts_on+22,'endsOn',f.starts_on+22,'status','Arrêt Maladie'),
      jsonb_build_object('id','legacy','startsOn',f.starts_on+23,'endsOn',f.starts_on+23,'status','Congés Paternités'));
    draft := public.planning_save_generic_crew_row(f.vessel_id,'Paternity draft '||profile,'Matelot',null,null,payload);
    revised := public.planning_save_generic_crew_row(f.vessel_id,draft.watch_group,'Matelot',draft.id,draft.revision,payload);
    begin
      perform public.planning_resolve_generic_crew_row(revised.id,draft.revision,f.person_id,f.starts_on);
      raise exception 'stale generic revision accepted';
    exception when serialization_failure then null; end;
    perform public.planning_resolve_generic_crew_row(revised.id,revised.revision,f.person_id,f.starts_on);
    assert not exists(select 1 from public.planning_generic_crew_rows where id=revised.id), 'resolved draft retained';
    assert (select count(*)=3 from public.planning_assignments where crew_person_id=f.person_id and starts_on between f.starts_on+20 and f.starts_on+22 and status_label in ('Congés Paternité','Accident du Travail','Arrêt Maladie')), 'resolved absence statuses lost';
    assert exists(select 1 from public.planning_assignments where crew_person_id=f.person_id and starts_on=f.starts_on+23 and status_label='Congés Paternités'), 'legacy plural generic period lost';
    draft := public.planning_save_generic_crew_row(f.vessel_id,'Conflicting draft '||profile,'Matelot',null,null,
      jsonb_build_array(jsonb_build_object('id','conflict','startsOn',f.starts_on+10,'endsOn',f.starts_on+10,'status','Congés Paternité')));
    begin
      perform public.planning_resolve_generic_crew_row(draft.id,draft.revision,f.person_id,f.starts_on);
      raise exception 'overlapping real assignment accepted';
    exception when unique_violation then null; end;
    assert exists(select 1 from public.planning_generic_crew_rows where id=draft.id and periods=draft.periods), 'conflict removed prepared period';

    begin
      perform public.save_planning_assignment_day_state(other_company.assignment_id,f.starts_on,'Congés Paternité','');
      raise exception 'foreign daily write accepted';
    exception when foreign_key_violation or insufficient_privilege then null; end;
    begin
      perform public.apply_planning_grid_cells(jsonb_build_array(jsonb_build_object(
        'personId',other_company.person_id,'vesselId',other_company.vessel_id,'workDate',f.starts_on,'status','Congés Paternité')));
      raise exception 'foreign grid write accepted';
    exception when foreign_key_violation or insufficient_privilege then null; end;
    begin
      perform public.planning_save_generic_crew_row(other_company.vessel_id,'Foreign','Matelot',null,null,payload);
      raise exception 'foreign generic write accepted';
    exception when no_data_found or insufficient_privilege then null; end;
  end loop;

  -- Populate both readers' own daily overrides through a permitted office user.
  for reader in 4..5 loop
    select * into f from paternity_fixture_ids where profile_number=reader;
    perform public.save_planning_assignment_day_state(f.assignment_id,f.starts_on,'Congés Paternité','Lecture');
  end loop;
  for reader in 4..5 loop
    perform set_config('request.jwt.claim.sub','7c928000-0000-0000-0000-'||lpad(reader::text,12,'0'),true);
    select * into f from paternity_fixture_ids where profile_number=reader;
    assert exists(select 1 from public.planning_days where slot365='assignment:'||f.assignment_id and sailor_status='Congés Paternité'), 'Marin/Capitaine cannot read own status';
    assert not exists(select 1 from public.planning_assignments where id=other_company.assignment_id), 'Marin/Capitaine read foreign company';
    assert not exists(select 1 from public.planning_generic_crew_rows), 'Marin/Capitaine read unpublished drafts';
    begin
      perform public.save_planning_assignment_day_state(f.assignment_id,f.starts_on,'Congés Paternité','Interdit');
      raise exception 'Marin/Capitaine daily write accepted';
    exception when insufficient_privilege or foreign_key_violation then null; end;
    begin
      perform public.save_planning_assignment_day_details_range(f.assignment_id,f.starts_on,f.starts_on+1,'Congés Paternité','','Matelot');
      raise exception 'Marin/Capitaine range write accepted';
    exception when insufficient_privilege or foreign_key_violation then null; end;
    begin
      perform public.apply_planning_grid_cells(jsonb_build_array(jsonb_build_object(
        'assignmentId',f.assignment_id,'personId',f.person_id,'vesselId',f.vessel_id,'workDate',f.starts_on,'status','Congés Paternité')));
      raise exception 'Marin/Capitaine grid write accepted';
    exception when insufficient_privilege or foreign_key_violation then null; end;
    begin
      perform public.planning_save_generic_crew_row(f.vessel_id,'Denied','Matelot',null,null,payload);
      raise exception 'Marin/Capitaine generic write accepted';
    exception when insufficient_privilege then null; end;
    assert exists(select 1 from public.planning_days where slot365='assignment:'||f.assignment_id and comments='Lecture'), 'rejected reader write mutated state';
  end loop;
end;
$$;

rollback;
select 'planning_paternity_status_test: passed (five real roles; fixtures rolled back)' as result;
