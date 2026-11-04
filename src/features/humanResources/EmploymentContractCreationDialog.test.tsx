import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { EmploymentContractCreationDialog } from './EmploymentContractCreationDialog';
import { generateEmploymentContractPdf } from './employmentContractPdf';
import { loadEmploymentContractDetails, downloadEmploymentContractSigner, saveEmploymentContract, type EmploymentContractRecord } from './employmentContractQueries';
import { loadHrSalaryGrid } from './salaryGridQueries';
import { saveEmploymentContractBlob } from './EmploymentContractsSection';
import type { PersonRecord } from './peopleQueries';

vi.mock('./employmentContractPdf', () => ({ generateEmploymentContractPdf: vi.fn() }));
vi.mock('./EmploymentContractsSection', () => ({ saveEmploymentContractBlob: vi.fn() }));
vi.mock('./salaryGridQueries', () => ({ loadHrSalaryGrid: vi.fn() }));
vi.mock('./employmentContractQueries', () => ({ loadEmploymentContractDetails: vi.fn(), downloadEmploymentContractSigner: vi.fn(), saveEmploymentContract: vi.fn() }));
vi.mock('./hrDocumentNotifications', async (importOriginal) => ({
  ...await importOriginal<typeof import('./hrDocumentNotifications')>(), getParisDateKey: () => '2026-11-04',
}));
const client = {} as SupabaseClient;
const person = { id: 7, firstName: 'Alice', lastName: 'DEMO', hiredOn: '2026-01-01', departedOn: '',
  contractType: 'CDI', birthDate: '1990-01-01', birthPlace: 'Ville fictive', postalAddress: '1 rue de démonstration',
  sailorNumber: 'DEMO-001', functionLabel: 'Capitaine', enimCategory: 15, enimFunctionCode: 'AA01A', active: true } as PersonRecord;
const details = { socialSecurityNumber: 'DEMONSTRATION-001', vesselNames: 'Navire fictif', salaryGridRowId: 'poste-a', endDate: '2026-12-31' };
const blob = new Blob(['demo-pdf'], { type: 'application/pdf' });
const record = { id: 1 } as EmploymentContractRecord;
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadEmploymentContractDetails).mockResolvedValue(details);
  vi.mocked(loadHrSalaryGrid).mockResolvedValue({ companyId: 1, revision: 2, updatedAt: '', rows: [{
    id: 'poste-a', positionLabel: 'Poste de démonstration', ccn: 'Officier', enimCategory: '15',
    conventionalAnnualBase: 30000, indexationPercent: 10, annualGross: 33000, annualPremium: 3000, totalAnnualBase: 36000, active: true,
  }] });
  vi.mocked(downloadEmploymentContractSigner).mockResolvedValue({ signature: { id: 2, personId: 3, signerName: 'Benjamin BON',
    mimeType: 'image/png', storageBucket: 'working-time-signatures', storagePath: 'fake.png', fileSizeBytes: 3, sha256: 'a'.repeat(64) },
    blob: { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } as Blob });
  vi.mocked(generateEmploymentContractPdf).mockResolvedValue(blob);
  vi.mocked(saveEmploymentContract).mockResolvedValue(record);
});

