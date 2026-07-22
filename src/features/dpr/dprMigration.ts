import { createHash } from 'node:crypto';
import type { SharePointExportBundle, SharePointListItem } from '../sharepoint/sharePointImport.ts';

export const DPR_SOURCE_KEY = 'list-indicateurs-projet-p144emdt';
export const DPR_LIBRARY_SOURCE_KEY = 'library-dpr';
export const DPR_SITE_ID = 'bbtm668.sharepoint.com,sites,QHSE';
export const DPR_SITE_URL = 'https://bbtm668.sharepoint.com/sites/QHSE';
export const DPR_LIST_ID = '3c26ee87-5f55-4018-a93e-634080cfc55e';
export const DPR_LIBRARY_ID = 'f6efc4dd-751b-423d-9ead-2ea1d0458e7d';
export const DPR_DRIVE_ID = 'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PdxO_2G3U9Qp6tLqHQRY59';

type UnknownRecord = Record<string, unknown>;

export interface DprMigrationReport {
  sourceItemId: string;
  sourceUniqueId: string | null;
  dprNumber: number | null;
  reportDate: string;
  projectSharePointItemId: string | null;
  projectTitle: string | null;
  unlistedProjectName: string | null;
  vesselSharePointItemId: string | null;
  vesselName: string | null;
  issuerSharePointItemId: string | null;
  issuerName: string;
  description: string | null;
  qhseNote: string | null;
  sourceModifiedAt: string | null;
  fuelConsumedLiters: number | null;
  fuelOnBoardLiters: number | null;
  crewPersonSharePointItemIds: string[];
  crewPersonNames: string[];
  crewPersonFunctions: string[];
  otherPeopleNames: string[];
  incidents: Array<{ category: 'person' | 'equipment' | 'environment'; level: 'T0' | 'T1' | 'T2' }>;
  hseActions: {
    tbtPerformed: boolean;
    tbtTheme: string | null;
    hseVisitPerformed: boolean;
    hseAuditPerformed: boolean;
    goodPracticesCount: number;
    dangerousSituationsCount: number;
    stopWorkCount: number;
  };
  emergencyExercises: Array<{ key: string; label: string }>;
  portCall: {
    arrivalAt: string | null;
    departureAt: string | null;
    reasons: Array<'crew-change' | 'weather-standby' | 'breakdown' | 'standby'>;
  } | null;
  supplies: { fuelM3: number | null; oilLiters: number | null; waterM3: number | null };
  wasteRecords: Array<{ key: 'black-bin' | 'recyclable' | 'bilge-water-oil' | 'wastewater'; quantity: number; unit: 'kg' | 'l' }>;
  raw: UnknownRecord;
}

export type DprMigrationFileKind = 'pdf' | 'photo' | 'attachment';

export interface DprMigrationFile {
  sourceItemId: string;
  sourceUniqueId: string | null;
  dprSharePointItemId: string | null;
  dprNumber: number | null;
  fileName: string;
  serverRelativeUrl: string;
  browserUrl: string;
  mimeType: string;
  sizeBytes: number | null;
  kind: DprMigrationFileKind | 'excluded';
  exclusionReason: string | null;
  sourceModifiedAt: string | null;
  raw: UnknownRecord;
}

export interface DprMigrationManifest {
  schemaVersion: '1.0';
  sourceExportedAt: string | null;
  createdAt: string;
  source: {
    siteId: string;
    siteUrl: string;
    dprListId: string;
    dprLibraryId: string;
    dprDriveId: string;
  };
  reports: DprMigrationReport[];
  files: DprMigrationFile[];
  fieldInventory: Record<string, number>;
  counters: {
    reports: number;
    filesDiscovered: number;
    pdfs: number;
    photos: number;
    attachments: number;
    excludedHtml: number;
    excludedOther: number;
    reportsWithoutPdf: number;
    duplicateReportSourceIds: string[];
    duplicateFileSourceIds: string[];
  };
}

function fields(item: SharePointListItem): UnknownRecord {
  return (item.fields || {}) as UnknownRecord;
}

function unwrap(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as UnknownRecord;
    return record.LookupValue ?? record.lookupValue ?? record.Title ?? record.title ?? record.DisplayName ?? record.displayName ?? record.Email ?? record.email ?? value;
  }
  return value;
}

