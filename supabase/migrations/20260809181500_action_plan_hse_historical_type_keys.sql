-- Historical SharePoint rows predate action_type_key. Canonicalise their
-- English/French source labels so the existing sync trigger creates the HSE
-- events used by the annual dashboard.

update public.action_items action
set action_type_key = catalog.type_key
from public.action_type_catalog catalog
where action.action_type_key is null
  and catalog.company_id = action.company_id
  and catalog.active
  and lower(btrim(catalog.label)) = lower(btrim(coalesce(action.action_type, action.audit_type, '')));

update public.action_items action
set action_type_key = aliases.type_key
from (values
  ('fatality', 'fatality'),
  ('death', 'fatality'),
  ('lost time injury', 'lost_time_injury'),
  ('restricted work case', 'restricted_work_case'),
  ('medical treatment case', 'medical_treatment_case'),
  ('first aid case', 'first_aid_case'),
  ('near miss', 'near_miss'),
  ('presque accident', 'near_miss'),
  ('safety observation', 'safety_observation'),
  ('carte d''observation', 'safety_observation'),
  ('commuting accident', 'commuting_accident'),
  ('situation dangereuse', 'dangerous_situation'),
  ('casse matérielle', 'material_damage'),
  ('casse materielle', 'material_damage'),
  ('avarie t1', 'equipment_failure_t1'),
  ('avarie t2', 'equipment_failure_t2'),
  ('rapport de mer', 'marine_report')
) as aliases(source_label, type_key)
where action.action_type_key is null
  and lower(btrim(coalesce(action.action_type, action.audit_type, ''))) = aliases.source_label
  and exists (
    select 1 from public.action_type_catalog catalog
    where catalog.company_id = action.company_id
      and catalog.type_key = aliases.type_key
      and catalog.active
  );