describe('ribbon contract creation from recorded RH data', () => {
  it('lists only current active staff while retaining future departures, current rehires, trainees and office staff', () => {
    const people = [
      person,
      { ...person, id: 8, lastName: 'FUTUR_DEPART', departedOn: '2026-11-05' },
      { ...person, id: 9, lastName: 'ANCIEN', departedOn: '2026-11-03' },
      { ...person, id: 10, lastName: 'DEPART_AUJOURDHUI', departedOn: '2026-11-04' },
      { ...person, id: 11, lastName: 'EMBAUCHE_FUTURE', hiredOn: '2026-11-05' },
      { ...person, id: 12, lastName: 'ARCHIVE', active: false },
      { ...person, id: 13, lastName: 'REEMBAUCHE', departedOn: '2025-01-01', employmentPeriods: [
        { hiredOn: '2024-01-01', departedOn: '2025-01-01', contractType: 'CDI', departureReason: '' },
        { hiredOn: '2026-11-01', departedOn: '', contractType: 'CDI', departureReason: '' },
      ] },
      { ...person, id: 14, lastName: 'STAGIAIRE', functionLabel: 'Stagiaire', roleLabel: 'Stagiaire' },
      { ...person, id: 15, lastName: 'SEDENTAIRE', functionLabel: 'Président', roleLabel: 'Sédentaire' },
    ];
    render(<EmploymentContractCreationDialog client={client} people={people}
      onClose={vi.fn()} onOpenProfile={vi.fn()} onGenerated={vi.fn()} />);
    expect(within(screen.getByLabelText('Collaborateur')).getAllByRole('option').map(option => (option as HTMLOptionElement).value))
      .toEqual(['', '7', '8', '13', '14', '15']);
    expect(loadEmploymentContractDetails).not.toHaveBeenCalled();
  });

  it.each([
    ['former staff', { departedOn: '2026-11-03' }],
    ['a departure today', { departedOn: '2026-11-04' }],
    ['a future hire', { hiredOn: '2026-11-05' }],
    ['an archived profile', { active: false }],
  ] as const)('ignores an initial selection for %s without loading or generating a contract', (_label, patch) => {
    render(<EmploymentContractCreationDialog client={client} people={[{ ...person, ...patch }, { ...person, id: 8, lastName: 'CURRENT' }]}
      initialPersonId={7} onClose={vi.fn()} onOpenProfile={vi.fn()} onGenerated={vi.fn()} />);
    expect(screen.getByLabelText('Collaborateur')).toHaveValue('');
    expect(loadEmploymentContractDetails).not.toHaveBeenCalled();
    expect(loadHrSalaryGrid).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Générer le PDF' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ouvrir la fiche RH' })).not.toBeInTheDocument();
    expect(generateEmploymentContractPdf).not.toHaveBeenCalled();
    expect(saveEmploymentContract).not.toHaveBeenCalled();
  });

  it('explains when no current active collaborator can be selected', () => {
    render(<EmploymentContractCreationDialog client={client} people={[{ ...person, active: false }]} initialPersonId={7}
      onClose={vi.fn()} onOpenProfile={vi.fn()} onGenerated={vi.fn()} />);
    expect(screen.getByText('Aucun collaborateur en poste disponible.')).toBeInTheDocument();
    expect(screen.getByLabelText('Collaborateur')).toBeDisabled();
    expect(loadEmploymentContractDetails).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Générer le PDF' })).not.toBeInTheDocument();
  });

  it('chooses a collaborator and directly generates the saved profile without copying its fields', async () => {
    const user = userEvent.setup(), onGenerated = vi.fn();
    render(<EmploymentContractCreationDialog client={client} people={[person]} onClose={vi.fn()} onOpenProfile={vi.fn()} onGenerated={onGenerated} />);
    const dialog = screen.getByRole('dialog', { name: 'Générer un contrat' });
    await user.selectOptions(within(dialog).getByLabelText('Collaborateur'), '7');
    const generate = await within(dialog).findByRole('button', { name: 'Générer le PDF' });
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
    await user.click(generate);
    await waitFor(() => expect(onGenerated).toHaveBeenCalledWith(7));
    expect(generateEmploymentContractPdf).toHaveBeenCalledWith(expect.objectContaining({ personId: 7, firstName: 'Alice',
      grossMonthlySalary: '3000.00' }), expect.anything());
    expect(saveEmploymentContract).toHaveBeenCalledWith(client, expect.objectContaining({ inputData: expect.objectContaining({
      salaryGridRowId: 'poste-a', salaryGridRevision: '2', annualGrossSalary: '36000.00',
    }) }));
    expect(saveEmploymentContractBlob).toHaveBeenCalledWith(blob, expect.stringMatching(/\.pdf$/));
  });

  it('uses the saved CDD end date without asking for duration again', async () => {
    const user = userEvent.setup();
    render(<EmploymentContractCreationDialog client={client} people={[{ ...person, contractType: 'CDD' }]} initialPersonId={7}
      onClose={vi.fn()} onOpenProfile={vi.fn()} onGenerated={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Générer le PDF' }));
    await waitFor(() => expect(generateEmploymentContractPdf).toHaveBeenCalledWith(expect.objectContaining({
      type: 'CDD', startDate: '2026-01-01', endDate: '2026-12-31',
    }), expect.anything()));
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  it('offers the profile completion action when the CDD duration has not been saved', async () => {
    const user = userEvent.setup(), onOpenProfile = vi.fn();
    vi.mocked(loadEmploymentContractDetails).mockResolvedValue({ ...details, endDate: '' });
    render(<EmploymentContractCreationDialog client={client} people={[{ ...person, contractType: 'CDD' }]} initialPersonId={7}
      onClose={vi.fn()} onOpenProfile={onOpenProfile} onGenerated={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Enregistrez la durée du CDD');
    expect(screen.queryByRole('button', { name: 'Générer le PDF' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ouvrir la fiche RH' }));
    expect(onOpenProfile).toHaveBeenCalledWith(7);
  });

  it('locks collaborator selection and closing while the document is being filed', async () => {
    const user = userEvent.setup();
    let finish!: (value: EmploymentContractRecord) => void;
    vi.mocked(saveEmploymentContract).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(<EmploymentContractCreationDialog client={client} people={[person]} initialPersonId={7}
      onClose={vi.fn()} onOpenProfile={vi.fn()} onGenerated={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Générer le PDF' }));
    await waitFor(() => expect(saveEmploymentContract).toHaveBeenCalledOnce());
    expect(screen.getByLabelText('Collaborateur')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Fermer' })).toBeDisabled();
    await act(async () => { finish(record); });
  });
});
