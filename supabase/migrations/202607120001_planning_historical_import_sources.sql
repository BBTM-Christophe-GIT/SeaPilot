update public.sharepoint_sources
set list_id = '543b9f00-aed2-489a-808a-7b64cc835a83',
    confirmed = true,
    notes = null,
    updated_at = now()
where key = 'list-bbtm-flotte';

insert into public.sharepoint_field_mappings (
  source_key,
  field_label,
  internal_name,
  data_type,
  target_table,
  target_column,
  required,
  notes
)
values
  ('list-bbtm-flotte', 'Type de navire', 'TypedeNavire', 'Text/Choice', 'vessels', 'type_label', false, null),
  ('list-bbtm-flotte', 'Type d''unité', 'Typedunit_x00e9_', 'Text/Choice', 'vessels', 'unit_type_label', false, null),
  ('list-bbtm-flotte', 'Date sortie de flotte', 'Datesortiedeflotte', 'DateTime', 'vessels', 'fleet_exit_on', false, null),
  ('list-bbtm-flotte', 'Immatriculation', 'Immatriculation', 'Text', 'vessels', 'registration_number', false, null),
  ('list-bbtm-flotte', 'Numéro OMI', 'Num_x00e9_roOMI', 'Text', 'vessels', 'imo_number', false, null),
  ('list-bbtm-flotte', 'Port d''immatriculation', 'Portdimmatriculation', 'Text', 'vessels', 'registration_port', false, null),
  ('list-bbtm-flotte', 'Signe distinctif', 'Signedistinctif', 'Text', 'vessels', 'call_sign', false, null),
  ('list-bbtm-flotte', 'MMSI', 'MMSI', 'Text', 'vessels', 'mmsi', false, null),
  ('list-bbtm-flotte', 'Jauge brute UMS', 'JaugeBruteenUMS', 'Text/Number', 'vessels', 'gross_tonnage', false, null),
  ('list-bbtm-flotte', 'Nombre maximal de personnes', 'Nombremaximaldepersonnes_x00e0_b', 'Number', 'vessels', 'max_people', false, null),
  ('list-bbtm-flotte', 'Membres d''équipage', 'Membresdel_x00e9_quipage_x002f_S', 'Text/Number', 'vessels', 'crew_members', false, null),
  ('list-bbtm-flotte', 'Dotation médicale', 'DotationM_x00e9_dicale', 'Text', 'vessels', 'medical_dotation', false, null)
on conflict (source_key, internal_name, target_table, target_column) do update
set field_label = excluded.field_label,
    data_type = excluded.data_type,
    required = excluded.required,
    notes = excluded.notes,
    updated_at = now();
