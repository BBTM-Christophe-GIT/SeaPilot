import type { SupabaseClient } from '@supabase/supabase-js';

const DPR_ITEM_SELECT = [
  'id',
  'title',
  'project_id',
  'project_sharepoint_item_id',
  'project_code',
  'project_title',
  'vessel_id',
  'vessel_sharepoint_item_id',
  'vessel_name',
  'report_date',
  'report_time',
  'description',
  'fuel_consumption_l',
  'mgo_refueling_m3',
  'qhse_note',
  'radio_contact',
  'environment_incident_count',
  'person_accident_count',
  'dangerous_situation_count',
  'source_label',
].join(', ');

const DPR_ARCHIVE_SELECT = [
  'id',
  'dpr_item_id',
  'dpr_sharepoint_item_id',
  'project_id',
  'project_sharepoint_item_id',
  'project_code',
  'project_title',
  'report_date',
  'title',
  'source_label',
  'source_sharepoint_id',
  'file_url',
  'notes',
].join(', ');

const MGO_PRICE_SELECT = [
  'id',
  'price_date',
  'price_ht',
  'currency',
  'supplier_name',
  'title',
  'notes',
  'source_label',
].join(', ');

interface DprItemRow {
  id: number;
  title: string | null;
  project_id: number | null;
  project_sharepoint_item_id: string | null;
  project_code: string | null;
  project_title: string | null;
  vessel_id: number | null;
  vessel_sharepoint_item_id: string | null;
  vessel_name: string | null;
  report_date: string | null;
  report_time: string | null;
  description: string | null;
  fuel_consumption_l: number | string | null;
  mgo_refueling_m3: number | string | null;
  qhse_note: string | null;
  radio_contact: boolean | null;
  environment_incident_count: number | string | null;
  person_accident_count: number | string | null;
  dangerous_situation_count: number | string | null;
  source_label: string | null;
}

interface DprArchiveRow {
  id: number;
  dpr_item_id: number | null;
  dpr_sharepoint_item_id: string | null;
  project_id: number | null;
  project_sharepoint_item_id: string | null;
  project_code: string | null;
  project_title: string | null;
  report_date: string | null;
  title: string;
  source_label: string | null;
  source_sharepoint_id: string | null;
  file_url: string | null;
  notes: string | null;
}

interface MgoPriceRow {
  id: number;
  price_date: string | null;
  price_ht: number | string | null;
  currency: string | null;
  supplier_name: string | null;
  title: string | null;
  notes: string | null;
  source_label: string | null;
}

export interface DprItemRecord {
  id: number;
  title: string;
  projectId: number | null;
  projectSharePointItemId: string;
  projectCode: string;
  projectTitle: string;
  vesselId: number | null;
  vesselSharePointItemId: string;
  vesselName: string;
  reportDate: string;
  reportTime: string;
  description: string;
  fuelConsumptionL: number;
  mgoRefuelingM3: number;
  qhseNote: string;
  radioContact: boolean;
  environmentIncidentCount: number;
  personAccidentCount: number;
  dangerousSituationCount: number;
  sourceLabel: string;
}

export interface DprArchiveRecord {
  id: number;
  dprItemId: number | null;
  dprSharePointItemId: string;
  projectId: number | null;
  projectSharePointItemId: string;
  projectCode: string;
  projectTitle: string;
  reportDate: string;
  title: string;
  sourceLabel: string;
  sourceSharePointId: string;
  fileUrl: string;
  notes: string;
}

export interface MgoPriceRecord {
  id: number;
  priceDate: string;
  priceHt: number;
  currency: string;
  supplierName: string;
  title: string;
  notes: string;
  sourceLabel: string;
}

export interface DprData {
  reports: DprItemRecord[];
  archives: DprArchiveRecord[];
  mgoPrices: MgoPriceRecord[];
}

export interface DprMetrics {
  reportCount: number;
  archiveCount: number;
  fuelConsumptionL: number;
  mgoRefuelingM3: number;
  qhseEventCount: number;
}

export interface CreateDprItemInput {
  title: string;
  projectCode: string;
  projectTitle: string;
  vesselName: string;
  reportDate: string;
  reportTime: string;
  description: string;
  fuelConsumptionL: string;
  mgoRefuelingM3: string;
  qhseNote: string;
  radioContact: boolean;
}

function nullableText(value: string | number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.'));

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function optionalNumber(value: string): number | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed.replace(',', '.'));

  if (!Number.isFinite(parsed)) {
    throw new Error('La valeur numerique DPR est invalide.');
  }

  return parsed;
}

