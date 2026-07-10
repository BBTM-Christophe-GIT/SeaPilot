create table if not exists public.hr_visibility_rules (
  scope text not null check (scope in ('function', 'document_type', 'section')),
  item_key text not null,
  item_label text not null,
  visible_to_roles text[] not null default array['admin', 'direction', 'armement', 'capitaine', 'marin'],
  updated_at timestamptz not null default now(),
  primary key (scope, item_key),
  check (visible_to_roles <@ array['admin', 'direction', 'armement', 'capitaine', 'marin'])
);

grant select, insert, update, delete on public.hr_visibility_rules to authenticated;

alter table public.hr_visibility_rules enable row level security;

drop policy if exists hr_visibility_rules_authenticated_read on public.hr_visibility_rules;
create policy hr_visibility_rules_authenticated_read on public.hr_visibility_rules
  for select to authenticated
  using (true);

drop policy if exists hr_visibility_rules_admin_write on public.hr_visibility_rules;
create policy hr_visibility_rules_admin_write on public.hr_visibility_rules
  for all to authenticated
  using (public.has_any_role(array['admin']))
  with check (public.has_any_role(array['admin']));

insert into public.hr_visibility_rules (scope, item_key, item_label)
values
  ('function', 'capitaine', 'Capitaine'),
  ('function', 'chef-mecanicien', 'Chef Mécanicien'),
  ('function', '2nd-capitaine', '2nd Capitaine'),
  ('function', 'maitre-d-equipage', 'Maître d''Equipage'),
  ('function', 'matelot-polyvalent', 'Matelot polyvalent'),
  ('function', 'matelot-qualifie', 'Matelot Qualifié'),
  ('function', 'stagiaire', 'Stagiaire'),
  ('document_type', 'administrative', 'Documents administratifs'),
  ('document_type', 'certificate', 'Certificats'),
  ('document_type', 'deck', 'Pont'),
  ('document_type', 'engine', 'Machine'),
  ('document_type', 'lifting', 'Levage'),
  ('document_type', 'medical_visit', 'Visite Médicale'),
  ('document_type', 'safety_training', 'Formation de Sécurité'),
  ('document_type', 'safety_induction', 'Safety Induction'),
  ('section', 'identity', 'Identité et poste'),
  ('section', 'contract', 'Contrat et dates'),
  ('section', 'contact', 'Coordonnées'),
  ('section', 'emergency', 'Contact urgence'),
  ('section', 'administrative', 'Documents administratifs'),
  ('section', 'health', 'Santé et habilitations'),
  ('section', 'clothing', 'Tenues et mensurations')
on conflict (scope, item_key) do update
set item_label = excluded.item_label;
