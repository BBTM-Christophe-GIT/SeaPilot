-- Retain historical template/audit snapshots and real participant identities.
-- A profile signature is an existing image reference, never a new audit signature.
create table public.internal_audit_participants (
  id uuid primary key default gen_random_uuid(),
  company_id bigint not null,
  audit_id uuid not null,
  person_id bigint,
  user_id uuid references public.profiles(id) on delete set null,
  first_name text not null,
  last_name text not null,
  function_label text not null default '',
  signature_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(signature_snapshot) = 'object' and not signature_snapshot ? 'signed_at'),
  selected boolean not null default false,
  contributed boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  unique (audit_id, person_id),
  unique (audit_id, user_id),
  foreign key (audit_id, company_id) references public.internal_audits(id,company_id) on delete restrict,
  foreign key (person_id, company_id) references public.people(id,company_id) on delete restrict,
  check (selected or contributed),
  check (not selected or person_id is not null)
);
create index internal_audit_participants_person_idx on public.internal_audit_participants(person_id,company_id);
create index internal_audit_participants_user_idx on public.internal_audit_participants(user_id);
alter table public.internal_audit_participants enable row level security;
revoke all on public.internal_audit_participants from public,anon,authenticated;
grant select on public.internal_audit_participants to authenticated;
create policy internal_audit_participants_read on public.internal_audit_participants for select to authenticated
  using (internal_audit_private.can_read_audit(audit_id));

create or replace function internal_audit_private.valid_rows(p_rows jsonb, p_answers boolean default false, p_complete boolean default false)
returns boolean language plpgsql immutable set search_path = '' as $$
declare item jsonb; ids text[] := '{}';
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then return false; end if;
  if jsonb_array_length(p_rows) not between 1 and 1000 then return false; end if;
  for item in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item->'id') is distinct from 'string' or length(btrim(item->>'id')) not between 1 and 120
      or (item->>'id') = any(ids)
      or jsonb_typeof(item->'question') is distinct from 'string' or length(btrim(item->>'question')) not between 1 and 10000
      or jsonb_typeof(item->'maxPoints') is distinct from 'number' or (item->>'maxPoints')::numeric not between 0 and 1000000
      or jsonb_typeof(item->'section') is distinct from 'string' or length(btrim(item->>'section')) < 1 or jsonb_typeof(item->'reference') is distinct from 'string'
      or jsonb_typeof(item->'guidance') is distinct from 'string'
      or (item ? 'hrFunction' and (jsonb_typeof(item->'hrFunction') is distinct from 'string' or length(item->>'hrFunction') > 200)) then return false; end if;
    if p_answers then
      if not (item ? 'answer') or not (item ? 'observation') or jsonb_typeof(item->'observation') is distinct from 'string'
        or (item->>'answer' is not null and item->>'answer' not in ('conforme','incomplet','non_conforme','na'))
        or (p_complete and item->>'answer' is null) then return false; end if;
    end if;
    ids := array_append(ids, item->>'id');
  end loop;
  return true;
exception when others then return false;
end;
$$;

create function internal_audit_private.assert_hr_functions(p_rows jsonb,p_company_id bigint,p_previous_rows jsonb default '[]'::jsonb)
returns void language plpgsql stable set search_path = '' as $$
declare item jsonb; label text;
begin
  if not internal_audit_private.valid_rows(p_rows) then raise exception 'Questions ou fonctions RH invalides.' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(p_rows) loop
    label := btrim(coalesce(item->>'hrFunction',''));
    if label <> '' and not exists (select 1 from public.people person
        where person.company_id=p_company_id and person.active and btrim(person.function_label)=label)
      and not exists (select 1 from jsonb_array_elements(p_previous_rows) prior
        where prior->>'id'=item->>'id' and btrim(coalesce(prior->>'hrFunction',''))=label) then
      raise exception 'Choisissez une fonction du catalogue RH de cette société.' using errcode='22023';
    end if;
  end loop;
