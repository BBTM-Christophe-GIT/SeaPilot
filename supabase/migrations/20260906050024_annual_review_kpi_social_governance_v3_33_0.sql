-- Annual review objectives, RH due dates and Social/Governance KPI governance.

alter table public.annual_reviews add column if not exists due_on date;

update public.annual_reviews
set due_on = make_date(review_year + 1, 12, 31)
where due_on is null;

alter table public.annual_reviews alter column due_on set not null;

alter table public.annual_reviews
  drop constraint if exists annual_reviews_quarter_hour_check;
alter table public.annual_reviews
  add constraint annual_reviews_quarter_hour_check check (
    extract(second from starts_at) = 0
    and extract(minute from starts_at)::integer % 15 = 0
    and extract(epoch from (ends_at - starts_at))::bigint % 900 = 0
  );

create table public.annual_review_objectives (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  review_id bigint not null references public.annual_reviews(id) on delete cascade,
  objective_key text not null,
  objective text not null,
  completion_percent integer not null default 0,
  comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint annual_review_objectives_key_check check (objective_key ~ '^goal-[0-9]+$'),
  constraint annual_review_objectives_text_check check (length(btrim(objective)) between 1 and 1000),
  constraint annual_review_objectives_comment_check check (length(comment) <= 2000),
  constraint annual_review_objectives_percent_check check (completion_percent between 0 and 100),
  constraint annual_review_objectives_unique_key unique (review_id, objective_key)
);

create index annual_review_objectives_review_idx
  on public.annual_review_objectives (review_id, id);

create trigger annual_review_objectives_updated_at
before update on public.annual_review_objectives
for each row execute function public.set_annual_review_updated_at();

alter table public.annual_review_objectives enable row level security;
revoke all on public.annual_review_objectives from anon, authenticated;
grant select on public.annual_review_objectives to authenticated;

create policy annual_review_objectives_read
on public.annual_review_objectives for select to authenticated
using (
  company_id = public.current_planning_company_id()
  and public.annual_review_can_read(review_id)
);

