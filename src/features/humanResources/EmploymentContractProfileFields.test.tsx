import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { EmploymentContractProfileFields } from './EmploymentContractProfileFields';
import { generateEmploymentContractPdf } from './employmentContractPdf';
import { saveEmploymentContractBlob } from './EmploymentContractsSection';
import { downloadEmploymentContractSigner, saveEmploymentContract, type EmploymentContractRecord, type EmploymentContractSigner } from './employmentContractQueries';
import type { PersonRecord } from './peopleQueries';

vi.mock('./employmentContractQueries', async () => ({
  ...await vi.importActual<typeof import('./employmentContractQueries')>('./employmentContractQueries'),
  saveEmploymentContract: vi.fn(),
  downloadEmploymentContractSigner: vi.fn(),
}));
vi.mock('./employmentContractPdf', () => ({ generateEmploymentContractPdf: vi.fn() }));
vi.mock('./EmploymentContractsSection', () => ({ saveEmploymentContractBlob: vi.fn() }));

const client = {} as SupabaseClient;
const person: PersonRecord = {
  id: 7, userId: 'linked-profile-7', firstName: 'Alice', lastName: 'MARTIN',
  email: 'alice@example.invalid', functionLabel: 'Capitaine', enimFunctionCode: 'AA01A', enimCategory: 15,
  gradeLabel: 'Capitaine 200', roleLabel: 'Navigant', registerLabel: 'RIF', sex: 'Femme',
  sailorNumber: '2000007', employeeNumber: '00007', phone: '', postalAddress: '1 quai du Port, Rouen',
  birthDate: '1990-06-02', birthPlace: 'Rouen', identityDocumentNumber: '', identityDocumentType: '',
  contractType: 'CDI', hiredOn: '2026-01-01', departedOn: '', departureReason: '',
  emergencyContactName: '', emergencyContactRelationship: '', emergencyContactPhone: '', emergencyContactAddress: '',
  waistSize: '', chestSize: '', fullHeightSize: '', inseamSize: '', hipSize: '', weightKg: '', shoeSize: '',
  coverallSize: '', pantsSize: '', jacketSize: '', deckCertificateLabel: '', engineCertificateLabel: '',
  craneTrainingOn: '', craneInductionOn: '', active: true,
};
const savedDetails = {
  socialSecurityNumber: '2900676123456', vesselNames: 'GOURY', grossMonthlySalary: '3200,50',
  collectiveAgreement: 'Convention collective des personnels d’exécution',
  employerRepresentative: 'Représentant BBTM', endDate: '2027-04-30',
};
const generatedFile = new Blob(['contract'], { type: 'application/pdf' });
const contract = { id: 21, personId: 7, fileName: 'contrat.pdf' } as EmploymentContractRecord;
const signature: EmploymentContractSigner = {
  id: 91, personId: 9, signerName: 'Benjamin BON', mimeType: 'image/png',
  storageBucket: 'working-time-signatures', storagePath: 'fixture/private-signature.png',
  fileSizeBytes: 3, sha256: 'a'.repeat(64),
};
const signatureBytes = new Uint8Array([1, 2, 3]);
const signatureBlob = { arrayBuffer: async () => signatureBytes.buffer } as Blob;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-04T10:00:00Z'));
  vi.clearAllMocks();
  vi.mocked(generateEmploymentContractPdf).mockResolvedValue(generatedFile);
  vi.mocked(saveEmploymentContract).mockResolvedValue(contract);
  vi.mocked(downloadEmploymentContractSigner).mockResolvedValue({ signature, blob: signatureBlob });
});
afterEach(() => { vi.useRealTimers(); });

