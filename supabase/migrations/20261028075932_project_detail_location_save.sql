-- The dossier map edits geography only. Reuse the already-authorized private
-- writer rather than rewriting contract fields through projects_save.
create function public.projects_set_location(
  target_project_id bigint,
  target_location_plan jsonb,
  target_expected_updated_at timestamptz
) returns public.projects
language sql security invoker set search_path = '' as $$
  select saved.* from project_location_private.set_plan(
    target_project_id, target_location_plan, target_expected_updated_at
  ) saved;
$$;

revoke all on function public.projects_set_location(bigint,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.projects_set_location(bigint,jsonb,timestamptz) to authenticated;
comment on function public.projects_set_location(bigint,jsonb,timestamptz) is
  'Updates only project location via the existing Admin/Direction company-scoped writer and exact updated_at token.';

notify pgrst,'reload schema';
