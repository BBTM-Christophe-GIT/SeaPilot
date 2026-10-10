// @vitest-environment node
import JSZip from 'jszip';
import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import {
  buildCollaboratorSheetPdf,
  buildCollaboratorSheetSections,
  buildCollaboratorSheetsExport,
  selectCollaboratorSheetSections,
  type CollaboratorSheetSection,
  type CollaboratorSheetSelection,
} from './collaboratorSheet';
import type { HrDocumentRecord, PersonRecord } from './peopleQueries';

const person: PersonRecord = {
  id: 7, userId: 'marin-7', firstName: 'Luc', lastName: 'MARTIN', email: 'private-email@example.test',
  functionLabel: 'Matelot polyvalent', enimFunctionCode: '', enimCategory: null, gradeLabel: 'Matelot',
  roleLabel: 'Navigant', registerLabel: 'RIF', sex: 'Homme', sailorNumber: '009875', employeeNumber: '00051',
  phone: '0123456789', postalAddress: 'PRIVATEADDRESS 1 quai du Port', birthDate: '1985-04-12', birthPlace: 'Rouen',
  identityDocumentNumber: 'PRIVATEIDENTITYNUMBER', identityDocumentType: 'Passeport', contractType: 'CDI',
  hiredOn: '2024-01-01', departedOn: '', departureReason: '', emergencyContactName: 'Marie MARTIN',
  emergencyContactRelationship: 'Conjointe', emergencyContactPhone: '0600000000', emergencyContactAddress: '2 rue du Port',
  waistSize: '84', chestSize: '102', fullHeightSize: '178', inseamSize: '82', hipSize: '96', weightKg: '78',
  shoeSize: '43', coverallSize: 'L', pantsSize: '42', jacketSize: 'L', deckCertificateLabel: 'Capitaine 200',
  engineCertificateLabel: 'Mecanicien 250 kW', craneTrainingOn: '2025-03-10', craneInductionOn: '2025-03-12', active: true,
};

const medicalDocument: HrDocumentRecord = {
  id: 10, personId: person.id, personName: 'Luc MARTIN', personSharePointItemId: '7',
  categoryKey: 'medical_visit', title: 'VISITREPORT', status: 'renew_due', issuedOn: '2025-01-15',
  expiresOn: '2026-08-15', requiresCaptainValidation: false, medicalRestriction: 'PRIVATERESTRICTION',
  medicalBridgeWatch: false, medicalUnfit: false, sourceLabel: 'RH', notes: 'PRIVATEMEDICALNOTE',
  fileUrl: 'https://private.test/report.pdf', storageBucket: 'private-hr', storagePath: 'secret/path.pdf',
  fileSizeBytes: 1234, mimeType: 'application/pdf',
};
const certificate: HrDocumentRecord = {
  ...medicalDocument, id: 11, categoryKey: 'deck', title: 'CERTIFICATEREPORT', notes: 'PUBLICCERTIFICATENOTE',
  medicalRestriction: '', medicalBridgeWatch: null,
};
const annualReview: HrDocumentRecord = { ...certificate, id: 12, categoryKey: 'annual_review', title: 'ANNUALREPORT' };
const allSections = new Set([
  'identity', 'contract', 'contact', 'emergency', 'administrative', 'health', 'clothing', 'signature', 'annualReviews', 'documents',
]);

function selectAll(sections: CollaboratorSheetSection[]): CollaboratorSheetSelection {
  return Object.fromEntries(sections.map((section) => [
    section.key, [...section.fields.map((field) => field.key), ...(section.table?.columns.map((column) => column.key) || [])],
  ]));
}

async function inspectPdf(blob: Blob): Promise<{ pdf: PDFDocument; content: string }> {
  const pdf = await PDFDocument.load(await blob.arrayBuffer());
  const content = pdf.context.enumerateIndirectObjects().flatMap(([, object]) => {
    if (!(object instanceof PDFRawStream)) return [];
    return [new TextDecoder('windows-1252').decode(decodePDFRawStream(object).decode())];
  }).join('\n');
  return { pdf, content };
}

