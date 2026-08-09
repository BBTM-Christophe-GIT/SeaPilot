-- Configure the rate methodology used by the Action Plan dashboard and repair the
-- historical action -> safety event bridge introduced in 20260809113000.

update public.hse_exposure_methodologies
set
  ltifr_multiplier = coalesce(ltifr_multiplier, 1000000),
  trir_multiplier = coalesce(trir_multiplier, 1000000),
  far_multiplier = coalesce(far_multiplier, 100000000),
  fac_rate_multiplier = coalesce(fac_rate_multiplier, 1000000),
  mtc_rate_multiplier = coalesce(mtc_rate_multiplier, 1000000),
  rwc_rate_multiplier = coalesce(rwc_rate_multiplier, 1000000),
  sofr_multiplier = coalesce(sofr_multiplier, 200000),
  french_frequency_multiplier = coalesce(french_frequency_multiplier, 1000000),
  french_severity_multiplier = coalesce(french_severity_multiplier, 1000),
  notes = concat_ws(E'\n', nullif(notes, ''),
    'Taux configurés : LTIFR/TRIR et taux de cas par 1 000 000 h, FAR par 100 000 000 h, SOFR par 200 000 h, TF INRS par 1 000 000 h et TG INRS par 1 000 h.'),
  updated_at = now()
where name = 'SeaPilot HSE exposure';

create or replace function public.sync_action_item_hse_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_classification text;
begin
  select catalog.hse_classification into target_classification
  from public.action_type_catalog catalog
  where catalog.company_id = new.company_id
    and catalog.type_key = new.action_type_key
    and catalog.active;

  -- An action may be recategorised. Never leave a formerly linked event in the
  -- HSE numerator when its new category is not an HSE event.
  if target_classification is null then
    delete from public.hse_safety_events where action_item_id = new.id;
    return new;
  end if;

  insert into public.hse_safety_events (
    company_id,
    action_item_id,
    occurred_on,
    classification,
    person_id,
    vessel_id,
    project_id,
    lost_days,
    title,
    description,
    created_by
  ) values (
    new.company_id,
    new.id,
    coalesce(new.opened_on, new.created_at::date, current_date),
    target_classification,
    new.victim_person_id,
    new.vessel_id,
    new.project_id,
    new.lost_days,
    new.title,
    coalesce(new.description, new.comments),
    auth.uid()
  )
  on conflict (action_item_id) where action_item_id is not null do update set
    company_id = excluded.company_id,
    occurred_on = excluded.occurred_on,
    classification = excluded.classification,
    person_id = excluded.person_id,
    vessel_id = excluded.vessel_id,
    project_id = excluded.project_id,
    lost_days = excluded.lost_days,
    title = excluded.title,
    description = excluded.description;

  return new;
end;
$$;

-- The original trigger only handled future writes. Backfill every existing HSE
-- action so imported FAC/LTI/RWC/MTC records immediately feed the dashboard.
insert into public.hse_safety_events (
  company_id,
  action_item_id,
  occurred_on,
  classification,
  person_id,
  vessel_id,
  project_id,
  lost_days,
  title,
  description,
  created_by
)
select
  action.company_id,
  action.id,
  coalesce(action.opened_on, action.created_at::date, current_date),
  catalog.hse_classification,
  action.victim_person_id,
  action.vessel_id,
  action.project_id,
  action.lost_days,
  action.title,
  coalesce(action.description, action.comments),
  null
from public.action_items action
join public.action_type_catalog catalog
  on catalog.company_id = action.company_id
 and catalog.type_key = action.action_type_key
 and catalog.active
 and catalog.hse_classification is not null
on conflict (action_item_id) where action_item_id is not null do update set
  company_id = excluded.company_id,
  occurred_on = excluded.occurred_on,
  classification = excluded.classification,
  person_id = excluded.person_id,
  vessel_id = excluded.vessel_id,
  project_id = excluded.project_id,
  lost_days = excluded.lost_days,
  title = excluded.title,
  description = excluded.description;

delete from public.hse_safety_events event
where event.action_item_id is not null
  and not exists (
    select 1
    from public.action_items action
    join public.action_type_catalog catalog
      on catalog.company_id = action.company_id
     and catalog.type_key = action.action_type_key
     and catalog.active
     and catalog.hse_classification is not null
    where action.id = event.action_item_id
  );

