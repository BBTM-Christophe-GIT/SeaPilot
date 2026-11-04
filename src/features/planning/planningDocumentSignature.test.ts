import { readFileSync, existsSync } from 'node:fs';
import JSZip from 'jszip';
import { PDFDocument, PDFDict, PDFName } from 'pdf-lib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadPlanningDocumentSignature, planningPreviewSignature } from './planningDocumentSignature';

afterEach(() => vi.unstubAllGlobals());

describe('planning signature confidentiality', () => {
  it('does not publish signature images in static templates or source assets', async () => {
    expect(existsSync('public/templates/attestation-signature.png')).toBe(false);
    expect(existsSync('src/features/planning/assets/signature-benjamin-bon.png')).toBe(false);
    const docx = await JSZip.loadAsync(readFileSync('public/templates/attestation-embarquement.docx'));
    expect(await docx.file('word/media/image1.png')!.async('uint8array')).toEqual(planningPreviewSignature());
    const pdf = await PDFDocument.load(Uint8Array.from(readFileSync('public/templates/attestation-embarquement.pdf')));
    for (const page of pdf.getPages()) {
      const images = page.node.Resources()!.lookup(PDFName.of('XObject'), PDFDict);
      expect(images.keys()).toHaveLength(1); // BBTM logo only.
    }
  });

  it('requires a session and sends the JWT only in the authorization header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(planningPreviewSignature().buffer as ArrayBuffer, { headers: { 'Content-Type': 'image/png' } }));
    vi.stubGlobal('fetch', fetchMock);
    const client = { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }) } };
    await expect(downloadPlanningDocumentSignature(client as never)).rejects.toThrow('Connectez-vous');
    expect(fetchMock).not.toHaveBeenCalled();
    client.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'test-jwt', user: { id: 'synthetic-user' } } }, error: null } as never);
    expect(await downloadPlanningDocumentSignature(client as never)).toEqual(planningPreviewSignature());
    expect(fetchMock).toHaveBeenCalledWith('/api/planning-document-signature', expect.objectContaining({
      headers: { Authorization: 'Bearer test-jwt' }, cache: 'no-store', redirect: 'error',
    }));
  });

  it('discards private bytes if the account changes while the signature is being downloaded', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(planningPreviewSignature().buffer as ArrayBuffer, { headers: { 'Content-Type': 'image/png' } }));
    vi.stubGlobal('fetch', fetchMock);
    const client = { auth: { getSession: vi.fn()
      .mockResolvedValueOnce({ data: { session: { access_token: 'first-jwt', user: { id: 'first-user' } } }, error: null })
      .mockResolvedValueOnce({ data: { session: { access_token: 'second-jwt', user: { id: 'second-user' } } }, error: null }) } };
    await expect(downloadPlanningDocumentSignature(client as never)).rejects.toThrow('Le compte a changé');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
