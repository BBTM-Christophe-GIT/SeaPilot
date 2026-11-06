import type { SupabaseClient } from '@supabase/supabase-js';
import { isSeaOperationConsumptionRecord, type SeaOperationConsumptionRecord } from './seaOperationConsumption';

export interface SeaOperationConsumptionExportEntry {
  operationId: string;
  record: SeaOperationConsumptionRecord;
}

// Matches the bounded batch accepted by the export RPC.
const EXPORT_BATCH_SIZE = 200;
const INVALID_EXPORT = 'Les relevés de consommation reçus pour l’export sont invalides.';

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
        || !expected.delete(row.operationId) || !('record' in row) || !isSeaOperationConsumptionRecord(row.record)) {
        throw new Error(INVALID_EXPORT);
      }
      entries.push({ operationId: row.operationId, record: row.record });
    }
  }

  return entries;
}
