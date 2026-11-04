"""Build blank three-page PDF backgrounds from the supplied BBTM Word models.

Uses the bundled Python/Poppler runtime and an invisible Word COM instance on
Windows. The source files are opened read-only; only temporary copies are edited.
The source employer signatures are removed. Runtime signatures stay private.
"""
from copy import copy
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys
from zipfile import ZipFile

import pdfplumber
from pypdf import PdfReader, PdfWriter

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / 'tmp' / 'pdfs' / 'hr-employment-contracts'
WORD_SCRIPT = Path(__file__).with_name('build_employment_contract_templates.py')
spec = importlib.util.spec_from_file_location('word_templates', WORD_SCRIPT)
word_templates = importlib.util.module_from_spec(spec)
spec.loader.exec_module(word_templates)
word_templates.ROOT = WORK
(WORK / 'public' / 'templates').mkdir(parents=True, exist_ok=True)


def preprocess(source_directory):
    manifests = {}
    for kind in ['CDI', 'CDD']:
        word_templates.prepare(source_directory / ('MODELE ' + kind + ' BBTM.docx'), kind)
        source = ZipFile(WORK / 'public' / 'templates' / ('employment-contract-' + kind.lower() + '-bbtm.docx'))
        manifest = {}
        marker_parts, blank_parts = {}, {}
        for part in ['word/document.xml', 'word/header1.xml']:
            xml = source.read(part).decode('utf-8')
            if part == 'word/document.xml':
                xml = re.sub(r'<w:drawing\b[^>]*>.*?</w:drawing>', '', xml, flags=re.S)
                xml = xml.replace('{{grossMonthlySalary}} €uros', '{{grossMonthlySalary}}')
                xml = xml.replace('La {{collectiveAgreement}}.', '{{collectiveClause}}')
                xml = xml.replace('{{collectiveClause}}</w:t>', '{{collectiveClause}}</w:t><w:br/><w:t xml:space="preserve"> </w:t>')
            def mark(match):
                token = 'SPFIELD' + str(len(manifest) + 1).zfill(2)
                manifest[token] = match[1]
                return token
            marker_parts[part] = re.sub(r'\{\{([A-Za-z]+)\}\}', mark, xml).encode('utf-8')
            blank_parts[part] = re.sub(r'\{\{([A-Za-z]+)\}\}', '', xml).encode('utf-8')
        for variant, parts in [('markers', marker_parts), ('blank', blank_parts)]:
            with ZipFile(WORK / (kind.lower() + '-' + variant + '.docx'), 'w') as target:
                for entry in source.infolist():
                    target.writestr(copy(entry), parts.get(entry.filename, source.read(entry.filename)))
        manifests[kind] = manifest
    return manifests


def export_pdfs():
    script = r'''
$ErrorActionPreference = 'Stop'
foreach ($inputQa in Get-ChildItem -LiteralPath $args[0] -Filter '*.docx') {
  $outputQa = [System.IO.Path]::ChangeExtension($inputQa.FullName, '.pdf')
  $wordQa = New-Object -ComObject Word.Application
  $wordQa.Visible = $false; $wordQa.DisplayAlerts = 0; $wordQa.AutomationSecurity = 3
  $wordQa.Options.UpdateLinksAtOpen = $false
  try {
    $documentQa = $wordQa.Documents.Open($inputQa.FullName, $false, $true, $false)
    $documentQa.ExportAsFixedFormat($outputQa, 17)
    Write-Output $outputQa
  } finally {
    try { $documentQa.Close(0) } catch {}
    try { $wordQa.Quit() } catch {}
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($wordQa) | Out-Null
  }
}
'''
    path = WORK / 'export.ps1'
    path.write_text(script, encoding='utf-8-sig')
    subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', str(path), str(WORK)], check=True)


def collect_map(kind, manifest):
    slots = []
    signature = None
    with pdfplumber.open(WORK / (kind.lower() + '-markers.pdf')) as document:
        assert len(document.pages) == 3
        for index, page in enumerate(document.pages):
            tables = page.find_tables()
            cells = [cell for table in tables for cell in table.cells]
            for word in page.extract_words():
                marker = word['text']
                if marker not in manifest:
                    continue
                key = manifest[marker]
                cell = next((c for c in cells if c[0] <= word['x0'] <= c[2] and c[1] <= word['top'] <= c[3]), None)
                size = 9 if key == 'headerDate' else 8 if key == 'collectiveClause' else 10
                x = word['x0']
                right = (cell[2] - 6) if cell else (524 if word['x0'] > 300 else 294)
                height = (cell[3] - word['top'] - 4) if cell else size * 2.6
                top = word['top']
                if cell and key not in ['fullName', 'employerRepresentative', 'signatureDate', 'headerDate'] and not (kind == 'CDD' and key in ['startDate', 'endDate']):
                    top = cell[1] + 4
                    height = cell[3] - cell[1] - 8
                if key in ['fullName', 'employerRepresentative', 'signatureDate', 'headerDate']:
                    height = size * 1.3
                if key == 'collectiveClause':
                    # Preserve the source list marker; the clause may wrap in its original column.
                    right = 524
                    height = 18
                slots.append({'key': key, 'page': index, 'x': round(x, 2), 'top': round(top, 2),
                              'width': round(right - x, 2), 'height': round(height, 2), 'size': size,
                              'font': 'bold' if key in ['headerDate', 'collectiveAgreement'] else 'italic' if key == 'fullName' or (key == 'employerRepresentative' and index == 2) else 'regular'})
                if key == 'employerRepresentative' and index == 2:
                    assert cell
                    signature = {'page': 2, 'x': round(cell[0] + 10, 2), 'top': round(word['top'] + 31, 2),
                                 'width': 115, 'height': round(min(64, cell[3] - word['top'] - 38), 2)}
    assert signature and len(slots) >= 24, (kind, len(slots), signature)
    output = ROOT / 'public' / 'templates' / ('employment-contract-' + kind.lower() + '-bbtm.pdf')
    reader = PdfReader(WORK / (kind.lower() + '-blank.pdf'))
    writer = PdfWriter()
    writer.append_pages_from_reader(reader)
    writer.add_metadata({'/Title': 'Contrat de travail ' + kind + ' BBTM', '/Author': 'BBTM'})
    with output.open('wb') as stream:
        writer.write(stream)
    with pdfplumber.open(output) as blank:
        assert len(blank.pages) == 3
        assert all('SPFIELD' not in page.extract_text() for page in blank.pages)
        assert all(len(page.images) == 1 for page in blank.pages), 'Only the BBTM header logo may remain'
    return {'slots': slots, 'signature': signature}


if __name__ == '__main__':
    manifests = preprocess(Path(sys.argv[1]))
    export_pdfs()
    layout = {kind: collect_map(kind, manifests[kind]) for kind in ['CDI', 'CDD']}
    (ROOT / 'src' / 'features' / 'humanResources' / 'employmentContractPdfLayout.ts').write_text(
        '// Generated from the supplied BBTM Word references by scripts/hr/build_employment_contract_pdfs.py.\n'
        + 'export const EMPLOYMENT_CONTRACT_PDF_LAYOUT = ' + json.dumps(layout, ensure_ascii=False, indent=2) + ' as const;\n', encoding='utf-8')
    print('Built three-page unsigned PDF templates and field geometry.')
