-- Planning project status cleanup, explicit cancellation state, P144 reconciliation,
-- monthly billing, chargeable expenses and private project-file storage.

alter table public.planning_projects
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id) on delete set null,
  add column if not exists cancellation_reason text;

update public.planning_projects
set
  cancelled_at = coalesce(cancelled_at, updated_at, now()),
  cancellation_reason = coalesce(cancellation_reason, 'Reprise de l’ancien statut Annulé')
where lower(btrim(coalesce(status, ''))) in ('annule', 'annulé');

update public.planning_projects
set status = case
  when lower(btrim(coalesce(status, ''))) in (
    '', 'a planifier', 'à planifier', 'offre transmise', 'contrat signe', 'contrat signé',
    'annule', 'annulé'
  ) then 'Non validé'
  when lower(btrim(status)) in (
    'confirme', 'confirmé', 'en cours', 'valide', 'validé', 'termine', 'terminé'
  ) then 'Validé'
  when lower(btrim(status)) in (
    'stand-by meteo', 'stand-by météo', 'standby meteo', 'standby météo'
  ) then 'Stand-by météo'
  when lower(btrim(status)) in ('facture', 'facturé', 'a facturer', 'à facturer') then 'Facturé'
  else 'Non validé'
end;

update public.projects
set status = case
  when lower(btrim(coalesce(status, ''))) in (
    '', 'a planifier', 'à planifier', 'offre transmise', 'contrat signe', 'contrat signé'
  ) then 'Non validé'
  when lower(btrim(status)) in (
    'confirme', 'confirmé', 'en cours', 'valide', 'validé', 'termine', 'terminé'
  ) then 'Validé'
  when lower(btrim(status)) in (
    'stand-by meteo', 'stand-by météo', 'standby meteo', 'standby météo'
  ) then 'Stand-by météo'
  when lower(btrim(status)) in ('facture', 'facturé', 'a facturer', 'à facturer') then 'Facturé'
  else 'Non validé'
end;

alter table public.planning_projects
  alter column status set default 'Non validé',
  alter column status set not null;

alter table public.projects
  alter column status set default 'Non validé',
  alter column status set not null;

alter table public.planning_projects
  drop constraint if exists planning_projects_status_check;
alter table public.planning_projects
  add constraint planning_projects_status_check
  check (status in ('Non validé', 'Validé', 'Stand-by météo', 'Facturé'));

alter table public.projects
  drop constraint if exists projects_status_check;
alter table public.projects
  add constraint projects_status_check
  check (status in ('Non validé', 'Validé', 'Stand-by météo', 'Facturé'));

