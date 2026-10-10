// @vitest-environment node
import JSZip from 'jszip';
import { decodePDFRawStream, PDFArray, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import {
  buildCollaboratorSheetPdf,
  buildCollaboratorSheetSections,
  buildCollaboratorSheetsExport,
  groupCollaboratorSheetRows,
  selectCollaboratorSheetSections,
  type CollaboratorSheetSection,
  type CollaboratorSheetSelection,
} from './collaboratorSheet';
import type { HrDocumentRecord, HrDocumentTypeOption, PersonRecord } from './peopleQueries';

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
const administrativeDocument: HrDocumentRecord = { ...certificate, id: 13, categoryKey: 'administrative', title: 'ADMINISTRATIVEREPORT' };
const documentTypes: HrDocumentTypeOption[] = [
  { id: 501, sourceItemId: 501, name: 'Certificat de formation de base à la sécurité', fileName: 'CFBS', categoryKey: 'safety_training', categoryLabel: 'Formation de Sécurité' },
  { id: 502, sourceItemId: 502, name: 'Certificat médical d’aptitude à la navigation maritime', fileName: 'Visite Médicale', categoryKey: 'medical_visit', categoryLabel: 'Visite Médicale' },
  { id: 503, sourceItemId: 503, name: 'Brevet de mécanicien 250 kW', fileName: 'MEC250', categoryKey: 'engine', categoryLabel: 'Machine' },
  { id: 504, sourceItemId: 504, name: 'Attestation de qualification avancée à la lutte contre l’incendie', fileName: 'Z-TRAIN', categoryKey: 'safety_training', categoryLabel: 'Formation de Sécurité' },
  { id: 505, sourceItemId: 505, name: 'Formation de base avancée', fileName: 'A-TRAIN', categoryKey: 'safety_training', categoryLabel: 'Formation de Sécurité' },
  { id: 506, sourceItemId: 506, name: 'CQALI - Certificat de qualification avancée à la lutte contre l’incendie', fileName: 'CQALI', categoryKey: 'safety_training', categoryLabel: 'Formation de Sécurité' },
  { id: 507, sourceItemId: 507, name: 'LEMS — HSE Induction', fileName: 'LEMS - HSE Induction', categoryKey: 'safety_induction', categoryLabel: 'Safety Induction' },
];
const pngPhoto = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC';
const jpegPhoto = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAADAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDn6KKK+sPmD//Z';
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
    if (!(object instanceof PDFRawStream) || object.dict.get(PDFName.of('Subtype'))?.toString() === '/Image') return [];
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

function imageCount(pdf: PDFDocument): number {
  return pdf.context.enumerateIndirectObjects().filter(([, object]) => object instanceof PDFRawStream
    && object.dict.get(PDFName.of('Subtype'))?.toString() === '/Image').length;
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

  it('lists certificates and medical visits by category with only the four requested columns and excludes administrative files', () => {
    const sections = buildCollaboratorSheetSections(person, [
      medicalDocument, administrativeDocument, annualReview, certificate,
      { ...certificate, id: 15, categoryKey: 'engine', title: 'Machine Z' },
      { ...certificate, id: 16, categoryKey: 'engine', title: 'Machine A', expiresOn: '2027-01-01' },
      { ...certificate, id: 17, categoryKey: 'engine', title: 'Machine A', expiresOn: '2026-01-01' },
      { ...certificate, id: 18, categoryKey: 'engine', title: 'Machine A', expiresOn: '2026-01-01', status: 'valid' },
      { ...certificate, id: 19, categoryKey: 'certificate', title: 'Certificat' },
    ], new Set(['annualReviews', 'documents']));
    const documentSection = sections.find((section) => section.key === 'documents')!;
    expect(documentSection.label).toBe('Brevets et visites médicales');
    expect(documentSection.table?.columns.map((column) => column.key)).toEqual(['category', 'title', 'expiresOn', 'status']);
    expect(documentSection.table?.rows.map((row) => [row.category, row.title, row.expiresOn, row.status])).toEqual([
      ['Certificats', 'Certificat', '15/08/2026', 'À renouveler'],
      ['Machine', 'Machine A', '01/01/2026', 'À renouveler'],
      ['Machine', 'Machine A', '01/01/2026', 'À jour'],
      ['Machine', 'Machine A', '01/01/2027', 'À renouveler'],
      ['Machine', 'Machine Z', '15/08/2026', 'À renouveler'],
      ['Pont', 'CERTIFICATEREPORT', '15/08/2026', 'À renouveler'],
      ['Visite Médicale', 'VISITREPORT', '15/08/2026', 'À renouveler'],
    ]);
    expect(JSON.stringify(documentSection)).not.toMatch(/issuedOn|sourceLabel|notes|ADMINISTRATIVEREPORT|ANNUALREPORT/);
    const annualSection = sections.find((section) => section.key === 'annualReviews')!;
    expect(annualSection.table?.columns.map((column) => column.key)).toEqual([
      'title', 'category', 'issuedOn', 'expiresOn', 'status', 'sourceLabel', 'notes',
    ]);
    expect(annualSection.table?.rows[0]).toMatchObject({
      title: 'ANNUALREPORT', issuedOn: '15/01/2025', sourceLabel: 'RH', notes: 'PUBLICCERTIFICATENOTE',
    });
  });

  it('uses full catalog names after removing the collaborator, year and file extension without mutating source records', () => {
    const storedDocuments = [
      { ...certificate, id: 21, categoryKey: 'safety_training', title: 'Luc MARTIN - cfbs - 2026.PDF' },
      { ...medicalDocument, id: 22, title: 'luc martin - VISITE MEDICALE - 2026.PdF' },
      { ...certificate, id: 23, categoryKey: 'engine', title: 'Luc MARTIN - MEC250 - 2026.pdf' },
      { ...certificate, id: 24, categoryKey: 'safety_training', title: 'Luc MARTIN - CERTIFICAT DE FORMATION DE BASE A LA SECURITE - 2026.pdf' },
      { ...administrativeDocument, id: 25, title: 'Luc MARTIN - ADMIN-ALIAS - 2026.pdf' },
    ];
    const sourceDocuments = structuredClone(storedDocuments);
    const sourceCatalog = structuredClone(documentTypes);
    const sections = buildCollaboratorSheetSections(person, storedDocuments, new Set(['documents']), documentTypes);
    const documentSection = sections[0];
    expect(documentSection.table?.rows.map((row) => row.title)).toEqual([
      'Certificat de formation de base à la sécurité',
      'Certificat de formation de base à la sécurité',
      'Brevet de mécanicien 250 kW',
      'Certificat médical d’aptitude à la navigation maritime',
    ]);
    expect(documentSection.table?.columns.map((column) => column.label)).toEqual(['Catégorie', 'Document', 'Échéance', 'Statut']);
    expect(JSON.stringify(documentSection)).not.toMatch(/ADMIN-ALIAS|Luc MARTIN|2026\.pdf/i);
    expect(storedDocuments).toEqual(sourceDocuments);
    expect(documentTypes).toEqual(sourceCatalog);
  });

  it('sorts by category and the displayed full name rather than by the stored abbreviation', () => {
    const sections = buildCollaboratorSheetSections(person, [
      { ...certificate, id: 30, categoryKey: 'safety_training', title: 'Luc MARTIN - A-TRAIN - 2026.pdf' },
      { ...certificate, id: 31, categoryKey: 'safety_training', title: 'Luc MARTIN - Z-TRAIN - 2026.pdf' },
      { ...certificate, id: 32, categoryKey: 'engine', title: 'Luc MARTIN - MEC250 - 2026.pdf' },
      { ...medicalDocument, id: 33, title: 'Luc MARTIN - Visite Médicale - 2026.pdf' },
    ], new Set(['documents']), documentTypes);
    expect(sections[0].table?.rows.map((row) => [row.category, row.title])).toEqual([
      ['Formation de Sécurité', 'Attestation de qualification avancée à la lutte contre l’incendie'],
      ['Formation de Sécurité', 'Formation de base avancée'],
      ['Machine', 'Brevet de mécanicien 250 kW'],
      ['Visite Médicale', 'Certificat médical d’aptitude à la navigation maritime'],
    ]);
  });

  it('preserves cleaned unknown, ambiguous and category-mismatched names instead of inventing a catalog match', () => {
    const ambiguousCatalog = [
      ...documentTypes,
      { ...documentTypes[0], id: 601, name: 'Formation de sûreté spécifique', fileName: 'AMBIGU' },
      { ...documentTypes[0], id: 602, name: 'Formation de sécurité spécifique', fileName: 'AMBIGU' },
    ];
    const sections = buildCollaboratorSheetSections(person, [
      { ...certificate, id: 41, categoryKey: 'safety_training', title: 'Luc MARTIN - Brevet inconnu détaillé - 2026.pdf' },
      { ...certificate, id: 42, categoryKey: 'safety_training', title: 'Luc MARTIN - AMBIGU - 2026.pdf' },
      { ...certificate, id: 43, categoryKey: 'deck', title: 'Luc MARTIN - CFBS - 2026.pdf' },
    ], new Set(['documents']), ambiguousCatalog);
    expect(sections[0].table?.rows.map((row) => row.title)).toEqual(['AMBIGU', 'Brevet inconnu détaillé', 'CFBS']);
    expect(JSON.stringify(sections)).not.toMatch(/Formation de sûreté spécifique|Formation de sécurité spécifique|Certificat de formation de base à la sécurité/);
  });

  it('resolves the confirmed CQUALI spelling as CQALI only in its catalog category and retains the complete catalog title', () => {
    const sections = buildCollaboratorSheetSections(person, [
      { ...certificate, id: 51, categoryKey: 'safety_training', title: 'Luc MARTIN - CQUALI - 2026.pdf' },
      { ...certificate, id: 52, categoryKey: 'safety_training', title: 'Luc MARTIN - cquali - 2026.pdf' },
      { ...certificate, id: 53, categoryKey: 'safety_training', title: 'Luc MARTIN - CQALI - 2026.pdf' },
      { ...certificate, id: 54, categoryKey: 'deck', title: 'Luc MARTIN - CQUALI - 2026.pdf' },
    ], new Set(['documents']), documentTypes);
    expect(sections[0].table?.rows.map((row) => row.title)).toEqual([
      documentTypes[5].name, documentTypes[5].name, documentTypes[5].name, 'CQUALI',
    ]);
  });

  it('resolves the confirmed historical HSE Induction name to its complete LEMS catalog name in the same category', () => {
    const sections = buildCollaboratorSheetSections(person, [
      { ...certificate, id: 55, categoryKey: 'safety_induction', title: 'Luc MARTIN - HSE Induction - 2026.pdf' },
      { ...certificate, id: 56, categoryKey: 'safety_induction', title: 'Luc MARTIN - hse induction - 2026.PDF' },
      { ...certificate, id: 57, categoryKey: 'deck', title: 'Luc MARTIN - HSE Induction - 2026.pdf' },
    ], new Set(['documents']), documentTypes);
    expect(sections[0].table?.rows.map((row) => [row.category, row.title])).toEqual([
      ['Pont', 'HSE Induction'], ['Safety Induction', documentTypes[6].name], ['Safety Induction', documentTypes[6].name],
    ]);
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

  it('revalidates grouping against the document schema and selected category without allowing forged grouping in other sections', () => {
    const sections = buildCollaboratorSheetSections(person, [certificate, medicalDocument, annualReview], allSections);
    const documentSection = sections.find((section) => section.key === 'documents')!;
    expect(documentSection.table?.groupBy).toBe('category');
    const grouped = selectCollaboratorSheetSections(sections, { documents: ['category', 'title'] });
    expect(grouped[0].table?.groupBy).toBe('category');
    const flat = selectCollaboratorSheetSections(sections, { documents: ['title'] });
    expect(flat[0].table?.groupBy).toBeUndefined();
    expect(flat[0].table?.rows[0]).toEqual({ title: 'CERTIFICATEREPORT' });

    const annualSection = sections.find((section) => section.key === 'annualReviews')!;
    annualSection.table!.groupBy = 'category';
    const healthSection = sections.find((section) => section.key === 'health')!;
    healthSection.table!.groupBy = 'category';
    healthSection.table!.columns.push({ key: 'category', label: 'Catégorie forgée' });
    healthSection.table!.rows[0].category = 'FORGEDCATEGORY';
    const revalidated = selectCollaboratorSheetSections(sections, {
      annualReviews: ['category', 'title'], health: ['category', 'title'], documents: ['unknown'],
    });
    expect(revalidated).toHaveLength(2);
    revalidated.forEach((section) => expect(section.table?.groupBy).toBeUndefined());
    expect(revalidated.find((section) => section.key === 'health')?.table?.columns.map((column) => column.key)).toEqual(['title']);
    expect(JSON.stringify(revalidated)).not.toContain('FORGEDCATEGORY');
  });

  it('groups category parents once while retaining every sorted child row without changing the source list', () => {
    const sections = buildCollaboratorSheetSections(person, [
      certificate, { ...certificate, id: 62, title: 'SECONDREPORT' }, medicalDocument,
    ], new Set(['documents']));
    const rows = sections[0].table!.rows;
    const original = structuredClone(rows);
    const groups = groupCollaboratorSheetRows(rows);
    expect(groups.map((group) => [group.label, group.rows.map((row) => row.title)])).toEqual([
      ['Pont', ['CERTIFICATEREPORT', 'SECONDREPORT']], ['Visite Médicale', ['VISITREPORT']],
    ]);
    expect(rows).toEqual(original);
  });
});

describe('collaborator sheet PDF', () => {
  it('renders each category as one parent before its document children and preserves flat or parent-only selections', async () => {
    const sections = buildCollaboratorSheetSections(person, [
      { ...certificate, id: 70, categoryKey: 'engine', title: 'ENGINEONE' },
      { ...certificate, id: 71, title: 'DECKONE' },
      { ...certificate, id: 72, title: 'DECKTWO' },
    ], new Set(['documents']));
    const generatedOn = new Date('2026-10-10T12:00:00Z');
    const grouped = await buildCollaboratorSheetPdf(person, sections, { documents: ['category', 'title', 'expiresOn', 'status'] }, generatedOn);
    const groupedContent = pageContent((await inspectPdf(grouped.blob)).pdf, 0);
    expect(groupedContent.match(/\(Machine\) Tj/g)).toHaveLength(1);
    expect(groupedContent.match(/\(Pont\) Tj/g)).toHaveLength(1);
    expect(groupedContent.indexOf('(Machine) Tj')).toBeLessThan(groupedContent.indexOf('(ENGINEONE) Tj'));
    expect(groupedContent.indexOf('(Pont) Tj')).toBeLessThan(groupedContent.indexOf('(DECKONE) Tj'));
    expect(groupedContent).toContain('DECKTWO');
    expect(groupedContent).toContain('15/08/2026');

    const flat = await buildCollaboratorSheetPdf(person, sections, { documents: ['title', 'expiresOn', 'status'] }, generatedOn);
    const flatContent = pageContent((await inspectPdf(flat.blob)).pdf, 0);
    expect(flatContent).toContain('DECKONE');
    expect(flatContent).not.toMatch(/\(Machine\) Tj|\(Pont\) Tj/);

    const parents = await buildCollaboratorSheetPdf(person, sections, { documents: ['category'] }, generatedOn);
    const parentContent = pageContent((await inspectPdf(parents.blob)).pdf, 0);
    expect(parentContent.match(/\(Machine\) Tj/g)).toHaveLength(1);
    expect(parentContent.match(/\(Pont\) Tj/g)).toHaveLength(1);
    expect(parentContent).not.toMatch(/ENGINEONE|DECKONE|DECKTWO|15\/08\/2026|À renouveler/);
  });

  it('keeps category parents with child rows and repeats the parent context when a long group continues onto another page', async () => {
    const storedDocuments = Array.from({ length: 70 }, (_, index) => ({
      ...certificate, id: 200 + index, title: `PAGEDREPORT${String(index + 1).padStart(2, '0')}`,
    }));
    const sections = buildCollaboratorSheetSections(person, storedDocuments, new Set(['documents']));
    const generated = await buildCollaboratorSheetPdf(person, sections, { documents: ['category', 'title', 'expiresOn', 'status'] });
    const { pdf } = await inspectPdf(generated.blob);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
    for (let page = 0; page < pdf.getPageCount(); page += 1) {
      const content = pageContent(pdf, page);
      expect(content).toContain('(Pont) Tj');
      expect(content).toMatch(/PAGEDREPORT\d+/);
      expect(content.indexOf('(Pont) Tj')).toBeLessThan(content.indexOf('PAGEDREPORT'));
      expect(content).toContain(`Page ${page + 1} / ${pdf.getPageCount()}`);
    }
    expect(pageContent(pdf, pdf.getPageCount() - 1)).toContain('PAGEDREPORT70');
  });

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

  it('omits administrative files and removed document columns even when stale selection keys request them', async () => {
    const sections = buildCollaboratorSheetSections(person, [certificate, administrativeDocument], new Set(['documents']));
    const generated = await buildCollaboratorSheetPdf(person, sections, {
      documents: ['title', 'category', 'expiresOn', 'status', 'issuedOn', 'sourceLabel', 'notes'],
    });
    const { content } = await inspectPdf(generated.blob);
    expect(content).toContain('Brevets et visites médicales');
    expect(content).toContain('CERTIFICATEREPORT');
    expect(content).toContain('Pont');
    expect(content).toContain('15/08/2026');
    expect(content).not.toMatch(/ADMINISTRATIVEREPORT|PUBLICCERTIFICATENOTE|15\/01\/2025|Source|Notes/);
  });

  it.each([['PNG', pngPhoto], ['JPEG', jpegPhoto]])('places an available %s photo to the left of the report title and name by default', async (_format, photoUrl) => {
    const sections = buildCollaboratorSheetSections(person, [], new Set(['identity']));
    const generated = await buildCollaboratorSheetPdf({ ...person, photoUrl }, sections, { identity: ['employeeNumber'] });
    const { pdf } = await inspectPdf(generated.blob);
    const content = pageContent(pdf, 0);
    expect(imageCount(pdf)).toBeGreaterThan(0);
    const titleX = Number(content.match(/([\d.]+) [\d.]+ Td\s+\(Fiche Collaborateur\) Tj/)?.[1]);
    const nameX = Number(content.match(/([\d.]+) [\d.]+ Td\s+\(Luc MARTIN\) Tj/)?.[1]);
    const imagePlacement = content.match(/([\d.]+) 0 0 [\d.]+ ([\d.]+) [\d.]+ cm\s+\/I\d+ Do/);
    expect(imagePlacement).not.toBeNull();
    expect(Number(imagePlacement?.[2]) + Number(imagePlacement?.[1])).toBeLessThan(titleX);
    expect(nameX).toBe(titleX);
    expect(titleX).toBeGreaterThan(100);
    expect(content).toContain('00051');
  });

  it('omits the photo when its option is disabled and retains the full report identity', async () => {
    const sections = buildCollaboratorSheetSections(person, [], new Set(['identity']));
    const generated = await buildCollaboratorSheetPdf({ ...person, photoUrl: pngPhoto }, sections, {
      identity: ['employeeNumber'],
    }, new Date('2026-10-10T12:00:00Z'), { includePhoto: false });
    const { pdf } = await inspectPdf(generated.blob);
    expect(imageCount(pdf)).toBe(0);
    const content = pageContent(pdf, 0);
    expect(content).toContain('Luc MARTIN');
    expect(Number(content.match(/([\d.]+) [\d.]+ Td\s+\(Fiche Collaborateur\) Tj/)?.[1])).toBeLessThan(50);
  });

  it.each([
    ['absent', {}],
    ['unavailable', { photoUrl: pngPhoto, photoUnavailable: true }],
    ['corrupt PNG', { photoUrl: 'data:image/png;base64,not-an-image' }],
    ['corrupt JPEG', { photoUrl: 'data:image/jpeg;base64,AAAA' }],
    ['remote URL', { photoUrl: 'https://private.example.test/photo.jpg' }],
    ['unsupported format', { photoUrl: 'data:image/svg+xml;base64,PHN2Zy8+' }],
  ] as const)('keeps exporting an %s photo record without fetching additional resources', async (_label, photoFields) => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    try {
      const photoPerson = { ...person, ...photoFields };
      const sections = buildCollaboratorSheetSections(photoPerson, [], new Set(['identity']));
      const generated = await buildCollaboratorSheetPdf(photoPerson, sections, { identity: ['employeeNumber'] });
      const { pdf } = await inspectPdf(generated.blob);
      expect(imageCount(pdf)).toBe(0);
      expect(pageContent(pdf, 0)).toContain('Luc MARTIN');
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('wraps long content across pages and numbers every page', async () => {
    const longDocuments = Array.from({ length: 55 }, (_, index) => ({
      ...certificate, id: index + 100,
      title: `LONGREPORT${String(index + 1).padStart(2, '0')} ` + 'Compte rendu complet des formations et renouvellements. '.repeat(12),
    }));
    const sections = buildCollaboratorSheetSections({ ...person, postalAddress: 'Adresse complète. '.repeat(100) }, longDocuments, new Set(['contact', 'documents']));
    const generated = await buildCollaboratorSheetPdf({ ...person, photoUrl: pngPhoto }, sections, selectAll(sections), new Date('2026-10-10T12:00:00Z'));
    const { pdf, content } = await inspectPdf(generated.blob);
    expect(pdf.getPageCount()).toBeGreaterThan(2);
    expect(content).toContain('LONGREPORT01');
    expect(content).toContain('LONGREPORT55');
    expect(content).toContain(`Page 1 / ${pdf.getPageCount()}`);
    expect(content).toContain(`Page ${pdf.getPageCount()} / ${pdf.getPageCount()}`);
    expect(content.match(/Fiche Collaborateur/g)?.length).toBe(pdf.getPageCount());
    expect(imageCount(pdf)).toBe(1);
    for (let page = 0; page < pdf.getPageCount(); page += 1) {
      expect(pageContent(pdf, page)).toMatch(/\/I\d+ Do/);
      expect(pageContent(pdf, page)).toContain('Luc MARTIN');
    }
  });

  it('uses a safe filename and explicitly renders an empty document list', async () => {
    const sections = buildCollaboratorSheetSections(person, [], new Set(['documents']));
    const generated = await buildCollaboratorSheetPdf({ ...person, firstName: 'Luc/<>', lastName: 'MARTIN : "Test"' }, sections, { documents: ['title'] }, new Date('2026-10-10T12:00:00Z'));
    expect(generated.fileName).toBe('Fiche-Collaborateur-Luc-MARTIN-Test-2026-10-10.pdf');
    const { content } = await inspectPdf(generated.blob);
    expect(content).toContain('Aucun brevet ni visite médicale enregistré.');
  });
});

describe('multiple collaborator sheets export', () => {
  it.each(['separate', 'combined'] as const)('uses the same full document names as individual sheets and honors selected columns in %s exports', async (mode) => {
    const secondPerson = { ...person, id: 8, firstName: 'Anne', lastName: 'DURAND' };
    const storedDocuments = [
      { ...certificate, id: 81, categoryKey: 'safety_training', title: 'Luc MARTIN - Z-TRAIN - 2026.pdf' },
      { ...medicalDocument, id: 82, title: 'Luc MARTIN - Visite Médicale - 2026.pdf' },
      { ...certificate, id: 83, personId: 8, personName: 'Anne DURAND', categoryKey: 'engine', title: 'Anne DURAND - MEC250 - 2026.pdf' },
      { ...administrativeDocument, id: 84, title: 'Luc MARTIN - ADMINALIAS - 2026.pdf' },
    ];
    const selection = { documents: ['category', 'title'], identity: ['employeeNumber'] };
    const generatedOn = new Date('2026-10-10T12:00:00Z');
    const visibleSectionKeys = new Set(['identity', 'documents']);
    const firstSections = buildCollaboratorSheetSections(person, storedDocuments, visibleSectionKeys, documentTypes);
    const individual = await buildCollaboratorSheetPdf(person, firstSections, selection, generatedOn, { includePhoto: false });
    const expectedFirst = pageContent((await inspectPdf(individual.blob)).pdf, 0);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    try {
      const generated = await buildCollaboratorSheetsExport([person, secondPerson], storedDocuments, visibleSectionKeys,
        selection, mode, generatedOn, { includePhoto: false }, documentTypes);
      let firstContent: string;
      let secondContent: string;
      if (mode === 'separate') {
        const archive = await JSZip.loadAsync(await generated.blob.arrayBuffer());
        const names = Object.keys(archive.files);
        const first = await inspectPdf(new Blob([await archive.file(names[0])!.async('arraybuffer')]));
        const second = await inspectPdf(new Blob([await archive.file(names[1])!.async('arraybuffer')]));
        firstContent = pageContent(first.pdf, 0);
        secondContent = pageContent(second.pdf, 0);
        expect(firstContent).toBe(expectedFirst);
      } else {
        const { pdf } = await inspectPdf(generated.blob);
        expect(pdf.getPageCount()).toBe(2);
        firstContent = pageContent(pdf, 0);
        secondContent = pageContent(pdf, 1);
      }
      expect(firstContent).toContain('Attestation de qualification avancée');
      expect(firstContent).toContain('Certificat médical');
      expect(secondContent).toContain('Brevet de mécanicien 250 kW');
      expect(firstContent).not.toMatch(/Z-TRAIN|Visite Médicale -|ADMINALIAS|15\/08\/2026|À renouveler|MEC250/);
      expect(secondContent).not.toMatch(/MEC250|Z-TRAIN|Certificat médical|15\/08\/2026|À renouveler/);
      [firstContent, secondContent].forEach((content) => {
        expect(content).toContain('Page 1 / 1');
        expect(content).not.toMatch(/Fiche \d+ \/ \d+/);
      });
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

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
      ...certificate, id: index + 100,
      title: `FIRSTREPORT${String(index + 1).padStart(2, '0')} ` + 'Compte rendu des formations et renouvellements. '.repeat(10),
    }));
    const sections = buildCollaboratorSheetSections(person, longDocuments, new Set(['documents']));
    const selection = { documents: ['title'], contact: ['phone'], health: ['notes'] };
    const firstSheet = await buildCollaboratorSheetPdf(person, sections, selection);
    const firstPageCount = (await inspectPdf(firstSheet.blob)).pdf.getPageCount();
    const generated = await buildCollaboratorSheetsExport([person, secondPerson], [
      ...longDocuments,
      { ...certificate, id: 200, personId: secondPerson.id, title: 'SECONDREPORT', notes: 'REMOVEDSECONDNOTE' },
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
      expect(text).not.toMatch(/Fiche \d+ \/ \d+/);
      expect(text).not.toMatch(/Anne DURAND|SECONDREPORT|REMOVEDSECONDNOTE/);
    }
    expect(pageContent(pdf, firstPageCount - 1)).toContain('FIRSTREPORT35');
    const secondPage = pageContent(pdf, firstPageCount);
    expect(secondPage).toContain('Anne DURAND');
    expect(secondPage).toContain('SECONDREPORT');
    expect(secondPage).not.toContain('REMOVEDSECONDNOTE');
    expect(secondPage).toContain('Page 1 / 1');
    expect(secondPage).not.toMatch(/Fiche \d+ \/ \d+/);
    expect(secondPage).not.toMatch(/Luc MARTIN|FIRSTREPORT/);
    expect(content).not.toMatch(/PRIVATE|0123456789|UNSELECTEDREPORT/);
    expect(content).not.toMatch(/Fiche \d+ \/ \d+/);
  });

  it.each([
    ['separate', true], ['separate', false], ['combined', true], ['combined', false],
  ] as const)('applies the shared photo option to each %s export with includePhoto=%s', async (mode, includePhoto) => {
    const people = [{ ...person, photoUrl: pngPhoto }, { ...person, id: 8, firstName: 'Anne', lastName: 'DURAND', photoUrl: jpegPhoto }];
    const generated = await buildCollaboratorSheetsExport(people, [], new Set(['identity']), {
      identity: ['employeeNumber'],
    }, mode, new Date('2026-10-10T12:00:00Z'), { includePhoto });
    if (mode === 'separate') {
      const archive = await JSZip.loadAsync(await generated.blob.arrayBuffer());
      const names = Object.keys(archive.files);
      expect(names).toHaveLength(2);
      for (const name of names) {
        const { pdf } = await inspectPdf(new Blob([await archive.file(name)!.async('arraybuffer')]));
        expect(imageCount(pdf) > 0).toBe(includePhoto);
        expect(/\/I\d+ Do/.test(pageContent(pdf, 0))).toBe(includePhoto);
      }
    } else {
      const { pdf } = await inspectPdf(generated.blob);
      expect(pdf.getPageCount()).toBe(2);
      expect(/\/I\d+ Do/.test(pageContent(pdf, 0))).toBe(includePhoto);
      expect(/\/I\d+ Do/.test(pageContent(pdf, 1))).toBe(includePhoto);
      expect(pageContent(pdf, 0)).toContain('Luc MARTIN');
      expect(pageContent(pdf, 1)).toContain('Anne DURAND');
      for (let page = 0; page < pdf.getPageCount(); page += 1) {
        const content = pageContent(pdf, page);
        expect(content).toContain('Page 1 / 1');
        expect(content).not.toMatch(/Fiche \d+ \/ \d+/);
      }
    }
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
