"""Read a supplied register and prepare a reviewable, transactional SQL import.

Requires openpyxl. No database connection, network access or execution is performed.
The JSON/SQL outputs contain customer data: keep them in a private ignored directory.
"""
import argparse
import hashlib
import json
import math
import unicodedata
from collections import Counter
from datetime import date, datetime
from pathlib import Path

SOURCE = 'sharepoint:87fd9c1e-1f76-4ee2-93c2-a0399a6f3e9b'
HEADERS = ['Titre', 'ID', 'Navire: Titre', 'Type de Matériel', 'CMU en T', 'Description',
           'Accréditation de contrôle', "Remorquage d'Urgence", 'Date de Mise en Service',
           'Date dernière visite', 'Périodicité de visite', 'Date de Validité',
           'EG', 'N ID', 'V1', 'V2', 'V3', 'V4', 'V5', 'Action']


def text(value):
    return '' if value is None else str(value).strip()


def normalized(value):
    return ''.join(c for c in unicodedata.normalize('NFD', text(value)) if not unicodedata.combining(c)).lower()


def source_date(value):
    if value is None:
        return None
    if isinstance(value, (date, datetime)):
        return value.strftime('%Y-%m-%d')
    raise ValueError(f'Expected an Excel date, received {value!r}')


def source_bool(value):
    if value is None or isinstance(value, bool):
        return value
    raise ValueError(f'Expected a boolean, received {value!r}')


def classify(material_type, description):
    kind, desc = normalized(material_type), normalized(description)
    if kind == 'remorque':
        if "patte d'oie" in desc or 'patte d’oie' in desc:
            if 'chaine' in desc:
                return 'towing', 'Remorque', 'chain_bridle'
            if 'textile' in desc:
                return 'towing', 'Remorque', 'textile_bridle'
        if 'cable de treuil' in desc:
            return 'towing', 'Remorque', 'winch_wire'
        if 'cable de remorquage' in desc:
            return 'towing', 'Remorque', 'towing_wire'
        if any(term in desc for term in ['remorque textile', 'cordage', 'fusible textile']):
            return 'towing', 'Remorque', 'textile_line'
        raise ValueError(f'Towing subtype requires review: {description}')
    if kind == 'elingue' and 'chaine' in desc:
        return 'lifting', 'Chaînes', None
    if not kind and desc.startswith('grappin'):
        return 'lifting', 'Grappins', None
    types = {'elingue': 'Élingues / Sangles textiles', 'sangle': 'Élingues / Sangles textiles',
             'manille': 'Manilles', 'croc': 'Crocs', 'anneau': 'Anneaux de levage',
             'poulie': 'Moufles et poulies de retour', 'pince': 'Pinces à tôles'}
    if kind not in types:
        raise ValueError(f'Accessory type requires review: {material_type} / {description}')
    return 'lifting', types[kind], None


def prepare_rows(records, filename, sha256):
    result, ids = [], set()
    for row_number, row in records:
        source_id = row['ID']
        if isinstance(source_id, bool) or not isinstance(source_id, (int, float)) or not math.isfinite(source_id) or source_id <= 0 or int(source_id) != source_id:
            raise ValueError(f'Row {row_number}: invalid source ID')
        source_id = str(int(source_id))
        if source_id in ids:
            raise ValueError(f'Duplicate source ID: {source_id}')
        ids.add(source_id)
        vessel, description = text(row['Navire: Titre']), text(row['Description'])
        if not vessel or not description:
            raise ValueError(f'Row {row_number}: missing vessel/description')
        kind, material_type, towing_type = classify(row['Type de Matériel'], description)
        swl = row['CMU en T']
        if swl is not None and (isinstance(swl, bool) or not isinstance(swl, (int, float)) or not math.isfinite(swl) or swl <= 0):
            raise ValueError(f'Row {row_number}: invalid SWL')
        action = text(row['Action'])
        result.append(dict(source_key=f'{SOURCE}:{source_id}', vessel_name=vessel, kind=kind,
                           legacy_reference=source_id, material_type=material_type, towing_type=towing_type,
                           description=description, swl_tonnes=swl, serial_number=text(row['Titre']),
                           active=normalized(action) not in ['mise au rebus', 'mise au rebut'],
                           source_data=dict(source_id=source_id, filename=filename, sha256=sha256, row=row_number,
                                            source_material_type=text(row['Type de Matériel']),
                                            source_description=description, source_serial_number=text(row['Titre']), source_swl_tonnes=swl,
                                            commissioned_on=source_date(row['Date de Mise en Service']),
                                            last_inspected_on=source_date(row['Date dernière visite']),
                                            valid_until=source_date(row['Date de Validité']),
                                            inspection_frequency=text(row['Périodicité de visite']), action=action,
                                            control_accredited=source_bool(row['Accréditation de contrôle']),
                                            emergency_towing=source_bool(row["Remorquage d'Urgence"]),
                                            historical_checks={code: source_bool(row[column]) for code, column in
                                                               [('EG', 'EG'), ('NID', 'N ID'), *[(f'V{i}', f'V{i}') for i in range(1, 6)]]})))
    return sorted(result, key=lambda row: int(row['legacy_reference']))


