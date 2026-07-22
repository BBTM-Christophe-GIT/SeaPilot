-- Projects SharePoint live reconciliation.
-- Adds the fields and lookup table observed on the QHSE site, then exposes
-- replayable reconciliation functions for the controlled linked import.

alter table public.clients
  add column if not exists final_customer text,
  add column if not exists is_broker boolean,
  add column if not exists contact_name text,
  add column if not exists siret text,
  add column if not exists vat_number text,
  add column if not exists charterer_operation_location text,
  add column if not exists representative_name text;

comment on column public.clients.final_customer is 'SharePoint ClientFinal value.';
comment on column public.clients.is_broker is 'SharePoint Intermédiaire / Broker flag.';
comment on column public.clients.charterer_operation_location is 'Contract-ready charterer identity and operation address from SharePoint.';

create table if not exists public.towage_options (
  id bigint generated always as identity primary key,
  company_id bigint not null default public.current_planning_company_id()
    references public.companies(id) on delete restrict,
  name text not null,
  description text,
  source_label text not null default 'sharepoint',
  sharepoint_site_url text,
  sharepoint_list_id text,
  sharepoint_list_title text,
  sharepoint_item_id text,
  sharepoint_unique_id text,
  sharepoint_file_ref text,
  sharepoint_encoded_abs_url text,
  source_modified_at timestamptz,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  constraint towage_options_name_check check (length(trim(name)) > 0),
  constraint towage_options_source_payload_check check (public.is_valid_project_source_payload(source_payload))
);

comment on table public.towage_options is
  'Towage objects referenced by BBTM - Projets. SharePoint remains the source of truth during migration.';

create index if not exists towage_options_company_id_idx
  on public.towage_options (company_id);
create index if not exists towage_options_company_name_idx
  on public.towage_options (company_id, public.normalize_import_label(name));
create unique index if not exists towage_options_sharepoint_item_unique_idx
  on public.towage_options (sharepoint_list_id, sharepoint_item_id);

alter table public.project_change_log
  drop constraint if exists project_change_log_entity_type_check;
alter table public.project_change_log
  add constraint project_change_log_entity_type_check check (
    entity_type in (
      'clients',
      'projects',
      'project_contracts',
      'project_documents',
      'contract_documents',
      'towage_options'
    )
  );

create or replace function public.audit_project_domain_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_snapshot jsonb;
  new_snapshot jsonb;
  target_company_id bigint;
  target_entity_id bigint;
begin
  if tg_op <> 'INSERT' then
    old_snapshot := to_jsonb(old) - 'source_payload';
    target_company_id := old.company_id;
    target_entity_id := old.id;
  end if;
  if tg_op <> 'DELETE' then
    new_snapshot := to_jsonb(new) - 'source_payload';
    target_company_id := new.company_id;
    target_entity_id := new.id;
  end if;

  if tg_table_name = 'clients' then
    old_snapshot := old_snapshot - array[
      'email',
      'phone',
      'address',
      'contact_name',
      'siret',
      'vat_number',
      'charterer_operation_location',
      'representative_name'
    ]::text[];
    new_snapshot := new_snapshot - array[
      'email',
      'phone',
      'address',
      'contact_name',
      'siret',
      'vat_number',
      'charterer_operation_location',
      'representative_name'
    ]::text[];
  end if;

  insert into public.project_change_log (
    company_id,
    entity_type,
    entity_id,
    action,
    changed_by,
    old_values,
    new_values
  )
  values (
    target_company_id,
    tg_table_name,
    target_entity_id,
    lower(tg_op),
    (select auth.uid()),
    old_snapshot,
    new_snapshot
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.audit_project_domain_change() from public, anon, authenticated;

drop trigger if exists towage_options_touch on public.towage_options;
create trigger towage_options_touch
  before update on public.towage_options
  for each row execute function public.touch_project_domain_row();
drop trigger if exists towage_options_protect_source on public.towage_options;
create trigger towage_options_protect_source
  before update on public.towage_options
  for each row execute function public.protect_project_source_identity();
drop trigger if exists towage_options_audit on public.towage_options;
create trigger towage_options_audit
  after insert or update or delete on public.towage_options
  for each row execute function public.audit_project_domain_change();

revoke all on table public.towage_options from public, anon, authenticated;
grant select on table public.towage_options to authenticated;
alter table public.towage_options enable row level security;

drop policy if exists towage_options_company_read on public.towage_options;
create policy towage_options_company_read on public.towage_options
  for select to authenticated
  using (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_any_role(array['admin', 'direction']))
  );

