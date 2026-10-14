-- Real authenticated PostgreSQL roles, tenant memberships and published planning.
-- All records are synthetic and the complete fixture rolls back.
begin;
select set_config('storage.allow_delete_query', 'true', true);
create temporary table medical_actors(label text primary key, actor uuid, company_id bigint, person_id bigint);
create temporary table medical_vessels(label text primary key, vessel_id bigint, company_id bigint);
create temporary table medical_results(label text primary key, entry_id bigint);
grant select, insert, update on medical_results to authenticated;
grant select on medical_actors, medical_vessels to authenticated;

insert into public.companies(code, name, active) values
  ('medical-fixture-a', 'Medical fixture company A', true),
  ('medical-fixture-b', 'Medical fixture company B', true);

do $$
declare actor_label text; actor uuid; company bigint; person bigint; n integer := 0; today date := (current_timestamp at time zone 'Europe/Paris')::date;
begin
  foreach actor_label in array array['admin', 'captain', 'captain-named', 'unassigned', 'provisional', 'future', 'expired', 'unpublished',
    'inactive', 'inactive-person', 'marin', 'direction', 'armement', 'foreign-admin', 'no-signature', 'unlinked-admin'] loop
    n := n + 1; actor := ('deca0000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
    select id into strict company from public.companies where code = case when actor_label = 'foreign-admin' then 'medical-fixture-b' else 'medical-fixture-a' end;
    insert into auth.users(id, email) values(actor, actor_label || '-medical@example.invalid');
    insert into public.profiles(id, email, display_name, active_company_id)
      values(actor, actor_label || '-medical@example.invalid', 'Medical fixture ' || actor_label, company);
    insert into public.company_memberships(company_id, user_id, active) values(company, actor, actor_label <> 'inactive')
      on conflict(company_id, user_id) do update set active = excluded.active;
    insert into public.user_roles(company_id, user_id, role_key) values(company, actor,
      case when actor_label in ('admin', 'foreign-admin', 'no-signature', 'unlinked-admin') then 'admin' when actor_label in ('marin', 'direction', 'armement') then actor_label else 'capitaine' end);
    insert into public.people(company_id, user_id, first_name, last_name, active)
      values(company, actor, 'Medical fixture', actor_label, actor_label <> 'inactive-person') returning id into person;
    insert into medical_actors values(actor_label, actor, company, person);
    if actor_label = 'unlinked-admin' then update public.people set user_id = null where id = person; end if;
    if actor_label not in ('no-signature', 'unlinked-admin') then
      insert into storage.objects(bucket_id, name, owner_id, metadata) values('working-time-signatures', company || '/' || person || '/medical-fixture-v1.png', actor::text, '{"mimetype":"image/png","size":128}'::jsonb);
      insert into public.working_time_profile_signatures(company_id, person_id, version_number, storage_bucket, storage_path, mime_type, file_size_bytes, sha256, valid_from, created_by)
        values(company, person, 1, 'working-time-signatures', company || '/' || person || '/medical-fixture-v1.png', 'image/png', 128, repeat('a',64), clock_timestamp() - interval '1 minute', actor);
    end if;
  end loop;
  select id into strict company from public.companies where code = 'medical-fixture-a';
  foreach actor_label in array array['current', 'other', 'provisional', 'future', 'expired', 'unpublished'] loop
    insert into public.vessels(company_id, name, active, asset_kind) values(company, 'MEDICAL-TEST-' || actor_label, true, 'vessel')
      returning id into person;
    insert into medical_vessels values(actor_label, person, company);
  end loop;
  select id into strict company from public.companies where code = 'medical-fixture-b';
  insert into public.vessels(company_id, name, active, asset_kind) values(company, 'MEDICAL-TEST-FOREIGN', true, 'vessel') returning id into person;
  insert into medical_vessels values('foreign', person, company);
  foreach actor_label in array array['captain', 'provisional', 'future', 'expired', 'unpublished', 'inactive', 'inactive-person', 'marin', 'direction', 'armement'] loop
    insert into public.planning_assignments(company_id, vessel_id, crew_person_id, starts_on, ends_on, starts_at, ends_at, confirmation_status)
    select actor.company_id, vessel.vessel_id, actor.person_id,
      case when actor_label = 'future' then today + 1 when actor_label = 'expired' then today - 2 else today - 1 end,
      case when actor_label = 'expired' then today - 1 else today + 2 end,
      (case when actor_label = 'future' then today + 1 when actor_label = 'expired' then today - 2 else today - 1 end)::timestamp at time zone 'Europe/Paris',
      (case when actor_label = 'expired' then today else today + 3 end)::timestamp at time zone 'Europe/Paris',
      case when actor_label = 'provisional' then 'provisional' else 'confirmed' end
    from medical_actors actor join medical_vessels vessel on vessel.label = case when actor_label in ('provisional', 'future', 'expired', 'unpublished') then actor_label else 'current' end
    where actor.label = actor_label;
  end loop;
  -- A captain referenced by captain_person_id, rather than crew_person_id, is supported.
  insert into public.planning_assignments(company_id, vessel_id, crew_person_id, captain_person_id, starts_on, ends_on, starts_at, ends_at, confirmation_status)
    select actor.company_id, vessel.vessel_id, crew.person_id, actor.person_id, today - 1, today + 1,
      (today - 1)::timestamp at time zone 'Europe/Paris', (today + 2)::timestamp at time zone 'Europe/Paris', 'confirmed'
    from medical_actors actor join medical_actors crew on crew.label = 'marin'
    join medical_vessels vessel on vessel.label = 'current' where actor.label = 'captain-named';
  insert into public.planning_releases(company_id, version_number, snapshot, published_by, published_by_name)
  select actor.company_id, 1, jsonb_build_object('scope', jsonb_build_object('company_id', actor.company_id), 'assignments',
    (select coalesce(jsonb_agg(to_jsonb(assignment)), '[]'::jsonb) from public.planning_assignments assignment
     where assignment.company_id = actor.company_id and assignment.crew_person_id <> (select person_id from medical_actors where label = 'unpublished'))),
    actor.actor, 'Medical fixture admin' from medical_actors actor where actor.label = 'admin';
end $$;

-- A menu permission and broad planning override never give another role medical access.
insert into public.role_module_permissions(role_key, module_key, is_visible)
  values('marin', 'medicalLogbook', true), ('direction', 'medicalLogbook', true), ('armement', 'medicalLogbook', true)
  on conflict(role_key, module_key) do update set is_visible = true;
insert into public.planning_vessel_permissions(company_id, user_id, vessel_id, action_key, reason, granted_by)
  select actor.company_id, actor.actor, vessel.vessel_id, 'read', 'Medical fixture planning override', admin.actor
  from medical_actors actor join medical_actors admin on admin.label = 'admin'
  join medical_vessels vessel on vessel.label = 'current' where actor.label in ('unassigned', 'marin', 'direction', 'armement');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'deca0000-0000-4000-8000-000000000001', true);
