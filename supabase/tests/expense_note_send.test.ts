// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { createExpenseSendHandler } from '../functions/expense-note-send/handler';
import { ExpenseMailError } from '../functions/expense-note-send/mailer';
import { DriveAccessError } from '../functions/document-drive/googleDrive';

const ID = 'aa100000-0000-4000-8000-000000000001';
function setup({ visible = true, status = 'pending', user = true, claim = true, drive = null }: { visible?: boolean; status?: string; user?: boolean; claim?: boolean; drive?: Record<string, unknown> | null } = {}) {
  const row = { id: ID, status: 'issued', pdf_path: '1/owner/note.pdf', issuer_name: 'Test NDF', delivery_status: status, delivery_attempted_at: new Date().toISOString() };
  const visibleQuery = { eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: visible ? row : null, error: null }) };
  const download = vi.fn().mockResolvedValue({ data: new Blob(['%PDF-1.7\nfixture']), error: null });
  const client = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: user ? { id: 'owner' } : null }, error: null }) }, from: vi.fn(() => ({ select: () => visibleQuery })), storage: { from: () => ({ download }) } };
  const claimQuery = { eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: claim ? { id: ID } : null, error: null }) };
  const result = { error: null as { code: string } | null };
  const resultQuery = { eq: vi.fn().mockReturnThis(), then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve) };
  const update = vi.fn().mockReturnValueOnce(claimQuery).mockReturnValue(resultQuery);
  const driveQuery = { eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: drive, error: null }) };
  const admin = { from: vi.fn((table) => table === 'document_drive_files' ? { select: () => driveQuery } : { update }) };
  const mailSend = vi.fn().mockResolvedValue(undefined);
  const checkReady = vi.fn();
  const api = vi.fn().mockImplementation(async () => Response.json({ error: 'DOCUMENT_NOT_FOUND' }, { status: 404 }));
  const provider = vi.fn();
  const readDrive = vi.fn().mockImplementation(async () => new Response('%PDF-1.7\nfixture', { headers: { 'Content-Type': 'application/pdf' } }));
  const network = vi.fn().mockImplementation((url, options) => url === 'https://sea-pilot-ten.vercel.app/api/documents' ? api(url, options) : provider(url, options));
  const handler = createExpenseSendHandler({ userClient: () => client as never, admin: admin as never, fetch: network,
    mailer: { checkReady, send: mailSend }, readDrive });
  const request = (authorization = 'Bearer test') => new Request('https://local.test', { method: 'POST', headers: { Authorization: authorization }, body: JSON.stringify({ noteId: ID }) });
  return { handler, request, mailSend, checkReady, update, download, client, api, provider, readDrive, admin, driveQuery, result, claimQuery };
}
beforeEach(() => vi.restoreAllMocks());
describe('authenticated accounting delivery', () => {
  it('rejects anonymous callers without reading or sending a document', async () => {
    const test = setup(); expect((await test.handler(test.request(''))).status).toBe(401); expect(test.mailSend).not.toHaveBeenCalled(); expect(test.download).not.toHaveBeenCalled();
    expect(test.checkReady).not.toHaveBeenCalled();
  });
  it('does not bypass row visibility with the service role', async () => {
    const test = setup({ visible: false }); expect((await test.handler(test.request())).status).toBe(404); expect(test.update).not.toHaveBeenCalled(); expect(test.download).not.toHaveBeenCalled(); expect(test.mailSend).not.toHaveBeenCalled();
    expect(test.checkReady).not.toHaveBeenCalled();
  });
  it('rejects an expired session before checking mail configuration or note visibility', async () => {
    const test = setup({ user: false });
    expect((await test.handler(test.request())).status).toBe(401);
    expect(test.client.from).not.toHaveBeenCalled(); expect(test.checkReady).not.toHaveBeenCalled();
    expect(test.mailSend).not.toHaveBeenCalled(); expect(test.admin.from).not.toHaveBeenCalled();
  });
  it.each(['pending', 'failed'])('leaves a %s note untouched when server mail configuration is missing', async (status) => {
    const test = setup({ status });
    test.checkReady.mockImplementation(() => { throw new ExpenseMailError('Configuration de messagerie SeaPilot manquante.', true, 503); });
    const response = await test.handler(test.request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: 'Configuration de messagerie SeaPilot manquante.' });
    expect(test.api).not.toHaveBeenCalled(); expect(test.provider).not.toHaveBeenCalled();
    expect(test.download).not.toHaveBeenCalled(); expect(test.readDrive).not.toHaveBeenCalled();
    expect(test.admin.from).not.toHaveBeenCalled(); expect(test.update).not.toHaveBeenCalled(); expect(test.mailSend).not.toHaveBeenCalled();
  });
  it('sends only the archived PDF with the server mailer, without an external HTTP relay', async () => {
    const test = setup(); expect((await test.handler(test.request())).status).toBe(200);
    expect(test.download).toHaveBeenCalledWith('1/owner/note.pdf');
    expect(test.mailSend).toHaveBeenCalledExactlyOnceWith({ noteId: ID, issuerName: 'Test NDF', pdf: new TextEncoder().encode('%PDF-1.7\nfixture') });
    expect(test.provider).not.toHaveBeenCalled();
    expect(test.update).toHaveBeenLastCalledWith(expect.objectContaining({ delivery_status: 'sent' }));
    expect(test.checkReady.mock.invocationCallOrder[0]).toBeLessThan(test.api.mock.invocationCallOrder[0]);
    expect(test.update.mock.invocationCallOrder[0]).toBeLessThan(test.mailSend.mock.invocationCallOrder[0]);
    expect(test.mailSend.mock.invocationCallOrder[0]).toBeLessThan(test.update.mock.invocationCallOrder[1]);
  });
  it('ignores caller-provided recipient, PDF and sender overrides', async () => {
    const test = setup();
    const request = new Request('https://local.test', { method: 'POST', headers: { Authorization: 'Bearer test' },
      body: JSON.stringify({ noteId: ID, to: 'attacker@example.invalid', issuerName: 'Forged sender', pdfBase64: btoa('%PDF-forged'), url: 'https://attacker.invalid' }) });
    expect((await test.handler(request)).status).toBe(200);
    expect(test.mailSend).toHaveBeenCalledExactlyOnceWith({ noteId: ID, issuerName: 'Test NDF', pdf: new TextEncoder().encode('%PDF-1.7\nfixture') });
    expect(test.provider).not.toHaveBeenCalled();
  });
  it.each(['sent', 'sending', 'unknown'])('never resends a note in state %s', async (status) => {
    const test = setup({ status }); await test.handler(test.request()); expect(test.mailSend).not.toHaveBeenCalled(); expect(test.api).not.toHaveBeenCalled(); expect(test.readDrive).not.toHaveBeenCalled(); expect(test.download).not.toHaveBeenCalled();
    expect(test.checkReady).not.toHaveBeenCalled();
  });
  it('locks out concurrent attempts', async () => {
    const test = setup({ claim: false }); expect((await test.handler(test.request())).status).toBe(409); expect(test.mailSend).not.toHaveBeenCalled();
  });
  it('does not send if the database cannot claim the delivery lock', async () => {
    const test = setup();
    test.claimQuery.maybeSingle.mockResolvedValue({ data: null, error: { code: 'unavailable' } } as never);
    expect((await test.handler(test.request())).status).toBe(500);
    expect(test.mailSend).not.toHaveBeenCalled();
  });
  it('records ambiguous SMTP failure without claiming successful delivery', async () => {
    const test = setup(); test.mailSend.mockRejectedValue(new Error('network timeout'));
    expect((await test.handler(test.request())).status).toBe(502);
    expect(test.update).toHaveBeenLastCalledWith(expect.objectContaining({ delivery_status: 'unknown', delivered_at: null }));
  });
  it('allows retry only when SMTP definitely rejected the message before delivery', async () => {
    const test = setup(); test.mailSend.mockRejectedValue(new ExpenseMailError('Le serveur de messagerie a refusé l’envoi.', true));
    expect((await test.handler(test.request())).status).toBe(502);
    expect(test.update).toHaveBeenLastCalledWith(expect.objectContaining({ delivery_status: 'failed' }));
  });
  it('keeps an explicitly uncertain SMTP result blocked and hides provider details', async () => {
    const test = setup(); test.mailSend.mockRejectedValue(new ExpenseMailError('Private SMTP diagnostics', false));
    const response = await test.handler(test.request());
    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain('Vérifiez sa réception');
    expect(test.update).toHaveBeenLastCalledWith(expect.objectContaining({ delivery_status: 'unknown', delivered_at: null }));
    expect(test.update.mock.calls[1][0].delivery_error).not.toContain('Private SMTP diagnostics');
  });
  it('never claims success or retries SMTP when recording a confirmed send fails', async () => {
    const test = setup(); test.result.error = { code: 'unavailable' };
    const response = await test.handler(test.request());
    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain('Vérifiez la réception avant tout nouvel envoi');
    expect(test.mailSend).toHaveBeenCalledOnce();
    expect(test.update).toHaveBeenCalledTimes(2);
    expect(test.update).toHaveBeenLastCalledWith(expect.objectContaining({ delivery_status: 'sent', delivered_at: expect.any(String) }));
  });
  it.each([
    [401, { error: 'DOCUMENT_AUTHENTICATION_REQUIRED' }], [403, { error: 'DOCUMENT_ACCESS_DENIED' }],
    [404, { error: 'OTHER_NOT_FOUND' }], [500, { error: 'DOCUMENT_NOT_FOUND' }], [200, {}],
  ])('does not claim or send or fall back after a Blob error %s', async (status, body) => {
    const test = setup(); test.api.mockImplementation(async () => Response.json(body, { status }));
    expect((await test.handler(test.request())).status).not.toBe(200);
    expect(test.admin.from).not.toHaveBeenCalled(); expect(test.readDrive).not.toHaveBeenCalled();
    expect(test.download).not.toHaveBeenCalled(); expect(test.update).not.toHaveBeenCalled(); expect(test.mailSend).not.toHaveBeenCalled();
  });
  it('preserves the deployed Drive reader only after an explicitly unmapped Blob', async () => {
    const drive = { drive_file_id: 'verified_drive_file_id', drive_path: 'Notes de frais/fixture.pdf', file_name: 'fixture.pdf', mime_type: 'application/pdf', bytes: 16, sha256: 'a'.repeat(64), verified_at: '2026-10-14T00:00:00Z', active: true };
    const test = setup({ drive }); expect((await test.handler(test.request())).status).toBe(200);
    expect(test.readDrive).toHaveBeenCalledWith(drive); expect(test.download).not.toHaveBeenCalled(); expect(test.mailSend).toHaveBeenCalledOnce();
    expect(test.driveQuery.eq).toHaveBeenCalledWith('source_path', '1/owner/note.pdf');
  });
  it.each(['verified', 'altered', 'provider-refused'])('handles the Blob PDF before claiming delivery: %s', async (kind) => {
    const test = setup(); const pdf = '%PDF-1.7\nsynthetic private note';
    const sha = createHash('sha256').update(pdf).digest('hex');
    const blobUrl = 'https://fixture.private.blob.vercel-storage.com/documents/uploads/synthetic.pdf';
    test.api.mockImplementation(async () => Response.json({ signedUrl: `${blobUrl}?token=synthetic`, expiresAt: Date.now() + 120_000,
      document: { id: ID, provider: 'vercel-blob', blob_pathname: 'documents/uploads/synthetic.pdf', blob_url: blobUrl,
        file_name: 'note.pdf', mime_type: 'application/pdf', bytes: pdf.length, sha256: sha, source_sha256: sha, verified_at: '2026-10-14T00:00:00Z' } }));
    test.provider.mockImplementation(async () => new Response(kind === 'altered' ? pdf.replace('note', 'fake') : pdf,
      { status: kind === 'provider-refused' ? 403 : 200, headers: { 'Content-Type': 'application/pdf' } }));
    expect((await test.handler(test.request())).status).toBe(kind === 'verified' ? 200 : 422);
    expect(test.readDrive).not.toHaveBeenCalled(); expect(test.download).not.toHaveBeenCalled();
    expect(test.admin.from).not.toHaveBeenCalledWith('document_drive_files');
    if (kind !== 'verified') { expect(test.update).not.toHaveBeenCalled(); expect(test.mailSend).not.toHaveBeenCalled(); return; }
    expect(test.mailSend).toHaveBeenCalledExactlyOnceWith({ noteId: ID, issuerName: 'Test NDF', pdf: new TextEncoder().encode(pdf) });
    expect(test.update).toHaveBeenLastCalledWith(expect.objectContaining({ delivery_status: 'sent' }));
  });
  it.each(['inactive', 'invalid', 'lookup-error', 'read-error'])('preserves fail-closed Drive behavior: %s', async (kind) => {
    const drive = { drive_file_id: 'verified_drive_file_id', drive_path: 'Notes de frais/fixture.pdf', file_name: 'fixture.pdf', mime_type: 'application/pdf', bytes: 16, sha256: 'a'.repeat(64), verified_at: '2026-10-14T00:00:00Z', active: kind !== 'inactive' };
    if (kind === 'invalid') drive.sha256 = 'invalid';
    const test = setup({ drive });
    if (kind === 'lookup-error') test.driveQuery.maybeSingle.mockResolvedValue({ data: null, error: { code: 'error' } } as never);
    if (kind === 'read-error') test.readDrive.mockRejectedValue(new DriveAccessError(403, 'Refus Drive.'));
    expect((await test.handler(test.request())).status).not.toBe(200);
    expect(test.download).not.toHaveBeenCalled(); expect(test.update).not.toHaveBeenCalled(); expect(test.mailSend).not.toHaveBeenCalled();
  });
  it.each(['oversized', 'invalid'])('rejects the legacy PDF before claiming delivery: %s', async (kind) => {
    const test = setup(); test.download.mockResolvedValue({ data: new Blob([kind === 'oversized' ? '%PDF-' + 'x'.repeat(4_000_000) : 'invalid']), error: null });
    expect((await test.handler(test.request())).status).toBe(kind === 'oversized' ? 413 : 422);
    expect(test.update).not.toHaveBeenCalled(); expect(test.mailSend).not.toHaveBeenCalled();
  });
});
