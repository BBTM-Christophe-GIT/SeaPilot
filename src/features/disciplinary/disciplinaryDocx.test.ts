import { readFile, mkdir, writeFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildDisciplinaryDocx } from './disciplinaryDocx';
import { generateLetter, initialForm } from './disciplinaryModel';

describe('editable BBTM letters', () => {
  it('retains the supplied letterhead, escapes text and embeds the signature in the Office package', async () => {
    const template = await readFile('public/templates/disciplinary-letterhead-bbtm.docx');
    const person = { id: 1, companyId: 1, firstName: 'Camille', lastName: 'EXEMPLE', functionLabel: 'Matelot', postalAddress: '10 rue Exemple\n50100 Cherbourg-en-Cotentin', hiredOn: '2024-01-01', departedOn: '', contractType: 'CDI' };
    const form = { ...initialForm(person), facts: 'TEST TECHNIQUE — Aucun fait réel. Texte modifiable & personnalisable <exemple>.', evidence: '<h2>Pièces de démonstration</h2><div><ol><li><strong>Rapport signé</strong><ul><li><em>Témoin</em></li></ul></li><li><u>Deuxième constat</u></li></ol></div><p style="text-align: center"><span style="font-family: Times New Roman">Texte centré</span> <a href="https://example.com/?a=1&amp;b=2">Lien</a></p>', rules: 'Consigne de démonstration' };
    const signature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGZkAAAAASUVORK5CYII=';
    const letter = generateLetter(form, 'notification', { name: 'Marie EXEMPLE', function: 'Direction — TEST', signature });
    letter.subject = `TEST TECHNIQUE — ${letter.subject}`;
    const blob = await buildDisciplinaryDocx(letter, new Uint8Array(template).buffer);
    const bytes = new Uint8Array(await new Promise<ArrayBuffer>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer); reader.readAsArrayBuffer(blob); }));
    const original = await JSZip.loadAsync(template), generated = await JSZip.loadAsync(bytes);
    for (const path of Object.keys(original.files).filter((p) => /word\/(header|footer|media)/.test(p) && !original.files[p].dir)) {
      expect(await generated.file(path)!.async('uint8array')).toEqual(await original.file(path)!.async('uint8array'));
    }
    const xml = await generated.file('word/document.xml')!.async('string');
    expect(xml).toContain('Camille EXEMPLE'); expect(xml).toContain('Cherbourg-en-Cotentin, le');
    expect(xml).toContain('&amp; personnalisable &lt;exemple&gt;'); expect(xml).toContain('Marie EXEMPLE');
    expect(xml).toContain('<w:b/>'); expect(xml).toContain('<w:i/>'); expect(xml).toContain('<w:u w:val="single"/>');
    expect(xml).toContain('w:ascii="Times New Roman"'); expect(xml).toContain('<w:sz w:val="28"/>');
    expect(xml).toContain('<w:jc w:val="center"/>'); expect(xml.match(/<w:numPr>/g)).toHaveLength(3);
    const document = new DOMParser().parseFromString(xml, 'application/xml');
    expect(document.querySelector('parsererror')).toBeNull();
    expect(document.querySelectorAll('hyperlink')).toHaveLength(1);
    const rels = await generated.file('word/_rels/document.xml.rels')!.async('string');
    expect(rels).toContain('https://example.com/?a=1&amp;b=2'); expect(rels).toContain('TargetMode="External"');
    const numbering = await generated.file('word/disciplinary-numbering.xml')!.async('string');
    expect(numbering).toContain('w:val="decimal"'); expect(numbering).toContain('w:val="bullet"');
    expect(xml).toContain('rIdDisciplinarySignature'); expect(xml).toContain('<w:jc w:val="right"/>');
    expect(await generated.file('word/_rels/document.xml.rels')!.async('string')).toContain('media/disciplinary-signature.png');
    expect(generated.file('word/media/disciplinary-signature.png')).not.toBeNull();
    const directory = '.design-qa/disciplinary';
    await mkdir(directory, { recursive: true });
    await writeFile(`${directory}/letter-example.docx`, bytes);
  });
});
