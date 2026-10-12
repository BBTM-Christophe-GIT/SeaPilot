// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createExpenseSendHandler } from '../functions/expense-note-send/handler';

const ID = 'aa100000-0000-4000-8000-000000000001';
const driveDocument = { drive_file_id: 'verified_drive_12345', drive_path: 'Finances/fixture.pdf', file_name: 'fixture.pdf', mime_type: 'application/pdf', bytes: 16, sha256: 'a'.repeat(64), verified_at: '2026-10-12T00:00:00Z', active: true };
function setup({ visible = true, status = 'pending', user = true, claim = true, mapped = false }: { visible?: boolean; status?: string; user?: boolean; claim?: boolean; mapped?: boolean } = {}) {
  const row = { id: ID, status: 'issued', pdf_path: '1/owner/note.pdf', issuer_name: 'Test NDF', delivery_status: status, delivery_attempted_at: new Date().toISOString() };
  const visibleQuery = { eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: visible ? row : null, error: null }) };
  const download = vi.fn().mockResolvedValue({ data: new Blob(['%PDF-1.7\nfixture']), error: null });
  const client = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: user ? { id: 'owner' } : null }, error: null }) }, from: vi.fn(() => ({ select: () => visibleQuery })), storage: { from: () => ({ download }) } };
  const claimQuery = { eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: claim ? { id: ID } : null, error: null }) };
  const resultQuery = { eq: vi.fn().mockReturnThis(), then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve) };
  const update = vi.fn().mockReturnValueOnce(claimQuery).mockReturnValue(resultQuery);
  const mappingQuery = { eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: mapped ? driveDocument : null, error: null }) };
  const admin = { from: vi.fn((table: string) => table === 'document_drive_files' ? { select: () => mappingQuery } : { update }) };
  const relay = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  const readDrive = vi.fn().mockResolvedValue(new Response('%PDF-1.7\nfixture', { headers: { 'Content-Type': 'application/pdf' } }));
  const handler = createExpenseSendHandler({ userClient: () => client as never, admin: admin as never, fetch: relay, readDrive });
  const request = (authorization = 'Bearer test') => new Request('https://local.test', { method: 'POST', headers: { Authorization: authorization }, body: JSON.stringify({ noteId: ID }) });
  return { handler, request, relay, update, download, client, readDrive, mappingQuery, admin };
}
beforeEach(() => vi.restoreAllMocks());
describe('authenticated accounting delivery', () => {
  it('rejects anonymous callers without reading or sending a document', async () => {
    const test = setup(); expect((await test.handler(test.request(''))).status).toBe(401); expect(test.relay).not.toHaveBeenCalled(); expect(test.download).not.toHaveBeenCalled();
  });
  it('does not bypass row visibility with the service role', async () => {
    const test = setup({ visible: false }); expect((await test.handler(test.request())).status).toBe(404); expect(test.update).not.toHaveBeenCalled(); expect(test.download).not.toHaveBeenCalled(); expect(test.relay).not.toHaveBeenCalled();
  });
  it('sends only the archived PDF through the fixed existing NDF relay', async () => {
    const test = setup(); expect((await test.handler(test.request())).status).toBe(200);
    expect(test.download).toHaveBeenCalledWith('1/owner/note.pdf');
    expect(test.relay).toHaveBeenCalledWith('https://bbtm-ndfv2.netlify.app/.netlify/functions/send', expect.objectContaining({ method: 'POST' }));
    expect(test.update).toHaveBeenLastCalledWith(expect.objectContaining({ delivery_status: 'sent' }));
  });
  it('reads the verified Drive PDF after checking the caller, with no Storage copy', async () => {
    const test = setup({ mapped: true }); expect((await test.handler(test.request())).status).toBe(200);
    expect(test.readDrive).toHaveBeenCalledWith(driveDocument); expect(test.download).not.toHaveBeenCalled();
    expect(test.mappingQuery.eq).toHaveBeenCalledWith('source_path', '1/owner/note.pdf');
    expect(test.relay).toHaveBeenCalledOnce();
  });
  it('never reads the Drive mapping or content for a hidden note', async () => {
    const test = setup({ mapped: true, visible: false }); expect((await test.handler(test.request())).status).toBe(404);
    expect(test.admin.from).not.toHaveBeenCalled(); expect(test.readDrive).not.toHaveBeenCalled();
  });
  it('does not fall back or start delivery when the mapped Drive file is unavailable', async () => {
    const test = setup({ mapped: true }); test.readDrive.mockRejectedValue(new Error('Drive unavailable'));
    expect((await test.handler(test.request())).status).toBe(500);
    expect(test.download).not.toHaveBeenCalled(); expect(test.relay).not.toHaveBeenCalled(); expect(test.update).not.toHaveBeenCalled();
  });
  it('never falls back to Storage for an inactive mapping', async () => {
    const test = setup({ mapped: true }); test.mappingQuery.maybeSingle.mockResolvedValue({ data: { ...driveDocument, active: false }, error: null });
    expect((await test.handler(test.request())).status).toBe(403);
    expect(test.download).not.toHaveBeenCalled(); expect(test.readDrive).not.toHaveBeenCalled(); expect(test.relay).not.toHaveBeenCalled();
  });
  it.each(['sent', 'sending', 'unknown'])('never resends a note in state %s', async (status) => {
    const test = setup({ status }); await test.handler(test.request()); expect(test.relay).not.toHaveBeenCalled();
  });
  it('locks out concurrent attempts', async () => {
    const test = setup({ claim: false }); expect((await test.handler(test.request())).status).toBe(409); expect(test.relay).not.toHaveBeenCalled();
  });
  it('records ambiguous SMTP failure without claiming successful delivery', async () => {
    const test = setup(); test.relay.mockRejectedValue(new Error('network timeout'));
    expect((await test.handler(test.request())).status).toBe(502);
    expect(test.update).toHaveBeenLastCalledWith(expect.objectContaining({ delivery_status: 'unknown', delivered_at: null }));
  });
  it('allows retry only when the relay explicitly rejected before delivery', async () => {
    const test = setup(); test.relay.mockResolvedValue(new Response('{}', { status: 413 }));
    expect((await test.handler(test.request())).status).toBe(502);
    expect(test.update).toHaveBeenLastCalledWith(expect.objectContaining({ delivery_status: 'failed' }));
  });
});
