import type { PlanningOverview, PlanningPerson } from './planningQueries';
import shipOwnerSignatureUrl from './assets/signature-benjamin-bon.png?inline';

export type PlanningCrewListFormat = 'xlsx' | 'pdf';

export interface PlanningCrewListInput {
  vesselId: number;
  date: string;
  watchGroup: string;
}

export interface PlanningCrewListRow {
  familyName: string;
  firstName: string;
  nationality: string;
  birthDate: string;
  birthPlace: string;
  birthCountry: string;
  identityDocumentType: string;
  identityDocumentNumber: string;
  rank: string;
  visaNumber: string;
}

export interface PlanningCrewListDocument {
  vesselName: string;
  date: string;
  watchGroup: string;
  shipOwnerName: string;
  rows: PlanningCrewListRow[];
  incompleteProfiles: string[];
}

export interface PlanningGeneratedCrewList {
  blob: Blob;
  fileName: string;
}

function activeOn(date: string, startsOn: string, endsOn: string): boolean {
  return startsOn <= date && endsOn >= date;
}

interface CrewListCandidate {
  personId: number | null;
  crewName: string;
  assignmentRole: string;
  watchGroup: string;
}

const SHIP_OWNER_NAME = 'Benjamin BON';

const COUNTRY_ALIASES: Record<string, string> = {
  algerie: 'Algeria',
  belgique: 'Belgium',
  benin: 'Benin',
  bresil: 'Brazil',
  cameroun: 'Cameroon',
  canada: 'Canada',
  rdcongo: 'Democratic Republic of the Congo',
  republiquedemocratiqueducongo: 'Democratic Republic of the Congo',
  congo: 'Republic of the Congo',
  cotedivoire: 'Ivory Coast',
  espagne: 'Spain',
  etatsunis: 'United States',
  france: 'France',
  gabon: 'Gabon',
  guinee: 'Guinea',
  italie: 'Italy',
  madagascar: 'Madagascar',
  mali: 'Mali',
  maroc: 'Morocco',
  maurice: 'Mauritius',
  mauritanie: 'Mauritania',
  paysbas: 'Netherlands',
  portugal: 'Portugal',
  royaumeuni: 'United Kingdom',
  senegal: 'Senegal',
  suisse: 'Switzerland',
  togo: 'Togo',
  tunisie: 'Tunisia',
};

const FOREIGN_BIRTH_CITY_COUNTRIES: Record<string, string> = {
  abidjan: 'Ivory Coast',
  alger: 'Algeria',
  antananarivo: 'Madagascar',
  bamako: 'Mali',
  barcelone: 'Spain',
  bruxelles: 'Belgium',
  casablanca: 'Morocco',
  conakry: 'Guinea',
  cotonou: 'Benin',
  dakar: 'Senegal',
  douala: 'Cameroon',
  geneve: 'Switzerland',
  kinshasa: 'Democratic Republic of the Congo',
  libreville: 'Gabon',
  lisbonne: 'Portugal',
  lome: 'Togo',
  londres: 'United Kingdom',
  madrid: 'Spain',
  monaco: 'Monaco',
  montreal: 'Canada',
  oran: 'Algeria',
  ouagadougou: 'Burkina Faso',
  rabat: 'Morocco',
  rome: 'Italy',
  sfax: 'Tunisia',
  tunis: 'Tunisia',
  yaounde: 'Cameroon',
};

function normalizedLookupValue(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr-FR').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function inferPlanningBirthCountry(birthPlace: string): string {
  const normalized = normalizedLookupValue(birthPlace);
  if (!normalized) return '';
  const compact = normalized.replaceAll(' ', '');
  for (const [country, englishName] of Object.entries(COUNTRY_ALIASES)) {
    if (compact.includes(country)) return englishName;
  }
  for (const [city, country] of Object.entries(FOREIGN_BIRTH_CITY_COUNTRIES)) {
    if (normalized === city || normalized.startsWith(`${city} `) || normalized.endsWith(` ${city}`)) return country;
  }
  return 'France';
}

export function planningIdentityDocumentLabel(value: string): string {
  const normalized = normalizedLookupValue(value);
  if (normalized === 'cni' || normalized.includes('carte nationale')) return 'ID';
  if (normalized === 'passeport' || normalized === 'passport') return 'passport';
  return value;
}

