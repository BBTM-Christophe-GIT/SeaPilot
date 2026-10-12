-- Optional manual editing override for the uniquely linked Christophe MINASSIAN
-- administrator account. Business locks are bypassed; identity, company scope,
-- valid interval geometry, phase-overlap checks and immutable evidence remain enforced.
create table public.working_time_edit_settings (
  company_id bigint primary key references public.companies(id) on delete cascade,
  unrestricted_editing_enabled boolean not null default false,
  authorized_user_id uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

-- Resolve the account once from trusted HR and administrator assignments, never
-- from a client claim or a display name at request time. Ambiguity fails closed.
insert into public.working_time_edit_settings (company_id, authorized_user_id)
select person.company_id, (array_agg(person.user_id))[1]
from public.people person
where person.active and person.user_id is not null
  and lower(trim(person.first_name)) = 'christophe'
  and lower(trim(person.last_name)) = 'minassian'
  and exists (
    select 1 from public.user_roles role
    where role.company_id = person.company_id and role.user_id = person.user_id
      and role.role_key = 'admin'
  )
group by person.company_id
having count(*) = 1;

create table public.working_time_edit_settings_events (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  before_enabled boolean not null,
  after_enabled boolean not null,
  occurred_at timestamptz not null default clock_timestamp()
);
create index working_time_edit_settings_events_company_idx
  on public.working_time_edit_settings_events (company_id, occurred_at desc);

alter table public.working_time_edit_settings enable row level security;
alter table public.working_time_edit_settings_events enable row level security;
create policy working_time_edit_settings_read on public.working_time_edit_settings
for select to authenticated using (
  (select public.user_belongs_to_company(company_id))
  and (select public.has_company_role(company_id, array['admin']))
);
create policy working_time_edit_settings_events_read on public.working_time_edit_settings_events
for select to authenticated using (
  (select public.user_belongs_to_company(company_id))
  and (select public.has_company_role(company_id, array['admin']))
);
revoke all on table public.working_time_edit_settings, public.working_time_edit_settings_events
from public, anon, authenticated;
grant select on table public.working_time_edit_settings, public.working_time_edit_settings_events
to authenticated;
create trigger working_time_edit_settings_events_immutable
before update or delete on public.working_time_edit_settings_events
for each row execute function public.working_time_prevent_mutation();

create function public.working_time_unrestricted_editing_allowed(p_company_id bigint)
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null
    and public.user_belongs_to_company(p_company_id)
    and public.has_company_role(p_company_id, array['admin'])
    and exists (
      select 1 from public.working_time_edit_settings settings
      where settings.company_id = p_company_id
        and settings.unrestricted_editing_enabled
        and settings.authorized_user_id = auth.uid()
    );
$$;
revoke all on function public.working_time_unrestricted_editing_allowed(bigint)
from public, anon, authenticated;

create function public.working_time_get_edit_settings()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare company bigint := public.current_planning_company_id();
begin
  if auth.uid() is null or not public.user_belongs_to_company(company) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: reglage de modification.';
  end if;
  return jsonb_build_object(
    'unrestricted_editing_enabled', coalesce((
      select settings.unrestricted_editing_enabled from public.working_time_edit_settings settings
      where settings.company_id = company
    ), false),
    'can_use_unrestricted_editing', public.working_time_unrestricted_editing_allowed(company)
  );
end;
$$;

create function public.working_time_save_edit_settings(p_unrestricted_editing_enabled boolean)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  company bigint := public.current_planning_company_id();
  settings public.working_time_edit_settings%rowtype;
begin
  if auth.uid() is null or not public.user_belongs_to_company(company)
    or not public.has_company_role(company, array['admin']) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: administration du reglage.';
  end if;
  if p_unrestricted_editing_enabled is null then
    raise exception using errcode = '22023', message = 'WORKING_TIME_EDIT_SETTING_INVALID.';
  end if;
  select * into settings from public.working_time_edit_settings
  where company_id = company for update;
  if settings.authorized_user_id is null then
    raise exception using errcode = '55000', message = 'WORKING_TIME_EDIT_ACCOUNT_NOT_CONFIGURED.';
  end if;
  if settings.unrestricted_editing_enabled is distinct from p_unrestricted_editing_enabled then
    update public.working_time_edit_settings
    set unrestricted_editing_enabled = p_unrestricted_editing_enabled,
      updated_at = clock_timestamp(), updated_by = auth.uid()
    where company_id = company;
    insert into public.working_time_edit_settings_events (
      company_id, actor_user_id, before_enabled, after_enabled
    ) values (company, auth.uid(), settings.unrestricted_editing_enabled, p_unrestricted_editing_enabled);
  end if;
  return public.working_time_get_edit_settings();
end;
$$;
revoke all on function public.working_time_get_edit_settings() from public, anon;
revoke all on function public.working_time_save_edit_settings(boolean) from public, anon;
grant execute on function public.working_time_get_edit_settings() to authenticated;
grant execute on function public.working_time_save_edit_settings(boolean) to authenticated;

-- An edited signed day becomes an unsigned draft. The complete old approval,
-- including both real signature snapshots, remains in the append-only event.
alter table public.working_time_day_approval_events
  add column approval_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(approval_snapshot) = 'object');
