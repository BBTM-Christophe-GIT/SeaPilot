alter table public.vessels
  add column if not exists liability_insurer text;

comment on column public.vessels.liability_insurer is
  'Assureur responsabilité civile / P&I du navire, utilisé notamment dans les contrats de remorquage.';
