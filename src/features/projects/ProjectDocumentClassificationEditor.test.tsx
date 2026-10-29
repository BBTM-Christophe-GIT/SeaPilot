import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectDocumentCategoryAction, ProjectDocumentClassificationEditor } from './ProjectDocumentClassificationEditor';
import type { ProjectDocumentCategory } from './projectDocumentCategories';
import type { ProjectDocumentClassification } from './projectDocumentClassification';

const save = vi.hoisted(() => vi.fn());
vi.mock('./projectDocumentClassification', () => ({ saveProjectDocumentClassification: save }));

const categories: ProjectDocumentCategory[] = [
  { key: 'hse', label: 'HSE', parentKey: null, active: true, displayOrder: 1 },
  { key: 'audits', label: 'Audits', parentKey: 'hse', active: true, displayOrder: 2 },
  { key: 'billing', label: 'Facturation', parentKey: null, active: true, displayOrder: 3 },
  { key: 'retired', label: 'Archives', parentKey: null, active: false, displayOrder: 4 },
];
const document = { documentId: 'generated:77', fileName: 'audit.pdf', categoryKey: 'hse', subcategoryKey: 'audits', sourceKey: 'source-1' };
const props = { accessKey: 'user-a', archived: false, canManage: true, categories, client: {} as never, documents: [document], onClassified: vi.fn(), projectId: 880, ready: true };
const children = <ProjectDocumentCategoryAction documentId={document.documentId} />;
const classification = (): ProjectDocumentClassification => ({ projectId: 880, documentId: document.documentId, categoryKey: 'billing', subcategoryKey: null });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  return { promise: new Promise<T>((yes, no) => { resolve = yes; reject = no; }), resolve: (value: T) => resolve(value), reject: (error: Error) => reject(error) };
}
function begin() {
  fireEvent.click(screen.getByRole('button', { name: 'Modifier la catégorie de audit.pdf' }));
  return screen.getByRole('dialog', { name: 'Modifier la catégorie' });
}
function chooseBilling(dialog: HTMLElement) { fireEvent.change(within(dialog).getByLabelText('Catégorie'), { target: { value: 'billing' } }); }

describe('Project document classification editor', () => {
  beforeEach(() => { vi.clearAllMocks(); save.mockResolvedValue(classification()); });

  it.each(['generated:77', 'project:77', 'contract:77'])('changes %s only after an explicit save with its original classification', async documentId => {
    const source = { ...document, documentId };
    const onClassified = vi.fn();
    const expected = { ...classification(), documentId };
    save.mockResolvedValue(expected);
    render(<ProjectDocumentClassificationEditor {...props} documents={[source]} onClassified={onClassified}><ProjectDocumentCategoryAction documentId={documentId} /></ProjectDocumentClassificationEditor>);
    const dialog = begin();
    expect(within(dialog).getByLabelText('Catégorie')).toHaveValue('hse');
    expect(within(dialog).getByLabelText('Sous-catégorie')).toHaveValue('audits');
    chooseBilling(dialog);
    expect(within(dialog).queryByLabelText('Sous-catégorie')).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
    fireEvent.submit(dialog);
    await screen.findByText('La catégorie du document « audit.pdf » a été enregistrée.');
    expect(save).toHaveBeenCalledExactlyOnceWith(props.client, { projectId: 880, documentId, categoryKey: 'billing', subcategoryKey: null,
      expectedCategoryKey: 'hse', expectedSubcategoryKey: 'audits' });
    expect(onClassified).toHaveBeenCalledExactlyOnceWith(expected);
  });

  it('cancels edited values and closes an unchanged classification without a server write', () => {
    render(<ProjectDocumentClassificationEditor {...props}>{children}</ProjectDocumentClassificationEditor>);
    let dialog = begin(); chooseBilling(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    dialog = begin();
    expect(within(dialog).getByLabelText('Catégorie')).toHaveValue('hse');
    fireEvent.submit(dialog);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it('keeps retired current classifications visible while requiring an active destination', () => {
    render(<ProjectDocumentClassificationEditor {...props} documents={[{ ...document, categoryKey: 'retired', subcategoryKey: null }]}>{children}</ProjectDocumentClassificationEditor>);
    const dialog = begin();
    expect(within(dialog).getByLabelText('Catégorie')).toHaveValue('retired');
    expect(within(dialog).getByRole('option', { name: 'Archives (classement actuel)' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    chooseBilling(dialog);
    expect(within(dialog).getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
  });

  it('locks a pending save against double submission and preserves edited values after a conflict', async () => {
    const pending = deferred<ProjectDocumentClassification>(); save.mockReturnValue(pending.promise);
    render(<ProjectDocumentClassificationEditor {...props}>{children}</ProjectDocumentClassificationEditor>);
    const dialog = begin(); chooseBilling(dialog);
    act(() => { fireEvent.submit(dialog); fireEvent.submit(dialog); });
    expect(save).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByLabelText('Catégorie')).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Annuler' })).toBeDisabled();
    await act(async () => pending.reject(new Error('Ce classement a été modifié. Rechargez le document.')));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Ce classement a été modifié');
    expect(within(dialog).getByLabelText('Catégorie')).toHaveValue('billing');
    expect(within(dialog).getByLabelText('Catégorie')).toBeEnabled();
    expect(props.onClassified).not.toHaveBeenCalled();
  });

  it.each(['account', 'client', 'project', 'permission', 'archived', 'source', 'classification', 'unmount'])('ignores a response after the %s changes', async change => {
    const pending = deferred<ProjectDocumentClassification>(); save.mockReturnValue(pending.promise);
    const view = render(<ProjectDocumentClassificationEditor {...props}>{children}</ProjectDocumentClassificationEditor>);
    const dialog = begin(); chooseBilling(dialog); fireEvent.submit(dialog);
    if (change === 'unmount') view.unmount();
    else view.rerender(<ProjectDocumentClassificationEditor {...props} accessKey={change === 'account' ? 'user-b' : props.accessKey}
      client={change === 'client' ? { other: true } as never : props.client} projectId={change === 'project' ? 881 : 880}
      canManage={change !== 'permission'} archived={change === 'archived'}
      documents={change === 'source' || change === 'classification' ? [{ ...document, sourceKey: 'source-2',
        fileName: change === 'source' ? 'remplacement.pdf' : document.fileName, categoryKey: change === 'classification' ? 'billing' : document.categoryKey }] : props.documents}>{children}</ProjectDocumentClassificationEditor>);
    await act(async () => pending.resolve(classification()));
    expect(props.onClassified).not.toHaveBeenCalled();
    expect(screen.queryByText(/a été enregistrée/)).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('hides write actions for read-only and archived views, and disables them until the catalogue is ready', () => {
    const view = render(<ProjectDocumentClassificationEditor {...props} canManage={false}>{children}</ProjectDocumentClassificationEditor>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    view.rerender(<ProjectDocumentClassificationEditor {...props} archived>{children}</ProjectDocumentClassificationEditor>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    view.rerender(<ProjectDocumentClassificationEditor {...props} ready={false}>{children}</ProjectDocumentClassificationEditor>);
    expect(screen.getByRole('button', { name: 'Modifier la catégorie de audit.pdf' })).toBeDisabled();
  });
});
