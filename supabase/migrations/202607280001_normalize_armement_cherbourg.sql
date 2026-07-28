-- Consolidate the historical BBTM spelling with the canonical SeaPilot vessel/location label.
update public.planning_periods
set vessel_name = 'Armement - Cherbourg',
    updated_at = now()
where regexp_replace(upper(coalesce(vessel_name, '')), '[^A-Z0-9]', '', 'g') = 'ARMEMENTCHERBOURG'
  and vessel_name is distinct from 'Armement - Cherbourg';

update public.planning_days
set vessel_name = 'Armement - Cherbourg',
    updated_at = now()
where regexp_replace(upper(coalesce(vessel_name, '')), '[^A-Z0-9]', '', 'g') = 'ARMEMENTCHERBOURG'
  and vessel_name is distinct from 'Armement - Cherbourg';

update public.planning_projects
set primary_vessel_name = 'Armement - Cherbourg',
    updated_at = now()
where regexp_replace(upper(coalesce(primary_vessel_name, '')), '[^A-Z0-9]', '', 'g') = 'ARMEMENTCHERBOURG'
  and primary_vessel_name is distinct from 'Armement - Cherbourg';

update public.planning_projects
set secondary_vessel_name = 'Armement - Cherbourg',
    updated_at = now()
where regexp_replace(upper(coalesce(secondary_vessel_name, '')), '[^A-Z0-9]', '', 'g') = 'ARMEMENTCHERBOURG'
  and secondary_vessel_name is distinct from 'Armement - Cherbourg';
