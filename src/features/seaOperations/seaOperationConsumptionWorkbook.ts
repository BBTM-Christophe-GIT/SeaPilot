import { compareFleetAssets, normalizeFleetName } from '../fleet/fleetDisplay';
import type { SeaOperationConsumptionExportRecord, SeaOperationConsumptionHistory, SeaOperationConsumptionHistoryRow } from './seaOperationConsumptionExportQuery';
import { seaOperationContextDate } from './seaOperationModel';
import type { SeaOperationRecord, SeaOperationVessel } from './seaOperationQueries';

export interface SeaOperationConsumptionWorkbookRow {
  operation: Pick<SeaOperationRecord, 'id' | 'draft'>;
  consumption: SeaOperationConsumptionExportRecord;
}

type WorkbookVessel = Pick<SeaOperationVessel, 'id' | 'name' | 'registrationImo' | 'lengthOverall'>;

const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const SHEET_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const OFFICE_REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';

const STYLE = { text: 0, title: 1, section: 2, heading: 3, date: 4, dateTime: 5, duration: 6, number: 7, price: 8, percent: 9, days: 10, link: 11 } as const;
type CellValue = string | number | boolean | null;
interface Column {
  label: string;
  width: number;
  style?: number;
  gauge?: true;
}
interface Section { title: string; first: number; last: number }
interface WorkbookSheet {
  name: string;
  title: string;
  columns: readonly Column[];
  sections: readonly Section[];
  rows: readonly (readonly CellValue[])[];
  gaugeRows?: readonly SeaOperationConsumptionHistoryRow[];
}

// These values represent Paris wall time. Use UTC arithmetic to encode the same
// calendar values in Excel regardless of the browser's time zone.
function excelDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}(?::\d{2})?))?$/.exec(value);
  if (!match) return null;
  const clock = match[2] ?? '00:00';
  const time = clock.length === 5 ? `${clock}:00` : clock;
  const instant = new Date(`${match[1]}T${time}Z`);
  if (!Number.isFinite(instant.getTime()) || instant.toISOString().slice(0, 19) !== `${match[1]}T${time}`) return null;
  const serial = instant.getTime() / 86_400_000 + 25_569;
  if (serial < 2) return null;
  // Excel preserves the fictitious 29 February 1900 in its date numbering.
  return serial < 61 ? serial - 1 : serial;
}

function excelUtcDate(value: string | undefined): number | null {
  if (!value) return null;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) ? epoch / 86_400_000 + 25_569 : null;
}

function excelGauge(value: number | null, unit: SeaOperationConsumptionExportRecord['gaugeUnit']): number | null {
  return value === null || unit === null ? null : unit === 'percent' ? value / 100 : value;
}

