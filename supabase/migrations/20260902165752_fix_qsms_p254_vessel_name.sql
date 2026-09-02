update public.procedures
set vessel_name = 'LANDEMER'
where sharepoint_list_id = '958cf50b-779a-4002-811c-0ed8bb41f7b5'
  and source_file_name = 'P254  -Nivelage Bougainville.docx'
  and vessel_name is distinct from 'LANDEMER';
