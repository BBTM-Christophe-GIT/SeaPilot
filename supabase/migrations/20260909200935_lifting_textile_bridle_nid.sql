-- The verifier added identification (NID) to textile towing bridles.
create or replace function public.lifting_control_codes(p_item jsonb) returns text[]
language sql immutable set search_path='' as $$
  select case public.lifting_accessory_code(p_item->>'material_type')
    when 'SH' then array['EG','ID','V1'] when 'HK' then array['EG','ID','V1']
    when 'SL' then array['EG','ID','V1','V2','V3','V4','V5']
    when 'CH' then array['EG','ID','V1','V2'] when 'WI' then array['EG','ID','V1','V2'] when 'PU' then array['EG','ID','V1','V2']
    when 'HC' then array['EG','ID','V1','V2','V3','V4']
    when 'TL' then case p_item->>'towing_type'
      when 'chain_bridle' then array['EG','NID','V1','V2']
      when 'textile_line' then array['EG','NID'] when 'towing_wire' then array['EG','NID'] when 'winch_wire' then array['EG','NID']
      when 'textile_bridle' then array['EG','NID','V1','V2','V3','V4','V5'] else array[]::text[] end
    else array[]::text[] end;
$$;

-- Precheck the new point, but require the verifier to save the item again.
-- Published reports and their recorded results are never changed.
with revised as (
  update public.lifting_inspection_entries e
  set checks=jsonb_set(e.checks,'{NID}','"ok"'),condition='pending',updated_at=clock_timestamp()
  from public.lifting_inspections r
  where r.id=e.inspection_id and r.status='draft' and e.checklist_version=2
    and public.lifting_accessory_code(e.item_snapshot->>'material_type')='TL'
    and e.item_snapshot->>'towing_type'='textile_bridle'
    and coalesce(e.checks->>'NID','na') not in ('ok','defect')
  returning e.inspection_id
)
update public.lifting_inspections set revision=revision+1,updated_at=clock_timestamp()
where id in (select inspection_id from revised);