do $$
declare vessel bigint; other bigint; foreign_vessel bigint; result jsonb; signer jsonb; content jsonb; invalid jsonb; entry bigint; history jsonb; field text;
begin
  select vessel_id into vessel from medical_vessels where label = 'current';
  select vessel_id into other from medical_vessels where label = 'other';
  select vessel_id into foreign_vessel from medical_vessels where label = 'foreign';
  assert jsonb_array_length(public.get_medical_logbook_vessels()) = 6, 'Admin vessel list escaped or lost tenant';
  assert not exists(select 1 from jsonb_array_elements(public.get_medical_logbook_vessels()) item where item->'can_write' is distinct from 'true'::jsonb), 'Admin write capability missing';
  assert public.list_medical_logbook_entries(vessel) = '[]'::jsonb, 'New register was not empty';
  begin perform public.list_medical_logbook_entries(foreign_vessel); raise exception 'Foreign vessel read accepted'; exception when insufficient_privilege then null; end;
  begin perform (select count(*) from medical_logbook_private.entries); raise exception 'Direct patient table readable'; exception when insufficient_privilege then null; end;
  begin insert into medical_logbook_private.entries(company_id, vessel_id) values(1, vessel); raise exception 'Direct patient insert accepted'; exception when insufficient_privilege then null; end;
  begin update medical_logbook_private.entries set patient_name = 'forged'; raise exception 'Direct patient update accepted'; exception when insufficient_privilege then null; end;
  begin delete from medical_logbook_private.entries; raise exception 'Direct patient delete accepted'; exception when insufficient_privilege then null; end;
  begin perform (select count(*) from medical_logbook_private.history); raise exception 'Direct medical audit readable'; exception when insufficient_privilege then null; end;
  signer := public.get_medical_logbook_signer();
  assert (signer->>'person_id')::bigint = (select person_id from medical_actors where label = 'admin') and signer#>>'{signature,version_number}' = '1', 'Connected signature did not resolve own person';
  content := jsonb_build_object('occurred_on', '2026-10-14', 'occurred_time', '09:35', 'patient_name', 'Synthetic patient',
    'injury_illness', 'Synthetic injury', 'treatment_medicines', 'Synthetic treatment', 'first_aider_name', signer->>'signer_name');
  foreach field in array array['company_id', 'vessel_id', 'created_by', 'updated_by', 'revision', 'id', 'archived', 'created_at',
    'signature_name', 'signature_strokes', 'signature_snapshot', 'signature_version_id', 'person_id', 'signer_user_id'] loop
    begin perform public.save_medical_logbook_entry(vessel, null, null, content || jsonb_build_object(field, 'forged')); raise exception 'Forged immutable field accepted: %', field;
    exception when invalid_parameter_value then null; end;
  end loop;
  foreach invalid in array array[
    content || '{"occurred_on":"2026-02-30"}'::jsonb, content || '{"occurred_time":"24:00"}'::jsonb,
    content || '{"occurred_time":"12:30:17"}'::jsonb, content || '{"patient_name":" "}'::jsonb,
    content || jsonb_build_object('first_aider_name', repeat('x', 161)), content || jsonb_build_object('injury_illness', repeat('x', 4001)),
    content || '{"first_aider_name":"Someone else"}'::jsonb,
    content || jsonb_build_object('signature_snapshot', jsonb_build_object('signature_id', (select id from public.working_time_profile_signatures where person_id = (select person_id from medical_actors where label = 'captain'))))
  ] loop
    begin perform public.save_medical_logbook_entry(vessel, null, null, invalid); raise exception 'Invalid content accepted'; exception when invalid_parameter_value then null; end;
  end loop;
  begin perform public.save_medical_logbook_entry(vessel, null, 0, content); raise exception 'Create revision accepted'; exception when serialization_failure then null; end;
  result := public.save_medical_logbook_entry(vessel, null, null, content);
  entry := (result->>'id')::bigint;
  insert into medical_results values('main', entry);
  assert (result->>'vessel_id')::bigint = vessel and (result->>'revision')::integer = 1 and result->'archived' = 'false'::jsonb, 'Initial entry metadata incorrect';
  assert result->>'occurred_time' = '09:35' and result#>>'{signature_snapshot,signer_user_id}' = 'deca0000-0000-4000-8000-000000000001'
    and result->>'signature_name' = signer->>'signer_name' and result->>'first_aider_name' = signer->>'signer_name', 'Entry used another identity or signature';
  assert not (result ? 'created_by' or result ? 'updated_by'), 'Actor identities exposed in entry';
  assert jsonb_array_length(public.list_medical_logbook_entries(vessel)) = 1, 'Saved entry not listed';
  begin perform public.save_medical_logbook_entry(other, entry, 1, content); raise exception 'Entry moved vessels'; exception when insufficient_privilege then null; end;
  begin perform public.save_medical_logbook_entry(vessel, entry, null, content); raise exception 'Missing update revision accepted'; exception when serialization_failure then null; end;
  result := public.save_medical_logbook_entry(vessel, entry, 1, content || '{"treatment_medicines":"Updated synthetic treatment"}'::jsonb);
  assert (result->>'revision')::integer = 2, 'Update did not advance revision';
  begin perform public.save_medical_logbook_entry(vessel, entry, 1, content); raise exception 'Stale update accepted'; exception when serialization_failure then null; end;
  begin perform public.set_medical_logbook_entry_archived(entry, 1, true); raise exception 'Stale archive accepted'; exception when serialization_failure then null; end;
  result := public.set_medical_logbook_entry_archived(entry, 2, true);
  assert (result->>'revision')::integer = 3 and result->'archived' = 'true'::jsonb, 'Archive did not preserve entry';
  assert jsonb_array_length(public.list_medical_logbook_entries(vessel)) = 1, 'Archived entry was lost';
  begin perform public.save_medical_logbook_entry(vessel, entry, 3, content); raise exception 'Archived entry edited'; exception when invalid_parameter_value then null; end;
  result := public.set_medical_logbook_entry_archived(entry, 3, false);
  assert (result->>'revision')::integer = 4 and result->'archived' = 'false'::jsonb, 'Restore failed';
  history := public.get_medical_logbook_history(entry);
  assert jsonb_array_length(history) = 4, 'Audit revisions missing';
  assert history#>>'{0,action}' = 'restored' and history#>>'{1,action}' = 'archived' and history#>>'{2,action}' = 'updated' and history#>>'{3,action}' = 'created', 'Audit actions incorrect';
  assert history#>>'{3,entry,treatment_medicines}' = 'Synthetic treatment' and history#>>'{2,entry,treatment_medicines}' = 'Updated synthetic treatment', 'Original audit snapshot changed';
  assert history#>>'{0,actor_name}' = 'Medical fixture admin' and not (history->0 ? 'actor_id'), 'Audit actor snapshot incorrect';
  result := public.save_medical_logbook_entry(other, null, null, content);
  insert into medical_results values('other', (result->>'id')::bigint);