end;
$$;

create function internal_audit_private.snapshot_participant(p_company_id bigint,p_audit_id uuid,p_person_id bigint,p_selected boolean,p_contributed boolean)
returns void language plpgsql set search_path = '' as $$
declare person public.people; profile_signature jsonb; prior public.internal_audit_participants;
begin
  select * into person from public.people p where p.id=p_person_id and p.company_id=p_company_id
    and (p.active or not p_selected or exists(select 1 from public.internal_audit_participants participant where participant.audit_id=p_audit_id and participant.person_id=p_person_id));
  if person.id is null then raise exception 'Participant RH inaccessible ou inactif.' using errcode='22023'; end if;
  profile_signature := coalesce(public.working_time_active_signature_snapshot(p_company_id,p_person_id),'{}'::jsonb) - 'signed_at';
  select * into prior from public.internal_audit_participants participant where participant.audit_id=p_audit_id and participant.user_id=person.user_id;
  if prior.id is not null then
    update public.internal_audit_participants set selected=selected or p_selected,contributed=contributed or p_contributed,
      person_id=case when p_selected and person_id is null then person.id else person_id end,
      first_name=case when p_selected and person_id is null then coalesce(person.first_name,'') else first_name end,
      last_name=case when p_selected and person_id is null then coalesce(person.last_name,'') else last_name end,
      function_label=case when p_selected and person_id is null then coalesce(person.function_label,'') else function_label end,
      signature_snapshot=case when p_selected and person_id is null then profile_signature else signature_snapshot end
    where id=prior.id;
    return;
  end if;
  insert into public.internal_audit_participants(company_id,audit_id,person_id,user_id,first_name,last_name,function_label,signature_snapshot,selected,contributed)
  values(p_company_id,p_audit_id,p_person_id,person.user_id,coalesce(person.first_name,''),coalesce(person.last_name,''),coalesce(person.function_label,''),profile_signature,p_selected,p_contributed)
  on conflict(audit_id,person_id) do update set
    selected=public.internal_audit_participants.selected or excluded.selected,
    contributed=public.internal_audit_participants.contributed or excluded.contributed;
end;
$$;

create function internal_audit_private.snapshot_account_contributor(p_company_id bigint,p_audit_id uuid,p_user_id uuid)
returns void language plpgsql set search_path = '' as $$
declare person_id bigint; profile public.profiles;
begin
  select person.id into person_id from public.people person where person.company_id=p_company_id and person.user_id=p_user_id order by person.active desc,person.id desc limit 1;
  if person_id is not null then
    perform internal_audit_private.snapshot_participant(p_company_id,p_audit_id,person_id,false,true);
  else
    select * into profile from public.profiles p where p.id=p_user_id;
    if profile.id is not null then
      insert into public.internal_audit_participants(company_id,audit_id,user_id,first_name,last_name,contributed)
      values(p_company_id,p_audit_id,p_user_id,'',coalesce(nullif(btrim(profile.display_name),''),profile.email,'Utilisateur SeaPilot'),true)
      on conflict(audit_id,user_id) do update set contributed=true;
    end if;
  end if;
end;
$$;

create function internal_audit_private.participant_payload(p_audit_id uuid)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'participants',coalesce(jsonb_agg(jsonb_build_object('personId',participant.person_id,'userId',participant.user_id,'firstName',participant.first_name,
      'lastName',participant.last_name,'functionLabel',participant.function_label,'signatureSnapshot',participant.signature_snapshot,
      'source',case when participant.contributed then 'contributor' else 'selected' end) order by participant.last_name,participant.first_name,participant.person_id),'[]'::jsonb),
    'participantPersonIds',coalesce(jsonb_agg(participant.person_id order by participant.person_id) filter(where participant.selected),'[]'::jsonb))
  from public.internal_audit_participants participant where participant.audit_id=p_audit_id;