const liveColumns: readonly (Column & { value: (row: SeaOperationConsumptionWorkbookRow) => CellValue })[] = [
  { label: 'Date de l’opération', width: 18, style: STYLE.date, value: ({ operation }) => excelDate(seaOperationContextDate(operation.draft) ?? operation.draft.vessel.etd.slice(0, 10)) },
  { label: 'Navire', width: 23, value: ({ operation }) => operation.draft.vessel.name },
  { label: 'Projet / Opération', width: 38, value: ({ operation }) => operation.draft.project },
  { label: 'Port de départ', width: 23, value: ({ operation }) => operation.draft.vessel.departurePort },
  { label: 'Port d’arrivée', width: 23, value: ({ operation }) => operation.draft.vessel.arrivalPort },
  { label: 'Départ prévu (Paris)', width: 22, style: STYLE.dateTime, value: ({ operation }) => excelDate(operation.draft.vessel.etd) },
  { label: 'Arrivée réelle (Paris)', width: 23, style: STYLE.dateTime, value: ({ consumption }) => excelDate(consumption.actualArrival) },
  { label: 'Remorquage', width: 17, value: ({ operation }) => ({ yes: 'Oui', no: 'Non', '': null })[operation.draft.applicability.towing] },
  { label: 'Durée (h:min)', width: 17, style: STYLE.duration, value: ({ consumption }) => consumption.durationMinutes / 1440 },
  { label: 'Vitesse moyenne (nd)', width: 21, style: STYLE.number, value: ({ consumption }) => consumption.averageSpeedKnots },
  { label: 'Distance (NM)', width: 17, style: STYLE.number, value: ({ consumption }) => consumption.distanceNm },
  { label: 'Unité de jauge', width: 17, value: ({ consumption }) => consumption.gaugeUnit === 'cm' ? 'cm' : consumption.gaugeUnit === 'percent' ? '%' : null },
  { label: 'Au départ', width: 14, style: STYLE.number, gauge: true, value: ({ consumption }) => excelGauge(consumption.departureGauge, consumption.gaugeUnit) },
  { label: 'À l’arrivée', width: 14, style: STYLE.number, gauge: true, value: ({ consumption }) => excelGauge(consumption.arrivalGauge, consumption.gaugeUnit) },
  { label: 'Soute au départ (L)', width: 20, style: STYLE.number, value: ({ consumption }) => consumption.departureLiters },
  { label: 'Soute à l’arrivée (L)', width: 20, style: STYLE.number, value: ({ consumption }) => consumption.arrivalLiters },
  { label: 'Totale (L)', width: 16, style: STYLE.number, value: ({ consumption }) => consumption.consumedLiters },
  { label: 'À l’heure (L/h)', width: 17, style: STYLE.number, value: ({ consumption }) => consumption.litersPerHour },
  { label: 'Au mille (L/NM)', width: 18, style: STYLE.number, value: ({ consumption }) => consumption.litersPerNm },
  { label: 'Coût (€ HT)', width: 17, style: STYLE.number, value: ({ consumption }) => consumption.costEuros },
  { label: 'Volume (L)', width: 17, style: STYLE.number, value: ({ consumption }) => consumption.refuelLiters },
  { label: 'Prix du fuel (€/L HT)', width: 23, style: STYLE.price, value: ({ consumption }) => consumption.pricePerLiter },
  { label: 'Source de la distance', width: 20, value: ({ consumption }) => consumption.trace ? 'GPS' : 'Manuelle' },
  { label: 'Départ GPS (UTC)', width: 22, style: STYLE.dateTime, value: ({ consumption }) => excelUtcDate(consumption.trace?.startedAt) },
  { label: 'Arrivée GPS (UTC)', width: 22, style: STYLE.dateTime, value: ({ consumption }) => excelUtcDate(consumption.trace?.endedAt) },
  { label: 'Durée GPS (h:min)', width: 18, style: STYLE.duration, value: ({ consumption }) => consumption.trace ? consumption.trace.durationMinutes / 1440 : null },
  { label: 'Distance GPS (NM)', width: 19, style: STYLE.number, value: ({ consumption }) => consumption.trace?.distanceNm ?? null },
  { label: 'Vitesse moyenne GPS (nd)', width: 23, style: STYLE.number, value: ({ consumption }) => consumption.trace?.averageSpeedKnots ?? null },
  { label: 'Points GPS', width: 13, value: ({ consumption }) => consumption.trace?.pointCount ?? null },
  { label: 'Source', width: 16, value: () => 'SeaPilot' },
];

const liveSections = [
  { title: 'Voyage', first: 0, last: 10 },
  { title: 'Jauges', first: 11, last: 13 },
  { title: 'Consommation', first: 14, last: 19 },
  { title: 'Avitaillement avant départ', first: 20, last: 21 },
  { title: 'Mesures GPS', first: 22, last: 28 },
];

const sourceRowColumn: Column = { label: 'Ligne du classeur source', width: 24 };
const archiveColumns: readonly Column[] = [
  sourceRowColumn,
  { label: 'Utilisation BBTM', width: 19, style: STYLE.number },
  { label: 'Montant (€)', width: 17, style: STYLE.number },
  { label: 'Commentaire', width: 45 },
  { label: 'Montant de l’avitaillement (€)', width: 23, style: STYLE.number },
  { label: 'Note source', width: 19 },
];
const mixedLabels: Record<number, string> = {
  0: 'Date de l’opération ou du relevé',
  5: 'Départ (prévu pour SeaPilot, Paris)',
  6: 'Arrivée (réelle pour SeaPilot, Paris)',
  19: 'Coût (€ · HT pour SeaPilot)',
  21: 'Prix du fuel (€/L · HT pour SeaPilot)',
};
const mixedColumns = [...liveColumns.map((column, index) => ({ ...column, label: mixedLabels[index] ?? column.label })), ...archiveColumns];
const mixedSections = [...liveSections, { title: 'Provenance et détails du classeur', first: liveColumns.length - 1, last: mixedColumns.length - 1 }];