function crewListCandidates(overview: PlanningOverview, vesselId: number, date: string): CrewListCandidate[] {
  const assignments: CrewListCandidate[] = overview.assignments
    .filter((assignment) => assignment.vesselId === vesselId && assignment.confirmationStatus !== 'cancelled' && activeOn(date, assignment.startsOn, assignment.endsOn))
    .map((assignment) => ({
      personId: assignment.crewPersonId,
      crewName: assignment.crewName,
      assignmentRole: assignment.assignmentRole,
      watchGroup: assignment.watchGroup || 'Affectation',
    }));
  const nativeKeys = new Set(assignments.map((assignment) => assignment.personId ? `person:${assignment.personId}` : `name:${assignment.crewName}`));
  const periods: CrewListCandidate[] = overview.periods
    .filter((period) => period.vesselId === vesselId && activeOn(date, period.startsOn, period.endsOn))
    .filter((period) => !nativeKeys.has(period.personId ? `person:${period.personId}` : `name:${period.crewName}`))
    .map((period) => ({
      personId: period.personId,
      crewName: period.crewName,
      assignmentRole: period.functionLabel,
      watchGroup: period.watchGroup || 'Affectation',
    }));
  return [...assignments, ...periods];
}

export function availablePlanningCrewListBoards(overview: PlanningOverview, vesselId: number, date: string): string[] {
  return [...new Set(crewListCandidates(overview, vesselId, date).map((assignment) => assignment.watchGroup))]
    .sort((left, right) => left.localeCompare(right, 'fr', { numeric: true }));
}

function personMissingCrewListData(person: PlanningPerson): boolean {
  return !person.birthDate || !person.birthPlace || !person.identityDocumentType || !person.identityDocumentNumber;
}

