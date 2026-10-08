-- Audit ISM Interne: annual site cycles, independent template snapshots and
-- assigned corrective treatment. Public wrappers are invokers; guarded writes
-- and recursive RLS lookups live in an unexposed private schema.
create schema if not exists internal_audit_private;
revoke all on schema internal_audit_private from public, anon;
grant usage on schema internal_audit_private to authenticated;

create function internal_audit_private.valid_rows(p_rows jsonb, p_answers boolean default false, p_complete boolean default false)
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
      or jsonb_typeof(item->'guidance') is distinct from 'string' then return false; end if;
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

create table public.internal_audit_sites (
  id uuid primary key default gen_random_uuid(),
  company_id bigint not null references public.companies(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 200),
  kind text not null check (kind in ('shore','vessel')),
  vessel_id bigint,
  anniversary_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id), unique (company_id, name),
  foreign key (vessel_id,company_id) references public.vessels(id,company_id) on delete restrict,
  check (kind = 'vessel' or vessel_id is null)
);

create table public.internal_audit_templates (
  id uuid primary key default gen_random_uuid(),
  company_id bigint not null references public.companies(id) on delete restrict,
  site_id uuid,
  name text not null check (length(btrim(name)) between 1 and 200),
  version integer not null default 1 check (version > 0),
  rows jsonb not null check (internal_audit_private.valid_rows(rows)),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,company_id),
  foreign key (site_id,company_id) references public.internal_audit_sites(id,company_id) on delete restrict
);

create table public.internal_audits (
  id uuid primary key default gen_random_uuid(),
  company_id bigint not null references public.companies(id) on delete restrict,
  site_id uuid not null,
  template_id uuid not null,
  template_name text not null,
  template_version integer not null check (template_version > 0),
  year integer not null check (year between 1900 and 9998),
  planned_on date not null,
  performed_on date,
  auditor_name text not null default '',
  status text not null default 'planned' check (status in ('planned','in_progress','completed')),
  rows jsonb not null check (internal_audit_private.valid_rows(rows,true,status = 'completed')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,company_id), unique (company_id,site_id,year),
  foreign key (site_id,company_id) references public.internal_audit_sites(id,company_id) on delete restrict,
  foreign key (template_id,company_id) references public.internal_audit_templates(id,company_id) on delete restrict,
  check ((status = 'completed' and performed_on is not null and completed_at is not null and length(btrim(auditor_name)) > 0)
    or (status <> 'completed' and completed_at is null))
);

create table public.internal_audit_findings (
  id uuid primary key default gen_random_uuid(),
  company_id bigint not null references public.companies(id) on delete restrict,
  audit_id uuid not null,
  question_id text not null,
  reference text not null default '',
  severity text not null check (severity in ('major','minor','remark')),
  description text not null check (length(btrim(description)) between 1 and 10000),
  assignee_person_id bigint,
  assignee_role text check (assignee_role in ('captain','chief_engineer','crew')),
  assignee_vessel_id bigint,
  assignee_label text not null,
  due_on date not null,
  status text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  treatment text not null default '',
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,company_id),
  foreign key (audit_id,company_id) references public.internal_audits(id,company_id) on delete restrict,
  foreign key (assignee_person_id,company_id) references public.people(id,company_id) on delete restrict,
  foreign key (assignee_vessel_id,company_id) references public.vessels(id,company_id) on delete restrict,
  check ((assignee_person_id is not null and assignee_role is null and assignee_vessel_id is null)
    or (assignee_person_id is null and assignee_role is not null and assignee_vessel_id is not null)),
  check ((status = 'closed') = (closed_at is not null)),
  check (status not in ('resolved','closed') or resolved_at is not null)
);

create table public.internal_audit_finding_events (
  id uuid primary key default gen_random_uuid(),
  company_id bigint not null references public.companies(id) on delete restrict,
  finding_id uuid not null,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text not null,
  status text not null check (status in ('open','in_progress','resolved','closed')),
  treatment text not null check (length(btrim(treatment)) between 1 and 20000),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (finding_id,company_id) references public.internal_audit_findings(id,company_id) on delete restrict
);

create index internal_audit_sites_vessel_idx on public.internal_audit_sites(vessel_id,company_id);
create index internal_audit_templates_site_idx on public.internal_audit_templates(site_id,company_id);
create index internal_audit_templates_company_idx on public.internal_audit_templates(company_id,name);
create index internal_audits_template_idx on public.internal_audits(template_id,company_id);
create index internal_audits_site_date_idx on public.internal_audits(company_id,site_id,performed_on desc);
create index internal_audit_findings_audit_idx on public.internal_audit_findings(audit_id,company_id);
create index internal_audit_findings_company_due_idx on public.internal_audit_findings(company_id,due_on);
create index internal_audit_findings_person_idx on public.internal_audit_findings(assignee_person_id,company_id);
create index internal_audit_findings_vessel_idx on public.internal_audit_findings(assignee_vessel_id,company_id);
create index internal_audit_finding_events_finding_idx on public.internal_audit_finding_events(finding_id,company_id,created_at);
create index internal_audit_finding_events_actor_idx on public.internal_audit_finding_events(actor_id);
create index internal_audit_finding_events_company_idx on public.internal_audit_finding_events(company_id,created_at);

