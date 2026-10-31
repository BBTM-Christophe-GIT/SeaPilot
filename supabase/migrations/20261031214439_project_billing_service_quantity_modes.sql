-- Additive configuration only: existing quantities, prices, references and RLS
-- remain unchanged. NULL mode/default quantity preserve historical proposals.
create function public.project_service_operation_types_valid(target_types text[])
returns boolean
language sql immutable parallel safe security invoker
set search_path = ''
as $$
  select target_types is not null
    and cardinality(target_types) <= 50
    and coalesce(array_ndims(target_types), 1) = 1
    and not exists (
      select 1 from unnest(target_types) item
      where item is null or item <> btrim(item) or char_length(item) not between 1 and 120
    );
$$;
revoke all on function public.project_service_operation_types_valid(text[]) from public, anon;
grant execute on function public.project_service_operation_types_valid(text[]) to authenticated, service_role;

alter table public.project_service_catalog
  add column quantity_mode text,
  add column quantity_operation_types text[] not null default '{}'::text[],
  add column default_quantity numeric(14, 3),
  add column client_reference text not null default '',
  add constraint project_service_catalog_quantity_mode_check
    check (quantity_mode is null or quantity_mode in ('manual', 'period', 'month', 'operations')),
  add constraint project_service_catalog_operation_types_check
    check (public.project_service_operation_types_valid(quantity_operation_types)),
  add constraint project_service_catalog_operations_selection_check
    check (quantity_mode is distinct from 'operations' or cardinality(quantity_operation_types) > 0),
  add constraint project_service_catalog_default_quantity_check
    check (default_quantity is null or (default_quantity >= 0 and default_quantity < 100000000000)),
  add constraint project_service_catalog_client_reference_check
    check (client_reference = btrim(client_reference) and char_length(client_reference) <= 200);

alter table public.project_billing_services
  add column quantity_mode text,
  add column quantity_operation_types text[] not null default '{}'::text[],
  add column client_reference text not null default '',
  add constraint project_billing_services_quantity_mode_check
    check (quantity_mode is null or quantity_mode in ('manual', 'period', 'month', 'operations')),
  add constraint project_billing_services_operation_types_check
    check (public.project_service_operation_types_valid(quantity_operation_types)),
  add constraint project_billing_services_operations_selection_check
    check (quantity_mode is distinct from 'operations' or cardinality(quantity_operation_types) > 0),
  add constraint project_billing_services_client_reference_check
    check (client_reference = btrim(client_reference) and char_length(client_reference) <= 200);

comment on column public.project_service_catalog.quantity_mode is
  'Default calculation copied onto a newly billed service. NULL preserves existing project proposals.';
comment on column public.project_service_catalog.default_quantity is
  'Default manual quantity copied onto a newly billed service. NULL preserves existing proposals; zero is valid.';
comment on column public.project_service_catalog.quantity_operation_types is
  'Selected DPR operation labels for the operations quantity mode; comparisons use case/whitespace normalization.';
comment on column public.project_service_catalog.client_reference is
  'Default client reference copied onto a newly billed service.';
comment on column public.project_billing_services.quantity_mode is
  'Saved quantity configuration for this billed service. NULL retains the historical project calculation.';
comment on column public.project_billing_services.quantity_operation_types is
  'Snapshot of selected DPR operation types. Counts distinct real vessel/day pairs in the selected export range.';
comment on column public.project_billing_services.client_reference is
  'Client reference saved on this billed service; later catalog changes never overwrite it.';

notify pgrst, 'reload schema';
