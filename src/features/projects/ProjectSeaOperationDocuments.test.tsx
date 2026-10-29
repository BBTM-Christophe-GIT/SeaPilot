import type { SupabaseClient } from '@supabase/supabase-js';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectSeaOperationDocumentCheckbox, ProjectSeaOperationDocuments } from './ProjectSeaOperationDocuments';
import type { ProjectSeaOperationDocumentSelection } from './projectSeaOperationDocumentsQueries';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), save: vi.fn() }));
vi.mock('./projectSeaOperationDocumentsQueries', () => ({ fetchProjectSeaOperationDocuments: mocks.fetch, saveProjectSeaOperationDocument: mocks.save }));

const client = {} as SupabaseClient;
const props = { accessKey: 'manager-a', archived: false, canManage: true, client, projectId: 880, refreshKey: 'files-a' };
const document = {
  id: 'generated:41', projectId: '880', title: 'Procédure du chantier', fileName: 'procedure.pdf', mimeType: 'application/pdf',
  categoryLabel: 'HSE', subcategoryLabel: 'Procédure', createdAt: '2026-10-22T08:00:00Z', expiresOn: null, selected: false,
};
const catalog = (overrides: Partial<ProjectSeaOperationDocumentSelection> = {}): ProjectSeaOperationDocumentSelection => ({
  configured: false,
  documents: [{ ...document }, { ...document, id: 'project:42', title: 'Plan de prévention', fileName: 'plan.pdf' }],
  ...overrides,
});
const selectedCatalog = (ids: readonly string[]) => catalog({ configured: true, documents: catalog().documents.map(item => ({ ...item, selected: ids.includes(item.id) })) });
function Harness(overrides: Partial<typeof props>) {
  return <ProjectSeaOperationDocuments {...props} {...overrides}>
    <ul>{[
      ['generated:41', 'Procédure du chantier'], ['project:42', 'Plan de prévention'],
      ['generated:43', 'Nouveau rapport'], ['generated:99', 'Offre commerciale'],
    ].map(([id, name]) => <li key={id}><a href={`#${id}`}>{name}</a><ProjectSeaOperationDocumentCheckbox documentId={id} documentName={name} /></li>)}</ul>
  </ProjectSeaOperationDocuments>;
}
const first = () => screen.getByRole('checkbox', { name: 'Afficher Procédure du chantier dans Opération en Mer' });
const second = () => screen.getByRole('checkbox', { name: 'Afficher Plan de prévention dans Opération en Mer' });
const load = () => screen.findByRole('checkbox', { name: 'Afficher Procédure du chantier dans Opération en Mer' });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const changedProps = (change: string) => ({
  ...props, accessKey: change === 'account' ? 'manager-b' : props.accessKey,
  archived: change === 'archived', canManage: change !== 'permission',
  client: change === 'client' ? { changedClient: true } as unknown as SupabaseClient : props.client,
  projectId: change === 'project' ? 881 : props.projectId, refreshKey: change === 'refresh' ? 'files-b' : props.refreshKey,
});

