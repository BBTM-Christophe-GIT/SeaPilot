-- Authorize only the plan keys backed by the fleet's supplied plan assets.
create function private.work_permit_plan_keys(asset_name text)
returns text[]
language sql immutable security invoker set search_path = ''
as $$
  select case asset_name
    when 'goury' then array['pont-principal', 'pont-superieur', 'sous-pont-principal', 'profil']
    when 'yard le havre' then array['yard-3d']
    when 'yard du havre' then array['yard-3d']
    when 'le rozel' then array['pont-principal', 'sous-pont-principal', 'pont-superieur', 'pont-passerelle', 'profil']
    when 'landemer' then array['pont-principal', 'sous-pont-principal', 'profil', 'vue-complementaire']
    else array[]::text[]
  end;
$$;

revoke all on function private.work_permit_plan_keys(text) from public, anon, authenticated;
grant execute on function private.work_permit_plan_keys(text) to authenticated;

-- Use the same plan catalogue for markers and every polygon. Keep the rest of
-- the original trigger and its grants in place.
do $migration$
declare
  definition text := replace(pg_get_functiondef('private.prepare_work_permit_write()'::regprocedure), chr(13), '');
  old_assignment text := $old$allowed_plan_keys := case asset_name
        when 'goury' then array['pont-principal', 'pont-superieur', 'sous-pont-principal', 'profil']
        when 'yard le havre' then array['yard-3d']
        when 'yard du havre' then array['yard-3d']
        else array[]::text[]
      end;$old$;
begin
  if strpos(definition, old_assignment) = 0 then
    raise exception 'Expected work permit plan allowlist not found in write trigger';
  end if;
  execute replace(definition, old_assignment, 'allowed_plan_keys := private.work_permit_plan_keys(asset_name);');
end;
$migration$;
