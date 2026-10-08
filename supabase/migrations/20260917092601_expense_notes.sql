-- NDF: immutable issued notes, private PDF receipts, company and issuer isolation.
insert into public.role_module_permissions (role_key, module_key, is_visible)
select key, 'expenseNotes', true from public.roles
where key in ('admin', 'direction', 'armement', 'capitaine', 'marin')
on conflict (role_key, module_key) do nothing;

create table public.expense_notes (
  id uuid primary key default gen_random_uuid(),
  company_id bigint not null default public.current_planning_company_id() references public.companies(id),
  created_by uuid not null default auth.uid() references public.profiles(id),
  creator_name text not null,
  issuer_person_id bigint references public.people(id),
  issuer_name text not null check (length(btrim(issuer_name)) between 1 and 150),
  vessel_id bigint references public.vessels(id),
  vessel_name text not null default 'Hors navire',
  kind text not null check (kind in ('expense', 'mileage')),
  expense_on date not null,
  title text not null check (length(btrim(title)) between 1 and 200),
  description text not null default '' check (length(description) <= 5000),
  payment_method text not null default '' check (length(payment_method) <= 100),
  amount numeric(12,2) not null check (amount > 0 and amount <= 99999999),
  mileage jsonb,
  receipt_count integer not null check (receipt_count between 0 and 20),
  pdf_path text not null unique,
  status text not null default 'preparing' check (status in ('preparing', 'issued')),
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  delivery_status text not null default 'pending' check (delivery_status in ('pending', 'sending', 'sent', 'failed', 'unknown')),
  delivery_attempted_at timestamptz,
  delivered_at timestamptz,
  delivery_error text,
  check ((status = 'preparing' and issued_at is null) or (status = 'issued' and issued_at is not null))
);
create index expense_notes_company_issued_idx on public.expense_notes (company_id, issued_at desc, id);
create index expense_notes_created_byx on public.expense_notes (created_by, company_id, issued_at desc);
create index expense_notes_vessel_idx on public.expense_notes (vessel_id);

alter table public.expense_notes enable row level security;
revoke all on public.expense_notes from anon, authenticated;
grant select on public.expense_notes to authenticated;
grant insert (id, issuer_person_id, issuer_name, kind, expense_on, title, description, payment_method, amount, vessel_id, mileage, receipt_count) on public.expense_notes to authenticated;
grant update (status) on public.expense_notes to authenticated;
grant delete on public.expense_notes to authenticated;
grant all on public.expense_notes to service_role;

create policy expense_notes_read on public.expense_notes for select to authenticated
using (public.user_belongs_to_company(company_id) and
  (created_by = (select auth.uid()) or (status = 'issued' and public.has_any_role(array['admin', 'direction']))));
create policy expense_notes_create on public.expense_notes for insert to authenticated
with check (public.user_belongs_to_company(company_id) and created_by = (select auth.uid()) and status = 'preparing'
  and exists (select 1 from public.role_module_permissions p where p.module_key = 'expenseNotes' and p.is_visible and public.has_role(p.role_key)));
create policy expense_notes_issue on public.expense_notes for update to authenticated
using (public.user_belongs_to_company(company_id) and created_by = (select auth.uid()) and status = 'preparing')
with check (public.user_belongs_to_company(company_id) and created_by = (select auth.uid()) and status = 'issued');
create policy expense_notes_discard_preparation on public.expense_notes for delete to authenticated
using (public.user_belongs_to_company(company_id) and created_by = (select auth.uid()) and status = 'preparing');

create schema if not exists private;
create function private.prepare_expense_note() returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  trip jsonb;
  trips jsonb := '[]'::jsonb;
  trip_amount numeric;
  total numeric := 0;
  km numeric;
  tolls numeric;
