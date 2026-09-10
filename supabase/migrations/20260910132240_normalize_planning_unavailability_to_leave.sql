-- Retire the absence-request type only. Vessel unavailability, historical crew
-- periods and conflict categories retain their separate operational meanings.
-- Normalize writes from older clients before applying the canonical constraint.
create or replace function public.normalize_planning_absence_type()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.absence_type = 'unavailability' then
    new.absence_type := 'leave';
  end if;
  return new;
end;
$$;

revoke all on function public.normalize_planning_absence_type() from public, anon, authenticated;

drop trigger if exists planning_absences_normalize_type on public.planning_absences;
create trigger planning_absences_normalize_type
  before insert or update of absence_type on public.planning_absences
  for each row execute function public.normalize_planning_absence_type();

-- Keep identifiers, ownership, decision, dates, reason and existing audit entries.
-- The regular audit trigger records the conversion with its before/after values.
update public.planning_absences
set absence_type = 'leave', updated_at = now()
where absence_type = 'unavailability';

alter table public.planning_absences drop constraint planning_absences_type_check;
alter table public.planning_absences add constraint planning_absences_type_check
  check (absence_type in ('leave', 'illness', 'training', 'medical_visit', 'recovery'));
