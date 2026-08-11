create index project_towed_assets_created_by_idx
  on public.project_towed_assets(created_by)
  where created_by is not null;

create index project_towed_assets_updated_by_idx
  on public.project_towed_assets(updated_by)
  where updated_by is not null;