describe('ProjectSeaOperationDocuments inline checkboxes', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.fetch.mockResolvedValue(catalog()); mocks.save.mockResolvedValue(selectedCatalog(['generated:41']));
  });

  it('loads automatically, leaves eligible documents unchecked by default, and saves a click without a modal', async () => {
    const user = userEvent.setup(); render(<Harness />);
    expect(mocks.fetch).toHaveBeenCalledWith(client, 880);
    await load(); expect(first()).not.toBeChecked(); expect(second()).not.toBeChecked();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Documents pour Opération en Mer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Enregistrer la sélection/ })).not.toBeInTheDocument();
    await user.click(first());
    expect(mocks.save).toHaveBeenCalledWith(client, 880, 'generated:41', true);
    await screen.findByText('Sélection enregistrée.'); expect(first()).toBeChecked(); expect(second()).not.toBeChecked();
  });

  it('only exposes server-catalogued checkboxes while preserving document links and content', async () => {
    render(<Harness />); await load();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Offre commerciale' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Nouveau rapport' })).toBeVisible();
    expect(screen.queryByRole('checkbox', { name: /Offre commerciale|Nouveau rapport/ })).not.toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('optimistically unchecks only the clicked document, locks every checkbox, and prevents duplicate writes', async () => {
    const pending = deferred<ProjectSeaOperationDocumentSelection>(); mocks.fetch.mockResolvedValue(selectedCatalog(['generated:41', 'project:42']));
    mocks.save.mockReturnValue(pending.promise); render(<Harness />); await load();
    act(() => { fireEvent.click(first()); fireEvent.click(first()); });
    expect(mocks.save).toHaveBeenCalledTimes(1); expect(mocks.save).toHaveBeenCalledWith(client, 880, 'generated:41', false);
    expect(first()).not.toBeChecked(); expect(second()).toBeChecked();
    expect(first()).toBeDisabled(); expect(second()).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Enregistrement de la sélection…');
    fireEvent.click(second()); expect(mocks.save).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(selectedCatalog(['project:42'])));
    expect(first()).not.toBeChecked(); expect(second()).toBeChecked(); expect(first()).toBeEnabled(); expect(second()).toBeEnabled();
  });

  it('reloads after an upload refresh and leaves a newly eligible document unchecked', async () => {
    mocks.fetch.mockResolvedValueOnce(selectedCatalog(['generated:41']));
    const view = render(<Harness />); await load(); expect(first()).toBeChecked();
    mocks.fetch.mockResolvedValue(catalog({ configured: true, documents: [...selectedCatalog(['generated:41']).documents, { ...document, id: 'generated:43', title: 'Nouveau rapport', selected: false }] }));
    view.rerender(<Harness refreshKey="files-b" />);
    const added = await screen.findByRole('checkbox', { name: 'Afficher Nouveau rapport dans Opération en Mer' });
    expect(added).not.toBeChecked(); expect(first()).toBeChecked(); expect(mocks.fetch).toHaveBeenCalledTimes(2); expect(mocks.save).not.toHaveBeenCalled();
  });

  it('preserves a configured empty selection and never creates fallback checkboxes for an empty catalog', async () => {
    mocks.fetch.mockResolvedValueOnce(selectedCatalog([])).mockResolvedValueOnce(catalog({ configured: true, documents: [] }));
    const view = render(<Harness />); await load(); expect(first()).not.toBeChecked(); expect(second()).not.toBeChecked();
    view.rerender(<Harness refreshKey="empty" />);
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument(); expect(screen.getByRole('link', { name: 'Procédure du chantier' })).toBeVisible();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('hides write controls from non-managers and disables eligible checkboxes on an archived project', async () => {
    const view = render(<Harness canManage={false} />);
    expect(mocks.fetch).not.toHaveBeenCalled(); expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Procédure du chantier' })).toBeVisible();
    view.rerender(<Harness archived />); await load(); expect(first()).toBeDisabled(); expect(second()).toBeDisabled();
    fireEvent.click(first()); expect(mocks.save).not.toHaveBeenCalled();
  });

  it('keeps documents readable after a catalog refusal and retries the management catalog only', async () => {
    mocks.fetch.mockRejectedValueOnce({ code: '42501', message: 'Gestion documentaire interdite.' }).mockResolvedValueOnce(catalog());
    render(<Harness />); expect(await screen.findByRole('alert')).toHaveTextContent('Gestion documentaire interdite.');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument(); expect(screen.getByRole('link', { name: 'Procédure du chantier' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer les cases Opération en Mer' })); await load();
    expect(mocks.fetch).toHaveBeenCalledTimes(2); expect(mocks.fetch).toHaveBeenNthCalledWith(2, client, 880); expect(mocks.save).not.toHaveBeenCalled();
  });

  it('does not expose writable checkboxes until their catalog has loaded', async () => {
    const pending = deferred<ProjectSeaOperationDocumentSelection>(); mocks.fetch.mockReturnValue(pending.promise); render(<Harness />);
    expect(screen.getByRole('status')).toHaveTextContent('Chargement des cases Opération en Mer…'); expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled(); await act(async () => pending.resolve(catalog())); expect(first()).toBeEnabled();
  });

  it('rolls back an optimistic checkbox when saving is refused and permits a later retry', async () => {
    const pending = deferred<ProjectSeaOperationDocumentSelection>(); mocks.save.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(selectedCatalog(['generated:41']));
    render(<Harness />); await load(); fireEvent.click(first()); expect(first()).toBeChecked();
    await act(async () => pending.reject({ code: '42501', message: 'La sélection ne peut pas être enregistrée.' }));
    expect(screen.getByRole('alert')).toHaveTextContent('La sélection ne peut pas être enregistrée.');
    expect(first()).not.toBeChecked(); expect(first()).toBeEnabled(); expect(screen.queryByText('Sélection enregistrée.')).not.toBeInTheDocument();
    fireEvent.click(first()); await screen.findByText('Sélection enregistrée.'); expect(first()).toBeChecked();
    expect(mocks.save).toHaveBeenNthCalledWith(2, client, 880, 'generated:41', true);
  });

  it('can refresh authoritative server choices after a failed save without resubmitting the rejected change', async () => {
    mocks.save.mockRejectedValueOnce(new Error('Enregistrement refusé.'));
    render(<Harness />); await load(); fireEvent.click(first()); await screen.findByRole('alert');
    mocks.fetch.mockResolvedValue(selectedCatalog(['project:42']));
    fireEvent.click(screen.getByRole('button', { name: 'Actualiser les cases' })); await load();
    expect(first()).not.toBeChecked(); expect(second()).toBeChecked(); expect(mocks.save).toHaveBeenCalledTimes(1); expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it('supports selecting a document with the keyboard without opening a dialog', async () => {
    const user = userEvent.setup(); render(<Harness />); await load(); first().focus(); await user.keyboard(' ');
    await screen.findByText('Sélection enregistrée.'); expect(first()).toBeChecked(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.save).toHaveBeenCalledWith(client, 880, 'generated:41', true);
  });

  it('does not render an operational checkbox outside its project selection provider', () => {
    render(<ProjectSeaOperationDocumentCheckbox documentId="generated:41" documentName="Procédure du chantier" />);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it.each(['project', 'client', 'account', 'permission', 'archived', 'refresh', 'unmount'])('ignores a late catalog after %s changes', async change => {
    const pending = deferred<ProjectSeaOperationDocumentSelection>(), replacement = deferred<ProjectSeaOperationDocumentSelection>();
    mocks.fetch.mockReturnValueOnce(pending.promise).mockReturnValue(replacement.promise);
    const view = render(<Harness />);
    if (change === 'unmount') view.unmount(); else view.rerender(<Harness {...changedProps(change)} />);
    await act(async () => pending.resolve(selectedCatalog(['generated:41'])));
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument(); expect(screen.queryByText('Sélection enregistrée.')).not.toBeInTheDocument(); expect(mocks.save).not.toHaveBeenCalled();
    if (change !== 'unmount') view.unmount(); await act(async () => replacement.resolve(catalog()));
  });

  it.each(['project', 'client', 'account', 'permission', 'archived', 'unmount'])('ignores a late save after %s changes without applying it to the new context', async change => {
    const pending = deferred<ProjectSeaOperationDocumentSelection>(); mocks.save.mockReturnValue(pending.promise);
    const view = render(<Harness />); await load(); fireEvent.click(first()); expect(first()).toBeChecked();
    mocks.fetch.mockResolvedValue(catalog({ documents: catalog().documents.map(item => ({ ...item, projectId: change === 'project' ? '881' : '880' })) }));
    if (change === 'unmount') view.unmount(); else view.rerender(<Harness {...changedProps(change)} />);
    if (change !== 'permission' && change !== 'unmount') { await load(); expect(first()).not.toBeChecked(); }
    await act(async () => pending.resolve(selectedCatalog(['generated:41'])));
    expect(screen.queryByText('Sélection enregistrée.')).not.toBeInTheDocument();
    if (change === 'permission' || change === 'unmount') expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    else {
      expect(first()).not.toBeChecked();
      if (change === 'archived') expect(first()).toBeDisabled(); else expect(first()).toBeEnabled();
    }
  });

  it('keeps the optimistic selection locked across an upload refresh and reconciles after the pending write commits', async () => {
    const pending = deferred<ProjectSeaOperationDocumentSelection>(), reconciliation = deferred<ProjectSeaOperationDocumentSelection>();
    const uploaded = catalog({ configured: true, documents: [...catalog().documents, { ...document, id: 'generated:43', title: 'Nouveau rapport', selected: false }] });
    mocks.fetch.mockResolvedValueOnce(catalog()).mockResolvedValueOnce(uploaded).mockReturnValueOnce(reconciliation.promise);
    mocks.save.mockReturnValue(pending.promise);
    const view = render(<Harness />); await load(); fireEvent.click(first()); expect(first()).toBeChecked();
    view.rerender(<Harness refreshKey="files-b" />);
    const added = await screen.findByRole('checkbox', { name: 'Afficher Nouveau rapport dans Opération en Mer' });
    expect(first()).toBeChecked(); expect(first()).toBeDisabled(); expect(second()).toBeDisabled(); expect(added).toBeDisabled(); expect(added).not.toBeChecked();
    expect(mocks.fetch).toHaveBeenCalledTimes(2); fireEvent.click(second()); expect(mocks.save).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(selectedCatalog(['generated:41'])));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(3));
    expect(mocks.fetch).toHaveBeenNthCalledWith(3, client, 880);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Chargement des cases Opération en Mer…');
    await act(async () => reconciliation.resolve({ ...uploaded, documents: uploaded.documents.map(item => ({ ...item, selected: item.id === 'generated:41' })) }));
    expect(first()).toBeChecked(); expect(first()).toBeEnabled(); expect(second()).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Afficher Nouveau rapport dans Opération en Mer' })).not.toBeChecked();
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it('does not unlock a new project write when an old project write finishes', async () => {
    const oldSave = deferred<ProjectSeaOperationDocumentSelection>(), newSave = deferred<ProjectSeaOperationDocumentSelection>();
    mocks.save.mockReturnValueOnce(oldSave.promise).mockReturnValueOnce(newSave.promise);
    const view = render(<Harness />); await load(); fireEvent.click(first());
    mocks.fetch.mockResolvedValue(catalog({ documents: catalog().documents.map(item => ({ ...item, projectId: '881' })) }));
    view.rerender(<Harness projectId={881} />); await load(); fireEvent.click(second());
    expect(second()).toBeChecked(); expect(first()).toBeDisabled(); expect(second()).toBeDisabled();
    await act(async () => oldSave.resolve(selectedCatalog(['generated:41'])));
    expect(first()).toBeDisabled(); expect(second()).toBeDisabled(); expect(second()).toBeChecked(); expect(screen.queryByText('Sélection enregistrée.')).not.toBeInTheDocument();
    await act(async () => newSave.resolve(selectedCatalog(['project:42'])));
    expect(first()).not.toBeChecked(); expect(second()).toBeChecked(); expect(second()).toBeEnabled(); expect(mocks.save).toHaveBeenNthCalledWith(2, client, 881, 'project:42', true);
  });

  it('does not show errors from a previous project after its pending save rejects', async () => {
    const pending = deferred<ProjectSeaOperationDocumentSelection>(); mocks.save.mockReturnValue(pending.promise);
    const view = render(<Harness />); await load(); fireEvent.click(first()); view.rerender(<Harness projectId={881} />); await load();
    await act(async () => pending.reject(new Error('Refus de l’ancien projet.')));
    expect(screen.queryByText('Refus de l’ancien projet.')).not.toBeInTheDocument(); expect(first()).not.toBeChecked(); expect(first()).toBeEnabled();
  });
});