begin
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - array['status','issued_at','delivery_status','delivery_attempted_at','delivered_at','delivery_error'])
       is distinct from (to_jsonb(old) - array['status','issued_at','delivery_status','delivery_attempted_at','delivered_at','delivery_error']) then
      raise exception 'Une note émise ne peut plus être modifiée.';
    end if;
    if new.status is distinct from old.status then
      if old.status <> 'preparing' or new.status <> 'issued' then raise exception 'Transition de note interdite.'; end if;
      if not exists (select 1 from storage.objects where bucket_id = 'expense-note-pdfs' and name = old.pdf_path) then
        raise exception 'Le PDF doit être enregistré avant émission.';
      end if;
      new.issued_at := now();
    end if;
    return new;
  end if;
  if auth.uid() is null or not public.user_belongs_to_company(new.company_id) then
    raise exception 'Session ou société invalide.';
  end if;
  new.created_by := auth.uid();
  select coalesce(nullif(btrim(display_name), ''), email) into new.creator_name from public.profiles where id = auth.uid();
  if new.issuer_person_id is not null then
    select btrim(concat_ws(' ', first_name, last_name)) into new.issuer_name from public.people
      where id = new.issuer_person_id and company_id = new.company_id and active;
    if new.issuer_name is null then raise exception 'Émetteur indisponible pour cette société.'; end if;
  end if;
  if new.vessel_id is not null then
    select name into new.vessel_name from public.vessels where id = new.vessel_id and company_id = new.company_id and active;
    if new.vessel_name is null then raise exception 'Navire indisponible pour cette société.'; end if;
  else new.vessel_name := 'Hors navire'; end if;
  new.pdf_path := new.company_id || '/' || new.created_by || '/' || new.id || '/note.pdf';
  if new.kind = 'expense' then
    if btrim(new.payment_method) = '' then raise exception 'Le mode de paiement est obligatoire.'; end if;
    new.mileage := null;
  elsif new.kind = 'mileage' then
    if new.mileage is null or jsonb_typeof(new.mileage) <> 'object'
      or coalesce(new.mileage->>'fuel', '') not in ('essence','diesel','hybrid','electric')
      or coalesce(btrim(new.mileage->>'vehicle'), '') = ''
      or coalesce(btrim(new.mileage->>'fiscalPower'), '') = ''
      or coalesce(btrim(new.mileage->>'function'), '') = ''
      or coalesce(btrim(new.mileage->>'period'), '') = ''
      or jsonb_typeof(new.mileage->'trips') is distinct from 'array' then
      raise exception 'Informations kilométriques incomplètes.';
    end if;
    if jsonb_array_length(new.mileage->'trips') not between 1 and 30 then raise exception 'Saisissez de 1 à 30 déplacements.'; end if;
    tolls := (new.mileage->>'tolls')::numeric;
    if tolls is null or tolls < 0 or tolls > 999999 then raise exception 'Péages invalides.'; end if;
    for trip in select value from jsonb_array_elements(new.mileage->'trips') loop
      km := (trip->>'km')::numeric;
      if km is null or km <= 0 or km > 100000 or km <> trunc(km)
        or coalesce(btrim(trip->>'route'), '') = '' or coalesce(btrim(trip->>'reason'), '') = ''
        or coalesce(trip->>'date', '') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Déplacement incomplet.'; end if;
      perform (trip->>'date')::date;
      if new.mileage->>'fuel' = 'electric' then
        trip_amount := round((trip->>'amount')::numeric, 2);
        if trip_amount is null or trip_amount <= 0 or trip_amount > 999999 then raise exception 'Montant électrique invalide.'; end if;
      else
        -- Existing NDF business rule; this is not a statutory tax scale.
        trip_amount := round(least(km * 0.606, 100), 2);
      end if;
      trips := trips || jsonb_build_array(trip || jsonb_build_object('amount', trip_amount, 'rate', case when new.mileage->>'fuel' = 'electric' then null else 0.606 end));
      total := total + trip_amount;
    end loop;
    new.amount := total + round(tolls, 2);
    new.mileage := new.mileage || jsonb_build_object('trips', trips, 'tolls', round(tolls, 2));
    new.payment_method := 'Indemnités kilométriques';
  end if;
  return new;
end;
$$;
revoke all on function private.prepare_expense_note() from public, anon, authenticated;
create trigger prepare_expense_note before insert or update on public.expense_notes
for each row execute function private.prepare_expense_note();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expense-note-pdfs', 'expense-note-pdfs', false, 15000000, array['application/pdf']);
create policy expense_note_pdf_read on storage.objects for select to authenticated
using (bucket_id = 'expense-note-pdfs' and exists (select 1 from public.expense_notes n where n.pdf_path = name));
create policy expense_note_pdf_upload on storage.objects for insert to authenticated
with check (bucket_id = 'expense-note-pdfs' and exists (select 1 from public.expense_notes n
  where n.pdf_path = name and n.created_by = (select auth.uid()) and n.status = 'preparing'));
create policy expense_note_pdf_discard on storage.objects for delete to authenticated
using (bucket_id = 'expense-note-pdfs' and exists (select 1 from public.expense_notes n
  where n.pdf_path = name and n.created_by = (select auth.uid()) and n.status = 'preparing'));

comment on table public.expense_notes is 'NDF: personal history, company-wide oversight for Admin/Direction, immutable PDF with receipts.';

create table public.expense_note_settings (
  company_id bigint primary key default public.current_planning_company_id() references public.companies(id),
  payment_methods text[] not null default array['CB-Perso','CB-Benjamin','CB-Armement - 9893','CB-SUROIT','CB-LE ROZEL','CB-GOURY','CB-LANDEMER','Espèces','Autre'],
  default_payment_method text not null default 'CB-Perso',
  updated_at timestamptz not null default now(),
  check (cardinality(payment_methods) between 1 and 50),
  check (default_payment_method = any(payment_methods)),
  check (array_position(payment_methods, null) is null),
  check (not ('' = any(payment_methods)))
);
alter table public.expense_note_settings enable row level security;
revoke all on public.expense_note_settings from anon, authenticated;
grant select, insert, update on public.expense_note_settings to authenticated;
grant all on public.expense_note_settings to service_role;
create policy expense_note_settings_read on public.expense_note_settings for select to authenticated
using (public.user_belongs_to_company(company_id));
create policy expense_note_settings_create on public.expense_note_settings for insert to authenticated
with check (public.user_belongs_to_company(company_id) and public.has_role('admin'));
create policy expense_note_settings_update on public.expense_note_settings for update to authenticated
using (public.user_belongs_to_company(company_id) and public.has_role('admin'))
with check (public.user_belongs_to_company(company_id) and public.has_role('admin'));
insert into public.expense_note_settings (company_id) select id from public.companies;

-- A narrow directory exposes only names for editable issuer selection, not private HR data.
create function private.expense_note_people() returns table (id bigint, name text, is_current boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.id, btrim(concat_ws(' ', p.first_name, p.last_name)), p.user_id = auth.uid()
  from public.people p where auth.uid() is not null and p.active
    and public.user_belongs_to_company(p.company_id)
    and exists (select 1 from public.role_module_permissions r where r.module_key = 'expenseNotes' and r.is_visible and public.has_role(r.role_key))
  order by p.last_name, p.first_name, p.id;
$$;
revoke all on function private.expense_note_people() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.expense_note_people() to authenticated;
create function public.expense_note_people() returns table (id bigint, name text, is_current boolean)
language sql stable security invoker set search_path = public, pg_temp as $$ select * from private.expense_note_people(); $$;
revoke all on function public.expense_note_people() from public, anon;
grant execute on function public.expense_note_people() to authenticated;
