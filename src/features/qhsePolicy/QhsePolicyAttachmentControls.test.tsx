import type { SupabaseClient } from '@supabase/supabase-js';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QhsePolicyAttachmentList, QhsePolicyFilePicker } from './QhsePolicyAttachmentControls';
import { readQhsePolicyAttachment } from './qhsePolicyAttachments';
import type { QhsePolicyAttachment } from './qhsePolicyModel';

vi.mock('./qhsePolicyAttachments', async (importOriginal) => ({ ...await importOriginal<typeof import('./qhsePolicyAttachments')>(), readQhsePolicyAttachment: vi.fn() }));
vi.mock('./QhsePolicyPdfReader', () => ({ default: ({ url, title, label }: { url: string; title: string; label: string }) => <section aria-label={`Lecteur ${label} · ${title}`} data-url={url}>PDF chargé</section> }));

const client = {} as SupabaseClient;
function attachment(overrides: Partial<QhsePolicyAttachment> = {}): QhsePolicyAttachment {
  return { id: '40000000-0000-0000-0000-000000000001', objectiveId: '20000000-0000-0000-0000-000000000001', updateId: '30000000-0000-0000-0000-000000000001', fileName: 'Rapport.pdf', mimeType: 'application/pdf', sizeBytes: 6, storageBucket: 'qhse-policy-attachments', storagePath: '1/20000000-0000-0000-0000-000000000001/40000000-0000-0000-0000-000000000001.pdf', createdAt: '2026-10-02T10:30:00Z', ...overrides };
}
function PickerFixture() {
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  return <><QhsePolicyFilePicker files={files} onChange={setFiles} onError={setError} busy={false} />{error ? <p role="alert">{error}</p> : null}<button disabled={Boolean(error)}>Enregistrer</button></>;
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((finish) => { resolve = finish; }); return { promise, resolve }; }

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(readQhsePolicyAttachment).mockResolvedValue(new Blob(['report'], { type: 'application/pdf' }));
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:qhse-attachment-test') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('QHSE follow-up attachments', () => {
  it('rejects active HTML and oversized files, and lets the user remove them before saving', async () => {
    const user = userEvent.setup({ applyAccept: false }); render(<PickerFixture />);
    await user.upload(screen.getByLabelText('Pièces jointes (facultatif)'), new File(['<script>'], 'page.html', { type: 'text/html' }));
    expect(screen.getByRole('alert')).toHaveTextContent('PDF, une image, un document bureautique');
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Retirer page.html' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const large = new File(['x'], 'Photo.jpg', { type: 'image/jpeg' }); Object.defineProperty(large, 'size', { value: 25 * 1024 * 1024 + 1 });
    await user.upload(screen.getByLabelText('Pièces jointes (facultatif)'), large);
    expect(screen.getByRole('alert')).toHaveTextContent('25 Mo');
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Retirer Photo.jpg' }));
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
  });

  it('shows previews only for PDF and safe images and offers downloads for office files', () => {
    render(<QhsePolicyAttachmentList client={client} scopeKey="marin" attachments={[attachment(), attachment({ id: 'photo', fileName: 'Photo.png', mimeType: 'image/png' }), attachment({ id: 'office', fileName: 'Rapport.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), attachment({ id: 'unsafe', fileName: 'Autre fichier', mimeType: 'text/html' })]} />);
    expect(screen.getByRole('button', { name: 'Aperçu de Rapport.pdf' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Aperçu de Photo.png' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Aperçu de Rapport.docx' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aperçu de Autre fichier' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Télécharger Rapport.docx' })).toBeVisible();
    expect(readQhsePolicyAttachment).not.toHaveBeenCalled();
  });

  it('reports an attachment read failure without losing the history file and retries the same download', async () => {
    const file = attachment({ fileName: 'Compte rendu évaluation.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    vi.mocked(readQhsePolicyAttachment).mockRejectedValueOnce(new Error('Fichier indisponible'));
    const downloads: string[] = [];
    vi.mocked(HTMLAnchorElement.prototype.click).mockImplementation(function (this: HTMLAnchorElement) { downloads.push(this.download); });
    const user = userEvent.setup(); render(<QhsePolicyAttachmentList client={client} scopeKey="marin" attachments={[file]} />);
    await user.click(screen.getByRole('button', { name: `Télécharger ${file.fileName}` }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Fichier indisponible');
    expect(downloads).toEqual([]); expect(screen.getByText(file.fileName)).toBeVisible();
    await user.click(screen.getByRole('button', { name: `Télécharger ${file.fileName}` }));
    await waitFor(() => expect(downloads).toEqual([file.fileName]));
    expect(readQhsePolicyAttachment).toHaveBeenNthCalledWith(2, client, file);
  });

  it('previews an image from a local blob and reuses its bytes for download', async () => {
    const file = attachment({ fileName: 'Photo.png', mimeType: 'image/png' });
    const blob = new Blob(['image'], { type: 'image/png' }); vi.mocked(readQhsePolicyAttachment).mockResolvedValue(blob);
    const user = userEvent.setup(); render(<QhsePolicyAttachmentList client={client} scopeKey="capitaine" attachments={[file]} />);
    await user.click(screen.getByRole('button', { name: 'Aperçu de Photo.png' }));
    const dialog = await screen.findByRole('dialog', { name: 'Pièce jointe · Photo.png' });
    expect(within(dialog).getByRole('img', { name: 'Photo.png' })).toHaveAttribute('src', 'blob:qhse-attachment-test');
    await user.click(within(dialog).getByRole('button', { name: 'Télécharger' }));
    expect(readQhsePolicyAttachment).toHaveBeenCalledExactlyOnceWith(client, file);
    expect(URL.createObjectURL).toHaveBeenNthCalledWith(2, blob);
    await user.click(within(dialog).getByRole('button', { name: 'Fermer l’aperçu' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:qhse-attachment-test');
  });

  it('uses the PDF reader with attachment labels instead of embedding a remote document', async () => {
    const user = userEvent.setup(); render(<QhsePolicyAttachmentList client={client} scopeKey="armement" attachments={[attachment()]} />);
    await user.click(screen.getByRole('button', { name: 'Aperçu de Rapport.pdf' }));
    const reader = await screen.findByRole('region', { name: 'Lecteur Pièce jointe · Rapport.pdf' });
    expect(reader).toHaveAttribute('data-url', 'blob:qhse-attachment-test');
    expect(document.querySelector('iframe,embed,object')).toBeNull();
  });

  it.each(['client', 'roles'] as const)('ignores an attachment response from an old %s scope', async (change) => {
    const pending = deferred<Blob>(); vi.mocked(readQhsePolicyAttachment).mockReturnValueOnce(pending.promise);
    const user = userEvent.setup(); const { rerender } = render(<QhsePolicyAttachmentList client={client} scopeKey="admin" attachments={[attachment()]} />);
    await user.click(screen.getByRole('button', { name: 'Télécharger Rapport.pdf' }));
    expect(screen.getByRole('button', { name: 'Télécharger Rapport.pdf' })).toBeDisabled();
    rerender(<QhsePolicyAttachmentList client={change === 'client' ? {} as SupabaseClient : client} scopeKey="direction" attachments={[attachment()]} />);
    await act(async () => { pending.resolve(new Blob(['old'])); });
    expect(URL.createObjectURL).not.toHaveBeenCalled(); expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Télécharger Rapport.pdf' })).toBeEnabled();
  });
});