end $$;

-- Both crew-person and named-captain assignments are restricted to the current ship.
do $$
declare actor_label text; actor uuid; vessel bigint; other bigint; entry bigint; result jsonb;
begin
  select vessel_id into vessel from medical_vessels where label = 'current';
  select vessel_id into other from medical_vessels where label = 'other';
  select entry_id into entry from medical_results where label = 'main';
  foreach actor_label in array array['captain', 'captain-named'] loop
    select medical_actors.actor into actor from medical_actors where medical_actors.label = actor_label;
    perform set_config('request.jwt.claim.sub', actor::text, true);
    result := public.get_medical_logbook_vessels();
    assert jsonb_array_length(result) = 1 and (result#>>'{0,id}')::bigint = vessel, 'Captain vessel scope incorrect';
    assert result#>'{0,can_write}' = 'true'::jsonb, 'Captain write capability missing';
    assert jsonb_array_length(public.list_medical_logbook_entries(vessel)) = 1, 'Captain cannot consult own ship';
    assert jsonb_array_length(public.get_medical_logbook_history(entry)) = 4, 'Captain cannot consult own audit';
    begin perform public.list_medical_logbook_entries(other); raise exception 'Captain read another ship'; exception when insufficient_privilege then null; end;
    begin perform public.get_medical_logbook_history((select entry_id from medical_results where label = 'other')); raise exception 'Captain read another ship audit'; exception when insufficient_privilege then null; end;
    result := public.set_medical_logbook_entry_archived(entry, 4, false);
    assert (result->>'revision')::integer = 4, 'No-op restore changed revision';
  end loop;
end $$;

-- Real role restrictions apply even with medical menu visibility enabled.
do $$
declare actor_label text; actor uuid; vessel bigint; entry bigint;
begin
  select vessel_id into vessel from medical_vessels where label = 'current';
  select entry_id into entry from medical_results where label = 'main';
  foreach actor_label in array array['inactive', 'marin', 'direction', 'armement', 'foreign-admin'] loop
    select medical_actors.actor into actor from medical_actors where medical_actors.label = actor_label;
    perform set_config('request.jwt.claim.sub', actor::text, true);
    if actor_label <> 'foreign-admin' then
      begin perform public.get_medical_logbook_vessels(); raise exception 'Unauthorized role vessel list accepted: %', actor_label; exception when insufficient_privilege then null; end;
    else assert jsonb_array_length(public.get_medical_logbook_vessels()) = 1, 'Foreign admin cannot see own vessel'; end if;
    begin perform public.list_medical_logbook_entries(vessel); raise exception 'Unauthorized medical read accepted: %', actor_label; exception when insufficient_privilege then null; end;
    begin perform public.save_medical_logbook_entry(vessel, null, null, '{}'::jsonb); raise exception 'Unauthorized medical write accepted: %', actor_label; exception when insufficient_privilege then null; end;
    begin perform public.set_medical_logbook_entry_archived(entry, 4, true); raise exception 'Unauthorized archive accepted: %', actor_label; exception when insufficient_privilege then null; end;
    begin perform public.get_medical_logbook_history(entry); raise exception 'Unauthorized audit accepted: %', actor_label; exception when insufficient_privilege then null; end;
  end loop;
  foreach actor_label in array array['unassigned', 'provisional', 'future', 'expired', 'unpublished', 'inactive-person'] loop
    select medical_actors.actor into actor from medical_actors where medical_actors.label = actor_label;
    perform set_config('request.jwt.claim.sub', actor::text, true);
    assert public.get_medical_logbook_vessels() = '[]'::jsonb, format('Non-current or unpublished captain gained medical scope: %s', actor_label);
    begin perform public.list_medical_logbook_entries(vessel); raise exception 'Unassigned captain read accepted'; exception when insufficient_privilege then null; end;
  end loop;
end $$;
reset role;

-- Replace the account signature. New content uses version 2; old entries and
-- audit keep version 1 and its private object remains readable by scoped captains.
do $$
declare actor uuid; person bigint; company bigint;
begin
  select record.actor, record.person_id, record.company_id into actor, person, company from medical_actors record where record.label = 'admin';
  update public.working_time_profile_signatures set valid_to = clock_timestamp(), revoked_by = actor, revocation_reason = 'Synthetic replacement'
    where person_id = person and valid_to is null;
  insert into storage.objects(bucket_id, name, owner_id, metadata)
    values('working-time-signatures', company || '/' || person || '/medical-fixture-v2.png', actor::text, '{"mimetype":"image/png","size":128}'::jsonb);
  insert into public.working_time_profile_signatures(company_id, person_id, version_number, storage_bucket, storage_path, mime_type, file_size_bytes, sha256, valid_from, created_by)
    values(company, person, 2, 'working-time-signatures', company || '/' || person || '/medical-fixture-v2.png', 'image/png', 128, repeat('b',64), clock_timestamp() - interval '1 second', actor);
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'deca0000-0000-4000-8000-000000000001', true);
do $$
declare entry bigint; vessel bigint; result jsonb; history jsonb; content jsonb;
begin
  select entry_id into entry from medical_results where label = 'main';
  select vessel_id into vessel from medical_vessels where label = 'current';
  assert public.get_medical_logbook_signer()#>>'{signature,version_number}' = '2', 'Current signature did not advance';
  result := public.list_medical_logbook_entries(vessel)->0;
  content := jsonb_build_object('occurred_on', result->>'occurred_on', 'occurred_time', result->>'occurred_time',
    'patient_name', result->>'patient_name', 'injury_illness', result->>'injury_illness', 'treatment_medicines', result->>'treatment_medicines',
    'first_aider_name', public.get_medical_logbook_signer()->>'signer_name');
  result := public.save_medical_logbook_entry(vessel, entry, 4, content);
  assert result#>>'{signature_snapshot,version_number}' = '2' and (result->>'revision')::integer = 5, 'Content did not capture current signature';
  history := public.get_medical_logbook_history(entry);
  assert jsonb_array_length(history) = 5 and history#>>'{4,entry,signature_snapshot,version_number}' = '1'
    and history#>>'{0,entry,signature_snapshot,version_number}' = '2', 'Audit signature was rewritten by later replacement';