export function mapDprItemRows(rows: DprItemRow[]): DprItemRecord[] {
  return rows.map((row) => ({
    id: row.id,
    title: nullableText(row.title),
    projectId: row.project_id,
    projectSharePointItemId: nullableText(row.project_sharepoint_item_id),
    projectCode: nullableText(row.project_code),
    projectTitle: nullableText(row.project_title),
    vesselId: row.vessel_id,
    vesselSharePointItemId: nullableText(row.vessel_sharepoint_item_id),
    vesselName: nullableText(row.vessel_name),
    reportDate: nullableText(row.report_date),
    reportTime: nullableText(row.report_time),
    description: nullableText(row.description),
    fuelConsumptionL: normalizeNumber(row.fuel_consumption_l),
    mgoRefuelingM3: normalizeNumber(row.mgo_refueling_m3),
    qhseNote: nullableText(row.qhse_note),
    radioContact: Boolean(row.radio_contact),
    environmentIncidentCount: normalizeNumber(row.environment_incident_count),
    personAccidentCount: normalizeNumber(row.person_accident_count),
    dangerousSituationCount: normalizeNumber(row.dangerous_situation_count),
    sourceLabel: nullableText(row.source_label),
  }));
}

export function mapDprArchiveRows(rows: DprArchiveRow[]): DprArchiveRecord[] {
  return rows.map((row) => ({
    id: row.id,
    dprItemId: row.dpr_item_id,
    dprSharePointItemId: nullableText(row.dpr_sharepoint_item_id),
    projectId: row.project_id,
    projectSharePointItemId: nullableText(row.project_sharepoint_item_id),
    projectCode: nullableText(row.project_code),
    projectTitle: nullableText(row.project_title),
    reportDate: nullableText(row.report_date),
    title: row.title,
    sourceLabel: nullableText(row.source_label),
    sourceSharePointId: nullableText(row.source_sharepoint_id),
    fileUrl: nullableText(row.file_url),
    notes: nullableText(row.notes),
  }));
}

export function mapMgoPriceRows(rows: MgoPriceRow[]): MgoPriceRecord[] {
  return rows.map((row) => ({
    id: row.id,
    priceDate: nullableText(row.price_date),
    priceHt: normalizeNumber(row.price_ht),
    currency: nullableText(row.currency),
    supplierName: nullableText(row.supplier_name),
    title: nullableText(row.title),
    notes: nullableText(row.notes),
    sourceLabel: nullableText(row.source_label),
  }));
}

export function buildDprMetrics(reports: DprItemRecord[], archives: DprArchiveRecord[]): DprMetrics {
  return {
    archiveCount: archives.length,
    fuelConsumptionL: reports.reduce((total, report) => total + report.fuelConsumptionL, 0),
    mgoRefuelingM3: reports.reduce((total, report) => total + report.mgoRefuelingM3, 0),
    qhseEventCount: reports.reduce(
      (total, report) =>
        total + report.environmentIncidentCount + report.personAccidentCount + report.dangerousSituationCount,
      0,
    ),
    reportCount: reports.length,
  };
}

export async function fetchDprItems(client: SupabaseClient): Promise<DprItemRecord[]> {
  const { data, error } = await client
    .from('dpr_items')
    .select(DPR_ITEM_SELECT)
    .order('report_date', { ascending: false, nullsFirst: false })
    .order('report_time', { ascending: false, nullsFirst: false });

  if (error) {
    throw error;
  }

  return mapDprItemRows((data || []) as unknown as DprItemRow[]);
}

export async function fetchDprArchives(client: SupabaseClient): Promise<DprArchiveRecord[]> {
  const { data, error } = await client
    .from('dpr_archives')
    .select(DPR_ARCHIVE_SELECT)
    .order('report_date', { ascending: false, nullsFirst: false })
    .order('title', { ascending: true });

  if (error) {
    throw error;
  }

  return mapDprArchiveRows((data || []) as unknown as DprArchiveRow[]);
}

export async function fetchMgoPrices(client: SupabaseClient): Promise<MgoPriceRecord[]> {
  const { data, error } = await client
    .from('mgo_prices')
    .select(MGO_PRICE_SELECT)
    .order('price_date', { ascending: false, nullsFirst: false });

  if (error) {
    throw error;
  }

  return mapMgoPriceRows((data || []) as unknown as MgoPriceRow[]);
}

export async function fetchDprData(client: SupabaseClient): Promise<DprData> {
  const [reports, archives, mgoPrices] = await Promise.all([
    fetchDprItems(client),
    fetchDprArchives(client),
    fetchMgoPrices(client),
  ]);

  return { reports, archives, mgoPrices };
}

export async function createDprItem(client: SupabaseClient, input: CreateDprItemInput): Promise<DprItemRecord> {
  const title = input.title.trim() || `DPR ${input.reportDate || ''}`.trim();

  if (!title) {
    throw new Error('Le titre du DPR est obligatoire.');
  }

  const payload = {
    title,
    project_code: optionalText(input.projectCode),
    project_title: optionalText(input.projectTitle),
    vessel_name: optionalText(input.vesselName),
    report_date: optionalText(input.reportDate),
    report_time: optionalText(input.reportTime),
    description: optionalText(input.description),
    fuel_consumption_l: optionalNumber(input.fuelConsumptionL),
    mgo_refueling_m3: optionalNumber(input.mgoRefuelingM3),
    qhse_note: optionalText(input.qhseNote),
    radio_contact: input.radioContact,
    source_label: 'seapilot',
  };
  const { data, error } = await client.from('dpr_items').insert(payload).select(DPR_ITEM_SELECT).single();

  if (error) {
    throw error;
  }

  return mapDprItemRows([data as unknown as DprItemRow])[0];
}
