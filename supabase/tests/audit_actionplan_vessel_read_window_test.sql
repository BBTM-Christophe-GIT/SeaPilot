-- Comptes distincts Marin/Capitaine et rôles PostgreSQL réels.
-- Affectations Planning confirmées non publiées ; toutes les données et
-- mutations de preuve sont annulées par ROLLBACK.
begin;
create temporary table audit_window_actors(label text primary key, actor uuid, company_id bigint, person_id bigint);
create temporary table audit_window_records(label text primary key, company_id bigint, vessel_id bigint, site_id uuid, audit_id uuid, finding_id uuid, documentary_id uuid, documentary_finding_id uuid, action_id bigint, confidential_id bigint);
grant select on audit_window_actors, audit_window_records to authenticated;
insert into public.companies(code,name,active) values ('audit-window-a','Audit window A',true),('audit-window-b','Audit window B',true);
insert into public.action_type_catalog(company_id,type_key,label,family,requires_deviation_type)
  select company.id,fixture.type_key,fixture.label,fixture.family,false
  from public.companies company cross join (values
    ('action_progress','Action de progrès','action'),
    ('discrimination_human_rights','Signalement confidentiel','event')
  ) fixture(type_key,label,family) where company.code in ('audit-window-a','audit-window-b');
do $setup$
#variable_conflict use_variable
declare label text; company bigint; person bigint; actor uuid; n integer := 0; ship bigint; site uuid; template uuid;
  audit uuid; finding uuid; documentary uuid; documentary_finding uuid; action bigint; confidential bigint;
  today date := (current_timestamp at time zone 'Europe/Paris')::date; start_day date; end_day date;
