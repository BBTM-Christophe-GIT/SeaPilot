-- Planning P2.1: explainable maritime planning assistant, pilot access and human decisions.
-- Suggestions are computed client-side from existing P0/P1 Planning data. This migration
-- never creates an assignment, publication or derogation and does not change existing rows.
--
-- Data-preserving rollback strategy:
--   1. Export planning_assistant_pilots and planning_assistant_reviews.
--   2. Disable VITE_PLANNING_ASSISTANT_ENABLED before rolling the client back.
--   3. Drop P2.1 RPCs/policies/tables, then restore the P1.3 permission and
--      planning_change_log constraints from migration 202607140002.

alter table public.planning_action_permissions
  drop constraint if exists planning_action_permissions_action_check;
alter table public.planning_action_permissions
  add constraint planning_action_permissions_action_check check (
    action_key in (
      'read', 'edit_event', 'submit', 'validate', 'publish', 'reopen', 'archive',
      'view_history', 'manage_handover', 'manage_derogation', 'manage_vessels',
      'manage_permissions', 'export', 'manage_rotation', 'manage_template', 'manage_manning',
      'request_absence', 'review_absence', 'manage_conflict', 'manage_work_rest',
      'read_notifications', 'manage_dependency', 'use_assistant', 'manage_assistant_pilots'
    )
  );

insert into public.planning_action_permissions (role_key, action_key, scope_mode)
values
  ('admin', 'use_assistant', 'company'),
  ('admin', 'manage_assistant_pilots', 'company')
on conflict (role_key, action_key) do update set scope_mode = excluded.scope_mode;

alter table public.planning_change_log drop constraint if exists planning_change_log_entity_kind_check;
alter table public.planning_change_log add constraint planning_change_log_entity_kind_check
  check (entity_kind in (
    'assignment', 'day', 'period', 'project', 'vessel', 'publication', 'handover',
    'handover_position', 'derogation', 'rotation_series', 'rotation_occurrence',
    'template', 'manning_matrix', 'absence', 'conflict_case', 'work_rest_policy', 'dependency',
    'assistant_suggestion', 'assistant_pilot'
  ));

