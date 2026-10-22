-- Optional vessel reference data: unknown measurements stay NULL. Existing
-- vessel RLS continues to govern reads/writes; signed declarations are untouched.
alter table public.vessels
  add column draft_m numeric;

alter table public.vessels
  add constraint vessels_draft_m_check
  check (draft_m is null or (draft_m > 0 and draft_m <= 50));

comment on column public.vessels.draft_m is
  'Vessel draught in metres, greater than zero and at most 50; NULL when unknown.';

create or replace function sea_operation_private.overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare company bigint := sea_operation_private.company_id();
begin
  if not coalesce(sea_operation_private.can_read(company),false) then raise exception 'Accès refusé aux opérations en mer.' using errcode = '42501'; end if;
  return jsonb_build_object('company_id',company,'actor_id',(select auth.uid()),'actor_name',sea_operation_private.actor_name(company),
    'records',coalesce((select jsonb_agg(sea_operation_private.record_json(record) order by record.updated_at desc,record.id)
      from public.sea_operations record where record.company_id = company),'[]'::jsonb),
    'vessels',coalesce((select jsonb_agg(jsonb_build_object('id',vessel.id,'name',vessel.name,
      'registration_imo',concat_ws(' / ',nullif(vessel.registration_number,''),nullif(vessel.imo_number,'')),
      'length_overall',vessel.length_overall,'draft_m',vessel.draft_m,'can_sign',sea_operation_private.can_sign_vessel(company,vessel.id)) order by vessel.name)
      from public.vessels vessel where vessel.company_id = company and vessel.active and vessel.asset_kind = 'vessel'),'[]'::jsonb));
end;
$$;

notify pgrst, 'reload schema';
