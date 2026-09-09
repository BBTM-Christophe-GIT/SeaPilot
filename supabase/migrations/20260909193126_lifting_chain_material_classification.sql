-- The imported generic sling category includes a chain sling; use the chain checklist for it.
-- No signed report or historical snapshot is rewritten.
update public.lifting_inventory set material_type='Chaînes',updated_at=clock_timestamp()
where kind='lifting' and material_type='Élingues / Sangles textiles'
  and upper(description) like 'ELINGUE CHAINE%';

-- The counter is only reachable through the inventory RPC, including for signed-in clients.
create policy lifting_counters_deny_direct_access on public.lifting_inventory_counters
  for all to authenticated using(false) with check(false);

-- Draft snapshots keep their own equipment details, but adopt the corrected checklist before capture.
with corrected as (
  select e.id,e.inspection_id from public.lifting_inspection_entries e
  join public.lifting_inspections r on r.id=e.inspection_id
  where r.status='draft' and e.item_snapshot->>'material_type'='Élingues / Sangles textiles'
    and upper(e.item_snapshot->>'description') like 'ELINGUE CHAINE%'
), updated as (
  update public.lifting_inspection_entries e set
    item_snapshot=jsonb_set(e.item_snapshot,'{material_type}','"Chaînes"'),
    checks=public.lifting_default_checks(jsonb_set(e.item_snapshot,'{material_type}','"Chaînes"')),
    condition='pending',updated_at=clock_timestamp()
  from corrected c where c.id=e.id returning e.inspection_id
)
update public.lifting_inspections set revision=revision+1,updated_at=clock_timestamp()
where id in(select inspection_id from updated);
