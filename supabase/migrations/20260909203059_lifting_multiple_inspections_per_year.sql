-- Each inspection is independent, including overlapping validity periods and same-day inspections.
-- Existing reports, snapshots and certificates are preserved.
alter table public.lifting_inspections
  drop constraint lifting_inspections_company_id_vessel_id_kind_inspection_ye_key;

create or replace function public.start_lifting_inspection(p_vessel_id bigint,p_kind text,p_issued_on date,p_expires_on date) returns bigint
language plpgsql security definer set search_path='' as $$
declare v public.vessels%rowtype; result_id bigint;
begin
  select * into v from public.vessels where id=p_vessel_id and active and asset_kind='vessel';
  if auth.uid() is null or v.id is null or not public.lifting_can_access(v.company_id,v.id) then raise exception using errcode='42501',message='Accès refusé à ce navire.'; end if;
  if p_issued_on is null or p_expires_on is null or p_expires_on<=p_issued_on then raise exception 'Dates du contrôle invalides.'; end if;
  if not exists(select 1 from public.lifting_inventory where vessel_id=v.id and kind=p_kind and active) then raise exception 'Ajoutez du matériel avant de démarrer un contrôle.'; end if;
  insert into public.lifting_inspections(company_id,vessel_id,kind,inspection_year,issued_on,expires_on,vessel_snapshot,created_by)
    values(v.company_id,v.id,p_kind,extract(year from p_issued_on),p_issued_on,p_expires_on,
      jsonb_build_object('id',v.id,'company_id',v.company_id,'name',v.name,'acronym',v.acronym,'registration_number',v.registration_number,'call_sign',v.call_sign,'registration_port',v.registration_port),auth.uid()) returning id into result_id;
  insert into public.lifting_inspection_entries(inspection_id,item_id,item_snapshot,checks,checklist_version)
    select result_id,i.id,to_jsonb(i),public.lifting_default_checks(to_jsonb(i)),2 from public.lifting_inventory i
      where i.vessel_id=v.id and i.kind=p_kind and i.active order by i.material_type,i.reference::bigint;
  return result_id;
end $$;