end $$;
select set_config('request.jwt.claim.sub', 'deca0000-0000-4000-8000-000000000002', true);
do $$
declare old_path text; new_path text;
begin
  select company_id || '/' || person_id || '/medical-fixture-v1.png', company_id || '/' || person_id || '/medical-fixture-v2.png'
    into old_path, new_path from medical_actors where label = 'admin';
  assert medical_logbook_private.can_read_signature_object('working-time-signatures', old_path)
    and medical_logbook_private.can_read_signature_object('working-time-signatures', new_path), 'Scoped captain lost historical signature objects';
  assert exists(select 1 from storage.objects where bucket_id = 'working-time-signatures' and name = old_path)
    and exists(select 1 from storage.objects where bucket_id = 'working-time-signatures' and name = new_path), 'Storage policy cannot sign historical PNG URL';
  assert not medical_logbook_private.can_read_signature_object('working-time-signatures', (select company_id || '/' || person_id || '/medical-fixture-v1.png' from medical_actors where label = 'foreign-admin')), 'Medical policy exposed unrelated signature';
end $$;

-- A missing signature or missing personnel link cannot be substituted by input.
do $$
declare actor_label text; actor uuid; vessel bigint; signer jsonb; content jsonb;
begin
  select vessel_id into vessel from medical_vessels where label = 'current';
  foreach actor_label in array array['no-signature', 'unlinked-admin'] loop
    select medical_actors.actor into actor from medical_actors where medical_actors.label = actor_label;
    perform set_config('request.jwt.claim.sub', actor::text, true);
    signer := public.get_medical_logbook_signer();
    assert signer->'signature' = 'null'::jsonb, 'Missing profile signature was substituted';
    if actor_label = 'unlinked-admin' then assert signer->'person_id' = 'null'::jsonb, 'Unlinked account selected another personnel record'; end if;
    content := jsonb_build_object('occurred_on', '2026-10-14', 'occurred_time', '10:05', 'patient_name', 'Synthetic patient',
      'injury_illness', 'Synthetic injury', 'treatment_medicines', 'Synthetic treatment', 'first_aider_name', signer->>'signer_name');
    begin perform public.save_medical_logbook_entry(vessel, null, null, content); raise exception 'Missing own signature write accepted'; exception when check_violation then null; end;
  end loop;