function stringify(value: unknown): string | null {
  const unwrapped = unwrap(value);
  if (unwrapped === null || unwrapped === undefined) return null;
  if (Array.isArray(unwrapped)) {
    const values = unwrapped.map((entry) => stringify(entry)).filter((entry): entry is string => Boolean(entry));
    return values.length ? values.join('; ') : null;
  }
  if (typeof unwrapped === 'string') return unwrapped.trim() || null;
  if (typeof unwrapped === 'number' || typeof unwrapped === 'boolean' || typeof unwrapped === 'bigint') return String(unwrapped);
  return null;
}

function lookupId(value: unknown): string | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as UnknownRecord;
    return stringify(record.LookupId ?? record.lookupId ?? record.Id ?? record.id);
  }
  return null;
}

function first(item: SharePointListItem, names: string[]): unknown {
  const record = fields(item);
  for (const name of names) {
    if (record[name] !== undefined && record[name] !== null && record[name] !== '') return record[name];
  }
  return undefined;
}

function text(item: SharePointListItem, names: string[]): string | null {
  return stringify(first(item, names));
}

function referenceId(item: SharePointListItem, idNames: string[], valueNames: string[]): string | null {
  return text(item, idNames) || lookupId(first(item, valueNames));
}

function numeric(item: SharePointListItem, names: string[]): number | null {
  const value = text(item, names);
  if (!value) return null;
  const normalized = value.replace(/\s/g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanValue(item: SharePointListItem, names: string[]): boolean {
  const value = first(item, names);
  if (typeof value === 'boolean') return value;
  const normalized = stringify(value)?.toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'oui';
}

function nonnegativeInteger(item: SharePointListItem, names: string[]): number {
  return Math.max(0, Math.round(numeric(item, names) || 0));
}

function stringValues(item: SharePointListItem, names: string[]): string[] {
  const value = first(item, names);
  const candidates = Array.isArray(value) ? value : value === null || value === undefined || value === '' ? [] : [value];
  return candidates.map((entry) => stringify(entry)).filter((entry): entry is string => Boolean(entry));
}

function incidentLevel(item: SharePointListItem, names: string[]): 'T0' | 'T1' | 'T2' {
  const value = text(item, names)?.toUpperCase() || '';
  if (value.startsWith('T2')) return 'T2';
  if (value.startsWith('T1')) return 'T1';
  return 'T0';
}

function normalizeLabel(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function exerciseType(label: string): { key: string; label: string } {
  const normalized = normalizeLabel(label);
  const canonical: Array<[RegExp, string, string]> = [
    [/protection.*incendie/, 'fire-protection', "Protection contre l'incendie"],
    [/evacuation.*abandon.*navire/, 'abandon-ship', 'Évacuation et abandon du navire'],
    [/evacuation a bord/, 'onboard-evacuation', 'Évacuation à bord'],
    [/(sauvetage en mer|homme a la mer)/, 'sea-rescue', 'Sauvetage en mer'],
    [/perte de propulsion/, 'loss-of-propulsion', 'Perte de propulsion – manœuvrabilité'],
    [/perte d energie/, 'loss-of-power', "Perte d'énergie"],
    [/prise en charge.*blesse/, 'injured-person', "Évacuation et prise en charge d'un blessé"],
    [/lutte contre l envahissement/, 'flooding-control', "Lutte contre l'envahissement"],
  ];
  const match = canonical.find(([pattern]) => pattern.test(normalized));
  if (match) return { key: match[1], label: match[2] };
  return { key: `historical-${sha256(normalized).slice(0, 12)}`, label: label.trim() };
}

function portCallReasons(item: SharePointListItem): Array<'crew-change' | 'weather-standby' | 'breakdown' | 'standby'> {
  const operation = normalizeLabel(text(item, ['P144_x002d_FAC_x002d_Operations']) || '');
  const comments = normalizeLabel(text(item, ['P144_x002d_FAC_x002d_Commentaire']) || '');
  const result: Array<'crew-change' | 'weather-standby' | 'breakdown' | 'standby'> = [];
  if (operation.includes('crew change')) result.push('crew-change');
  if (operation.includes('weather') || operation.includes('meteo')) result.push('weather-standby');
  if (operation.includes('avarie') || comments.includes('avarie')) result.push('breakdown');
  if (operation.includes('stand by') || operation.includes('standby')) result.push('standby');
  return result;
}

function dateOnly(item: SharePointListItem, names: string[]): string | null {
  const value = text(item, names);
  if (!value) return null;
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const frenchMatch = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (frenchMatch) return `${frenchMatch[3]}-${frenchMatch[2].padStart(2, '0')}-${frenchMatch[1].padStart(2, '0')}`;
  return null;
}

function itemId(item: SharePointListItem): string {
  return stringify(item.id) || text(item, ['ID', 'Id', 'id']) || '';
}

function uniqueId(item: SharePointListItem): string | null {
  return text(item, ['UniqueId', 'UniqueID', 'GUID', 'Guid']);
}

function parseDprNumber(...values: Array<string | null | undefined>): number | null {
  for (const value of values) {
    const match = value?.match(/\bDPR[\s_-]*(\d+)\b/i);
    if (match) return Number(match[1]);
  }
  return null;
}

function absoluteSharePointUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return new URL(pathOrUrl, DPR_SITE_URL).toString();
}

function inferFile(item: SharePointListItem): DprMigrationFile {
  const record = fields(item);
  const sourceItemId = itemId(item);
  const fileName = text(item, ['FileLeafRef', 'Name', 'Title']) || `sharepoint-${sourceItemId}`;
  const serverRelativeUrl = text(item, ['FileRef', 'ServerRelativeUrl']) || new URL(item.webUrl || absoluteSharePointUrl(fileName)).pathname;
  const browserUrl = text(item, ['EncodedAbsUrl', 'FileUrl']) || item.webUrl || absoluteSharePointUrl(serverRelativeUrl);
  const extension = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() || '' : '';
  const inferredMimeTypes: Record<string, string> = {
    pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic',
  };
  const mimeType = text(item, ['File_x0020_MimeType', 'MimeType']) || inferredMimeTypes[extension] || 'application/octet-stream';
  let kind: DprMigrationFile['kind'] = 'attachment';
  let exclusionReason: string | null = null;
  if (extension === 'html' || extension === 'htm') {
    kind = 'excluded';
    exclusionReason = 'temporary-html';
  } else if (extension === 'pdf') {
    kind = 'pdf';
  } else if (['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(extension)) {
    kind = 'photo';
  }
  return {
    sourceItemId,
    sourceUniqueId: uniqueId(item),
    dprSharePointItemId: referenceId(item, ['DPRId', 'DPRLookupId', 'DPR_x002d_ID'], ['DPR', 'DPRLookup']),
    dprNumber: parseDprNumber(fileName, text(item, ['Title'])),
    fileName,
    serverRelativeUrl,
    browserUrl,
    mimeType,
    sizeBytes: numeric(item, ['File_x0020_Size', 'FileSizeDisplay', 'Size']),
    kind,
    exclusionReason,
    sourceModifiedAt: text(item, ['Modified', 'LastModifiedDateTime']),
    raw: record,
  };
}

function inferReport(item: SharePointListItem): DprMigrationReport {
  const sourceItemId = itemId(item);
  const title = text(item, ['Title']);
  const reportDate = dateOnly(item, ['DPR_x002d_Date', 'DateduDPR', 'DateduDR', 'EXT_x002d_DateDR', 'DateDPR', 'Date']);
  if (!sourceItemId) throw new Error('A DPR source item has no SharePoint item id.');
  if (!reportDate) throw new Error(`DPR SharePoint ${sourceItemId} has no valid report date.`);
  const arrivalAt = text(item, ['Heure_x002d_NavireAccost_x00e9_a']);
  const departureAt = text(item, ['Heure_x002d_AppareillageduPort']);
  const sourceTbtTheme = text(item, ['DPR_x002d_LEMS_x002d_Th_x00e8_me']);
  const tbtPerformed = booleanValue(item, ['DPR_x002d_LEMS_x002d_TBT']) || Boolean(sourceTbtTheme);
  const tbtTheme = sourceTbtTheme || (tbtPerformed ? 'Non renseigné dans SharePoint' : null);
  const wasteCandidates: DprMigrationReport['wasteRecords'] = [];
  const appendWaste = (key: DprMigrationReport['wasteRecords'][number]['key'], quantity: number | null, unit: 'kg' | 'l') => {
    if (quantity !== null) wasteCandidates.push({ key, quantity, unit });
  };
  appendWaste('black-bin', numeric(item, ['DPR_x002d_Poubellenoire_x0028_en']), 'kg');
  appendWaste('recyclable', numeric(item, ['DPR_x002d_D_x00e9_chetsrecyclabl']), 'kg');
  appendWaste('bilge-water-oil', numeric(item, ['DPR_x002d_D_x00e9_barquementEaud']), 'l');
  appendWaste('wastewater', numeric(item, ['D_x00e9_barquementEauxUs_x00e9_e']), 'l');
  return {
    sourceItemId,
    sourceUniqueId: uniqueId(item),
    dprNumber: parseDprNumber(title, text(item, ['DPR_x002d_Numero', 'NumeroDPR', 'DPRNumber'])) || Number(sourceItemId),
    reportDate,
    projectSharePointItemId: referenceId(
      item,
      ['DPR_x002d_ProjetId', 'DPR_x002d_Projet0Id', 'ProjetId', 'ProjectId'],
      ['DPR_x002d_Projet', 'DPR_x002d_Projet0', 'Projet', 'Project'],
    ),
    projectTitle: text(item, ['DPR_x002d_Projet', 'DPR_x002d_Projet0', 'Projet', 'Project']),
    unlistedProjectName: text(item, ['Projetnonr_x00e9_f_x00e9_renc_x0']),
    vesselSharePointItemId: referenceId(item, ['DPR_x002d_NavireId', 'NavireId', 'VesselId'], ['DPR_x002d_Navire', 'Navire', 'Vessel']),
    vesselName: text(item, ['DPR_x002d_Navire', 'Navire', 'NomNavire', 'VesselName']),
    issuerSharePointItemId: referenceId(item, ['EmetteurId', 'DPR_x002d_EmetteurId'], ['Emetteur', 'DPR_x002d_Emetteur']),
    issuerName: text(item, ['DPR_x002d_Emetteur', 'Emetteur', 'Author', 'Editor']) || 'Import SharePoint',
    description: text(item, ['DPR_x002d_DescriptionJourn_x00e9', 'DPR_x002d_DescriptionJournee', 'DescriptiondelaJourn_x00e9_e', 'Description']),
    qhseNote: text(item, ['DPR_x002d_NoteQHSE', 'NoteQHSE']),
    sourceModifiedAt: text(item, ['Modified']),
    fuelConsumedLiters: numeric(item, ['DPR_x002d_ConsommationdeCarburan', 'ConsommationCarburant']),
    fuelOnBoardLiters: numeric(item, ['Quantit_x00e9_deFuelembarqu_x00e', 'DPR_x002d_Quantit_x00e9_totalede', 'FuelOnBoard', 'QuantiteFuelBord']),
    crewPersonSharePointItemIds: stringValues(item, ['Bord_x00e9_eId']),
    crewPersonNames: stringValues(item, ['BordeeResolvedNames']),
    crewPersonFunctions: stringValues(item, ['BordeeResolvedFunctions']),
    otherPeopleNames: stringValues(item, ['AutresPersonnes']),
    incidents: [
      { category: 'person', level: incidentLevel(item, ['DPR_x002d_Accidents']) },
      { category: 'equipment', level: incidentLevel(item, ['DPR_x002d_Incidentsurmat_x00e9_r']) },
      { category: 'environment', level: incidentLevel(item, ['DPR_x002d_Incident_x002f_Acciden']) },
    ],
    hseActions: {
      tbtPerformed,
      tbtTheme,
      hseVisitPerformed: booleanValue(item, ['DPR_x002d_LEMS_x002d_NombredAudi']),
      hseAuditPerformed: booleanValue(item, ['DPR_x002d_LEMS_x002d_NombredAudi0']),
      goodPracticesCount: nonnegativeInteger(item, ['DPR_x002d_LEMS_x002d_NombredeBon']),
      dangerousSituationsCount: nonnegativeInteger(item, ['DPR_x002d_LEMS_x002d_NbdeSituati']),
      stopWorkCount: nonnegativeInteger(item, ['DPR_x002d_LEMS_x002d_NombredeSto']),
    },
    emergencyExercises: stringValues(item, ['DPR_x002d_ExercicesdUrgence']).map(exerciseType),
    portCall: arrivalAt || departureAt ? { arrivalAt, departureAt, reasons: portCallReasons(item) } : null,
    supplies: {
      fuelM3: numeric(item, ['DPR_x002d_AvitaillementMGO_x0028']),
      oilLiters: numeric(item, ['DPR_x002d_AvitaillementHuile_x00']),
      waterM3: numeric(item, ['Approvisionnementeneau_x0028_m3_']),
    },
    wasteRecords: wasteCandidates,
    raw: fields(item),
  };
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as UnknownRecord).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, stable(entry)]));
  }
  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(stable(value));
}

