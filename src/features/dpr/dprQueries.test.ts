import { describe, expect, it, vi } from 'vitest';
import { EMPTY_DPR_PAYLOAD } from './dprFormModel.ts';
import { fetchDprDashboard, fetchDprEntryContext, runDprTransition, saveDprPayload, uploadDprFile } from './dprQueries.ts';

function queryResult(data: unknown) {
  const result = { data, error: null };
  const query: Record<string, unknown> = {
    then: (resolve: (value: typeof result) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
  };
  ['eq', 'in', 'is', 'limit', 'order', 'select'].forEach((method) => {
    query[method] = vi.fn(() => query);
  });
  query.maybeSingle = vi.fn().mockResolvedValue(result);
  return query;
}

describe('DPR Supabase commands', () => {
  it('maps the narrow Planning project snapshot returned to field profiles', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({
      data: {
        issuerPersonId: 28,
        issuerName: 'Gary LEFEVRE',
        vesselId: 3,
        projectId: 60,
        project: { id: 60, code: 'P268', title: 'ETPO FORT BOYARD' },
        watchGroup: 'Bordée 1',
        people: [],
        crewPersonIds: [],
      },
      error: null,
    });

    const context = await fetchDprEntryContext({ rpc } as never, '2026-08-14');

    expect(context.projectId).toBe(60);
    expect(context.project).toEqual({ id: 60, code: 'P268', title: 'ETPO FORT BOYARD' });
  });

  it('does not load DPR history for a Marin dashboard', async () => {
    const reports = queryResult([]);
    const profiles = queryResult({ display_name: 'Arthur RICHER' });
    const people = queryResult({ id: 18, first_name: 'Arthur', last_name: 'Richer', function_label: '2nd Capitaine', grade_label: 'Officier' });
    const empty = queryResult([]);
    const from = vi.fn((table: string) => ({
      select: vi.fn(() => table === 'dpr_reports' ? reports : table === 'profiles' ? profiles : table === 'people' ? people : empty),
    }));
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { issuerPersonId: 18, issuerName: 'Arthur RICHER', people: [] }, error: null });
    const client = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'sailor-user', email: 'arthur@example.invalid' } } }) },
      from,
      rpc,
    };

    const dashboard = await fetchDprDashboard(client as never, { hideHistory: true });

    expect(reports.order).not.toHaveBeenCalled();
    expect(dashboard.reports).toEqual([]);
    expect(dashboard.currentUserId).toBe('sailor-user');
  });

  it('saves the complete six-step payload through the transactional RPC', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: { id: 42 }, error: null });
    const id = await saveDprPayload({ rpc } as never, null, EMPTY_DPR_PAYLOAD);
    expect(id).toBe(42);
    expect(rpc).toHaveBeenCalledWith('dpr_save_payload', {
      target_dpr_id: null,
      target_payload: EMPTY_DPR_PAYLOAD,
    });
    expect(rpc).toHaveBeenCalledOnce();
  });

  it('passes an explicit reason for logical deletion and reopening', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    await runDprTransition({ rpc } as never, 'delete', 42, 'Doublon confirmé');
    expect(rpc).toHaveBeenCalledWith('dpr_soft_delete', { target_dpr_id: 42, target_reason: 'Doublon confirmé' });
  });

  it('calls validation directly without the obsolete submission transition', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    await runDprTransition({ rpc } as never, 'validate', 42);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith('dpr_validate', { target_dpr_id: 42 });
  });

  it('allocates a trusted path before uploading and completing a file', async () => {
    const upload = vi.fn().mockResolvedValue({ data: {}, error: null });
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { id: 9, bucket_name: 'dpr-attachments', object_path: 'company/1/dpr/42/9-note.txt' }, error: null })
      .mockResolvedValueOnce({ data: { id: 9, dpr_id: 42, file_kind: 'attachment', bucket_name: 'dpr-attachments', object_path: 'company/1/dpr/42/9-note.txt', display_filename: 'note.txt', mime_type: 'text/plain', size_bytes: 4, sha256: 'a'.repeat(64), is_current: false, status: 'ready' }, error: null });
    const storage = { from: vi.fn().mockReturnValue({ upload }) };
    const file = new Blob(['note'], { type: 'text/plain' });

    const result = await uploadDprFile({ rpc, storage } as never, 42, 'attachment', file, 'note.txt');
    expect(storage.from).toHaveBeenCalledWith('dpr-attachments');
    expect(upload).toHaveBeenCalledWith('company/1/dpr/42/9-note.txt', file, { contentType: 'text/plain', upsert: false });
    expect(rpc).toHaveBeenLastCalledWith('dpr_complete_file_upload', { target_file_id: 9 });
    expect(result.filename).toBe('note.txt');
  });
});