end $$;
reset role;

-- Live cancellation immediately revokes a previously published assignment.
update public.planning_assignments set confirmation_status = 'cancelled'
where crew_person_id = (select person_id from medical_actors where label = 'captain');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'deca0000-0000-4000-8000-000000000002', true);
do $$
declare path text;
begin
  assert public.get_medical_logbook_vessels() = '[]'::jsonb, 'Cancelled live assignment retained published medical access';
  begin perform public.get_medical_logbook_history((select entry_id from medical_results where label = 'main')); raise exception 'Cancelled captain audit accepted'; exception when insufficient_privilege then null; end;
  select company_id || '/' || person_id || '/medical-fixture-v1.png' into path from medical_actors where label = 'admin';
  assert not medical_logbook_private.can_read_signature_object('working-time-signatures', path), 'Revoked captain retained medical signature grant';
  assert not exists(select 1 from storage.objects where bucket_id = 'working-time-signatures' and name = path), 'Revoked captain retained another account signature URL access';
end $$;
reset role;

-- The latest publication, rather than an earlier matching release, owns scope.
insert into public.planning_releases(company_id, version_number, snapshot, published_by, published_by_name)
  select company_id, 2, jsonb_build_object('scope', jsonb_build_object('company_id', company_id), 'assignments', '[]'::jsonb),
    actor, 'Medical fixture admin' from medical_actors where label = 'admin';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'deca0000-0000-4000-8000-000000000003', true);
