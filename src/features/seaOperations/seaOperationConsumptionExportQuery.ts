import type { SupabaseClient } from '@supabase/supabase-js';
import { isSeaOperationConsumptionRecordFields, type SeaOperationConsumptionRecord } from './seaOperationConsumption';
import { isSeaOperationConsumptionTraceSummary, type SeaOperationConsumptionTraceSummary } from './seaOperationConsumptionTrace';

export type SeaOperationConsumptionExportRecord = Omit<SeaOperationConsumptionRecord, 'trace'> & {
  trace?: SeaOperationConsumptionTraceSummary | null;
};

export interface SeaOperationConsumptionExportEntry {
  operationId: string;
  record: SeaOperationConsumptionExportRecord;
}

export interface SeaOperationConsumptionHistoryRow {
  sourceRow: number;
  cells: (string | number | boolean | null)[];
}

export interface SeaOperationConsumptionHistory {
  rozel: SeaOperationConsumptionHistoryRow[];
  suroit: SeaOperationConsumptionHistoryRow[];
  rozelGauge: SeaOperationConsumptionHistoryRow[];
}

// Matches the bounded batch accepted by the export RPC.
const EXPORT_BATCH_SIZE = 200;
const INVALID_EXPORT = 'Les relevés de consommation reçus pour l’export sont invalides.';
const INVALID_HISTORY = 'Les relevés de consommation historiques reçus pour l’export sont invalides.';

function isExportRecord(value: unknown): value is SeaOperationConsumptionExportRecord {
  if (!isSeaOperationConsumptionRecordFields(value)) return false;
  const trace = 'trace' in value ? value.trace : undefined;
  return trace == null || isSeaOperationConsumptionTraceSummary(trace);
}

function isHistoryRows(value: unknown, width: number): value is SeaOperationConsumptionHistoryRow[] {
  if (!Array.isArray(value)) return false;
  const seen = new Set<number>();
  return (value as unknown[]).every(row => {
    if (!row || typeof row !== 'object' || !('sourceRow' in row) || typeof row.sourceRow !== 'number'
      || !Number.isInteger(row.sourceRow) || row.sourceRow < 1 || seen.has(row.sourceRow)
      || !('cells' in row) || !Array.isArray(row.cells) || row.cells.length !== width
      || !(row.cells as unknown[]).every(cell => cell === null || typeof cell === 'string' || typeof cell === 'boolean'
        || (typeof cell === 'number' && Number.isFinite(cell)))) return false;
    seen.add(row.sourceRow);
    return true;
  });
}

export async function fetchSeaOperationConsumptionHistory(client: SupabaseClient): Promise<SeaOperationConsumptionHistory> {
  const { data, error } = await client.rpc('sea_operation_consumption_history');
  if (error) throw error;
  const history: unknown = data;
  if (!history || typeof history !== 'object' || !('rozel' in history) || !isHistoryRows(history.rozel, 18)
    || !('suroit' in history) || !isHistoryRows(history.suroit, 23)
    || !('rozelGauge' in history) || !isHistoryRows(history.rozelGauge, 2)) throw new Error(INVALID_HISTORY);
  return { rozel: history.rozel, suroit: history.suroit, rozelGauge: history.rozelGauge };
}

export async function fetchSeaOperationConsumptionExport(client: SupabaseClient,
  operationIds: readonly string[]): Promise<SeaOperationConsumptionExportEntry[]> {
  const ids = [...new Set(operationIds)];
  const entries: SeaOperationConsumptionExportEntry[] = [];

  for (let index = 0; index < ids.length; index += EXPORT_BATCH_SIZE) {
    const batch = ids.slice(index, index + EXPORT_BATCH_SIZE);
    const { data, error } = await client.rpc('sea_operation_consumption_export', { p_ids: batch });
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error(INVALID_EXPORT);

    const expected = new Set(batch);
    for (const row of data as unknown[]) {
      if (!row || typeof row !== 'object' || !('operationId' in row) || typeof row.operationId !== 'string'
        || !expected.delete(row.operationId) || !('record' in row) || !isExportRecord(row.record)) {
        throw new Error(INVALID_EXPORT);
      }
      entries.push({ operationId: row.operationId, record: row.record });
    }
  }

  return entries;
}
