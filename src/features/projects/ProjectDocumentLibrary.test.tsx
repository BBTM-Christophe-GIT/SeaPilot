import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectDocumentLibrary } from './ProjectDocumentLibrary';
import { ProjectSeaOperationDocumentCheckbox } from './ProjectSeaOperationDocuments';
import { ProjectDocumentCategoryAction } from './ProjectDocumentClassificationEditor';
import type { ProjectDocumentCategory } from './projectDocumentCategories';
import type { ProjectOperationDocumentRecord } from './projectQueries';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), save: vi.fn(), store: vi.fn(), selectionFetch: vi.fn(), selectionSave: vi.fn(), classify: vi.fn() }));
vi.mock('./projectDocumentClassification', () => ({ saveProjectDocumentClassification: mocks.classify }));
vi.mock('./projectDocumentCategories', async (original) => ({
  ...await original<typeof import('./projectDocumentCategories')>(),
  fetchProjectDocumentCategories: mocks.fetch,
  saveProjectDocumentCategories: mocks.save,
}));
vi.mock('./projectDocumentStorage', () => ({ storeProjectAttachment: mocks.store }));
vi.mock('./projectSeaOperationDocumentsQueries', () => ({
  fetchProjectSeaOperationDocuments: mocks.selectionFetch,
  saveProjectSeaOperationDocument: mocks.selectionSave,
}));

