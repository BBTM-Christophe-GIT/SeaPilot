-- Capture the Navires reference used by the UKC display. Signed forms retain
-- their saved value; older signed forms without a capture remain untouched.
create function sea_operation_private.capture_vessel_draft() returns trigger
language plpgsql set search_path = '' as $$
declare canonical numeric;
begin
  -- Administrative revision creates an exact historical clone first. Its next
  -- ordinary save refreshes the reference through the same canonical path.
  if tg_op = 'INSERT' and sea_operation_private.is_admin_revision_clone(new) then return new; end if;
  if new.status <> 'draft' then return new; end if;
  if new.vessel_id is null then
    new.draft := new.draft #- '{vessel,draftMeters}';
  else
    select vessel.draft_m into canonical from public.vessels vessel
      where vessel.id = new.vessel_id and vessel.company_id = new.company_id
        and vessel.active and vessel.asset_kind = 'vessel';
    if not found then raise exception 'Navire inaccessible.' using errcode = '42501'; end if;
    new.draft := jsonb_set(new.draft,'{vessel,draftMeters}',coalesce(to_jsonb(canonical),'null'::jsonb));
  end if;
  return new;
end;
$$;
revoke all on function sea_operation_private.capture_vessel_draft() from public,anon,authenticated;
create trigger sea_operations_vessel_draft before insert or update of draft on public.sea_operations
  for each row execute function sea_operation_private.capture_vessel_draft();
comment on function sea_operation_private.capture_vessel_draft() is
  'Canonical Navires draft_m snapshot for user-defined UKC display bands. No automatic navigation decision; no historical backfill.';

notify pgrst, 'reload schema';
