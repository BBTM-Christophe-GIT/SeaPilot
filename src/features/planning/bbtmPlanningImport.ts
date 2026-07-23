import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

export const BBTM_IMPORT_SOURCE_LABEL = 'bbtm-planning-xlsx-v1';

export type BbtmPersonnelCategory = 'Équipage' | 'Office' | 'Extra' | 'Stagiaire';
export type BbtmDecisionKind = 'assignment' | 'status' | 'excluded' | 'unmapped';

export interface BbtmCatalogPerson {
  id: number;
  name: string;
  active: boolean;
}

export interface BbtmCatalogVessel {
  id: number;
  name: string;
  active: boolean;
}

export interface BbtmCatalog {
  people: BbtmCatalogPerson[];
  vessels: BbtmCatalogVessel[];
}

export interface BbtmDailyCell {
  sheet: string;
  row: number;
  column: string;
  date: string;
  person: string;
  personKey: string;
  category: BbtmPersonnelCategory;
  rawValue: string;
  kind: BbtmDecisionKind;
  vesselName: string;
  sailorStatus: string;
  comment: string;
  reason: string;
}

export interface BbtmImportPeriod {
  sourceKey: string;
  sheet: string;
  person: string;
  personKey: string;
  personId: number | null;
  personActive: boolean | null;
  category: BbtmPersonnelCategory;
  vesselName: string;
  vesselId: number | null;
  sailorStatus: string;
  watchGroup: string;
  startsOn: string;
  endsOn: string;
  dayCount: number;
  comment: string;
  importable: boolean;
  warning: string;
}

export interface BbtmBoardPreview {
  vesselName: string;
  watchGroup: string;
  members: string[];
  firstDate: string;
  lastDate: string;
  sharedDayScore: number;
  confidence: 'Forte' | 'Moyenne' | 'Faible';
}

export interface BbtmPersonPreview {
  sourceName: string;
  personKey: string;
  categories: BbtmPersonnelCategory[];
  personId: number | null;
  matchedName: string;
  active: boolean | null;
  importable: boolean;
  warning: string;
}

export interface BbtmImportPreview {
  sourceLabel: string;
  sourceFile: string;
  cutoffDate: string;
  generatedAt: string;
  periods: BbtmImportPeriod[];
  boards: BbtmBoardPreview[];
  people: BbtmPersonPreview[];
  reviewCells: BbtmDailyCell[];
  excludedCells: BbtmDailyCell[];
  metrics: {
    sourcePeople: number;
    matchedPeople: number;
    unmatchedPeople: number;
    inactivePeople: number;
    importablePeriods: number;
    blockedPeriods: number;
    reviewCells: number;
    excludedCells: number;
    inferredBoards: number;
  };
}

export interface BbtmImportSqlBundle {
  applySql: string;
  rollbackSql: string;
  rowCount: number;
}

interface ParsedSheet {
  name: string;
  cells: Map<string, string>;
  merges: string[];
}

interface ExtractOptions {
  cutoffDate: string;
  sourceFile: string;
  generatedAt?: string;
}

const xmlParser = new XMLParser({
  attributeNamePrefix: '',
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: false,
});

const personnelRanges: Record<string, { startRow: number; endRow: number; startDate: string }> = {
  '2025': { startRow: 25, endRow: 52, startDate: '2025-06-01' },
  '2026': { startRow: 28, endRow: 64, startDate: '2026-01-01' },
};

const vesselCodeMap = new Map<string, string>([
  ['LR', 'LE ROZEL'],
  ['RZL', 'LE ROZEL'],
  ['SU', 'SUROIT'],
  ['SUR', 'SUROIT'],
  ['SU/LDM', 'SUROIT'],
  ['SU/LH', 'SUROIT'],
  ['KD', 'KROKDUR'],
  ['KDR', 'KROKDUR'],
  ['GRY', 'GOURY'],
  ['HIR', 'HIRONDELLE DE LA MANCHE'],
  ['HM', 'HIRONDELLE DE LA MANCHE'],
  ['LDM', 'LANDEMER'],
  ['HE', 'HOLENN EUSA'],
  ['LH', 'YARD - LE HAVRE'],
  ['CH', 'ARMEMENT CHERBOURG'],
]);

