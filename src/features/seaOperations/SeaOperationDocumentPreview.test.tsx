import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SeaOperationPreview } from './SeaOperationDocumentPreview';
import { emptySeaOperation } from './seaOperationModel';
import type { SeaOperationRecord } from './seaOperationQueries';

const viewportWidth = window.innerWidth;
afterEach(() => {
  cleanup();
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: viewportWidth });
});

describe('SeaOperationPreview', () => {
  it.each([{ width: 1731, zoom: '85' }, { width: 1599, zoom: '60' }, { width: 390, zoom: '40' }])('starts at $zoom% for a $width px viewport and keeps all zoom options available', async ({ width, zoom }) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
    render(<SeaOperationPreview draft={emptySeaOperation()} record={null} onChangeStep={vi.fn()} />);
    const selector = screen.getByRole('combobox', { name: 'Zoom de l’aperçu' });
    expect(selector).toHaveValue(zoom);
    expect(within(selector).getAllByRole('option').map((option) => option.textContent)).toEqual(['40%', '60%', '75%', '85%', '100%']);
    await userEvent.selectOptions(selector, '100');
    expect(selector).toHaveValue('100');
  });

  it('shows live unsaved edits instead of the stored draft and routes missing fields to their step', async () => {
    const draft = emptySeaOperation();
    draft.project = 'Projet enregistré';
    const record: SeaOperationRecord = {
      id: 'existing-record', companyId: 1, version: 2, status: 'draft', draft,
      createdBy: 'author', createdByName: 'Auteur', createdAt: '2026-10-16T08:00:00Z',
      updatedBy: 'author', updatedByName: 'Auteur', updatedAt: '2026-10-16T09:00:00Z',
      signedBy: null, signedByName: null, signedAt: null, captainName: null, canEdit: true, canSign: false,
    };
    const onChangeStep = vi.fn();
    const { rerender } = render(<SeaOperationPreview draft={draft} record={record} onChangeStep={onChangeStep} />);
    const edited = structuredClone(draft);
    edited.project = 'Projet modifié en direct';
    edited.description = 'Contenu actuel\nSuite de la description.';
    rerender(<SeaOperationPreview draft={edited} record={record} onChangeStep={onChangeStep} hasUnsavedChanges />);
    const paper = screen.getByRole('article', { name: 'Fiche imprimable Opération en Mer' });
    const document = within(paper);
    expect(document.getByText('Projet', { selector: 'dt' }).nextElementSibling).toHaveTextContent('Projet modifié en direct');
    expect(document.getByText('Description de l’opération', { selector: 'dt' }).nextElementSibling?.textContent).toBe(edited.description);
    expect(document.queryByText('Projet enregistré')).not.toBeInTheDocument();
    expect(paper.parentElement).toHaveClass('is-unsaved');
    expect(document.queryByText(record.id)).not.toBeInTheDocument();
    expect(document.queryByText(record.updatedByName)).not.toBeInTheDocument();
    expect(document.getByText('Dernière modification (heure de Paris)', { selector: 'dt' }).nextElementSibling).toHaveTextContent('À renseigner');
    expect(screen.getByText('Aperçu de la saisie · modifications non enregistrées.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Client' }));
    expect(onChangeStep).toHaveBeenLastCalledWith(0);
    const navigation = within(screen.getByRole('navigation', { name: 'Complétude par étape' }));
    await userEvent.click(navigation.getByRole('button', { name: /Plan de passage/ }));
    expect(onChangeStep).toHaveBeenLastCalledWith(2);
  });

  it('refreshes the current paper and scroll position while retaining zoom without inventing a signature or audit timestamp', async () => {
    const draft = emptySeaOperation();
    draft.project = 'Mission non enregistrée';
    render(<SeaOperationPreview draft={draft} record={null} onChangeStep={vi.fn()} />);
    const selector = screen.getByRole('combobox', { name: 'Zoom de l’aperçu' });
    await userEvent.selectOptions(selector, '75');
    const paperBefore = screen.getByRole('article', { name: 'Fiche imprimable Opération en Mer' });
    const scroller = screen.getByLabelText('Document en aperçu, défilement vertical et horizontal');
    scroller.scrollTop = 600;
    await userEvent.click(screen.getByRole('button', { name: 'Actualiser' }));
    const paperAfter = screen.getByRole('article', { name: 'Fiche imprimable Opération en Mer' });
    expect(paperAfter).not.toBe(paperBefore);
    expect(scroller.scrollTop).toBe(0);
    expect(selector).toHaveValue('75');
    expect(screen.getByRole('status')).toHaveTextContent('Aperçu actualisé avec les informations de la fiche.');
    expect(paperAfter.parentElement).toHaveClass('is-unsaved');
    const document = within(paperAfter);
    expect(document.getByText('Brouillon – aucune décision signée')).toBeInTheDocument();
    expect(document.queryByText('Identité du compte signataire')).not.toBeInTheDocument();
    expect(document.getByText('Dernière modification (heure de Paris)', { selector: 'dt' }).nextElementSibling).toHaveTextContent('À renseigner');
  });
});