function pageContent(pdf: PDFDocument, pageIndex: number): string {
  const contents = pdf.getPage(pageIndex).node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
  return streams.map((entry) => {
    const stream = pdf.context.lookup(entry);
    if (!(stream instanceof PDFRawStream)) return '';
    const content = new TextDecoder('windows-1252').decode(decodePDFRawStream(stream).decode());
    return content.replace(/<([0-9a-f]+)>/gi, (_, hex: string) => new TextDecoder('windows-1252').decode(
      Uint8Array.from(hex.match(/../g) || [], (byte) => parseInt(byte, 16)),
    ));
  }).join('\n');
}

describe('collaborator sheet data and visibility', () => {
  it('mirrors all profile sections except signature and preserves textual personnel identifiers', () => {
    const sections = buildCollaboratorSheetSections(person, [certificate, medicalDocument, annualReview], allSections);
    expect(sections.map((section) => section.key)).toEqual([...allSections].filter((key) => key !== 'signature'));
    expect(sections.find((section) => section.key === 'identity')?.fields.find((field) => field.key === 'employeeNumber')?.value).toBe('00051');
    expect(sections.find((section) => section.key === 'contract')?.fields).toEqual(expect.arrayContaining([
      { key: 'enimFunctionCode', label: 'Code Fonction ENIM', value: 'PA01A' },
      { key: 'enimCategory', label: 'Catégorie', value: '5' },
      { key: 'birthDate', label: 'Date naissance', value: '12/04/1985' },
    ]));
  });

  it('scopes every list to personId, never matching an unassigned or different person by name', () => {
    const sections = buildCollaboratorSheetSections(person, [
      certificate, medicalDocument, annualReview,
      { ...medicalDocument, id: 13, personId: 8, title: 'OTHERPERSONVISIT' },
      { ...certificate, id: 14, personId: null, title: 'UNASSIGNEDREPORT' },
    ], allSections);
    expect(sections.find((section) => section.key === 'health')?.table?.rows.map((row) => row.title)).toEqual(['VISITREPORT']);
    expect(sections.find((section) => section.key === 'documents')?.table?.rows.map((row) => row.title)).toEqual(['CERTIFICATEREPORT', 'VISITREPORT']);
    expect(sections.find((section) => section.key === 'annualReviews')?.table?.rows.map((row) => row.title)).toEqual(['ANNUALREPORT']);
    expect(JSON.stringify(sections)).not.toMatch(/OTHERPERSONVISIT|UNASSIGNEDREPORT|secret\/path|private-hr/);
  });

  it('uses the stored ENIM classification before the derived function default', () => {
    const sections = buildCollaboratorSheetSections({
      ...person, enimFunctionCode: 'CUSTOMCODE', enimCategory: 9,
    }, [], new Set(['contract']));
    expect(sections[0].fields).toEqual(expect.arrayContaining([
      { key: 'enimFunctionCode', label: 'Code Fonction ENIM', value: 'CUSTOMCODE' },
      { key: 'enimCategory', label: 'Catégorie', value: '9' },
    ]));
  });

  it('includes medical dates, aptitude, watch permission and restriction only in the health table', () => {
    const sections = buildCollaboratorSheetSections(person, [medicalDocument], allSections);
    expect(sections.find((section) => section.key === 'health')?.table?.rows[0]).toEqual({
      title: 'VISITREPORT', issuedOn: '15/01/2025', expiresOn: '15/08/2026', status: 'À renouveler',
      aptitude: 'Apte avec restrictions', bridgeWatch: 'Non autorisée', restriction: 'PRIVATERESTRICTION', notes: 'PRIVATEMEDICALNOTE',
    });
    const restrictedSections = buildCollaboratorSheetSections(person, [medicalDocument], new Set(['identity', 'documents', 'signature']));
    expect(restrictedSections.map((section) => section.key)).toEqual(['identity', 'documents']);
    expect(restrictedSections.find((section) => section.key === 'documents')?.table?.rows[0]?.title).toBe('VISITREPORT');
    expect(JSON.stringify(restrictedSections)).not.toMatch(/PRIVATERESTRICTION|PRIVATEMEDICALNOTE|medicalBridgeWatch|medicalUnfit|aptitude/);
  });

  it('reports unfitness and unknown medical conditions without inventing aptitude', () => {
    const sections = buildCollaboratorSheetSections(person, [
      { ...medicalDocument, medicalUnfit: true },
      { ...medicalDocument, id: 20, medicalRestriction: '', medicalBridgeWatch: null },
    ], new Set(['health']));
    expect(sections[0].table?.rows[0]).toMatchObject({ aptitude: 'Inapte à la navigation', bridgeWatch: 'Sans objet' });
    expect(sections[0].table?.rows[1]).toMatchObject({ aptitude: 'Non renseigné', bridgeWatch: 'Non renseigné' });
  });

  it('removes deselected values and forged signature fields from the render model', () => {
    const sections = buildCollaboratorSheetSections(person, [medicalDocument], allSections);
    sections[0].fields.push({ key: 'signature', label: 'Signature', value: 'FORGEDSIGNATURE' });
    const selected = selectCollaboratorSheetSections(sections, {
      identity: ['employeeNumber', 'signature'], health: ['issuedOn', 'expiresOn'], documents: ['title', 'notes'], signature: ['image'],
    });
    expect(selected[0].fields).toEqual([{ key: 'employeeNumber', label: 'Matricule', value: '00051' }]);
    expect(selected.find((section) => section.key === 'health')?.table?.rows[0]).toEqual({ issuedOn: '15/01/2025', expiresOn: '15/08/2026' });
    expect(JSON.stringify(selected)).not.toMatch(/PRIVATE|FORGEDSIGNATURE|signature/);
  });
});

