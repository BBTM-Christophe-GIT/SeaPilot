import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import {
  WORKING_TIME_XLSM_PARSER_VERSION,
  type WorkingTimeImportDetectedRow,
  type WorkingTimeImportPhase,
  type WorkingTimeImportWorkbook,
} from './workingTimeExcelImportModel';

export type { WorkingTimeImportDetectedRow, WorkingTimeImportPhase, WorkingTimeImportWorkbook } from './workingTimeExcelImportModel';

interface ParsedCell {
  value: string;
  styleId: number;
}

interface ParsedSheet {
  name: string;
  rows: Map<number, Map<number, ParsedCell>>;
}

const xmlParser = new XMLParser({
  attributeNamePrefix: '',
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: false,
});

function arrayify<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function flattenText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(flattenText).join('');
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if ('#text' in record) return flattenText(record['#text']);
    if ('t' in record) return flattenText(record.t);
    return Object.entries(record)
      .filter(([key]) => !key.includes(':') && key !== 'space')
      .map(([, nested]) => flattenText(nested))
      .join('');
  }
  return '';
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeLabel(value: string): string {
  return normalizeWhitespace(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function columnNumber(address: string): number {
  const letters = address.match(/^[A-Z]+/)?.[0] || '';
  return [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0);
}

function excelDate(serial: number): string {
  const date = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000);
  return date.toISOString().slice(0, 10);
}

function numberValue(value: string): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function cellValue(cell: Record<string, unknown>, sharedStrings: string[]): string {
  const type = String(cell.t || '');
  if (type === 's') return sharedStrings[Number(cell.v)] || '';
  if (type === 'inlineStr') return flattenText(cell.is);
  return flattenText(cell.v);
}

function workPhases(workSlots: boolean[]): WorkingTimeImportPhase[] {
  const phases: WorkingTimeImportPhase[] = [];
  let start: number | null = null;
  for (let index = 0; index <= workSlots.length; index += 1) {
    if (index < workSlots.length && workSlots[index]) {
      if (start === null) start = index;
    } else if (start !== null) {
      phases.push({ startMinute: start * 30, endMinute: index * 30 });
      start = null;
    }
  }
  return phases;
}

async function parseWorkbook(buffer: ArrayBuffer | Uint8Array): Promise<{
  sheets: ParsedSheet[];
  fillByStyle: number[];
  macroPresent: boolean;
}> {
  const zip = await JSZip.loadAsync(buffer);
  const workbookXml = await zip.file('xl/workbook.xml')?.async('string');
  const relationshipsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string');
  const stylesXml = await zip.file('xl/styles.xml')?.async('string');
  if (!workbookXml || !relationshipsXml || !stylesXml) {
    throw new Error('Classeur XLSM invalide : les métadonnées OpenXML attendues sont absentes.');
  }
  const workbook = xmlParser.parse(workbookXml);
  const relationships = xmlParser.parse(relationshipsXml);
  const relationshipMap = new Map(arrayify<Record<string, string>>(relationships.Relationships?.Relationship)
    .map((relationship) => [relationship.Id, relationship.Target]));
  const sharedXml = await zip.file('xl/sharedStrings.xml')?.async('string');
  const sharedStrings = sharedXml
    ? arrayify<Record<string, unknown>>(xmlParser.parse(sharedXml).sst?.si).map((item) => normalizeWhitespace(flattenText(item)))
    : [];
  const styles = xmlParser.parse(stylesXml);
  const fillByStyle = arrayify<Record<string, string>>(styles.styleSheet?.cellXfs?.xf).map((style) => Number(style.fillId || 0));
  const sheets: ParsedSheet[] = [];
  for (const workbookSheet of arrayify<Record<string, string>>(workbook.workbook?.sheets?.sheet)) {
    const target = relationshipMap.get(workbookSheet['r:id']);
    if (!target) continue;
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\.\//, '')}`;
    const sheetXml = await zip.file(path)?.async('string');
    if (!sheetXml) continue;
    const worksheet = xmlParser.parse(sheetXml).worksheet;
    const rows = new Map<number, Map<number, ParsedCell>>();
    for (const rawRow of arrayify<Record<string, unknown>>(worksheet?.sheetData?.row)) {
      const rowNumber = Number(rawRow.r || 0);
      const cells = new Map<number, ParsedCell>();
      for (const rawCell of arrayify<Record<string, unknown>>(rawRow.c as Record<string, unknown> | Record<string, unknown>[] | undefined)) {
        const address = String(rawCell.r || '');
        const column = columnNumber(address);
        if (column) cells.set(column, { value: normalizeWhitespace(cellValue(rawCell, sharedStrings)), styleId: Number(rawCell.s || 0) });
      }
      if (rowNumber) rows.set(rowNumber, cells);
    }
    sheets.push({ name: workbookSheet.name, rows });
  }
  return { sheets, fillByStyle, macroPresent: Boolean(zip.file('xl/vbaProject.bin')) };
}

function findColumn(headers: Map<number, ParsedCell>, label: string): number | null {
  for (const [column, cell] of headers) {
    if (normalizeLabel(cell.value).includes(label)) return column;
  }
  return null;
}

function personFromSheet(sheet: ParsedSheet): string {
  for (const cells of sheet.rows.values()) {
    for (const [column, cell] of cells) {
      if (normalizeLabel(cell.value) !== 'marin') continue;
      for (let candidate = column + 1; candidate <= column + 8; candidate += 1) {
        const value = cells.get(candidate)?.value || '';
        if (value) return value;
      }
    }
  }
  return '';
}

function parseMonthlySheet(sheet: ParsedSheet, fillByStyle: number[]): { person: string; rows: WorkingTimeImportDetectedRow[] } | null {
  const header = [...sheet.rows.entries()].find(([, cells]) => [...cells.values()].some((cell) => normalizeLabel(cell.value).includes('heures travaillees')));
  if (!header) return null;
  const [headerRow, headers] = header;
  const midnightColumns = [...headers.entries()].filter(([, cell]) => normalizeLabel(cell.value) === '00h').map(([column]) => column).sort((a, b) => a - b);
  if (midnightColumns.length < 2 || midnightColumns[1] - midnightColumns[0] !== 48) return null;
  const gridStart = midnightColumns[0];
  const gridEnd = midnightColumns[1] - 1;
  const totalColumn = findColumn(headers, 'heures travaillees');
  if (!totalColumn) return null;
  const dateColumn = gridStart - 1;
  const captainColumn = findColumn(headers, 'capitaine');
  const vesselColumn = findColumn(headers, 'navire');
  const imoColumn = findColumn(headers, 'omi');
  const flagColumn = findColumn(headers, 'pavillon');
  const commentColumn = findColumn(headers, 'commentaire');

  const candidateFills = new Map<number, number>();
  for (const [rowNumber, cells] of sheet.rows) {
    if (rowNumber <= headerRow) continue;
    const reported = numberValue(cells.get(totalColumn)?.value || '');
    if (reported === null || reported <= 0) continue;
    const counts = new Map<number, number>();
    for (let column = gridStart; column <= gridEnd; column += 1) {
      const fill = fillByStyle[cells.get(column)?.styleId || 0] || 0;
      if (fill > 1) counts.set(fill, (counts.get(fill) || 0) + 1);
    }
    for (const [fill, count] of counts) {
      const score = count + (Math.abs(count * 0.5 - reported) < 0.001 ? 1_000 : 0);
      candidateFills.set(fill, (candidateFills.get(fill) || 0) + score);
    }
  }
  const workFill = [...candidateFills.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  if (workFill === undefined) return null;

  const rows: WorkingTimeImportDetectedRow[] = [];
  for (const [rowNumber, cells] of sheet.rows) {
    if (rowNumber <= headerRow) continue;
    const serial = numberValue(cells.get(dateColumn)?.value || '');
    if (serial === null || serial < 35_000 || serial > 80_000) continue;
    const slots = Array.from({ length: 48 }, (_, index) => (fillByStyle[cells.get(gridStart + index)?.styleId || 0] || 0) === workFill);
    const detectedPhases = workPhases(slots);
    const detectedWorkSeconds = slots.filter(Boolean).length * 1800;
    const reportedHours = numberValue(cells.get(totalColumn)?.value || '');
    const reportedWorkSeconds = reportedHours === null ? null : Math.round(reportedHours * 3600);
    if (!detectedWorkSeconds && !reportedWorkSeconds) continue;
    const issues = reportedWorkSeconds !== null && reportedWorkSeconds !== detectedWorkSeconds ? ['total_mismatch'] : [];
    rows.push({
      date: excelDate(serial), sourceSheet: sheet.name, sourceRow: rowNumber, detectedPhases,
      reportedWorkSeconds, detectedWorkSeconds,
      captainName: captainColumn ? cells.get(captainColumn)?.value || '' : '',
      vesselName: vesselColumn ? cells.get(vesselColumn)?.value || '' : '',
      imoNumber: imoColumn ? cells.get(imoColumn)?.value || '' : '',
      flagState: flagColumn ? cells.get(flagColumn)?.value || '' : '',
      sourceComment: commentColumn ? cells.get(commentColumn)?.value || '' : '',
      issues,
    });
  }
  return { person: personFromSheet(sheet), rows };
}

export async function parseWorkingTimeXlsm(
  buffer: ArrayBuffer | Uint8Array,
  sourceFileName: string,
): Promise<WorkingTimeImportWorkbook> {
  if (!sourceFileName.toLowerCase().endsWith('.xlsm')) throw new Error('Sélectionnez un classeur annuel au format XLSM.');
  const parsed = await parseWorkbook(buffer);
  const monthly = parsed.sheets.map((sheet) => parseMonthlySheet(sheet, parsed.fillByStyle)).filter(Boolean) as Array<{ person: string; rows: WorkingTimeImportDetectedRow[] }>;
  let rows = monthly.flatMap((item) => item.rows).sort((left, right) => left.date.localeCompare(right.date));
  if (!rows.length) throw new Error('Aucune journée de travail n’a été détectée dans le classeur.');
  const people = Array.from(new Set(monthly.map((item) => item.person).filter(Boolean)));
  const years = Array.from(new Set(rows.map((row) => Number(row.date.slice(0, 4)))));
  if (people.length !== 1) throw new Error('Le nom du marin est absent ou incohérent entre les feuilles mensuelles.');
  if (years.length !== 1) throw new Error('Le classeur contient des journées appartenant à plusieurs années.');
  const gridYear = years[0];
  const fileNameYear = Number(sourceFileName.match(/(?:^|\D)(20\d{2})(?:\D|$)/)?.[1] || 0) || null;
  const detectedYear = fileNameYear || gridYear;
  const warnings: string[] = [];
  if (fileNameYear && fileNameYear !== gridYear) {
    warnings.push(`L’année ${fileNameYear} du nom de fichier diffère de l’année ${gridYear} enregistrée dans la grille. Les mois et jours sont proposés pour ${fileNameYear} et doivent être confirmés avant l’import.`);
    rows = rows.map((row) => ({ ...row, date: `${fileNameYear}${row.date.slice(4)}`, issues: [...row.issues, 'source_year_mismatch'] }));
  }
  return {
    sourceFileName,
    detectedPersonName: people[0],
    detectedYear,
    gridYear,
    fileNameYear,
    warnings,
    macroPresent: parsed.macroPresent,
    macroExecution: 'disabled',
    parserVersion: WORKING_TIME_XLSM_PARSER_VERSION,
    sheetNames: parsed.sheets.map((sheet) => sheet.name),
    rows,
    detectedWorkSeconds: rows.reduce((total, row) => total + row.detectedWorkSeconds, 0),
    reportedWorkSeconds: rows.reduce((total, row) => total + (row.reportedWorkSeconds || 0), 0),
  };
}
