-- Real authenticated profile fixtures; every write rolls back.
begin;

create temporary table hr_period_roles (user_id uuid, role_key text);
insert into hr_period_roles values
  ('78000000-0000-0000-0000-000000000201', 'admin'),
  ('78000000-0000-0000-0000-000000000202', 'direction'),
  ('78000000-0000-0000-0000-000000000203', 'armement'),
  ('78000000-0000-0000-0000-000000000204', 'marin'),
  ('78000000-0000-0000-0000-000000000205', 'capitaine');
grant select on hr_period_roles to authenticated;

insert into auth.users (id, email)
select user_id, role_key || '-hr-periods@example.invalid' from hr_period_roles;
insert into public.profiles (id, email, display_name, active_company_id)
select fixture.user_id, fixture.role_key || '-hr-periods@example.invalid', 'HR periods fixture', company.id
from hr_period_roles fixture cross join public.companies company where company.code = 'bbtm';
insert into public.user_roles (user_id, company_id, role_key)
select fixture.user_id, company.id, fixture.role_key
from hr_period_roles fixture cross join public.companies company where company.code = 'bbtm';
insert into public.people (company_id, user_id, first_name, last_name, function_label, active, hired_on, departed_on, contract_type)
select company.id, fixture.user_id, 'Employment', fixture.role_key, 'Capitaine', false, '2024-01-01', '2025-01-01', 'CDI'
from hr_period_roles fixture cross join public.companies company where company.code = 'bbtm';

-- A second company makes cross-company denial observable without touching live people.
insert into public.companies (code, name) values ('hr-periods-fixture', 'HR periods fixture');
insert into public.people (company_id, first_name, last_name, active, hired_on, contract_type)
select id, 'Foreign', 'Employment fixture', true, '2024-01-01', 'CDI'
from public.companies where code = 'hr-periods-fixture';
create temporary table hr_period_foreign as
select person.id from public.people person join public.companies company on company.id = person.company_id
where company.code = 'hr-periods-fixture';
grant select on hr_period_foreign to authenticated;

-- Simulate a future privileged API to prove the trigger also guards explicit JSON edits.
-- This helper is test-only and disappears at rollback.
create function public.hr_periods_test_definer_write(p_person_id bigint, p_periods jsonb)
returns void language sql security definer set search_path = '' as $$
  update public.people set employment_periods = p_periods where id = p_person_id;
$$;
revoke all on function public.hr_periods_test_definer_write(bigint, jsonb) from public, anon;
grant execute on function public.hr_periods_test_definer_write(bigint, jsonb) to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  fixture record;
  target_person public.people%rowtype;
  changed integer;
  history jsonb := '[{"hiredOn":"2024-01-01","departedOn":"2025-01-01","contractType":"CDI","departureReason":"Démission"},{"hiredOn":"2026-04-01","departedOn":"","contractType":"CDI","departureReason":""}]';
begin
  for fixture in select * from hr_period_roles loop
    perform set_config('request.jwt.claim.sub', fixture.user_id::text, true);
    select * into target_person from public.people where user_id = fixture.user_id;
    assert target_person.id is not null, 'Each role must read its own real linked person';
    assert jsonb_array_length(target_person.employment_periods) = 1, 'Legacy dates seed exactly one period';
    if fixture.role_key in ('admin','direction','armement') then
      update public.people set employment_periods = history, active = true where id = target_person.id;
      get diagnostics changed = row_count;
      assert changed = 1, 'Managers can record a rehire';
      select * into target_person from public.people where id = target_person.id;
      assert target_person.hired_on = '2026-04-01'::date and target_person.departed_on is null,
        'Legacy current-period columns mirror the rehire';
      assert target_person.active, 'Explicit rehire can reactivate the person';
      assert target_person.employment_periods->0->>'hiredOn' = '2024-01-01', 'Historical period survives';
      begin
        update public.people set employment_periods = jsonb_set(history, '{1,hiredOn}', '"2024-06-01"') where id = target_person.id;
        raise exception 'Overlapping periods were accepted';
      exception when invalid_parameter_value then null;
      end;
      begin
        update public.people set employment_periods = '{}'::jsonb where id = target_person.id;
        raise exception 'Non-array history was accepted';
      exception when invalid_parameter_value then null;
      end;
      begin
        update public.people set employment_periods = jsonb_set(history, '{1,departedOn}', '"04/02/2027"') where id = target_person.id;
        raise exception 'Non-ISO departure was accepted';
      exception when invalid_parameter_value then null;
      end;
      update public.people set departed_on = '2026-04-01' where id = target_person.id;
      assert (select employment_periods->1->>'departedOn' = '2026-04-01' from public.people where id = target_person.id),
        'Same-day departure remains valid and legacy edits synchronize';
    else
      update public.people set employment_periods = history where id = target_person.id;
      get diagnostics changed = row_count;
      assert changed = 0, 'Marin and Capitaine cannot directly mutate their employment periods';
      begin
        perform public.hr_periods_test_definer_write(target_person.id, history);
        raise exception 'A privileged API allowed a restricted profile to replace employment history';
      exception when insufficient_privilege then null;
      end;
      -- Existing self-profile permissions remain intact for legacy date fields.
      perform public.update_own_hr_profile(target_person.id, to_jsonb(target_person) || '{"hired_on":"2024-02-01"}'::jsonb);
      assert (select employment_periods->0->>'hiredOn' = '2024-02-01' from public.people where id = target_person.id),
        'Previously authorized self-profile dates still synchronize without replacing history';
    end if;
    assert not exists (select 1 from public.people where id in (select id from hr_period_foreign)),
      'No profile reads another company employment history';
    update public.people set employment_periods = history where id in (select id from hr_period_foreign);
    get diagnostics changed = row_count;
    assert changed = 0, 'No profile mutates another company employment history';
  end loop;
end;
$$;

reset role;
select 'PASS: employment history, rehire, validation, real profile authorization and cross-company isolation' as result;
rollback;
