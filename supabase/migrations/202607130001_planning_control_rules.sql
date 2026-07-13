create table if not exists public.planning_rules (
  id bigint generated always as identity primary key,
  code text not null unique,
  name text not null,
  description text,
  scope text not null default 'assignment',
  control_level text not null,
  active boolean not null default true,
  effective_from date not null default current_date,
  configuration jsonb not null default '{}'::jsonb,
  source_reference text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  constraint planning_rules_code_check check (code ~ '^[a-z][a-z0-9_]*$'),
  constraint planning_rules_scope_check check (scope in ('assignment', 'document', 'availability', 'medical')),
  constraint planning_rules_control_level_check check (control_level in ('information', 'warning', 'blocking')),
  constraint planning_rules_configuration_check check (jsonb_typeof(configuration) = 'object'),
  constraint planning_rules_version_check check (version > 0)
);

create index if not exists planning_rules_active_scope_idx
  on public.planning_rules (active, scope, effective_from);

grant select, insert, update, delete on public.planning_rules to authenticated;
grant usage on public.planning_rules_id_seq to authenticated;

alter table public.planning_rules enable row level security;

drop policy if exists planning_rules_role_read on public.planning_rules;
create policy planning_rules_role_read on public.planning_rules
  for select to authenticated
  using ((select public.has_any_role(array['admin', 'direction', 'armement', 'capitaine', 'marin'])));

drop policy if exists planning_rules_admin_write on public.planning_rules;
create policy planning_rules_admin_write on public.planning_rules
  for all to authenticated
  using ((select public.has_role('admin')))
  with check ((select public.has_role('admin')));

insert into public.planning_rules (
  code,
  name,
  description,
  scope,
  control_level,
  effective_from,
  source_reference
)
values
  ('invalid_period', 'Période incohérente', 'Empêche l’enregistrement lorsque la fin précède le début.', 'assignment', 'blocking', '2026-07-13', 'Règle de cohérence SeaPilot'),
  ('inactive_person', 'Marin inactif', 'Empêche une affectation en dehors de la période d’activité RH.', 'availability', 'blocking', '2026-07-13', 'Données RH SeaPilot'),
  ('crew_unavailability', 'Indisponibilité équipage', 'Contrôle les repos, congés, arrêts et formations qui chevauchent une affectation de travail.', 'availability', 'blocking', '2026-07-13', 'Règle interne configurable'),
  ('assignment_overlap', 'Double affectation', 'Signale un marin affecté à deux navires sur une même période.', 'assignment', 'warning', '2026-07-13', 'Règle interne configurable'),
  ('function_mismatch', 'Cohérence de fonction', 'Compare la fonction RH et la fonction prévue au planning.', 'assignment', 'information', '2026-07-13', 'Données RH SeaPilot'),
  ('expired_medical', 'Aptitude médicale expirée', 'Empêche une affectation dont la fin dépasse la validité médicale connue.', 'medical', 'blocking', '2026-07-13', 'Contrôle opérationnel configurable, sans valeur d’interprétation juridique'),
  ('expired_credential', 'Titre ou qualification expiré', 'Signale un brevet, certificat, titre ou formation expirant pendant l’affectation.', 'document', 'warning', '2026-07-13', 'Contrôle opérationnel configurable'),
  ('medical_unfit', 'Inaptitude médicale', 'Empêche une affectation lorsqu’une inaptitude médicale active est enregistrée.', 'medical', 'blocking', '2026-07-13', 'Données médicales à accès restreint'),
  ('medical_restriction', 'Restriction médicale', 'Signale une restriction médicale active avant l’affectation.', 'medical', 'warning', '2026-07-13', 'Données médicales à accès restreint'),
  ('pending_validation', 'Document à valider', 'Signale un document requis encore en attente de validation du capitaine.', 'document', 'warning', '2026-07-13', 'Workflow documentaire SeaPilot')
on conflict (code) do nothing;

comment on table public.planning_rules is
  'Règles configurables utilisées par le module Planning. Les références sont informatives et ne constituent pas une interprétation juridique.';