def sql_literal(value):
    return "'" + value.replace("'", "''") + "'"


def import_sql(rows, company_code):
    payload = sql_literal(json.dumps(rows, ensure_ascii=False, allow_nan=False))
    # Short locks keep reconciliation and number allocation atomic. Conflicting
    # transactions time out safely and can be retried. Reports are never written.
    return f"""begin;
set local lock_timeout='10s';
lock table public.lifting_inventory in share row exclusive mode;
lock table public.lifting_inventory_counters in share row exclusive mode;
do $import$
declare c bigint; v bigint; r jsonb; old public.lifting_inventory%rowtype; n bigint; matches integer;
begin
  select id into strict c from public.companies where code={sql_literal(company_code)};
  for r in select value from jsonb_array_elements({payload}::jsonb) loop
    select id into strict v from public.vessels where company_id=c and active
      and asset_kind in ('vessel','quay') and lower(btrim(name))=lower(r->>'vessel_name');
    select count(*) into matches from public.lifting_inventory where company_id=c
      and (source_key=r->>'source_key' or (source_key is null and legacy_reference=r->>'legacy_reference'));
    if matches>1 then raise exception 'Ambiguous source identity: %',r->>'source_key'; end if;
    select * into old from public.lifting_inventory where company_id=c
      and (source_key=r->>'source_key' or (source_key is null and legacy_reference=r->>'legacy_reference')) for update;
    if old.id is not null then
      if old.vessel_id<>v then raise exception 'Source vessel conflict: %',r->>'source_key'; end if;
      -- Attach provenance and fill missing serials. Preserve user edits, reference,
      -- state, source label, notes, existing serials and every report snapshot.
      update public.lifting_inventory set source_key=r->>'source_key',source_data=r->'source_data',
        serial_number=case when btrim(serial_number)='' then r->>'serial_number' else serial_number end,
        updated_at=clock_timestamp()
        where id=old.id and (source_key is distinct from r->>'source_key' or source_data is distinct from r->'source_data'
          or (btrim(serial_number)='' and r->>'serial_number'<>''));
    else
      insert into public.lifting_inventory_counters(company_id,vessel_id,kind,last_number)
        values(c,v,r->>'kind',coalesce((select max(reference::bigint) from public.lifting_inventory where company_id=c and vessel_id=v and kind=r->>'kind'),0)+1)
        on conflict(company_id,vessel_id,kind) do update set last_number=greatest(public.lifting_inventory_counters.last_number,
          coalesce((select max(reference::bigint) from public.lifting_inventory where company_id=c and vessel_id=v and kind=r->>'kind'),0))+1
        returning last_number into n;
      insert into public.lifting_inventory(company_id,vessel_id,kind,reference,legacy_reference,material_type,towing_type,
        description,swl_tonnes,serial_number,active,source_label,source_key,source_data)
        values(c,v,r->>'kind',n::text,r->>'legacy_reference',r->>'material_type',r->>'towing_type',
          r->>'description',(r->>'swl_tonnes')::numeric,r->>'serial_number',(r->>'active')::boolean,
          'Registre Excel fourni',r->>'source_key',r->'source_data');
    end if;
  end loop;
end $import$;
commit;
"""


def main():
    import openpyxl
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('workbook', type=Path)
    parser.add_argument('--output', type=Path, required=True, help='Private output prefix (without extension)')
    parser.add_argument('--company', default='bbtm')
    args = parser.parse_args()
    sha256 = hashlib.sha256(args.workbook.read_bytes()).hexdigest()
    workbook = openpyxl.load_workbook(args.workbook, read_only=True, data_only=True)
    sheet = workbook['Registre des Apparaux de Levage']
    values = sheet.iter_rows(values_only=True)
    headers = next(values)
    if any(headers.count(header) != 1 for header in HEADERS):
        raise ValueError('Expected register headers are missing or duplicated')
    rows = prepare_rows([(i, dict(zip(headers, row))) for i, row in enumerate(values, 2) if any(v is not None for v in row)], args.workbook.name, sha256)
    workbook.close()
    if not rows:
        raise ValueError('The workbook contains no inventory')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.with_suffix('.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
    args.output.with_suffix('.sql').write_text(import_sql(rows, args.company), encoding='utf-8')
    print(json.dumps(dict(rows=len(rows), sha256=sha256, vessels=dict(Counter(row['vessel_name'] for row in rows)),
                         inactive=sum(not row['active'] for row in rows)), ensure_ascii=False))


if __name__ == '__main__':
    main()