describe('collaborator sheet PDF', () => {
  it('renders only selected fields and document columns while retaining the minimal report identity', async () => {
    const sections = buildCollaboratorSheetSections(person, [certificate, medicalDocument], allSections);
    const generated = await buildCollaboratorSheetPdf(person, sections, {
      contract: ['contractType'], documents: ['title'], health: ['issuedOn'],
      identity: ['doesNotExist'], signature: ['image'],
    }, new Date('2026-10-10T22:30:00Z'));
    const { pdf, content } = await inspectPdf(generated.blob);
    expect(generated.fileName).toBe('Fiche-Collaborateur-Luc-MARTIN-2026-10-11.pdf');
    expect(generated.blob.type).toBe('application/pdf');
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getPage(0).getWidth()).toBeCloseTo(595.28, 1);
    expect(pdf.getPage(0).getHeight()).toBeCloseTo(841.89, 1);
    expect(content).toContain('Luc MARTIN');
    expect(content).toContain('CDI');
    expect(content).toContain('CERTIFICATEREPORT');
    expect(content).toContain('VISITREPORT');
    expect(content).toContain('15/01/2025');
    expect(content).not.toMatch(/PRIVATE|00051|0123456789|signature|15\/08\/2026/i);
  });

  it('rejects an empty selection and a forged signature-only section', async () => {
    const sections = buildCollaboratorSheetSections(person, [], allSections);
    await expect(buildCollaboratorSheetPdf(person, sections, {})).rejects.toThrow('Sélectionnez au moins une information');
    await expect(buildCollaboratorSheetPdf(person, sections, { identity: ['unknown'] })).rejects.toThrow('Sélectionnez au moins une information');
    await expect(buildCollaboratorSheetPdf(person, [
      { key: 'signature', label: 'Signature', fields: [{ key: 'image', label: 'Signature', value: 'FORGEDSIGNATURE' }] },
    ], { signature: ['image'] })).rejects.toThrow('Sélectionnez au moins une information');
  });

  it('never restores unavailable health data through stale selection keys in the PDF', async () => {
    const sections = buildCollaboratorSheetSections(person, [medicalDocument], new Set(['documents']));
    const generated = await buildCollaboratorSheetPdf(person, sections, {
      documents: ['title', 'notes', 'restriction', 'aptitude'], health: ['restriction', 'notes'],
    });
    const { content } = await inspectPdf(generated.blob);
    expect(content).toContain('VISITREPORT');
    expect(content).not.toMatch(/PRIVATERESTRICTION|PRIVATEMEDICALNOTE/);
  });

  it('wraps long content across pages and numbers every page', async () => {
    const longDocuments = Array.from({ length: 55 }, (_, index) => ({
      ...certificate, id: index + 100, title: `REPORT${index + 1}`,
      notes: `LONGNOTE${index + 1} ` + 'Compte rendu complet des formations et renouvellements. '.repeat(12),
    }));
    const sections = buildCollaboratorSheetSections({ ...person, postalAddress: 'Adresse complète. '.repeat(100) }, longDocuments, new Set(['contact', 'documents']));
    const generated = await buildCollaboratorSheetPdf(person, sections, selectAll(sections), new Date('2026-10-10T12:00:00Z'));
    const { pdf, content } = await inspectPdf(generated.blob);
    expect(pdf.getPageCount()).toBeGreaterThan(2);
    expect(content).toContain('LONGNOTE1');
    expect(content).toContain('LONGNOTE55');
    expect(content).toContain(`Page 1 / ${pdf.getPageCount()}`);
    expect(content).toContain(`Page ${pdf.getPageCount()} / ${pdf.getPageCount()}`);
    expect(content.match(/Fiche Collaborateur/g)?.length).toBe(pdf.getPageCount());
  });

  it('uses a safe filename and explicitly renders an empty document list', async () => {
    const sections = buildCollaboratorSheetSections(person, [], new Set(['documents']));
    const generated = await buildCollaboratorSheetPdf({ ...person, firstName: 'Luc/<>', lastName: 'MARTIN : "Test"' }, sections, { documents: ['title'] }, new Date('2026-10-10T12:00:00Z'));
    expect(generated.fileName).toBe('Fiche-Collaborateur-Luc-MARTIN-Test-2026-10-10.pdf');
    const { content } = await inspectPdf(generated.blob);
    expect(content).toContain('Aucun document');
  });
});

