import type { SupabaseClient } from '@supabase/supabase-js';

export type QhseDocumentTable =
  | 'fleet_documents'
  | 'lifting_reports'
  | 'service_notes'
  | 'shared_documents'
  | 'safety_alerts'
  | 'technical_documents'
  | 'vessel_equipment_documents'
  | 'work_permits';

export interface QhseDocumentLibrary {
  key: QhseDocumentTable;
  label: string;
}

export const QHSE_DOCUMENT_LIBRARIES: QhseDocumentLibrary[] = [
  { key: 'work_permits', label: 'Permis de travail' },
  { key: 'safety_alerts', label: 'Alertes securite' },
  { key: 'service_notes', label: 'Notes de service' },
  { key: 'technical_documents', label: 'Documentation technique' },
  { key: 'vessel_equipment_documents', label: 'Fiches navire / equipement' },
  { key: 'lifting_reports', label: 'Rapports levage' },
  { key: 'fleet_documents', label: 'Documents flotte' },
  { key: 'shared_documents', label: 'Documents partages' },
];

const DOCUMENT_SELECT = [
  'id',
  'person_id',
  'person_sharepoint_item_id',
  'person_name',
  'vessel_id',
  'vessel_sharepoint_item_id',
  'vessel_name',
  'category_key',
  'document_date',
  'expires_on',
  'revision_label',
  'status',
  'title',
  'source_label',
  'source_sharepoint_id',
  'file_url',
  'notes',
].join(', ');

interface QhseDocumentRow {
  id: number;
  person_id: number | null;
  person_sharepoint_item_id: string | null;
  person_name: string | null;
  vessel_id: number | null;
  vessel_sharepoint_item_id: string | null;
  vessel_name: string | null;
  category_key: string | null;
  document_date: string | null;
  expires_on: string | null;
  revision_label: string | null;
  status: string | null;
  title: string;
  source_label: string | null;
  source_sharepoint_id: string | null;
  file_url: string | null;
  notes: string | null;
}

export interface QhseDocumentRecord {
  id: number;
  tableKey: QhseDocumentTable;
  libraryLabel: string;
  personId: number | null;
  personSharePointItemId: string;
  personName: string;
  vesselId: number | null;
  vesselSharePointItemId: string;
  vesselName: string;
  categoryKey: string;
  documentDate: string;
  expiresOn: string;
  revisionLabel: string;
  status: string;
  title: string;
  sourceLabel: string;
  sourceSharePointId: string;
  fileUrl: string;
  notes: string;
}

export interface QhseDocumentMetrics {
  documentCount: number;
  dueDocumentCount: number;
  openPermitCount: number;
  safetyAlertCount: number;
}

export interface CreateQhseDocumentInput {
  libraryKey: QhseDocumentTable;
  title: string;
  categoryKey: string;
  vesselName: string;
  personName: string;
  documentDate: string;
  expiresOn: string;
  revisionLabel: string;
  status: string;
  notes: string;
}

function nullableText(value: string | number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function libraryByKey(tableKey: QhseDocumentTable): QhseDocumentLibrary {
  return QHSE_DOCUMENT_LIBRARIES.find((library) => library.key === tableKey) || QHSE_DOCUMENT_LIBRARIES[0];
}

function isOpenPermit(document: QhseDocumentRecord): boolean {
  const status = normalizeLabel(document.status);

  return document.tableKey === 'work_permits' && !status.includes('clos') && !status.includes('annule');
}

export function mapQhseDocumentRows(
  rows: QhseDocumentRow[],
  library: QhseDocumentLibrary,
): QhseDocumentRecord[] {
  return rows.map((row) => ({
    categoryKey: nullableText(row.category_key),
    documentDate: nullableText(row.document_date),
    expiresOn: nullableText(row.expires_on),
    fileUrl: nullableText(row.file_url),
    id: row.id,
    libraryLabel: library.label,
    notes: nullableText(row.notes),
    personId: row.person_id,
    personName: nullableText(row.person_name),
    personSharePointItemId: nullableText(row.person_sharepoint_item_id),
    revisionLabel: nullableText(row.revision_label),
    sourceLabel: nullableText(row.source_label),
    sourceSharePointId: nullableText(row.source_sharepoint_id),
    status: nullableText(row.status),
    tableKey: library.key,
    title: row.title,
    vesselId: row.vessel_id,
    vesselName: nullableText(row.vessel_name),
    vesselSharePointItemId: nullableText(row.vessel_sharepoint_item_id),
  }));
}

export function buildQhseDocumentMetrics(documents: QhseDocumentRecord[]): QhseDocumentMetrics {
  return {
    documentCount: documents.length,
    dueDocumentCount: documents.filter((document) => Boolean(document.expiresOn)).length,
    openPermitCount: documents.filter(isOpenPermit).length,
    safetyAlertCount: documents.filter((document) => document.tableKey === 'safety_alerts').length,
  };
}

export async function fetchQhseDocuments(client: SupabaseClient): Promise<QhseDocumentRecord[]> {
  const documentGroups = await Promise.all(
    QHSE_DOCUMENT_LIBRARIES.map(async (library) => {
      const { data, error } = await client
        .from(library.key)
        .select(DOCUMENT_SELECT)
        .order('document_date', { ascending: false, nullsFirst: false })
        .order('title', { ascending: true });

      if (error) {
        throw error;
      }

      return mapQhseDocumentRows((data || []) as unknown as QhseDocumentRow[], library);
    }),
  );

  return documentGroups.flat();
}

export async function createQhseDocument(
  client: SupabaseClient,
  input: CreateQhseDocumentInput,
): Promise<QhseDocumentRecord> {
  const title = input.title.trim();

  if (!title) {
    throw new Error('Le titre du document est obligatoire.');
  }

  const library = libraryByKey(input.libraryKey);
  const payload = {
    category_key: optionalText(input.categoryKey),
    document_date: optionalText(input.documentDate),
    expires_on: optionalText(input.expiresOn),
    notes: optionalText(input.notes),
    person_name: optionalText(input.personName),
    revision_label: optionalText(input.revisionLabel),
    source_label: 'seapilot',
    status: optionalText(input.status),
    title,
    vessel_name: optionalText(input.vesselName),
  };
  const { data, error } = await client.from(library.key).insert(payload).select(DOCUMENT_SELECT).single();

  if (error) {
    throw error;
  }

  return mapQhseDocumentRows([data as unknown as QhseDocumentRow], library)[0];
}
