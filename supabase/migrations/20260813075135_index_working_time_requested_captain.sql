-- Supports captain-signature lookups and foreign-key maintenance without
-- scanning every working-time register.
create index if not exists working_time_registers_requested_captain_person_idx
  on public.working_time_registers (requested_captain_person_id)
  where requested_captain_person_id is not null;
