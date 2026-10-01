-- The reviewed source must still be the URL displayed when the review was opened.
-- FOR SHARE keeps its URL stable until this insert transaction completes.
create or replace function public.regulatory_review_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  source public.regulatory_texts;
  actor_name text;
begin
  if tg_op<>'INSERT' then
    raise exception 'Une revue enregistrée est immuable. Enregistrez une nouvelle revue.' using errcode='23514';
  end if;
  select * into source from public.regulatory_texts t where t.id=new.text_id for share;
  if source.id is null or auth.uid() is null or source.company_id<>public.current_planning_company_id()
      or not public.regulatory_library_has_access(source.category,true) then
    raise exception 'Revue non autorisée dans cette rubrique.' using errcode='42501';
  end if;
  if new.url_snapshot is distinct from source.url then
    raise exception 'REGULATORY_SOURCE_CHANGED' using errcode='40001';
  end if;
  select coalesce(nullif(btrim(p.display_name),''),nullif(btrim(p.email),''),'Utilisateur')
  into actor_name from public.profiles p where p.id=auth.uid();
  if actor_name is null then raise exception 'Profil introuvable.' using errcode='42501'; end if;
  new.company_id:=source.company_id;
  new.reviewed_at:=clock_timestamp();
  new.reviewer_id:=auth.uid();
  new.reviewer_name:=left(actor_name,200);
  new.title_snapshot:=source.title;
  new.url_snapshot:=source.url;
  return new;
end $$;
revoke all on function public.regulatory_review_guard() from public,anon,authenticated;
-- This is an expected-source token, checked above; arbitrary historical snapshots remain forbidden.
grant insert(url_snapshot) on public.regulatory_reviews to authenticated;
