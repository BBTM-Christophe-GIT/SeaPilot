import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RoleKey } from '../permissions/roles';
import { HumanResourcesPage } from './HumanResourcesPage';
import { fetchHumanResourcesData, updatePersonDetails, type PersonRecord } from './peopleQueries';
import { loadEmploymentContractDetails, saveEmploymentContractDetails } from './employmentContractQueries';
import { loadHrSalaryGrid } from './salaryGridQueries';
import { fetchFleetVessels, type FleetVessel } from '../fleet/fleetQueries';

const { sectionRender, profileFieldsRender } = vi.hoisted(() => ({ sectionRender: vi.fn(), profileFieldsRender: vi.fn() }));

vi.mock('./peopleQueries', async () => ({
  ...await vi.importActual<typeof import('./peopleQueries')>('./peopleQueries'),
  fetchHumanResourcesData: vi.fn(),
  updatePersonDetails: vi.fn(),
}));

vi.mock('./employmentContractQueries', async () => ({
  ...await vi.importActual<typeof import('./employmentContractQueries')>('./employmentContractQueries'),
  loadEmploymentContractDetails: vi.fn(),
  saveEmploymentContractDetails: vi.fn(),
}));
vi.mock('./salaryGridQueries', async () => ({
  ...await vi.importActual<typeof import('./salaryGridQueries')>('./salaryGridQueries'),
  loadHrSalaryGrid: vi.fn(),
}));
vi.mock('../fleet/fleetQueries', async () => ({
  ...await vi.importActual<typeof import('../fleet/fleetQueries')>('../fleet/fleetQueries'),
  fetchFleetVessels: vi.fn(),
}));

vi.mock('./EmploymentContractsSection', () => ({
  EmploymentContractsSection: (props: { client: SupabaseClient; person: PersonRecord }) => {
    sectionRender(props);
    return <section aria-label="Contrats de travail confidentiels">Contrats de {props.person.firstName} {props.person.lastName}</section>;
  },
}));

vi.mock('./EmploymentContractProfileFields', () => ({
  EmploymentContractProfileFields: (props: { client: SupabaseClient; person: PersonRecord }) => {
    profileFieldsRender(props);
    return <section aria-label="Génération du contrat de travail">Génération pour {props.person.firstName} {props.person.lastName}</section>;
  },
}));

const person: PersonRecord = {
  id: 7, userId: 'linked-profile-7', firstName: 'Alice', lastName: 'MARTIN',
  email: 'alice@example.invalid', functionLabel: 'Capitaine', enimFunctionCode: 'AA01A', enimCategory: 15,
  gradeLabel: 'Capitaine 200', roleLabel: 'Navigant', registerLabel: 'RIF', sex: 'Femme',
  sailorNumber: '2000007', employeeNumber: '00007', phone: '', postalAddress: '1 quai du Port, Rouen',
  birthDate: '1990-06-02', birthPlace: 'Rouen', identityDocumentNumber: '', identityDocumentType: '',
  contractType: 'CDI', hiredOn: '2024-01-01', departedOn: '', departureReason: '',
  emergencyContactName: '', emergencyContactRelationship: '', emergencyContactPhone: '', emergencyContactAddress: '',
  waistSize: '', chestSize: '', fullHeightSize: '', inseamSize: '', hipSize: '', weightKg: '', shoeSize: '',
  coverallSize: '', pantsSize: '', jacketSize: '', deckCertificateLabel: '', engineCertificateLabel: '',
  craneTrainingOn: '', craneInductionOn: '', active: true,
};
const activeSalaryRow = {
  id: 'post-grid', positionLabel: 'Poste B', ccn: 'Officier', enimCategory: '15', conventionalAnnualBase: 40000,
  indexationPercent: 13, annualGross: 44000, annualPremium: 3000, totalAnnualBase: 50000.01, active: true,
};

beforeEach(() => {
  sectionRender.mockClear();
  profileFieldsRender.mockClear();
  vi.mocked(loadEmploymentContractDetails).mockReset().mockResolvedValue({
    socialSecurityNumber: '2900676123456', grossMonthlySalary: '3200,50', vesselNames: 'GOURY',
    collectiveAgreement: 'CONVENTION COLLECTIVE PERSONNELS EXECUTION',
  });
  vi.mocked(saveEmploymentContractDetails).mockReset().mockResolvedValue(undefined);
  vi.mocked(updatePersonDetails).mockReset().mockResolvedValue(person);
  vi.mocked(loadHrSalaryGrid).mockReset().mockResolvedValue({ companyId: 1, revision: 3, updatedAt: '', rows: [activeSalaryRow] });
  vi.mocked(fetchFleetVessels).mockReset().mockResolvedValue([
    { id: 1, name: 'NAVIRE COURT DEMO', assetKind: 'vessel', lengthOverall: '12', active: true },
    { id: 2, name: 'NAVIRE LONG DEMO', assetKind: 'vessel', lengthOverall: '42', active: true },
  ] as FleetVessel[]);
  vi.mocked(fetchHumanResourcesData).mockResolvedValue({ people: [person], documents: [], documentTypes: [], visibilityRules: [] });
});

