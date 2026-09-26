import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrgPersonnelPanel } from './OrgPersonnelPanel';
import { ORG_DEMO } from './organigrammeFixtures';
import { buildOrgContactsPdf } from './organigrammeContactsPdf';
import { downloadOrgBlob } from './organigrammeExport';

vi.mock('./organigrammeContactsPdf', () => ({ buildOrgContactsPdf: vi.fn().mockResolvedValue(new Blob(['PDF'])) }));
vi.mock('./organigrammeExport', () => ({ downloadOrgBlob: vi.fn() }));
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:contacts-test'), revokeObjectURL: vi.fn() }); });
afterEach(() => vi.unstubAllGlobals());

describe('OrgPersonnelPanel', () => {
  it('selects a function, permits individual exceptions, and exports exactly that set', async () => {
    render(<OrgPersonnelPanel data={ORG_DEMO} kind="personnel" disabled={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tout désélectionner' }));
    expect(screen.getByRole('button', { name: 'Exporter le personnel en PDF' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Inclure la fonction Capitaine'));
    fireEvent.click(screen.getByLabelText('Inclure Élodie MARTIN'));
    expect(screen.getByLabelText('Inclure la fonction Capitaine')).toBePartiallyChecked();
    fireEvent.change(screen.getByLabelText('Rechercher une personne ou une fonction'), { target: { value: 'Alice' } });
    fireEvent.click(screen.getByRole('button', { name: 'Exporter le personnel en PDF' }));
    await waitFor(() => expect(buildOrgContactsPdf).toHaveBeenCalled());
    const documents = vi.mocked(buildOrgContactsPdf).mock.calls[0][0];
    expect(documents[0].people.map((person) => person.id)).toEqual([8, 6]);
    expect(downloadOrgBlob).toHaveBeenCalled();
  });
  it('keeps independent selections when changing sheets and after data refresh', async () => {
    const { rerender } = render(<OrgPersonnelPanel data={ORG_DEMO} kind="emergency" disabled={false} />);
    expect(screen.getByLabelText('Inclure Camille DUMONT')).toBeChecked();
    expect(screen.getByLabelText('Inclure Élodie MARTIN')).not.toBeChecked();
    fireEvent.click(screen.getByLabelText('Inclure Élodie MARTIN'));
    fireEvent.click(screen.getByLabelText('Inclure Camille DUMONT'));
    rerender(<OrgPersonnelPanel data={ORG_DEMO} kind="personnel" disabled={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tout désélectionner' }));
    fireEvent.click(screen.getByLabelText('Inclure Alice LAURENT'));
    rerender(<OrgPersonnelPanel data={{ ...ORG_DEMO, people: ORG_DEMO.people.filter((person) => person.id !== 12) }} kind="emergency" disabled={false} />);
    expect(screen.getByLabelText('Inclure Élodie MARTIN')).toBeChecked();
    expect(screen.getByLabelText('Inclure Camille DUMONT')).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Exporter les deux listes' }));
    await waitFor(() => expect(buildOrgContactsPdf).toHaveBeenCalled());
    const documents = vi.mocked(buildOrgContactsPdf).mock.calls[0][0];
    expect(documents.map((document) => document.kind)).toEqual(['personnel', 'emergency']);
    expect(documents[0].people.map((person) => person.id)).toEqual([8]);
    expect(documents[1].people.map((person) => person.id).sort((a, b) => a - b)).toEqual([2, 11]);
    fireEvent.click(screen.getByRole('button', { name: 'Rétablir les sédentaires' }));
    expect(screen.getByLabelText('Inclure Camille DUMONT')).toBeChecked();
    expect(screen.getByLabelText('Inclure Élodie MARTIN')).not.toBeChecked();
  });
  it('warns about missing phones and blocks stale or loading data from export', () => {
    render(<OrgPersonnelPanel data={{ ...ORG_DEMO, people: [{ ...ORG_DEMO.people[0], phone: null }] }} kind="emergency" disabled />);
    expect(screen.getByText(/sans téléphone renseigné/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exporter les urgences en PDF' })).toBeDisabled();
    expect(screen.getByLabelText('Inclure Camille DUMONT')).toBeDisabled();
  });
});
