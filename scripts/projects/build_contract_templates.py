"""Build sanitized project document templates from user-owned source files.

The resulting towage DOCX contains visible placeholder tokens consumed by the
SeaPilot browser generator. The BIMCO PDF contains only the generic Part II
pages from the supplied executed contract; signed/customer-specific pages are
deliberately excluded.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from docx import Document
from docx.table import _Cell
from pypdf import PdfReader, PdfWriter


def set_cell(cell: _Cell, value: str) -> None:
    for drawing in cell._element.xpath('.//w:drawing'):
        drawing.getparent().remove(drawing)
    cell.text = value


def build_towage_template(source: Path, target: Path) -> None:
    document = Document(source)
    clauses = document.tables[0]

    replacements = {
        (1, 1): '{{CONTRACT_DATE_LONG}}',
        (3, 0): '{{CHARTERER}}',
        (3, 1): '{{OWNER}}',
        (5, 0): '{{TOWED_VESSEL}}',
        (5, 1): '{{TUG}}',
        (7, 0): '{{TOWED_CONDITIONS}}',
        (9, 0): '{{PICKUP_PLACE}}',
        (9, 1): '{{DEPARTURE_WINDOW}}',
        (11, 0): '{{DESTINATION_PLACE}}',
        (11, 1): '{{ARRIVAL_WINDOW}}',
        (13, 0): '{{CONNECTION_TIME}}',
        (13, 1): '{{DISCONNECTION_TIME}}',
        (15, 0): '{{FIXED_PRICE}}',
        (15, 1): '{{OPTIONAL_COSTS}}',
        (17, 0): '{{PAYMENT_TERMS}}',
        (17, 1): '{{ADDITIONAL_CHARGES}}',
        (19, 0): '{{SPECIAL_CONDITIONS}}',
        (21, 0): '{{CHARTERER_SIGNATORY}}\n{{SIGNATURE_DATE}}',
        (21, 1): '{{OWNER_SIGNATORY}}\n{{SIGNATURE_DATE}}',
    }
    for (row, column), value in replacements.items():
        set_cell(clauses.cell(row, column), value)

    signatures = document.tables[1]
    set_cell(signatures.cell(1, 0), '{{OWNER_SIGNATORY}}\n{{SIGNATURE_DATE}}')
    set_cell(signatures.cell(1, 1), '{{CHARTERER_SIGNATORY}}\n{{SIGNATURE_DATE}}')

    processed_headers: set[int] = set()
    for section in document.sections:
        for table in section.header.tables:
            element_id = id(table._element)
            if element_id in processed_headers:
                continue
            processed_headers.add(element_id)
            set_cell(table.cell(0, 6), '{{CONTRACT_DATE_SHORT}}')
            set_cell(table.cell(1, 1), '{{DOCUMENT_CODE}}')
            set_cell(table.cell(1, 2), '{{PROJECT_CODE}}')

    target.parent.mkdir(parents=True, exist_ok=True)
    document.save(target)


def build_supplytime_part_ii(source: Path, target: Path) -> None:
    reader = PdfReader(source)
    if reader.is_encrypted:
        reader.decrypt('')
    if len(reader.pages) < 24:
        raise ValueError('The supplied SUPPLYTIME document does not contain the expected Part II pages.')

    writer = PdfWriter()
    # Source pages 5–24 are the unfilled, generic SUPPLYTIME 2017 Part II clauses.
    # Pages 1–4 and 25–30 contain executed contract data and are never copied.
    for page in reader.pages[4:24]:
        writer.add_page(page)
    writer.add_metadata({
        '/Title': 'SUPPLYTIME 2017 - Part II',
        '/Author': 'BIMCO',
        '/Subject': 'SeaPilot internal authorized contract template',
    })
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open('wb') as output:
        writer.write(output)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--towage-source', type=Path, required=True)
    parser.add_argument('--bimco-source', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args()

    build_towage_template(args.towage_source, args.output_dir / 'contrat-remorquage-bbtm.docx')
    build_supplytime_part_ii(args.bimco_source, args.output_dir / 'supplytime-2017-part-ii.pdf')


if __name__ == '__main__':
    main()
