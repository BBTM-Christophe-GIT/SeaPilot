-- Draft deletion uses the same row lock as edits/publication and never touches inventory or certificates.
create function public.delete_lifting_inspection_draft(p_id bigint, p_revision integer)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.lifting_inspections%rowtype;
begin
  if auth.uid() is null or not public.has_any_role(array['admin','direction','armement']) then
    raise exception using errcode='42501', message='La suppression des brouillons est réservée à la Direction, à l’Armement et aux administrateurs.';
  end if;
  select * into r from public.lifting_inspections
    where id=p_id and company_id=public.current_planning_company_id() for update;
  if r.id is null or not coalesce(public.lifting_can_access(r.company_id,r.vessel_id),false) then
    raise exception using errcode='42501', message='Brouillon introuvable ou accès refusé.';
  end if;
  if r.status <> 'draft' or r.certificate_id is not null or r.storage_path is not null or r.published_at is not null then
    raise exception 'Seul un brouillon peut être supprimé. Ce rapport est déjà finalisé ou classé.';
  end if;
  if r.revision is distinct from p_revision then
    raise exception 'Ce brouillon a été modifié depuis un autre appareil. Rechargez les rapports avant de le supprimer.';
  end if;
  delete from public.lifting_inspection_entries where inspection_id=r.id;
  delete from public.lifting_inspections where id=r.id;
end $$;
revoke all on function public.delete_lifting_inspection_draft(bigint,integer) from public,anon;
grant execute on function public.delete_lifting_inspection_draft(bigint,integer) to authenticated;
comment on function public.delete_lifting_inspection_draft(bigint,integer) is
  'Deletes only an accessible, unchanged draft and its inspection entries; inventory and published certificates are preserved.';