do $$ begin assert public.get_medical_logbook_vessels() = '[]'::jsonb, 'Superseded published assignment retained medical access'; end $$;
reset role;

-- Tenant boundaries, author identity, revision and audit survive trusted SQL attempts.
do $$
declare target_entry bigint; other bigint;
begin
  select entry_id into target_entry from medical_results where label = 'main';
  select vessel_id into other from medical_vessels where label = 'other';
  begin update medical_logbook_private.entries set vessel_id = other, revision = revision + 1 where id = target_entry; raise exception 'Immutable vessel changed'; exception when insufficient_privilege then null; end;
  begin update medical_logbook_private.entries set created_by = 'deca0000-0000-4000-8000-000000000002', revision = revision + 1 where id = target_entry; raise exception 'Immutable author changed'; exception when insufficient_privilege then null; end;
  begin delete from medical_logbook_private.entries where id = target_entry; raise exception 'Medical record hard deleted'; exception when insufficient_privilege then null; end;
  begin update medical_logbook_private.history set actor_name = 'forged' where entry_id = target_entry; raise exception 'Audit changed'; exception when insufficient_privilege then null; end;
  begin delete from medical_logbook_private.history where entry_id = target_entry; raise exception 'Audit deleted'; exception when insufficient_privilege then null; end;
  begin delete from public.working_time_profile_signatures
    where person_id = (select person_id from medical_actors where label = 'admin') and version_number = 1;
    raise exception 'Historical signature version deleted'; exception when foreign_key_violation or restrict_violation then null; end;
