import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { WorkingTimeImportWorkbook } from './workingTimeExcelImportModel';
import {
  commitWorkingTimeImport,
  createWorkingTimeImportBatchAndUpload,
  previewWorkingTimeImport,
} from './workingTimeImportQueries';

const workbook: WorkingTimeImportWorkbook = {
  sourceFileName: 'Alexandre ROUPSARD - 2026.xlsm', detectedPersonName: 'Alexandre ROUPSARD',
  detectedYear: 2026, gridYear: 2025, fileNameYear: 2026,
  warnings: ['année de grille différente'], macroPresent: true, macroExecution: 'disabled',
  parserVersion: 'seapilot-xlsm-v2', sheetNames: ['Janvier'], rows: [],
  detectedWorkSeconds: 7200, reportedWorkSeconds: 7200,
};

describe('working-time import queries', () => {
  it('creates a traceable private upload before any server preview', async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: '1/user/42/file.xlsm' }, error: null });
    const rpc = vi.fn().mockResolvedValue({ data: { batch_id: 42, storage_bucket: 'working-time-imports', storage_path: '1/user/42/file.xlsm' }, error: null });
    const client = { rpc, storage: { from: vi.fn(() => ({ upload })) } } as unknown as SupabaseClient;
    const file = new File(['xlsm'], workbook.sourceFileName);

    const result = await createWorkingTimeImportBatchAndUpload(client, file, 'a'.repeat(64));

    expect(result.batchId).toBe(42);
    expect(upload).toHaveBeenCalledWith('1/user/42/file.xlsm', file, expect.objectContaining({ upsert: false }));
  });

  it('sends detected and corrected disjoint phases and maps server conflict statuses', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {
      batch_id: 42, status: 'preview_ready',
      summary: { total_rows: 1, ready_rows: 0, duplicate_rows: 1, excluded_rows: 0, inconsistent_rows: 0, blocked_rows: 0, reported_work_seconds: 7200, effective_work_seconds: 0 },
      rows: [{ id: 7, local_work_date: '2026-01-01', effective_work_seconds: 7200, vessel_name: 'GOURY', watch_group: 'Bordée A', status: 'duplicate', issue_codes: ['existing_day'] }],
    }, error: null });
    const client = { rpc } as unknown as SupabaseClient;

    const result = await previewWorkingTimeImport(client, {
      batchId: 42, personId: 9, timezoneName: 'Europe/Paris', workbook,
      rows: [{
        date: '2026-01-01', sheet: 'Janvier', row: 5,
        detectedPhases: [{ startMinute: 480, endMinute: 600 }],
        phases: [{ startMinute: 480, endMinute: 540 }, { startMinute: 600, endMinute: 660 }],
        reportedWorkSeconds: 7200, captainName: 'Capitaine', vesselName: 'GOURY',
        imoNumber: '9213870', flagState: 'France', comment: '', userNote: 'Correction contrôlée', excluded: false,
      }],
    });

    expect(rpc).toHaveBeenCalledWith('preview_working_time_import', expect.objectContaining({
      p_workbook_metadata: expect.objectContaining({ macro_execution: 'disabled', grid_year: 2025 }),
      p_rows: [expect.objectContaining({ phases: [{ start_minute: 480, end_minute: 540 }, { start_minute: 600, end_minute: 660 }] })],
    }));
    expect(result.summary.duplicateRows).toBe(1);
    expect(result.rows[0]).toMatchObject({ status: 'duplicate', watchGroup: 'Bordée A' });
  });

  it('commits only through the authoritative RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { summary: { ready_rows: 3, effective_work_seconds: 86400 } }, error: null });
    const summary = await commitWorkingTimeImport({ rpc } as unknown as SupabaseClient, 42);
    expect(rpc).toHaveBeenCalledWith('commit_working_time_import', { p_batch_id: 42 });
    expect(summary.readyRows).toBe(3);
  });
});
