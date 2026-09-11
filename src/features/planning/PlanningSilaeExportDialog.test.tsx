import type { SupabaseClient } from '@supabase/supabase-js';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanningSilaeExportDialog } from './PlanningSilaeExportDialog';
import { fetchPlanningSilaeData } from './planningSilaeQueries';
import { generateSilaeWorkbook } from './planningSilaeWorkbook';
import type { SilaeData, SilaePerson } from './planningSilae';
import { EMPTY_PLANNING_OVERVIEW } from './usePlanningOverview';

vi.mock('./planningSilaeQueries', () => ({ fetchPlanningSilaeData: vi.fn() }));
vi.mock('./planningSilaeWorkbook', () => ({ generateSilaeWorkbook: vi.fn() }));
vi.mock('./planningDates', async (original) => ({ ...await original(), todayPlanningDate: () => '2026-09-11' }));
const client = {} as SupabaseClient;
const NativeURL = globalThis.URL;
const person: SilaePerson = { id: 1, firstName: 'Pierre', lastName: 'Auguin', employeeNumber: '00004', enimFunctionCode: 'AA01A', enimCategory: '15', functionLabel: 'Capitaine', gradeLabel: '', roleLabel: '', hiredOn: '2020-01-01', departedOn: '', active: true };
const fixture: SilaeData = {
  people: [person, { ...person, id: 2, firstName: 'Adam', lastName: 'DEBORDEAUX' }, { ...person, id: 3, lastName: 'ANCIEN', departedOn: '2026-09-01' }, { ...person, id: 4, lastName: 'SEDENTAIRE', gradeLabel: 'Sédentaire' }],
  vessels: [{ id: 10, name: 'Navire', registrationNumber: '001234' }],
  sources: [{ personId: 1, startsOn: '2026-09-01', endsOn: '2026-09-30', status: 'En Mer', vesselId: 10, priority: 1 }],
};

