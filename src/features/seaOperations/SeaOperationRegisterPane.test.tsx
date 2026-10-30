import type { SupabaseClient } from '@supabase/supabase-js';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SeaOperationRegisterPane } from './SeaOperationRegisterPane';
import { fetchSeaOperationProjectDocuments, type SeaOperationProjectDocument } from './seaOperationDocumentQueries';
import { emptySeaOperation } from './seaOperationModel';
import type { SeaOperationRecord } from './seaOperationQueries';

vi.mock('./seaOperationDocumentQueries', () => ({ fetchSeaOperationProjectDocuments: vi.fn(), createSeaOperationProjectDocumentUrl: vi.fn(), loadSeaOperationProjectDocumentBlob: vi.fn() }));
vi.mock('../projects/ProjectDocumentThumbnail', () => ({ ProjectDocumentThumbnail: () => <span aria-hidden="true">Miniature</span> }));
vi.mock('./SeaOperationRegisterMap', () => ({ SeaOperationRegisterMap: () => { const [value, setValue] = useState(''); return <section aria-label="Carte de l’opération"><input aria-label="Point en cours de modification" value={value} onChange={event => setValue(event.target.value)} /></section>; } }));
const client = {} as SupabaseClient;
function record(id = 'A', projectId = '501'): SeaOperationRecord {
  return { id, companyId: 1, version: 1, status: 'draft', draft: { ...emptySeaOperation(), planning: { projectId, operationId: `${id}:12`, date: '2026-10-30', captainPersonId: '' } },
    createdBy: 'captain', createdByName: 'Capitaine', createdAt: '', updatedBy: 'captain', updatedByName: 'Capitaine', updatedAt: '', signedBy: null, signedByName: null, signedAt: null, captainName: null, canEdit: false, canSign: false };
}
const document: SeaOperationProjectDocument = { id: 'project:41', projectId: '501', title: 'Plan', fileName: 'plan.pdf', mimeType: 'application/pdf', categoryLabel: 'HSE', subcategoryLabel: '', createdAt: '', expiresOn: null };
const props = { client, accessKey: 'company-1:real-captain-account', record: record(), onSave: vi.fn() };
beforeEach(() => { vi.resetAllMocks(); vi.mocked(fetchSeaOperationProjectDocuments).mockResolvedValue([document]); });

describe('Sea Operation register Carte/Documents pane', () => {
  it('starts with Carte, reads the protected count in the background, and keeps map edits mounted across tabs', async () => {
    render(<SeaOperationRegisterPane {...props} />);
    const map = screen.getByRole('tab', { name: /^Carte$/ });
    expect(map).toHaveAttribute('aria-selected', 'true');
    const docs = screen.getByRole('tab', { name: /^Documents/ });
    await waitFor(() => expect(docs).toHaveTextContent('Documents1'));
    expect(fetchSeaOperationProjectDocuments).toHaveBeenCalledWith(client, '501');
    fireEvent.change(screen.getByLabelText('Point en cours de modification'), { target: { value: '49.65, -1.62' } });
    fireEvent.click(docs);
    expect(screen.getByRole('tabpanel', { name: /^Documents/ })).toBeVisible();
    expect(screen.getByRole('region', { name: 'HSE' })).toBeVisible();
    fireEvent.click(map);
    expect(screen.getByLabelText('Point en cours de modification')).toHaveValue('49.65, -1.62');
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it('supports keyboard tabs and resets Carte on operation/account/client changes while ignoring an old count', async () => {
    let finish!: (rows: SeaOperationProjectDocument[]) => void;
    const slow = new Promise<SeaOperationProjectDocument[]>(resolve => { finish = resolve; });
    vi.mocked(fetchSeaOperationProjectDocuments).mockImplementation(async (_client, projectId) => projectId === '501' ? slow : [{ ...document, projectId: '502' }, { ...document, id: 'project:42', projectId: '502', fileName: 'second.pdf' }]);
    const view = render(<SeaOperationRegisterPane {...props} />);
    const map = screen.getByRole('tab', { name: /^Carte$/ }); map.focus(); fireEvent.keyDown(map, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: /^Documents/ })).toHaveFocus();
    view.rerender(<SeaOperationRegisterPane {...props} record={record('B', '502')} />);
    expect(screen.getByRole('tab', { name: /^Carte$/ })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(screen.getByRole('tab', { name: /^Documents/ })).toHaveTextContent('Documents2'));
    await act(async () => finish([document]));
    expect(screen.getByRole('tab', { name: /^Documents/ })).toHaveTextContent('Documents2');
    fireEvent.click(screen.getByRole('tab', { name: /^Documents/ }));
    view.rerender(<SeaOperationRegisterPane {...props} record={record('B', '502')} client={{} as SupabaseClient} accessKey="company-1:real-sailor-account" />);
    expect(screen.getByRole('tab', { name: /^Carte$/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps the selected tab on an updated version of the same operation, and shows zero for unlinked operations', async () => {
    const view = render(<SeaOperationRegisterPane {...props} />);
    fireEvent.click(screen.getByRole('tab', { name: /^Documents/ }));
    view.rerender(<SeaOperationRegisterPane {...props} record={{ ...props.record, version: 2 }} />);
    expect(screen.getByRole('tab', { name: /^Documents/ })).toHaveAttribute('aria-selected', 'true');
    view.rerender(<SeaOperationRegisterPane {...props} record={{ ...record('transit'), draft: emptySeaOperation() }} />);
    const docs = screen.getByRole('tab', { name: /^Documents/ });
    await waitFor(() => expect(docs).toHaveTextContent('Documents0'));
    fireEvent.click(docs);
    expect(screen.getByText('Sélectionnez un projet dans Armement pour consulter ses documents.')).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Supprimer/ })).not.toBeInTheDocument();
  });
});
