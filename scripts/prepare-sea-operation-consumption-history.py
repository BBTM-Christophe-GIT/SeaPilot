"""Extract the private Conso archive payload from the two legacy Excel layouts."""

import argparse
import json
from pathlib import Path, PurePosixPath
from xml.etree import ElementTree
from zipfile import ZipFile


SHEET = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
REL = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'


def column_index(address):
    index = 0
    for letter in address.rstrip('0123456789'):
        index = 26 * index + ord(letter) - ord('A') + 1
    return index - 1


def cell_text(element):
    return ''.join(part.text or '' for part in element.iter(SHEET + 't'))


def cell_value(cell, shared_strings):
    kind = cell.get('t', 'n')
    if kind == 'inlineStr':
        return cell_text(cell)
    raw = cell.findtext(SHEET + 'v')
    if not raw:
        return None
    if kind == 's':
        return shared_strings[int(raw)]
    if kind == 'b':
        return raw == '1'
    if kind in ('str', 'e'):
        return raw
    if kind == 'n':
        return float(raw) if any(char in raw.lower() for char in '.e') else int(raw)
    raise ValueError(f'Type de cellule inconnu à {cell.get("r")}')


def extract_rows(workbook, sheet_name, first_row, width, vessel=None):
    book = ElementTree.fromstring(workbook.read('xl/workbook.xml'))
    properties = book.find(SHEET + 'workbookPr')
    if properties is not None and properties.get('date1904') in ('1', 'true'):
        raise ValueError('Le classeur source doit utiliser le calendrier Excel 1900.')
    sheet = next((item for item in book.find(SHEET + 'sheets') if item.get('name') == sheet_name), None)
    if sheet is None:
        raise ValueError(f'Onglet introuvable dans le classeur source ({sheet_name}).')
    relationships = ElementTree.fromstring(workbook.read('xl/_rels/workbook.xml.rels'))
    target = next(item.get('Target') for item in relationships if item.get('Id') == sheet.get(REL + 'id'))
    sheet_path = target.lstrip('/') if target.startswith('/') else str(PurePosixPath('xl', target))
    sheet_data = ElementTree.fromstring(workbook.read(sheet_path)).find(SHEET + 'sheetData')
    shared_strings = []
    if 'xl/sharedStrings.xml' in workbook.namelist():
        shared_strings = [cell_text(item) for item in ElementTree.fromstring(workbook.read('xl/sharedStrings.xml'))]
    if vessel:
        title = sheet_data.find(f".//{SHEET}c[@r='A1']")
        if title is None or not str(cell_value(title, shared_strings)).strip().startswith(vessel):
            raise ValueError(f'Le classeur ne correspond pas au navire {vessel}.')

    readings = []
    for row in sheet_data.findall(SHEET + 'row'):
        source_row = int(row.get('r'))
        if source_row < first_row:
            continue
        cells = [None] * width
        for cell in row.findall(SHEET + 'c'):
            value = cell_value(cell, shared_strings)
            if value is None:
                continue
            index = column_index(cell.get('r'))
            if index >= width:
                raise ValueError(f'Colonne inattendue à {sheet_name}!{cell.get("r")}')
            cells[index] = value
        if vessel and not all(type(cells[index]) in (int, float) and 61 <= cells[index] < 2958466 for index in (3, 4)):
            continue
        if any(value is not None for value in cells):
            readings.append({'sourceRow': source_row, 'cells': cells})
    if not readings:
        raise ValueError(f'Aucun relevé dans l’onglet {sheet_name}.')
    return readings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--suroit', type=Path, required=True)
    parser.add_argument('--rozel', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True, help='Nouveau fichier JSON dans un emplacement privé')
    arguments = parser.parse_args()
    with ZipFile(arguments.suroit) as suroit, ZipFile(arguments.rozel) as rozel:
        payload = {
            'suroit': extract_rows(suroit, 'RELEVES', 5, 23, 'SUROIT'),
            'rozel': extract_rows(rozel, 'RELEVES', 4, 18, 'LE ROZEL'),
            'rozelGauge': extract_rows(rozel, 'Courbe des soutes', 2, 2),
        }
    with arguments.output.open('x', encoding='utf-8') as output:
        json.dump(payload, output, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
    print(', '.join(f'{key}: {len(rows)}' for key, rows in payload.items()))


if __name__ == '__main__':
    main()
