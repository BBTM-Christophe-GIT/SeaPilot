-- Planning STCW catalogue, guided board creation and daily assignment states.
--
-- Source: authenticated SharePoint list 8c8561d7-9fb4-420f-8290-b66309d07e92
-- referenced by stcw_certificates.iqy on 2026-07-14.
--
-- Replay safety:
--   * the catalogue is upserted by immutable SharePoint item id;
--   * functions, policies and indexes are replaced/created idempotently;
--   * no planning assignment, matrix or daily row is rewritten.
--
-- Rollback:
--   1. Export technical planning_days rows with source_label = 'seapilot-assignment-note'.
--   2. Drop create_planning_board_assignments and save_planning_assignment_day_state.
--   3. Drop stcw_certificates only after confirming no external consumer uses it.

create table if not exists public.stcw_certificates (
  id bigint generated always as identity primary key,
  source_list_id uuid not null,
  source_item_id integer not null,
  name text not null,
  category text,
  stcw_rules text[] not null default '{}'::text[],
  is_credential boolean not null default true,
  active boolean not null default true,
  source_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stcw_certificates_name_check check (length(trim(name)) > 0),
  constraint stcw_certificates_source_item_check check (source_item_id > 0),
  constraint stcw_certificates_source_unique unique (source_list_id, source_item_id)
);

create index if not exists stcw_certificates_picker_idx
  on public.stcw_certificates (category, name)
  where active and is_credential;

alter table public.stcw_certificates enable row level security;
drop policy if exists stcw_certificates_authenticated_read on public.stcw_certificates;
create policy stcw_certificates_authenticated_read
  on public.stcw_certificates for select to authenticated
  using (active);

revoke all on table public.stcw_certificates from public, anon;
revoke insert, update, delete, truncate, references, trigger on table public.stcw_certificates from authenticated;
grant select on table public.stcw_certificates to authenticated;

insert into public.stcw_certificates (
  source_list_id, source_item_id, name, category, stcw_rules, is_credential
)
values
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 1, 'Capitaine polyvalent', 'Pont', array['II/2'], true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 2, 'Second Capitaine', 'Pont', array['II/2','III/2'], true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 3, 'Capitaine 200', 'Pont', array['II/3'], true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 4, 'Capitaine', 'Pont', array['II/2','III/2'], true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 5, 'Capitaine 3000', 'Pont', array['II/2'], true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 6, 'Capitaine 500', 'Pont', array['II/3'], true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 7, 'Chef Mécanicien', 'Machine', array['III/2'], true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 8, 'Chef Mécanicien 8000 kW', 'Machine', array['III/2'], true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 9, 'Chef Mécanicien 3000 kW', 'Machine', array['III/3'], true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 10, 'Chef Mécanicien 3000 kW limité à 200 milles des côtes', 'Machine', '{}', true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 11, 'Chef de Quart Machine', 'Machine', array['III/1'], true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 12, 'Officier Electrotechnicien', 'Machine', array['III/6'], true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 13, 'Mécanicien 750 kW', 'Machine', '{}', true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 14, 'Mécanicien 250 kW', 'Machine', '{}', true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 15, 'CRO - Certificat Restreint d''Opérateur', 'Formation de Sécurité', array['IV'], true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 16, 'CGO - Certificat Général d''Opérateur', 'Formation de Sécurité', array['IV'], true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 17, 'Matelot Pont', 'Pont', '{}', true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 18, 'Matelot de Quart Passerelle', 'Pont', array['II/4'], true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 19, 'Marin Qualifié Pont', 'Pont', array['II/5'], true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 20, 'Mécanicien', 'Machine', '{}', true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 21, 'Mécanicien de Quart Machine', 'Machine', array['III/4'], true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 22, 'Marin Qualifié Machine', 'Machine', array['III/5'], true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 23, 'Matelot Electrotechnicien', 'Machine', array['III/7'], true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 24, 'Sécurité', 'Formation de Sécurité', array['VI/1'], true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 25, 'CFBS - Certificat de Formation de Base à la Sécurité', 'Formation de Sécurité', '{}', true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 26, 'CSS - Certificat Sensibilisation Sûreté', 'Formation de Sécurité', array['VI/5'], true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 27, 'ASN - Agent de Sûreté du Navire', 'Formation de Sécurité', '{}', true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 28, 'CAEERS - Certificat d''exploitation des embarcations et radeaux de sauvetage', 'Formation de Sécurité', array['VI/2§1'], true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 29, 'CQALI - Certificat de Qualification Avancée à la Lutte contre l’Incendie', 'Formation de Sécurité', array['VI/3'], true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 30, 'Enseignement Médical de niveau I', 'Formation de Sécurité', array['VI/4'], true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 31, 'Enseignement Médical de niveau II', 'Formation de Sécurité', array['VI/4'], true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 32, 'Enseignement Médical de niveau III', 'Formation de Sécurité', array['VI/4'], true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 33, 'ECDIS - Cartes électroniques', 'Formation de Sécurité', array['II/1','II/2','II/3'], true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 34, 'Chef de Quart 500', 'Pont', array['II/3'], true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 35, 'Mécanicien Quart Machine', 'Machine', '{}', true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 37, 'Certificat Médical d''Aptitude à la Navigation Maritime', 'Visite Médicale', '{}', false),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 38, 'Contrat', 'Ressources Humaines', '{}', false),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 39, 'Informations Personnelles', 'Ressources Humaines', '{}', false),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 40, 'Contact d''Urgence', 'Ressources Humaines', '{}', false),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 41, 'Coordonnées Bancaires', 'Ressources Humaines', '{}', false),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 42, 'Carte Nationale d''Identité', 'Ressources Humaines', '{}', false),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 43, 'Permis de Conduire', 'Ressources Humaines', '{}', false),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 44, 'Passeport', 'Ressources Humaines', '{}', false),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 45, 'Arrêt de Travail', 'Ressources Humaines', '{}', false),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 46, 'Arrêt Maladie', 'Ressources Humaines', '{}', false),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 47, 'CACES', 'Conduite d''Engin', '{}', true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 48, 'APAVE - Formation Conduite de Grue - LMG 130', 'Levage', '{}', true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 49, 'Autorisation de Conduite', 'Conduite d''Engin', '{}', true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 50, 'Induction Grue', 'Levage', '{}', true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 51, 'APAVE - Vérificateur Appareils Accessoires de Levage', 'Levage', '{}', true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 52, 'LEMS - HSE Induction', 'Safety Induction', '{}', true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 53, 'Convocation Formation', 'Plan de Formation', '{}', false),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 54, 'Formation', 'Plan de Formation', '{}', false),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 55, 'BBTM - Induction THOMSEA', 'Safety Induction', '{}', true)
on conflict (source_list_id, source_item_id) do update set
  name = excluded.name,
  category = excluded.category,
  stcw_rules = excluded.stcw_rules,
  is_credential = excluded.is_credential,
  active = true,
  updated_at = now();

