import type { SupabaseClient } from '@supabase/supabase-js';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectSeaOperationDocuments } from './ProjectSeaOperationDocuments';
import type { ProjectSeaOperationDocumentSelection } from './projectSeaOperationDocumentsQueries';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), save: vi.fn() }));
vi.mock('./projectSeaOperationDocumentsQueries', () => ({ fetchProjectSeaOperationDocuments: mocks.fetch, saveProjectSeaOperationDocuments: mocks.save }));

const client = {} as SupabaseClient;
const props = { accessKey: 'manager-a', archived: false, canManage: true, client, projectId: 880 };
const document = {
  id: 'generated:41', projectId: '880', title: 'Procédure du chantier', fileName: 'procedure.pdf', mimeType: 'application/pdf',
  categoryLabel: 'HSE', subcategoryLabel: 'Procédure', createdAt: '2026-10-22T08:00:00Z', expiresOn: null, selected: true,
};
const catalog = (overrides: Partial<ProjectSeaOperationDocumentSelection> = {}): ProjectSeaOperationDocumentSelection => ({
  configured: false,
  documents: [{ ...document }, { ...document, id: 'project:42', title: 'Plan de prévention', fileName: 'plan.pdf' }],
  ...overrides,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function openSelection() {
  fireEvent.click(screen.getByRole('button', { name: 'Documents pour Opération en Mer' }));
  const dialog = screen.getByRole('dialog', { name: 'Documents pour Opération en Mer' });
  await within(dialog).findByRole('checkbox', { name: /Procédure du chantier/ });
  return dialog;
}
const changedProps = (change: string) => ({
  ...props,
  accessKey: change === 'account' ? 'manager-b' : props.accessKey,
  archived: change === 'archived',
  canManage: change !== 'permission',
  client: change === 'client' ? { changedClient: true } as unknown as SupabaseClient : props.client,
  projectId: change === 'project' ? 881 : props.projectId,
});

describe('ProjectSeaOperationDocuments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetch.mockResolvedValue(catalog());
    mocks.save.mockResolvedValue(catalog({ configured: true }));
  });

  it('loads only when opened, preserves the legacy selection, and stores checked document IDs', async () => {
    const user = userEvent.setup();
    render(<ProjectSeaOperationDocuments {...props} />);
    expect(mocks.fetch).not.toHaveBeenCalled();
    const dialog = await openSelection();
    expect(mocks.fetch).toHaveBeenCalledWith(client, 880);
    expect(within(dialog).getByRole('checkbox', { name: /Procédure du chantier/ })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: /Plan de prévention/ })).toBeChecked();
    expect(within(dialog).getByRole('status')).toHaveTextContent('2 documents sélectionnés sur 2');
    await user.click(within(dialog).getByRole('checkbox', { name: /Plan de prévention/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer la sélection' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mocks.save).toHaveBeenCalledWith(client, 880, ['generated:41']);
    expect(screen.getByRole('status')).toHaveTextContent('Sélection enregistrée.');
  });

  it('can explicitly save the legacy all-selected catalog without changing a checkbox', async () => {
    render(<ProjectSeaOperationDocuments {...props} />);
    const dialog = await openSelection();
    expect(within(dialog).getByRole('button', { name: 'Enregistrer la sélection' })).toBeEnabled();
    fireEvent.submit(dialog);
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(client, 880, ['generated:41', 'project:42']));
  });

  it('saves an explicit empty selection instead of returning to automatic legacy visibility', async () => {
    render(<ProjectSeaOperationDocuments {...props} />);
    const dialog = await openSelection();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tout désélectionner' }));
    expect(within(dialog).getByRole('status')).toHaveTextContent('0 document sélectionné sur 2');
    fireEvent.submit(dialog);
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(client, 880, []));
  });

  it('keeps newly added documents unchecked in a configured project until the user selects them', async () => {
    mocks.fetch.mockResolvedValue(catalog({ configured: true, documents: [{ ...document, selected: true }, { ...document, id: 'project:42', title: 'Nouveau plan', selected: false }] }));
    render(<ProjectSeaOperationDocuments {...props} />);
    const dialog = await openSelection();
    expect(within(dialog).getByRole('checkbox', { name: /Nouveau plan/ })).not.toBeChecked();
    expect(within(dialog).getByRole('button', { name: 'Enregistrer la sélection' })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Nouveau plan/ }));
    fireEvent.submit(dialog);
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(client, 880, ['generated:41', 'project:42']));
  });

  it('shows a configured empty allow-list without silently selecting its documents', async () => {
    mocks.fetch.mockResolvedValue(catalog({ configured: true, documents: catalog().documents.map(item => ({ ...item, selected: false })) }));
    render(<ProjectSeaOperationDocuments {...props} />);
    const dialog = await openSelection();
    expect(within(dialog).getAllByRole('checkbox').every(item => !(item as HTMLInputElement).checked)).toBe(true);
    expect(within(dialog).getByRole('button', { name: 'Enregistrer la sélection' })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tout sélectionner' }));
    expect(within(dialog).getAllByRole('checkbox').every(item => (item as HTMLInputElement).checked)).toBe(true);
  });

  it('can explicitly configure an empty catalog before any eligible document exists', async () => {
    mocks.fetch.mockResolvedValue(catalog({ documents: [] }));
    render(<ProjectSeaOperationDocuments {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Documents pour Opération en Mer' }));
    const dialog = screen.getByRole('dialog', { name: 'Documents pour Opération en Mer' });
    await within(dialog).findByText('Aucun document éligible dans ce projet.');
    fireEvent.submit(dialog);
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(client, 880, []));
  });

  it('does not offer editing to a non-manager and disables it for a closed project', () => {
    const view = render(<ProjectSeaOperationDocuments {...props} canManage={false} />);
    expect(screen.queryByRole('button', { name: 'Documents pour Opération en Mer' })).not.toBeInTheDocument();
    view.rerender(<ProjectSeaOperationDocuments {...props} archived />);
    expect(screen.getByRole('button', { name: 'Documents pour Opération en Mer' })).toBeDisabled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('keeps saving disabled during a load refusal and retries only the management catalog', async () => {
    mocks.fetch.mockRejectedValueOnce({ code: '42501', message: 'Gestion documentaire interdite.' }).mockResolvedValueOnce(catalog());
    render(<ProjectSeaOperationDocuments {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Documents pour Opération en Mer' }));
    const dialog = screen.getByRole('dialog', { name: 'Documents pour Opération en Mer' });
    await within(dialog).findByText('Gestion documentaire interdite.');
    expect(within(dialog).getByRole('button', { name: 'Enregistrer la sélection' })).toBeDisabled();
    expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();
    fireEvent.submit(dialog);
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Réessayer les documents' }));
    await within(dialog).findByRole('checkbox', { name: /Procédure du chantier/ });
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.fetch).toHaveBeenNthCalledWith(2, client, 880);
  });

  it('does not submit until the catalog has loaded', async () => {
    const pending = deferred<ProjectSeaOperationDocumentSelection>();
    mocks.fetch.mockReturnValue(pending.promise);
    render(<ProjectSeaOperationDocuments {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Documents pour Opération en Mer' }));
    const dialog = screen.getByRole('dialog', { name: 'Documents pour Opération en Mer' });
    expect(within(dialog).getByRole('button', { name: 'Enregistrer la sélection' })).toBeDisabled();
    fireEvent.submit(dialog);
    expect(mocks.save).not.toHaveBeenCalled();
    await act(async () => pending.resolve(catalog()));
  });

  it('cancelling discards local changes and reloads the saved selection on reopening', async () => {
    render(<ProjectSeaOperationDocuments {...props} />);
    let dialog = await openSelection();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tout désélectionner' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    expect(mocks.save).not.toHaveBeenCalled();
    dialog = await openSelection();
    expect(within(dialog).getByRole('checkbox', { name: /Procédure du chantier/ })).toBeChecked();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it('locks synchronously against duplicate saves and prevents closing or editing during the request', async () => {
    const pending = deferred<ProjectSeaOperationDocumentSelection>();
    mocks.save.mockReturnValue(pending.promise);
    render(<ProjectSeaOperationDocuments {...props} />);
    const dialog = await openSelection();
    act(() => { fireEvent.submit(dialog); fireEvent.submit(dialog); });
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(dialog).toHaveAttribute('aria-busy', 'true');
    expect(within(dialog).getAllByRole('checkbox').every(item => (item as HTMLInputElement).disabled)).toBe(true);
    expect(within(dialog).getByRole('button', { name: 'Annuler' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Fermer' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Tout sélectionner' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Tout désélectionner' })).toBeDisabled();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await act(async () => pending.resolve(catalog({ configured: true })));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('retains the checked selection and permits retry when the server refuses a save', async () => {
    mocks.save.mockRejectedValueOnce({ code: '42501', message: 'La sélection ne peut pas être enregistrée.' }).mockResolvedValueOnce(catalog({ configured: true }));
    render(<ProjectSeaOperationDocuments {...props} />);
    const dialog = await openSelection();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Plan de prévention/ }));
    fireEvent.submit(dialog);
    await within(dialog).findByText('La sélection ne peut pas être enregistrée.');
    expect(within(dialog).getByRole('checkbox', { name: /Plan de prévention/ })).not.toBeChecked();
    expect(within(dialog).getByRole('button', { name: 'Enregistrer la sélection' })).toBeEnabled();
    expect(screen.queryByText('Sélection enregistrée.')).not.toBeInTheDocument();
    fireEvent.submit(dialog);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mocks.save).toHaveBeenNthCalledWith(2, client, 880, ['generated:41']);
  });

  it.each(['project', 'client', 'account', 'permission', 'archived', 'unmount'])('ignores a late catalog after %s changes', async change => {
    const pending = deferred<ProjectSeaOperationDocumentSelection>();
    mocks.fetch.mockReturnValue(pending.promise);
    const view = render(<ProjectSeaOperationDocuments {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Documents pour Opération en Mer' }));
    if (change === 'unmount') view.unmount();
    else view.rerender(<ProjectSeaOperationDocuments {...changedProps(change)} />);
    await act(async () => pending.resolve(catalog()));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Procédure du chantier/ })).not.toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it.each(['project', 'client', 'account', 'permission', 'archived', 'unmount'])('ignores a late save after %s changes without announcing success in another context', async change => {
    const pending = deferred<ProjectSeaOperationDocumentSelection>();
    mocks.save.mockReturnValue(pending.promise);
    const view = render(<ProjectSeaOperationDocuments {...props} />);
    const dialog = await openSelection();
    fireEvent.submit(dialog);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    if (change === 'unmount') view.unmount();
    else view.rerender(<ProjectSeaOperationDocuments {...changedProps(change)} />);
    await act(async () => pending.resolve(catalog({ configured: true })));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Sélection enregistrée.')).not.toBeInTheDocument();
  });
});
