create function public.remove_organigramme_watch_member(
  p_chart_id bigint, p_person_id bigint, p_watch_id bigint
)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  company bigint := public.current_planning_company_id();
begin
  if public.organigramme_has_access(company) is not true then
    raise exception 'Accès refusé à l’organigramme.' using errcode = '42501';
  end if;
  if private.organigramme_person_allowed(company, p_person_id) is not true then
    raise exception 'Collaborateur indisponible.' using errcode = '42501';
  end if;

  -- Share the lock order used by transfers and full saves.
  perform 1 from public.organigramme_charts where company_id = company and id = p_chart_id for update;
  if not found then raise exception 'Organigramme introuvable.' using errcode = 'P0002'; end if;
  perform 1 from public.organigramme_watches
  where company_id = company and chart_id = p_chart_id and id = p_watch_id for update;
  if not found then raise exception 'Bordée introuvable.' using errcode = 'P0002'; end if;

  delete from public.organigramme_watch_members
  where company_id = company and watch_id = p_watch_id and person_id = p_person_id;

  if found then
    update public.organigramme_watches
    set revision = revision + 1
    where company_id = company and chart_id = p_chart_id and id = p_watch_id;
  end if;
end;
$$;

revoke all on function public.remove_organigramme_watch_member(bigint,bigint,bigint) from public, anon;
grant execute on function public.remove_organigramme_watch_member(bigint,bigint,bigint) to authenticated;
comment on function public.remove_organigramme_watch_member(bigint,bigint,bigint)
  is 'Removes one exact watch assignment and invalidates stale watch drafts within the selected organigramme.';
notify pgrst, 'reload schema';