$$;

create function internal_audit_private.record_actor_participant()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target_audit_id uuid;
begin
  if (select auth.uid()) is null then return new; end if;
  target_audit_id := case when tg_table_name='internal_audits' then (to_jsonb(new)->>'id')::uuid
    when tg_table_name='internal_audit_findings' then (to_jsonb(new)->>'audit_id')::uuid
    else (select finding.audit_id from public.internal_audit_findings finding where finding.id=(to_jsonb(new)->>'finding_id')::uuid) end;
  perform internal_audit_private.snapshot_account_contributor(new.company_id,target_audit_id,(select auth.uid()));
  return new;
end;
$$;
create trigger internal_audit_actor_participant after insert or update on public.internal_audits
  for each row execute function internal_audit_private.record_actor_participant();
create trigger internal_audit_finding_actor_participant after insert or update on public.internal_audit_findings
  for each row execute function internal_audit_private.record_actor_participant();
create trigger internal_audit_event_actor_participant after insert on public.internal_audit_finding_events
  for each row execute function internal_audit_private.record_actor_participant();

-- Historical treatment authors have a genuine account link; free auditor text
-- is deliberately not split into invented RH identities.
do $$
declare historical record;
begin
  for historical in select distinct event.company_id,finding.audit_id,event.actor_id
    from public.internal_audit_finding_events event
    join public.internal_audit_findings finding on finding.id=event.finding_id and finding.company_id=event.company_id
    where event.actor_id is not null
  loop
    perform internal_audit_private.snapshot_account_contributor(historical.company_id,historical.audit_id,historical.actor_id);
  end loop;
end;
$$;

alter function internal_audit_private.save_template(jsonb) rename to save_template_before_grid_roles;
alter function internal_audit_private.save_audit(jsonb) rename to save_audit_before_participants;
revoke all on function internal_audit_private.save_template_before_grid_roles(jsonb),internal_audit_private.save_audit_before_participants(jsonb) from public,anon,authenticated;

