import type { PlanningOverview, PlanningPerson } from './planningQueries';

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
  captainName: string;
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
  captainName: string;
}

function crewListCandidates(overview: PlanningOverview, vesselId: number, date: string): CrewListCandidate[] {
  const assignments: CrewListCandidate[] = overview.assignments
    .filter((assignment) => assignment.vesselId === vesselId && assignment.confirmationStatus !== 'cancelled' && activeOn(date, assignment.startsOn, assignment.endsOn))
    .map((assignment) => ({
      personId: assignment.crewPersonId,
      crewName: assignment.crewName,
      assignmentRole: assignment.assignmentRole,
      watchGroup: assignment.watchGroup || 'Affectation',
      captainName: assignment.captainName,
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
      captainName: '',
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
      nationality: '',
      birthDate: person?.birthDate || '',
      birthPlace: person?.birthPlace || '',
      birthCountry: '',
      identityDocumentType: person?.identityDocumentType || '',
      identityDocumentNumber: person?.identityDocumentNumber || '',
      rank: assignment.assignmentRole,
      visaNumber: '',
    } satisfies PlanningCrewListRow;
  });

  const captain = assignments.find((assignment) => /capitaine|captain/i.test(assignment.assignmentRole));
  return {
    vesselName: vessel.name,
    date: input.date,
    watchGroup: input.watchGroup,
    captainName: captain?.crewName || assignments[0]?.captainName.replace('-', '') || '',
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
  const printEndRow = signatureRow + 3;
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
    ${rowXml(signatureRow, [inlineCell(`B${signatureRow}`, 'Shipowner signature:', 8)], 22)}
    ${rowXml(signatureRow + 1, [inlineCell(`B${signatureRow + 1}`, document.captainName, 9)], 22)}
  </sheetData>
  <mergeCells count="4"><mergeCell ref="A1:C1"/><mergeCell ref="D1:G1"/><mergeCell ref="H1:I1"/><mergeCell ref="B${signatureRow}:F${signatureRow}"/></mergeCells>
  <pageMargins left="0.25" right="0.25" top="0.35" bottom="0.35" header="0.15" footer="0.15"/>
  <pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="1" horizontalDpi="300" verticalDpi="300"/>
  <printOptions horizontalCentered="1"/>
  <autoFilter ref="A3:K${Math.max(4, document.rows.length + 3)}"/>
</worksheet>`;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="4"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="12"/><color rgb="FF103A5F"/><name val="Arial"/></font><font><i/><sz val="10"/><name val="Arial"/></font></fonts>
  <fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0C5A82"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8F1F7"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="3"><border/><border><left style="thin"><color rgb="FF8BA4B7"/></left><right style="thin"><color rgb="FF8BA4B7"/></right><top style="thin"><color rgb="FF8BA4B7"/></top><bottom style="thin"><color rgb="FF8BA4B7"/></bottom></border><border><bottom style="medium"><color rgb="FF0C5A82"/></bottom></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="10"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

async function crewListXlsxBlob(document: PlanningCrewListDocument): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
  zip.folder('_rels')!.file('.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  zip.folder('xl')!.file('workbook.xml', `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="CREW LIST" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">'CREW LIST'!$A$1:$K$${Math.max(23, document.rows.length + 10)}</definedName></definedNames></workbook>`);
  zip.folder('xl')!.folder('_rels')!.file('workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  zip.folder('xl')!.folder('worksheets')!.file('sheet1.xml', worksheetXml(document));
  zip.folder('xl')!.file('styles.xml', STYLES_XML);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

async function crewListPdfBlob(document: PlanningCrewListDocument): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const pdf = new jsPDF({ compress: true, orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  pdf.setFillColor(12, 90, 130);
  pdf.rect(10, 9, pageWidth - 20, 16, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  pdf.text('IMO CREW LIST', 15, 19);
  pdf.setFontSize(10);
  pdf.text(document.vesselName, 72, 19);
  pdf.text(document.watchGroup || 'Toutes les bordées', 148, 19);
  pdf.text(document.date.split('-').reverse().join('/'), pageWidth - 15, 19, { align: 'right' });
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
    styles: { font: 'helvetica', fontSize: 6.5, cellPadding: 1.5, lineColor: [139, 164, 183], lineWidth: 0.15, valign: 'middle' },
    headStyles: { fillColor: [12, 90, 130], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
    alternateRowStyles: { fillColor: [238, 245, 249] },
    columnStyles: { 0: { cellWidth: 9, halign: 'center' }, 4: { cellWidth: 20 }, 7: { cellWidth: 31 }, 8: { cellWidth: 31 }, 10: { cellWidth: 27 } },
    margin: { left: 10, right: 10 },
  });
  const finalY = (pdf as typeof pdf & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 55;
  const signatureY = Math.min(185, finalY + 14);
  pdf.setTextColor(34, 54, 75);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Shipowner signature:', 15, signatureY);
  pdf.setFont('helvetica', 'italic');
  pdf.text(document.captainName, 15, signatureY + 7);
  pdf.setDrawColor(12, 90, 130);
  pdf.line(15, signatureY + 10, 90, signatureY + 10);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(105, 119, 135);
  pdf.text('Generated from SeaPilot Planning data', pageWidth - 15, 198, { align: 'right' });
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
