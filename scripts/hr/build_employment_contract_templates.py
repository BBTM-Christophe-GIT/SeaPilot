"""Prepare reusable BBTM CDI/CDD Word templates without rewriting opaque parts.

Run with the bundled document Python runtime and the directory containing the two
user-supplied MODELE CDI BBTM.docx / MODELE CDD BBTM.docx references as argument.
The source files are read-only. All noneditable ZIP parts remain byte-identical.
"""
import hashlib
from copy import copy
import json
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[2]
NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
PARAGRAPH = re.compile(r"<w:p\b[^>]*>.*?</w:p>", re.S)


def paragraph_text(paragraph):
    # Ignore field instructions and drawing coordinates when describing the text.
    # The source declares many prefixes only on the root, so use text nodes here.
    return "".join(ET.fromstring('<root>' + ''.join(re.findall(r'<w:t\b[^>]*>(.*?)</w:t>', paragraph, re.S)) + '</root>').itertext())


def value_run(value, line_break=False, properties=None):
    properties = properties or '<w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'
    return '<w:r>' + properties + ('<w:br/>' if line_break else '') + '<w:t xml:space="preserve">' + value + '</w:t></w:r>'


def replace_content(paragraph, value):
    opening = re.match(r'<w:p\b[^>]*>', paragraph)[0]
    ppr = re.search(r'<w:pPr\b[^>]*>.*?</w:pPr>', paragraph, re.S)
    properties = re.search(r'<w:rPr\b[^>]*>.*?</w:rPr>', paragraph, re.S)
    return opening + (ppr[0] if ppr else '') + value_run(value, properties=properties[0] if properties else None) + '</w:p>'


def prepare(source, kind):
    src = ZipFile(source)
    xml = src.read('word/document.xml').decode('utf-8')
    paragraphs = PARAGRAPH.findall(xml)
    slots = {5: 'lastName', 6: 'firstName', 9: 'birthDate', 10: 'birthPlace', 12: 'postalAddress',
             15: 'socialSecurityNumber', 16: 'sailorNumber', 19: 'functionLabel', 20: 'vesselNames',
             23: 'enimCategory', 24: 'enimFunctionCode', 27: 'collectiveAgreement'}
    replacements = {i: replace_content(paragraphs[i], '{{' + key + '}}') for i, key in slots.items()}
    replacements[28] = replace_content(paragraphs[28], '{{grossMonthlySalary}} €uros')
    replacements[1 if kind == 'CDD' else 2] = (paragraphs[1][:-6] + value_run('{{startDate}}', True) + '</w:p>') if kind == 'CDD' else replace_content(paragraphs[2], '{{startDate}}')
    if kind == 'CDD':
        replacements[2] = paragraphs[2][:-6] + value_run('{{endDate}}', True) + '</w:p>'
    for i, paragraph in enumerate(paragraphs):
        visible = paragraph_text(paragraph).strip()
        if visible == 'Nom + Prénom':
            replacements[i] = replace_content(paragraph, '{{fullName}}')
        elif 'Benjamin BON' in visible:
            replacements[i] = replace_content(paragraph, '{{employerRepresentative}}')
        elif '<w:instrText' in paragraph and ' TIME ' in paragraph:
            replacements[i] = replace_content(paragraph, 'Le {{signatureDate}}')
        elif kind == 'CDI' and visible == 'La CONVENTION COLLECTIVE DES OFFICIERS DE LA MARINE MARCHANDE.':
            replacements[i] = replace_content(paragraph, 'La {{collectiveAgreement}}.')
    index = -1
    def patch(match):
        nonlocal index
        index += 1
        return replacements.get(index, match[0])
    patched = PARAGRAPH.sub(patch, xml)
    header = src.read('word/header1.xml').decode('utf-8')
    header = PARAGRAPH.sub(lambda m: replace_content(m[0], '{{headerDate}}') if '<w:instrText' in m[0] and ' TIME ' in m[0] else m[0], header)
    core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Contrat ' + kind + ' BBTM</dc:title><dc:creator>BBTM</dc:creator></cp:coreProperties>'
    edits = {'word/document.xml': patched.encode('utf-8'), 'word/header1.xml': header.encode('utf-8'), 'docProps/core.xml': core.encode('utf-8')}
    output = ROOT / 'public' / 'templates' / ('employment-contract-' + kind.lower() + '-bbtm.docx')
    with ZipFile(output, 'w', ZIP_DEFLATED) as target:
        for entry in src.infolist():
            target.writestr(copy(entry), edits.get(entry.filename, src.read(entry.filename)))
    checked = ZipFile(output)
    for entry in src.namelist():
        if entry not in edits:
            assert src.read(entry) == checked.read(entry), entry
    # Same section and content-control structure, with only the intended text slots changed.
    before, after = ET.fromstring(xml), ET.fromstring(patched)
    assert ET.tostring(before.find('.//w:sectPr', NS)) == ET.tostring(after.find('.//w:sectPr', NS))
    assert len(before.findall('.//w:sdt', NS)) == len(after.findall('.//w:sdt', NS))
    print(kind, 'source SHA256', hashlib.sha256(source.read_bytes()).hexdigest(), 'template', output)
    lines = ['CONTRAT D’ENGAGEMENT MARITIME À DURÉE ' + ('DÉTERMINÉE' if kind == 'CDD' else 'INDÉTERMINÉE')]
    lines.extend(''.join(t.text or '' for t in p.findall('.//w:t', NS)) for p in after.findall('.//w:p', NS))
    return [line for line in lines if line.strip()]


if __name__ == '__main__':
    reference_directory = Path(sys.argv[1])
    texts = {kind: prepare(reference_directory / ('MODELE ' + kind + ' BBTM.docx'), kind) for kind in ['CDI', 'CDD']}
    (ROOT / 'src' / 'features' / 'humanResources' / 'employmentContractText.ts').write_text(
        '// Extracted from the supplied BBTM models by scripts/hr/build_employment_contract_templates.py.\n'
        + 'export const EMPLOYMENT_CONTRACT_TEXT = ' + json.dumps(texts, ensure_ascii=False, indent=2) + ' as const;\n', encoding='utf-8')