-- Exact live SharePoint identities, verified on 2026-07-21.
update public.sharepoint_sources
set title = 'BBTM - Projets',
    list_id = '6abf8928-acfd-47ec-a848-29e4071249fc',
    confirmed = true,
    notes = 'Live list and editable fields verified 2026-07-21.',
    updated_at = now()
where key = 'list-bbtm-projets';

update public.sharepoint_sources
set title = 'BBTM - Clients',
    list_id = 'eacbc0c3-1028-44bf-975b-ed50f762943d',
    confirmed = true,
    notes = 'Live client fields verified 2026-07-21. Historic URL keeps a double-space alias.',
    updated_at = now()
where key = 'list-bbtm-clients';

update public.sharepoint_sources
set list_id = '543b9f00-aed2-489a-808a-7b64cc835a83',
    confirmed = true,
    notes = '15 live rows including one empty row; 14 importable vessels.',
    updated_at = now()
where key = 'list-bbtm-flotte';

update public.sharepoint_sources
set title = 'Remorqué',
    list_id = '585151b0-190c-4634-b534-74aac6cd8400',
    confirmed = true,
    notes = 'Lookup target used by CR - 4.Remorqué and CR - 4.Remorque.',
    updated_at = now()
where key = 'list-remorque';

update public.sharepoint_sources
set drive_id = 'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_Ou31l1uVoWRrtjl4GcYGNl',
    list_id = '7559dfae-5ab9-4616-bb63-97819c606365',
    confirmed = true,
    notes = 'Live library verified empty on 2026-07-21.',
    updated_at = now()
where key = 'library-documents-projets';

update public.sharepoint_sources
set drive_id = 'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_OWUUcnVo9hTIk_y0nRfdyl',
    list_id = '27475196-8f56-4c61-893f-cb49d17ddca5',
    confirmed = true,
    notes = 'Live library verified with 16 files on 2026-07-21.',
    updated_at = now()
where key = 'library-documents-contractuels';

update public.sharepoint_import_steps
set target_tables = array[
      'purchase_requests',
      'action_items',
      'clients',
      'towage_options',
      'projects',
      'project_contracts',
      'project_documents',
      'contract_documents'
    ],
    updated_at = now()
where key = 'operations';

insert into public.sharepoint_field_mappings (
  source_key,
  field_label,
  internal_name,
  data_type,
  target_table,
  target_column,
  required,
  notes
)
values
  ('list-bbtm-clients', 'Numéro de client', 'Num_x00e9_rodeClient', 'Text', 'clients', 'code', false, null),
  ('list-bbtm-clients', 'E-mail', 'e_x002d_mail', 'Text', 'clients', 'email', false, null),
  ('list-bbtm-clients', 'Adresse postale', 'AdressePostale', 'Note', 'clients', 'address', false, null),
  ('list-bbtm-clients', 'Client final', 'ClientFinal', 'Text', 'clients', 'final_customer', false, null),
  ('list-bbtm-clients', 'Intermédiaire / Broker ?', 'Interm_x00e9_diaire_x003f_', 'Boolean', 'clients', 'is_broker', false, null),
  ('list-bbtm-clients', 'Contact', 'Contact', 'Text', 'clients', 'contact_name', false, null),
  ('list-bbtm-clients', 'SIRET', 'SIRET', 'Text', 'clients', 'siret', false, null),
  ('list-bbtm-clients', 'TVA intracommunautaire', 'TVAIntracommunautaire', 'Text', 'clients', 'vat_number', false, null),
  ('list-bbtm-clients', 'Affréteur - lieu des opérations', '_x0033_Affr_x00e9_teur_x002d_lie', 'Note', 'clients', 'charterer_operation_location', false, null),
  ('list-bbtm-clients', 'Représentant', 'Repr_x00e9_sentant', 'Text', 'clients', 'representative_name', false, null),
  ('list-remorque', 'Nom', 'Title', 'Text', 'towage_options', 'name', true, null),
  ('list-remorque', 'Remorqué', 'Remorqu_x00e9_', 'Note', 'towage_options', 'description', false, null),
  ('list-bbtm-projets', 'Affréteur SharePoint ID', '_x0033__x002e_Affr_x00e9_teurId', 'Lookup', 'projects', 'client_sharepoint_item_id', false, null),
  ('list-bbtm-projets', 'Date livraison', 'DateD_x00e9_butContrat', 'DateTime', 'projects', 'delivery_at', false, null),
  ('list-bbtm-projets', 'Port de livraison', 'D_x00e9_butContrat_x002d_Lieuarr', 'Text', 'projects', 'delivery_port', false, null),
  ('list-bbtm-projets', 'Date fin affrètement', 'Dated_x00e9_mobilisation', 'DateTime', 'projects', 'redelivery_at', false, null),
  ('list-bbtm-projets', 'Port de restitution', 'LieuD_x00e9_mobilisation', 'Text', 'projects', 'redelivery_port', false, null),
  ('list-bbtm-projets', 'Début affrètement', '_x0039__x002e_1Dated_x00e9_butAf', 'DateTime', 'projects', 'charter_starts_at', false, null),
  ('list-bbtm-projets', 'Type de contrat', 'Contrat', 'Choice', 'projects', 'contract_type', false, null),
  ('list-bbtm-projets', 'Zone d’opération', '_x0031_6_x002e_Zonedop_x00e9_rat', 'Note', 'projects', 'operation_area', false, null),
  ('library-documents-contractuels', 'Projet', 'Title', 'Text', 'contract_documents', 'project_title', false, 'Project code and title are parsed from this live library field.')
