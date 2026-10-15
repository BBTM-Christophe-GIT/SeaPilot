-- The PDF now lives in verified private Blob storage. Use the same typed metadata
-- adapter as the other business validators, including inactive-mapping denial.
-- Keep canonical identity, amount, path, state and immutability checks unchanged.
create or replace function private.prepare_expense_note() returns trigger language plpgsql security definer
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
      if not exists (select 1 from document_blob_private.objects() where bucket_id = 'expense-note-pdfs' and name = old.pdf_path) then
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
