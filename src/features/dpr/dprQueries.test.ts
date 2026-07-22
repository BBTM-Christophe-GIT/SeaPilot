import { describe, expect, it, vi } from 'vitest';
import { EMPTY_DPR_PAYLOAD } from './dprFormModel.ts';
import { runDprTransition, saveDprPayload, uploadDprFile } from './dprQueries.ts';

describe('DPR Supabase commands', () => {
  it('saves the complete six-step payload through the transactional RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: 42 }, error: null });
    const id = await saveDprPayload({ rpc } as never, null, EMPTY_DPR_PAYLOAD);
    expect(id).toBe(42);
    expect(rpc).toHaveBeenCalledWith('dpr_save_payload', {
      target_dpr_id: null,
      target_payload: EMPTY_DPR_PAYLOAD,
    });
  });

  it('passes an explicit reason for logical deletion and reopening', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    await runDprTransition({ rpc } as never, 'delete', 42, 'Doublon confirmé');
    expect(rpc).toHaveBeenCalledWith('dpr_soft_delete', { target_dpr_id: 42, target_reason: 'Doublon confirmé' });
  });

  it('allocates a trusted path before uploading and completing a file', async () => {
    const upload = vi.fn().mockResolvedValue({ data: {}, error: null });
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { id: 9, bucket_name: 'dpr-pdfs', object_path: 'company/1/dpr/42/9-DPR-42.pdf' }, error: null })
      .mockResolvedValueOnce({ data: { id: 9, dpr_id: 42, file_kind: 'pdf', bucket_name: 'dpr-pdfs', object_path: 'company/1/dpr/42/9-DPR-42.pdf', display_filename: 'DPR-42.pdf', mime_type: 'application/pdf', size_bytes: 3, sha256: 'a'.repeat(64), is_current: true, status: 'ready' }, error: null });
    const storage = { from: vi.fn().mockReturnValue({ upload }) };
    const file = new Blob(['pdf'], { type: 'application/pdf' });

    const result = await uploadDprFile({ rpc, storage } as never, 42, 'pdf', file, 'DPR-42.pdf');
    expect(storage.from).toHaveBeenCalledWith('dpr-pdfs');
    expect(upload).toHaveBeenCalledWith('company/1/dpr/42/9-DPR-42.pdf', file, { contentType: 'application/pdf', upsert: false });
    expect(rpc).toHaveBeenLastCalledWith('dpr_complete_file_upload', { target_file_id: 9 });
    expect(result.filename).toBe('DPR-42.pdf');
  });
});