const categories: ProjectDocumentCategory[] = [
  { active: true, displayOrder: 10, key: 'hse', label: 'HSE', parentKey: null },
  { active: true, displayOrder: 11, key: 'hse_audits', label: 'Audits', parentKey: 'hse' },
  { active: true, displayOrder: 20, key: 'billing', label: 'Facturation', parentKey: null },
  { active: false, displayOrder: 30, key: 'archive', label: 'Dossier technique', parentKey: null },
];
const attachment: ProjectOperationDocumentRecord = {
  categoryKey: 'hse', createdAt: '2026-10-14T12:00:00Z', documentType: 'project_attachment', expiresOn: '',
  fileName: 'audit.pdf', fileSizeBytes: 20, id: 77, mimeType: 'application/pdf', planningOccurrenceId: null,
  projectId: 880, sharePointFolderPath: '', sharePointWebUrl: '', storageBucket: 'project-files',
  storagePath: 'projects/880/attachments/hse/audit.pdf', subcategoryKey: 'hse_audits',
};
const props = {
  accessKey: 'user-a', attachments: [attachment, { ...attachment, id: 78, categoryKey: 'archive', fileName: 'historique.pdf', subcategoryKey: '' }],
  canManage: true, client: {} as never, contractDocuments: [], onStored: vi.fn(), projectDocuments: [], projectId: 880,
  renderDocuments: (documents: { attachments: ProjectOperationDocumentRecord[] }, labels: ReadonlyMap<string, string>) => <ul>{documents.attachments.map((document) => <li key={document.id}>{document.fileName} · {labels.get(document.categoryKey || '')}</li>)}</ul>,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function openUpload() {
  const button = await screen.findByRole('button', { name: 'Ajouter un document' });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  const dialog = screen.getByRole('dialog', { name: 'Ajouter un document' });
  fireEvent.change(within(dialog).getByLabelText('Fichier'), { target: { files: [new File(['%PDF'], 'preuve.pdf', { type: 'application/pdf' })] } });
  return dialog;
}

describe('ProjectDocumentLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetch.mockResolvedValue(categories.map((category) => ({ ...category })));
    mocks.save.mockResolvedValue(undefined);
    mocks.store.mockResolvedValue({ id: 91, fileName: 'preuve.pdf', folderPath: 'projects/880/attachments/hse', storageBucket: 'project-files', storagePath: 'projects/880/attachments/hse/proof.pdf', webUrl: '' });
    mocks.selectionFetch.mockResolvedValue({ configured: false, documents: [] });
    mocks.selectionSave.mockResolvedValue({ configured: true, documents: [] });
    mocks.classify.mockImplementation(async (_client, input) => ({ projectId: input.projectId, documentId: input.documentId, categoryKey: input.categoryKey, subcategoryKey: input.subcategoryKey }));
  });

  it('reclassifies an existing attachment, refreshes its filter and operational eligibility without selecting it', async () => {
    mocks.selectionFetch.mockResolvedValue({ configured: true, documents: [{
      id: 'generated:77', projectId: '880', title: 'audit.pdf', fileName: 'audit.pdf', mimeType: 'application/pdf',
      categoryLabel: 'HSE', subcategoryLabel: 'Audits', createdAt: attachment.createdAt, expiresOn: null, selected: true,
    }] });
    const onClassified = vi.fn();
    render(<ProjectDocumentLibrary {...props} onClassified={onClassified} renderDocuments={(documents, labels) => <ul>{documents.attachments.map(document => <li key={document.id}>
      {document.fileName} · {labels.get(document.categoryKey || '')}
      <ProjectDocumentCategoryAction documentId={`generated:${document.id}`} />
      <ProjectSeaOperationDocumentCheckbox documentId={`generated:${document.id}`} documentName={document.fileName} />
    </li>)}</ul>} />);
    const action = await screen.findByRole('button', { name: 'Modifier la catégorie de audit.pdf' });
    await waitFor(() => expect(action).toBeEnabled());
    expect(await screen.findByRole('checkbox', { name: 'Afficher audit.pdf dans Opération en Mer' })).toBeChecked();
    const refreshesBeforeClassification = mocks.selectionFetch.mock.calls.length;
    fireEvent.change(screen.getByLabelText('Catégorie'), { target: { value: 'hse' } });
    fireEvent.click(action);
    const dialog = screen.getByRole('dialog', { name: 'Modifier la catégorie' });
    fireEvent.change(within(dialog).getByLabelText('Catégorie'), { target: { value: 'billing' } });
    mocks.selectionFetch.mockResolvedValue({ configured: true, documents: [] });
    fireEvent.submit(dialog);
    await screen.findByText('La catégorie du document « audit.pdf » a été enregistrée.');
    expect(onClassified).toHaveBeenCalledExactlyOnceWith({ projectId: 880, documentId: 'generated:77', categoryKey: 'billing', subcategoryKey: null });
    expect(screen.getByText('Aucun document dans cette catégorie.')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Catégorie'), { target: { value: 'billing' } });
    expect(screen.getByText('audit.pdf · Facturation')).toBeVisible();
    await waitFor(() => expect(mocks.selectionFetch).toHaveBeenCalledTimes(refreshesBeforeClassification + 1));
    expect(screen.queryByRole('checkbox', { name: 'Afficher audit.pdf dans Opération en Mer' })).not.toBeInTheDocument();
    expect(mocks.selectionSave).not.toHaveBeenCalled();
    expect(attachment.categoryKey).toBe('hse');
    expect(attachment.storagePath).toBe('projects/880/attachments/hse/audit.pdf');
  });

  it('does not expose classification actions for folders or unresolved project links', async () => {
    const unresolved = { ...attachment, projectId: null, isFolder: false, title: 'Ancien document' };
    const folder = { ...unresolved, id: 91, projectId: 880, isFolder: true };
    render(<ProjectDocumentLibrary {...props} attachments={[]} projectDocuments={[unresolved, folder] as never} renderDocuments={documents => <>
      {documents.projectDocuments.map(document => <ProjectDocumentCategoryAction key={document.id} documentId={`project:${document.id}`} />)}
    </>} />);
    await screen.findByRole('option', { name: 'HSE' });
    expect(screen.queryByRole('button', { name: /Modifier la catégorie de/ })).not.toBeInTheDocument();
    expect(mocks.classify).not.toHaveBeenCalled();
  });

  it('uploads through the existing private attachment workflow with its classification and optional date', async () => {
    render(<ProjectDocumentLibrary {...props} />);
    const dialog = await openUpload();
    fireEvent.change(within(dialog).getByLabelText('Sous-catégorie'), { target: { value: 'hse_audits' } });
    fireEvent.change(within(dialog).getByLabelText('Date d’échéance (facultative)'), { target: { value: '2027-04-10' } });
    fireEvent.submit(dialog);
    await screen.findByText(/Le document « preuve.pdf » a été ajouté/);
    expect(mocks.fetch).toHaveBeenCalledWith(props.client, { includeInactive: true });
    expect(mocks.store).toHaveBeenCalledWith(props.client, { projectId: 880, draft: expect.objectContaining({ categoryKey: 'hse', expiresOn: '2027-04-10', file: expect.any(File), subcategoryKey: 'hse_audits' }) });
    expect(props.onStored).toHaveBeenCalledWith(expect.objectContaining({ id: 91, documentType: 'project_attachment', projectId: 880, categoryKey: 'hse', subcategoryKey: 'hse_audits', expiresOn: '2027-04-10', storagePath: 'projects/880/attachments/hse/proof.pdf' }));
  });

  it('locks immediately against double submission and changing inputs while upload is pending', async () => {
    const pending = deferred<never>(); mocks.store.mockReturnValue(pending.promise);
    render(<ProjectDocumentLibrary {...props} />);
    const dialog = await openUpload();
    act(() => { fireEvent.submit(dialog); fireEvent.submit(dialog); });
    expect(mocks.store).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByLabelText('Fichier')).toBeDisabled();
    expect(within(dialog).getByLabelText('Catégorie')).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Annuler' })).toBeDisabled();
    await act(async () => pending.reject(new Error('Enregistrement non confirmé, vérifiez le document.')));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Enregistrement non confirmé');
    expect(within(dialog).getByLabelText('Fichier')).toBeEnabled();
    expect(props.onStored).not.toHaveBeenCalled();
  });

  it.each(['project', 'client', 'account', 'permission', 'archived', 'unmount'])('ignores a late upload response after %s changes', async (change) => {
    const pending = deferred<unknown>(); mocks.store.mockReturnValue(pending.promise);
    const view = render(<ProjectDocumentLibrary {...props} />);
    const dialog = await openUpload(); fireEvent.submit(dialog);
    if (change === 'unmount') view.unmount();
    else view.rerender(<ProjectDocumentLibrary {...props} archived={change === 'archived'} projectId={change === 'project' ? 881 : 880} client={change === 'client' ? { different: true } as never : props.client} accessKey={change === 'account' ? 'user-b' : props.accessKey} canManage={change !== 'permission'} />);
    await act(async () => pending.resolve({ id: 91, fileName: 'preuve.pdf', folderPath: '', storageBucket: 'project-files', storagePath: 'projects/880/a.pdf', webUrl: '' }));
    expect(props.onStored).not.toHaveBeenCalled();
    expect(screen.queryByText(/a été ajouté au projet/)).not.toBeInTheDocument();
  });

  it('filters archived classifications without offering them for new uploads', async () => {
    render(<ProjectDocumentLibrary {...props} />);
    await screen.findByRole('option', { name: 'Dossier technique (retirée)' });
    fireEvent.change(screen.getByLabelText('Catégorie'), { target: { value: 'archive' } });
    expect(screen.getByText(/historique.pdf · Dossier technique/)).toBeVisible();
    expect(screen.queryByText(/audit.pdf/)).not.toBeInTheDocument();
    const dialog = await openUpload();
    expect(within(dialog).queryByRole('option', { name: /Dossier technique/ })).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Catégorie'), { target: { value: 'billing' } });
    expect(within(dialog).queryByLabelText('Sous-catégorie')).not.toBeInTheDocument();
  });

  it('renames, creates and retires common catalogue entries while keeping historical rows', async () => {
    const user = userEvent.setup(); render(<ProjectDocumentLibrary {...props} />);
    const manage = screen.getByRole('button', { name: 'Gérer les catégories' });
    await waitFor(() => expect(manage).toBeEnabled()); await user.click(manage);
    const dialog = screen.getByRole('dialog', { name: 'Catégories communes aux projets' });
    fireEvent.change(within(dialog).getByLabelText('Nom de la catégorie HSE'), { target: { value: 'Sécurité' } });
    await user.click(within(dialog).getByRole('button', { name: 'Retirer la catégorie Facturation' }));
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter une catégorie' }));
    fireEvent.change(within(dialog).getByLabelText('Nom de la catégorie Nouvelle catégorie'), { target: { value: 'Livrables' } });
    await user.click(within(dialog).getByRole('button', { name: /Ajouter une sous-catégorie\s*:\s*Sécurité/ }));
    fireEvent.change(within(dialog).getByLabelText('Nom de la sous-catégorie Nouvelle sous-catégorie'), { target: { value: 'Rapports' } });
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer les catégories' }));
    await screen.findByText(/Les catégories communes aux projets ont été enregistrées/);
    expect(mocks.save).toHaveBeenCalledWith(props.client, expect.arrayContaining([
      expect.objectContaining({ key: 'hse', label: 'Sécurité', active: true }),
      expect.objectContaining({ key: 'billing', active: false }),
      expect.objectContaining({ key: 'archive', label: 'Dossier technique', active: false }),
      expect.objectContaining({ label: 'Livrables', parentKey: null }),
      expect.objectContaining({ label: 'Rapports', parentKey: 'hse' }),
    ]));
    expect(screen.getByText(/audit.pdf · Sécurité/)).toBeVisible();
    expect(screen.getByText(/historique.pdf · Dossier technique/)).toBeVisible();
  });

  it('refreshes operational eligibility after renaming HSE to Contrats without removing the project document', async () => {
    mocks.selectionFetch.mockResolvedValue({ configured: false, documents: [{
      id: 'generated:77', projectId: '880', title: 'audit.pdf', fileName: 'audit.pdf', mimeType: 'application/pdf',
      categoryLabel: 'HSE', subcategoryLabel: 'Audits', createdAt: attachment.createdAt, expiresOn: null, selected: false,
    }] });
    const user = userEvent.setup();
    render(<ProjectDocumentLibrary {...props} renderDocuments={(documents, labels) => <ul>{documents.attachments.map(document => <li key={document.id}>
      <ProjectSeaOperationDocumentCheckbox documentId={`generated:${document.id}`} documentName={document.fileName} />
      {document.fileName} · {labels.get(document.categoryKey || '')}
    </li>)}</ul>} />);
    const manage = screen.getByRole('button', { name: 'Gérer les catégories' });
    await waitFor(() => expect(manage).toBeEnabled());
    expect(await screen.findByRole('checkbox', { name: 'Afficher audit.pdf dans Opération en Mer' })).not.toBeChecked();
    const fetchesBeforeRename = mocks.selectionFetch.mock.calls.length;
    await user.click(manage);
    const dialog = screen.getByRole('dialog', { name: 'Catégories communes aux projets' });
    fireEvent.change(within(dialog).getByLabelText('Nom de la catégorie HSE'), { target: { value: 'Contrats' } });
    mocks.selectionFetch.mockResolvedValue({ configured: false, documents: [] });
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer les catégories' }));
    await screen.findByText('Les catégories communes aux projets ont été enregistrées.');
    await waitFor(() => expect(mocks.selectionFetch).toHaveBeenCalledTimes(fetchesBeforeRename + 1));
    expect(mocks.selectionFetch).toHaveBeenLastCalledWith(props.client, 880);
    expect(screen.queryByRole('checkbox', { name: 'Afficher audit.pdf dans Opération en Mer' })).not.toBeInTheDocument();
    expect(screen.getByText(/audit.pdf · Contrats/)).toBeVisible();
    expect(mocks.selectionSave).not.toHaveBeenCalled();
  });

  it('retires children with their parent without removing classified documents', async () => {
    render(<ProjectDocumentLibrary {...props} />);
    const manage = screen.getByRole('button', { name: 'Gérer les catégories' });
    await waitFor(() => expect(manage).toBeEnabled()); fireEvent.click(manage);
    fireEvent.click(screen.getByRole('button', { name: 'Retirer la catégorie HSE' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les catégories' }));
    await screen.findByRole('option', { name: 'HSE (retirée)' });
    expect(mocks.save).toHaveBeenCalledWith(props.client, expect.arrayContaining([expect.objectContaining({ key: 'hse', active: false }), expect.objectContaining({ key: 'hse_audits', active: false })]));
    expect(screen.getByText(/audit.pdf · HSE/)).toBeVisible();
  });

  it('keeps document reads available and does not invent an upload catalogue after a server refusal', async () => {
    mocks.fetch.mockRejectedValue(new Error('Catalogue inaccessible pour ce compte.'));
    render(<ProjectDocumentLibrary {...props} />);
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Ajouter un document' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Gérer les catégories' })).toBeDisabled();
    expect(screen.getByText(/audit.pdf/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Réessayer les catégories' })).toBeEnabled();
    expect(mocks.store).not.toHaveBeenCalled();
  });

  it('keeps the catalogue dialog and edited values after a rejected save', async () => {
    mocks.save.mockRejectedValue(new Error('Le nom est utilisé plusieurs fois au même niveau.'));
    render(<ProjectDocumentLibrary {...props} />);
    const manage = screen.getByRole('button', { name: 'Gérer les catégories' });
    await waitFor(() => expect(manage).toBeEnabled()); fireEvent.click(manage);
    fireEvent.change(screen.getByLabelText('Nom de la catégorie HSE'), { target: { value: 'Facturation' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les catégories' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Le nom est utilisé plusieurs fois');
    expect(screen.getByRole('dialog', { name: 'Catégories communes aux projets' })).toBeVisible();
    expect(screen.getByText(/audit.pdf · HSE/)).toBeVisible();
  });

  it('hides write controls for read-only profiles while preserving filters and documents', async () => {
    render(<ProjectDocumentLibrary {...props} canManage={false} />);
    await screen.findByRole('option', { name: 'HSE' });
    expect(screen.queryByRole('button', { name: 'Ajouter un document' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gérer les catégories' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Catégorie'), { target: { value: 'hse' } });
    fireEvent.change(screen.getByLabelText('Sous-catégorie'), { target: { value: 'hse_audits' } });
    expect(screen.getByText(/audit.pdf/)).toBeVisible();
    expect(screen.queryByText(/historique.pdf/)).not.toBeInTheDocument();
  });

  it('ignores late catalogue save errors after the account changes', async () => {
    const pending = deferred<void>(); mocks.save.mockReturnValue(pending.promise);
    const view = render(<ProjectDocumentLibrary {...props} />);
    const manage = screen.getByRole('button', { name: 'Gérer les catégories' });
    await waitFor(() => expect(manage).toBeEnabled()); fireEvent.click(manage);
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les catégories' }));
    view.rerender(<ProjectDocumentLibrary {...props} accessKey="user-b" />);
    await act(async () => pending.reject(new Error('Erreur ancienne')));
    expect(screen.queryByText('Erreur ancienne')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('allows catalogue creation but refuses uploads when the real catalogue is empty', async () => {
    mocks.fetch.mockResolvedValue([]);
    render(<ProjectDocumentLibrary {...props} />);
    await screen.findByText('Ajoutez une catégorie pour classer un document.');
    expect(screen.getByRole('button', { name: 'Ajouter un document' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Gérer les catégories' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Gérer les catégories' }));
    expect(screen.queryByRole('textbox', { name: 'Nom de la catégorie HSE' })).not.toBeInTheDocument();
  });

  it('counts and displays existing issued and operation documents without duplicating attachments', async () => {
    const renderDocuments = vi.fn(() => <p>Documents existants</p>);
    render(<ProjectDocumentLibrary {...props} otherDocuments={[{ ...attachment, id: 80, documentType: 'offer', categoryKey: '', planningOccurrenceId: 1201 }]} renderDocuments={renderDocuments} />);
    await screen.findByRole('option', { name: 'HSE' });
    expect(screen.getByText('3 documents')).toBeVisible();
    expect(renderDocuments).toHaveBeenLastCalledWith(expect.objectContaining({ attachments: expect.arrayContaining([expect.objectContaining({ id: 77 }), expect.objectContaining({ id: 78 })]), otherDocuments: [expect.objectContaining({ id: 80 })] }), expect.any(Map));
  });

  it('keeps an archived project readable and the shared catalogue manageable while refusing new uploads', async () => {
    render(<ProjectDocumentLibrary {...props} archived />);
    const manage = screen.getByRole('button', { name: 'Gérer les catégories' });
    await waitFor(() => expect(manage).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Ajouter un document' })).toBeDisabled();
    expect(screen.getByText(/Ce dossier clôturé est consultable/)).toBeVisible();
    expect(screen.getByText(/audit.pdf/)).toBeVisible();
    expect(mocks.store).not.toHaveBeenCalled();
  });
});
