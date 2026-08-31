insert into public.emergency_exercise_types (key, label, display_order, active)
values ('anti-pollution', 'Exercice Antipollution', 230, true)
on conflict (key) do update
set label = excluded.label,
    display_order = excluded.display_order,
    active = excluded.active;