describe('SILAE export confirmation', () => {
  beforeEach(() => {
    vi.mocked(fetchPlanningSilaeData).mockReset().mockResolvedValue(fixture);
    vi.mocked(generateSilaeWorkbook).mockReset().mockResolvedValue(new Uint8Array([1, 2, 3]));
    vi.stubGlobal('URL', Object.assign(NativeURL, { createObjectURL: vi.fn(() => 'blob:silae'), revokeObjectURL: vi.fn() }));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  it('defaults to the current month and requires explicit confirmation of an editable eligible list', async () => {
    const user = userEvent.setup();
    render(<PlanningSilaeExportDialog client={client} onClose={vi.fn()} />);
    expect(screen.getByLabelText('Mois et année de l’export')).toHaveValue('2026-09');
    const sailor = await screen.findByRole('checkbox', { name: /AUGUIN Pierre/ });
    expect(sailor).toBeChecked();
    expect(screen.queryByRole('checkbox', { name: /DEBORDEAUX|ANCIEN|SEDENTAIRE/ })).toBeNull();
    const download = screen.getByRole('button', { name: 'Télécharger l’export SILAE' });
    expect(download).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /Je confirme/ }));
    expect(download).toBeEnabled();
    await user.click(sailor);
    expect(download).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /Je confirme/ })).not.toBeChecked();
    await user.click(sailor);
    await user.click(screen.getByRole('checkbox', { name: /Je confirme/ }));
    await user.click(download);
    await waitFor(() => expect(generateSilaeWorkbook).toHaveBeenCalledWith([expect.objectContaining({ person, issues: [] })]));
    expect(await screen.findByText('Export SILAE généré pour 1 marin.')).toBeInTheDocument();
  });

  it('invalidates confirmation immediately on month change and ignores a stale response', async () => {
    const user = userEvent.setup();
    render(<PlanningSilaeExportDialog client={client} onClose={vi.fn()} />);
    await screen.findByRole('checkbox', { name: /AUGUIN/ });
    await user.click(screen.getByRole('checkbox', { name: /Je confirme/ }));
    let resolveOld!: (value: SilaeData) => void;
    vi.mocked(fetchPlanningSilaeData).mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; })).mockResolvedValueOnce(fixture);
    fireEvent.change(screen.getByLabelText('Mois et année de l’export'), { target: { value: '2026-08' } });
    expect(screen.getByRole('button', { name: 'Télécharger l’export SILAE' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Mois et année de l’export'), { target: { value: '2026-09' } });
    await screen.findByRole('checkbox', { name: /Je confirme/ });
    resolveOld({ ...fixture, people: [] });
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /AUGUIN/ })).toBeChecked());
    expect(screen.getByRole('checkbox', { name: /Je confirme/ })).not.toBeChecked();
  });

  it('shows incomplete sailors without silently dropping them and allows explicit deselection', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchPlanningSilaeData).mockResolvedValue({ ...fixture, people: [...fixture.people, { ...person, id: 5, lastName: 'INCOMPLET', employeeNumber: '00005' }] });
    render(<PlanningSilaeExportDialog client={client} onClose={vi.fn()} />);
    const incomplete = await screen.findByRole('checkbox', { name: /INCOMPLET/ });
    expect(incomplete).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Je confirme/ })).toBeDisabled();
    await user.click(incomplete);
    expect(screen.getByRole('checkbox', { name: /Je confirme/ })).toBeEnabled();
  });

  it('blocks on a query error and recovers through Retry', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchPlanningSilaeData).mockRejectedValueOnce(new Error('Accès indisponible'));
    render(<PlanningSilaeExportDialog client={client} onClose={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Accès indisponible');
    expect(screen.getByRole('button', { name: 'Télécharger l’export SILAE' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByRole('checkbox', { name: /AUGUIN/ })).toBeChecked();
  });

  it('uses explicitly fictitious data in preview without reading authenticated RH tables', async () => {
    render(<PlanningSilaeExportDialog client={client} onClose={vi.fn()} previewOverview={{ ...EMPTY_PLANNING_OVERVIEW, people: [{ ...person, contractType: 'CDI' }] }} />);
    expect(await screen.findByRole('checkbox', { name: /AUGUIN Pierre.*DEMO-1/ })).toBeInTheDocument();
    expect(fetchPlanningSilaeData).not.toHaveBeenCalled();
    expect(screen.getByText(/Ce fichier ne doit pas être importé dans SILAE/)).toBeInTheDocument();
  });

  it('previews employment boundaries, empty rest JrsMer and dated functions before downloading', async () => {
    const user = userEvent.setup();
    const boris = { ...person, firstName: 'Boris', lastName: 'BROT', functionLabel: '2nd Capitaine', enimFunctionCode: 'CA01A', enimCategory: '12', hiredOn: '2026-09-10', departedOn: '2026-09-29' };
    vi.mocked(fetchPlanningSilaeData).mockResolvedValue({ ...fixture, people: [boris], sources: [{ personId: 1, startsOn: '2026-09-22', endsOn: '2026-10-06', status: 'En Mer', vesselId: 10, priority: 2, functionLabel: 'Capitaine' }] });
    render(<PlanningSilaeExportDialog client={client} onClose={vi.fn()} />);
    await user.click(await screen.findByText('Vérifier les périodes'));
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(within(rows[1]).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['10/09/2026', '21/09/2026', 'En repos', '001234', '2nd Capitaine', 'CA01A', '12', '', '12']);
    expect(within(rows[2]).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['22/09/2026', '29/09/2026', 'En mer', '001234', 'Capitaine', 'AA01A', '15', '8', '8']);
    expect(screen.getByText(/Embauche : 10\/09\/2026.*Départ : 29\/09\/2026/)).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /Je confirme/ }));
    await user.click(screen.getByRole('button', { name: 'Télécharger l’export SILAE' }));
    await waitFor(() => expect(generateSilaeWorkbook).toHaveBeenCalledWith([expect.objectContaining({ periods: [expect.objectContaining({ startsOn: '2026-09-10' }), expect.objectContaining({ endsOn: '2026-09-29', enimFunctionCode: 'AA01A', enimCategory: '15' })], issues: [] })]));
  });
});