create or replace function public.annual_review_answers_complete(p_answers jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    jsonb_typeof(p_answers) = 'object'
    and not exists (
      select 1
      from unnest(array[
        'bridge_manoeuvres', 'bridge_management', 'bridge_certificates', 'bridge_calls',
        'engine_operation', 'engine_breakdowns', 'engine_inventory', 'engine_lifting',
        'engine_deck', 'engine_maintenance', 'qhse_policy', 'qhse_sms', 'qhse_procedures',
        'qhse_ppe', 'admin_english', 'admin_reporting', 'admin_writing', 'admin_it',
        'admin_certificates', 'behaviour_clients', 'behaviour_team', 'behaviour_image',
        'behaviour_initiative'
      ]) question_id
      where coalesce(p_answers #>> array['evaluation', question_id, 'rating'], '')
        <> all(array['Non Applicable', 'Très faible', 'Faible', 'Moyen', 'Bon', 'Excellent'])
    )
    and coalesce(p_answers #>> '{life,overall}', '')
      = any(array['très satisfait', 'satisfait', 'peu satisfait', 'insatisfait'])
    and not exists (
      select 1
      from unnest(array['missions', 'compensation', 'recognition', 'crew', 'rhythm', 'position']) condition_id
      where coalesce(p_answers #>> array['life', 'conditions', condition_id], '')
        <> all(array['très satisfait', 'satisfait', 'peu satisfait', 'insatisfait'])
    )
    and coalesce(p_answers #>> '{evolution,choice}', '') = any(array[
      '1. Poursuivre tel qu’aujourd’hui',
      '2. Changer de poste au sein de BBTM',
      '3. Aller en formation',
      '4. Changer de compagnie',
      '5. Changer de voie professionnelle'
    ])
    and (
      p_answers #>> '{evolution,choice}' <> '2. Changer de poste au sein de BBTM'
      or length(trim(coalesce(p_answers #>> '{evolution,desiredPosition}', ''))) > 0
    )
    and (
      p_answers #>> '{evolution,choice}' <> '3. Aller en formation'
      or length(trim(coalesce(p_answers #>> '{evolution,desiredTraining}', ''))) > 0
    )
    and (
      p_answers #>> '{evolution,choice}' not in ('4. Changer de compagnie', '5. Changer de voie professionnelle')
      or length(trim(coalesce(p_answers #>> '{evolution,reasons}', ''))) > 0
    )
    and length(trim(regexp_replace(coalesce(p_answers ->> 'objectives', ''), '<[^>]*>', ' ', 'g'))) > 0
    and jsonb_typeof(p_answers -> 'goals') = 'array'
    and jsonb_array_length(p_answers -> 'goals') > 0
    and not exists (
      select 1
      from jsonb_array_elements(p_answers -> 'goals') goal
      where length(btrim(coalesce(goal ->> 'objective', ''))) = 0
        or length(goal ->> 'objective') > 1000
        or jsonb_typeof(goal -> 'progress') <> 'number'
        or (goal ->> 'progress')::numeric not between 0 and 100
        or length(coalesce(goal ->> 'comment', '')) > 2000
    );
$$;

create or replace function public.annual_review_create_invitation(
  p_employee_person_id bigint,
  p_review_year integer,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_meeting_mode text,
  p_meeting_location text default null,
  p_video_url text default null,
  p_proposal_note text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  scope_record record;
  created_review public.annual_reviews%rowtype;
  derived_year integer := extract(year from (p_starts_at at time zone 'Europe/Paris'))::integer;
begin
  if derived_year < extract(year from current_date)::integer - 1
    or derived_year > extract(year from current_date)::integer + 2
    or p_starts_at is null or p_ends_at is null or p_starts_at <= now()
    or p_ends_at <= p_starts_at or p_ends_at > p_starts_at + interval '8 hours'
    or extract(second from p_starts_at) <> 0
    or extract(minute from p_starts_at)::integer % 15 <> 0
    or extract(epoch from (p_ends_at - p_starts_at))::bigint % 900 <> 0 then
    raise exception using errcode = '23514', message = 'ANNUAL_REVIEW_INVITATION_INVALID.';
  end if;

  select * into scope_record
  from public.annual_review_assert_manager(p_employee_person_id, p_starts_at);

  insert into public.annual_reviews (
    company_id, review_year, due_on, employee_person_id, manager_person_id,
    employee_name_snapshot, employee_function_snapshot, manager_name_snapshot,
    starts_at, ends_at, meeting_mode, meeting_location, video_url,
    proposed_by_person_id, proposal_note
  ) values (
    scope_record.company_id, derived_year, make_date(derived_year + 1, 12, 31),
    p_employee_person_id, scope_record.manager_person_id,
    (select trim(person.first_name || ' ' || upper(person.last_name)) from public.people person where person.id = p_employee_person_id),
    (select coalesce(person.function_label, '') from public.people person where person.id = p_employee_person_id),
    (select trim(person.first_name || ' ' || upper(person.last_name)) from public.people person where person.id = scope_record.manager_person_id),
    p_starts_at, p_ends_at, p_meeting_mode,
    case when p_meeting_mode = 'in_person' then nullif(trim(p_meeting_location), '') else null end,
    case when p_meeting_mode = 'video' then nullif(trim(p_video_url), '') else null end,
    scope_record.manager_person_id, nullif(trim(p_proposal_note), '')
  ) returning * into created_review;

  insert into public.annual_review_events (company_id, review_id, event_type, actor_person_id, payload)
  values (
    created_review.company_id, created_review.id, 'invitation_sent', scope_record.manager_person_id,
    jsonb_build_object('starts_at', created_review.starts_at, 'ends_at', created_review.ends_at,
      'meeting_mode', created_review.meeting_mode, 'review_year', created_review.review_year,
      'due_on', created_review.due_on, 'requested_year', p_review_year)
  );
  return created_review.id;
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'ANNUAL_REVIEW_ALREADY_EXISTS_FOR_YEAR.';
end;
$$;

create or replace function public.annual_review_sync_objectives()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'awaiting_signature' and old.status is distinct from new.status then
    delete from public.annual_review_objectives objective where objective.review_id = new.id;
    insert into public.annual_review_objectives (
      company_id, review_id, objective_key, objective, completion_percent, comment
    )
    select new.company_id, new.id, 'goal-' || goal.ordinality,
      btrim(goal.item ->> 'objective'),
      least(100, greatest(0, coalesce(round((goal.item ->> 'progress')::numeric)::integer, 0))),
      left(coalesce(goal.item ->> 'comment', ''), 2000)
    from public.annual_review_responses response
    cross join lateral jsonb_array_elements(response.answers -> 'goals') with ordinality as goal(item, ordinality)
    where response.review_id = new.id
      and response.respondent_role = 'manager'
      and length(btrim(coalesce(goal.item ->> 'objective', ''))) > 0;
  end if;
  return new;
end;
$$;

create trigger annual_reviews_sync_objectives
after update of status on public.annual_reviews
for each row execute function public.annual_review_sync_objectives();

insert into public.annual_review_objectives (
  company_id, review_id, objective_key, objective, completion_percent, comment
)
select review.company_id, review.id, 'goal-' || goal.ordinality,
  btrim(goal.item ->> 'objective'),
  least(100, greatest(0, coalesce(round((goal.item ->> 'progress')::numeric)::integer, 0))),
  left(coalesce(goal.item ->> 'comment', ''), 2000)
from public.annual_reviews review
join public.annual_review_responses response
  on response.review_id = review.id and response.respondent_role = 'manager'
cross join lateral jsonb_array_elements(coalesce(response.answers -> 'goals', '[]'::jsonb)) with ordinality as goal(item, ordinality)
where review.status in ('awaiting_signature', 'archived')
  and length(btrim(coalesce(goal.item ->> 'objective', ''))) > 0
on conflict (review_id, objective_key) do nothing;

create or replace function public.annual_review_update_objective_progress(
  p_objective_id bigint,
  p_completion_percent integer
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare target public.annual_review_objectives%rowtype;
declare target_review public.annual_reviews%rowtype;
begin
  select objective.* into target
  from public.annual_review_objectives objective
  where objective.id = p_objective_id
    and objective.company_id = public.current_planning_company_id()
  for update;
  select review.* into target_review
  from public.annual_reviews review
  where review.id = target.review_id;

  if target.id is null
    or p_completion_percent not between 0 and 100
    or not public.has_any_role(array['admin', 'direction', 'armement', 'capitaine'])
    or target_review.status not in ('awaiting_signature', 'archived')
    or current_date > target_review.due_on then
    raise exception using errcode = '42501', message = 'ANNUAL_REVIEW_OBJECTIVE_UPDATE_FORBIDDEN.';
  end if;

  update public.annual_review_objectives
  set completion_percent = p_completion_percent
  where id = target.id;
  insert into public.annual_review_events (company_id, review_id, event_type, actor_person_id, payload)
  values (target.company_id, target.review_id, 'objective_progress_updated', public.current_person_id(),
    jsonb_build_object('objective_id', target.id, 'completion_percent', p_completion_percent));
  return target.id;
end;
$$;

create or replace function public.annual_review_update_due_date(
  p_hr_document_id bigint,
  p_due_on date
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare target_review public.annual_reviews%rowtype;
begin
  select review.* into target_review
  from public.annual_reviews review
  join public.hr_documents document on document.id = review.hr_document_id
  where document.id = p_hr_document_id
    and document.category_key = 'annual_review'
    and review.company_id = public.current_planning_company_id()
  for update of review;

  if target_review.id is null or p_due_on is null
    or not public.has_any_role(array['admin', 'direction']) then
    raise exception using errcode = '42501', message = 'ANNUAL_REVIEW_DUE_DATE_FORBIDDEN.';
  end if;

  update public.annual_reviews set due_on = p_due_on where id = target_review.id;
  update public.hr_documents
  set expires_on = p_due_on,
    status = case
      when p_due_on < current_date then 'expired'
      when p_due_on <= current_date + 90 then 'renew_due'
      else 'valid'
    end
  where id = p_hr_document_id;
  insert into public.annual_review_events (company_id, review_id, event_type, actor_person_id, payload)
  values (target_review.company_id, target_review.id, 'due_date_updated', public.current_person_id(),
    jsonb_build_object('due_on', p_due_on));
  return p_hr_document_id;
end;
$$;

create or replace function public.annual_review_sign_and_archive(
  p_review_id bigint,
  p_storage_path text,
  p_file_name text,
  p_file_size_bytes bigint,
  p_sha256 text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare target_review public.annual_reviews%rowtype;
declare signature_data jsonb;
declare identity_data jsonb;
declare created_document_id bigint;
begin
  select * into target_review from public.annual_reviews review where review.id = p_review_id for update;
  if target_review.id is null or target_review.company_id <> public.current_planning_company_id()
    or target_review.employee_person_id <> public.current_person_id()
    or target_review.status <> 'awaiting_signature'
    or p_storage_path !~ ('^' || target_review.company_id || '/' || target_review.id || '/final/[^/]+\.pdf$')
    or p_file_name !~* '\.pdf$' or position(target_review.review_year::text in p_file_name) = 0
    or p_file_size_bytes not between 1 and 10485760 or p_sha256 !~ '^[0-9a-f]{64}$'
    or not exists (
      select 1 from storage.objects object
      where object.bucket_id = 'annual-review-reports' and object.name = p_storage_path
    ) then
    raise exception using errcode = '42501', message = 'ANNUAL_REVIEW_SIGNATURE_FORBIDDEN.';
  end if;

  signature_data := public.working_time_active_signature_snapshot(target_review.company_id, target_review.employee_person_id);
  if signature_data = '{}'::jsonb then
    raise exception using errcode = '23514', message = 'ANNUAL_REVIEW_COLLABORATOR_SIGNATURE_REQUIRED.';
  end if;
  select jsonb_build_object(
    'person_id', person.id, 'user_id', person.user_id,
    'first_name', person.first_name, 'last_name', person.last_name,
    'display_name', trim(person.first_name || ' ' || upper(person.last_name)),
    'signed_at', now()
  ) into identity_data from public.people person where person.id = target_review.employee_person_id;

  insert into public.hr_documents (
    company_id, person_id, category_key, title, status, issued_on, expires_on,
    source_label, notes, storage_bucket, storage_path, file_size_bytes, mime_type
  ) values (
    target_review.company_id, target_review.employee_person_id, 'annual_review', p_file_name,
    case when target_review.due_on <= current_date + 90 then 'renew_due' else 'valid' end,
    (target_review.starts_at at time zone 'Europe/Paris')::date, target_review.due_on, 'annual_review',
    'Rapport signe par le management et le collaborateur.',
    'annual-review-reports', p_storage_path, p_file_size_bytes, 'application/pdf'
  ) returning id into created_document_id;

  update public.annual_reviews
  set status = 'archived', collaborator_signed_at = now(), archived_at = now(),
    collaborator_identity_snapshot = identity_data, collaborator_signature_snapshot = signature_data,
    final_report_bucket = 'annual-review-reports', final_report_path = p_storage_path,
    final_report_file_name = p_file_name, final_report_size_bytes = p_file_size_bytes,
    final_report_sha256 = lower(p_sha256), hr_document_id = created_document_id
  where id = target_review.id;
  insert into public.annual_review_events (company_id, review_id, event_type, actor_person_id, payload)
  values (target_review.company_id, target_review.id, 'collaborator_signed_and_archived',
    public.current_person_id(), jsonb_build_object('hr_document_id', created_document_id, 'due_on', target_review.due_on));
  return created_document_id;
end;
$$;

drop policy if exists hr_documents_company_office_write on public.hr_documents;
create policy hr_documents_company_office_write on public.hr_documents for all to authenticated
using (
  company_id = public.current_planning_company_id()
  and (
    public.has_any_role(array['admin', 'direction'])
    or (public.has_any_role(array['armement']) and category_key <> 'annual_review')
  )
)
with check (
  company_id = public.current_planning_company_id()
  and (
    public.has_any_role(array['admin', 'direction'])
    or (public.has_any_role(array['armement']) and category_key <> 'annual_review')
  )
);

-- Confidential discrimination / human-rights event reports.
insert into public.action_type_catalog (
  company_id, type_key, label, family, hse_classification, tracks_exposure_rate, sort_order
)
select company.id, 'discrimination_human_rights',
  'Discrimination et atteintes au droits Humains', 'event', null, false, 340
from public.companies company
on conflict (company_id, type_key) do update set
  label = excluded.label, family = excluded.family, hse_classification = null,
  tracks_exposure_rate = false, sort_order = excluded.sort_order, active = true, updated_at = now();

create or replace function public.action_item_user_can_read(target_action_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.action_items action
    where action.id = target_action_id
      and action.company_id = public.current_planning_company_id()
      and case
        when action.action_type_key = 'discrimination_human_rights' then
          action.issuer_person_id = public.current_person_id()
          or action.approver_person_id = public.current_person_id()
        else
          public.has_company_role(action.company_id, array['admin', 'direction', 'armement'])
          or action.issuer_person_id = public.current_person_id()
          or (action.approver_person_id = public.current_person_id() and action.workflow_status = 'pending_approval')
          or public.action_item_user_is_assignee(action.id)
          or (
            coalesce(action.source_label, '') <> 'seapilot'
            and public.has_company_role(action.company_id, array['capitaine', 'marin'])
          )
      end
  );
$$;

create or replace function public.action_item_user_can_treat(target_action_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.action_items action
    where action.id = target_action_id
      and action.company_id = public.current_planning_company_id()
      and action.workflow_status = 'approved'
      and action.closed_on is null
      and case
        when action.action_type_key = 'discrimination_human_rights' then
          action.issuer_person_id = public.current_person_id()
          or action.approver_person_id = public.current_person_id()
        else
          public.has_company_role(action.company_id, array['admin', 'direction', 'armement'])
          or public.action_item_user_is_assignee(action.id)
          or (
            coalesce(action.source_label, '') <> 'seapilot'
            and public.has_company_role(action.company_id, array['capitaine'])
          )
      end
  );
$$;

create or replace function public.action_item_confidential_assignee_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare target public.action_items%rowtype;
begin
  select action.* into target from public.action_items action where action.id = new.action_item_id;
  if target.action_type_key = 'discrimination_human_rights'
    and (new.assignee_kind <> 'person' or new.person_id not in (target.issuer_person_id, target.approver_person_id)) then
    raise exception 'Seuls l''émetteur et Christophe MINASSIAN peuvent être affectés à ce rapport.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger action_item_confidential_assignee_guard
before insert or update on public.action_item_assignees
for each row execute function public.action_item_confidential_assignee_guard();

create or replace function public.action_item_attach_finding_photos(
  p_action_id bigint,
  p_photo_1_path text default null,
  p_photo_2_path text default null
)
returns public.action_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.action_items;
  photo_1 text := nullif(btrim(p_photo_1_path), '');
  photo_2 text := nullif(btrim(p_photo_2_path), '');
begin
  select * into target
  from public.action_items action
  where action.id = p_action_id
    and action.company_id = public.current_planning_company_id()
  for update;

  if target.id is null or not public.action_item_user_can_read(target.id)
    or not public.has_company_role(target.company_id, array['admin', 'direction', 'armement']) then
    raise exception 'Rapport introuvable ou inaccessible.' using errcode = '42501';
  end if;
  if photo_1 is not null and photo_1 not like target.company_id::text || '/' || target.id::text || '/photo-1-%' then
    raise exception 'Le chemin de la première photo est invalide.' using errcode = '22023';
  end if;
  if photo_2 is not null and photo_2 not like target.company_id::text || '/' || target.id::text || '/photo-2-%' then
    raise exception 'Le chemin de la seconde photo est invalide.' using errcode = '22023';
  end if;

  update public.action_items
  set photo_1_path = photo_1, photo_2_path = photo_2, updated_at = clock_timestamp()
  where id = target.id
  returning * into target;
  return target;
end;
$$;

create or replace function public.action_plan_evidence_user_can_upload(target_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.action_items action
    where action.id = public.action_plan_evidence_action_id(target_name)
      and action.company_id = public.current_planning_company_id()
      and split_part(target_name, '/', 1) = action.company_id::text
      and public.action_item_user_can_read(action.id)
      and (
        action.issuer_person_id = public.current_person_id()
        or public.action_item_user_can_treat(action.id)
        or action.approver_person_id = public.current_person_id()
      )
  );
$$;

-- Controlled selection of annual-review data exposed by the KPI report.
create table public.kpi_social_governance_settings (
  company_id bigint not null references public.companies(id) on delete cascade,
  report_year integer not null,
  selected_response_keys jsonb not null default '[]'::jsonb,
  general_comment_html text not null default '',
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (company_id, report_year),
  constraint kpi_social_governance_year_check check (report_year between 2020 and 2200),
  constraint kpi_social_governance_keys_check check (jsonb_typeof(selected_response_keys) = 'array'),
  constraint kpi_social_governance_comment_check check (length(general_comment_html) <= 20000)
);

alter table public.kpi_social_governance_settings enable row level security;
revoke all on public.kpi_social_governance_settings from anon, authenticated;

create or replace function public.annual_review_satisfaction_score(p_value text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_value
    when 'très satisfait' then 4
    when 'satisfait' then 3
    when 'peu satisfait' then 2
    when 'insatisfait' then 1
    else null
  end;
$$;

create or replace function public.kpi_social_governance_context(p_years integer[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  normalized_years integer[];
  can_configure boolean;
  radar_data jsonb;
  proposal_data jsonb;
  comment_data jsonb;
  review_count integer;
  respondent_count integer;
  discrimination_count integer;
begin
  if (select auth.uid()) is null or target_company_id is null then
    raise exception 'Accès au KPI refusé.' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct year_value order by year_value), array[extract(year from current_date)::integer])
  into normalized_years
  from unnest(coalesce(p_years, array[extract(year from current_date)::integer])) year_value
  where year_value between 2020 and 2200;
  if cardinality(normalized_years) > 10 then
    raise exception 'Dix années maximum peuvent être analysées.' using errcode = '22023';
  end if;
  can_configure := public.has_any_role(array['admin', 'direction']);

  with axes(axis_key, label, sort_order) as (
    values ('presence', 'Satisfaction présence entreprise', 1), ('missions', 'Mission', 2),
      ('crew', 'Mon équipage', 3), ('position', 'Mon poste', 4), ('recognition', 'Reconnaissance', 5)
  ), shared_responses as (
    select response.answers
    from public.annual_review_responses response
    join public.annual_reviews review on review.id = response.review_id
    where response.company_id = target_company_id
      and review.review_year = any(normalized_years)
      and response.respondent_role = 'collaborator'
      and response.share_with_manager is true
      and response.submitted_at is not null
  ), scored as (
    select axis.axis_key, axis.label, axis.sort_order,
      public.annual_review_satisfaction_score(case axis.axis_key
        when 'presence' then response.answers #>> '{life,overall}'
        else response.answers #>> array['life', 'conditions', axis.axis_key]
      end) as score
    from axes axis cross join shared_responses response
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', axis.axis_key, 'label', axis.label,
    'value', round(coalesce(stats.average_score, 0)::numeric, 2),
    'responseCount', coalesce(stats.response_count, 0)
  ) order by axis.sort_order), '[]'::jsonb)
  into radar_data
  from axes axis
  left join (
    select axis_key, avg(score) as average_score, count(score) as response_count
    from scored group by axis_key
  ) stats on stats.axis_key = axis.axis_key;

  with candidates as (
    select response.id::text || ':' || proposal.theme as response_key,
      review.review_year, proposal.theme, btrim(proposal.answer) as answer,
      coalesce(settings.selected_response_keys ? (response.id::text || ':' || proposal.theme), false) as selected
    from public.annual_review_responses response
    join public.annual_reviews review on review.id = response.review_id
    cross join lateral jsonb_each_text(coalesce(response.answers -> 'esg', '{}'::jsonb)) proposal(theme, answer)
    left join public.kpi_social_governance_settings settings
      on settings.company_id = review.company_id and settings.report_year = review.review_year
    where response.company_id = target_company_id
      and review.review_year = any(normalized_years)
      and review.status in ('awaiting_signature', 'archived')
      and response.respondent_role = 'manager'
      and proposal.theme in ('environment', 'social', 'governance', 'other')
      and length(btrim(proposal.answer)) > 0
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', response_key, 'year', review_year, 'theme', theme,
    'text', answer, 'selected', selected
  ) order by review_year desc, theme, response_key), '[]'::jsonb)
  into proposal_data
  from candidates
  where can_configure or selected;

  select coalesce(jsonb_agg(jsonb_build_object(
    'year', settings.report_year, 'html', settings.general_comment_html
  ) order by settings.report_year), '[]'::jsonb)
  into comment_data
  from public.kpi_social_governance_settings settings
  where settings.company_id = target_company_id
    and settings.report_year = any(normalized_years)
    and length(btrim(settings.general_comment_html)) > 0;

  select count(*) into review_count
  from public.annual_reviews review
  where review.company_id = target_company_id and review.review_year = any(normalized_years)
    and review.status in ('collaborator_submitted', 'awaiting_signature', 'archived');
  select count(distinct response.respondent_person_id) into respondent_count
  from public.annual_review_responses response
  join public.annual_reviews review on review.id = response.review_id
  where response.company_id = target_company_id and review.review_year = any(normalized_years)
    and response.respondent_role = 'collaborator' and response.share_with_manager is true
    and response.submitted_at is not null;
  select count(*) into discrimination_count
  from public.action_items action
  where action.company_id = target_company_id
    and action.action_type_key = 'discrimination_human_rights'
    and extract(year from coalesce(action.occurred_at, action.opened_on::timestamptz) at time zone 'Europe/Paris')::integer = any(normalized_years);

  return jsonb_build_object(
    'canConfigure', can_configure, 'years', to_jsonb(normalized_years),
    'radar', radar_data, 'proposals', proposal_data, 'comments', comment_data,
    'reviewCount', coalesce(review_count, 0), 'respondentCount', coalesce(respondent_count, 0),
    'discriminationCount', coalesce(discrimination_count, 0)
  );
end;
$$;

create or replace function public.kpi_social_governance_save_settings(
  p_report_year integer,
  p_selected_response_keys text[],
  p_general_comment_html text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare target_company_id bigint := public.current_planning_company_id();
declare valid_keys jsonb;
begin
  if p_report_year not between 2020 and 2200
    or not public.has_any_role(array['admin', 'direction'])
    or length(coalesce(p_general_comment_html, '')) > 20000 then
    raise exception 'Configuration du KPI refusée.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(key_value order by key_value), '[]'::jsonb)
  into valid_keys
  from (
    select distinct response.id::text || ':' || proposal.theme as key_value
    from public.annual_review_responses response
    join public.annual_reviews review on review.id = response.review_id
    cross join lateral jsonb_each_text(coalesce(response.answers -> 'esg', '{}'::jsonb)) proposal(theme, answer)
    where response.company_id = target_company_id
      and review.review_year = p_report_year
      and review.status in ('awaiting_signature', 'archived')
      and response.respondent_role = 'manager'
      and proposal.theme in ('environment', 'social', 'governance', 'other')
      and response.id::text || ':' || proposal.theme = any(coalesce(p_selected_response_keys, '{}'::text[]))
      and length(btrim(proposal.answer)) > 0
  ) selected;

  insert into public.kpi_social_governance_settings (
    company_id, report_year, selected_response_keys, general_comment_html, updated_by, updated_at
  ) values (
    target_company_id, p_report_year, valid_keys, coalesce(p_general_comment_html, ''), auth.uid(), now()
  )
  on conflict (company_id, report_year) do update
  set selected_response_keys = excluded.selected_response_keys,
    general_comment_html = excluded.general_comment_html,
    updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  return p_report_year;
end;
$$;

revoke all on function public.annual_review_sync_objectives() from public, anon, authenticated;
revoke all on function public.annual_review_update_objective_progress(bigint, integer) from public, anon, authenticated;
revoke all on function public.annual_review_update_due_date(bigint, date) from public, anon, authenticated;
revoke all on function public.action_item_confidential_assignee_guard() from public, anon, authenticated;
revoke all on function public.annual_review_satisfaction_score(text) from public, anon, authenticated;
revoke all on function public.kpi_social_governance_context(integer[]) from public, anon, authenticated;
revoke all on function public.kpi_social_governance_save_settings(integer, text[], text) from public, anon, authenticated;

grant execute on function public.annual_review_update_objective_progress(bigint, integer) to authenticated;
grant execute on function public.annual_review_update_due_date(bigint, date) to authenticated;
grant execute on function public.kpi_social_governance_context(integer[]) to authenticated;
grant execute on function public.kpi_social_governance_save_settings(integer, text[], text) to authenticated;

comment on column public.annual_reviews.due_on is
  'Default annual-review renewal due date: 31 December of review year N+1; editable only through the admin/direction RPC.';
comment on table public.annual_review_objectives is
  'Manager-defined N+1 objectives. The percentage remains updateable until the review due date by non-Marin management profiles.';
comment on table public.kpi_social_governance_settings is
  'Direction-controlled ESG response selection and rich general comment for the Social and Governance KPI PDF.';
comment on function public.kpi_social_governance_context(integer[]) is
  'Returns anonymous well-being aggregates, confidential-event counts and role-filtered management ESG proposals.';