describe('HR profile employment contracts access', () => {
  it.each<RoleKey>(['admin', 'direction'])('shows contracts for the selected real profile to %s', async role => {
    const user = userEvent.setup();
    const client = {} as SupabaseClient;
    vi.mocked(loadEmploymentContractDetails).mockResolvedValue({ socialSecurityNumber: '2900676123456', vesselNames: 'Navire fictif', salaryGridRowId: 'post-grid' });
    render(<MemoryRouter><HumanResourcesPage client={client} currentPersonId={7} roles={[role]} /></MemoryRouter>);
    const profile = await screen.findByRole('complementary', { name: 'Fiche RH de Alice MARTIN' });
    const ribbon = screen.getByRole('navigation', { name: 'Commandes du module Ressources humaines' });
    expect(ribbon).toHaveClass('is-single-row');
    expect(within(ribbon).getAllByRole('button').map(button => button.getAttribute('aria-label'))).toEqual([
      'Générer le contrat', 'Grille de salaire', 'Matrice des Qualifications', 'Plan de formation', 'Ajouter un collaborateur',
    ]);
    await user.click(within(ribbon).getByRole('button', { name: 'Générer le contrat' }));
    const dialog = screen.getByRole('dialog', { name: 'Générer un contrat' });
    expect(within(dialog).getByLabelText('Collaborateur')).toHaveValue('7');
    expect(await within(dialog).findByRole('region', { name: 'Génération du contrat de travail' })).toHaveTextContent('Génération pour Alice MARTIN');
    expect(profileFieldsRender).toHaveBeenLastCalledWith(expect.objectContaining({ client, person }));
    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    await user.click(within(profile).getByRole('button', { name: 'Contrat et dates' }));
    expect(within(profile).queryByRole('region', { name: 'Génération du contrat de travail' })).not.toBeInTheDocument();
    expect(within(profile).queryByRole('button', { name: /Générer|Grille de salaire/ })).not.toBeInTheDocument();
    await user.click(within(profile).getByRole('button', { name: 'Documents' }));

    expect(within(profile).getByRole('region', { name: 'Contrats de travail confidentiels' })).toHaveTextContent('Contrats de Alice MARTIN');
    expect(sectionRender).toHaveBeenLastCalledWith(expect.objectContaining({ client, person }));
  });

  it('limits the ribbon contract selector to current personnel while retaining office personnel and trainees', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchHumanResourcesData).mockResolvedValue({
      people: [person,
        { ...person, id: 8, firstName: 'Ancien', departedOn: '2000-01-01' },
        { ...person, id: 9, firstName: 'Archive', active: false },
        { ...person, id: 10, firstName: 'Futur', hiredOn: '2999-01-01' },
        { ...person, id: 11, firstName: 'Stagiaire', functionLabel: 'Stagiaire', roleLabel: 'Stagiaire' },
        { ...person, id: 12, firstName: 'Bureau', functionLabel: 'Direction', roleLabel: 'Sédentaire' },
      ], documents: [], documentTypes: [], visibilityRules: [],
    });
    render(<MemoryRouter><HumanResourcesPage client={{} as SupabaseClient} currentPersonId={7} roles={['admin']} /></MemoryRouter>);
    await screen.findByRole('complementary', { name: 'Fiche RH de Alice MARTIN' });
    await user.click(screen.getByRole('button', { name: 'Générer le contrat' }));
    const dialog = screen.getByRole('dialog', { name: 'Générer un contrat' });
    expect(within(within(dialog).getByLabelText('Collaborateur')).getAllByRole('option')
      .map(option => (option as HTMLOptionElement).value).sort()).toEqual(['', '11', '12', '7']);
  });

  it.each<RoleKey>(['armement', 'marin', 'capitaine'])('never mounts confidential contracts for a real %s fixture', async role => {
    const user = userEvent.setup();
    render(<MemoryRouter><HumanResourcesPage client={{} as SupabaseClient} currentPersonId={7} roles={[role]} /></MemoryRouter>);
    const profile = await screen.findByRole('complementary', { name: 'Fiche RH de Alice MARTIN' });
    expect(within(profile).queryByRole('button', { name: 'Contrat et dates' })).not.toBeInTheDocument();
    expect(within(profile).queryByRole('region', { name: 'Génération du contrat de travail' })).not.toBeInTheDocument();
    expect(profileFieldsRender).not.toHaveBeenCalled();
    expect(loadEmploymentContractDetails).not.toHaveBeenCalled();
    expect(loadHrSalaryGrid).not.toHaveBeenCalled();
    expect(fetchFleetVessels).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Générer le contrat' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Grille de salaire' })).not.toBeInTheDocument();
    expect(within(profile).queryByText('2900676123456')).not.toBeInTheDocument();
    await user.click(within(profile).getByRole('button', { name: 'Modifier la fiche RH' }));
    expect(within(profile).queryByLabelText(/sécurité sociale/)).not.toBeInTheDocument();
    expect(within(profile).queryByLabelText(/Salaire brut/)).not.toBeInTheDocument();
    expect(fetchFleetVessels).not.toHaveBeenCalled();
    await user.click(within(profile).getByRole('button', { name: 'Documents' }));

    expect(within(profile).queryByRole('region', { name: 'Contrats de travail confidentiels' })).not.toBeInTheDocument();
    expect(sectionRender).not.toHaveBeenCalled();
  });

  it.each([
    ['admin', 'NAVIRE LONG DEMO'],
    ['direction', 'Ensemble de la flotte'],
  ] as const)('saves the fleet assignment through the normal RH profile action for %s', async (role, assignment) => {
    const user = userEvent.setup();
    const client = {} as SupabaseClient;
    render(<MemoryRouter><HumanResourcesPage client={client} currentPersonId={7} roles={[role]} /></MemoryRouter>);
    const profile = await screen.findByRole('complementary', { name: 'Fiche RH de Alice MARTIN' });
    expect(fetchFleetVessels).not.toHaveBeenCalled();
    await user.click(within(profile).getByRole('button', { name: 'Contrat et dates' }));
    expect(fetchFleetVessels).not.toHaveBeenCalled();
    await user.click(within(profile).getByRole('button', { name: 'Modifier la fiche RH' }));
    const select = await within(profile).findByRole('combobox', { name: 'Navire(s) d’affectation' });
    await waitFor(() => expect(select).toBeEnabled());
    await user.selectOptions(select, assignment);
    await user.click(within(profile).getByRole('button', { name: 'Enregistrer la fiche' }));
    await waitFor(() => expect(saveEmploymentContractDetails).toHaveBeenCalledWith(client, 7,
      expect.objectContaining({ vesselNames: assignment })));
    expect(await within(profile).findByText(assignment)).toBeInTheDocument();
  });

  it.each<RoleKey>(['admin', 'direction'])('saves private SSN in Identity and salary in Contract through the normal fiche action for %s', async role => {
    const user = userEvent.setup();
    const client = {} as SupabaseClient;
    render(<MemoryRouter><HumanResourcesPage client={client} currentPersonId={7} roles={[role]} /></MemoryRouter>);
    const profile = await screen.findByRole('complementary', { name: 'Fiche RH de Alice MARTIN' });
    expect(await within(profile).findByText('2900676123456')).toBeInTheDocument();
    expect(within(profile).queryByText('Salaire brut (€ / mois)')).not.toBeInTheDocument();
    await user.click(within(profile).getByRole('button', { name: 'Modifier la fiche RH' }));
    fireEvent.change(within(profile).getByLabelText(/sécurité sociale/), { target: { value: '2900676123457' } });
    await user.click(within(profile).getByRole('button', { name: 'Contrat et dates' }));
    expect(within(profile).queryByLabelText(/sécurité sociale/)).not.toBeInTheDocument();
    expect(within(profile).queryByLabelText('Salaire brut (€ / mois)')).not.toBeInTheDocument();
    await user.selectOptions(within(profile).getByLabelText('Poste de la grille de salaires'), 'post-grid');
    expect(within(profile).getByText(/4\s*166,67\s*€/)).toBeInTheDocument();
    await user.click(within(profile).getByRole('button', { name: 'Enregistrer la fiche' }));
    await waitFor(() => expect(saveEmploymentContractDetails).toHaveBeenCalledWith(client, 7, {
      socialSecurityNumber: '2900676123457', grossMonthlySalary: '4166.67', salaryGridRowId: 'post-grid',
      annualGrossSalary: '50000.01', salaryGridRevision: '3', collectiveAgreement: 'CONVENTION COLLECTIVE DES OFFICIERS DE LA MARINE MARCHANDE',
    }));
    expect(updatePersonDetails).toHaveBeenCalledWith(client, 7, expect.objectContaining({ firstName: 'Alice' }), { selfService: false });
    expect(await within(profile).findByText(/4\s*166,67\s*€/)).toBeInTheDocument();
    await user.click(within(profile).getByRole('button', { name: 'Identité et poste' }));
    expect(within(profile).getByText('2900676123457')).toBeInTheDocument();
  });

  it.each<RoleKey>(['armement', 'marin', 'capitaine'])('falls back safely from a contract deep link for a real %s fixture', async role => {
    render(<MemoryRouter><HumanResourcesPage client={{} as SupabaseClient} currentPersonId={7} roles={[role]} initialPersonId={7} initialSectionKey="contract" /></MemoryRouter>);
    const profile = await screen.findByRole('complementary', { name: 'Fiche RH de Alice MARTIN' });
    expect(within(profile).queryByRole('button', { name: 'Contrat et dates' })).not.toBeInTheDocument();
    expect(within(profile).getByRole('button', { name: 'Identité et poste' })).toHaveAttribute('aria-current', 'page');
    expect(profileFieldsRender).not.toHaveBeenCalled();
    expect(loadEmploymentContractDetails).not.toHaveBeenCalled();
  });

  it('keeps the entire contract section hidden when Armement creates a collaborator', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><HumanResourcesPage client={{} as SupabaseClient} currentPersonId={7} roles={['armement']} /></MemoryRouter>);
    await screen.findByRole('complementary', { name: 'Fiche RH de Alice MARTIN' });
    await user.click(screen.getByRole('button', { name: 'Ajouter un collaborateur' }));
    const dialog = screen.getByRole('dialog', { name: 'Nouveau collaborateur' });
    expect(within(dialog).queryByRole('button', { name: 'Contrat et dates' })).not.toBeInTheDocument();
  });

  it.each(['pending', 'failed', 'missing', 'inactive'] as const)('blocks generation instead of reusing saved salary when the current grid is %s', async state => {
    const user = userEvent.setup();
    vi.mocked(loadEmploymentContractDetails).mockResolvedValue({ socialSecurityNumber: '2900676123456',
      grossMonthlySalary: '3200,50', vesselNames: 'GOURY', salaryGridRowId: 'post-grid' });
    if (state === 'pending') vi.mocked(loadHrSalaryGrid).mockReturnValue(new Promise(() => {}));
    else if (state === 'failed') vi.mocked(loadHrSalaryGrid).mockRejectedValue(new Error('Unavailable'));
    else vi.mocked(loadHrSalaryGrid).mockResolvedValue({ companyId: 1, revision: 4, updatedAt: '',
      rows: state === 'missing' ? [] : [{ ...activeSalaryRow, active: false }] });
    render(<MemoryRouter><HumanResourcesPage client={{} as SupabaseClient} currentPersonId={7} roles={['admin']} /></MemoryRouter>);
    await screen.findByRole('complementary', { name: 'Fiche RH de Alice MARTIN' });
    await user.click(screen.getByRole('button', { name: 'Générer le contrat' }));
    const dialog = screen.getByRole('dialog', { name: 'Générer un contrat' });
    if (state === 'pending') expect(await within(dialog).findByRole('status')).toHaveTextContent('Chargement des informations');
    else expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    expect(loadHrSalaryGrid).toHaveBeenCalledOnce();
    expect(profileFieldsRender).not.toHaveBeenCalled();
    expect(within(dialog).queryByRole('button', { name: 'Générer le PDF' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Ouvrir la fiche RH' })).toBeInTheDocument();
  });

  it('enables generation only after resolving the saved position to an active current salary row', async () => {
    const user = userEvent.setup();
    vi.mocked(loadEmploymentContractDetails).mockResolvedValue({ socialSecurityNumber: '2900676123456',
      grossMonthlySalary: '3200,50', vesselNames: 'GOURY', salaryGridRowId: 'post-grid' });
    render(<MemoryRouter><HumanResourcesPage client={{} as SupabaseClient} currentPersonId={7} roles={['direction']} /></MemoryRouter>);
    await screen.findByRole('complementary', { name: 'Fiche RH de Alice MARTIN' });
    await user.click(screen.getByRole('button', { name: 'Générer le contrat' }));
    await waitFor(() => expect(profileFieldsRender).toHaveBeenLastCalledWith(expect.objectContaining({ useSavedDuration: true, buttonLabel: 'Générer le PDF',
      details: expect.objectContaining({ grossMonthlySalary: '4166.67', annualGrossSalary: '50000.01', salaryGridRevision: '3' }),
    })));
  });

  it('opens the selected profile to complete missing contract facts without copying them into a new form', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><HumanResourcesPage client={{} as SupabaseClient} currentPersonId={7} roles={['admin']} /></MemoryRouter>);
    await screen.findByRole('complementary', { name: 'Fiche RH de Alice MARTIN' });
    await user.click(screen.getByRole('button', { name: 'Générer le contrat' }));
    const dialog = screen.getByRole('dialog', { name: 'Générer un contrat' });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Complétez puis enregistrez la fiche RH');
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Ouvrir la fiche RH' }));
    expect(screen.queryByRole('dialog', { name: 'Générer un contrat' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('complementary', { name: 'Fiche RH de Alice MARTIN' })).getByRole('button', { name: 'Contrat et dates' })).toHaveAttribute('aria-current', 'page');
  });

  it('records the CDD duration in the RH profile and reuses its saved end date in the ribbon dialog', async () => {
    const user = userEvent.setup();
    const cddPerson = { ...person, contractType: 'CDD' };
    let saved = { socialSecurityNumber: '2900676123456', vesselNames: 'Navire fictif', salaryGridRowId: 'post-grid', endDate: '' };
    vi.mocked(fetchHumanResourcesData).mockResolvedValue({ people: [cddPerson], documents: [], documentTypes: [], visibilityRules: [] });
    vi.mocked(loadEmploymentContractDetails).mockImplementation(async () => saved);
    vi.mocked(updatePersonDetails).mockResolvedValue(cddPerson);
    vi.mocked(saveEmploymentContractDetails).mockImplementation(async (_client, _personId, patch) => { saved = { ...saved, ...patch }; });
    render(<MemoryRouter><HumanResourcesPage client={{} as SupabaseClient} currentPersonId={7} roles={['direction']} /></MemoryRouter>);
    const profile = await screen.findByRole('complementary', { name: 'Fiche RH de Alice MARTIN' });
    await user.click(within(profile).getByRole('button', { name: 'Modifier la fiche RH' }));
    await user.click(within(profile).getByRole('button', { name: 'Contrat et dates' }));
    await user.type(within(profile).getByLabelText('Durée du CDD'), '6');
    await user.selectOptions(within(profile).getByLabelText('Unité de durée'), 'months');
    await user.click(within(profile).getByRole('button', { name: 'Enregistrer la fiche' }));
    await waitFor(() => expect(saveEmploymentContractDetails).toHaveBeenCalledWith(expect.anything(), 7, expect.objectContaining({ endDate: '2024-06-30' })));
    await user.click(screen.getByRole('button', { name: 'Générer le contrat' }));
    await waitFor(() => expect(profileFieldsRender).toHaveBeenLastCalledWith(expect.objectContaining({ useSavedDuration: true,
      details: expect.objectContaining({ endDate: '2024-06-30' }),
    })));
  });

  it('returns to and reloads Documents after successive generations for the same collaborator', async () => {
    const user = userEvent.setup();
    vi.mocked(loadEmploymentContractDetails).mockResolvedValue({ socialSecurityNumber: 'DEMONSTRATION-001', vesselNames: 'Navire fictif', salaryGridRowId: 'post-grid' });
    render(<MemoryRouter><HumanResourcesPage client={{} as SupabaseClient} currentPersonId={7} roles={['admin']} /></MemoryRouter>);
    await screen.findByRole('complementary', { name: 'Fiche RH de Alice MARTIN' });
    for (let generation = 0; generation < 2; generation += 1) {
      if (generation) await user.click(within(screen.getByRole('complementary', { name: 'Fiche RH de Alice MARTIN' })).getByRole('button', { name: 'Contrat et dates' }));
      profileFieldsRender.mockClear();
      await user.click(screen.getByRole('button', { name: 'Générer le contrat' }));
      await screen.findByRole('region', { name: 'Génération du contrat de travail' });
      const onGenerated = profileFieldsRender.mock.lastCall![0].onGenerated;
      act(() => onGenerated());
      const profile = screen.getByRole('complementary', { name: 'Fiche RH de Alice MARTIN' });
      await waitFor(() => expect(within(profile).getByRole('button', { name: 'Documents' })).toHaveAttribute('aria-current', 'page'));
      expect(within(profile).getByRole('region', { name: 'Contrats de travail confidentiels' })).toBeInTheDocument();
    }
  });
});
