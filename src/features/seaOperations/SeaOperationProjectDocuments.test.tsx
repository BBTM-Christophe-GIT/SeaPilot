import type { SupabaseClient } from '@supabase/supabase-js';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SeaOperationProjectDocuments } from './SeaOperationProjectDocuments';
import { createSeaOperationProjectDocumentUrl, fetchSeaOperationProjectDocuments, type SeaOperationProjectDocument } from './seaOperationDocumentQueries';

vi.mock('./seaOperationDocumentQueries', () => ({ fetchSeaOperationProjectDocuments: vi.fn(), createSeaOperationProjectDocumentUrl: vi.fn() }));

const client = {} as SupabaseClient;
const documentFixture = (overrides: Partial<SeaOperationProjectDocument> = {}): SeaOperationProjectDocument => ({
  id: 'project:101', projectId: '501', title: 'Plan de prévention', fileName: 'Plan de prévention.pdf', mimeType: 'application/pdf',
  categoryLabel: 'Sécurité', subcategoryLabel: 'Préparation', createdAt: '2026-10-22T08:00:00Z', expiresOn: null, ...overrides,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise, resolve };
}
async function expandDocuments() {
  const summary = screen.getByText('Documents du projet');
  if (!(summary.closest('details') as HTMLDetailsElement).open) await userEvent.click(summary);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchSeaOperationProjectDocuments).mockResolvedValue([documentFixture()]);
  vi.mocked(createSeaOperationProjectDocumentUrl).mockResolvedValue('https://documents.example.test/plan.pdf');
});

