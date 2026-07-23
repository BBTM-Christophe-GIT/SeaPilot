drop policy if exists vessel_visits_storage_insert on storage.objects;
create policy vessel_visits_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'vessel-visits'
    and exists (
      select 1
      from public.vessel_visits visit
      where visit.id = case
        when (storage.foldername(name))[1] ~ '^[0-9]+$'
          then (storage.foldername(name))[1]::bigint
        else null
      end
        and public.planning_user_can('edit_event', visit.company_id, visit.vessel_id, null, null)
    )
  );

drop policy if exists vessel_visits_storage_delete on storage.objects;
create policy vessel_visits_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'vessel-visits'
    and exists (
      select 1
      from public.vessel_visits visit
      where visit.id = case
        when (storage.foldername(name))[1] ~ '^[0-9]+$'
          then (storage.foldername(name))[1]::bigint
        else null
      end
        and public.planning_user_can('edit_event', visit.company_id, visit.vessel_id, null, null)
    )
  );
