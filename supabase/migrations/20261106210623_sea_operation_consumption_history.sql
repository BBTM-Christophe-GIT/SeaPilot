-- Dated readings from legacy vessel workbooks are kept apart from signed mission reports.
-- The production data load is separate, so the original values remain private.
create table sea_operation_private.consumption_history (
  company_id bigint primary key references public.companies(id) on delete cascade,
  data jsonb not null,
  imported_at timestamptz not null default now(),
  constraint consumption_history_shape check (
    jsonb_typeof(data) = 'object'
    and data ?& array['suroit','rozel','rozelGauge']
    and data - array['suroit','rozel','rozelGauge'] = '{}'::jsonb
    and jsonb_typeof(data->'suroit') = 'array'
    and jsonb_typeof(data->'rozel') = 'array'
    and jsonb_typeof(data->'rozelGauge') = 'array'
    and octet_length(data::text) <= 1048576
  )
);
alter table sea_operation_private.consumption_history enable row level security;
revoke all on table sea_operation_private.consumption_history from public, anon, authenticated, service_role;

create function sea_operation_private.consumption_history_export() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  company bigint := sea_operation_private.company_id();
begin
  if not coalesce(sea_operation_private.can_read(company), false) then
    raise exception 'Accès refusé aux opérations en mer.' using errcode = '42501';
  end if;
  return coalesce(
    (select history.data from sea_operation_private.consumption_history history where history.company_id = company),
    '{"suroit":[],"rozel":[],"rozelGauge":[]}'::jsonb
  );
end;
$$;

create function public.sea_operation_consumption_history() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select sea_operation_private.consumption_history_export();
$$;

revoke all on function sea_operation_private.consumption_history_export(), public.sea_operation_consumption_history()
  from public, anon, authenticated, service_role;
grant execute on function sea_operation_private.consumption_history_export(), public.sea_operation_consumption_history()
  to authenticated;

notify pgrst, 'reload schema';
