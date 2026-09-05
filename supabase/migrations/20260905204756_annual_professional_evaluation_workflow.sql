-- Entretien Professionnel et d'Evaluation
-- Invitation, questionnaire a deux voix, signatures figees et archivage RH.

create table public.annual_reviews (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade
    default public.current_planning_company_id(),
  review_year integer not null,
  employee_person_id bigint not null references public.people(id) on delete restrict,
  manager_person_id bigint not null references public.people(id) on delete restrict,
  employee_name_snapshot text not null,
  employee_function_snapshot text not null default '',
  manager_name_snapshot text not null,
  status text not null default 'invitation_pending',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  meeting_mode text not null,
  meeting_location text,
  video_url text,
  proposed_by_person_id bigint not null references public.people(id) on delete restrict,
  proposal_note text,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  collaborator_submitted_at timestamptz,
  manager_validated_at timestamptz,
  collaborator_signed_at timestamptz,
  archived_at timestamptz,
  manager_identity_snapshot jsonb not null default '{}'::jsonb,
  manager_signature_snapshot jsonb not null default '{}'::jsonb,
  collaborator_identity_snapshot jsonb not null default '{}'::jsonb,
  collaborator_signature_snapshot jsonb not null default '{}'::jsonb,
  manager_report_bucket text,
  manager_report_path text,
  manager_report_file_name text,
  manager_report_size_bytes bigint,
  manager_report_sha256 text,
  final_report_bucket text,
  final_report_path text,
  final_report_file_name text,
  final_report_size_bytes bigint,
  final_report_sha256 text,
  hr_document_id bigint references public.hr_documents(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint annual_reviews_year_check check (review_year between 2020 and 2200),
  constraint annual_reviews_people_check check (employee_person_id <> manager_person_id),
  constraint annual_reviews_status_check check (status in (
    'invitation_pending', 'counter_proposed', 'scheduled',
    'collaborator_submitted', 'awaiting_signature', 'archived'
  )),
  constraint annual_reviews_dates_check check (ends_at > starts_at),
  constraint annual_reviews_duration_check check (ends_at <= starts_at + interval '8 hours'),
  constraint annual_reviews_meeting_mode_check check (meeting_mode in ('in_person', 'video')),
  constraint annual_reviews_meeting_details_check check (
    (meeting_mode = 'in_person' and length(trim(coalesce(meeting_location, ''))) between 2 and 500 and video_url is null)
    or (meeting_mode = 'video' and video_url ~ '^https://[^[:space:]]+$' and meeting_location is null)
  ),
  constraint annual_reviews_proposal_note_check check (
    proposal_note is null or length(trim(proposal_note)) between 2 and 1000
  ),
  constraint annual_reviews_manager_report_check check (
    (manager_report_path is null and manager_report_bucket is null and manager_report_file_name is null
      and manager_report_size_bytes is null and manager_report_sha256 is null)
    or (manager_report_bucket = 'annual-review-reports'
      and length(trim(manager_report_path)) between 5 and 500
      and manager_report_file_name ~* '\.pdf$'
      and manager_report_size_bytes between 1 and 10485760
      and manager_report_sha256 ~ '^[0-9a-f]{64}$')
  ),
  constraint annual_reviews_final_report_check check (
    (final_report_path is null and final_report_bucket is null and final_report_file_name is null
      and final_report_size_bytes is null and final_report_sha256 is null)
    or (final_report_bucket = 'annual-review-reports'
      and length(trim(final_report_path)) between 5 and 500
      and final_report_file_name ~* '\.pdf$'
      and final_report_size_bytes between 1 and 10485760
      and final_report_sha256 ~ '^[0-9a-f]{64}$')
  ),
  constraint annual_reviews_unique_employee_year unique (company_id, employee_person_id, review_year)
);

create table public.annual_review_responses (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  review_id bigint not null references public.annual_reviews(id) on delete cascade,
  respondent_person_id bigint not null references public.people(id) on delete restrict,
  respondent_role text not null,
  answers jsonb not null default '{}'::jsonb,
  share_with_manager boolean,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint annual_review_responses_role_check check (respondent_role in ('manager', 'collaborator')),
  constraint annual_review_responses_answers_check check (jsonb_typeof(answers) = 'object'),
  constraint annual_review_responses_unique_role unique (review_id, respondent_role)
);

create table public.annual_review_events (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  review_id bigint not null references public.annual_reviews(id) on delete cascade,
  event_type text not null,
  actor_person_id bigint references public.people(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint annual_review_events_payload_check check (jsonb_typeof(payload) = 'object')
);

create index annual_reviews_company_status_idx on public.annual_reviews (company_id, status, starts_at);
create index annual_reviews_employee_idx on public.annual_reviews (employee_person_id, review_year desc);
create index annual_reviews_manager_idx on public.annual_reviews (manager_person_id, review_year desc);
create index annual_review_events_review_idx on public.annual_review_events (review_id, occurred_at);

create or replace function public.set_annual_review_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger annual_reviews_updated_at
before update on public.annual_reviews
for each row execute function public.set_annual_review_updated_at();

create trigger annual_review_responses_updated_at
before update on public.annual_review_responses
for each row execute function public.set_annual_review_updated_at();

create or replace function public.annual_review_can_read(p_review_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.annual_reviews review
    where review.id = p_review_id
      and review.company_id = public.current_planning_company_id()
      and (
        review.employee_person_id = public.current_person_id()
        or review.manager_person_id = public.current_person_id()
        or public.has_any_role(array['admin', 'direction', 'armement'])
      )
  );
$$;

create or replace function public.annual_review_can_upload(
  p_bucket text,
  p_path text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  path_company_id bigint;
  path_review_id bigint;
  path_stage text;
  target_review public.annual_reviews%rowtype;
begin
  if p_bucket <> 'annual-review-reports'
    or p_path !~ '^[0-9]+/[0-9]+/(manager|final)/[^/]+\.pdf$' then
    return false;
  end if;

  path_company_id := split_part(p_path, '/', 1)::bigint;
  path_review_id := split_part(p_path, '/', 2)::bigint;
  path_stage := split_part(p_path, '/', 3);

  select * into target_review from public.annual_reviews review where review.id = path_review_id;
  if target_review.id is null or target_review.company_id <> path_company_id then
    return false;
  end if;

  if path_stage = 'manager' then
    return target_review.manager_person_id = public.current_person_id()
      and target_review.status = 'collaborator_submitted';
  end if;

  return target_review.employee_person_id = public.current_person_id()
    and target_review.status = 'awaiting_signature';
exception when others then
  return false;
end;
$$;

alter table public.annual_reviews enable row level security;
alter table public.annual_review_responses enable row level security;
alter table public.annual_review_events enable row level security;

create policy annual_reviews_read on public.annual_reviews
for select to authenticated
using (public.annual_review_can_read(id));

create policy annual_review_responses_read on public.annual_review_responses
for select to authenticated
using (
  exists (
    select 1
    from public.annual_reviews review
    where review.id = annual_review_responses.review_id
      and public.annual_review_can_read(review.id)
      and (
        annual_review_responses.respondent_person_id = public.current_person_id()
        or (
          annual_review_responses.respondent_role = 'manager'
          and (
            public.has_any_role(array['admin', 'direction', 'armement'])
            or (
              review.employee_person_id = public.current_person_id()
              and review.status in ('awaiting_signature', 'archived')
            )
          )
        )
        or (
          annual_review_responses.share_with_manager is true
          and review.manager_person_id = public.current_person_id()
        )
      )
  )
);

create policy annual_review_events_read on public.annual_review_events
for select to authenticated
using (public.annual_review_can_read(review_id));

revoke all on table public.annual_reviews from anon, authenticated;
revoke all on table public.annual_review_responses from anon, authenticated;
revoke all on table public.annual_review_events from anon, authenticated;
grant select on table public.annual_reviews to authenticated;
grant select on table public.annual_review_responses to authenticated;
grant select on table public.annual_review_events to authenticated;

create or replace function public.annual_review_assert_manager(
  p_employee_person_id bigint,
  p_starts_at timestamptz
)
returns table(company_id bigint, manager_person_id bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_person public.people%rowtype;
  target_person public.people%rowtype;
begin
  select * into actor_person
  from public.people person
  where person.id = public.current_person_id();
  select * into target_person
  from public.people person
  where person.id = p_employee_person_id;

  if actor_person.id is null or target_person.id is null
    or actor_person.company_id <> target_person.company_id
    or actor_person.company_id <> public.current_planning_company_id()
    or not target_person.active or target_person.user_id is null
    or actor_person.id = target_person.id then
    raise exception using errcode = '42501', message = 'ANNUAL_REVIEW_MANAGER_SCOPE_DENIED.';
  end if;

  if not public.has_any_role(array['admin', 'direction', 'armement', 'capitaine']) then
    raise exception using errcode = '42501', message = 'ANNUAL_REVIEW_MANAGER_ROLE_REQUIRED.';
  end if;

  if public.has_role('capitaine')
    and not public.has_any_role(array['admin', 'direction', 'armement'])
    and not public.is_captain_for_person(target_person.id, p_starts_at::date) then
    raise exception using errcode = '42501', message = 'ANNUAL_REVIEW_CAPTAIN_SCOPE_DENIED.';
  end if;

  return query select actor_person.company_id, actor_person.id;
end;
$$;

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
    and length(trim(regexp_replace(coalesce(p_answers ->> 'objectives', ''), '<[^>]*>', ' ', 'g'))) > 0;
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
begin
  if p_review_year is null or p_review_year < extract(year from current_date)::integer - 1
    or p_review_year > extract(year from current_date)::integer + 2
    or p_starts_at is null or p_ends_at is null or p_starts_at <= now()
    or p_ends_at <= p_starts_at or p_ends_at > p_starts_at + interval '8 hours' then
    raise exception using errcode = '23514', message = 'ANNUAL_REVIEW_INVITATION_INVALID.';
  end if;

  select * into scope_record
  from public.annual_review_assert_manager(p_employee_person_id, p_starts_at);

  insert into public.annual_reviews (
    company_id, review_year, employee_person_id, manager_person_id,
    employee_name_snapshot, employee_function_snapshot, manager_name_snapshot,
    starts_at, ends_at, meeting_mode, meeting_location, video_url,
    proposed_by_person_id, proposal_note
  ) values (
    scope_record.company_id, p_review_year, p_employee_person_id, scope_record.manager_person_id,
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
      'meeting_mode', created_review.meeting_mode)
  );
  return created_review.id;
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'ANNUAL_REVIEW_ALREADY_EXISTS_FOR_YEAR.';
end;
$$;

create or replace function public.annual_review_accept_invitation(p_review_id bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare target_review public.annual_reviews%rowtype;
begin
  select * into target_review from public.annual_reviews review where review.id = p_review_id for update;
  if target_review.id is null or target_review.company_id <> public.current_planning_company_id()
    or target_review.employee_person_id <> public.current_person_id()
    or target_review.status <> 'invitation_pending' then
    raise exception using errcode = '42501', message = 'ANNUAL_REVIEW_ACCEPT_FORBIDDEN.';
  end if;
  update public.annual_reviews set status = 'scheduled', accepted_at = now() where id = target_review.id;
  insert into public.annual_review_events (company_id, review_id, event_type, actor_person_id)
  values (target_review.company_id, target_review.id, 'invitation_accepted', public.current_person_id());
  return target_review.id;
end;
$$;

create or replace function public.annual_review_counter_propose(
  p_review_id bigint,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_proposal_note text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare target_review public.annual_reviews%rowtype;
begin
  select * into target_review from public.annual_reviews review where review.id = p_review_id for update;
  if target_review.id is null or target_review.company_id <> public.current_planning_company_id()
    or target_review.employee_person_id <> public.current_person_id()
    or target_review.status <> 'invitation_pending'
    or p_starts_at is null or p_ends_at is null or p_starts_at <= now()
    or p_ends_at <= p_starts_at or p_ends_at > p_starts_at + interval '8 hours' then
    raise exception using errcode = '42501', message = 'ANNUAL_REVIEW_COUNTER_PROPOSAL_FORBIDDEN.';
  end if;
  update public.annual_reviews
  set status = 'counter_proposed', starts_at = p_starts_at, ends_at = p_ends_at,
    proposed_by_person_id = public.current_person_id(), proposal_note = nullif(trim(p_proposal_note), ''),
    accepted_at = null
  where id = target_review.id;
  insert into public.annual_review_events (company_id, review_id, event_type, actor_person_id, payload)
  values (target_review.company_id, target_review.id, 'counter_proposed', public.current_person_id(),
    jsonb_build_object('starts_at', p_starts_at, 'ends_at', p_ends_at));
  return target_review.id;
end;
$$;

create or replace function public.annual_review_manager_schedule(
  p_review_id bigint,
  p_accept boolean,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_proposal_note text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare target_review public.annual_reviews%rowtype;
declare next_starts_at timestamptz;
declare next_ends_at timestamptz;
begin
  select * into target_review from public.annual_reviews review where review.id = p_review_id for update;
  if target_review.id is null or target_review.company_id <> public.current_planning_company_id()
    or target_review.manager_person_id <> public.current_person_id()
    or target_review.status <> 'counter_proposed' then
    raise exception using errcode = '42501', message = 'ANNUAL_REVIEW_MANAGER_SCHEDULE_FORBIDDEN.';
  end if;
  if p_accept then
    update public.annual_reviews set status = 'scheduled', accepted_at = now() where id = target_review.id;
    insert into public.annual_review_events (company_id, review_id, event_type, actor_person_id)
    values (target_review.company_id, target_review.id, 'counter_proposal_accepted', public.current_person_id());
  else
    next_starts_at := p_starts_at;
    next_ends_at := p_ends_at;
    if next_starts_at is null or next_ends_at is null or next_starts_at <= now()
      or next_ends_at <= next_starts_at or next_ends_at > next_starts_at + interval '8 hours' then
      raise exception using errcode = '23514', message = 'ANNUAL_REVIEW_INVITATION_INVALID.';
    end if;
    update public.annual_reviews
    set status = 'invitation_pending', starts_at = next_starts_at, ends_at = next_ends_at,
      proposed_by_person_id = public.current_person_id(), proposal_note = nullif(trim(p_proposal_note), ''),
      accepted_at = null
    where id = target_review.id;
    insert into public.annual_review_events (company_id, review_id, event_type, actor_person_id, payload)
    values (target_review.company_id, target_review.id, 'manager_reproposed', public.current_person_id(),
      jsonb_build_object('starts_at', next_starts_at, 'ends_at', next_ends_at));
  end if;
  return target_review.id;
end;
$$;

create or replace function public.annual_review_save_response(
  p_review_id bigint,
  p_answers jsonb,
  p_submit boolean default false,
  p_share_with_manager boolean default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare target_review public.annual_reviews%rowtype;
declare actor_person_id bigint := public.current_person_id();
declare actor_role text;
declare response_id bigint;
begin
  select * into target_review from public.annual_reviews review where review.id = p_review_id for update;
  if target_review.id is null or target_review.company_id <> public.current_planning_company_id()
    or p_answers is null or jsonb_typeof(p_answers) <> 'object'
    or target_review.status not in ('scheduled', 'collaborator_submitted') then
    raise exception using errcode = '42501', message = 'ANNUAL_REVIEW_RESPONSE_FORBIDDEN.';
  end if;
  if actor_person_id = target_review.manager_person_id then actor_role := 'manager';
  elsif actor_person_id = target_review.employee_person_id then actor_role := 'collaborator';
  else raise exception using errcode = '42501', message = 'ANNUAL_REVIEW_RESPONSE_FORBIDDEN.';
  end if;
  if actor_role = 'collaborator' and target_review.status <> 'scheduled' then
    raise exception using errcode = '23514', message = 'ANNUAL_REVIEW_RESPONSE_LOCKED.';
  end if;
  if actor_role = 'manager' and p_submit then
    raise exception using errcode = '23514', message = 'ANNUAL_REVIEW_MANAGER_VALIDATES_WITH_REPORT.';
  end if;
  if p_submit and not public.annual_review_answers_complete(p_answers) then
    raise exception using errcode = '23514', message = 'ANNUAL_REVIEW_ANSWERS_INCOMPLETE.';
  end if;
  if actor_role = 'collaborator' and p_submit and p_share_with_manager is null then
    raise exception using errcode = '23514', message = 'ANNUAL_REVIEW_SHARING_DECISION_REQUIRED.';
  end if;

  insert into public.annual_review_responses (
    company_id, review_id, respondent_person_id, respondent_role, answers,
    share_with_manager, submitted_at
  ) values (
    target_review.company_id, target_review.id, actor_person_id, actor_role, p_answers,
    case when actor_role = 'collaborator' then p_share_with_manager else null end,
    case when actor_role = 'collaborator' and p_submit then now() else null end
  )
  on conflict (review_id, respondent_role) do update
  set answers = excluded.answers,
    share_with_manager = excluded.share_with_manager,
    submitted_at = case
      when annual_review_responses.submitted_at is not null then annual_review_responses.submitted_at
      else excluded.submitted_at
    end
  returning id into response_id;

  if actor_role = 'collaborator' and p_submit then
    update public.annual_reviews
    set status = 'collaborator_submitted', collaborator_submitted_at = now()
    where id = target_review.id;
    insert into public.annual_review_events (company_id, review_id, event_type, actor_person_id, payload)
    values (target_review.company_id, target_review.id, 'collaborator_submitted', actor_person_id,
      jsonb_build_object('share_with_manager', p_share_with_manager));
  end if;
  return response_id;
end;
$$;

create or replace function public.annual_review_validate_manager_report(
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
begin
  select * into target_review from public.annual_reviews review where review.id = p_review_id for update;
  if target_review.id is null or target_review.company_id <> public.current_planning_company_id()
    or target_review.manager_person_id <> public.current_person_id()
    or target_review.status <> 'collaborator_submitted'
    or p_storage_path !~ ('^' || target_review.company_id || '/' || target_review.id || '/manager/[^/]+\.pdf$')
    or p_file_name !~* '\.pdf$' or p_file_size_bytes not between 1 and 10485760
    or p_sha256 !~ '^[0-9a-f]{64}$'
    or not exists (
      select 1 from storage.objects object
      where object.bucket_id = 'annual-review-reports' and object.name = p_storage_path
    )
    or not exists (
      select 1 from public.annual_review_responses response
      where response.review_id = target_review.id and response.respondent_role = 'manager'
        and public.annual_review_answers_complete(response.answers)
    ) then
    raise exception using errcode = '42501', message = 'ANNUAL_REVIEW_MANAGER_VALIDATION_FORBIDDEN.';
  end if;

  signature_data := public.working_time_active_signature_snapshot(target_review.company_id, target_review.manager_person_id);
  if signature_data = '{}'::jsonb then
    raise exception using errcode = '23514', message = 'ANNUAL_REVIEW_MANAGER_SIGNATURE_REQUIRED.';
  end if;
  select jsonb_build_object(
    'person_id', person.id, 'user_id', person.user_id,
    'first_name', person.first_name, 'last_name', person.last_name,
    'display_name', trim(person.first_name || ' ' || upper(person.last_name)),
    'validated_at', now()
  ) into identity_data from public.people person where person.id = target_review.manager_person_id;

  update public.annual_reviews
  set status = 'awaiting_signature', manager_validated_at = now(),
    manager_identity_snapshot = identity_data, manager_signature_snapshot = signature_data,
    manager_report_bucket = 'annual-review-reports', manager_report_path = p_storage_path,
    manager_report_file_name = p_file_name, manager_report_size_bytes = p_file_size_bytes,
    manager_report_sha256 = lower(p_sha256)
  where id = target_review.id;
  insert into public.annual_review_events (company_id, review_id, event_type, actor_person_id)
  values (target_review.company_id, target_review.id, 'manager_validated', public.current_person_id());
  return target_review.id;
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
    company_id, person_id, category_key, title, status, issued_on,
    source_label, notes, storage_bucket, storage_path, file_size_bytes, mime_type
  ) values (
    target_review.company_id, target_review.employee_person_id, 'annual_review', p_file_name,
    'valid', current_date, 'annual_review',
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
  insert into public.annual_review_events (company_id, review_id, event_type, actor_person_id,
    payload)
  values (target_review.company_id, target_review.id, 'collaborator_signed_and_archived',
    public.current_person_id(), jsonb_build_object('hr_document_id', created_document_id));
  return created_document_id;
end;
$$;

revoke all on function public.set_annual_review_updated_at() from public, anon, authenticated;
revoke all on function public.annual_review_can_read(bigint) from public, anon, authenticated;
revoke all on function public.annual_review_can_upload(text, text) from public, anon, authenticated;
revoke all on function public.annual_review_assert_manager(bigint, timestamptz) from public, anon, authenticated;
revoke all on function public.annual_review_answers_complete(jsonb) from public, anon, authenticated;
revoke all on function public.annual_review_create_invitation(bigint, integer, timestamptz, timestamptz, text, text, text, text) from public, anon, authenticated;
revoke all on function public.annual_review_accept_invitation(bigint) from public, anon, authenticated;
revoke all on function public.annual_review_counter_propose(bigint, timestamptz, timestamptz, text) from public, anon, authenticated;
revoke all on function public.annual_review_manager_schedule(bigint, boolean, timestamptz, timestamptz, text) from public, anon, authenticated;
revoke all on function public.annual_review_save_response(bigint, jsonb, boolean, boolean) from public, anon, authenticated;
revoke all on function public.annual_review_validate_manager_report(bigint, text, text, bigint, text) from public, anon, authenticated;
revoke all on function public.annual_review_sign_and_archive(bigint, text, text, bigint, text) from public, anon, authenticated;

grant execute on function public.annual_review_can_read(bigint) to authenticated;
grant execute on function public.annual_review_can_upload(text, text) to authenticated;
grant execute on function public.annual_review_create_invitation(bigint, integer, timestamptz, timestamptz, text, text, text, text) to authenticated;
grant execute on function public.annual_review_accept_invitation(bigint) to authenticated;
grant execute on function public.annual_review_counter_propose(bigint, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.annual_review_manager_schedule(bigint, boolean, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.annual_review_save_response(bigint, jsonb, boolean, boolean) to authenticated;
grant execute on function public.annual_review_validate_manager_report(bigint, text, text, bigint, text) to authenticated;
grant execute on function public.annual_review_sign_and_archive(bigint, text, text, bigint, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('annual-review-reports', 'annual-review-reports', false, 10485760, array['application/pdf'])
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy annual_review_reports_read on storage.objects
for select to authenticated
using (
  bucket_id = 'annual-review-reports'
  and exists (
    select 1 from public.annual_reviews review
    where public.annual_review_can_read(review.id)
      and (
        review.manager_report_path = storage.objects.name
        or review.final_report_path = storage.objects.name
      )
  )
);

create policy annual_review_reports_insert on storage.objects
for insert to authenticated
with check (public.annual_review_can_upload(bucket_id, name));

create policy annual_review_reports_delete on storage.objects
for delete to authenticated
using (public.annual_review_can_upload(bucket_id, name));

create policy annual_review_signature_snapshot_read on storage.objects
for select to authenticated
using (
  bucket_id = 'working-time-signatures'
  and exists (
    select 1 from public.annual_reviews review
    where public.annual_review_can_read(review.id)
      and (
        (review.manager_signature_snapshot->>'storage_bucket' = storage.objects.bucket_id
          and review.manager_signature_snapshot->>'storage_path' = storage.objects.name)
        or (review.collaborator_signature_snapshot->>'storage_bucket' = storage.objects.bucket_id
          and review.collaborator_signature_snapshot->>'storage_path' = storage.objects.name)
      )
  )
);

-- Les evenements d'entretien sont lus directement dans le Planning. Ils ne sont
-- pas stockes dans planning_days afin de conserver les horaires et la confidentialite.

with configured_permissions as (
  select role.key as role_key, 'annualReviews'::text as module_key,
    role.key = any(array['admin', 'direction', 'armement', 'capitaine']::text[]) as is_visible
  from public.roles role
)
insert into public.role_module_permissions (role_key, module_key, is_visible)
select role_key, module_key, is_visible from configured_permissions
on conflict (role_key, module_key) do update
set is_visible = excluded.is_visible, updated_at = now();

comment on table public.annual_reviews is
  'Workflow confidentiel Entretien Professionnel et d''Evaluation, du rendez-vous a l''archive RH.';
comment on column public.annual_review_responses.share_with_manager is
  'Consentement explicite du collaborateur. Le rapport final reste limite aux reponses du manager.';