const archiveVessels = {
  rozel: { name: 'LE ROZEL', registrationImo: '937905', source: 'CX-3-RZL' },
  suroit: { name: 'SUROIT', registrationImo: '926637', source: 'CX-3-SUR' },
} as const;
type ArchiveVessel = keyof typeof archiveVessels;

interface VesselGroup {
  name: string;
  registrationImo: string;
  lengthOverall?: string | null;
  rows: SeaOperationConsumptionWorkbookRow[];
  archive?: ArchiveVessel;
}

function historicalRow({ cells, sourceRow }: SeaOperationConsumptionHistoryRow, archive: ArchiveVessel, name: string): CellValue[] {
  const [departurePort, arrivalPort, distance, departure, arrival, towing, duration, speed] = cells;
  const gaugesAndTanks = archive === 'rozel'
    ? ['%', cells[8], cells[10], cells[11], null]
    : ['cm', ...cells.slice(8, 12)];
  const notes = archive === 'rozel' ? [null, null, null, null, cells[9]] : cells.slice(18, 23);
  return [
    typeof arrival === 'number' ? Math.floor(arrival) : null, name, null,
    departurePort, arrivalPort, departure, arrival, towing, duration, speed, distance,
    ...gaugesAndTanks, ...cells.slice(12, 18),
    'Classeur', null, null, null, null, null, null,
    archiveVessels[archive].source, sourceRow, ...notes,
  ];
}

function vesselGroups(rows: readonly SeaOperationConsumptionWorkbookRow[], history: SeaOperationConsumptionHistory | undefined,
  fleet: readonly WorkbookVessel[]): VesselGroup[] {
  const groups = new Map<string, VesselGroup>(fleet.map(vessel => [String(vessel.id), { ...vessel, rows: [] }]));
  for (const row of rows) {
    const { id, name, registrationImo } = row.operation.draft.vessel;
    const key = id || `legacy:${registrationImo || normalizeFleetName(name)}`;
    const group = groups.get(key);
    if (group) {
      group.rows.push(row);
      if (!group.registrationImo.trim()) group.registrationImo = registrationImo;
    } else groups.set(key, { name: name || 'Navire non renseigné', registrationImo, rows: [row] });
  }
  if (history) for (const archive of ['rozel', 'suroit'] as const) {
    if (!history[archive].length && !(archive === 'rozel' && history.rozelGauge.length)) continue;
    const vessel = archiveVessels[archive];
    const matching = [...groups.values()].filter(group => group.registrationImo.split('/')
      .some(identifier => identifier.replace(/\D/g, '') === vessel.registrationImo));
    // Keep the archive separate when the registration is missing or ambiguous.
    const group = matching.length === 1 ? matching[0] : undefined;
    if (group && !group.archive) group.archive = archive;
    else groups.set(`archive:${archive}`, { ...vessel, rows: [], archive });
  }
  return [...groups.values()].sort(compareFleetAssets);
}