export function buildPlanningCrewList(overview: PlanningOverview, input: PlanningCrewListInput): PlanningCrewListDocument {
  const vessel = overview.vessels.find((item) => item.id === input.vesselId);
  if (!vessel) throw new Error('Sélectionnez un navire valide.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('Sélectionnez une date valide.');

  const assignments = crewListCandidates(overview, input.vesselId, input.date)
    .filter((assignment) => !input.watchGroup || assignment.watchGroup === input.watchGroup);
  if (!assignments.length) throw new Error('Aucun marin affecté ne correspond à cette sélection.');

  const peopleById = new Map(overview.people.map((person) => [person.id, person]));
  const uniqueAssignments = [...new Map(assignments.map((assignment) => [assignment.personId ? `person:${assignment.personId}` : `name:${assignment.crewName}`, assignment])).values()];
  const incompleteProfiles: string[] = [];
  const rows = uniqueAssignments.map((assignment) => {
    const person = assignment.personId ? peopleById.get(assignment.personId) : undefined;
    if (!person || personMissingCrewListData(person)) incompleteProfiles.push(person ? `${person.firstName} ${person.lastName}`.trim() : assignment.crewName);
    return {
      familyName: person?.lastName || assignment.crewName.split(' ').slice(-1)[0] || '',
      firstName: person?.firstName || assignment.crewName.split(' ').slice(0, -1).join(' '),
      nationality: 'FR',
      birthDate: person?.birthDate || '',
      birthPlace: person?.birthPlace || '',
      birthCountry: inferPlanningBirthCountry(person?.birthPlace || ''),
      identityDocumentType: planningIdentityDocumentLabel(person?.identityDocumentType || ''),
      identityDocumentNumber: person?.identityDocumentNumber || '',
      rank: assignment.assignmentRole,
      visaNumber: 'N/A',
    } satisfies PlanningCrewListRow;
  });

  return {
    vesselName: vessel.name,
    date: input.date,
    watchGroup: input.watchGroup,
    shipOwnerName: SHIP_OWNER_NAME,
    rows,
    incompleteProfiles,
  };
}

function xmlEscape(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function inlineCell(reference: string, value: unknown, style = 0): string {
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
}

function rowXml(index: number, cells: string[], height?: number): string {
  return `<row r="${index}"${height ? ` ht="${height}" customHeight="1"` : ''}>${cells.join('')}</row>`;
}

function shipOwnerSignatureBase64(): string {
  const [, base64 = ''] = shipOwnerSignatureUrl.split(',', 2);
  if (!shipOwnerSignatureUrl.startsWith('data:image/png;base64,') || !base64) {
    throw new Error('La signature du ship owner ne peut pas être intégrée au document.');
  }
  return base64;
}

function signatureDrawingXml(signatureRow: number): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <xdr:oneCellAnchor>
    <xdr:from><xdr:col>1</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${signatureRow + 1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
    <xdr:ext cx="1600000" cy="1061947"/>
    <xdr:pic>
      <xdr:nvPicPr><xdr:cNvPr id="2" name="Signature Benjamin BON" descr="Signature de Benjamin BON"/><xdr:cNvPicPr/></xdr:nvPicPr>
      <xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>
      <xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1600000" cy="1061947"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></xdr:spPr>
    </xdr:pic>
    <xdr:clientData/>
  </xdr:oneCellAnchor>
</xdr:wsDr>`;
}

function worksheetXml(document: PlanningCrewListDocument): string {
  const headers = [
    'No', 'Family name', 'First name', 'Nationality', 'Date of birth', 'Place of birth',
    'Country of birth', 'Nature of identity document', 'Number of identity document',
    'Rank or rating', 'Visa/Residence Permit number',
  ];
  const bodyRows = document.rows.map((item, index) => rowXml(index + 4, [
    inlineCell(`A${index + 4}`, index + 1, 5),
    inlineCell(`B${index + 4}`, item.familyName, 6),
    inlineCell(`C${index + 4}`, item.firstName, 7),
    inlineCell(`D${index + 4}`, item.nationality, 7),
    inlineCell(`E${index + 4}`, item.birthDate ? item.birthDate.split('-').reverse().join('/') : '', 7),
    inlineCell(`F${index + 4}`, item.birthPlace, 7),
    inlineCell(`G${index + 4}`, item.birthCountry, 7),
    inlineCell(`H${index + 4}`, item.identityDocumentType, 7),
    inlineCell(`I${index + 4}`, item.identityDocumentNumber, 7),
    inlineCell(`J${index + 4}`, item.rank, 7),
    inlineCell(`K${index + 4}`, item.visaNumber, 7),
  ], 23)).join('');
  const signatureRow = Math.max(20, document.rows.length + 7);
  const printEndRow = signatureRow + 7;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
  <dimension ref="A1:K${printEndRow}"/>
  <sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="20"/>
  <cols><col min="1" max="1" width="5" customWidth="1"/><col min="2" max="3" width="18" customWidth="1"/><col min="4" max="4" width="11" customWidth="1"/><col min="5" max="5" width="14" customWidth="1"/><col min="6" max="7" width="17" customWidth="1"/><col min="8" max="8" width="23" customWidth="1"/><col min="9" max="9" width="25" customWidth="1"/><col min="10" max="10" width="18" customWidth="1"/><col min="11" max="11" width="25" customWidth="1"/></cols>
  <sheetData>
    ${rowXml(1, [inlineCell('A1', 'IMO CREW LIST', 1), inlineCell('D1', document.vesselName, 2), inlineCell('H1', document.watchGroup || 'Toutes les bordées', 3), inlineCell('J1', 'DATE', 2), inlineCell('K1', document.date.split('-').reverse().join('/'), 3)], 30)}
    ${rowXml(2, [], 10)}
    ${rowXml(3, headers.map((header, index) => inlineCell(`${String.fromCharCode(65 + index)}3`, header, 4)), 38)}
    ${bodyRows}
    ${rowXml(signatureRow, [inlineCell(`B${signatureRow}`, 'Ship owner:', 8)], 22)}
    ${rowXml(signatureRow + 1, [inlineCell(`B${signatureRow + 1}`, document.shipOwnerName, 9)], 22)}
  </sheetData>
  <autoFilter ref="A3:K${Math.max(4, document.rows.length + 3)}"/>
  <mergeCells count="5"><mergeCell ref="A1:C1"/><mergeCell ref="D1:G1"/><mergeCell ref="H1:I1"/><mergeCell ref="B${signatureRow}:F${signatureRow}"/><mergeCell ref="B${signatureRow + 1}:F${signatureRow + 1}"/></mergeCells>
  <printOptions horizontalCentered="1"/>
  <pageMargins left="0.25" right="0.25" top="0.35" bottom="0.35" header="0.15" footer="0.15"/>
  <pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="1" horizontalDpi="300" verticalDpi="300"/>
  <drawing r:id="rId1"/>
</worksheet>`;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="4"><font><sz val="10"/><color rgb="FF000000"/><name val="Arial"/></font><font><b/><sz val="16"/><color rgb="FF000000"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FF000000"/><name val="Arial"/></font><font><i/><sz val="10"/><color rgb="FF000000"/><name val="Arial"/></font></fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
  <borders count="3"><border/><border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom></border><border><bottom style="medium"><color rgb="FF000000"/></bottom></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="10"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

async function crewListXlsxBlob(document: PlanningCrewListDocument): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const signatureRow = Math.max(20, document.rows.length + 7);
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>');
  zip.folder('_rels')!.file('.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  zip.folder('xl')!.file('workbook.xml', `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="CREW LIST" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">'CREW LIST'!$A$1:$K$${signatureRow + 7}</definedName></definedNames></workbook>`);
  zip.folder('xl')!.folder('_rels')!.file('workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  zip.folder('xl')!.folder('worksheets')!.file('sheet1.xml', worksheetXml(document));
  zip.folder('xl')!.folder('worksheets')!.folder('_rels')!.file('sheet1.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>');
  zip.folder('xl')!.folder('drawings')!.file('drawing1.xml', signatureDrawingXml(signatureRow));
  zip.folder('xl')!.folder('drawings')!.folder('_rels')!.file('drawing1.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/signature-benjamin-bon.png"/></Relationships>');
  zip.folder('xl')!.folder('media')!.file('signature-benjamin-bon.png', shipOwnerSignatureBase64(), { base64: true });
  zip.folder('xl')!.file('styles.xml', STYLES_XML);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

async function crewListPdfBlob(document: PlanningCrewListDocument): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const pdf = new jsPDF({ compress: false, orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  pdf.setTextColor(0, 0, 0);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  pdf.text('IMO CREW LIST', 15, 19);
  pdf.setFontSize(10);
  pdf.text(document.vesselName, 72, 19);
  pdf.text(document.watchGroup || 'Toutes les bordées', 148, 19);
  pdf.text(document.date.split('-').reverse().join('/'), pageWidth - 15, 19, { align: 'right' });
  pdf.setDrawColor(0, 0, 0);
  pdf.line(10, 25, pageWidth - 10, 25);
  autoTable(pdf, {
    startY: 30,
    head: [[
      'No', 'Family name', 'First name', 'Nationality', 'Date of birth', 'Place of birth',
      'Country of birth', 'Identity document', 'Document number', 'Rank or rating', 'Visa / permit',
    ]],
    body: document.rows.map((row, index) => [
      index + 1, row.familyName, row.firstName, row.nationality,
      row.birthDate ? row.birthDate.split('-').reverse().join('/') : '', row.birthPlace,
      row.birthCountry, row.identityDocumentType, row.identityDocumentNumber, row.rank, row.visaNumber,
    ]),
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 6.5, cellPadding: 1.5, fillColor: [255, 255, 255], lineColor: [0, 0, 0], lineWidth: 0.15, textColor: [0, 0, 0], valign: 'middle' },
    headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center' },
    alternateRowStyles: { fillColor: [255, 255, 255] },
    columnStyles: { 0: { cellWidth: 9, halign: 'center' }, 4: { cellWidth: 20 }, 7: { cellWidth: 31 }, 8: { cellWidth: 31 }, 10: { cellWidth: 27 } },
    margin: { left: 10, right: 10 },
  });
  const finalY = (pdf as typeof pdf & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 55;
  let signatureY = finalY + 12;
  if (signatureY > 160) {
    pdf.addPage('a4', 'landscape');
    signatureY = 20;
  }
  pdf.setTextColor(0, 0, 0);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`Ship owner: ${document.shipOwnerName}`, 15, signatureY);
  pdf.addImage(shipOwnerSignatureUrl, 'PNG', 15, signatureY + 5, 38, 25);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(0, 0, 0);
  pdf.text('FAL 5 - Crew list', pageWidth - 15, pageHeight - 8, { align: 'right' });
  return pdf.output('blob');
}

function safeFilePart(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

export async function generatePlanningCrewList(document: PlanningCrewListDocument, format: PlanningCrewListFormat): Promise<PlanningGeneratedCrewList> {
  const blob = format === 'xlsx' ? await crewListXlsxBlob(document) : await crewListPdfBlob(document);
  const board = document.watchGroup ? `-${safeFilePart(document.watchGroup)}` : '';
  return { blob, fileName: `crew-list-${safeFilePart(document.vesselName)}${board}-${document.date}.${format}` };
}
