// @vitest-environment node
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { ORG_CONTACT_CONTENT, type OrgContactPerson } from './organigrammeContacts';
import { buildOrgPersonnelWorkbook } from './organigrammeContactsWorkbook';

const person: OrgContactPerson = {
  id: 1,
  name: 'Élodie MARTIN',
  functionLabel: 'Capitaine',
  population: 'marin',
  email: '=mailto & <contact>',
  phone: '06 12 34 56 78',
  vesselLabel: 'SUROÎT',
  watchLabel: 'Bordée 2',
};
const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/9ioAAAAASUVORK5CYII=';

describe('personnel workbook', () => {
  it('writes the chosen fields in the supplied order and preserves phone numbers as text', async () => {
    const second = { ...person, id: 2, name: 'Alice LAURENT', email: null, phone: null };
    const blob = await buildOrgPersonnelWorkbook([person, second], { ...ORG_CONTACT_CONTENT, showVessels: true, showWatches: true });
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const archive = await JSZip.loadAsync(await blob.arrayBuffer());
    const workbook = await archive.file('xl/workbook.xml')!.async('string');
    const sheet = await archive.file('xl/worksheets/sheet1.xml')!.async('string');

    expect(workbook).toContain('name="Liste du personnel"');
    expect(sheet).toContain('ySplit="1" topLeftCell="A2"');
    expect(sheet).toContain('<autoFilter ref="A1:F3"/>');
    expect(sheet).toContain('<c r="D2" s="0" t="inlineStr"><is><t xml:space="preserve">06 12 34 56 78</t>');
    expect(sheet).toContain('=mailto &amp; &lt;contact&gt;');
    expect(sheet).not.toContain('<f>');
    expect(sheet).toContain('Capitaine');
    expect(sheet).toContain('SUROÎT');
    expect(sheet).toContain('Bordée 2');
    expect(sheet).toContain('<c r="A2" s="0" t="inlineStr"><is><t xml:space="preserve">Élodie MARTIN</t>');
    expect(sheet).toContain('<c r="A3" s="0" t="inlineStr"><is><t xml:space="preserve">Alice LAURENT</t>');
  });

  it('omits unchecked columns and their contents, and embeds selected portraits at the corresponding row', async () => {
    const contents = { showPhotos: true, showFunctions: false, showEmails: false, showPhones: false, showVessels: false, showWatches: false };
    const people = [person, { ...person, id: 2, name: 'Alice LAURENT', photoUrl: `data:image/png;base64,${pixel}` }];
    const archive = await JSZip.loadAsync(await (await buildOrgPersonnelWorkbook(people, contents)).arrayBuffer());
    const sheet = await archive.file('xl/worksheets/sheet1.xml')!.async('string');
    const drawing = await archive.file('xl/drawings/drawing1.xml')!.async('string');
    const image = await archive.file('xl/media/portrait1.png')!.async('base64');

    expect(sheet).toContain('>Photo</t>');
    expect(sheet).toContain('<autoFilter ref="A1:B3"/>');
    expect(sheet).toContain('<drawing r:id="rId1"/>');
    expect(sheet).not.toMatch(/Fonction|Capitaine|Email|mailto|Téléphone|06 12 34 56 78|Navire|SUROÎT|Bordée/);
    expect(drawing.match(/<xdr:row>2<\/xdr:row>/g)).toHaveLength(2);
    expect(drawing.match(/<xdr:twoCellAnchor editAs="twoCell">/g)).toHaveLength(1);
    expect(image).toBe(pixel);

    const withoutPortrait = await buildOrgPersonnelWorkbook(people, { ...contents, showPhotos: false });
    const withoutPortraitArchive = await JSZip.loadAsync(await withoutPortrait.arrayBuffer());
    expect(withoutPortraitArchive.file('xl/drawings/drawing1.xml')).toBeNull();
    expect(withoutPortraitArchive.file('xl/media/portrait1.png')).toBeNull();
  });

  it('rejects an empty selection and only blocks unavailable portraits when requested', async () => {
    const unavailable = [{ ...person, photoUnavailable: true }];
    await expect(buildOrgPersonnelWorkbook([])).rejects.toThrow('Sélectionnez');
    await expect(buildOrgPersonnelWorkbook(unavailable, { ...ORG_CONTACT_CONTENT, showPhotos: true })).rejects.toThrow('photo sélectionnée');
    await expect(buildOrgPersonnelWorkbook(unavailable)).resolves.toBeInstanceOf(Blob);
  });
});