function uniqueSheetName(name: string, used: Set<string>): string {
  const base = name.normalize('NFC').replace(/[\\/?*:[\]\uFFFE\uFFFF]|\p{Cc}/gu, ' ').replace(/\s+/g, ' ').replace(/^[\s']+|[\s']+$/g, '') || 'Navire';
  for (let index = 1; ; index++) {
    const suffix = index === 1 ? '' : ` (${index})`;
    const candidate = base.slice(0, 31 - suffix.length).replace(/[\uD800-\uDBFF]$/, '').replace(/[\s']+$/, '') + suffix;
    const key = candidate.toUpperCase();
    if (key === 'HISTORY' || used.has(key)) continue;
    used.add(key);
    return candidate;
  }
}

function workbookSheets(rows: readonly SeaOperationConsumptionWorkbookRow[], history: SeaOperationConsumptionHistory | undefined,
  fleet: readonly WorkbookVessel[]): WorkbookSheet[] {
  const names = new Set<string>();
  return vesselGroups(rows, history, fleet).map(group => {
    const { archive, name, registrationImo } = group;
    const archiveRows = archive && history ? history[archive].map(row => historicalRow(row, archive, name)) : [];
    return {
      name: uniqueSheetName(name, names),
      title: `Suivi des consommations · ${name}${registrationImo ? ` · ${registrationImo}` : ''}`,
      columns: archiveRows.length ? mixedColumns : liveColumns,
      sections: archiveRows.length ? mixedSections : liveSections,
      rows: [
        ...group.rows.map(row => liveColumns.map(column => column.value(row))),
        ...archiveRows,
      ],
      gaugeRows: archive === 'rozel' ? history?.rozelGauge : undefined,
    };
  });
}

function cellAddress(column: number, row: number): string {
  let letters = '';
  for (let index = column + 1; index > 0; index = Math.floor((index - 1) / 26)) {
    letters = String.fromCharCode(65 + (index - 1) % 26) + letters;
  }
  return `${letters}${row}`;
}

function escapeXml(value: string): string {
  const replacements: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\t': '\t', '\n': '\n', '\r': '&#13;' };
  return value.replace(/[&<>\uFFFE\uFFFF]|\p{Cc}/gu, character => replacements[character] ?? '');
}

function escapeAttribute(value: string): string {
  return escapeXml(value).replaceAll('"', '&quot;');
}

function cell(address: string, value: CellValue, style: number = STYLE.text): string {
  if (value === null || value === '') return '';
  if (typeof value === 'number') return Number.isFinite(value) ? `<c r="${address}" s="${style}"><v>${value}</v></c>` : '';
  if (typeof value === 'boolean') return `<c r="${address}" s="${style}" t="b"><v>${Number(value)}</v></c>`;
  return `<c r="${address}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

const styles = `${XML}<styleSheet xmlns="${SHEET_NS}">
  <numFmts count="7">
    <numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy hh:mm"/>
    <numFmt numFmtId="166" formatCode="[h]:mm"/><numFmt numFmtId="167" formatCode="#,##0.00"/><numFmt numFmtId="168" formatCode="0.00##"/>
    <numFmt numFmtId="169" formatCode="0.00%"/><numFmt numFmtId="170" formatCode="0.0000 &quot;j&quot;"/>
  </numFmts>
  <fonts count="4">
    <font><sz val="10"/><name val="Arial"/><color rgb="FF172635"/></font>
    <font><b/><sz val="14"/><name val="Arial"/><color rgb="FF172635"/></font>
    <font><b/><sz val="10"/><name val="Arial"/><color rgb="FFFFFFFF"/></font>
    <font><u/><sz val="10"/><name val="Arial"/><color rgb="FF0C5598"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF223B56"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0C5598"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="12">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    ${[164, 165, 166, 167, 168, 169, 170].map(id => `<xf numFmtId="${id}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`).join('')}
    <xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function gaugeAppendix(rows: readonly SeaOperationConsumptionHistoryRow[], firstRow: number): string {
  const headings = ['Jauge (%)', 'Capacité (L)', sourceRowColumn.label];
  const header = headings.map((heading, index) => cell(cellAddress(index, firstRow + 1), heading, STYLE.heading)).join('');
  const data = rows.map(({ cells, sourceRow }, index) => {
    const row = firstRow + 2 + index;
    return `<row r="${row}">${cell(`A${row}`, cells[0], STYLE.percent)}${cell(`B${row}`, cells[1], STYLE.number)}${cell(`C${row}`, sourceRow)}</row>`;
  }).join('');
  return `<row r="${firstRow}" ht="24" customHeight="1">${cell(`A${firstRow}`, 'Courbe des soutes du Rozel (CX-3-RZL)', STYLE.title)}</row>
    <row r="${firstRow + 1}" ht="29" customHeight="1">${header}</row>${data}`;
}

function worksheet({ name, columns, rows, sections, title, gaugeRows }: WorkbookSheet): string {
  const lastRow = 3 + rows.length;
  const gaugeStart = lastRow + 3;
  const gauge = gaugeRows?.length ? gaugeAppendix(gaugeRows, gaugeStart) : '';
  const bottomRow = gaugeRows?.length ? gaugeStart + 1 + gaugeRows.length : Math.max(4, lastRow);
  const empty = rows.length ? '' : `<row r="4">${cell('A4', 'Aucun relevé pour ce navire.')}</row>`;
  const linkTarget = gauge ? escapeAttribute(`'${name.replaceAll("'", "''")}'!A${gaugeStart}`) : '';
  const sectionCells = sections.map(section => {
    const label = cell(cellAddress(section.first, 2), section.title, STYLE.section);
    const fill = columns.slice(section.first + 1, section.last + 1).map((_, index) => `<c r="${cellAddress(section.first + index + 1, 2)}" s="${STYLE.section}"/>`).join('');
    return label + fill;
  }).join('');
  const columnWidths = columns.map(({ width }, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('');
  const headings = columns.map(({ label }, index) => cell(cellAddress(index, 3), label, STYLE.heading)).join('');
  const detail = rows.map((data, index) => {
    const row = index + 4;
    return `<row r="${row}">${columns.map((column, columnIndex) => {
      const value = data[columnIndex] ?? null;
      // Excel's 1900 calendar displays negative time values as hashes. Keep those source durations numeric in days.
      let style = column.style;
      if (column.gauge && data[11] === '%') style = STYLE.percent;
      if (style === STYLE.duration && typeof value === 'number' && value < 0) style = STYLE.days;
      return cell(cellAddress(columnIndex, row), value, style);
    }).join('')}</row>`;
  }).join('');
  return `${XML}<worksheet xmlns="${SHEET_NS}">
    <dimension ref="A1:${cellAddress(columns.length - 1, bottomRow)}"/>
    <sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane xSplit="2" ySplit="3" topLeftCell="C4" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>
    <sheetFormatPr defaultRowHeight="16"/>
    <cols>${columnWidths}</cols>
    <sheetData><row r="1" ht="24" customHeight="1">${cell('A1', title, STYLE.title)}${gauge ? cell('F1', 'Courbe des soutes ↓', STYLE.link) : ''}</row>
    <row r="2" ht="19" customHeight="1">${sectionCells}</row><row r="3" ht="29" customHeight="1">${headings}</row>${detail}${empty}${gauge}</sheetData>
    <autoFilter ref="A3:${cellAddress(columns.length - 1, lastRow)}"/>
    ${sections.length ? `<mergeCells count="${sections.length}">${sections.map(({ first, last }) => `<mergeCell ref="${cellAddress(first, 2)}:${cellAddress(last, 2)}"/>`).join('')}</mergeCells>` : ''}
    ${gauge ? `<hyperlinks><hyperlink ref="F1" location="${linkTarget}"/></hyperlinks>` : ''}
  </worksheet>`;
}

export async function buildSeaOperationConsumptionWorkbook(rows: readonly SeaOperationConsumptionWorkbookRow[], history?: SeaOperationConsumptionHistory,
  fleet: readonly WorkbookVessel[] = []): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const sheets = workbookSheets(rows, history, fleet);
  if (!sheets.length) sheets.push({ name: 'RELEVES', title: 'Suivi des consommations', columns: liveColumns, sections: liveSections, rows: [] });
  const sheetParts = sheets.map((sheet, index) => ({ sheet, id: index + 1, path: `worksheets/sheet${index + 1}.xml` }));
  zip.file('[Content_Types].xml', `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
    <Default Extension="xml" ContentType="application/xml"/>
    <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
    ${sheetParts.map(({ path }) => `<Override PartName="/xl/${path}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
    <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  </Types>`);
  zip.file('_rels/.rels', `${XML}<Relationships xmlns="${PACKAGE_REL_NS}"><Relationship Id="rId1" Type="${OFFICE_REL_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  const activeTab = Math.max(0, sheets.findIndex(sheet => sheet.rows.length || sheet.gaugeRows?.length));
  zip.file('xl/workbook.xml', `${XML}<workbook xmlns="${SHEET_NS}" xmlns:r="${OFFICE_REL_NS}"><bookViews><workbookView activeTab="${activeTab}"/></bookViews><sheets>${sheetParts.map(({ sheet, id }) => `<sheet name="${escapeAttribute(sheet.name)}" sheetId="${id}" r:id="rId${id}"/>`).join('')}</sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `${XML}<Relationships xmlns="${PACKAGE_REL_NS}">${sheetParts.map(({ id, path }) => `<Relationship Id="rId${id}" Type="${OFFICE_REL_NS}/worksheet" Target="${path}"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="${OFFICE_REL_NS}/styles" Target="styles.xml"/></Relationships>`);
  zip.file('xl/styles.xml', styles);
  for (const { path, sheet } of sheetParts) zip.file(`xl/${path}`, worksheet(sheet));
  return zip.generateAsync({ type: 'blob', mimeType: MIME, compression: 'DEFLATE' });
}