on conflict (source_key, internal_name, target_table, target_column) do update
set field_label = excluded.field_label,
    data_type = excluded.data_type,
    required = excluded.required,
    notes = excluded.notes,
    updated_at = now();

create or replace function public.parse_sharepoint_numeric(value text)
returns numeric
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when nullif(trim(value), '') ~ '^[0-9]+([.,][0-9]+)?$'
      then replace(trim(value), ',', '.')::numeric
    else null
  end;
$$;

comment on function public.parse_sharepoint_numeric(text) is
  'Returns a non-negative numeric only for simple SharePoint numeric text; invalid or descriptive values remain null.';
revoke all on function public.parse_sharepoint_numeric(text) from public, anon, authenticated;

create or replace function public.resolve_sharepoint_project_links()
returns table (
  target_table text,
  resolved_clients integer,
  resolved_vessels integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  resolved_project_clients integer := 0;
  resolved_primary_vessels integer := 0;
  resolved_secondary_vessels integer := 0;
  is_service boolean := (select auth.role()) = 'service_role';
  is_database_session boolean := session_user in ('postgres', 'supabase_admin') and (select auth.role()) is null;
  active_company_id bigint := public.current_planning_company_id();
begin
  if not is_service and not is_database_session and (
    not (select public.user_belongs_to_company(active_company_id))
    or not (select public.has_role('admin'))
  ) then
    raise exception 'Project reconciliation requires service_role or admin' using errcode = '42501';
  end if;

  update public.projects project
  set client_id = client.id,
      client_name = client.name,
      updated_at = now()
  from public.clients client
  where client.company_id = project.company_id
    and (is_service or is_database_session or project.company_id = active_company_id)
    and (
      (
        project.client_sharepoint_item_id is not null
        and client.sharepoint_item_id = project.client_sharepoint_item_id
      )
      or (
        public.normalize_import_label(project.client_name) is not null
        and public.normalize_import_label(project.client_name) in (
          public.normalize_import_label(client.name),
          public.normalize_import_label(client.code)
        )
      )
    )
    and (project.client_id is distinct from client.id or project.client_name is distinct from client.name);
  get diagnostics resolved_project_clients = row_count;

  update public.projects project
  set primary_vessel_id = vessel.id,
      primary_vessel_name = vessel.name,
      updated_at = now()
  from public.vessels vessel
  where vessel.company_id = project.company_id
    and (is_service or is_database_session or project.company_id = active_company_id)
    and (
      (
        project.primary_vessel_sharepoint_item_id is not null
        and vessel.sharepoint_item_id = project.primary_vessel_sharepoint_item_id
      )
      or (
        public.normalize_import_label(project.primary_vessel_name) is not null
        and public.normalize_import_label(project.primary_vessel_name) in (
          public.normalize_import_label(vessel.name),
          public.normalize_import_label(vessel.acronym)
        )
      )
    )
    and (
      project.primary_vessel_id is distinct from vessel.id
      or project.primary_vessel_name is distinct from vessel.name
    );
  get diagnostics resolved_primary_vessels = row_count;

  update public.projects project
  set secondary_vessel_id = vessel.id,
      secondary_vessel_name = vessel.name,
      updated_at = now()
  from public.vessels vessel
  where vessel.company_id = project.company_id
    and (is_service or is_database_session or project.company_id = active_company_id)
    and (
      (
        project.secondary_vessel_sharepoint_item_id is not null
        and vessel.sharepoint_item_id = project.secondary_vessel_sharepoint_item_id
      )
      or (
        public.normalize_import_label(project.secondary_vessel_name) is not null
        and public.normalize_import_label(project.secondary_vessel_name) in (
          public.normalize_import_label(vessel.name),
          public.normalize_import_label(vessel.acronym)
        )
      )
    )
    and (
      project.secondary_vessel_id is distinct from vessel.id
      or project.secondary_vessel_name is distinct from vessel.name
    );
  get diagnostics resolved_secondary_vessels = row_count;

  return query values (
    'projects',
    resolved_project_clients,
    resolved_primary_vessels + resolved_secondary_vessels
  );
end;
$$;

revoke all on function public.resolve_sharepoint_project_links() from public, anon, authenticated;
grant execute on function public.resolve_sharepoint_project_links() to authenticated, service_role;

create or replace function public.sync_sharepoint_project_contracts()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  synced_rows integer := 0;
  is_service boolean := (select auth.role()) = 'service_role';
  is_database_session boolean := session_user in ('postgres', 'supabase_admin') and (select auth.role()) is null;
  active_company_id bigint := public.current_planning_company_id();
begin
  if not is_service and not is_database_session and (
    not (select public.user_belongs_to_company(active_company_id))
    or not (select public.has_role('admin'))
  ) then
    raise exception 'Project contract reconciliation requires service_role or admin' using errcode = '42501';
  end if;

  insert into public.project_contracts (
    company_id,
    project_id,
    owner_identity,
    vessel_assignment_limit,
    extension_count,
    extension_duration,
    extension_unit,
    auto_extension_period,
    max_extension_days,
    mobilisation_fee,
    demobilisation_fee,
    fee_currency,
    charter_hire,
    hire_currency,
    hire_unit,
    max_audit_period,
    supplytime_data,
    source_label,
    sharepoint_site_url,
    sharepoint_list_id,
    sharepoint_list_title,
    sharepoint_item_id,
    sharepoint_unique_id,
    source_modified_at,
    source_payload
  )
  select
    project.company_id,
    project.id,
    nullif(project.source_payload ->> '_x0032__x002e_Armateuretlieudeso', ''),
    nullif(project.source_payload ->> '_x0031_7_x002e_Affectationdunavi', ''),
    case
      when public.parse_sharepoint_numeric(project.source_payload ->> '_x0031_0_x002e_1_x002e_1nombrede') > 0
        and public.parse_sharepoint_numeric(project.source_payload ->> '_x0031_0_x002e_1_x002e_2dur_x00e') > 0
        and nullif(project.source_payload ->> '_x0031_0_x002e_1_x002e_3unit_x00', '') is not null
      then public.parse_sharepoint_numeric(project.source_payload ->> '_x0031_0_x002e_1_x002e_1nombrede')::integer
      else null
    end,
    case
      when public.parse_sharepoint_numeric(project.source_payload ->> '_x0031_0_x002e_1_x002e_1nombrede') > 0
        and public.parse_sharepoint_numeric(project.source_payload ->> '_x0031_0_x002e_1_x002e_2dur_x00e') > 0
        and nullif(project.source_payload ->> '_x0031_0_x002e_1_x002e_3unit_x00', '') is not null
      then public.parse_sharepoint_numeric(project.source_payload ->> '_x0031_0_x002e_1_x002e_2dur_x00e')
      else null
    end,
    case
      when public.parse_sharepoint_numeric(project.source_payload ->> '_x0031_0_x002e_1_x002e_1nombrede') > 0
        and public.parse_sharepoint_numeric(project.source_payload ->> '_x0031_0_x002e_1_x002e_2dur_x00e') > 0
        and nullif(project.source_payload ->> '_x0031_0_x002e_1_x002e_3unit_x00', '') is not null
      then nullif(project.source_payload ->> '_x0031_0_x002e_1_x002e_3unit_x00', '')
      else null
    end,
    coalesce(nullif(project.source_payload ->> '_x0031_1_x002e_1P_x00e9_riodedex', ''), 'Voyage'),
    public.parse_sharepoint_numeric(project.source_payload ->> '_x0031_1_x002e_2Dur_x00e9_emaxim')::integer,
    public.parse_sharepoint_numeric(project.source_payload ->> 'ForfaitMobilisation'),
    public.parse_sharepoint_numeric(project.source_payload ->> 'ForfaitD_x00e9_mobilisation'),
    case
      when public.parse_sharepoint_numeric(project.source_payload ->> 'ForfaitMobilisation') is not null
        or public.parse_sharepoint_numeric(project.source_payload ->> 'ForfaitD_x00e9_mobilisation') is not null
      then 'EUR'
      else null
    end,
    public.parse_sharepoint_numeric(project.source_payload ->> 'Loyerjournalier'),
    case when public.parse_sharepoint_numeric(project.source_payload ->> 'Loyerjournalier') is not null then 'EUR' else null end,
    nullif(project.source_payload ->> '_x0031_3_x002e_LoyerAffr_x00e8_t', ''),
    nullif(project.source_payload ->> '_x0032_6_x002e_P_x00e9_riodemaxi', ''),
    jsonb_strip_nulls(jsonb_build_object(
      'box05_cancelling_date', nullif(project.source_payload ->> '_x0036__x002e_DateetHeuredAnnula', ''),
      'box08_notice_delivery', nullif(project.source_payload ->> '_x0038__x002e_2Nbdejoursdepr_x00', ''),
      'box13_early_termination', nullif(concat_ws(E'\n',
        nullif(project.source_payload ->> '_x0031_3_x002e_1R_x00e9_siliatio', ''),
        nullif(project.source_payload ->> '_x0031_3_x002e_2R_x00e9_siliatio', '')
      ), ''),
      'box14_bunker_delivery', nullif(project.source_payload ->> '_x0031_9_x002e_1Quantit_x00e9_de', ''),
      'box19_special_fuel', nullif(project.source_payload ->> '_x0031_9_x002e_4Sp_x00e9_cificat', ''),
      'box20_charter_hire', nullif(project.source_payload ->> '_x0032_0_x002e_Loyerdaffr_x00e8_', ''),
      'box21_extension_hire', nullif(project.source_payload ->> '_x0032_1_x002e_Loyerd_x2019_affr', ''),
      'box22_invoice_remittance', nullif(concat_ws(E'\n',
        nullif(project.source_payload ->> '_x0032_2_x002e_1Facturationdavan', ''),
        nullif(project.source_payload ->> '_x0032_2_x002e_2Parquielledoit_x', ''),
        nullif(project.source_payload ->> '_x0032_2_x002e_3Aquilafacturedoi', '')
      ), ''),
      'box23_payment', nullif(project.source_payload ->> '_x0032_3_x002e_Paiements', ''),
      'box24_account_group', nullif(project.source_payload ->> '_x0032_4_x002e_Paiementduloyeret', ''),
      'box25_internal_price', nullif(project.source_payload ->> '_x0032_5_x002e_Tauxd_x2019_int_x', ''),
      'box30_cancellation_clause', nullif(project.source_payload ->> '_x0033_0_x002e_Annulationpourcau', ''),
      'box31_taxes', nullif(project.source_payload ->> '_x0033_1_x002e_Taxes', ''),
      'box33_dispute_resolution', nullif(project.source_payload ->> '_x0033_3_x002e_R_x00e8_glementde', ''),
      'box34_additional_clauses', nullif(project.source_payload ->> '_x0033_4_x002e_Nombredeclausessu', '')
    )),
    'sharepoint',
    project.sharepoint_site_url,
    project.sharepoint_list_id,
    project.sharepoint_list_title,
    project.sharepoint_item_id,
    project.sharepoint_unique_id,
    project.source_modified_at,
    project.source_payload
  from public.projects project
  where lower(trim(project.source_label)) = 'sharepoint'
    and (is_service or is_database_session or project.company_id = active_company_id)
    and (
      project.contract_type is not null
      or project.source_payload ? 'Loyerjournalier'
      or project.source_payload ? 'ForfaitMobilisation'
      or project.source_payload ? '_x0032__x002e_Armateuretlieudeso'
    )
  on conflict (project_id, company_id) do update
  set owner_identity = excluded.owner_identity,
      vessel_assignment_limit = excluded.vessel_assignment_limit,
      extension_count = excluded.extension_count,
      extension_duration = excluded.extension_duration,
      extension_unit = excluded.extension_unit,
      auto_extension_period = excluded.auto_extension_period,
      max_extension_days = excluded.max_extension_days,
      mobilisation_fee = excluded.mobilisation_fee,
      demobilisation_fee = excluded.demobilisation_fee,
      fee_currency = excluded.fee_currency,
      charter_hire = excluded.charter_hire,
      hire_currency = excluded.hire_currency,
      hire_unit = excluded.hire_unit,
      max_audit_period = excluded.max_audit_period,
      supplytime_data = excluded.supplytime_data,
      source_label = excluded.source_label,
      sharepoint_site_url = excluded.sharepoint_site_url,
      sharepoint_list_id = excluded.sharepoint_list_id,
      sharepoint_list_title = excluded.sharepoint_list_title,
      sharepoint_item_id = excluded.sharepoint_item_id,
      sharepoint_unique_id = excluded.sharepoint_unique_id,
      source_modified_at = excluded.source_modified_at,
      source_payload = excluded.source_payload,
      updated_at = now();

  get diagnostics synced_rows = row_count;

  insert into public.project_number_counters (company_id, prefix, next_number)
  select
    project.company_id,
    'P',
    max(substring(project.project_code from 2)::integer) + 1
  from public.projects project
  where project.project_code ~ '^P[0-9]+$'
    and lower(trim(project.source_label)) = 'sharepoint'
    and (is_service or is_database_session or project.company_id = active_company_id)
  group by project.company_id
  on conflict (company_id, prefix) do update
  set next_number = greatest(public.project_number_counters.next_number, excluded.next_number),
      updated_at = now();

  return synced_rows;
end;
$$;

comment on function public.sync_sharepoint_project_contracts() is
  'Upserts the typed one-to-one contract model from immutable SharePoint project payloads and raises the P-number floor.';
revoke all on function public.sync_sharepoint_project_contracts() from public, anon, authenticated;
grant execute on function public.sync_sharepoint_project_contracts() to authenticated, service_role;

create or replace function public.resolve_sharepoint_project_document_links()
returns table (
  target_table text,
  resolved_documents integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  resolved_project_documents integer := 0;
  resolved_contract_documents integer := 0;
  is_service boolean := (select auth.role()) = 'service_role';
  is_database_session boolean := session_user in ('postgres', 'supabase_admin') and (select auth.role()) is null;
  active_company_id bigint := public.current_planning_company_id();
begin
  if not is_service and not is_database_session and (
    not (select public.user_belongs_to_company(active_company_id))
    or not (select public.has_role('admin'))
  ) then
    raise exception 'Document reconciliation requires service_role or admin' using errcode = '42501';
  end if;

  update public.project_documents document
  set project_id = project.id,
      updated_at = now()
  from public.projects project
  where project.company_id = document.company_id
    and (is_service or is_database_session or document.company_id = active_company_id)
    and (
      (document.project_sharepoint_item_id is not null and project.sharepoint_item_id = document.project_sharepoint_item_id)
      or (
        public.normalize_import_label(document.project_code) is not null
        and public.normalize_import_label(document.project_code) = public.normalize_import_label(project.project_code)
      )
      or (
        public.normalize_import_label(document.project_title) is not null
        and public.normalize_import_label(document.project_title) = public.normalize_import_label(project.title)
      )
    )
    and document.project_id is distinct from project.id;
  get diagnostics resolved_project_documents = row_count;

  update public.contract_documents document
  set project_id = project.id,
      updated_at = now()
  from public.projects project
  where project.company_id = document.company_id
    and (is_service or is_database_session or document.company_id = active_company_id)
    and (
      (document.project_sharepoint_item_id is not null and project.sharepoint_item_id = document.project_sharepoint_item_id)
      or (
        public.normalize_import_label(document.project_code) is not null
        and public.normalize_import_label(document.project_code) = public.normalize_import_label(project.project_code)
      )
      or (
        public.normalize_import_label(document.project_title) is not null
        and public.normalize_import_label(document.project_title) = public.normalize_import_label(project.title)
      )
    )
    and document.project_id is distinct from project.id;
  get diagnostics resolved_contract_documents = row_count;

  return query values
    ('project_documents', resolved_project_documents),
    ('contract_documents', resolved_contract_documents);
end;
$$;

revoke all on function public.resolve_sharepoint_project_document_links() from public, anon, authenticated;
grant execute on function public.resolve_sharepoint_project_document_links() to authenticated, service_role;