create function internal_audit_private.save_template(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare company_id bigint := internal_audit_private.assert_manager(p_payload); prior public.internal_audit_templates;
begin
  select * into prior from public.internal_audit_templates template where template.id=(p_payload->>'id')::uuid for update;
  if prior.id is not null and prior.company_id<>company_id then raise exception 'Grille inaccessible.' using errcode='42501'; end if;
  if prior.id is not null and not prior.active then raise exception 'Une grille supprimée reste conservée dans les audits historiques.' using errcode='55000'; end if;
  perform internal_audit_private.assert_hr_functions(p_payload->'rows',company_id,coalesce(prior.rows,'[]'::jsonb));
  return internal_audit_private.save_template_before_grid_roles(p_payload);
end;
$$;

create function internal_audit_private.save_audit(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare company_id bigint := internal_audit_private.assert_manager(p_payload); prior public.internal_audits;
  saved jsonb; participant_ids jsonb; participant_id bigint;
begin
  select * into prior from public.internal_audits audit where audit.id=(p_payload->>'id')::uuid for update;
  if prior.id is not null and prior.company_id<>company_id then raise exception 'Audit inaccessible.' using errcode='42501'; end if;
  if prior.status='completed' then raise exception 'Un audit terminé est conservé sans modification.' using errcode='55000'; end if;
  if prior.id is not null then perform internal_audit_private.assert_hr_functions(p_payload->'rows',company_id,prior.rows); end if;
  if p_payload ? 'participantPersonIds' then
    participant_ids := p_payload->'participantPersonIds';
    if jsonb_typeof(participant_ids) is distinct from 'array' or jsonb_array_length(participant_ids)>200 then
      raise exception 'La sélection des participants est invalide.' using errcode='22023';
    end if;
    if exists(select 1 from jsonb_array_elements(participant_ids) item where jsonb_typeof(item)<>'number' or item::text !~ '^[0-9]+$')
      or exists(select 1 from jsonb_array_elements(participant_ids) item group by item having count(*)>1) then
      raise exception 'Choisissez des personnes RH distinctes.' using errcode='22023';
    end if;
    if exists(select 1 from jsonb_array_elements_text(participant_ids) item where not exists(
      select 1 from public.people person where person.id=item::bigint and person.company_id=company_id
        and (person.active or exists(select 1 from public.internal_audit_participants participant where participant.audit_id=prior.id and participant.person_id=person.id)))) then
      raise exception 'Participant RH inaccessible ou inactif.' using errcode='22023';
    end if;
  end if;
  saved := internal_audit_private.save_audit_before_participants(p_payload);
  if participant_ids is not null then
    delete from public.internal_audit_participants participant where participant.audit_id=(saved->>'id')::uuid and participant.selected and not participant.contributed
      and not exists(select 1 from jsonb_array_elements_text(participant_ids) item where item::bigint=participant.person_id);
    update public.internal_audit_participants participant set selected=false where participant.audit_id=(saved->>'id')::uuid and participant.selected
      and not exists(select 1 from jsonb_array_elements_text(participant_ids) item where item::bigint=participant.person_id);
    for participant_id in select value::bigint from jsonb_array_elements_text(participant_ids) loop
      perform internal_audit_private.snapshot_participant(company_id,(saved->>'id')::uuid,participant_id,true,false);
    end loop;
  end if;
  -- A profile signature uploaded during preparation fills only missing image
  -- snapshots. Existing snapshots remain unchanged, including after completion.
  update public.internal_audit_participants participant
  set signature_snapshot=coalesce(public.working_time_active_signature_snapshot(participant.company_id,participant.person_id),'{}'::jsonb) - 'signed_at'
  where participant.audit_id=(saved->>'id')::uuid and participant.person_id is not null and participant.signature_snapshot='{}'::jsonb;
  return saved || internal_audit_private.participant_payload((saved->>'id')::uuid);
end;
$$;

create function internal_audit_private.archive_template(p_template_id uuid,p_version integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare company_id bigint := public.current_planning_company_id(); target public.internal_audit_templates;
begin
  if not internal_audit_private.can_manage(company_id) then raise exception 'Vous ne pouvez pas supprimer les grilles de cette société.' using errcode='42501'; end if;
  select * into target from public.internal_audit_templates template where template.id=p_template_id and template.company_id=company_id for update;
  if target.id is null then raise exception 'Grille inaccessible.' using errcode='42501'; end if;
  if p_version is null or target.version is distinct from p_version then raise exception 'La grille a été modifiée : rechargez-la avant de continuer.' using errcode='40001'; end if;
  if target.active then
    update public.internal_audit_templates set active=false,version=version+1,updated_at=clock_timestamp() where id=target.id returning * into target;
  end if;
  return to_jsonb(target);
end;
$$;

create or replace function internal_audit_private.overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_variable
declare company_id bigint := public.current_planning_company_id(); manager boolean;
begin
  if (select auth.uid()) is null or not public.user_belongs_to_company(company_id) then raise exception 'Authentification requise.' using errcode='42501'; end if;
  manager := internal_audit_private.can_manage(company_id);
  return jsonb_build_object('company_id',company_id,
    'sites',coalesce((select jsonb_agg(to_jsonb(site) order by site.name) from public.internal_audit_sites site where site.company_id=company_id and internal_audit_private.can_read_site(site.id)),'[]'::jsonb),
    'templates',coalesce((select jsonb_agg(to_jsonb(template) order by template.name) from public.internal_audit_templates template where template.company_id=company_id and template.active and manager),'[]'::jsonb),
    'audits',coalesce((select jsonb_agg(to_jsonb(audit)||internal_audit_private.participant_payload(audit.id) order by audit.year desc,audit.planned_on) from public.internal_audits audit where audit.company_id=company_id and internal_audit_private.can_read_audit(audit.id)),'[]'::jsonb),
    'findings',coalesce((select jsonb_agg(to_jsonb(finding) order by finding.due_on,finding.created_at) from public.internal_audit_findings finding where finding.company_id=company_id and internal_audit_private.can_read_finding(finding.id)),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(event) order by event.created_at,event.id) from public.internal_audit_finding_events event where event.company_id=company_id and internal_audit_private.can_read_finding(event.finding_id)),'[]'::jsonb),
    'people',coalesce((select jsonb_agg(jsonb_build_object('id',person.id,'name',btrim(concat_ws(' ',person.first_name,person.last_name)),
      'first_name',person.first_name,'last_name',person.last_name,'function_label',person.function_label,
      'has_signature',exists(select 1 from public.working_time_profile_signatures signature where signature.company_id=company_id and signature.person_id=person.id and signature.valid_to is null)) order by person.last_name,person.first_name)
      from public.people person where person.company_id=company_id and person.active and manager),'[]'::jsonb),
    'hrFunctions',coalesce((select jsonb_agg(label order by label) from (select distinct btrim(person.function_label) label from public.people person
      where person.company_id=company_id and person.active and manager and btrim(coalesce(person.function_label,''))<>'') labels),'[]'::jsonb),
    'permissions',jsonb_build_object('canManage',manager,'treatableFindingIds',coalesce((select jsonb_agg(finding.id) from public.internal_audit_findings finding where finding.company_id=company_id
      and (finding.status<>'closed' or manager) and internal_audit_private.can_read_finding(finding.id)),'[]'::jsonb)));
end;
$$;

create function internal_audit_private.can_read_participant_signature(p_bucket text,p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists(select 1 from public.internal_audit_participants participant
    where participant.signature_snapshot->>'storage_bucket'=p_bucket and participant.signature_snapshot->>'storage_path'=p_path
      and internal_audit_private.can_read_audit(participant.audit_id));
$$;
create policy internal_audit_participant_signature_read on storage.objects for select to authenticated
using(bucket_id='working-time-signatures' and internal_audit_private.can_read_participant_signature(bucket_id,name));

create function public.internal_audit_archive_template(p_template_id uuid,p_version integer)
returns jsonb language sql security invoker set search_path = '' as $$select internal_audit_private.archive_template(p_template_id,p_version);$$;
create or replace function public.internal_audit_save_template(p_payload jsonb)
returns jsonb language sql security invoker set search_path = '' as $$select internal_audit_private.save_template(p_payload);$$;
create or replace function public.internal_audit_save(p_payload jsonb)
returns jsonb language sql security invoker set search_path = '' as $$select internal_audit_private.save_audit(p_payload);$$;

revoke all on function internal_audit_private.assert_hr_functions(jsonb,bigint,jsonb),internal_audit_private.snapshot_participant(bigint,uuid,bigint,boolean,boolean),
  internal_audit_private.snapshot_account_contributor(bigint,uuid,uuid),internal_audit_private.participant_payload(uuid),internal_audit_private.record_actor_participant(),internal_audit_private.save_template(jsonb),
  internal_audit_private.save_audit(jsonb),internal_audit_private.archive_template(uuid,integer),internal_audit_private.can_read_participant_signature(text,text),
  public.internal_audit_archive_template(uuid,integer) from public,anon,authenticated;
grant execute on function internal_audit_private.save_template(jsonb),internal_audit_private.save_audit(jsonb),internal_audit_private.archive_template(uuid,integer),
  internal_audit_private.can_read_participant_signature(text,text),public.internal_audit_archive_template(uuid,integer) to authenticated;

comment on table public.internal_audit_participants is
  'Real RH identities and existing profile-signature snapshots for explicitly selected participants and actual contributors. No audit signature is inferred.';
notify pgrst,'reload schema';