describe('direct contract generation from saved HR profile', () => {
  it('uses saved RH facts and private details, then downloads only after filing succeeds', async () => {
    const user = userEvent.setup();
    let finishSave!: (value: EmploymentContractRecord) => void;
    vi.mocked(saveEmploymentContract).mockReturnValue(new Promise(resolve => { finishSave = resolve; }));
    render(<EmploymentContractProfileFields client={client} person={person} details={savedDetails} />);
    await user.click(screen.getByRole('button', { name: 'Générer le contrat' }));
    await waitFor(() => expect(saveEmploymentContract).toHaveBeenCalledOnce());
    expect(generateEmploymentContractPdf).toHaveBeenCalledWith(expect.objectContaining({
      type: 'CDI', personId: 7, firstName: 'Alice', lastName: 'MARTIN', birthDate: '1990-06-02', birthPlace: 'Rouen',
      postalAddress: '1 quai du Port, Rouen', sailorNumber: '2000007', functionLabel: 'Capitaine', startDate: '2026-01-01',
      socialSecurityNumber: savedDetails.socialSecurityNumber, vesselNames: 'GOURY', grossMonthlySalary: '3200,50',
      signatureDate: '2026-11-04',
    }), { bytes: signatureBytes, mimeType: 'image/png' });
    expect(downloadEmploymentContractSigner).toHaveBeenCalledWith(client);
    expect(saveEmploymentContract).toHaveBeenCalledWith(client, expect.objectContaining({
      personId: 7, contractType: 'CDI', file: generatedFile,
      inputData: expect.objectContaining({ socialSecurityNumber: savedDetails.socialSecurityNumber,
        employerRepresentative: 'Benjamin BON', employerSignatureId: signature.id,
        employerSignerPersonId: signature.personId, employerSignatureSha256: signature.sha256,
        signatureDate: '2026-11-04',
      }),
    }));
    expect(saveEmploymentContractBlob).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryByText('Contrat CDI généré et enregistré dans Documents.')).not.toBeInTheDocument();
    await act(async () => { finishSave(contract); });
    expect(await screen.findByRole('status')).toHaveTextContent('Contrat CDI généré et enregistré dans Documents.');
    expect(saveEmploymentContractBlob).toHaveBeenCalledWith(generatedFile, expect.stringMatching(/\.pdf$/));
  });

  it('requires only the CDD duration and computes the end from the saved beginning', async () => {
    const user = userEvent.setup();
    render(<EmploymentContractProfileFields client={client} person={{ ...person, contractType: 'CDD', hiredOn: '2026-01-31' }} details={savedDetails} />);
    expect(screen.getAllByRole('spinbutton')).toHaveLength(1);
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    await user.type(screen.getByLabelText('Durée du CDD'), '1');
    await user.click(screen.getByRole('button', { name: 'Générer le contrat' }));
    await waitFor(() => expect(generateEmploymentContractPdf).toHaveBeenCalledWith(expect.objectContaining({
      type: 'CDD', startDate: '2026-01-31', endDate: '2026-02-28',
    }), expect.objectContaining({ mimeType: 'image/png' })));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('offers days and weeks without another date input', async () => {
    const user = userEvent.setup();
    render(<EmploymentContractProfileFields client={client} person={{ ...person, contractType: 'CDD' }} details={savedDetails} />);
    await user.type(screen.getByLabelText('Durée du CDD'), '2');
    await user.selectOptions(screen.getByLabelText('Unité de durée'), 'weeks');
    await user.click(screen.getByRole('button', { name: 'Générer le contrat' }));
    await waitFor(() => expect(generateEmploymentContractPdf).toHaveBeenCalledWith(expect.objectContaining({ endDate: '2026-01-14' }), expect.objectContaining({ mimeType: 'image/png' })));
    expect(screen.getByRole('option', { name: 'Jours' })).toBeInTheDocument();
  });

  it('blocks a CDD without a valid duration before generating or filing a document', async () => {
    const user = userEvent.setup();
    render(<EmploymentContractProfileFields client={client} person={{ ...person, contractType: 'CDD' }} details={savedDetails} />);
    await user.click(screen.getByRole('button', { name: 'Générer le contrat' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('durée du CDD doit être un nombre entier strictement positif');
    expect(generateEmploymentContractPdf).not.toHaveBeenCalled();
    expect(saveEmploymentContract).not.toHaveBeenCalled();
    expect(saveEmploymentContractBlob).not.toHaveBeenCalled();
  });

  it('generates from the latest saved rehire period', async () => {
    const user = userEvent.setup();
    render(<EmploymentContractProfileFields client={client} person={{ ...person, employmentPeriods: [
      { hiredOn: '2020-01-01', departedOn: '2021-01-01', contractType: 'CDI', departureReason: '' },
      { hiredOn: '2026-09-01', departedOn: '', contractType: 'CDD', departureReason: '' },
    ] }} details={savedDetails} />);
    await user.type(screen.getByLabelText('Durée du CDD'), '3');
    await user.click(screen.getByRole('button', { name: 'Générer le contrat' }));
    await waitFor(() => expect(generateEmploymentContractPdf).toHaveBeenCalledWith(expect.objectContaining({
      type: 'CDD', startDate: '2026-09-01', endDate: '2026-11-30',
    }), expect.objectContaining({ mimeType: 'image/png' })));
  });

  it('reports missing saved RH information without adding data inputs in generation', async () => {
    const user = userEvent.setup();
    render(<EmploymentContractProfileFields client={client} person={person} details={{ ...savedDetails, grossMonthlySalary: '' }} />);
    await user.click(screen.getByRole('button', { name: 'Générer le contrat' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Salaire mensuel brut à l’embauche (€) : renseignez ce champ.');
    expect(generateEmploymentContractPdf).not.toHaveBeenCalled();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  it('keeps the document undownloaded when filing fails', async () => {
    const user = userEvent.setup();
    vi.mocked(saveEmploymentContract).mockRejectedValue(new Error('Classement indisponible'));
    render(<EmploymentContractProfileFields client={client} person={person} details={savedDetails} />);
    await user.click(screen.getByRole('button', { name: 'Générer le contrat' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Classement indisponible');
    expect(saveEmploymentContractBlob).not.toHaveBeenCalled();
    expect(screen.queryByText('Contrat CDI généré et enregistré dans Documents.')).not.toBeInTheDocument();
  });

  it('blocks PDF generation and filing when the private Benjamin BON signature is unavailable', async () => {
    const user = userEvent.setup();
    vi.mocked(downloadEmploymentContractSigner).mockRejectedValue(new Error('La signature privée de Benjamin BON est indisponible.'));
    render(<EmploymentContractProfileFields client={client} person={person} details={savedDetails} />);
    await user.click(screen.getByRole('button', { name: 'Générer le contrat' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('La signature privée de Benjamin BON est indisponible.');
    expect(generateEmploymentContractPdf).not.toHaveBeenCalled();
    expect(saveEmploymentContract).not.toHaveBeenCalled();
    expect(saveEmploymentContractBlob).not.toHaveBeenCalled();
  });

  it('keeps generation disabled for unsupported employment types', () => {
    render(<EmploymentContractProfileFields client={client} person={{ ...person, contractType: 'Intérim' }} details={savedDetails} />);
    expect(screen.getByRole('button', { name: 'Générer le contrat' })).toBeDisabled();
    expect(screen.getByText('Renseignez un type de contrat CDI ou CDD dans la fiche RH.')).toBeInTheDocument();
  });

  it('blocks generation while the saved profile is being edited or loaded', () => {
    render(<EmploymentContractProfileFields client={client} person={{ ...person, contractType: 'CDD' }} details={savedDetails} disabled />);
    expect(screen.getByRole('button', { name: 'Générer le contrat' })).toBeDisabled();
    expect(screen.getByLabelText('Durée du CDD')).toBeDisabled();
    expect(screen.getByLabelText('Unité de durée')).toBeDisabled();
  });
});
