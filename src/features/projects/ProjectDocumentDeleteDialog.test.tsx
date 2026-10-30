import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectDocumentDeleteAction, ProjectDocumentDeletionProvider } from './ProjectDocumentDeleteDialog';
import type { ProjectDocumentDeletionInput } from './projectDocumentDeletion';

const mocks = vi.hoisted(() => ({ snapshot: vi.fn(), remove: vi.fn() }));
vi.mock('./projectDocumentDeletion', () => ({
  fetchProjectDocumentDeletionSnapshot: mocks.snapshot,
  deleteProjectDocument: mocks.remove,
}));

const document = { documentId: 'generated:77', fileName: 'audit.pdf', sourceKey: 'source-1' };
const snapshot = (documentId = document.documentId): ProjectDocumentDeletionInput => ({
  projectId: 880, documentId,
  expected: { fileName: document.fileName, categoryKey: 'hse', subcategoryKey: 'hse_audits',
    storageBucket: 'project-files', storagePath: 'projects/880/attachments/audit.pdf',
    sourceUrl: null, fileSizeBytes: 2048, modifiedAt: '2026-10-30T10:00:00Z' },
});
const deletion = (documentId = document.documentId) => ({ projectId: 880, documentId, deletedAt: '2026-10-30T10:01:00Z' });
const props = { accessKey: 'account-a', archived: false, canManage: true, client: {} as never,
  projectId: 880, documents: [document], onDeleted: vi.fn() };
const action = <ProjectDocumentDeleteAction documentId={document.documentId} />;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  return { promise: new Promise<T>((yes, no) => { resolve = yes; reject = no; }), resolve, reject };
}
function begin() {
  fireEvent.click(screen.getByRole('button', { name: 'Supprimer audit.pdf' }));
  return screen.getByRole('dialog', { name: 'Supprimer le document ?' });
}
async function ready(dialog: HTMLElement) {
  await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Supprimer le document' })).toBeEnabled());
}

