import type { SupabaseClient } from '@supabase/supabase-js';
import {
  WORKING_TIME_XLSM_MIME,
  type WorkingTimeImportPhase,
  type WorkingTimeImportWorkbook,
} from './workingTimeExcelImportModel';

export interface WorkingTimeImportPerson {
  id: number;
  name: string;
  functionLabel: string;
}

export interface WorkingTimeImportEditableRow {
  date: string;
  sheet: string;
  row: number;
  detectedPhases: WorkingTimeImportPhase[];
  phases: WorkingTimeImportPhase[];
  reportedWorkSeconds: number | null;
  captainName: string;
  vesselName: string;
  imoNumber: string;
  flagState: string;
  comment: string;
  userNote: string;
  excluded: boolean;
}

export type WorkingTimeImportRowStatus = 'ready' | 'corrected' | 'excluded' | 'duplicate' | 'inconsistent' | 'blocked_workflow' | 'blocked_validated' | 'imported';

export interface WorkingTimeImportServerRow {
  id: number;
  localWorkDate: string;
  effectiveWorkSeconds: number;
  vesselName: string;
  watchGroup: string;
  status: WorkingTimeImportRowStatus;
  issueCodes: string[];
}

export interface WorkingTimeImportSummary {
  totalRows: number;
  readyRows: number;
  excludedRows: number;
  duplicateRows: number;
  inconsistentRows: number;
  blockedRows: number;
  reportedWorkSeconds: number;
  effectiveWorkSeconds: number;
}

export interface WorkingTimeImportPreviewResult {
  batchId: number;
  status: string;
  summary: WorkingTimeImportSummary;
  rows: WorkingTimeImportServerRow[];
}

interface UploadContext {
  batchId: number;
  storageBucket: string;
  storagePath: string;
}

function assertResult(error: { message?: string } | null, fallback: string): void {
  if (error) throw new Error(error.message || fallback);
}

function asNumber(value: unknown): number {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function mapSummary(value: Record<string, unknown> = {}): WorkingTimeImportSummary {
  return {
    totalRows: asNumber(value.total_rows),
    readyRows: asNumber(value.ready_rows),
    excludedRows: asNumber(value.excluded_rows),
    duplicateRows: asNumber(value.duplicate_rows),
    inconsistentRows: asNumber(value.inconsistent_rows),
    blockedRows: asNumber(value.blocked_rows),
    reportedWorkSeconds: asNumber(value.reported_work_seconds),
    effectiveWorkSeconds: asNumber(value.effective_work_seconds),
  };
}

export async function fetchWorkingTimeImportPeople(client: SupabaseClient): Promise<WorkingTimeImportPerson[]> {
  const { data, error } = await client.from('people').select('id,first_name,last_name,function_label').eq('active', true).order('last_name');
  assertResult(error, 'Impossible de charger les personnes actives.');
  return ((data || []) as Array<Record<string, unknown>>).map((person) => ({
    id: Number(person.id),
    name: `${String(person.first_name || '')} ${String(person.last_name || '')}`.trim(),
    functionLabel: String(person.function_label || ''),
  }));
}

export async function sha256WorkingTimeImportFile(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createWorkingTimeImportBatchAndUpload(
  client: SupabaseClient,
  file: File,
  sha256: string,
): Promise<UploadContext> {
  const { data, error } = await client.rpc('working_time_import_upload_context', {
    p_file_name: file.name,
    p_mime_type: WORKING_TIME_XLSM_MIME,
    p_file_size_bytes: file.size,
    p_sha256: sha256,
  });
  assertResult(error, 'Impossible de préparer le dépôt du classeur.');
  const value = (data || {}) as Record<string, unknown>;
  const context = {
    batchId: Number(value.batch_id),
    storageBucket: String(value.storage_bucket || ''),
    storagePath: String(value.storage_path || ''),
  };
  const upload = await client.storage.from(context.storageBucket).upload(context.storagePath, file, {
    contentType: WORKING_TIME_XLSM_MIME,
    upsert: false,
  });
  assertResult(upload.error, 'Impossible de déposer le classeur dans l’espace privé.');
  return context;
}

export async function previewWorkingTimeImport(
  client: SupabaseClient,
  input: {
    batchId: number;
    personId: number;
    timezoneName: string;
    workbook: WorkingTimeImportWorkbook;
    rows: WorkingTimeImportEditableRow[];
  },
): Promise<WorkingTimeImportPreviewResult> {
  const { data, error } = await client.rpc('preview_working_time_import', {
    p_batch_id: input.batchId,
    p_person_id: input.personId,
    p_source_year: input.workbook.detectedYear,
    p_timezone_name: input.timezoneName,
    p_detected_person_name: input.workbook.detectedPersonName,
    p_parser_version: input.workbook.parserVersion,
    p_workbook_metadata: {
      macro_present: input.workbook.macroPresent,
      macro_execution: input.workbook.macroExecution,
      sheet_names: input.workbook.sheetNames,
      detected_work_seconds: input.workbook.detectedWorkSeconds,
      reported_work_seconds: input.workbook.reportedWorkSeconds,
      grid_year: input.workbook.gridYear,
      file_name_year: input.workbook.fileNameYear,
      warnings: input.workbook.warnings,
    },
    p_rows: input.rows.map((row) => ({
      date: row.date,
      sheet: row.sheet,
      row: row.row,
      detected_phases: row.detectedPhases.map((phase) => ({ start_minute: phase.startMinute, end_minute: phase.endMinute })),
      phases: row.phases.map((phase) => ({ start_minute: phase.startMinute, end_minute: phase.endMinute })),
      reported_work_seconds: row.reportedWorkSeconds,
      captain_name: row.captainName,
      vessel_name: row.vesselName,
      imo_number: row.imoNumber,
      flag_state: row.flagState,
      comment: row.comment,
      user_note: row.userNote,
      excluded: row.excluded,
    })),
  });
  assertResult(error, 'Impossible de contrôler l’import.');
  const value = (data || {}) as Record<string, unknown>;
  return {
    batchId: Number(value.batch_id),
    status: String(value.status || ''),
    summary: mapSummary((value.summary || {}) as Record<string, unknown>),
    rows: ((value.rows || []) as Array<Record<string, unknown>>).map((row) => ({
      id: Number(row.id),
      localWorkDate: String(row.local_work_date || ''),
      effectiveWorkSeconds: asNumber(row.effective_work_seconds),
      vesselName: String(row.vessel_name || ''),
      watchGroup: String(row.watch_group || ''),
      status: String(row.status || 'inconsistent') as WorkingTimeImportRowStatus,
      issueCodes: Array.isArray(row.issue_codes) ? row.issue_codes.map(String) : [],
    })),
  };
}

export async function commitWorkingTimeImport(client: SupabaseClient, batchId: number): Promise<WorkingTimeImportSummary> {
  const { data, error } = await client.rpc('commit_working_time_import', { p_batch_id: batchId });
  assertResult(error, 'Impossible de valider l’import.');
  return mapSummary((((data || {}) as Record<string, unknown>).summary || {}) as Record<string, unknown>);
}
