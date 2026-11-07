import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptySeaOperation } from './seaOperationModel';
import type { SeaOperationRecord, SeaOperationVessel } from './seaOperationQueries';
import { SeaOperationRegisterTree } from './SeaOperationRegisterTree';

const fleet: SeaOperationVessel[] = [
  { id: 1, name: 'AAA Petit', lengthOverall: '12', registrationImo: '', canSign: false },
  { id: 2, name: 'ZZZ Grand', lengthOverall: '35', registrationImo: '', canSign: false },
];

function operation(id: string, vessel: SeaOperationVessel, date: string, status: SeaOperationRecord['status'] = 'draft'): SeaOperationRecord {
  const draft = emptySeaOperation();
  return {
    id, companyId: 1, version: 1, status,
    draft: { ...draft, project: `Mission ${id}`, vessel: { ...draft.vessel, id: String(vessel.id), name: vessel.name }, decision: status === 'signed' ? 'GO' : '' },
    createdBy: 'fixture', createdByName: 'Capitaine', createdAt: date, updatedBy: 'fixture', updatedByName: 'Capitaine', updatedAt: '2026-11-15T12:00:00Z',
    signedBy: status === 'signed' ? 'fixture' : null, signedByName: status === 'signed' ? 'Capitaine' : null,
    signedAt: status === 'signed' ? date : null, captainName: null, canEdit: status === 'draft', canSign: false,
  };
}

const callbacks = () => ({ onSelect: vi.fn(), onConsumption: vi.fn(), onDelete: vi.fn() });

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-31T23:15:00Z')); });
afterEach(() => vi.useRealTimers());

describe('SeaOperationRegisterTree', () => {
  it('orders vessels by their overall length and opens the current Paris year and month', () => {
    const grand = operation('Grand', fleet[1], '2026-10-31T23:05:00Z');
    const petit = operation('Petit', fleet[0], '2026-11-02T15:00:00Z');
    const previous = operation('Octobre', fleet[1], '2026-10-31T20:00:00Z');
    const historical = operation('Archive', fleet[1], '2025-12-15T15:00:00Z');
    render(<SeaOperationRegisterTree records={[petit, historical, previous, grand]} vessels={fleet} selectedId={null} {...callbacks()} />);

    const long = screen.getByRole('button', { name: 'ZZZ Grand' });
    const short = screen.getByRole('button', { name: 'AAA Petit' });
    expect(long.compareDocumentPosition(short) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(long).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('button', { name: '2026' }).every(button => button.getAttribute('aria-expanded') === 'true')).toBe(true);
    expect(screen.getByRole('button', { name: /^Mission Grand/ })).toHaveTextContent('01/11/2026');
    expect(screen.getByRole('button', { name: 'Octobre' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /^Mission Octobre/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2025' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('uses the mission date and reveals an older selection or the results of a new filter', () => {
    const current = operation('Actuelle', fleet[0], '2026-11-01T10:00:00Z');
    const archive = operation('Ancienne', fleet[0], '2026-11-01T10:00:00Z');
    archive.draft.transit = { date: '2025-02-09', captainPersonId: '' };
    const events = callbacks();
    const renderTree = (selectedId: string | null, filterKey = '') => <SeaOperationRegisterTree records={[current, archive]} vessels={fleet} selectedId={selectedId} filterKey={filterKey} {...events} />;
    const { rerender } = render(renderTree(null));

    expect(screen.queryByRole('button', { name: /^Mission Ancienne/ })).not.toBeInTheDocument();
    rerender(renderTree(archive.id));
    expect(screen.getByRole('button', { name: /^Mission Ancienne/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '2025' }));
    expect(screen.queryByRole('button', { name: /^Mission Ancienne/ })).not.toBeInTheDocument();
    rerender(renderTree(null, 'ancienne'));
    expect(screen.getByRole('button', { name: /^Mission Ancienne/ })).toHaveTextContent('09/02/2025');
    fireEvent.click(screen.getByRole('button', { name: /^Mission Ancienne/ }));
    expect(events.onSelect).toHaveBeenCalledWith(archive);
  });

  it('shows the Conso status with separate authorized actions and no duplicate fiche controls', () => {
    const recorded = operation('Renseignée', fleet[0], '2026-11-01T10:00:00Z', 'signed');
    const missing = { ...operation('À compléter', fleet[0], '2026-11-02T10:00:00Z', 'signed'), canDelete: true, canRevise: true };
    const draft = operation('Brouillon', fleet[0], '2026-11-03T10:00:00Z');
    const events = callbacks();
    render(<SeaOperationRegisterTree records={[recorded, missing, draft]} vessels={fleet} selectedId={null} consumption={new Set([recorded.id])} {...events} />);

    expect(screen.getByText('Conso renseignée')).toHaveClass('so-tree-conso-recorded');
    expect(screen.getByText('Conso non renseignée')).toHaveClass('so-tree-conso-missing');
    expect(screen.getByText('Conso non applicable')).not.toHaveClass('so-tree-conso-missing');
    expect(screen.queryByRole('group', { name: 'Actions pour Mission Brouillon' })).not.toBeInTheDocument();
    const actions = within(screen.getByRole('group', { name: 'Actions pour Mission À compléter' }));
    fireEvent.click(actions.getByRole('button', { name: 'Conso' }));
    fireEvent.click(actions.getByRole('button', { name: 'Supprimer' }));
    expect(events.onConsumption).toHaveBeenCalledWith(missing);
    expect(events.onDelete).toHaveBeenCalledWith(missing);
    expect(events.onSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Ouvrir la fiche' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument();
  });
});