export function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export function manifestSha256(manifest: DprMigrationManifest): string {
  const copy = { ...manifest, createdAt: '' };
  return sha256(stableJson(copy));
}

export function buildDprMigrationManifest(bundle: SharePointExportBundle, now = new Date()): DprMigrationManifest {
  const reportSource = bundle.sources.find((source) => source.sourceKey === DPR_SOURCE_KEY);
  const fileSource = bundle.sources.find((source) => source.sourceKey === DPR_LIBRARY_SOURCE_KEY);
  if (!reportSource) throw new Error(`Missing SharePoint source ${DPR_SOURCE_KEY}.`);
  if (!fileSource) throw new Error(`Missing SharePoint source ${DPR_LIBRARY_SOURCE_KEY}.`);

  const reports = reportSource.items.map(inferReport).sort((a, b) => Number(a.sourceItemId) - Number(b.sourceItemId));
  const files = fileSource.items
    .filter((item) => {
      const objectType = text(item, ['FSObjType', 'FileSystemObjectType']);
      return objectType !== '1' && objectType !== 'Folder';
    })
    .map(inferFile)
    .sort((a, b) => a.serverRelativeUrl.localeCompare(b.serverRelativeUrl));
  const pdfReportIds = new Set(files.filter((file) => file.kind === 'pdf').map((file) => file.dprSharePointItemId).filter(Boolean));
  const pdfNumbers = new Set(files.filter((file) => file.kind === 'pdf').map((file) => file.dprNumber).filter((value): value is number => value !== null));
  const fieldInventory: Record<string, number> = {};
  for (const item of [...reportSource.items, ...fileSource.items]) {
    for (const key of Object.keys(fields(item))) fieldInventory[key] = (fieldInventory[key] || 0) + 1;
  }

  return {
    schemaVersion: '1.0',
    sourceExportedAt: bundle.exportedAt || null,
    createdAt: now.toISOString(),
    source: { siteId: DPR_SITE_ID, siteUrl: DPR_SITE_URL, dprListId: DPR_LIST_ID, dprLibraryId: DPR_LIBRARY_ID, dprDriveId: DPR_DRIVE_ID },
    reports,
    files,
    fieldInventory: Object.fromEntries(Object.entries(fieldInventory).sort(([a], [b]) => a.localeCompare(b))),
    counters: {
      reports: reports.length,
      filesDiscovered: files.length,
      pdfs: files.filter((file) => file.kind === 'pdf').length,
      photos: files.filter((file) => file.kind === 'photo').length,
      attachments: files.filter((file) => file.kind === 'attachment').length,
      excludedHtml: files.filter((file) => file.exclusionReason === 'temporary-html').length,
      excludedOther: files.filter((file) => file.kind === 'excluded' && file.exclusionReason !== 'temporary-html').length,
      reportsWithoutPdf: reports.filter((report) => !pdfReportIds.has(report.sourceItemId) && (report.dprNumber === null || !pdfNumbers.has(report.dprNumber))).length,
      duplicateReportSourceIds: duplicates(reports.map((report) => report.sourceItemId)),
      duplicateFileSourceIds: duplicates(files.map((file) => file.sourceItemId)),
    },
  };
}