describe('read-only Sea Operation project documents', () => {
  it('lists only the documents returned by the protected catalogue without exposing storage or forbidden document details', async () => {
    render(<SeaOperationProjectDocuments client={client} projectId="501" />);
    expect(screen.getByText('Documents du projet').closest('details')).not.toHaveAttribute('open');
    await expandDocuments();
    expect(await screen.findByText('Plan de prévention')).toBeInTheDocument();
    expect(fetchSeaOperationProjectDocuments).toHaveBeenCalledWith(client, '501');
    expect(screen.getByText('1 document')).toBeInTheDocument();
    expect(screen.getByText('Sécurité · Préparation · Plan de prévention.pdf')).toBeInTheDocument();
    expect(screen.queryByText(/Offre commerciale|Facturation|storage_path|storage_bucket/i)).not.toBeInTheDocument();
    expect(document.querySelector('a[href], iframe, img')).toBeNull();
    const disclosure = screen.getByText('Documents du projet').closest('details')!;
    expect(disclosure).toHaveAttribute('open');
    await userEvent.click(screen.getByText('Documents du projet'));
    expect(disclosure).not.toHaveAttribute('open');
  });

  it('checks document access on open, embeds a PDF, and closes Escape without closing its surrounding editor', async () => {
    const parentKey = vi.fn();
    render(<div onKeyDown={parentKey}><SeaOperationProjectDocuments client={client} projectId="501" /></div>);
    await expandDocuments();
    const opener = await screen.findByRole('button', { name: 'Ouvrir : Plan de prévention' });
    await userEvent.click(opener);
    const dialog = await screen.findByRole('dialog', { name: 'Plan de prévention' });
    expect(createSeaOperationProjectDocumentUrl).toHaveBeenCalledWith(client, '501', 'project:101');
    const reader = await within(dialog).findByTitle('Lecture : Plan de prévention');
    expect(reader).toHaveAttribute('src', 'https://documents.example.test/plan.pdf');
    expect(reader).not.toHaveAttribute('sandbox');
    expect(within(dialog).getByRole('link', { name: 'Ouvrir dans un nouvel onglet' })).toHaveAttribute('rel', 'noopener noreferrer');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(parentKey).not.toHaveBeenCalled();
    expect(opener).toHaveFocus();
  });

  it('shows images in the viewer and other formats through a separate safe link', async () => {
    const image = documentFixture({ id: 'project:102', title: 'Repérage du quai', fileName: 'quai.webp', mimeType: 'image/webp' });
    const file = documentFixture({ id: 'generated:103', title: 'Consignes', fileName: 'consignes.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    vi.mocked(fetchSeaOperationProjectDocuments).mockResolvedValue([image, file]);
    vi.mocked(createSeaOperationProjectDocumentUrl).mockImplementation(async (_client, _project, id) => `https://documents.example.test/${id === image.id ? 'quai.webp' : 'consignes.docx'}`);
    render(<SeaOperationProjectDocuments client={client} projectId="501" />);
    await expandDocuments();
    await userEvent.click(await screen.findByRole('button', { name: 'Ouvrir : Repérage du quai' }));
    expect(await screen.findByRole('img', { name: 'Repérage du quai' })).toHaveAttribute('src', 'https://documents.example.test/quai.webp');
    await userEvent.click(screen.getByRole('button', { name: 'Fermer le document' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir : Consignes' }));
    expect(await screen.findByText('Ce format se consulte dans un nouvel onglet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ouvrir dans un nouvel onglet' })).toHaveAttribute('href', 'https://documents.example.test/consignes.docx');
    expect(document.querySelector('iframe, img')).toBeNull();
  });

  it('does not display an old project catalogue after switching projects', async () => {
    const old = deferred<SeaOperationProjectDocument[]>();
    vi.mocked(fetchSeaOperationProjectDocuments).mockImplementation(async (_client, projectId) => projectId === '501' ? old.promise : [documentFixture({ projectId: '502', title: 'Plan du second projet' })]);
    const view = render(<SeaOperationProjectDocuments client={client} projectId="501" />);
    await expandDocuments();
    view.rerender(<SeaOperationProjectDocuments client={client} projectId="502" />);
    expect(await screen.findByText('Plan du second projet')).toBeInTheDocument();
    await act(async () => old.resolve([documentFixture()]));
    expect(screen.queryByText('Plan de prévention')).not.toBeInTheDocument();
    expect(screen.getByText('Plan du second projet')).toBeInTheDocument();
  });

  it('immediately hides the former project image and ignores a late access URL after a project switch', async () => {
    const old = deferred<string>();
    vi.mocked(createSeaOperationProjectDocumentUrl).mockResolvedValueOnce('https://documents.example.test/first-photo.png').mockReturnValue(old.promise);
    vi.mocked(fetchSeaOperationProjectDocuments).mockImplementation(async (_client, projectId) => [documentFixture({ projectId, title: `Photo ${projectId}`, fileName: 'photo.png', mimeType: 'image/png' })]);
    const view = render(<SeaOperationProjectDocuments client={client} projectId="501" />);
    await expandDocuments();
    await userEvent.click(await screen.findByRole('button', { name: 'Ouvrir : Photo 501' }));
    expect(await screen.findByRole('img', { name: 'Photo 501' })).toHaveAttribute('src', 'https://documents.example.test/first-photo.png');
    await userEvent.click(screen.getByRole('button', { name: 'Fermer le document' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir : Photo 501' }));
    expect(screen.getByRole('dialog', { name: 'Photo 501' })).toBeInTheDocument();
    view.rerender(<SeaOperationProjectDocuments client={client} projectId="502" />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByText('Photo 502')).toBeInTheDocument();
    await act(async () => old.resolve('https://documents.example.test/old-photo.png'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });

  it.each([
    { mimeType: 'text/html', url: 'https://documents.example.test/disguised.pdf' },
    { mimeType: 'application/pdf', url: 'https://bbtm668.sharepoint.com/sites/qhse/partage/document.pdf' },
  ])('keeps $mimeType at $url outside embedded readers', async ({ mimeType, url }) => {
    vi.mocked(fetchSeaOperationProjectDocuments).mockResolvedValue([documentFixture({ mimeType })]);
    vi.mocked(createSeaOperationProjectDocumentUrl).mockResolvedValue(url);
    render(<SeaOperationProjectDocuments client={client} projectId="501" />);
    await expandDocuments();
    await userEvent.click(await screen.findByRole('button', { name: 'Ouvrir : Plan de prévention' }));
    expect(await screen.findByText('Ce format se consulte dans un nouvel onglet.')).toBeInTheDocument();
    expect(document.querySelector('iframe, img')).toBeNull();
    expect(screen.getByRole('link', { name: 'Ouvrir dans un nouvel onglet' })).toHaveAttribute('href', url);
  });

  it('allows catalogue and document access errors to be retried without changing the operation', async () => {
    vi.mocked(fetchSeaOperationProjectDocuments).mockRejectedValueOnce({ message: 'Catalogue indisponible.' }).mockResolvedValue([documentFixture()]);
    vi.mocked(createSeaOperationProjectDocumentUrl).mockRejectedValueOnce(new Error('Accès expiré.')).mockResolvedValue('https://documents.example.test/renewed.pdf');
    render(<SeaOperationProjectDocuments client={client} projectId="501" />);
    await expandDocuments();
    expect(await screen.findByRole('alert')).toHaveTextContent('Catalogue indisponible.');
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer les documents' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Ouvrir : Plan de prévention' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Accès expiré.');
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer l’ouverture' }));
    expect(await screen.findByTitle('Lecture : Plan de prévention')).toHaveAttribute('src', 'https://documents.example.test/renewed.pdf');
    expect(createSeaOperationProjectDocumentUrl).toHaveBeenCalledTimes(2);
  });

  it('supports an empty project, absent selection and temporarily disabled opening', async () => {
    vi.mocked(fetchSeaOperationProjectDocuments).mockResolvedValueOnce([]).mockResolvedValue([documentFixture()]);
    const view = render(<SeaOperationProjectDocuments client={client} projectId="501" />);
    await expandDocuments();
    expect(await screen.findByText('Aucun document disponible pour ce projet.')).toBeInTheDocument();
    view.rerender(<SeaOperationProjectDocuments client={client} projectId="" />);
    expect(screen.queryByText('Documents du projet')).not.toBeInTheDocument();
    view.rerender(<SeaOperationProjectDocuments client={client} projectId="501" disabled />);
    await expandDocuments();
    const opener = await screen.findByRole('button', { name: 'Ouvrir : Plan de prévention' });
    expect(opener).toBeDisabled();
    await userEvent.click(opener);
    expect(createSeaOperationProjectDocumentUrl).not.toHaveBeenCalled();
  });
});