create table if not exists public.planning_assistant_pilots (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade default public.current_planning_company_id(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  enabled boolean not null default true,
  valid_until date,
  reason text not null,
  granted_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  updated_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (company_id, user_id),
  constraint planning_assistant_pilots_reason_check check (length(trim(reason)) >= 10),
  constraint planning_assistant_pilots_state_check check (
    (enabled and revoked_at is null) or (not enabled and revoked_at is not null)
  )
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'planning_assistant_pilots_membership_fkey'
      and conrelid = 'public.planning_assistant_pilots'::regclass
  ) then
    alter table public.planning_assistant_pilots
      add constraint planning_assistant_pilots_membership_fkey
      foreign key (company_id, user_id)
      references public.company_memberships(company_id, user_id) on delete cascade;
  end if;
end $$;

create table if not exists public.planning_assistant_reviews (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade default public.current_planning_company_id(),
  suggestion_key text not null,
  suggestion_type text not null,
  suggestion_snapshot jsonb not null,
  decision text not null,
  comment text not null,
  vessel_id bigint references public.vessels(id) on delete set null,
  person_id bigint references public.people(id) on delete set null,
  generated_for_start date not null,
  generated_for_end date not null,
  reviewed_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  reviewed_by_name text not null,
  reviewed_at timestamptz not null default now(),
  constraint planning_assistant_reviews_key_check check (length(trim(suggestion_key)) between 3 and 240),
  constraint planning_assistant_reviews_type_check check (suggestion_type in (
    'vacant_position', 'compatible_sailor', 'handover', 'inconsistency',
    'change_summary', 'missing_document', 'reorganization'
  )),
  constraint planning_assistant_reviews_decision_check check (decision in ('accepted', 'refused')),
  constraint planning_assistant_reviews_comment_check check (length(trim(comment)) >= 3),
  constraint planning_assistant_reviews_dates_check check (generated_for_end >= generated_for_start),
  constraint planning_assistant_reviews_snapshot_check check (
    jsonb_typeof(suggestion_snapshot) = 'object'
    and suggestion_snapshot ?& array[
      'criteria_used', 'data_checked', 'rules_applied', 'conflicts_detected',
      'unavailable_data', 'confidence', 'justification', 'human_validation_required'
    ]
    and suggestion_snapshot ->> 'human_validation_required' = 'true'
  )
);

create index if not exists planning_assistant_pilots_active_idx
  on public.planning_assistant_pilots (company_id, user_id, valid_until)
  where enabled;
create index if not exists planning_assistant_pilots_user_idx on public.planning_assistant_pilots (user_id);
create index if not exists planning_assistant_pilots_granted_by_idx on public.planning_assistant_pilots (granted_by);
create index if not exists planning_assistant_pilots_updated_by_idx on public.planning_assistant_pilots (updated_by);
create index if not exists planning_assistant_reviews_company_date_idx
  on public.planning_assistant_reviews (company_id, reviewed_at desc);
create index if not exists planning_assistant_reviews_suggestion_idx
  on public.planning_assistant_reviews (company_id, suggestion_key, reviewed_at desc);
create index if not exists planning_assistant_reviews_vessel_idx
  on public.planning_assistant_reviews (vessel_id) where vessel_id is not null;
create index if not exists planning_assistant_reviews_person_idx
  on public.planning_assistant_reviews (person_id) where person_id is not null;
create index if not exists planning_assistant_reviews_reviewer_idx
  on public.planning_assistant_reviews (reviewed_by);

create or replace function public.planning_assistant_has_access(target_company_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.user_belongs_to_company(target_company_id)
    and (
      public.planning_user_can('use_assistant', target_company_id)
      or exists (
        select 1
        from public.planning_assistant_pilots pilot
        where pilot.company_id = target_company_id
          and pilot.user_id = (select auth.uid())
          and pilot.enabled
          and pilot.revoked_at is null
          and (pilot.valid_until is null or pilot.valid_until >= current_date)
          and exists (
            select 1
            from public.user_roles user_role
            where user_role.company_id = target_company_id
              and user_role.user_id = pilot.user_id
              and user_role.role_key in ('direction', 'armement')
          )
      )
    );
$$;

create or replace function public.get_planning_assistant_access()
returns table (
  has_access boolean,
  access_mode text,
  expires_on date,
  can_manage_pilots boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  target_is_admin boolean;
  target_pilot public.planning_assistant_pilots%rowtype;
begin
  target_is_admin := public.planning_user_can('use_assistant', target_company_id);
  select pilot.* into target_pilot
  from public.planning_assistant_pilots pilot
  where pilot.company_id = target_company_id
    and pilot.user_id = auth.uid();

  return query select
    public.planning_assistant_has_access(target_company_id),
    case
      when target_is_admin then 'administrator'
      when target_pilot.enabled and target_pilot.revoked_at is null
        and (target_pilot.valid_until is null or target_pilot.valid_until >= current_date) then 'pilot'
      else 'none'
    end,
    case when target_is_admin then null::date else target_pilot.valid_until end,
    public.planning_user_can('manage_assistant_pilots', target_company_id);
end;
$$;

create or replace function public.list_planning_assistant_pilots()
returns table (
  pilot_id bigint,
  user_id uuid,
  display_name text,
  email text,
  role_keys text[],
  enabled boolean,
  valid_until date,
  reason text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare target_company_id bigint := public.current_planning_company_id();
begin
  if not public.planning_user_can('manage_assistant_pilots', target_company_id) then
    raise exception using errcode = '42501', message = 'Vous ne pouvez pas gérer les accès pilote.';
  end if;

  return query
  select
    pilot.id,
    membership.user_id,
    coalesce(nullif(trim(profile.display_name), ''), profile.email, 'Utilisateur'),
    coalesce(profile.email, ''),
    array_agg(distinct user_role.role_key order by user_role.role_key)
      filter (where user_role.role_key in ('direction', 'armement')),
    coalesce(pilot.enabled, false),
    pilot.valid_until,
    coalesce(pilot.reason, ''),
    pilot.updated_at
  from public.company_memberships membership
  join public.profiles profile on profile.id = membership.user_id
  join public.user_roles user_role
    on user_role.company_id = membership.company_id and user_role.user_id = membership.user_id
  left join public.planning_assistant_pilots pilot
    on pilot.company_id = membership.company_id and pilot.user_id = membership.user_id
  where membership.company_id = target_company_id
    and user_role.role_key in ('direction', 'armement')
  group by pilot.id, membership.user_id, profile.display_name, profile.email,
    pilot.enabled, pilot.valid_until, pilot.reason, pilot.updated_at
  order by coalesce(nullif(trim(profile.display_name), ''), profile.email, 'Utilisateur');
end;
$$;

create or replace function public.set_planning_assistant_pilot(
  p_user_id uuid,
  p_enabled boolean,
  p_valid_until date,
  p_reason text
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  target_id bigint;
begin
  if not public.planning_user_can('manage_assistant_pilots', target_company_id) then
    raise exception using errcode = '42501', message = 'Vous ne pouvez pas gérer les accès pilote.';
  end if;
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'Utilisateur pilote obligatoire.';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception using errcode = '22023', message = 'Le motif doit contenir au moins 10 caractères.';
  end if;
  if p_enabled and p_valid_until is not null and p_valid_until < current_date then
    raise exception using errcode = '22023', message = 'La date de fin pilote ne peut pas être passée.';
  end if;
  if not exists (
    select 1 from public.company_memberships membership
    join public.user_roles user_role
      on user_role.company_id = membership.company_id and user_role.user_id = membership.user_id
    where membership.company_id = target_company_id
      and membership.user_id = p_user_id
      and user_role.role_key in ('direction', 'armement')
  ) then
    raise exception using errcode = '23503', message = 'Le pilote doit être un utilisateur du bureau de cette entreprise.';
  end if;

  insert into public.planning_assistant_pilots (
    company_id, user_id, enabled, valid_until, reason, granted_by, updated_by, revoked_at
  ) values (
    target_company_id, p_user_id, p_enabled, case when p_enabled then p_valid_until else null end,
    trim(p_reason), auth.uid(), auth.uid(), case when p_enabled then null else now() end
  )
  on conflict (company_id, user_id) do update set
    enabled = excluded.enabled,
    valid_until = excluded.valid_until,
    reason = excluded.reason,
    updated_by = auth.uid(),
    updated_at = now(),
    revoked_at = excluded.revoked_at
  returning id into target_id;

  insert into public.planning_change_log (
    company_id, entity_kind, entity_id, action, payload, changed_by, changed_by_name, summary
  ) values (
    target_company_id, 'assistant_pilot', target_id,
    case when p_enabled then 'grant' else 'revoke' end,
    jsonb_build_object('user_id', p_user_id, 'enabled', p_enabled, 'valid_until', p_valid_until, 'reason', trim(p_reason)),
    auth.uid(), public.planning_current_actor_name(),
    case when p_enabled then 'Accès pilote à l’assistant accordé' else 'Accès pilote à l’assistant retiré' end
  );
  return target_id;
end;
$$;

create or replace function public.record_planning_assistant_review(
  p_suggestion_key text,
  p_suggestion_type text,
  p_suggestion_snapshot jsonb,
  p_decision text,
  p_comment text,
  p_vessel_id bigint,
  p_person_id bigint,
  p_generated_for_start date,
  p_generated_for_end date
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  target_id bigint;
begin
  if not public.planning_assistant_has_access(target_company_id) then
    raise exception using errcode = '42501', message = 'Accès pilote à l’assistant requis.';
  end if;
  if length(trim(coalesce(p_comment, ''))) < 3 then
    raise exception using errcode = '22023', message = 'Le commentaire de décision doit contenir au moins 3 caractères.';
  end if;
  if p_generated_for_start is null or p_generated_for_end is null or p_generated_for_end < p_generated_for_start then
    raise exception using errcode = '22023', message = 'Période de suggestion invalide.';
  end if;
  if p_suggestion_snapshot is null
    or jsonb_typeof(p_suggestion_snapshot) <> 'object'
    or not (p_suggestion_snapshot ?& array[
      'criteria_used', 'data_checked', 'rules_applied', 'conflicts_detected',
      'unavailable_data', 'confidence', 'justification', 'human_validation_required'
    ])
    or p_suggestion_snapshot ->> 'human_validation_required' <> 'true' then
    raise exception using errcode = '22023', message = 'La preuve explicable de la suggestion est incomplète.';
  end if;
  if p_vessel_id is not null and not exists (
    select 1 from public.vessels vessel where vessel.id = p_vessel_id and vessel.company_id = target_company_id
  ) then
    raise exception using errcode = '23503', message = 'Navire hors entreprise.';
  end if;
  if p_person_id is not null and not exists (
    select 1 from public.people person where person.id = p_person_id and person.company_id = target_company_id
  ) then
    raise exception using errcode = '23503', message = 'Marin hors entreprise.';
  end if;

  insert into public.planning_assistant_reviews (
    company_id, suggestion_key, suggestion_type, suggestion_snapshot, decision, comment,
    vessel_id, person_id, generated_for_start, generated_for_end, reviewed_by, reviewed_by_name
  ) values (
    target_company_id, trim(p_suggestion_key), p_suggestion_type, p_suggestion_snapshot, p_decision,
    trim(p_comment), p_vessel_id, p_person_id, p_generated_for_start, p_generated_for_end,
    auth.uid(), public.planning_current_actor_name()
  ) returning id into target_id;

  insert into public.planning_change_log (
    company_id, entity_kind, entity_id, action, payload, changed_by, changed_by_name,
    vessel_id, starts_on, ends_on, summary
  ) values (
    target_company_id, 'assistant_suggestion', target_id, p_decision,
    jsonb_build_object(
      'suggestion_key', trim(p_suggestion_key), 'suggestion_type', p_suggestion_type,
      'decision', p_decision, 'comment', trim(p_comment), 'confidence', p_suggestion_snapshot -> 'confidence'
    ),
    auth.uid(), public.planning_current_actor_name(), p_vessel_id,
    p_generated_for_start, p_generated_for_end,
    case when p_decision = 'accepted' then 'Suggestion de l’assistant acceptée' else 'Suggestion de l’assistant refusée' end
  );
  return target_id;
end;
$$;

alter table public.planning_assistant_pilots enable row level security;
alter table public.planning_assistant_reviews enable row level security;

drop policy if exists planning_assistant_pilots_admin_read on public.planning_assistant_pilots;
create policy planning_assistant_pilots_admin_read on public.planning_assistant_pilots
  for select to authenticated
  using (
    company_id = (select public.current_planning_company_id())
    and (select public.planning_user_can('manage_assistant_pilots', company_id))
  );

drop policy if exists planning_assistant_reviews_pilot_read on public.planning_assistant_reviews;
create policy planning_assistant_reviews_pilot_read on public.planning_assistant_reviews
  for select to authenticated
  using (
    company_id = (select public.current_planning_company_id())
    and (select public.planning_assistant_has_access(company_id))
  );

grant select on public.planning_assistant_pilots, public.planning_assistant_reviews to authenticated;
revoke insert, update, delete on public.planning_assistant_pilots, public.planning_assistant_reviews from authenticated;
grant usage on public.planning_assistant_pilots_id_seq, public.planning_assistant_reviews_id_seq to authenticated;

revoke all on function public.planning_assistant_has_access(bigint) from public, anon;
revoke all on function public.get_planning_assistant_access() from public, anon;
revoke all on function public.list_planning_assistant_pilots() from public, anon;
revoke all on function public.set_planning_assistant_pilot(uuid, boolean, date, text) from public, anon;
revoke all on function public.record_planning_assistant_review(text, text, jsonb, text, text, bigint, bigint, date, date) from public, anon;
grant execute on function public.planning_assistant_has_access(bigint) to authenticated;
grant execute on function public.get_planning_assistant_access() to authenticated;
grant execute on function public.list_planning_assistant_pilots() to authenticated;
grant execute on function public.set_planning_assistant_pilot(uuid, boolean, date, text) to authenticated;
grant execute on function public.record_planning_assistant_review(text, text, jsonb, text, text, bigint, bigint, date, date) to authenticated;

comment on table public.planning_assistant_pilots is
  'P2.1 allowlist for selected direction/armement users. Administrators have role-based access.';
comment on table public.planning_assistant_reviews is
  'Immutable human accept/refuse journal for explainable assistant suggestions; never applies a Planning mutation.';
comment on function public.record_planning_assistant_review(text, text, jsonb, text, text, bigint, bigint, date, date) is
  'Records only the human decision and evidence snapshot; creates no assignment, publication or derogation.';
