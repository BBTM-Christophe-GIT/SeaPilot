import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { EmploymentContractsSection } from './EmploymentContractsSection';
import {
  loadEmploymentContracts, downloadEmploymentContract,
  type EmploymentContractRecord,
} from './employmentContractQueries';
import type { PersonRecord } from './peopleQueries';

vi.mock('./employmentContractQueries', async () => ({
  ...await vi.importActual<typeof import('./employmentContractQueries')>('./employmentContractQueries'),
  loadEmploymentContracts: vi.fn(), downloadEmploymentContract: vi.fn(),
}));

const client = {} as SupabaseClient;
const person = { id: 7, firstName: 'Alice', lastName: 'MARTIN' } as PersonRecord;
const contract: EmploymentContractRecord = {
  id: 21, companyId: 1, personId: 7, contractType: 'CDI', title: 'Contrat de travail CDI – Alice MARTIN',
  fileName: 'Alice-MARTIN-CDI.pdf', storagePath: '1/people/7/00000000-0000-0000-0000-000000000021.pdf',
  fileSizeBytes: 1024, inputData: {}, createdAt: '2026-11-04T08:00:00Z',
};
const file = new Blob(['private contract'], { type: 'application/pdf' });
let downloadedName = '';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadEmploymentContracts).mockResolvedValue([contract]);
  vi.mocked(downloadEmploymentContract).mockResolvedValue(file);
  downloadedName = '';
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = vi.fn(() => 'blob:private-employment-contract');
    static revokeObjectURL = vi.fn();
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloadedName = this.download;
  });
  vi.spyOn(window, 'setTimeout');
});

afterEach(() => {
  const timers = vi.mocked(window.setTimeout);
  timers.mock.calls.forEach((call, index) => {
    if (call[1] === 30_000) window.clearTimeout(timers.mock.results[index].value);
  });
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('saved confidential employment contracts in profile Documents', () => {
  it('lists only the selected profile and downloads through the private repository', async () => {
    const user = userEvent.setup();
    render(<EmploymentContractsSection client={client} person={person} />);
    expect(await screen.findByText(contract.title)).toBeInTheDocument();
    expect(loadEmploymentContracts).toHaveBeenCalledWith(client, person.id);
    expect(screen.getByText(/Accès réservé à Administrateur et Direction/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Générer le contrat' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: `Télécharger ${contract.fileName}` }));
    await waitFor(() => expect(downloadEmploymentContract).toHaveBeenCalledWith(client, contract));
    expect(URL.createObjectURL).toHaveBeenCalledWith(file);
    expect(downloadedName).toBe(contract.fileName);
  });

  it('reports a private download failure without creating a download link', async () => {
    const user = userEvent.setup();
    vi.mocked(downloadEmploymentContract).mockRejectedValue(new Error('Denied'));
    render(<EmploymentContractsSection client={client} person={person} />);
    await user.click(await screen.findByRole('button', { name: `Télécharger ${contract.fileName}` }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de télécharger le contrat.');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('does not show another profile’s documents while its keyed replacement is loading', async () => {
    let finishLoad!: (value: EmploymentContractRecord[]) => void;
    const view = render(<EmploymentContractsSection key={7} client={client} person={person} />);
    await screen.findByText(contract.title);
    vi.mocked(loadEmploymentContracts).mockReturnValueOnce(new Promise(resolve => { finishLoad = resolve; }));
    view.rerender(<EmploymentContractsSection key={8} client={client} person={{ ...person, id: 8 }} />);
    expect(screen.queryByText(contract.title)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Chargement des contrats…');
    await act(async () => { finishLoad([]); });
    expect(screen.getByText('Aucun contrat généré pour ce collaborateur.')).toBeInTheDocument();
    expect(loadEmploymentContracts).toHaveBeenLastCalledWith(client, 8);
  });

  it('reports a failed list request without exposing document controls', async () => {
    vi.mocked(loadEmploymentContracts).mockRejectedValue(new Error('Denied'));
    render(<EmploymentContractsSection client={client} person={person} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les contrats de travail.');
    expect(screen.queryByRole('button', { name: /^Télécharger/ })).not.toBeInTheDocument();
  });
});