describe('multiple collaborator sheets export', () => {
  it('packages one PDF per unique ID, preserving homonyms and restricting each sheet to its own authorized data', async () => {
    const homonym = { ...person, id: 8, employeeNumber: '00052' };
    const people = [person, homonym, { ...person, firstName: 'DUPLICATEMUSTNOTREPLACE' }];
    const documents = [
      certificate, medicalDocument,
      { ...certificate, id: 30, personId: homonym.id, title: 'SECONDREPORT' },
      { ...certificate, id: 31, personId: null, title: 'UNASSIGNEDREPORT' },
      { ...certificate, id: 32, personId: 9, title: 'UNSELECTEDREPORT' },
    ];
    const generated = await buildCollaboratorSheetsExport(people, documents, new Set(['identity', 'documents']), {
      identity: ['employeeNumber', 'signature'], documents: ['title', 'notes', 'restriction'], health: ['restriction', 'notes'],
    }, 'separate', new Date('2026-10-10T22:30:00Z'));
    expect(generated.fileName).toBe('Fiches-Collaborateurs-2-2026-10-11.zip');
    expect(generated.blob.type).toBe('application/zip');
    const archive = await JSZip.loadAsync(await generated.blob.arrayBuffer());
    const names = Object.keys(archive.files);
    expect(names).toEqual([
      'Fiche-Collaborateur-Luc-MARTIN-ID7-2026-10-11.pdf',
      'Fiche-Collaborateur-Luc-MARTIN-ID8-2026-10-11.pdf',
    ]);
    const first = await inspectPdf(new Blob([await archive.file(names[0])!.async('arraybuffer')]));
    const second = await inspectPdf(new Blob([await archive.file(names[1])!.async('arraybuffer')]));
    expect(first.pdf.getPageCount()).toBe(1);
    expect(first.content).toContain('00051');
    expect(first.content).toContain('CERTIFICATEREPORT');
    expect(first.content).toContain('VISITREPORT');
    expect(first.content).not.toMatch(/SECONDREPORT|00052|PRIVATE|DUPLICATEMUSTNOTREPLACE|UNASSIGNEDREPORT|UNSELECTEDREPORT|signature/i);
    expect(second.content).toContain('00052');
    expect(second.content).toContain('SECONDREPORT');
    expect(second.content).not.toMatch(/CERTIFICATEREPORT|VISITREPORT|00051|PRIVATE|UNASSIGNEDREPORT|UNSELECTEDREPORT/i);
    expect(people[0]).toBe(person);
    expect(documents[0]).toBe(certificate);
  });

  it('starts each grouped sheet on a new page and preserves its identity and complete pagination across long lists', async () => {
    const secondPerson = { ...person, id: 8, firstName: 'Anne', lastName: 'DURAND' };
    const longDocuments = Array.from({ length: 35 }, (_, index) => ({
      ...certificate, id: index + 100, title: `FIRSTREPORT${index + 1}`,
      notes: `FIRSTNOTE${index + 1} ` + 'Compte rendu des formations et renouvellements. '.repeat(10),
    }));
    const sections = buildCollaboratorSheetSections(person, longDocuments, new Set(['documents']));
    const selection = { documents: ['title', 'notes'], contact: ['phone'], health: ['notes'] };
    const firstSheet = await buildCollaboratorSheetPdf(person, sections, selection);
    const firstPageCount = (await inspectPdf(firstSheet.blob)).pdf.getPageCount();
    const generated = await buildCollaboratorSheetsExport([person, secondPerson], [
      ...longDocuments,
      { ...certificate, id: 200, personId: secondPerson.id, title: 'SECONDREPORT', notes: 'SECONDNOTE' },
      { ...certificate, id: 201, personId: 9, title: 'UNSELECTEDREPORT' },
    ], new Set(['documents']), selection, 'combined', new Date('2026-10-10T12:00:00Z'));
    const { pdf, content } = await inspectPdf(generated.blob);
    expect(generated.fileName).toBe('Fiches-Collaborateurs-2-2026-10-10.pdf');
    expect(generated.blob.type).toBe('application/pdf');
    expect(firstPageCount).toBeGreaterThan(2);
    expect(pdf.getPageCount()).toBe(firstPageCount + 1);
    for (let page = 0; page < firstPageCount; page += 1) {
      const text = pageContent(pdf, page);
      expect(text).toContain('Luc MARTIN');
      expect(text).toContain(`Page ${page + 1} / ${firstPageCount}`);
      expect(text).toContain('Fiche 1 / 2');
      expect(text).not.toMatch(/Anne DURAND|SECONDREPORT|SECONDNOTE/);
    }
    expect(pageContent(pdf, firstPageCount - 1)).toContain('FIRSTNOTE35');
    const secondPage = pageContent(pdf, firstPageCount);
    expect(secondPage).toContain('Anne DURAND');
    expect(secondPage).toContain('SECONDREPORT');
    expect(secondPage).toContain('SECONDNOTE');
    expect(secondPage).toContain('Page 1 / 1');
    expect(secondPage).toContain('Fiche 2 / 2');
    expect(secondPage).not.toMatch(/Luc MARTIN|FIRSTREPORT|FIRSTNOTE/);
    expect(content).not.toMatch(/PRIVATE|0123456789|UNSELECTEDREPORT/);
  });

  it.each(['separate', 'combined'] as const)('rejects empty people and selections outside available sections for %s exports', async (mode) => {
    await expect(buildCollaboratorSheetsExport([], [], allSections, { identity: ['employeeNumber'] }, mode))
      .rejects.toThrow('Sélectionnez au moins un collaborateur');
    await expect(buildCollaboratorSheetsExport([person], [], allSections, {}, mode))
      .rejects.toThrow('Sélectionnez au moins une information');
    await expect(buildCollaboratorSheetsExport([person], [medicalDocument], new Set(['identity']), {
      identity: ['unknown'], health: ['restriction'], signature: ['image'],
    }, mode)).rejects.toThrow('Sélectionnez au moins une information');
  });
});
