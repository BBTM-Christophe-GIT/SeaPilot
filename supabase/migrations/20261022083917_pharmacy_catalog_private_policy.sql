-- Private compatibility aliases are read only through guarded security-definer RPCs.
-- No direct authenticated table access is granted; keep that denial explicit in RLS.
create policy pharmacy_category_legacy_ids_private
  on pharmacy_private.pharmacy_category_legacy_ids for all to authenticated
  using (false) with check (false);
