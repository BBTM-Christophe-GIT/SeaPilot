import type { SupabaseClient } from '@supabase/supabase-js';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SeaOperationDocumentCards } from './SeaOperationDocumentCards';
import { deleteProjectDocument, fetchProjectDocumentDeletionSnapshot } from '../projects/projectDocumentDeletion';
import { downloadSeaOperationDocuments } from './seaOperationDocumentDownloads';
import type { SeaOperationProjectDocument } from './seaOperationDocumentQueries';

vi.mock('../projects/ProjectDocumentThumbnail', () => ({ ProjectDocumentThumbnail: () => <span aria-hidden="true">Miniature réelle</span> }));
vi.mock('../projects/projectDocumentDeletion', () => ({ deleteProjectDocument: vi.fn(), fetchProjectDocumentDeletionSnapshot: vi.fn() }));
vi.mock('./seaOperationDocumentDownloads', () => ({ downloadSeaOperationDocuments: vi.fn() }));
const client = {} as SupabaseClient;
const first: SeaOperationProjectDocument = { id: 'project:41', projectId: '501', title: 'Plan de prévention', fileName: 'plan.pdf', mimeType: 'application/pdf', categoryLabel: 'HSE', subcategoryLabel: 'Procédure', createdAt: '2026-10-30', expiresOn: null };
const second = { ...first, id: 'generated:42', title: 'Ordre de mission', fileName: 'ordre.pdf' };
const props = { client, projectId: '501', accessKey: 'company:real-captain-account', documents: [first, second], onOpen: vi.fn(), onDeleted: vi.fn() };
const snapshot = { projectId: 501, documentId: first.id, expected: { fileName: first.fileName, categoryKey: 'hse', subcategoryKey: 'hse_procedure', storageBucket: 'project-files', storagePath: 'projects/501/plan.pdf', sourceUrl: null, fileSizeBytes: 1024, modifiedAt: '2026-10-30T10:00:00Z' } };
beforeEach(() => {
  vi.resetAllMocks(); vi.mocked(fetchProjectDocumentDeletionSnapshot).mockResolvedValue(snapshot);
  vi.mocked(deleteProjectDocument).mockResolvedValue({ projectId: 501, documentId: first.id, deletedAt: '2026-10-30T11:00:00Z' });
  vi.mocked(downloadSeaOperationDocuments).mockResolvedValue({ count: 2, fileName: 'HSE.zip' });
});

describe('Shared document card design in Sea Operations', () => {
  it('uses name/thumbnail to open and supplies individual/group downloads and partial selection without crew delete rights', async () => {
    render(<SeaOperationDocumentCards {...props} />);
    expect(screen.queryByRole('button', { name: /^Supprimer/ })).not.toBeInTheDocument();
    expect(fetchProjectDocumentDeletionSnapshot).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir : Plan de prévention' }));
    expect(props.onOpen).toHaveBeenCalledWith(first);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Sélectionner plan.pdf pour le téléchargement' }));
    const category = screen.getByRole('checkbox', { name: 'Sélectionner tous les documents de HSE' });
    expect(category).toHaveAttribute('aria-checked', 'mixed');
    expect((category as HTMLInputElement).indeterminate).toBe(true);
    fireEvent.click(category);
    expect(screen.getByText('2 fichiers sélectionnés')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Télécharger la sélection (2)' }));
    await waitFor(() => expect(downloadSeaOperationDocuments).toHaveBeenCalledWith(client, '501', [first, second], 'Documents opération.zip', expect.any(AbortSignal)));
    expect(screen.queryByText('Ouvrir', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText('Détails', { exact: true })).not.toBeInTheDocument();
  });

  it('requires a manager snapshot and explicit confirmation before deleting a document', async () => {
    render(<SeaOperationDocumentCards {...props} canManage />);
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer plan.pdf' }));
    const dialog = await screen.findByRole('dialog', { name: 'Supprimer le document ?' });
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Supprimer le document' })).toBeEnabled());
    expect(fetchProjectDocumentDeletionSnapshot).toHaveBeenCalledWith(client, { projectId: 501, documentId: 'project:41' });
    expect(deleteProjectDocument).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Supprimer le document' }));
    await waitFor(() => expect(deleteProjectDocument).toHaveBeenCalledWith(client, snapshot));
    expect(props.onDeleted).toHaveBeenCalledWith(first.id);
  });

  it('keeps bigint read identities exact and hides delete when the shared manager API cannot safely represent an id', () => {
    render(<SeaOperationDocumentCards {...props} projectId="9007199254740993" canManage />);
    expect(screen.queryByRole('button', { name: /^Supprimer/ })).not.toBeInTheDocument();
    expect(fetchProjectDocumentDeletionSnapshot).not.toHaveBeenCalled();
  });
});
