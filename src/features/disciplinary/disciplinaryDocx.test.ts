// @vitest-environment node
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildDisciplinaryDocx } from './disciplinaryDocx';
import { generateLetter, initialForm } from './disciplinaryModel';

describe('editable BBTM letters', () => {
  it('retains the supplied letterhead, escapes text and embeds the signature in the Office package', async () => {
    const template = await readFile('public/templates/disciplinary-letterhead-bbtm.docx');
    const person = { id: 1, companyId: 1, firstName: 'Camille', lastName: 'EXEMPLE', functionLabel: 'Matelot', postalAddress: '10 rue Exemple\n50100 Cherbourg-en-Cotentin', hiredOn: '2024-01-01', departedOn: '', contractType: 'CDI' };
    const form = { ...initialForm(person), facts: 'TEST TECHNIQUE — Aucun fait réel. Texte modifiable & personnalisable <exemple>.', evidence: 'Pièce de démonstration.', rules: 'Consigne de démonstration' };
    const signature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGZkAAAAASUVORK5CYII=';
    const letter = generateLetter(form, 'notification', { name: 'Marie EXEMPLE', function: 'Direction — TEST', signature });
    letter.subject = `TEST TECHNIQUE — ${letter.subject}`;
    const blob = await buildDisciplinaryDocx(letter, template.buffer.slice(template.byteOffset, template.byteOffset + template.byteLength));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const original = await JSZip.loadAsync(template), generated = await JSZip.loadAsync(bytes);
    for (const path of Object.keys(original.files).filter((p) => /word\/(header|footer|media)/.test(p) && !original.files[p].dir)) {
      expect(await generated.file(path)!.async('uint8array')).toEqual(await original.file(path)!.async('uint8array'));
    }
    const xml = await generated.file('word/document.xml')!.async('string');
    expect(xml).toContain('Camille EXEMPLE'); expect(xml).toContain('Cherbourg-en-Cotentin, le');
    expect(xml).toContain('&amp; personnalisable &lt;exemple&gt;'); expect(xml).toContain('Marie EXEMPLE');
    expect(xml).toContain('rIdDisciplinarySignature'); expect(xml).toContain('<w:jc w:val="right"/>');
    expect(await generated.file('word/_rels/document.xml.rels')!.async('string')).toContain('media/disciplinary-signature.png');
    expect(generated.file('word/media/disciplinary-signature.png')).not.toBeNull();
    const directory = '.design-qa/disciplinary';
    await mkdir(directory, { recursive: true });
    await writeFile(`${directory}/letter-example.docx`, bytes);
  });
});