alter table public.working_time_day_approval_events
  drop constraint working_time_day_approval_events_type_check,
  drop constraint working_time_day_approval_events_status_check;
alter table public.working_time_day_approval_events
  add constraint working_time_day_approval_events_type_check check (
    event_type in ('submitted', 'captain_corrected', 'validated', 'legacy_validation_migrated', 'unrestricted_edit_reset')
  ),
  add constraint working_time_day_approval_events_status_check check (
    new_status in ('draft', 'submitted', 'validated')
  );
create trigger working_time_day_approval_events_immutable
before update or delete on public.working_time_day_approval_events
for each row execute function public.working_time_prevent_mutation();

create function private.working_time_unrestricted_edit_reset()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  register public.working_time_registers%rowtype;
  approval public.working_time_day_approvals%rowtype;
  affected_date date;
  affected_dates date[] := array[]::date[];
begin
  if not public.working_time_unrestricted_editing_allowed(new.company_id) then return new; end if;
  -- A no-op save must not invalidate an unchanged signature.
  if tg_op = 'UPDATE' and row(
    old.local_work_date, old.starts_at, old.ends_at, old.timezone_name,
    old.vessel_id, old.watch_group, old.comment, old.voided_at
  ) is not distinct from row(
    new.local_work_date, new.starts_at, new.ends_at, new.timezone_name,
    new.vessel_id, new.watch_group, new.comment, new.voided_at
  ) then return new; end if;

  select * into register from public.working_time_registers
  where id = new.register_id for update;
  if register.status in ('awaiting_sailor_signature', 'submitted', 'validated') then
    insert into public.working_time_validations (
      company_id, register_id, person_id, event_type, previous_status, new_status,
      actor_user_id, actor_person_id, subject_identity_snapshot, actor_identity_snapshot,
      signature_snapshot, comment
    ) values (
      register.company_id, register.id, register.person_id, 'reopened', register.status, 'reopened',
      auth.uid(), public.current_person_id(),
      public.working_time_person_identity_snapshot(register.person_id, register.company_id),
      public.working_time_person_identity_snapshot(public.current_person_id(), register.company_id),
      null, 'Modification libre : nouvelles heures non signees.'
    );
    update public.working_time_registers set status = 'reopened', updated_by = auth.uid()
    where id = register.id;
  end if;

  affected_dates := array_append(affected_dates, new.local_work_date);
  if tg_op = 'UPDATE' and old.local_work_date is distinct from new.local_work_date then
    affected_dates := array_append(affected_dates, old.local_work_date);
  end if;
  foreach affected_date in array affected_dates loop
    select * into approval from public.working_time_day_approvals
    where register_id = register.id and local_work_date = affected_date for update;
    if approval.id is not null and (approval.status <> 'draft'
      or approval.subject_signature_snapshot <> '{}'::jsonb
      or approval.approver_signature_snapshot <> '{}'::jsonb) then
      insert into public.working_time_day_approval_events (
        company_id, day_approval_id, register_id, person_id, local_work_date,
        event_type, previous_status, new_status, actor_user_id, actor_person_id,
        actor_identity_snapshot, interval_snapshot, non_compliance_snapshot, approval_snapshot
      ) values (
        approval.company_id, approval.id, approval.register_id, approval.person_id, affected_date,
        'unrestricted_edit_reset', approval.status, 'draft', auth.uid(), public.current_person_id(),
        public.working_time_person_identity_snapshot(public.current_person_id(), approval.company_id),
        approval.interval_snapshot, approval.non_compliance_snapshot, to_jsonb(approval)
      );
      update public.working_time_day_approvals
      set status = 'draft', submitted_by = null, submitted_by_person_id = null, submitted_at = null,
        validated_by = null, validated_by_person_id = null, validated_at = null,
        signature_snapshot = '{}'::jsonb, subject_signature_snapshot = '{}'::jsonb,
        approver_signature_snapshot = '{}'::jsonb, interval_snapshot = '[]'::jsonb,
        non_compliance_snapshot = '[]'::jsonb, updated_at = clock_timestamp()
      where id = approval.id;
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function private.working_time_unrestricted_edit_reset() from public, anon, authenticated;
create trigger working_time_intervals_10_unrestricted_edit_reset
after insert or update on public.working_time_intervals
for each row execute function private.working_time_unrestricted_edit_reset();

