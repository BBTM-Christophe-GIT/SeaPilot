-- Transactional fixtures use actual authenticated roles, never profile preview.
begin;
insert into public.companies(code, name) values
  ('test-field-fleet', 'Field fleet test'), ('test-field-other', 'Other company test');
insert into auth.users(id, email) values
  ('a2100000-0000-0000-0000-000000000001', 'field-captain@example.invalid'),
  ('a2100000-0000-0000-0000-000000000002', 'field-sailor@example.invalid'),
  ('a2100000-0000-0000-0000-000000000003', 'field-other@example.invalid'),
  ('a2100000-0000-0000-0000-000000000004', 'field-no-role@example.invalid');
insert into public.profiles(id, email, display_name, active_company_id)
select u.id, u.email, 'Field test', c.id from auth.users u cross join public.companies c
where u.id in ('a2100000-0000-0000-0000-000000000001', 'a2100000-0000-0000-0000-000000000002', 'a2100000-0000-0000-0000-000000000003', 'a2100000-0000-0000-0000-000000000004')
  and c.code = case when u.id = 'a2100000-0000-0000-0000-000000000003' then 'test-field-other' else 'test-field-fleet' end;
insert into public.company_memberships(user_id, company_id, active)
select id, active_company_id, true from public.profiles
where id in ('a2100000-0000-0000-0000-000000000001', 'a2100000-0000-0000-0000-000000000002', 'a2100000-0000-0000-0000-000000000003', 'a2100000-0000-0000-0000-000000000004')
on conflict (user_id, company_id) do update set active = true;
insert into public.user_roles(user_id, company_id, role_key)
select id, active_company_id, case when id = 'a2100000-0000-0000-0000-000000000002' then 'marin' else 'capitaine' end
from public.profiles where id in ('a2100000-0000-0000-0000-000000000001', 'a2100000-0000-0000-0000-000000000002', 'a2100000-0000-0000-0000-000000000003');
insert into public.vessels(company_id, name, acronym)
select c.id, v.name, v.acronym from public.companies c
cross join (values ('FIELD ALPHA', 'FA'), ('FIELD BRAVO', 'FB')) v(name, acronym)
where c.code = 'test-field-fleet';
insert into public.vessels(company_id, name, acronym)
select id, 'FIELD FOREIGN', 'FF' from public.companies where code = 'test-field-other';
set local session_replication_role = replica;
insert into public.projects(company_id, project_code, title)
select c.id, p.code, p.title from public.companies c
cross join (values ('FIELD-OLD', 'Historical DPR project'), ('FIELD-SECOND', 'Second DPR project'), ('FIELD-HIDDEN', 'No visible DPR')) p(code, title)
where c.code in ('test-field-fleet', 'test-field-other');
set local session_replication_role = replica;
insert into public.dpr_reports(company_id, report_date, project_id, issuer_name_snapshot, created_by, source_label)
select p.company_id, current_date - 30, p.id, 'Field test',
  case when p.project_code = 'FIELD-OLD' then 'a2100000-0000-0000-0000-000000000002'::uuid else 'a2100000-0000-0000-0000-000000000001'::uuid end, 'sharepoint'