const excludedCodes = new Set(['DK', 'SPA', 'BR', 'FLA', 'OR', 'SEANERGY']);
const ARMEMENT_CHERBOURG = 'ARMEMENT CHERBOURG';
const nonBoardVessels = new Set([ARMEMENT_CHERBOURG, 'YARD - LE HAVRE']);
const personAliases = new Map([['KIKI', 'CHRISTOPHE BINET']]);

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

export function cleanBbtmPersonName(value: string): string {
  const cleaned = normalizeWhitespace(value)
    .replace(/\b(?:0\d(?:[ .-]?\d{2}){4})\b/g, '')
    .replace(/[^\p{L}'’ -]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return personAliases.get(cleaned.toUpperCase()) || cleaned;
}

export function normalizePersonKey(value: string): string {
  return cleanBbtmPersonName(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z -]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function normalizeCode(value: string): string {
  return normalizeWhitespace(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

export function classifyBbtmValue(value: string): Omit<BbtmDailyCell, 'sheet' | 'row' | 'column' | 'date' | 'person' | 'personKey' | 'category' | 'rawValue'> {
  const normalized = normalizeCode(value);
  const exactVessel = vesselCodeMap.get(normalized);
  if (exactVessel) {
    return {
      kind: 'assignment',
      vesselName: exactVessel,
      sailorStatus: nonBoardVessels.has(exactVessel) ? 'A Terre' : 'En Mer',
      comment: '',
      reason: 'Code d’affectation reconnu',
    };
  }

  const chWithDetail = normalized.match(/^CH\s+(MATIN|APRES-MIDI)$/);
  if (chWithDetail) {
    return {
      kind: 'assignment',
      vesselName: 'ARMEMENT CHERBOURG',
      sailorStatus: 'A Terre',
      comment: chWithDetail[1] === 'MATIN' ? 'Matin' : 'Après-midi',
      reason: 'Armement Cherbourg avec précision horaire',
    };
  }

  if (excludedCodes.has(normalized)) {
    return { kind: 'excluded', vesselName: '', sailorStatus: '', comment: '', reason: 'Code explicitement exclu' };
  }

  if (normalized === 'CP') {
    return { kind: 'status', vesselName: '', sailorStatus: 'Vacance', comment: '', reason: 'Congé payé' };
  }
  if (normalized === 'AST') {
    return { kind: 'status', vesselName: '', sailorStatus: 'A Terre', comment: 'Astreinte', reason: 'Astreinte' };
  }
  if (normalized === 'TT') {
    return { kind: 'status', vesselName: '', sailorStatus: 'A Terre', comment: 'Télétravail', reason: 'Télétravail' };
  }
  if (normalized === 'VM') {
    return { kind: 'status', vesselName: '', sailorStatus: 'A Terre', comment: 'Visite médicale', reason: 'Visite médicale' };
  }
  if (normalized.includes('DENTISTE')) {
    return { kind: 'status', vesselName: '', sailorStatus: 'Vacance', comment: 'Dentiste', reason: 'Dentiste' };
  }
  if (normalized === 'VACANCE' || normalized === 'VACANCES') {
    return { kind: 'status', vesselName: '', sailorStatus: 'Vacance', comment: '', reason: 'Vacances' };
  }
  if (normalized === 'FORMATION' || normalized.startsWith('FORMATION ') || normalized.startsWith('FORM ')) {
    return { kind: 'status', vesselName: '', sailorStatus: 'A Terre', comment: 'En formation', reason: 'Formation' };
  }

  return {
    kind: 'unmapped',
    vesselName: '',
    sailorStatus: '',
    comment: '',
    reason: 'Texte libre ou code sans règle validée',
  };
}

function columnToNumber(column: string): number {
  let result = 0;
  for (const letter of column) result = result * 26 + letter.charCodeAt(0) - 64;
  return result;
}

function numberToColumn(value: number): string {
  let current = value;
  let result = '';
  while (current > 0) {
    current -= 1;
    result = String.fromCharCode(65 + (current % 26)) + result;
    current = Math.floor(current / 26);
  }
  return result;
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
}

function cellParts(address: string): { column: string; row: number } | null {
  const match = address.match(/^([A-Z]+)(\d+)$/);
  return match ? { column: match[1], row: Number(match[2]) } : null;
}

function expandMergedCells(sheet: ParsedSheet) {
  for (const merge of sheet.merges) {
    const [startAddress, endAddress] = merge.split(':');
    const start = cellParts(startAddress);
    const end = cellParts(endAddress || startAddress);
    if (!start || !end) continue;
    const value = sheet.cells.get(startAddress);
    if (!value) continue;
    for (let row = start.row; row <= end.row; row += 1) {
      for (let column = columnToNumber(start.column); column <= columnToNumber(end.column); column += 1) {
        const address = `${numberToColumn(column)}${row}`;
        if (!sheet.cells.has(address)) sheet.cells.set(address, value);
      }
    }
  }
}

async function parseWorkbook(buffer: Uint8Array): Promise<ParsedSheet[]> {
  const zip = await JSZip.loadAsync(buffer);
  const workbookXml = await zip.file('xl/workbook.xml')?.async('string');
  const relationshipsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string');
  if (!workbookXml || !relationshipsXml) throw new Error('Classeur XLSX invalide : métadonnées absentes.');

  const workbook = xmlParser.parse(workbookXml);
  const relationships = xmlParser.parse(relationshipsXml);
  const relationshipMap = new Map(
    arrayify<Record<string, string>>(relationships.Relationships?.Relationship).map((relationship) => [relationship.Id, relationship.Target]),
  );

  const sharedXml = await zip.file('xl/sharedStrings.xml')?.async('string');
  const sharedStrings = sharedXml
    ? arrayify<Record<string, unknown>>(xmlParser.parse(sharedXml).sst?.si).map((item) => normalizeWhitespace(flattenText(item)))
    : [];

  const sheets: ParsedSheet[] = [];
  for (const workbookSheet of arrayify<Record<string, string>>(workbook.workbook?.sheets?.sheet)) {
    const name = workbookSheet.name;
    const relationshipId = workbookSheet['r:id'];
    const target = relationshipMap.get(relationshipId);
    if (!name || !target) continue;
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    const sheetXml = await zip.file(path)?.async('string');
    if (!sheetXml) continue;
    const parsed = xmlParser.parse(sheetXml).worksheet;
    const cells = new Map<string, string>();
    for (const row of arrayify<Record<string, unknown>>(parsed?.sheetData?.row)) {
      for (const cell of arrayify<Record<string, unknown>>(row.c as Record<string, unknown> | Record<string, unknown>[] | undefined)) {
        const address = String(cell.r || '');
        if (!address) continue;
        const type = String(cell.t || '');
        const rawValue = type === 's'
          ? sharedStrings[Number(cell.v)] || ''
          : type === 'inlineStr'
            ? flattenText(cell.is)
            : flattenText(cell.v);
        const value = normalizeWhitespace(rawValue);
        if (value) cells.set(address, value);
      }
    }
    const merges = arrayify<Record<string, string>>(parsed?.mergeCells?.mergeCell).map((merge) => merge.ref).filter(Boolean);
    const result = { name, cells, merges };
    expandMergedCells(result);
    sheets.push(result);
  }
  return sheets;
}

function categoryForRow(sheet: string, row: number): BbtmPersonnelCategory {
  if (sheet === '2025') {
    if (row >= 50) return 'Stagiaire';
    if (row >= 48) return 'Extra';
    if (row >= 45) return 'Office';
    return 'Équipage';
  }
  if (row >= 57) return 'Stagiaire';
  if (row >= 55) return 'Extra';
  if (row >= 52) return 'Office';
  return 'Équipage';
}

function extractDailyCells(sheets: ParsedSheet[], cutoffDate: string): BbtmDailyCell[] {
  const result: BbtmDailyCell[] = [];
  for (const sheet of sheets) {
    const config = personnelRanges[sheet.name];
    if (!config) continue;
    for (let row = config.startRow; row <= config.endRow; row += 1) {
      const person = cleanBbtmPersonName(sheet.cells.get(`B${row}`) || '');
      if (!person) continue;
      const personKey = normalizePersonKey(person);
      for (let columnNumber = columnToNumber('C'); ; columnNumber += 1) {
        const date = addDays(config.startDate, columnNumber - columnToNumber('C'));
        if (date > cutoffDate || date.slice(0, 4) !== sheet.name) break;
        const column = numberToColumn(columnNumber);
        const rawValue = normalizeWhitespace(sheet.cells.get(`${column}${row}`) || '');
        if (!rawValue) continue;
        result.push({
          sheet: sheet.name,
          row,
          column,
          date,
          person,
          personKey,
          category: categoryForRow(sheet.name, row),
          rawValue,
          ...classifyBbtmValue(rawValue),
        });
      }
    }
  }
  return result;
}

function normalizeVesselKey(value: string): string {
  return normalizeCode(value).replace(/[^A-Z0-9]/g, '');
}

function resolveCatalogPerson(personKey: string, catalog: BbtmCatalog): BbtmCatalogPerson | null {
  return catalog.people.find((person) => normalizePersonKey(person.name) === personKey) || null;
}

function resolveCatalogVessel(vesselName: string, catalog: BbtmCatalog): BbtmCatalogVessel | null {
  return catalog.vessels.find((vessel) => normalizeVesselKey(vessel.name) === normalizeVesselKey(vesselName)) || null;
}

function coalescePeriods(cells: BbtmDailyCell[], catalog: BbtmCatalog): BbtmImportPeriod[] {
  const usable = cells
    .filter((cell) => cell.kind === 'assignment' || cell.kind === 'status')
    .sort((left, right) =>
      [left.sheet, left.personKey, left.vesselName, left.sailorStatus, left.comment, left.date].join('|').localeCompare(
        [right.sheet, right.personKey, right.vesselName, right.sailorStatus, right.comment, right.date].join('|'),
      ),
    );
  const periods: BbtmImportPeriod[] = [];
  for (const cell of usable) {
    const person = resolveCatalogPerson(cell.personKey, catalog);
    const vessel = cell.vesselName ? resolveCatalogVessel(cell.vesselName, catalog) : null;
    const previous = periods.at(-1);
    const sameRun =
      previous &&
      previous.sheet === cell.sheet &&
      previous.personKey === cell.personKey &&
      previous.vesselName === cell.vesselName &&
      previous.sailorStatus === cell.sailorStatus &&
      previous.comment === cell.comment &&
      addDays(previous.endsOn, 1) === cell.date;
    if (sameRun) {
      previous.endsOn = cell.date;
      previous.dayCount += 1;
      continue;
    }

    const warnings: string[] = [];
    if (!person) warnings.push('Personne absente de SeaPilot');
    else if (!person.active) warnings.push('Personne inactive dans SeaPilot');
    if (cell.vesselName && !vessel) warnings.push('Navire/lieu absent de SeaPilot');
    const sourceKey = [cell.sheet, cell.row, cell.date, cell.kind, normalizeCode(cell.rawValue)].join(':');
    periods.push({
      sourceKey,
      sheet: cell.sheet,
      person: cell.person,
      personKey: cell.personKey,
      personId: person?.id ?? null,
      personActive: person?.active ?? null,
      category: cell.category,
      vesselName: cell.vesselName,
      vesselId: vessel?.id ?? null,
      sailorStatus: cell.sailorStatus,
      watchGroup: '',
      startsOn: cell.date,
      endsOn: cell.date,
      dayCount: 1,
      comment: cell.comment,
      importable: Boolean(person && (!cell.vesselName || vessel)),
      warning: warnings.join(' · '),
    });
  }
  return periods;
}

function dateSetForPeriods(periods: BbtmImportPeriod[]): Set<string> {
  const dates = new Set<string>();
  for (const period of periods) {
    for (let date = period.startsOn; date <= period.endsOn; date = addDays(date, 1)) dates.add(date);
  }
  return dates;
}

function intersectionCount(left: Set<string>, right: Set<string>): number {
  let count = 0;
  for (const date of left) if (right.has(date)) count += 1;
  return count;
}

function inferBoards(periods: BbtmImportPeriod[]): BbtmBoardPreview[] {
  const armementPeriods = periods.filter((period) => period.vesselName === ARMEMENT_CHERBOURG);
  for (const period of armementPeriods) period.watchGroup = 'Armement';

  const assignmentPeriods = periods.filter(
    (period) => period.vesselName && !nonBoardVessels.has(period.vesselName) && period.sailorStatus === 'En Mer',
  );
  const boards: BbtmBoardPreview[] = [];
  if (armementPeriods.length) {
    boards.push({
      vesselName: ARMEMENT_CHERBOURG,
      watchGroup: 'Armement',
      members: [...new Set(armementPeriods.map((period) => period.person))].sort((left, right) => left.localeCompare(right)),
      firstDate: armementPeriods.map((period) => period.startsOn).sort()[0],
      lastDate: armementPeriods.map((period) => period.endsOn).sort().at(-1)!,
      sharedDayScore: 1,
      confidence: 'Forte',
    });
  }
  const byVessel = new Map<string, BbtmImportPeriod[]>();
  for (const period of assignmentPeriods) byVessel.set(period.vesselName, [...(byVessel.get(period.vesselName) || []), period]);

  for (const [vesselName, vesselPeriods] of byVessel) {
    const byPerson = new Map<string, BbtmImportPeriod[]>();
    for (const period of vesselPeriods) byPerson.set(period.personKey, [...(byPerson.get(period.personKey) || []), period]);
    const personDates = new Map([...byPerson].map(([key, values]) => [key, dateSetForPeriods(values)]));
    const keys = [...byPerson.keys()];
    const pairScores = new Map<string, number>();
    const pairKey = (left: string, right: string) => [left, right].sort().join('|');
    for (let leftIndex = 0; leftIndex < keys.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < keys.length; rightIndex += 1) {
        const left = personDates.get(keys[leftIndex])!;
        const right = personDates.get(keys[rightIndex])!;
        const shared = intersectionCount(left, right);
        const overlapScore = shared / Math.max(1, Math.min(left.size, right.size));
        const startsClose = Math.min(
          ...byPerson.get(keys[leftIndex])!.flatMap((leftPeriod) =>
            byPerson.get(keys[rightIndex])!.map((rightPeriod) => Math.abs(daysBetween(leftPeriod.startsOn, rightPeriod.startsOn))),
          ),
        ) <= 3;
        if (shared >= 3 && overlapScore >= 0.6 && startsClose) {
          pairScores.set(pairKey(keys[leftIndex], keys[rightIndex]), overlapScore);
        }
      }
    }

    const components: string[][] = [];
    const unassigned = new Set(keys);
    while (unassigned.size > 0) {
      const seed = [...unassigned]
        .sort((left, right) => {
          const leftConnections = [...unassigned].filter((other) => other !== left && pairScores.has(pairKey(left, other))).length;
          const rightConnections = [...unassigned].filter((other) => other !== right && pairScores.has(pairKey(right, other))).length;
          return rightConnections - leftConnections;
        })[0];
      const component = [seed];
      const candidates = [...unassigned]
        .filter((candidate) => candidate !== seed && pairScores.has(pairKey(seed, candidate)))
        .sort((left, right) => (pairScores.get(pairKey(seed, right)) || 0) - (pairScores.get(pairKey(seed, left)) || 0));
      for (const candidate of candidates) {
        if (component.every((member) => member === candidate || pairScores.has(pairKey(member, candidate)))) component.push(candidate);
      }
      for (const member of component) unassigned.delete(member);
      if (component.length >= 2) components.push(component);
    }

    const sortedComponents = components.sort((left, right) => {
      const leftFirst = Math.min(...left.flatMap((key) => byPerson.get(key)!.map((period) => Date.parse(period.startsOn))));
      const rightFirst = Math.min(...right.flatMap((key) => byPerson.get(key)!.map((period) => Date.parse(period.startsOn))));
      return leftFirst - rightFirst;
    });
    const componentKeys = new Set(sortedComponents.flat());
    const standaloneKeys = keys
      .filter((key) => !componentKeys.has(key))
      .sort((left, right) => byPerson.get(left)![0].person.localeCompare(byPerson.get(right)![0].person));
    let boardCount = Math.min(2, sortedComponents.length);
    if (boardCount === 0) boardCount = Math.min(2, keys.length);
    else if (boardCount === 1 && standaloneKeys.length > 0) boardCount = 2;
    const boardBuckets = Array.from({ length: boardCount }, () => ({
      periods: [] as BbtmImportPeriod[],
      members: new Set<string>(),
      scores: [] as number[],
    }));

    sortedComponents.forEach((component, index) => {
      const boardIndex = index % boardCount;
      const watchGroup = `Bordée ${boardIndex + 1}`;
      const componentPeriods = component.flatMap((key) => byPerson.get(key)!);
      const sharedScores: number[] = [];
      for (let left = 0; left < component.length; left += 1) {
        for (let right = left + 1; right < component.length; right += 1) {
          const leftDates = personDates.get(component[left])!;
          const rightDates = personDates.get(component[right])!;
          sharedScores.push(intersectionCount(leftDates, rightDates) / Math.max(1, Math.min(leftDates.size, rightDates.size)));
        }
      }
      const bucket = boardBuckets[boardIndex];
      bucket.periods.push(...componentPeriods);
      for (const key of component) bucket.members.add(byPerson.get(key)![0].person);
      bucket.scores.push(...sharedScores);
      for (const period of componentPeriods) period.watchGroup = watchGroup;
    });

    for (const key of standaloneKeys) {
      const boardIndex = boardBuckets
        .map((bucket, index) => ({ index, memberCount: bucket.members.size }))
        .sort((left, right) => left.memberCount - right.memberCount || left.index - right.index)[0].index;
      const watchGroup = `Bordée ${boardIndex + 1}`;
      const personPeriods = byPerson.get(key)!;
      boardBuckets[boardIndex].periods.push(...personPeriods);
      boardBuckets[boardIndex].members.add(personPeriods[0].person);
      for (const period of personPeriods) period.watchGroup = watchGroup;
    }

    boardBuckets.forEach((bucket, index) => {
      const score = bucket.scores.length
        ? bucket.scores.reduce((sum, value) => sum + value, 0) / bucket.scores.length
        : 0;
      boards.push({
        vesselName,
        watchGroup: `Bordée ${index + 1}`,
        members: [...bucket.members].sort((left, right) => left.localeCompare(right)),
        firstDate: bucket.periods.map((period) => period.startsOn).sort()[0],
        lastDate: bucket.periods.map((period) => period.endsOn).sort().at(-1)!,
        sharedDayScore: score,
        confidence: score >= 0.8 ? 'Forte' : score >= 0.65 ? 'Moyenne' : 'Faible',
      });
    });
  }
  return boards;
}

function buildPeoplePreview(cells: BbtmDailyCell[], catalog: BbtmCatalog): BbtmPersonPreview[] {
  const sourcePeople = new Map<string, { name: string; categories: Set<BbtmPersonnelCategory> }>();
  for (const cell of cells) {
    const existing = sourcePeople.get(cell.personKey) || { name: cell.person, categories: new Set<BbtmPersonnelCategory>() };
    existing.categories.add(cell.category);
    sourcePeople.set(cell.personKey, existing);
  }
  return [...sourcePeople]
    .map(([personKey, source]) => {
      const match = resolveCatalogPerson(personKey, catalog);
      return {
        sourceName: source.name,
        personKey,
        categories: [...source.categories].sort(),
        personId: match?.id ?? null,
        matchedName: match?.name ?? '',
        active: match?.active ?? null,
        importable: Boolean(match),
        warning: !match ? 'Personne absente de SeaPilot' : !match.active ? 'Personne inactive : import historique uniquement' : '',
      };
    })
    .sort((left, right) => left.sourceName.localeCompare(right.sourceName));
}

export async function buildBbtmImportPreview(
  buffer: Uint8Array,
  catalog: BbtmCatalog,
  options: ExtractOptions,
): Promise<BbtmImportPreview> {
  const sheets = await parseWorkbook(buffer);
  const cells = extractDailyCells(sheets, options.cutoffDate);
  const periods = coalescePeriods(cells, catalog);
  const boards = inferBoards(periods);
  const people = buildPeoplePreview(cells, catalog);
  const reviewCells = cells.filter((cell) => cell.kind === 'unmapped');
  const excludedCells = cells.filter((cell) => cell.kind === 'excluded');
  return {
    sourceLabel: BBTM_IMPORT_SOURCE_LABEL,
    sourceFile: options.sourceFile,
    cutoffDate: options.cutoffDate,
    generatedAt: options.generatedAt || new Date().toISOString(),
    periods,
    boards,
    people,
    reviewCells,
    excludedCells,
    metrics: {
      sourcePeople: people.length,
      matchedPeople: people.filter((person) => person.personId !== null).length,
      unmatchedPeople: people.filter((person) => person.personId === null).length,
      inactivePeople: people.filter((person) => person.active === false).length,
      importablePeriods: periods.filter((period) => period.importable).length,
      blockedPeriods: periods.filter((period) => !period.importable).length,
      reviewCells: reviewCells.length,
      excludedCells: excludedCells.length,
      inferredBoards: boards.length,
    },
  };
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlNullableText(value: string): string {
  return value ? sqlLiteral(value) : 'null';
}

function sourceFileName(sourceFile: string): string {
  return sourceFile.split(/[\\/]/).at(-1) || sourceFile;
}

export function buildBbtmImportSql(preview: BbtmImportPreview): BbtmImportSqlBundle {
  const periods = preview.periods.filter((period) => period.importable);
  const matchedNameByPersonKey = new Map(
    preview.people
      .filter((person) => person.matchedName)
      .map((person) => [person.personKey, person.matchedName]),
  );
  const values = periods.map((period) => {
    if (period.personId === null) throw new Error(`Période importable sans personne SeaPilot : ${period.sourceKey}`);
    if (period.vesselName && period.sailorStatus === 'En Mer' && !period.watchGroup) {
      throw new Error(`Affectation en mer sans bordée : ${period.sourceKey}`);
    }
    const watchGroup = period.watchGroup;
    const columns = [
      'target_company_id',
      String(period.personId),
      period.vesselId === null ? 'null' : String(period.vesselId),
      sqlLiteral(matchedNameByPersonKey.get(period.personKey) || period.person),
      sqlNullableText(period.vesselName),
      sqlNullableText(watchGroup),
      sqlLiteral(period.category),
      sqlLiteral(period.sailorStatus),
      sqlLiteral(period.startsOn),
      sqlLiteral(period.endsOn),
      period.startsOn.slice(0, 4),
      sqlNullableText(period.comment),
      sqlLiteral(sourceFileName(preview.sourceFile)),
      sqlLiteral(`${preview.sourceLabel}:${period.sourceKey}`),
      sqlLiteral(preview.sourceLabel),
    ];
    return `      (${columns.join(', ')})`;
  });
  const valueSql = values.length ? values.join(',\n') : '      -- aucune période importable';
  const importStatement = periods.length
    ? `    insert into public.planning_periods (
      company_id, person_id, vessel_id, crew_name, vessel_name, watch_group,
      function_label, sailor_status, starts_on, ends_on, year_number, comments,
      slot365_source_id, slot365_source_key, source_label
    )
    values
${valueSql};`
    : '    raise exception \'BBTM_IMPORT_EMPTY: aucune période importable.\';';

  const applySql = `-- Préparé depuis ${sourceFileName(preview.sourceFile)}.
-- Périmètre : planning du personnel jusqu'au ${preview.cutoffDate} inclus.
-- Ce script est transactionnel : toute erreur annule la totalité de l'import.
begin;
set local lock_timeout = '10s';
select pg_advisory_xact_lock(hashtext(${sqlLiteral(preview.sourceLabel)}));

do $bbtm_import$
declare
  target_company_id bigint;
  inserted_count integer;
begin
  select id
    into target_company_id
    from public.companies
   where code = 'bbtm'
     and active = true;

  if target_company_id is null then
    raise exception 'BBTM_IMPORT_COMPANY_NOT_FOUND';
  end if;

  delete from public.planning_periods
   where company_id = target_company_id
     and source_label = ${sqlLiteral(preview.sourceLabel)};

${importStatement}

  get diagnostics inserted_count = row_count;
  if inserted_count <> ${periods.length} then
    raise exception 'BBTM_IMPORT_COUNT_MISMATCH: attendu %, inséré %', ${periods.length}, inserted_count;
  end if;
end
$bbtm_import$;

commit;
`;

  const rollbackSql = `-- Retour arrière limité au lot ${preview.sourceLabel}.
begin;
set local lock_timeout = '10s';
select pg_advisory_xact_lock(hashtext(${sqlLiteral(preview.sourceLabel)}));

delete from public.planning_periods
 where company_id = (select id from public.companies where code = 'bbtm')
   and source_label = ${sqlLiteral(preview.sourceLabel)};

commit;
`;

  return { applySql, rollbackSql, rowCount: periods.length };
}

export const bbtmImportRules = {
  vesselCodeMap: [...vesselCodeMap.entries()],
  excludedCodes: [...excludedCodes],
  cutoffInterpretation: 'Le 31 juin 2026 est interprété comme le 30 juin 2026.',
};
