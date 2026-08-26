-- Keep the ENIM classification tied to the HR function for every write path:
-- RH forms, SharePoint imports and direct administrative updates.
alter table public.people
  add column if not exists enim_function_code text
    generated always as (
      case lower(regexp_replace(trim(replace(coalesce(function_label, ''), '’', '''')), '[[:space:]]+', ' ', 'g'))
        when 'capitaine' then 'AA01A'
        when '2nd capitaine' then 'CA01A'
        when 'second capitaine' then 'CA01A'
        when 'chef mécanicien' then 'CB01A'
        when 'chef mecanicien' then 'CB01A'
        when '2nd mécanicien' then 'EB01A'
        when '2nd mecanicien' then 'EB01A'
        when 'second mécanicien' then 'EB01A'
        when 'second mecanicien' then 'EB01A'
        when 'maître d''equipage' then 'MA01A'
        when 'maitre d''equipage' then 'MA01A'
        when 'maître equipage' then 'MA01A'
        when 'maitre equipage' then 'MA01A'
        when 'matelot qualifié' then 'PA01A'
        when 'matelot qualifie' then 'PA01A'
        when 'matelot polyvalent' then 'PA01A'
        else null
      end
    ) stored,
  add column if not exists enim_category integer
    generated always as (
      case lower(regexp_replace(trim(replace(coalesce(function_label, ''), '’', '''')), '[[:space:]]+', ' ', 'g'))
        when 'capitaine' then 15
        when '2nd capitaine' then 12
        when 'second capitaine' then 12
        when 'chef mécanicien' then 15
        when 'chef mecanicien' then 15
        when '2nd mécanicien' then 12
        when '2nd mecanicien' then 12
        when 'second mécanicien' then 12
        when 'second mecanicien' then 12
        when 'maître d''equipage' then 7
        when 'maitre d''equipage' then 7
        when 'maître equipage' then 7
        when 'maitre equipage' then 7
        when 'matelot qualifié' then 5
        when 'matelot qualifie' then 5
        when 'matelot polyvalent' then 5
        else null
      end
    ) stored;

comment on column public.people.enim_function_code is
  'ENIM function code derived from people.function_label and recalculated on every function change.';
comment on column public.people.enim_category is
  'ENIM category derived from people.function_label and recalculated on every function change.';

insert into public.hr_visibility_rules (scope, item_key, item_label)
values ('function', '2nd-mecanicien', '2nd Mécanicien')
on conflict (scope, item_key) do update
set item_label = excluded.item_label;

notify pgrst, 'reload schema';