create or replace function public.save_planning_assignment_day_state(
  p_assignment_id bigint,
  p_work_date date,
  p_status text,
  p_note text
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  target_status text := trim(coalesce(p_status, ''));
  target_note text := nullif(trim(coalesce(p_note, '')), '');
  target_assignment public.planning_assignments%rowtype;
  saved_id bigint;
begin
  if p_assignment_id is null or p_work_date is null
     or target_status not in ('En Mer', 'A Terre', 'Vacance', 'Repos') then
    raise exception using errcode = '22023', message = 'PLANNING_ASSIGNMENT_DAY_STATE_INVALID';
  end if;
  if char_length(coalesce(p_note, '')) > 32 then
    raise exception using errcode = '22001', message = 'PLANNING_ASSIGNMENT_NOTE_TOO_LONG';
  end if;

  select assignment.* into target_assignment
  from public.planning_assignments assignment
  where assignment.id = p_assignment_id
    and assignment.company_id = target_company_id
    and assignment.confirmation_status <> 'cancelled';

  if not found or p_work_date < target_assignment.starts_on or p_work_date > target_assignment.ends_on then
    raise exception using errcode = '23503', message = 'PLANNING_ASSIGNMENT_DAY_STATE_ASSIGNMENT_NOT_FOUND';
  end if;
  if not public.planning_user_can('edit_event', target_company_id, target_assignment.vessel_id, p_work_date, p_work_date) then
    raise exception using errcode = '42501', message = 'PLANNING_ASSIGNMENT_DAY_STATE_FORBIDDEN';
  end if;

  if target_note is null and target_status = target_assignment.status_label then
    delete from public.planning_days
    where company_id = target_company_id
      and slot365 = 'assignment:' || p_assignment_id::text
      and work_date = p_work_date
      and source_label = 'seapilot-assignment-note'
    returning id into saved_id;
    return saved_id;
  end if;

  insert into public.planning_days (
    company_id, person_id, vessel_id, crew_name, vessel_name, work_date,
    year_number, month_number, month_label, day_number, function_label,
    sailor_status, day_status, watch_group, slot365, comments, source_label
  )
  select
    target_company_id, target_assignment.crew_person_id, target_assignment.vessel_id,
    trim(concat_ws(' ', person.first_name, person.last_name)), vessel.name, p_work_date,
    extract(year from p_work_date)::integer, extract(month from p_work_date)::integer,
    to_char(p_work_date, 'TMMonth'), extract(day from p_work_date)::integer,
    target_assignment.assignment_role, target_status, 'État quotidien', target_assignment.watch_group,
    'assignment:' || target_assignment.id::text, coalesce(target_note, ''), 'seapilot-assignment-note'
  from public.people person
  join public.vessels vessel on vessel.id = target_assignment.vessel_id
  where person.id = target_assignment.crew_person_id
  on conflict (company_id, slot365, work_date)
    where source_label = 'seapilot-assignment-note'
  do update set
    person_id = excluded.person_id,
    vessel_id = excluded.vessel_id,
    crew_name = excluded.crew_name,
    vessel_name = excluded.vessel_name,
    function_label = excluded.function_label,
    sailor_status = excluded.sailor_status,
    day_status = excluded.day_status,
    watch_group = excluded.watch_group,
    comments = excluded.comments,
    updated_at = now()
  returning id into saved_id;
  return saved_id;
end;
$$;

revoke all on function public.save_planning_assignment_day_state(bigint, date, text, text) from public, anon;
grant execute on function public.save_planning_assignment_day_state(bigint, date, text, text) to authenticated;

create or replace function public.create_planning_board_assignments(
  p_vessel_id bigint,
  p_watch_group text,
  p_starts_on date,
  p_ends_on date,
  p_positions jsonb
)
returns bigint[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  target_watch_group text := trim(coalesce(p_watch_group, ''));
  position jsonb;
  target_person_id bigint;
  target_function text;
  inserted_id bigint;
  inserted_ids bigint[] := '{}'::bigint[];
begin
  if p_vessel_id is null or p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on
     or target_watch_group = '' or jsonb_typeof(p_positions) <> 'array' or jsonb_array_length(p_positions) = 0 then
    raise exception using errcode = '22023', message = 'PLANNING_BOARD_INVALID';
  end if;
  if not exists (select 1 from public.vessels where id = p_vessel_id and company_id = target_company_id and active) then
    raise exception using errcode = '23503', message = 'PLANNING_BOARD_VESSEL_NOT_FOUND';
  end if;
  if not public.planning_user_can('edit_event', target_company_id, p_vessel_id, p_starts_on, p_ends_on) then
    raise exception using errcode = '42501', message = 'PLANNING_BOARD_FORBIDDEN';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_company_id::text || ':' || p_vessel_id::text, 0));
  for position in select value from jsonb_array_elements(p_positions)
  loop
    target_person_id := nullif(position ->> 'personId', '')::bigint;
    target_function := trim(coalesce(position ->> 'functionLabel', ''));
    if target_person_id is null or target_function = '' then
      raise exception using errcode = '22023', message = 'PLANNING_BOARD_POSITION_INVALID';
    end if;
    if not exists (select 1 from public.people where id = target_person_id and company_id = target_company_id and active) then
      raise exception using errcode = '23503', message = 'PLANNING_BOARD_PERSON_NOT_FOUND';
    end if;
    if exists (
      select 1 from public.planning_assignments assignment
      where assignment.company_id = target_company_id
        and assignment.crew_person_id = target_person_id
        and assignment.confirmation_status <> 'cancelled'
        and assignment.starts_on <= p_ends_on
        and assignment.ends_on >= p_starts_on
    ) then
      raise exception using errcode = '23P01', message = 'PLANNING_BOARD_PERSON_ALREADY_ASSIGNED';
    end if;

    insert into public.planning_assignments (
      company_id, vessel_id, crew_person_id, starts_on, ends_on, starts_at, ends_at,
      assignment_role, status_label, confirmation_status, watch_group, source_label
    ) values (
      target_company_id, p_vessel_id, target_person_id, p_starts_on, p_ends_on,
      (p_starts_on + time '08:00') at time zone 'Europe/Paris',
      (p_ends_on + time '20:00') at time zone 'Europe/Paris',
      target_function, 'En Mer', 'provisional', target_watch_group, 'seapilot-board'
    ) returning id into inserted_id;
    inserted_ids := array_append(inserted_ids, inserted_id);
  end loop;
  return inserted_ids;
end;
$$;

revoke all on function public.create_planning_board_assignments(bigint, text, date, date, jsonb) from public, anon;
grant execute on function public.create_planning_board_assignments(bigint, text, date, date, jsonb) to authenticated;

comment on table public.stcw_certificates is
  'Global read-only STCW and related credential catalogue imported from the authenticated QHSE SharePoint list.';
comment on function public.save_planning_assignment_day_state(bigint, date, text, text) is
  'Saves a company-scoped daily status override and optional short comment for one assignment cell.';
comment on function public.create_planning_board_assignments(bigint, text, date, date, jsonb) is
  'Atomically creates a company-scoped provisional vessel board after server-side overlap and permission checks.';