begin
  foreach label in array array['marin','capitaine','admin','foreign','unassigned'] loop
    n := n+1; actor := ('ac720000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
    select id into strict company from public.companies where code=case when label='foreign' then 'audit-window-b' else 'audit-window-a' end;
    insert into auth.users(id,email) values(actor,label||'-audit-window@example.invalid');
    insert into public.profiles(id,email,display_name,active_company_id) values(actor,label||'-audit-window@example.invalid','Audit window '||label,company);
    insert into public.company_memberships(company_id,user_id,active) values(company,actor,true)
      on conflict(company_id,user_id) do update set active=true;
    insert into public.user_roles(company_id,user_id,role_key) values(company,actor,case when label in ('admin','capitaine') then label else 'marin' end);
    insert into public.people(company_id,user_id,first_name,last_name,function_label,active)
      values(company,actor,'Audit window',label,case when label='capitaine' then 'Capitaine' else 'Matelot' end,true) returning id into person;
    insert into audit_window_actors values(label,actor,company,person);
  end loop;
  foreach label in array array['future','past','outside','unassigned','foreign','shore'] loop
    select id into strict company from public.companies where code=case when label='foreign' then 'audit-window-b' else 'audit-window-a' end;
    ship := null;
    if label<>'shore' then
      insert into public.vessels(company_id,name,active,asset_kind) values(company,'AUDIT-WINDOW-'||label,true,'vessel') returning id into ship;
      if label in ('future','past','outside') then
        start_day := case label when 'future' then today+10 when 'past' then today-14 else (today+interval '2 months')::date end;
        end_day := start_day+4;
        insert into public.planning_assignments(company_id,vessel_id,crew_person_id,starts_on,ends_on,starts_at,ends_at,confirmation_status)
          select company,ship,person_id,start_day,end_day,start_day::timestamp at time zone 'Europe/Paris',
            (end_day+1)::timestamp at time zone 'Europe/Paris','confirmed'
          from audit_window_actors where audit_window_actors.label in ('marin','capitaine');
      end if;
    end if;
    insert into public.internal_audit_sites(company_id,name,kind,vessel_id)
      values(company,'AUDIT-WINDOW-'||label,case when label='shore' then 'shore' else 'vessel' end,ship) returning id into site;
    insert into public.internal_audit_templates(company_id,site_id,name,rows)
      values(company,site,'AUDIT-WINDOW grid','[{"id":"q1","section":"ISM","reference":"1","question":"Question","maxPoints":3,"guidance":""}]') returning id into template;
    insert into public.internal_audits(company_id,site_id,template_id,template_name,template_version,year,planned_on,rows)
      values(company,site,template,'AUDIT-WINDOW grid',1,extract(year from today)::integer,today,
        '[{"id":"q1","section":"ISM","reference":"1","question":"Question","maxPoints":3,"guidance":"","answer":null,"observation":""}]') returning id into audit;
    select person_id into person from audit_window_actors where audit_window_actors.label=case when label='foreign' then 'foreign' else 'admin' end;
    insert into public.internal_audit_findings(company_id,audit_id,question_id,severity,description,assignee_person_id,assignee_label,opened_on,treatment_delay_value,treatment_delay_unit,due_on)
      values(company,audit,'q1','major','Audit window finding',person,'Other handler',today,1,'weeks',today+7) returning id into finding;
    update public.internal_audit_findings set photos=jsonb_build_array(jsonb_build_object('storagePath',company||'/'||audit||'/'||finding||'/finding/ac720000-0000-4000-8000-000000000003/ac725000-0000-4000-8000-000000000001.png')) where id=finding;
    documentary := null; documentary_finding := null; action := null; confidential := null;
    if ship is not null then
      insert into public.documentary_audits(company_id,kind,site_id,vessel_id,year,title)
        values(company,'ovid',ship,ship,extract(year from today)::integer,'Audit window documentary') returning id into documentary;
      insert into public.documentary_audit_findings(company_id,audit_id,category,description,assignee_person_id,assignee_label)
        values(company,documentary,'finding','Other handler documentary finding',person,'Other handler') returning id into documentary_finding;
      update public.documentary_audits set files=jsonb_build_array(jsonb_build_object('storagePath',company||'/'||documentary||'/'||documentary||'/audit/ac720000-0000-4000-8000-000000000003/ac725000-0000-4000-8000-000000000002.pdf')) where id=documentary;
      insert into public.action_items(company_id,vessel_id,title,status,source_label,action_type_key,workflow_status)
        values(company,ship,'AUDIT-WINDOW-'||label,'Non soldé','sharepoint','action_progress','approved') returning id into action;
      insert into public.action_items(company_id,vessel_id,title,status,source_label,action_type_key,workflow_status,issuer_person_id)
        values(company,ship,'AUDIT-WINDOW-private-'||label,'Non soldé','sharepoint','discrimination_human_rights','approved',person) returning id into confidential;
    end if;
    insert into audit_window_records values(label,company,ship,site,audit,finding,documentary,documentary_finding,action,confidential);
  end loop;
end $setup$;

-- ACL des clones : ils ne sont pas une nouvelle API publique de lecture.
do $acl$
declare identity text;
begin
  assert not has_function_privilege('anon','public.action_plan_followup_action_ids()','EXECUTE'), 'RPC suivi callable anonymement';
  assert not has_function_privilege('anon','private.action_plan_followup_action_ids()','EXECUTE'), 'Helper suivi callable anonymement';
  assert has_function_privilege('authenticated','public.action_plan_followup_action_ids()','EXECUTE'), 'RPC suivi indisponible';
  assert not (select prosecdef from pg_proc where oid='public.action_plan_followup_action_ids()'::regprocedure), 'RPC suivi public doit être invoker';
  foreach identity in array array[
    'private.action_plan_vessel_scope_before_read_window()',
    'private.action_item_can_read_before_vessel_window(bigint)',
    'internal_audit_private.can_read_finding_before_vessel_window(uuid)',
    'internal_audit_private.can_read_audit_before_vessel_window(uuid)',
    'internal_audit_private.can_read_site_before_vessel_window(uuid)',
    'documentary_audit_private.can_read_finding_before_vessel_window(uuid)',
    'documentary_audit_private.can_read_audit_before_vessel_window(uuid)'
  ] loop
    assert not has_function_privilege('authenticated',identity,'EXECUTE'), 'Clone exécutable par authenticated : '||identity;
    assert not has_function_privilege('anon',identity,'EXECUTE'), 'Clone exécutable anonymement : '||identity;
  end loop;
end $acl$;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
do $read$
declare actor uuid; target audit_window_records%rowtype; overview jsonb; path text; scope bigint[];
begin
  for actor in select audit_window_actors.actor from audit_window_actors where label in ('marin','capitaine') loop
    perform set_config('request.jwt.claim.sub',actor::text,true);
    scope := public.action_plan_current_vessel_scope();
    assert cardinality(scope)=2, 'Scope ActionPlan hors fenêtre confirmée';
    for target in select * from audit_window_records where label in ('future','past') loop
      assert target.vessel_id=any(scope), 'Navire préparation/suivi absent du filtre client ActionPlan';
      assert public.action_item_user_can_read(target.action_id), 'Action navire inaccessible avant/après embarquement';
      assert exists(select 1 from public.action_items where id=target.action_id), 'Action masquée par RLS';
      assert not public.action_item_user_can_read(target.confidential_id), 'Signalement discrimination divulgué';
      assert not exists(select 1 from public.action_items where id=target.confidential_id), 'Signalement privé divulgué par RLS';
      assert not public.action_item_user_can_treat(target.action_id), 'Consultation transformée en traitement ActionPlan';
      assert not target.action_id=any(public.action_plan_followup_action_ids()), 'RPC suivi expose les actions de simple consultation';
      assert not public.action_plan_evidence_user_can_upload(target.company_id||'/'||target.action_id||'/suivi-window.png'), 'Consultation transformée en upload ActionPlan';
      begin
        perform public.action_item_add_treatment_followup(target.action_id,'Forbidden window comment');
        raise exception 'Suivi ActionPlan ajouté par simple lecteur';
      exception when insufficient_privilege then null; end;
      assert internal_audit_private.can_read_site(target.site_id), 'Site navire masqué';
      assert internal_audit_private.can_read_audit(target.audit_id), 'Audit interne masqué';
      assert internal_audit_private.can_read_finding(target.finding_id), 'Écart interne masqué';
      assert exists(select 1 from public.internal_audits where id=target.audit_id), 'Audit interne RLS masqué';
      assert exists(select 1 from public.internal_audit_findings where id=target.finding_id), 'Écart interne RLS masqué';
      overview := public.internal_audits_overview();
      assert exists(select 1 from jsonb_array_elements(overview->'audits') item where item->>'id'=target.audit_id::text), 'Audit interne absent RPC';
      assert not (overview->'permissions'->'treatableFindingIds' ? target.finding_id::text), 'RPC annonce un traitement interne supplémentaire';
      assert jsonb_array_length(overview->'people')=0 and jsonb_array_length(overview->'templates')=0 and jsonb_array_length(overview->'hrFunctions')=0, 'Lecture audits divulgue catalogue RH';
      path := target.company_id||'/'||target.audit_id||'/'||target.finding_id||'/finding/ac720000-0000-4000-8000-000000000003/ac725000-0000-4000-8000-000000000001.png';
      assert internal_audit_private.can_read_photo(path), 'Photo de constat liée masquée';
      path := target.company_id||'/'||target.audit_id||'/'||target.finding_id||'/treatment/'||actor||'/ac725000-0000-4000-8000-000000000003.png';
      assert not internal_audit_private.can_upload_photo(path), 'Photo traitée par simple lecteur';
      begin
        perform public.internal_audit_add_treatment(target.finding_id,'in_progress','Forbidden window treatment','[]');
        raise exception 'Traitement interne ajouté par simple lecteur';
      exception when insufficient_privilege then null; end;
      assert documentary_audit_private.can_read_audit(target.documentary_id), 'Audit documentaire masqué';
      assert documentary_audit_private.can_read_finding(target.documentary_finding_id), 'Écart documentaire masqué';
      assert exists(select 1 from public.documentary_audits where id=target.documentary_id), 'Audit documentaire RLS masqué';
      assert exists(select 1 from public.documentary_audit_findings where id=target.documentary_finding_id), 'Écart documentaire RLS masqué';
      overview := public.documentary_audits_overview('ovid');
      assert exists(select 1 from jsonb_array_elements(overview->'audits') item where item->>'id'=target.documentary_id::text), 'Audit documentaire absent RPC';
      assert not (overview->'permissions'->'treatableFindingIds' ? target.documentary_finding_id::text), 'RPC annonce un traitement documentaire supplémentaire';
      assert jsonb_array_length(overview->'people')=0, 'Lecture documentaire divulgue catalogue RH';
      path := target.company_id||'/'||target.documentary_id||'/'||target.documentary_id||'/audit/ac720000-0000-4000-8000-000000000003/ac725000-0000-4000-8000-000000000002.pdf';
      assert documentary_audit_private.can_read_file(path), 'Rapport documentaire lié masqué';
      path := target.company_id||'/'||target.documentary_id||'/'||target.documentary_finding_id||'/treatment/'||actor||'/ac725000-0000-4000-8000-000000000004.pdf';
      assert not documentary_audit_private.can_upload_file(path), 'Document traitement par simple lecteur';
      begin
        perform public.documentary_audit_add_treatment(target.documentary_finding_id,'in_progress','Forbidden window treatment','[]');
        raise exception 'Traitement documentaire ajouté par simple lecteur';
      exception when insufficient_privilege then null; end;
    end loop;
    for target in select * from audit_window_records where label in ('outside','unassigned','foreign','shore') loop
      assert not internal_audit_private.can_read_site(target.site_id), 'Site extérieur/terre divulgué';
      assert not internal_audit_private.can_read_audit(target.audit_id), 'Audit interne extérieur/terre divulgué';
      assert not internal_audit_private.can_read_finding(target.finding_id), 'Écart interne extérieur/terre divulgué';
      if target.vessel_id is not null then
        assert not public.action_item_user_can_read(target.action_id), 'Action navire extérieur divulguée';
        assert not documentary_audit_private.can_read_audit(target.documentary_id), 'Audit documentaire extérieur divulgué';
        assert not documentary_audit_private.can_read_finding(target.documentary_finding_id), 'Écart documentaire extérieur divulgué';
      end if;
    end loop;
  end loop;
end $read$;
reset role;

-- Une responsabilité personnelle conserve exactement les droits métier
-- existants, même sur un navire sans affectation de consultation.
update public.internal_audit_findings set assignee_person_id=(select person_id from audit_window_actors where label='marin')
  where id=(select finding_id from audit_window_records where label='unassigned');
update public.documentary_audit_findings set assignee_person_id=(select person_id from audit_window_actors where label='marin')
  where id=(select documentary_finding_id from audit_window_records where label='unassigned');
update public.action_items set issuer_person_id=(select person_id from audit_window_actors where label='marin')
  where id=(select confidential_id from audit_window_records where label='unassigned');
set local role authenticated;
select set_config('request.jwt.claim.sub','ac720000-0000-4000-8000-000000000001',true);
do $legacy$
declare target audit_window_records%rowtype; payload jsonb;
begin
  select * into target from audit_window_records where label='unassigned';
  assert public.action_item_user_can_read(target.confidential_id), 'Signalement personnel privé perdu';
  assert target.confidential_id=any(public.action_plan_followup_action_ids()), 'RPC suivi perd la responsabilité personnelle historique';
  assert (public.internal_audits_overview()->'permissions'->'treatableFindingIds' ? target.finding_id::text), 'Responsabilité interne personnelle perdue';
  assert (public.documentary_audits_overview('ovid')->'permissions'->'treatableFindingIds' ? target.documentary_finding_id::text), 'Responsabilité documentaire personnelle perdue';
  payload := public.internal_audit_add_treatment(target.finding_id,'in_progress','Traitement personnel existant','[]');
  assert exists(select 1 from public.internal_audit_finding_events where finding_id=target.finding_id and actor_id=auth.uid()), 'Événement personnel interne absent';
  payload := public.documentary_audit_add_treatment(target.documentary_finding_id,'in_progress','Traitement personnel existant','[]');
  assert exists(select 1 from public.documentary_audit_events where finding_id=target.documentary_finding_id and actor_id=auth.uid()), 'Événement personnel documentaire absent';
end $legacy$;
reset role;

-- Annulation immédiatement effective, sans dépendre d'une publication Planning.
update public.planning_assignments set confirmation_status='cancelled'
  where vessel_id=(select vessel_id from audit_window_records where label='future');
set local role authenticated;
do $cancelled$
declare target audit_window_records%rowtype;
begin
  select * into target from audit_window_records where label='future';
  assert not public.action_item_user_can_read(target.action_id), 'Action restée visible après annulation';
  assert not internal_audit_private.can_read_audit(target.audit_id), 'Audit interne resté visible après annulation';
  assert not documentary_audit_private.can_read_audit(target.documentary_id), 'Audit documentaire resté visible après annulation';
end $cancelled$;
reset role;
rollback;