end $$;

-- Verify the linked version also points to an existing, valid private PNG.
update storage.objects set metadata = '{"mimetype":"image/svg+xml","size":128}'::jsonb
  where bucket_id = 'working-time-signatures' and name = (select company_id || '/' || person_id || '/medical-fixture-v2.png' from medical_actors where label = 'admin');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'deca0000-0000-4000-8000-000000000001', true);
do $$
declare vessel bigint; content jsonb;
begin
  assert public.get_medical_logbook_signer()->'signature' = 'null'::jsonb, 'Invalid private signature object accepted';
  select vessel_id into vessel from medical_vessels where label = 'current';
  content := jsonb_build_object('occurred_on','2026-10-14','occurred_time','12:00','patient_name','Synthetic patient',
    'injury_illness','Synthetic injury','treatment_medicines','Synthetic treatment','first_aider_name','Medical fixture admin');
  begin perform public.save_medical_logbook_entry(vessel, null, null, content); raise exception 'Invalid private PNG signed medical content'; exception when check_violation then null; end;
end $$;
reset role;
update public.companies set active = false where code = 'medical-fixture-a';
set local role authenticated;
do $$ begin
  begin perform public.get_medical_logbook_vessels(); raise exception 'Inactive company read accepted'; exception when insufficient_privilege then null; end;
  begin perform public.get_medical_logbook_signer(); raise exception 'Inactive company signer accepted'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  begin perform public.get_medical_logbook_vessels(); raise exception 'Missing JWT subject accepted'; exception when insufficient_privilege then null; end;
  begin perform public.get_medical_logbook_signer(); raise exception 'Missing JWT signer accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);
do $$
begin
  begin perform public.get_medical_logbook_vessels(); raise exception 'Anonymous vessel list accepted'; exception when insufficient_privilege then null; end;
  begin perform public.get_medical_logbook_signer(); raise exception 'Anonymous signer accepted'; exception when insufficient_privilege then null; end;
  begin perform public.list_medical_logbook_entries(1); raise exception 'Anonymous medical read accepted'; exception when insufficient_privilege then null; end;
  begin perform public.save_medical_logbook_entry(1, null, null, '{}'::jsonb); raise exception 'Anonymous medical write accepted'; exception when insufficient_privilege then null; end;
  begin perform public.set_medical_logbook_entry_archived(1, 1, true); raise exception 'Anonymous archive accepted'; exception when insufficient_privilege then null; end;
  begin perform public.get_medical_logbook_history(1); raise exception 'Anonymous audit accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;


select 'MEDICAL_LOGBOOK_TEST_PASS' as result;
