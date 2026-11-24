begin;

alter table public.vessels
  add column net_tonnage numeric,
  add column summer_freeboard_mm numeric,
  add constraint vessels_net_tonnage_check
    check (net_tonnage >= 0 and net_tonnage < 'Infinity'::numeric),
  add constraint vessels_summer_freeboard_mm_check
    check (summer_freeboard_mm >= 0 and summer_freeboard_mm < 'Infinity'::numeric);

comment on column public.vessels.net_tonnage is 'Jauge nette du navire (NT, sans unité).';
comment on column public.vessels.summer_freeboard_mm is 'Hauteur du franc-bord d’été en millimètres.';

notify pgrst, 'reload schema';

commit;