create or replace function public.canonical_project_status(raw_status text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when lower(btrim(coalesce(raw_status, ''))) in (
      '', 'a planifier', 'à planifier', 'offre transmise', 'contrat signe', 'contrat signé',
      'annule', 'annulé'
    ) then 'Non validé'
    when lower(btrim(raw_status)) in (
      'confirme', 'confirmé', 'en cours', 'valide', 'validé', 'termine', 'terminé'
    ) then 'Validé'
    when lower(btrim(raw_status)) in (
      'stand-by meteo', 'stand-by météo', 'standby meteo', 'standby météo'
    ) then 'Stand-by météo'
    when lower(btrim(raw_status)) in ('facture', 'facturé', 'a facturer', 'à facturer') then 'Facturé'
    else 'Non validé'
  end;
$$;

create or replace function public.canonicalize_project_status_trigger()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.status := public.canonical_project_status(new.status);
  return new;
end;
$$;

drop trigger if exists projects_canonical_status on public.projects;
create trigger projects_canonical_status
before insert or update of status on public.projects
for each row execute function public.canonicalize_project_status_trigger();

drop trigger if exists planning_projects_canonical_status on public.planning_projects;
create trigger planning_projects_canonical_status
before insert or update of status on public.planning_projects
for each row execute function public.canonicalize_project_status_trigger();

revoke all on function public.canonical_project_status(text) from public, anon;
grant execute on function public.canonical_project_status(text) to authenticated;

-- P144 had one historical SharePoint occurrence (#13) and one later catalogue copy
-- (#39) on GOURY. Keep the historical identity and its SharePoint trace, attach it
-- to the catalogue contract, copy the operation hire snapshot and remove only the
-- guarded duplicate.
do $$
declare
  p144_project_id bigint;
  keeper_id bigint;
  duplicate_id bigint;
begin
  select project.id
  into p144_project_id
  from public.projects project
  where project.company_id = 1
    and upper(btrim(project.project_code)) = 'P144'
    and project.archived_at is null
  order by project.id
  limit 1;

  select occurrence.id
  into keeper_id
  from public.planning_projects occurrence
  where occurrence.company_id = 1
    and occurrence.catalog_project_id is null
    and upper(btrim(occurrence.title)) = 'P144 - GUARD VESSEL EMDT'
    and upper(btrim(occurrence.primary_vessel_name)) = 'GOURY'
    and occurrence.sharepoint_item_id = '20'
  order by occurrence.id
  limit 1;

  select occurrence.id
  into duplicate_id
  from public.planning_projects occurrence
  where occurrence.company_id = 1
    and occurrence.catalog_project_id = p144_project_id
    and upper(btrim(occurrence.title)) = 'P144 - GUARD VESSEL EMDT'
    and upper(btrim(occurrence.primary_vessel_name)) = 'GOURY'
    and occurrence.sharepoint_item_id is null
    and occurrence.starts_on = date '2024-06-01'
    and occurrence.ends_on between date '2026-08-30' and date '2026-08-31'
  order by occurrence.id
  limit 1;

  if p144_project_id is not null and keeper_id is not null then
    update public.planning_projects occurrence
    set
      catalog_project_id = p144_project_id,
      charter_hire = coalesce(
        occurrence.charter_hire,
        (select contract.charter_hire
         from public.project_contracts contract
         where contract.project_id = p144_project_id
           and contract.company_id = occurrence.company_id
           and contract.archived_at is null
         order by contract.id desc
         limit 1)
      ),
      hire_currency = coalesce(
        nullif(btrim(occurrence.hire_currency), ''),
        (select contract.hire_currency
         from public.project_contracts contract
         where contract.project_id = p144_project_id
           and contract.company_id = occurrence.company_id
           and contract.archived_at is null
         order by contract.id desc
         limit 1)
      ),
      hire_unit = coalesce(
        nullif(btrim(occurrence.hire_unit), ''),
        (select contract.hire_unit
         from public.project_contracts contract
         where contract.project_id = p144_project_id
           and contract.company_id = occurrence.company_id
           and contract.archived_at is null
         order by contract.id desc
         limit 1)
      ),
      updated_at = now()
    where occurrence.id = keeper_id;
  end if;

  if keeper_id is not null and duplicate_id is not null and keeper_id <> duplicate_id then
    update public.project_generated_documents
    set planning_occurrence_id = keeper_id
    where planning_occurrence_id = duplicate_id;

    delete from public.planning_projects
    where id = duplicate_id
      and company_id = 1
      and catalog_project_id = p144_project_id
      and sharepoint_item_id is null;
  end if;
end;
$$;

create table if not exists public.project_billing_periods (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete restrict,
  project_id bigint not null,
  period_month date not null,
  client_reference text,
  invoice_number text,
  invoice_issued_on date,
  invoice_sent_on date,
  payment_due_on date,
  paid_on date,
  amount_ht numeric(14, 2) not null default 0,
  comments text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_billing_periods_project_company_fkey
    foreign key (project_id, company_id)
    references public.projects(id, company_id)
    on delete cascade,
  constraint project_billing_periods_month_start_check
    check (period_month = date_trunc('month', period_month)::date),
  constraint project_billing_periods_amount_check check (amount_ht >= 0),
  constraint project_billing_periods_dates_check check (
    (invoice_sent_on is null or invoice_issued_on is null or invoice_sent_on >= invoice_issued_on)
    and (payment_due_on is null or invoice_issued_on is null or payment_due_on >= invoice_issued_on)
    and (paid_on is null or invoice_issued_on is null or paid_on >= invoice_issued_on)
  ),
  constraint project_billing_periods_project_month_key
    unique (company_id, project_id, period_month),
  constraint project_billing_periods_identity_company_project_key
    unique (id, company_id, project_id)
);

create table if not exists public.project_chargeable_expenses (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete restrict,
  project_id bigint not null,
  billing_period_id bigint not null,
  category text not null,
  nature text,
  supplier text not null,
  invoice_date date not null,
  invoice_number text,
  amount_ht numeric(14, 2) not null,
  amount_ttc numeric(14, 2),
  currency text not null default 'EUR',
  quantity numeric(14, 3),
  unit text,
  comments text,
  chargeable boolean not null default true,
  included_in_client_invoice boolean not null default false,
  dpr_report_id bigint references public.dpr_reports(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_chargeable_expenses_billing_period_fkey
    foreign key (billing_period_id, company_id, project_id)
    references public.project_billing_periods(id, company_id, project_id)
    on delete cascade,
  constraint project_chargeable_expenses_category_check
    check (category in ('fuel', 'port', 'water', 'other')),
  constraint project_chargeable_expenses_other_nature_check
    check (category <> 'other' or nullif(btrim(nature), '') is not null),
  constraint project_chargeable_expenses_amount_check
    check (amount_ht >= 0 and (amount_ttc is null or amount_ttc >= 0)),
  constraint project_chargeable_expenses_currency_check
    check (currency ~ '^[A-Z]{3}$'),
  constraint project_chargeable_expenses_quantity_check
    check (quantity is null or quantity >= 0),
  constraint project_chargeable_expenses_identity_company_project_key
    unique (id, company_id, project_id)
);

create table if not exists public.project_billing_documents (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete restrict,
  project_id bigint not null,
  billing_period_id bigint,
  chargeable_expense_id bigint,
  document_kind text not null,
  bucket_name text not null default 'project-files',
  object_path text not null,
  file_name text not null,
  mime_type text not null,
  file_size_bytes bigint not null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint project_billing_documents_project_company_fkey
    foreign key (project_id, company_id)
    references public.projects(id, company_id)
    on delete cascade,
  constraint project_billing_documents_billing_period_fkey
    foreign key (billing_period_id, company_id, project_id)
    references public.project_billing_periods(id, company_id, project_id)
    on delete cascade,
  constraint project_billing_documents_expense_fkey
    foreign key (chargeable_expense_id, company_id, project_id)
    references public.project_chargeable_expenses(id, company_id, project_id)
    on delete cascade,
  constraint project_billing_documents_kind_check
    check (document_kind in ('client_invoice', 'chargeable_expense', 'export')),
  constraint project_billing_documents_expense_kind_check
    check (
      (document_kind = 'chargeable_expense' and chargeable_expense_id is not null)
      or (document_kind <> 'chargeable_expense' and chargeable_expense_id is null)
    ),
  constraint project_billing_documents_size_check check (file_size_bytes >= 0),
  constraint project_billing_documents_object_key unique (bucket_name, object_path)
);

create index if not exists project_billing_periods_project_month_idx
  on public.project_billing_periods (project_id, period_month desc);
create index if not exists project_chargeable_expenses_period_date_idx
  on public.project_chargeable_expenses (billing_period_id, invoice_date desc);
create index if not exists project_billing_documents_period_idx
  on public.project_billing_documents (billing_period_id, created_at desc);
create index if not exists project_billing_documents_expense_idx
  on public.project_billing_documents (chargeable_expense_id, created_at desc);

alter table public.project_billing_periods enable row level security;
alter table public.project_chargeable_expenses enable row level security;
alter table public.project_billing_documents enable row level security;

drop policy if exists project_billing_periods_company_read on public.project_billing_periods;
create policy project_billing_periods_company_read on public.project_billing_periods
  for select to authenticated
  using (public.user_belongs_to_company(company_id));

drop policy if exists project_billing_periods_manager_write on public.project_billing_periods;
create policy project_billing_periods_manager_write on public.project_billing_periods
  for all to authenticated
  using (
    public.user_belongs_to_company(company_id)
    and public.has_any_role(array['admin', 'direction'])
  )
  with check (
    public.user_belongs_to_company(company_id)
    and public.has_any_role(array['admin', 'direction'])
  );

drop policy if exists project_chargeable_expenses_company_read on public.project_chargeable_expenses;
create policy project_chargeable_expenses_company_read on public.project_chargeable_expenses
  for select to authenticated
  using (public.user_belongs_to_company(company_id));

drop policy if exists project_chargeable_expenses_manager_write on public.project_chargeable_expenses;
create policy project_chargeable_expenses_manager_write on public.project_chargeable_expenses
  for all to authenticated
  using (
    public.user_belongs_to_company(company_id)
    and public.has_any_role(array['admin', 'direction'])
  )
  with check (
    public.user_belongs_to_company(company_id)
    and public.has_any_role(array['admin', 'direction'])
  );

drop policy if exists project_billing_documents_company_read on public.project_billing_documents;
create policy project_billing_documents_company_read on public.project_billing_documents
  for select to authenticated
  using (public.user_belongs_to_company(company_id));

drop policy if exists project_billing_documents_manager_write on public.project_billing_documents;
create policy project_billing_documents_manager_write on public.project_billing_documents
  for all to authenticated
  using (
    public.user_belongs_to_company(company_id)
    and public.has_any_role(array['admin', 'direction'])
  )
  with check (
    public.user_belongs_to_company(company_id)
    and public.has_any_role(array['admin', 'direction'])
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-files',
  'project-files',
  false,
  52428800,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/zip',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists project_files_storage_read on storage.objects;
create policy project_files_storage_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'project-files'
    and exists (
      select 1
      from public.project_billing_documents document
      where document.bucket_name = storage.objects.bucket_id
        and document.object_path = storage.objects.name
        and public.user_belongs_to_company(document.company_id)
    )
  );

drop policy if exists project_files_storage_insert on storage.objects;
create policy project_files_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'project-files'
    and (storage.foldername(name))[1] = 'projects'
    and exists (
      select 1
      from public.projects project
      where project.id = case
        when (storage.foldername(name))[2] ~ '^[0-9]+$'
          then (storage.foldername(name))[2]::bigint
        else null
      end
        and public.user_belongs_to_company(project.company_id)
        and public.has_any_role(array['admin', 'direction'])
    )
  );

drop policy if exists project_files_storage_update on storage.objects;
create policy project_files_storage_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'project-files'
    and exists (
      select 1
      from public.projects project
      where project.id = case
        when (storage.foldername(name))[2] ~ '^[0-9]+$'
          then (storage.foldername(name))[2]::bigint
        else null
      end
        and public.user_belongs_to_company(project.company_id)
        and public.has_any_role(array['admin', 'direction'])
    )
  )
  with check (
    bucket_id = 'project-files'
    and (storage.foldername(name))[1] = 'projects'
    and public.has_any_role(array['admin', 'direction'])
  );

drop policy if exists project_files_storage_delete on storage.objects;
create policy project_files_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'project-files'
    and exists (
      select 1
      from public.project_billing_documents document
      where document.bucket_name = storage.objects.bucket_id
        and document.object_path = storage.objects.name
        and public.user_belongs_to_company(document.company_id)
        and public.has_any_role(array['admin', 'direction'])
    )
  );

comment on table public.project_billing_periods is
  'One client-billing record per project and calendar month. Global project status remains independent.';
comment on table public.project_chargeable_expenses is
  'Chargeable supplier expenses and services linked to one project billing month.';
comment on table public.project_billing_documents is
  'Private Supabase Storage metadata for client invoices, chargeable-expense evidence and generated exports.';
comment on column public.planning_projects.cancelled_at is
  'Independent cancellation state. Cancellation must never be encoded as a project business status.';