create function internal_audit_private.can_manage(p_company_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and public.has_company_role(p_company_id,array['admin','direction','armement']);
$$;

-- Legacy generic planning roles describe a group, so the person's actual HR
-- function supplies the rank. An explicit assignment rank takes precedence.
create function internal_audit_private.assignment_function(p_assignment_role text,p_person_function text)
returns text language sql immutable set search_path = '' as $$
  select case when normalized.assignment_role in ('','crew','equipage','pont','machine','mecanique','officier','marin')
    then translate(lower(coalesce(p_person_function,'')),'éèêëàâäîïôöùûüç','eeeeaaaiioouuuc')
    else normalized.assignment_role end
  from (select translate(lower(btrim(coalesce(p_assignment_role,''))),'éèêëàâäîïôöùûüç','eeeeaaaiioouuuc') assignment_role) normalized;
$$;

create function internal_audit_private.is_assigned(p_company_id bigint,p_person_id bigint,p_role text,p_vessel_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null
    and public.user_belongs_to_company(p_company_id)
    and exists (
      select 1 from public.people person
      where person.company_id = p_company_id and person.user_id = (select auth.uid()) and person.active
        and (person.id = p_person_id or (
          p_person_id is null and p_role is not null and p_vessel_id is not null
          and public.has_company_role(p_company_id,array['capitaine','marin'])
          and exists (
            select 1 from public.planning_assignments assignment
            where assignment.company_id = p_company_id and assignment.vessel_id = p_vessel_id
              and assignment.confirmation_status = 'confirmed'
              and (now() at time zone 'Europe/Paris')::date between assignment.starts_on and assignment.ends_on
              and case p_role
                when 'captain' then public.has_company_role(p_company_id,array['capitaine']) and (
                  assignment.captain_person_id = person.id or (assignment.crew_person_id = person.id and
                    internal_audit_private.assignment_function(assignment.assignment_role,person.function_label)
                      ~ '(capitaine|captain|commandant)'))
                when 'chief_engineer' then assignment.crew_person_id = person.id and
                  internal_audit_private.assignment_function(assignment.assignment_role,person.function_label)
                    ~ '(chef.*mecan|chief.*engineer|premier mecan|1er mecan)'
                when 'crew' then assignment.crew_person_id = person.id or assignment.captain_person_id = person.id
                else false end
          )
        ))
    );
$$;

create function internal_audit_private.can_read_finding(p_finding_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.internal_audit_findings finding where finding.id = p_finding_id
    and (internal_audit_private.can_manage(finding.company_id)
      or internal_audit_private.is_assigned(finding.company_id,finding.assignee_person_id,finding.assignee_role,finding.assignee_vessel_id)));
$$;

create function internal_audit_private.can_read_audit(p_audit_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.internal_audits audit where audit.id = p_audit_id
    and (internal_audit_private.can_manage(audit.company_id) or exists (
      select 1 from public.internal_audit_findings finding where finding.audit_id = audit.id
        and internal_audit_private.is_assigned(finding.company_id,finding.assignee_person_id,finding.assignee_role,finding.assignee_vessel_id))));
$$;

create function internal_audit_private.can_read_site(p_site_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.internal_audit_sites site where site.id = p_site_id
    and (internal_audit_private.can_manage(site.company_id) or exists (
      select 1 from public.internal_audits audit where audit.site_id = site.id and internal_audit_private.can_read_audit(audit.id))));
$$;

alter table public.internal_audit_sites enable row level security;
alter table public.internal_audit_templates enable row level security;
alter table public.internal_audits enable row level security;
alter table public.internal_audit_findings enable row level security;
alter table public.internal_audit_finding_events enable row level security;
revoke all on public.internal_audit_sites,public.internal_audit_templates,public.internal_audits,
  public.internal_audit_findings,public.internal_audit_finding_events from public,anon,authenticated;
grant select on public.internal_audit_sites,public.internal_audit_templates,public.internal_audits,
  public.internal_audit_findings,public.internal_audit_finding_events to authenticated;
create policy internal_audit_sites_read on public.internal_audit_sites for select to authenticated using (internal_audit_private.can_read_site(id));
create policy internal_audit_templates_read on public.internal_audit_templates for select to authenticated using (internal_audit_private.can_manage(company_id));
create policy internal_audits_read on public.internal_audits for select to authenticated using (internal_audit_private.can_read_audit(id));
create policy internal_audit_findings_read on public.internal_audit_findings for select to authenticated using (internal_audit_private.can_read_finding(id));
create policy internal_audit_finding_events_read on public.internal_audit_finding_events for select to authenticated using (internal_audit_private.can_read_finding(finding_id));

create function internal_audit_private.freeze_completed_audit()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = 'completed' then raise exception 'Un audit terminé est conservé sans modification.' using errcode = '55000'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger internal_audits_freeze_completed before update or delete on public.internal_audits
  for each row execute function internal_audit_private.freeze_completed_audit();

create function internal_audit_private.assert_manager(p_payload jsonb)
returns bigint language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_variable
declare company_id bigint := public.current_planning_company_id();
begin
  if not internal_audit_private.can_manage(company_id)
    or (p_payload->>'companyId')::bigint is distinct from company_id then
    raise exception 'Vous ne pouvez pas modifier les audits de cette société.' using errcode = '42501';
  end if;
  return company_id;
end;
$$;

create function internal_audit_private.save_site(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare company_id bigint := internal_audit_private.assert_manager(p_payload); target public.internal_audit_sites;
begin
  if exists(select 1 from public.internal_audit_sites site where site.id = (p_payload->>'id')::uuid and site.company_id <> company_id) then
    raise exception 'Site inaccessible.' using errcode = '42501';
  end if;
  if p_payload->>'kind' = 'vessel' and (p_payload->>'vesselId')::bigint is not null and not exists (
    select 1 from public.vessels vessel where vessel.id = (p_payload->>'vesselId')::bigint and vessel.company_id = company_id and vessel.active) then
    raise exception 'Navire invalide.' using errcode = '22023';
  end if;
  insert into public.internal_audit_sites(id,company_id,name,kind,vessel_id,anniversary_on)
  values ((p_payload->>'id')::uuid,company_id,btrim(p_payload->>'name'),p_payload->>'kind',(p_payload->>'vesselId')::bigint,(p_payload->>'anniversaryOn')::date)
  on conflict(id) do update set name = excluded.name,kind = excluded.kind,vessel_id = excluded.vessel_id,
    anniversary_on = excluded.anniversary_on,updated_at = clock_timestamp()
  returning * into target;
  return to_jsonb(target);
end;
$$;

create function internal_audit_private.save_template(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare company_id bigint := internal_audit_private.assert_manager(p_payload); target public.internal_audit_templates; old_template public.internal_audit_templates;
begin
  select * into old_template from public.internal_audit_templates template where template.id = (p_payload->>'id')::uuid for update;
  if old_template.id is not null and old_template.company_id <> company_id then raise exception 'Grille inaccessible.' using errcode = '42501'; end if;
  if old_template.id is not null and old_template.version is distinct from (p_payload->>'version')::integer then
    raise exception 'La grille a été modifiée : rechargez-la avant de continuer.' using errcode = '40001';
  end if;
  if not internal_audit_private.valid_rows(p_payload->'rows') then raise exception 'Questions ou barèmes invalides.' using errcode = '22023'; end if;
  insert into public.internal_audit_templates(id,company_id,site_id,name,rows,active)
  values ((p_payload->>'id')::uuid,company_id,(p_payload->>'siteId')::uuid,btrim(p_payload->>'name'),p_payload->'rows',coalesce((p_payload->>'active')::boolean,true))
  on conflict(id) do update set site_id = excluded.site_id,name = excluded.name,rows = excluded.rows,active = excluded.active,
    version = public.internal_audit_templates.version + 1,updated_at = clock_timestamp()
  returning * into target;
  return to_jsonb(target);
end;
$$;

create function internal_audit_private.save_audit(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  company_id bigint := internal_audit_private.assert_manager(p_payload);
  existing_audit public.internal_audits; target public.internal_audits;
  template public.internal_audit_templates; site public.internal_audit_sites;
  planned_date date := (p_payload->>'plannedOn')::date;
  cycle_year integer := (p_payload->>'year')::integer;
  anniversary date; copied_rows jsonb;
begin
  select * into existing_audit from public.internal_audits audit where audit.id = (p_payload->>'id')::uuid for update;
  if existing_audit.id is not null and existing_audit.company_id <> company_id then raise exception 'Audit inaccessible.' using errcode = '42501'; end if;
  if existing_audit.status = 'completed' then raise exception 'Un audit terminé est conservé sans modification.' using errcode = '55000'; end if;
  select * into site from public.internal_audit_sites s where s.id = (p_payload->>'siteId')::uuid and s.company_id = company_id for update;
  select * into template from public.internal_audit_templates t where t.id = (p_payload->>'templateId')::uuid and t.company_id = company_id;
  if site.id is null or template.id is null or (existing_audit.id is null and (
      not template.active or (template.site_id is not null and template.site_id <> site.id)
    )) then raise exception 'Site ou grille invalide pour cet audit.' using errcode = '22023'; end if;
  if existing_audit.id is not null and (existing_audit.site_id <> site.id or existing_audit.template_id <> template.id) then
    raise exception 'Le site et la grille d’un audit existant sont conservés.' using errcode = '22023';
  end if;
  if cycle_year not between 1900 and 9998 or planned_date is null then raise exception 'Cycle annuel invalide.' using errcode = '22023'; end if;
  if site.anniversary_on is not null then
    anniversary := (site.anniversary_on + make_interval(years => cycle_year - extract(year from site.anniversary_on)::integer))::date;
    if planned_date < (anniversary - interval '3 months')::date or planned_date > (anniversary + interval '3 months')::date then
      raise exception 'La date prévue doit respecter la fenêtre annuelle de plus ou moins 3 mois.' using errcode = '22023';
    end if;
  else
    if extract(year from planned_date)::integer <> cycle_year then raise exception 'Renseignez une date de référence pour planifier un cycle sur une autre année.' using errcode = '22023'; end if;
    update public.internal_audit_sites set anniversary_on = planned_date,updated_at = clock_timestamp() where id = site.id;
  end if;
  if existing_audit.id is null then
    -- The question definition comes from the current template, never from a
    -- client claiming an old version. Later draft edits are audit-specific.
    select jsonb_agg(question || jsonb_build_object('answer',null,'observation','') order by ordinal)
      into copied_rows from jsonb_array_elements(template.rows) with ordinality items(question,ordinal);
  else copied_rows := p_payload->'rows'; end if;
  if not internal_audit_private.valid_rows(copied_rows,true,p_payload->>'status' = 'completed') then
    raise exception 'La grille doit avoir des identifiants uniques, des barèmes valides et toutes les réponses à la clôture.' using errcode = '22023';
  end if;
  if exists(select 1 from public.internal_audit_findings finding where finding.audit_id = existing_audit.id and not exists(
    select 1 from jsonb_array_elements(copied_rows) question where question->>'id' = finding.question_id)) then
    raise exception 'Une question comportant des écarts ne peut pas être supprimée.' using errcode = '22023';
  end if;
  insert into public.internal_audits(id,company_id,site_id,template_id,template_name,template_version,year,planned_on,performed_on,auditor_name,status,rows,completed_at)
  values ((p_payload->>'id')::uuid,company_id,site.id,template.id,
    coalesce(existing_audit.template_name,template.name),coalesce(existing_audit.template_version,template.version),cycle_year,planned_date,
    (p_payload->>'performedOn')::date,coalesce(btrim(p_payload->>'auditorName'),''),p_payload->>'status',copied_rows,
    case when p_payload->>'status' = 'completed' then clock_timestamp() else null end)
  on conflict(id) do update set year = excluded.year,planned_on = excluded.planned_on,performed_on = excluded.performed_on,
    auditor_name = excluded.auditor_name,status = excluded.status,rows = excluded.rows,completed_at = excluded.completed_at,updated_at = clock_timestamp()
  returning * into target;
  return to_jsonb(target);
end;
$$;

create function internal_audit_private.actor_name(p_company_id bigint)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(btrim(concat_ws(' ',person.first_name,person.last_name)),''),nullif(btrim(profile.display_name),''),profile.email,'Utilisateur SeaPilot')
  from public.profiles profile left join public.people person on person.user_id = profile.id and person.company_id = p_company_id and person.active
  where profile.id = (select auth.uid());
$$;

create function internal_audit_private.save_finding(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  company_id bigint := internal_audit_private.assert_manager(p_payload);
  target public.internal_audit_findings; old_finding public.internal_audit_findings;
  audit public.internal_audits; question jsonb; label text;
  person_id bigint := (p_payload->>'assigneePersonId')::bigint;
  vessel_id bigint := (p_payload->>'assigneeVesselId')::bigint;
  assigned_role text := p_payload->>'assigneeRole';
begin
  select * into old_finding from public.internal_audit_findings finding where finding.id = (p_payload->>'id')::uuid for update;
  if old_finding.id is not null and old_finding.company_id <> company_id then raise exception 'Écart inaccessible.' using errcode = '42501'; end if;
  if old_finding.status = 'closed' then raise exception 'Un écart clos doit être rouvert avant modification.' using errcode = '55000'; end if;
  select * into audit from public.internal_audits a where a.id = (p_payload->>'auditId')::uuid and a.company_id = company_id for update;
  select item into question from jsonb_array_elements(audit.rows) item where item->>'id' = p_payload->>'questionId';
  if audit.id is null or question is null then raise exception 'La question ne figure pas dans cet audit.' using errcode = '22023'; end if;
  if old_finding.id is not null and (old_finding.audit_id <> audit.id or old_finding.question_id <> p_payload->>'questionId') then
    raise exception 'L’audit et la question d’un écart existant sont conservés.' using errcode = '22023';
  end if;
  if person_id is not null and (assigned_role is not null or vessel_id is not null) then raise exception 'Choisissez une personne ou une fonction sur un navire.' using errcode = '22023'; end if;
  if person_id is not null then
    select btrim(concat_ws(' ',person.first_name,person.last_name)) into label from public.people person where person.id = person_id and person.company_id = company_id and person.active;
  elsif assigned_role in ('captain','chief_engineer','crew') and vessel_id is not null then
    select case assigned_role when 'captain' then 'Capitaines ' when 'chief_engineer' then 'Chefs Mécaniciens ' else 'Équipage ' end || vessel.name
    into label from public.vessels vessel where vessel.id = vessel_id and vessel.company_id = company_id and vessel.active;
  end if;
  if label is null then raise exception 'Responsable de traitement invalide.' using errcode = '22023'; end if;
  insert into public.internal_audit_findings(id,company_id,audit_id,question_id,reference,severity,description,assignee_person_id,assignee_role,assignee_vessel_id,assignee_label,due_on)
  values ((p_payload->>'id')::uuid,company_id,audit.id,question->>'id',coalesce(question->>'reference',''),p_payload->>'severity',btrim(p_payload->>'description'),person_id,assigned_role,vessel_id,label,(p_payload->>'dueOn')::date)
  on conflict(id) do update set severity = excluded.severity,description = excluded.description,assignee_person_id = excluded.assignee_person_id,
    assignee_role = excluded.assignee_role,assignee_vessel_id = excluded.assignee_vessel_id,assignee_label = excluded.assignee_label,due_on = excluded.due_on,updated_at = clock_timestamp()
  returning * into target;
  if old_finding.id is null or (old_finding.assignee_person_id,old_finding.assignee_role,old_finding.assignee_vessel_id,old_finding.due_on,old_finding.severity,old_finding.description)
    is distinct from (target.assignee_person_id,target.assignee_role,target.assignee_vessel_id,target.due_on,target.severity,target.description) then
    insert into public.internal_audit_finding_events(company_id,finding_id,actor_id,actor_name,status,treatment)
    values(company_id,target.id,(select auth.uid()),internal_audit_private.actor_name(company_id),target.status,
      case when old_finding.id is null then 'Écart créé : ' else 'Écart mis à jour : ' end || target.description || ' — Responsable : ' || target.assignee_label || ' — Échéance : ' || target.due_on::text);
  end if;
  return to_jsonb(target);
end;
$$;

create function internal_audit_private.add_treatment(p_finding_id uuid,p_status text,p_treatment text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.internal_audit_findings; event public.internal_audit_finding_events; manager boolean;
begin
  select * into target from public.internal_audit_findings finding where finding.id = p_finding_id for update;
  if target.id is null or not internal_audit_private.can_read_finding(target.id) then raise exception 'Écart inaccessible.' using errcode = '42501'; end if;
  manager := internal_audit_private.can_manage(target.company_id);
  if target.status = 'closed' and not manager then raise exception 'Un écart clos ne peut plus être traité.' using errcode = '55000'; end if;
  if p_status is null or p_status not in ('open','in_progress','resolved','closed') or length(btrim(coalesce(p_treatment,''))) not between 1 and 10000 then
    raise exception 'Statut ou commentaire de traitement invalide.' using errcode = '22023';
  end if;
  if p_status = 'closed' and not manager then raise exception 'La vérification et la clôture sont réservées à la gestion des audits.' using errcode = '42501'; end if;
  if p_status = 'closed' and target.status <> 'resolved' then raise exception 'Traitez l’écart avant de vérifier sa clôture.' using errcode = '22023'; end if;
  insert into public.internal_audit_finding_events(company_id,finding_id,actor_id,actor_name,status,treatment)
    values(target.company_id,target.id,(select auth.uid()),internal_audit_private.actor_name(target.company_id),p_status,btrim(p_treatment)) returning * into event;
  update public.internal_audit_findings set status = p_status,treatment = btrim(p_treatment),
    resolved_at = case when p_status in ('resolved','closed') then coalesce(target.resolved_at,event.created_at) else null end,
    closed_at = case when p_status = 'closed' then event.created_at else null end,updated_at = event.created_at where id = target.id;
  return to_jsonb(event);
end;
$$;

create function internal_audit_private.overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_variable
declare company_id bigint := public.current_planning_company_id(); manager boolean;
begin
  if (select auth.uid()) is null or not public.user_belongs_to_company(company_id) then raise exception 'Authentification requise.' using errcode = '42501'; end if;
  manager := internal_audit_private.can_manage(company_id);
  return jsonb_build_object('company_id',company_id,
    'sites',coalesce((select jsonb_agg(to_jsonb(site) order by site.name) from public.internal_audit_sites site where site.company_id = company_id and internal_audit_private.can_read_site(site.id)),'[]'::jsonb),
    'templates',coalesce((select jsonb_agg(to_jsonb(template) order by template.name) from public.internal_audit_templates template where template.company_id = company_id and manager),'[]'::jsonb),
    'audits',coalesce((select jsonb_agg(to_jsonb(audit) order by audit.year desc,audit.planned_on) from public.internal_audits audit where audit.company_id = company_id and internal_audit_private.can_read_audit(audit.id)),'[]'::jsonb),
    'findings',coalesce((select jsonb_agg(to_jsonb(finding) order by finding.due_on,finding.created_at) from public.internal_audit_findings finding where finding.company_id = company_id and internal_audit_private.can_read_finding(finding.id)),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(event) order by event.created_at,event.id) from public.internal_audit_finding_events event where event.company_id = company_id and internal_audit_private.can_read_finding(event.finding_id)),'[]'::jsonb),
    'people',coalesce((select jsonb_agg(jsonb_build_object('id',person.id,'name',btrim(concat_ws(' ',person.first_name,person.last_name)),'function_label',person.function_label) order by person.last_name,person.first_name)
      from public.people person where person.company_id = company_id and person.active and manager),'[]'::jsonb),
    'permissions',jsonb_build_object('canManage',manager,'treatableFindingIds',coalesce((select jsonb_agg(finding.id) from public.internal_audit_findings finding where finding.company_id = company_id
      and (finding.status <> 'closed' or manager) and internal_audit_private.can_read_finding(finding.id)),'[]'::jsonb)));
end;
$$;

create function public.internal_audits_overview() returns jsonb language sql stable security invoker set search_path = '' as $$select internal_audit_private.overview();$$;
create function public.internal_audit_save_site(p_payload jsonb) returns jsonb language sql security invoker set search_path = '' as $$select internal_audit_private.save_site(p_payload);$$;
create function public.internal_audit_save_template(p_payload jsonb) returns jsonb language sql security invoker set search_path = '' as $$select internal_audit_private.save_template(p_payload);$$;
create function public.internal_audit_save(p_payload jsonb) returns jsonb language sql security invoker set search_path = '' as $$select internal_audit_private.save_audit(p_payload);$$;
create function public.internal_audit_save_finding(p_payload jsonb) returns jsonb language sql security invoker set search_path = '' as $$select internal_audit_private.save_finding(p_payload);$$;
create function public.internal_audit_add_treatment(p_finding_id uuid,p_status text,p_treatment text) returns jsonb language sql security invoker set search_path = '' as $$select internal_audit_private.add_treatment(p_finding_id,p_status,p_treatment);$$;

revoke all on all functions in schema internal_audit_private from public,anon,authenticated;
grant execute on all functions in schema internal_audit_private to authenticated;
revoke all on function public.internal_audits_overview(),public.internal_audit_save_site(jsonb),public.internal_audit_save_template(jsonb),
  public.internal_audit_save(jsonb),public.internal_audit_save_finding(jsonb),public.internal_audit_add_treatment(uuid,text,text) from public,anon,authenticated;
grant execute on function public.internal_audits_overview(),public.internal_audit_save_site(jsonb),public.internal_audit_save_template(jsonb),
  public.internal_audit_save(jsonb),public.internal_audit_save_finding(jsonb),public.internal_audit_add_treatment(uuid,text,text) to authenticated;

insert into public.role_module_permissions(role_key,module_key,is_visible)
select role.key,module.key,true from public.roles role cross join (
  values ('ecmid'),('externalIsmAudits'),('internalAudits'),('clientAudits')
) module(key) where role.key in ('admin','direction','armement','capitaine','marin')
on conflict(role_key,module_key) do nothing;

insert into public.internal_audit_sites(company_id,name,kind,vessel_id)
select company.id,requested.name,requested.kind,(
  select vessel.id from public.vessels vessel where vessel.company_id = company.id and vessel.active
    and upper(vessel.name) = requested.vessel_name order by vessel.id limit 1
) from public.companies company cross join (values
  ('Armement - CHERBOURG','shore',null::text),('Yard - LE HAVRE','shore',null::text),
  ('GOURY','vessel','GOURY'),('LE ROZEL','vessel','LE ROZEL'),('LANDEMER','vessel','LANDEMER'),
  ('SUROIT','vessel','SUROIT'),('KROKDUR','vessel','KROKDUR'),('HIRONDELLE DE LA MANCHE','vessel','HIRONDELLE DE LA MANCHE')
) requested(name,kind,vessel_name) where company.code = 'bbtm';

-- The eight requested audit targets comprise two shore sites and six vessels.
-- No historical dates or historical scores are inferred from the source workbook.
comment on table public.internal_audits is 'Annual audit records with independently copied question/answer snapshots; completed records are immutable.';
comment on table public.internal_audit_findings is 'Multiple deviations per audit question, assigned to a real person or a current confirmed vessel function.';
comment on table public.internal_audit_finding_events is 'Append-only treatment and assignment history; closure requires manager verification after resolution.';

-- Seed reference questions from the supplied workbook; two missing barèmes were
-- confirmed at 3 points by the user on 2026-09-30.
insert into public.internal_audit_templates(company_id,name,rows)
select id,'Grille d’audit BBTM',$audit_seed$[{"id": "bbtm-row-15", "section": "1. Généralités", "reference": "1.2.2.1", "question": "Offrir des pratiques d'exploitation et un environnement sans danger", "maxPoints": 3, "guidance": "Comment s'assure-t-on que les risques pour la santé et l'environnement  sont maîtrisés lors des différentes opérations à bord."}, {"id": "bbtm-row-16", "section": "1. Généralités", "reference": "1.2.2.2", "question": "Evaluer les risques identifiés pour ses navires, son personnel et l'environnement et établir des mesures de sécurité appropriées", "maxPoints": 3, "guidance": "Présenter le DUP à jour"}, {"id": "bbtm-row-17", "section": "1. Généralités", "reference": "1.2.2.3", "question": "Améliorer constamment les compétences du personnel à terre et à bord des navires en matière de gestion de la sécurité, et notamment préparer ce personnel aux situations d'urgence, tant sur le plan de la sécurité que de la protection du milieu marin.", "maxPoints": 3, "guidance": "Présenter les exercices sécurité de la bordée"}, {"id": "bbtm-row-18", "section": "1. Généralités", "reference": "1.2.3.1", "question": "Le système de gestion devrait garantir :\nQue les règles et règlements obligatoires sont observés", "maxPoints": 3, "guidance": "Présenter les dernières mises à jour réglementaires à bord"}, {"id": "bbtm-row-19", "section": "1. Généralités", "reference": "1.2.3.2", "question": "Le système de gestion devrait garantir :\nQue les recueils de règles, codes, directives et normes applicables recommandés par l'Organisation, les Administrations, les sociétés de classification et les organismes du secteur maritime sont pris en considération.", "maxPoints": 3, "guidance": "Présenter la bibliothèque règlementaire à bord (Division 160, 221, MODU, SOLAS, STCW)"}, {"id": "bbtm-row-21", "section": "1. Généralités", "reference": "1.4.1", "question": "Politique en matière de sécurité et de protection de l'environnement", "maxPoints": 3, "guidance": ""}, {"id": "bbtm-row-22", "section": "1. Généralités", "reference": "1.4.2", "question": "Instructions et procédures propres à garantir la sécurité de l'exploitation des navires et la protection de l'environnement conforme à la réglementation internationale et à la législation de l'Etat du pavillon pertinentes", "maxPoints": 3, "guidance": ""}, {"id": "bbtm-row-23", "section": "1. Généralités", "reference": "1.4.3", "question": "une hiérarchie des moyens de communications permettant aux membres du personnel à bord de communiquer entre eux et avec les membres du personnel à terre", "maxPoints": 3, "guidance": ""}, {"id": "bbtm-row-24", "section": "1. Généralités", "reference": "1.4.4", "question": "des procédures de notification des accidents et du non-respect des dispositions du présent Code", "maxPoints": 3, "guidance": ""}, {"id": "bbtm-row-25", "section": "1. Généralités", "reference": "1.4.5", "question": "des procédures de préparation et d'intervention pour faire face aux situations d'urgence", "maxPoints": 3, "guidance": ""}, {"id": "bbtm-row-26", "section": "1. Généralités", "reference": "1.4.6", "question": "des procédures d'audit interne et de contrôle de la gestion", "maxPoints": 3, "guidance": ""}, {"id": "bbtm-row-28", "section": "2. Politique en matière de sécurité et de protection de l'environnement", "reference": "2.1", "question": "La compagnie devrait établir une politique en matière de sécurité et de protection de l'environnement qui décrive comment les objectifs énoncés au paragraphe 1.2 seront réalisés", "maxPoints": 3, "guidance": "Présenter la Politique de la CML"}, {"id": "bbtm-row-29", "section": "2. Politique en matière de sécurité et de protection de l'environnement", "reference": "2.2", "question": "La compagnie devrait veiller à ce que cette politique soit appliquée à tous les niveaux de l'organisation, tant à bord des navires qu'à terre", "maxPoints": 3, "guidance": "Présenter le suivi des objectifs de la compagnie"}, {"id": "bbtm-row-31", "section": "3. Responsabilités et autorité de la compagnie", "reference": "3.2", "question": "La compagnie devrait définir et établir par écrit les responsabilités, les pouvoirs et les relations réciproques de l'ensemble du personnel chargé de la gestion, de l'exécution et de la vérification des activités liées à la sécurité et à la prévention de la pollution ou ayant une incidence sur celles-ci", "maxPoints": 3, "guidance": "Présenter l'organigramme et les fiches de fonction à jour."}, {"id": "bbtm-row-32", "section": "3. Responsabilités et autorité de la compagnie", "reference": "3.3", "question": "La compagnie devrait veiller à ce que des ressources adéquates et un soutien approprié à terre soient fournis pour que la ou les personnes désignées puissent s'acquitter de leurs tâches.", "maxPoints": 3, "guidance": ""}, {"id": "bbtm-row-35", "section": "5. Responsabilités et autorité du capitaine", "reference": "5.1.1", "question": "mettre en œuvre la politique de la compagnie en matière de sécurité et de protection de l'environnement", "maxPoints": 3, "guidance": ""}, {"id": "bbtm-row-36", "section": "5. Responsabilités et autorité du capitaine", "reference": "5.1.2", "question": "encourager les membres de l'équipage à appliquer cette politique", "maxPoints": 3, "guidance": ""}, {"id": "bbtm-row-37", "section": "5. Responsabilités et autorité du capitaine", "reference": "5.1.3", "question": "donner les ordres et les consignes appropriés d'une manière claire et simple", "maxPoints": 3, "guidance": ""}, {"id": "bbtm-row-38", "section": "5. Responsabilités et autorité du capitaine", "reference": "5.1.4", "question": "vérifier qu'il est satisfait aux spécifications", "maxPoints": 3, "guidance": ""}, {"id": "bbtm-row-39", "section": "5. Responsabilités et autorité du capitaine", "reference": "5.1.5", "question": "passer en revue périodiquement le système de gestion de la sécurité", "maxPoints": 3, "guidance": "Présenter la dernière \"FOR-SMS 06 A - Revue Annuelle du SMS\""}, {"id": "bbtm-row-40", "section": "5. Responsabilités et autorité du capitaine", "reference": "5.2", "question": "La compagnie devrait veiller à ce que le système de gestion de la sécurité à bord du navire mette expressément l'accent sur l'autorité du capitaine.", "maxPoints": 3, "guidance": ""}, {"id": "bbtm-row-41", "section": "5. Responsabilités et autorité du capitaine", "reference": "", "question": "La compagnie devrait préciser, dans le système dans le système de gestion de la sécurité, que l'autorité supérieure appartient au capitaine et qu'il a la responsabilité de prendre des décisions concernant la sécurité et la prévention de la pollution et de demander l'assistance de la compagnie si cela s'avère nécessaire.", "maxPoints": 3, "guidance": "Présenter le \"GEN-ORG 03 B - Responsabilité et Autorité du Capitaine\". Cette déclaration est-elle applicable ? Appliquée ?"}, {"id": "bbtm-row-44", "section": "6. Ressources et personnel", "reference": "6.1.1", "question": "a les qualifications requises pour commander le navire", "maxPoints": 3, "guidance": "Brevets du Capitaine à jour ?"}, {"id": "bbtm-row-45", "section": "6. Ressources et personnel", "reference": "6.1.2", "question": "connaît parfaitement le système de gestion de la sécurité de la compagnie", "maxPoints": 3, "guidance": "Le capitaine a-t-il reçu une formation sur l'architecture du système ISM ? Enregistrements ?"}, {"id": "bbtm-row-46", "section": "6. Ressources et personnel", "reference": "6.1.3", "question": "bénéficie de tout l'appui nécessaire pour s'acquitter en toute sécurité de ses tâches", "maxPoints": 3, "guidance": ""}, {"id": "bbtm-row-48", "section": "6. Ressources et personnel", "reference": "6.2.1", "question": "doté d'un personnel navigant ayant les qualifications, les brevets et certificats et l'aptitude physique qu'exigent les prescriptions nationales et internationales", "maxPoints": 3, "guidance": "Présenter l'état des brevets et des visites médicales de l'équipage"}, {"id": "bbtm-row-49", "section": "6. Ressources et personnel", "reference": "6.2.2", "question": "doté d'effectifs appropriés afin de couvrir tous les aspects liés au maintien de la sécurité des opérations à bord", "maxPoints": 3, "guidance": "Le personnel à bord est-il correctement formé pour garantir la sécurité des opérations ? Proposition/Demande de formation ?"}, {"id": "bbtm-row-50", "section": "6. Ressources et personnel", "reference": "6.3", "question": "La compagnie devrait établir des procédures pour garantir que le nouveau personnel et le personnel affecté à de nouvelles fonctions liées à la sécurité et à la protection de l'environnement reçoivent la formation nécessaire à l'exécution de leurs tâche", "maxPoints": 3, "guidance": "Présenter la familiarisation à la sécurité de la bordée.\nFOR-SEC 03.3 - Fiche Familiarisation Equipage"}, {"id": "bbtm-row-51", "section": "6. Ressources et personnel", "reference": "", "question": "Les consignes qu'il est essentiel de donner avant l'appareillage devraient être identifiées, établies par écrit et transmises.", "maxPoints": 3, "guidance": "Présenter le classeur contenant l'archivage des \"FOR-GO-NOGO 02 B - Appareillage Port\""}, {"id": "bbtm-row-52", "section": "6. Ressources et personnel", "reference": "6.4", "question": "La compagnie devrait veiller à ce que l'ensemble du personnel intervenant dans le système de gestion de la sécurité de la compagnie comprenne de manière satisfaisante les règles, règlements, recueils de règles, codes et directives pertinents.", "maxPoints": 3, "guidance": ""}, {"id": "bbtm-row-53", "section": "6. Ressources et personnel", "reference": "6.5", "question": "La compagnie devrait établir et maintenir des procédures permettant d'identifier la formation éventuellement nécessaire pour la mise en œuvre du système de gestion de la sécurité et veiller à ce qu'une telle formation soit dispensée à l'ensemble du personnel concerné", "maxPoints": 3, "guidance": "Formation de l'équipage à l'utilisation du Système ISM à bord ?"}, {"id": "bbtm-row-54", "section": "6. Ressources et personnel", "reference": "6.6", "question": "La compagnie devrait élaborer des procédures garantissant que le personnel du navire reçoive les renseignements appropriés sur le système de gestion de la sécurité dans une ou plusieurs langue(s) de travail qu'il comprenne", "maxPoints": 3, "guidance": "Les procédures et checklists sont elles comprises par la bordée ?"}, {"id": "bbtm-row-55", "section": "6. Ressources et personnel", "reference": "6.7", "question": "La compagnie devrait veiller à ce que les membres du personnel du navire soient capables de communiquer efficacement entre eux dans le cadre de leurs fonctions liées au système de gestion de la sécurité", "maxPoints": 3, "guidance": ""}, {"id": "bbtm-row-57", "section": "7. Opérations à bord", "reference": "", "question": "La compagnie devrait établir des procédures, plans et consignes, y compris des listes de contrôle, s'il y a lieu, pour les principales opérations à bord qui concernent la sécurité du personnel et du navire et la protection de l'environnement.", "maxPoints": 3, "guidance": "Vérifier le classeur archivant les \"FOR-SMS 02.1 - Demande d'Amélioration\". Les fiches sont-elles soldées / Prises en compte par l'armement et les équipages."}, {"id": "bbtm-row-58", "section": "7. Opérations à bord", "reference": "", "question": "Les diverses tâches en jeu devraient être définies et être assignées à un personnel qualifié.", "maxPoints": 3, "guidance": ""}, {"id": "bbtm-row-60", "section": "8. Préparation aux situations d'urgence", "reference": "8.1", "question": "La compagnie devrait établir les procédures pour identifier et décrire les situations d’urgence susceptibles de survenir à bord ainsi que les mesures à prendre pour y faire face", "maxPoints": 3, "guidance": ""}, {"id": "bbtm-row-61", "section": "8. Préparation aux situations d'urgence", "reference": "8.2", "question": "La compagnie devrait mettre au point des programmes d’exercices préparant aux mesures à prendre en cas d’urgence", "maxPoints": 3, "guidance": ""}, {"id": "bbtm-row-62", "section": "8. Préparation aux situations d'urgence", "reference": "8.3", "question": "Le système de gestion doit prévoir des mesures propres à garantir que l’organisation de la compagnie est à tout moment en mesure de faire face aux dangers, accidents et situations d’urgence pouvant mettre en cause ses navires", "maxPoints": 3, "guidance": "Présenter le suivi des exercices d'urgence à bord."}, {"id": "bbtm-row-64", "section": "9. Notification et analyse des irrégularités, des accidents et des incidents potentiellement dangereux", "reference": "9.1", "question": "Le système de gestion de la sécurité devrait prévoir des procédures garantissant que les irrégularités, les accidents potentiellement dangereux sont signalés à la compagnie et qu'ils font l'objet d'une enquête et d'une analyse, l'objectif étant de renforcer la sécurité et la prévention de la pollution.", "maxPoints": 3, "guidance": "Vérifier le classeur archivant les \"FOR-SMS 02.2 - Fiche d'Accident - Presqu'Accident - Situation Dangereuse\". Les fiches sont-elles soldées / Prises en compte par l'armement et les équipages."}, {"id": "bbtm-row-65", "section": "9. Notification et analyse des irrégularités, des accidents et des incidents potentiellement dangereux", "reference": "9.2", "question": "La compagnie devrait établir des procédures pour l'application de mesures correctives, y compris de mesures propres à éviter que le même problème ne se reproduise.", "maxPoints": 3, "guidance": ""}, {"id": "bbtm-row-67", "section": "10. Maintien en état du navire et de son armement", "reference": "10.1", "question": "La compagnie devrait mettre en place des procédures permettant de vérifier que le navire est maintenu dans un état conforme aux dispositions des règles et des règlements pertinents ainsi qu'aux prescriptions supplémentaires qui pourraient être établies par la compagnie.", "maxPoints": 3, "guidance": ""}, {"id": "bbtm-row-69", "section": "10. Maintien en état du navire et de son armement", "reference": "10.2.1", "question": "Des inspections soient effectuées à intervalles appropriés", "maxPoints": 3, "guidance": "Suivi des \"FOR-TEC- 27 - Essais Hebdomadaires Machine\""}, {"id": "bbtm-row-70", "section": "10. Maintien en état du navire et de son armement", "reference": "10.2.2", "question": "toute irrégularité soit signalée, avec indication de la cause éventuelle, si celle-ci est connue", "maxPoints": 3, "guidance": "Suivi des \"Waranty Claim\" / \"Fiches de travaux\" / \"Demandes d'Amélioration\""}, {"id": "bbtm-row-71", "section": "10. Maintien en état du navire et de son armement", "reference": "10.2.3", "question": "les mesures correctives appropriées soient prises", "maxPoints": 3, "guidance": "Comment le Chef Mécanicien traite-t-il les avaries ? Les avaries entrainent elle la modification du plan de maintenance ?"}, {"id": "bbtm-row-72", "section": "10. Maintien en état du navire et de son armement", "reference": "10.2.4", "question": "ces activités soient consignées dans un registre", "maxPoints": 3, "guidance": "Présenter le journal Machine (prise en compte des remarques des autres chefs mécaniciens)"}, {"id": "bbtm-row-73", "section": "10. Maintien en état du navire et de son armement", "reference": "10.3", "question": "La compagnie devrait identifier le matériel et les systèmes techniques dont la panne soudaine pourrait entrainer des situations dangereuses.", "maxPoints": 3, "guidance": "Donner la définition d'un équipement Critique, Redondant et en Marche discontinue\nPrésenter la procédure d'identification des Equipements Critiques, redondants et en marche discontinue.\nPrésenter la liste des Equipements C-R-MD"}, {"id": "bbtm-row-74", "section": "10. Maintien en état du navire et de son armement", "reference": "", "question": "Le système de gestion de la sécurité devrait prévoir des mesures spécifiques pour renforcer la fiabilité de ce matériel et de ces systèmes.", "maxPoints": 3, "guidance": "Quelle sont les mesures mises en œuvre pour renforcer la fiabilité de ces équipements"}, {"id": "bbtm-row-75", "section": "10. Maintien en état du navire et de son armement", "reference": "", "question": "Ces mesures devraient inclure la mise à l'essai à intervalles régulier de ces dispositifs et du matériel de secours ainsi que des systèmes techniques qui ne sont pas utilisés en permanence.", "maxPoints": 3, "guidance": "Présenter le plan de maintenance avec le suivi des Equipements Critiques, Redondants et en Marche Discontinue."}, {"id": "bbtm-row-76", "section": "10. Maintien en état du navire et de son armement", "reference": "10.4", "question": "Les inspections mentionnées au paragraphe 10.2 ci-dessus ainsi que les mesures visées au paragraphe 10.3 devraient être intégrées dans le programme d'entretien courant", "maxPoints": 3, "guidance": ""}, {"id": "bbtm-row-78", "section": "11. Documents", "reference": "11.1", "question": "La compagnie devrait élaborer et maintenir des procédures permettant de contrôler tous les documents et renseignements se rapportant au système de gestion de la sécurité", "maxPoints": 3, "guidance": "Comment le capitaine gère-t-il le SMS ?\nVersion périmées ? Mises à jour ?"}, {"id": "bbtm-row-79", "section": "11. Documents", "reference": "11.2", "question": "la compagnie devrait s'assurer que :", "maxPoints": 3, "guidance": ""}, {"id": "bbtm-row-80", "section": "11. Documents", "reference": "11.2.1", "question": "des documents en cours de validité sont disponibles à tous les endroits pertinents", "maxPoints": 3, "guidance": "Préciser les différents lieux de stockage du SMS.\nVérifier que les différentes version du SMS soient à jour."}, {"id": "bbtm-row-81", "section": "11. Documents", "reference": "11.2.2", "question": "Les modifications apportées à ces documents sont examinées et approuvées par le personnel compétent", "maxPoints": 3, "guidance": "Gestion des mises à jour documentaires à bord"}, {"id": "bbtm-row-82", "section": "11. Documents", "reference": "11.2.3", "question": "Les documents périmés sont rapidement retirés", "maxPoints": 3, "guidance": ""}, {"id": "bbtm-row-83", "section": "11. Documents", "reference": "11.3", "question": "Les documents utilisés pour décrire et mettre en œuvre le système de gestion peuvent faire l’objet du « manuel de gestion de la sécurité ». Ces documents doivent être conservés sous la forme jugée la plus appropriée par la compagnie. Chaque navire doit avoir à bord tous les documents le concernant.", "maxPoints": 3, "guidance": ""}, {"id": "bbtm-row-85", "section": "12. Vérification, examen et évaluation effectués par la compagnie", "reference": "12.1", "question": "La compagnie devrait effectuer des audits internes à bord et à terre, à des intervalles ne dépassant pas 12 mois, pour vérifier que les activités liées à la sécurité et à la prévention de la pollution sont conformes au système de gestion de la sécurité. Dans des circonstances exceptionnelles, cet intervalle peut être prolongé de trois mois au plus.", "maxPoints": 3, "guidance": ""}, {"id": "bbtm-row-86", "section": "12. Vérification, examen et évaluation effectués par la compagnie", "reference": "12.2", "question": "La compagnie devrait vérifier périodiquement que tous ceux qui exécutent des tâches liées au Code ISM agissent en conformité avec les responsabilités qui incombent à la compagnie en vertu du code", "maxPoints": 3, "guidance": ""}, {"id": "bbtm-row-87", "section": "12. Vérification, examen et évaluation effectués par la compagnie", "reference": "12.3", "question": "La compagnie devrait évaluer périodiquement l'efficacité du système conformément aux procédures qu'elle a établies", "maxPoints": 3, "guidance": ""}, {"id": "bbtm-row-88", "section": "12. Vérification, examen et évaluation effectués par la compagnie", "reference": "12.4", "question": "Les audits ainsi que les éventuelles mesures correctives devraient être exécutées conformément aux procédures établies.", "maxPoints": 3, "guidance": "Vérifier la logique de traitement des actions correctives"}, {"id": "bbtm-row-89", "section": "12. Vérification, examen et évaluation effectués par la compagnie", "reference": "12.6", "question": "Les résultats des audits et révisions devraient être portés à l'attention de l'ensemble du personnel ayant des responsabilités dans le secteur en cause", "maxPoints": 3, "guidance": "Les résultats du dernier audits ont-il été mis à l'affichage ?"}, {"id": "bbtm-row-90", "section": "12. Vérification, examen et évaluation effectués par la compagnie", "reference": "12.7", "question": "Le personnel d'encadrement responsable du secteur concerné devrait prendre sans retard les mesures correctives nécessaires pour remédier aux défectuosités constatées.", "maxPoints": 3, "guidance": "Vérifier que les écarts constatés lors du dernier audit sont traités et ou soldés."}]$audit_seed$::jsonb from public.companies where code = 'bbtm';