export function validateDprManifest(manifest: DprMigrationManifest, expected = { reports: 981, pdfs: 325, html: 15, attachments: 10 }): string[] {
  const errors: string[] = [];
  if (manifest.counters.reports !== expected.reports) errors.push(`Expected ${expected.reports} DPR reports, got ${manifest.counters.reports}.`);
  if (manifest.counters.pdfs !== expected.pdfs) errors.push(`Expected ${expected.pdfs} PDF files, got ${manifest.counters.pdfs}.`);
  if (manifest.counters.excludedHtml !== expected.html) errors.push(`Expected ${expected.html} excluded HTML files, got ${manifest.counters.excludedHtml}.`);
  const nonPdfFiles = manifest.counters.photos + manifest.counters.attachments;
  if (nonPdfFiles !== expected.attachments) errors.push(`Expected ${expected.attachments} non-PDF files, got ${nonPdfFiles}.`);
  if (manifest.counters.duplicateReportSourceIds.length) errors.push(`Duplicate DPR source ids: ${manifest.counters.duplicateReportSourceIds.join(', ')}.`);
  if (manifest.counters.duplicateFileSourceIds.length) errors.push(`Duplicate file source ids: ${manifest.counters.duplicateFileSourceIds.join(', ')}.`);
  return errors;
}

export function storageObjectPath(companyId: number, dprId: number, file: Pick<DprMigrationFile, 'sourceItemId' | 'fileName'>): string {
  const safeName = file.fileName.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'file';
  return `company/${companyId}/dpr/${dprId}/${file.sourceItemId}-${safeName}`;
}