from public.projects p join public.companies c on c.id = p.company_id
where c.code in ('test-field-fleet', 'test-field-other') and p.project_code <> 'FIELD-HIDDEN';
set local session_replication_role = origin;
-- No HR identity or assignment is needed to consult other vessels. The page
-- falls back to the full fleet when there is no current personal posting.
insert into public.planning_releases(company_id, version_number, snapshot, published_by, published_by_name)
select c.id, n, jsonb_build_object(
  'scope', jsonb_build_object('company_id', c.id),
  'assignments', jsonb_build_array(jsonb_build_object('vessel_id', v.id, 'crew_person_id', 999999, 'status_label', 'En Mer')),
  'days', jsonb_build_array(jsonb_build_object('vessel_id', v.id, 'person_id', 999999)),
  'periods', jsonb_build_array(jsonb_build_object('vessel_id', v.id, 'person_id', 999999)),
  'projects', jsonb_build_array(jsonb_build_object('primary_vessel_id', v.id, 'title', 'Released operation', 'charter_hire', 9999, 'hire_currency', 'EUR')),
  'handovers', jsonb_build_array(jsonb_build_object('vessel_id', v.id)),
  'derogations', jsonb_build_array(jsonb_build_object('vessel_id', v.id, 'person_id', 999999))
), 'a2100000-0000-0000-0000-000000000001', 'Publisher'
from public.companies c join public.vessels v on v.company_id = c.id and v.name = 'FIELD BRAVO'
cross join generate_series(1,2) n where c.code = 'test-field-fleet';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
do $$
declare actor text; released jsonb; section text; expected_projects integer;
begin
  foreach actor in array array['a2100000-0000-0000-0000-000000000001', 'a2100000-0000-0000-0000-000000000002'] loop
    perform set_config('request.jwt.claim.sub', actor, true);
    expected_projects := case when actor like '%002' then 1 else 2 end;
    if (select count(*) from public.dpr_report_projects()) <> expected_projects then raise exception 'DPR project scope failed for %', actor; end if;
    if not exists (select from public.dpr_report_projects() where project_code = 'FIELD-OLD' and title = 'Historical DPR project') then raise exception 'Historical DPR label missing'; end if;
    if exists (select from public.dpr_report_projects() where project_code = 'FIELD-HIDDEN') then raise exception 'Unrelated project exposed'; end if;
    if exists (select from public.projects) then raise exception 'Commercial catalog exposed'; end if;
    if (select count(*) from public.vessels) <> 2 then raise exception 'Fleet read missing or cross-company exposure'; end if;
    if public.planning_user_can('edit_event', public.current_planning_company_id()) then raise exception 'Planning write granted'; end if;
    if public.planning_user_can('read', public.current_planning_company_id()) then raise exception 'Live draft read widened'; end if;
    if (select count(*) from public.planning_release_history()) <> 1 then raise exception 'Old release metadata exposed'; end if;
    released := public.latest_planning_release();
    if released #>> '{release,version_number}' <> '2' then raise exception 'Not the latest release'; end if;
    foreach section in array array['assignments','days','periods','projects','handovers'] loop
      if jsonb_array_length(released #> array['snapshot', section]) <> 1 then raise exception 'Other vessel % missing', section; end if;
    end loop;
    if released #> '{snapshot,projects,0}' ?| array['charter_hire','hire_currency'] then raise exception 'Financial data exposed'; end if;
    if jsonb_array_length(released #> '{snapshot,derogations}') <> 0 then raise exception 'Unrelated derogations exposed'; end if;
    begin
      perform public.publish_planning_release();
      raise exception 'Publication allowed';
    exception when insufficient_privilege then null;
    end;
  end loop;
  perform set_config('request.jwt.claim.sub', 'a2100000-0000-0000-0000-000000000003', true);
  if public.latest_planning_release() is not null then raise exception 'Another company release exposed'; end if;
  if (select count(*) from public.vessels) <> 1 then raise exception 'Company isolation failed'; end if;
  perform set_config('request.jwt.claim.sub', 'a2100000-0000-0000-0000-000000000004', true);
  begin
    perform public.dpr_report_projects();
    raise exception 'DPR module gate missing';
  exception when insufficient_privilege then null;
  end;
  if has_function_privilege('anon', 'public.dpr_report_projects()', 'execute') then raise exception 'Anonymous project access'; end if;
  if has_function_privilege('authenticated', 'public.planning_visible_release_snapshot(jsonb)', 'execute') then raise exception 'Unfiltered helper exposed'; end if;
end;
$$;
select 'DPR project labels and published fleet: authenticated profile fixtures passed' as result;
rollback;