-- Patch the latest deployed bodies instead of resurrecting an older captain,
-- Planning, submission or rolling-calculation implementation. Fail on drift.
do $migration$
declare change record; definition text;
begin
  definition := replace(pg_get_functiondef('public.working_time_actor_can_edit_day(bigint,date)'::regprocedure), chr(13), '');
  if position($old$      and coalesce(approval.status, 'draft') <> 'validated'$old$ in definition) = 0
    or position('approval.id is null' in definition) = 0
    or position('  );' in definition) = 0 then
    raise exception 'Expected unrestricted-edit day guards missing';
  end if;
  definition := replace(definition,
    $old$      and coalesce(approval.status, 'draft') <> 'validated'$old$,
    $new$      and (public.working_time_unrestricted_editing_allowed(register.company_id) or (
      coalesce(approval.status, 'draft') <> 'validated'$new$);
  definition := replace(definition, '  );', E'      ))\n  );');
  definition := replace(definition, 'approval.id is null', '(approval.id is null or approval.status = ''draft'')');
  execute definition;

  for change in select * from (values
    (
      'public.save_working_time_interval(bigint,timestamptz,timestamptz,text,bigint,text,text,bigint)',
      $old$    if target_interval.local_work_date <> target_local_date$old$,
      $new$    if not public.working_time_unrestricted_editing_allowed(target_register.company_id)
      and target_interval.local_work_date <> target_local_date$new$
    ),
    (
      'public.save_working_time_interval(bigint,timestamptz,timestamptz,text,bigint,text,text,bigint)',
      $old$  if recommendation->>'status' in ('alerte', 'non_conforme')$old$,
      $new$  if not public.working_time_unrestricted_editing_allowed(target_register.company_id)
    and recommendation->>'status' in ('alerte', 'non_conforme')$new$
    ),
    (
      'public.save_working_time_interval(bigint,timestamptz,timestamptz,text,bigint,text,text,bigint)',
      $old$  if existing_approval.status = 'submitted' and existing_approval.approver_person_id = actor_person_id then$old$,
      $new$  if not public.working_time_unrestricted_editing_allowed(target_register.company_id)
    and existing_approval.status = 'submitted' and existing_approval.approver_person_id = actor_person_id then$new$
    ),
    (
      'public.void_working_time_interval(bigint,text)',
      $old$  if length(trim(coalesce(p_reason, ''))) < 2 then
    raise exception using errcode = '22023', message = 'WORKING_TIME_VOID_REASON_REQUIRED.';
  end if;$old$,
      $new$  if auth.uid() is null or public.current_person_id() is null then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PROFILE_NOT_LINKED: fiche RH requise.';
  end if;$new$
    ),
    (
      'public.void_working_time_interval(bigint,text)',
      $old$  update public.working_time_intervals
  set voided_at = now(), voided_by = (select auth.uid()), void_reason = trim(p_reason)$old$,
      $new$  if not public.working_time_unrestricted_editing_allowed(target_interval.company_id)
    and length(trim(coalesce(p_reason, ''))) < 2 then
    raise exception using errcode = '22023', message = 'WORKING_TIME_VOID_REASON_REQUIRED.';
  end if;
  update public.working_time_intervals
  set voided_at = now(), voided_by = (select auth.uid()),
    void_reason = case when public.working_time_unrestricted_editing_allowed(target_interval.company_id)
      and length(trim(coalesce(p_reason, ''))) < 2
      then 'Retrait en mode modification libre' else trim(p_reason) end$new$
    )
  ) as changes(signature, old_sql, new_sql) loop
    definition := replace(pg_get_functiondef(change.signature::regprocedure), chr(13), '');
    change.old_sql := replace(change.old_sql, chr(13), '');
    change.new_sql := replace(change.new_sql, chr(13), '');
    if position(change.old_sql in definition) = 0 then
      raise exception 'Expected unrestricted-edit guard missing in %', change.signature;
    end if;
    execute replace(definition, change.old_sql, change.new_sql);
  end loop;
end;
$migration$;

comment on table public.working_time_edit_settings is
  'Company switch, disabled by default. Only the HR-resolved Christophe MINASSIAN administrator account may use unrestricted editing; the RPC cannot change that binding.';
comment on column public.working_time_day_approval_events.approval_snapshot is
  'Complete prior approval and actual signatures before unrestricted edits invalidate the current signed state.';
comment on function public.working_time_unrestricted_editing_allowed(bigint) is
  'Private authorization check: active company membership, current Admin role, enabled switch and immutable authorized account binding.';
notify pgrst, 'reload schema';