describe('Project document deletion confirmation', () => {
  beforeEach(() => {
    mocks.snapshot.mockReset().mockResolvedValue(snapshot());
    mocks.remove.mockReset().mockResolvedValue(deletion());
    props.onDeleted.mockReset();
  });

  it.each(['generated:77', 'project:77', 'contract:77'])('confirms the exact %s snapshot before changing only that document', async documentId => {
    const source = { ...document, documentId };
    mocks.snapshot.mockResolvedValue(snapshot(documentId));
    mocks.remove.mockResolvedValue(deletion(documentId));
    render(<ProjectDocumentDeletionProvider {...props} documents={[source]}><ProjectDocumentDeleteAction documentId={documentId} /></ProjectDocumentDeletionProvider>);
    const dialog = begin();
    expect(mocks.snapshot).toHaveBeenCalledExactlyOnceWith(props.client, { projectId: 880, documentId });
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(dialog).toHaveTextContent('audit.pdf');
    expect(dialog).toHaveTextContent('Opération en Mer');
    await ready(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Supprimer le document' }));
    await waitFor(() => expect(props.onDeleted).toHaveBeenCalledExactlyOnceWith(deletion(documentId)));
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(props.client, snapshot(documentId));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps confirmation disabled until the protected snapshot is ready and cancels without writing', async () => {
    const pending = deferred<ProjectDocumentDeletionInput>(); mocks.snapshot.mockReturnValue(pending.promise);
    render(<ProjectDocumentDeletionProvider {...props}>{action}</ProjectDocumentDeletionProvider>);
    const dialog = begin();
    expect(within(dialog).getByRole('button', { name: 'Supprimer le document' })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    await act(async () => pending.resolve(snapshot()));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(props.onDeleted).not.toHaveBeenCalled();
  });

  it('retries a failed snapshot read without issuing a delete request', async () => {
    mocks.snapshot.mockRejectedValueOnce(new Error('Lecture du document refusée.')).mockResolvedValueOnce(snapshot());
    render(<ProjectDocumentDeletionProvider {...props}>{action}</ProjectDocumentDeletionProvider>);
    const dialog = begin();
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Lecture du document refusée');
    expect(within(dialog).getByRole('button', { name: 'Supprimer le document' })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Réessayer' }));
    await ready(dialog);
    expect(mocks.snapshot).toHaveBeenCalledTimes(2);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('refuses a fresh snapshot whose filename no longer matches the displayed source', async () => {
    const changed = snapshot(); changed.expected.fileName = 'replacement.pdf';
    mocks.snapshot.mockResolvedValue(changed);
    render(<ProjectDocumentDeletionProvider {...props}>{action}</ProjectDocumentDeletionProvider>);
    const dialog = begin();
    expect(await within(dialog).findByRole('alert')).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Supprimer le document' })).toBeDisabled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('blocks double confirmation and preserves the document when the server rejects a concurrent change', async () => {
    const pending = deferred<ReturnType<typeof deletion>>(); mocks.remove.mockReturnValue(pending.promise);
    render(<ProjectDocumentDeletionProvider {...props}>{action}</ProjectDocumentDeletionProvider>);
    const dialog = begin(); await ready(dialog);
    const confirm = within(dialog).getByRole('button', { name: 'Supprimer le document' });
    act(() => { fireEvent.click(confirm); fireEvent.click(confirm); });
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(confirm).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Annuler' })).toBeDisabled();
    await act(async () => pending.reject(new Error('Le document a été modifié. Rechargez la liste.')));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Le document a été modifié');
    expect(screen.getByRole('button', { name: 'Supprimer audit.pdf' })).toBeInTheDocument();
    expect(props.onDeleted).not.toHaveBeenCalled();
  });

  it.each(['account', 'client', 'project', 'permission', 'archived', 'source', 'removed', 'unmount'])('ignores a late snapshot after %s changes', async change => {
    const pending = deferred<ProjectDocumentDeletionInput>(); mocks.snapshot.mockReturnValue(pending.promise);
    const view = render(<ProjectDocumentDeletionProvider {...props}>{action}</ProjectDocumentDeletionProvider>);
    begin();
    if (change === 'unmount') view.unmount();
    else view.rerender(<ProjectDocumentDeletionProvider {...props}
      accessKey={change === 'account' ? 'account-b' : props.accessKey}
      client={change === 'client' ? { other: true } as never : props.client}
      projectId={change === 'project' ? 881 : props.projectId}
      canManage={change !== 'permission'} archived={change === 'archived'}
      documents={change === 'removed' ? [] : change === 'source' ? [{ ...document, sourceKey: 'source-2' }] : props.documents}>{action}</ProjectDocumentDeletionProvider>);
    await act(async () => pending.resolve(snapshot()));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(props.onDeleted).not.toHaveBeenCalled();
  });

  it.each(['account', 'client', 'project', 'permission', 'archived', 'source', 'removed', 'unmount'])('does not publish a late deletion response after %s changes', async change => {
    const pending = deferred<ReturnType<typeof deletion>>(); mocks.remove.mockReturnValue(pending.promise);
    const view = render(<ProjectDocumentDeletionProvider {...props}>{action}</ProjectDocumentDeletionProvider>);
    const dialog = begin(); await ready(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Supprimer le document' }));
    if (change === 'unmount') view.unmount();
    else view.rerender(<ProjectDocumentDeletionProvider {...props}
      accessKey={change === 'account' ? 'account-b' : props.accessKey}
      client={change === 'client' ? { other: true } as never : props.client}
      projectId={change === 'project' ? 881 : props.projectId}
      canManage={change !== 'permission'} archived={change === 'archived'}
      documents={change === 'removed' ? [] : change === 'source' ? [{ ...document, sourceKey: 'source-2' }] : props.documents}>{action}</ProjectDocumentDeletionProvider>);
    await act(async () => pending.resolve(deletion()));
    expect(props.onDeleted).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('hides destructive controls for readers, archived projects and unknown documents', () => {
    const view = render(<ProjectDocumentDeletionProvider {...props} canManage={false}>{action}</ProjectDocumentDeletionProvider>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    view.rerender(<ProjectDocumentDeletionProvider {...props} archived>{action}</ProjectDocumentDeletionProvider>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    view.rerender(<ProjectDocumentDeletionProvider {...props} documents={[]}>{action}</ProjectDocumentDeletionProvider>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(mocks.snapshot).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
