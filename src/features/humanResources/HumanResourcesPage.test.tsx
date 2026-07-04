import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HumanResourcesPage } from './HumanResourcesPage';

const activePerson = {
  id: 1,
  user_id: 'user-1',
  first_name: 'Jean',
  last_name: 'MARTIN',
  email: 'jean@example.test',
  function_label: 'Capitaine',
  grade_label: 'Capitaine 200',
  role_label: 'Navigant',
  register_label: 'RIF',
  sex: 'Homme',
  sailor_number: '2009574',
  m365_account: 'jean.martin@bbtm.fr',
  phone: '+33 1 02 03 04 05',
  postal_address: '1 quai des pilotes, 76000 Rouen',
  birth_date: '1985-04-12',
  birth_place: 'Rouen',
  identity_document_number: 'ID-12345',
  identity_document_type: 'Passeport',
  contract_type: 'CDI',
  hired_on: '2024-01-01',
  departed_on: null,
  departure_reason: null,
  emergency_contact_name: 'Marie MARTIN',
  emergency_contact_relationship: 'Conjointe',
  emergency_contact_phone: '+33 6 00 00 00 00',
  emergency_contact_address: '2 rue du Port, 76000 Rouen',
  waist_size: 84,
  chest_size: 102,
  full_height_size: 178,
  inseam_size: 82,
  hip_size: 96,
  weight_kg: 78,
  shoe_size: 43,
  coverall_size: 'L',
  pants_size: '42',
  jacket_size: 'L',
  deck_certificate_label: 'Capitaine 200',
  engine_certificate_label: 'Mecanicien 250 kW',
  crane_training_on: '2025-03-10',
  crane_induction_on: '2025-03-12',
  active: true,
};

const inactivePerson = {
  ...activePerson,
  id: 2,
  user_id: null,
  first_name: 'Paul',
  last_name: 'DURAND',
  email: 'paul@example.test',
  function_label: 'Matelot Polyvalent',
  grade_label: 'Matelot',
  sailor_number: '2011111',
  active: false,
};

const yardManagerPerson = {
  ...activePerson,
  id: 3,
  user_id: null,
  first_name: 'Lea',
  last_name: 'BUREAU',
  email: 'lea@example.test',
  function_label: 'Yard Manager - Le Havre',
  grade_label: 'Officier',
  role_label: 'Sedentaire',
  register_label: 'ENIM',
  sailor_number: '',
  contract_type: 'CDD',
};

interface HrDocumentFixture {
  id: number;
  person_id: number | null;
  person_name: string;
  person_sharepoint_item_id: string;
  category_key: string;
  title: string;
  status: string;
  issued_on: string;
  expires_on: string;
  requires_captain_validation: boolean;
  source_label: string;
  notes: string | null;
  file_url: string | null;
}

const documents: HrDocumentFixture[] = [
  {
    id: 10,
    person_id: 1,
    person_name: 'Jean MARTIN',
    person_sharepoint_item_id: '1',
    category_key: 'medical_visit',
    title: 'Visite medicale',
    status: 'renew_due',
    issued_on: '2025-01-15',
    expires_on: '2026-08-15',
    requires_captain_validation: true,
    source_label: 'SharePoint',
    notes: 'Validation capitaine requise',
    file_url: 'https://sharepoint.test/visite-medicale.pdf',
  },
  {
    id: 11,
    person_id: 1,
    person_name: 'Jean MARTIN',
    person_sharepoint_item_id: '1',
    category_key: 'deck',
    title: 'Capitaine 200',
    status: 'expired',
    issued_on: '2024-01-15',
    expires_on: '2026-01-15',
    requires_captain_validation: false,
    source_label: 'SharePoint',
    notes: null,
    file_url: 'https://sharepoint.test/capitaine-200.pdf',
  },
];

const unassignedDocument: HrDocumentFixture = {
  ...documents[0],
  id: 12,
  person_id: null,
  person_name: 'Julien LECOCQ',
  person_sharepoint_item_id: '42',
  title: 'Brevet pont a rattacher',
  file_url: 'https://sharepoint.test/brevet-pont.pdf',
};

function createOrderedSelect(data: unknown[]) {
  return {
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data, error: null }),
      }),
    }),
  };
}

function createDocumentsSelect(data: HrDocumentFixture[] = documents) {
  return {
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({ data, error: null }),
    }),
  };
}

function createClient(people = [activePerson, inactivePerson], hrDocuments: HrDocumentFixture[] = documents) {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'people') {
        return createOrderedSelect(people);
      }

      if (table === 'hr_documents') {
        return createDocumentsSelect(hrDocuments);
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

describe('HumanResourcesPage', () => {
  it('renders the RH dashboard with active collaborators, document metrics and category summaries', async () => {
    render(<HumanResourcesPage client={createClient() as never} roles={['admin']} />);

    expect(await screen.findByRole('heading', { name: 'Gestion des Ressources Humaines' })).toBeInTheDocument();
    expect(screen.getByText('Evolution des effectifs')).toBeInTheDocument();
    expect(screen.getByLabelText('Effectif RH')).toHaveTextContent('1');
    expect(screen.getByLabelText('A revalider')).toHaveTextContent('2');
    expect(screen.getByLabelText('Certificats a revalider')).toHaveTextContent('1');
    expect(screen.getByLabelText('Visites medicales a revalider')).toHaveTextContent('1');
    expect(screen.getByLabelText('Urgent')).toHaveTextContent('1');
    expect(screen.getByLabelText('Documents echus')).toHaveTextContent('1');
    expect(screen.getByLabelText('Documents manquants')).toHaveTextContent('0');
    expect(screen.getAllByText('Capitaine').length).toBeGreaterThan(0);
    expect(screen.getByText('Jean MARTIN')).toBeInTheDocument();
    expect(screen.queryByText('Paul DURAND')).not.toBeInTheDocument();
    const personRegion = screen.getByRole('region', { name: 'Documents de Jean MARTIN' });
    expect(within(personRegion).getByText('2 document(s)')).toBeInTheDocument();
    expect(within(personRegion).getByRole('button', { name: 'Pont 1' })).toBeInTheDocument();
    expect(within(personRegion).getByRole('button', { name: 'Visite Médicale 1' })).toBeInTheDocument();
    expect(within(personRegion).queryByText('Validation capitaine')).not.toBeInTheDocument();
    expect(within(personRegion).getByText('arrive a echeance le 15/01/2026')).toBeInTheDocument();
    expect(within(personRegion).getByRole('link', { name: 'Capitaine 200' })).toHaveAttribute(
      'href',
      'https://sharepoint.test/capitaine-200.pdf',
    );
    expect(within(personRegion).getByRole('link', { name: 'Capitaine 200' })).toHaveAttribute('target', '_blank');
    expect(within(personRegion).getByText('Visite medicale')).toBeInTheDocument();
  });

  it('collapses collaborator and document category levels with tree chevrons', async () => {
    const user = userEvent.setup();

    render(<HumanResourcesPage client={createClient() as never} roles={['admin']} />);

    const personRegion = await screen.findByRole('region', { name: 'Documents de Jean MARTIN' });
    const collaboratorToggle = within(personRegion).getByRole('button', { name: 'Jean MARTIN' });

    expect(collaboratorToggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(personRegion).getByText('Capitaine 200')).toBeInTheDocument();

    await user.click(collaboratorToggle);

    expect(collaboratorToggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(personRegion).queryByText('Capitaine 200')).not.toBeInTheDocument();

    await user.click(collaboratorToggle);

    const categoryToggle = within(personRegion).getByRole('button', { name: 'Pont 1' });

    expect(categoryToggle).toHaveAttribute('aria-expanded', 'true');

    await user.click(categoryToggle);

    expect(categoryToggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(personRegion).queryByText('Capitaine 200')).not.toBeInTheDocument();

    await user.click(categoryToggle);

    expect(categoryToggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(personRegion).getByText('Capitaine 200')).toBeInTheDocument();
  });

  it('filters the RH dashboard by collaborator, category, status and due state', async () => {
    const user = userEvent.setup();
    const leaDocument = {
      ...documents[0],
      id: 13,
      person_id: 3,
      person_name: 'Lea BUREAU',
      category_key: 'safety_training',
      title: 'CFBS',
      status: 'valid',
      expires_on: '2028-01-17',
    };

    render(
      <HumanResourcesPage client={createClient([activePerson, yardManagerPerson], [...documents, leaDocument]) as never} roles={['admin']} />,
    );

    expect(await screen.findByText('Jean MARTIN')).toBeInTheDocument();
    expect(screen.getByText('Lea BUREAU')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Collaborateur'), '1');
    await user.selectOptions(screen.getByLabelText('Categories'), 'medical_visit');
    await user.selectOptions(screen.getByLabelText('Statut'), 'renew_due');
    await user.selectOptions(screen.getByLabelText('Echeances'), 'renewal_due');

    expect(screen.getByText('Jean MARTIN')).toBeInTheDocument();
    expect(screen.queryByText('Lea BUREAU')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Effectif RH')).toHaveTextContent('1');
    expect(screen.getByText('Visite medicale')).toBeInTheDocument();
    expect(screen.queryByText('Capitaine 200')).not.toBeInTheDocument();
  });

  it('filters the RH dashboard by search and can show inactive collaborators', async () => {
    const user = userEvent.setup();

    render(<HumanResourcesPage client={createClient() as never} roles={['admin']} />);

    await screen.findByText('Jean MARTIN');
    fireEvent.change(screen.getByLabelText('Recherche RH'), { target: { value: 'durand' } });

    expect(screen.queryByText('Jean MARTIN')).not.toBeInTheDocument();
    expect(screen.queryByText('Paul DURAND')).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Afficher les inactifs' }));

    expect(screen.getByText('Paul DURAND')).toBeInTheDocument();
  });

  it('opens a structured personnel file with Dashboard sections', async () => {
    const user = userEvent.setup();

    render(<HumanResourcesPage client={createClient() as never} roles={['admin']} />);

    await user.click(await screen.findByRole('button', { name: 'Ouvrir la fiche de Jean MARTIN' }));

    const dialog = screen.getByRole('dialog', { name: 'Fiche RH Jean MARTIN' });
    const identitySection = within(dialog).getByRole('button', { name: 'Identite et poste' });
    const contractSection = within(dialog).getByRole('button', { name: 'Contrat et dates' });
    const contactSection = within(dialog).getByRole('button', { name: 'Coordonnees' });
    const emergencySection = within(dialog).getByRole('button', { name: 'Contact urgence' });
    const administrativeSection = within(dialog).getByRole('button', { name: 'Documents administratifs' });
    const healthSection = within(dialog).getByRole('button', { name: 'Sante et habilitations' });
    const clothingSection = within(dialog).getByRole('button', { name: 'Tenues et mensurations' });

    expect(identitySection).toHaveAttribute('aria-current', 'step');
    expect(within(dialog).getByText('Numero de marin')).toBeInTheDocument();
    expect(within(dialog).getByText('2009574')).toBeInTheDocument();
    expect(within(dialog).getByText('Compte M365')).toBeInTheDocument();
    expect(within(dialog).getByText('jean.martin@bbtm.fr')).toBeInTheDocument();
    expect(within(dialog).queryByText('Date naissance')).not.toBeInTheDocument();

    await user.click(contractSection);

    expect(contractSection).toHaveAttribute('aria-current', 'step');
    expect(within(dialog).getByText('Date naissance')).toBeInTheDocument();
    expect(within(dialog).getByText('1985-04-12')).toBeInTheDocument();
    expect(within(dialog).getByText('Lieu naissance')).toBeInTheDocument();
    expect(within(dialog).getByText('Rouen')).toBeInTheDocument();

    await user.click(contactSection);

    expect(within(dialog).getByText('Adresse postale')).toBeInTheDocument();
    expect(within(dialog).getByText('1 quai des pilotes, 76000 Rouen')).toBeInTheDocument();

    await user.click(emergencySection);

    expect(within(dialog).getByText('Lien parente')).toBeInTheDocument();
    expect(within(dialog).getByText('Conjointe')).toBeInTheDocument();
    expect(within(dialog).getByText('Adresse urgence')).toBeInTheDocument();
    expect(within(dialog).getByText('2 rue du Port, 76000 Rouen')).toBeInTheDocument();

    await user.click(administrativeSection);

    expect(within(dialog).getByText('Type document identite')).toBeInTheDocument();
    expect(within(dialog).getByText('Passeport')).toBeInTheDocument();
    expect(within(dialog).getByText('Numero document identite')).toBeInTheDocument();
    expect(within(dialog).getByText('ID-12345')).toBeInTheDocument();

    await user.click(healthSection);

    expect(within(dialog).getByText('Brevet Pont')).toBeInTheDocument();
    expect(within(dialog).getByText('Brevet Machine')).toBeInTheDocument();
    expect(within(dialog).getByText('Mecanicien 250 kW')).toBeInTheDocument();
    expect(within(dialog).getByText('Formation grutage')).toBeInTheDocument();
    expect(within(dialog).getByText('2025-03-10')).toBeInTheDocument();

    await user.click(clothingSection);

    expect(within(dialog).getByText('Tour de taille')).toBeInTheDocument();
    expect(within(dialog).getByText('84')).toBeInTheDocument();
    expect(within(dialog).getByText('Pointure')).toBeInTheDocument();
    expect(within(dialog).getByText('43')).toBeInTheDocument();
    expect(within(dialog).getByText('Combinaison')).toBeInTheDocument();
    expect(within(dialog).getByText('Veste')).toBeInTheDocument();
  });

  it('shows HR document metadata and source file links in the personnel file', async () => {
    const user = userEvent.setup();

    render(<HumanResourcesPage client={createClient() as never} roles={['admin']} />);

    await user.click(await screen.findByRole('button', { name: 'Ouvrir la fiche de Jean MARTIN' }));

    const dialog = screen.getByRole('dialog', { name: 'Fiche RH Jean MARTIN' });
    await user.click(within(dialog).getByRole('button', { name: 'Sante et habilitations' }));

    const documentTitle = within(dialog).getByText('Visite medicale');
    const documentItem = documentTitle.closest('li');

    expect(documentItem).not.toBeNull();

    if (!documentItem) {
      return;
    }

    expect(within(documentItem).getByText('Delivre le 15/01/2025')).toBeInTheDocument();
    expect(within(documentItem).getByText('Expire le 15/08/2026')).toBeInTheDocument();
    expect(within(documentItem).getByText('Source SharePoint')).toBeInTheDocument();
    expect(within(documentItem).getByText('Validation capitaine requise')).toBeInTheDocument();
    expect(within(documentItem).getByRole('link', { name: 'Ouvrir le fichier' })).toHaveAttribute(
      'href',
      'https://sharepoint.test/visite-medicale.pdf',
    );
  });

  it('hides SharePoint Brevets library paths from RH document notes', async () => {
    const user = userEvent.setup();
    const documentsWithLibraryPath = [
      {
        ...documents[0],
        notes: '/sites/QHSE/Brevets et Visites Mdicales\r\nNote terrain conservee',
      },
      documents[1],
    ];

    render(<HumanResourcesPage client={createClient([activePerson], documentsWithLibraryPath) as never} roles={['admin']} />);

    expect(await screen.findByText('Visite medicale')).toBeInTheDocument();
    expect(screen.queryByText(/sites\/QHSE\/Brevets et Visites Mdicales/i)).not.toBeInTheDocument();
    expect(screen.getByText('Note terrain conservee')).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Ouvrir la fiche de Jean MARTIN' }));

    const dialog = screen.getByRole('dialog', { name: 'Fiche RH Jean MARTIN' });
    await user.click(within(dialog).getByRole('button', { name: 'Sante et habilitations' }));

    expect(within(dialog).queryByText(/sites\/QHSE\/Brevets et Visites Mdicales/i)).not.toBeInTheDocument();
    expect(within(dialog).getByText('Note terrain conservee')).toBeInTheDocument();
  });

  it('updates the structured personnel file for office roles', async () => {
    const user = userEvent.setup();
    const updatedPerson = {
      ...activePerson,
      phone: '+33 6 11 22 33 44',
      postal_address: '3 quai BBTM, 76600 Le Havre',
      contract_type: 'CDD',
      waist_size: 90,
    };
    const single = vi.fn().mockResolvedValue({ data: updatedPerson, error: null });
    const updateSelect = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select: updateSelect });
    const update = vi.fn().mockReturnValue({ eq });
    const client = createClient([activePerson], documents) as ReturnType<typeof createClient> & {
      from: ReturnType<typeof vi.fn>;
    };

    client.from.mockImplementation((table: string) => {
      if (table === 'people') {
        return {
          ...createOrderedSelect([activePerson]),
          update,
        };
      }

      if (table === 'hr_documents') {
        return createDocumentsSelect(documents);
      }

      throw new Error(`Unexpected table ${table}`);
    });

    render(<HumanResourcesPage client={client as never} roles={['armement']} />);

    await user.click(await screen.findByRole('button', { name: 'Ouvrir la fiche de Jean MARTIN' }));

    const dialog = screen.getByRole('dialog', { name: 'Fiche RH Jean MARTIN' });
    await user.click(within(dialog).getByRole('button', { name: 'Modifier la fiche RH' }));
    await user.click(within(dialog).getByRole('button', { name: 'Coordonnees' }));
    fireEvent.change(within(dialog).getByLabelText('Telephone'), { target: { value: '+33 6 11 22 33 44' } });
    fireEvent.change(within(dialog).getByLabelText('Adresse postale'), {
      target: { value: '3 quai BBTM, 76600 Le Havre' },
    });
    await user.click(within(dialog).getByRole('button', { name: 'Contrat et dates' }));
    fireEvent.change(within(dialog).getByLabelText('Type de contrat'), { target: { value: 'CDD' } });
    await user.click(within(dialog).getByRole('button', { name: 'Tenues et mensurations' }));
    fireEvent.change(within(dialog).getByLabelText('Tour de taille'), { target: { value: '90' } });
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer la fiche' }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          phone: '+33 6 11 22 33 44',
          postal_address: '3 quai BBTM, 76600 Le Havre',
          contract_type: 'CDD',
          waist_size: 90,
        }),
      ),
    );
    expect(eq).toHaveBeenCalledWith('id', 1);
    expect(await screen.findByText('Fiche collaborateur mise a jour.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Coordonnees' }));
    expect(within(dialog).getByText('+33 6 11 22 33 44')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Contrat et dates' }));
    expect(within(dialog).getByText('CDD')).toBeInTheDocument();
  });

  it('shows imported HR documents waiting for collaborator reconciliation to office roles', async () => {
    render(<HumanResourcesPage client={createClient([activePerson], [...documents, unassignedDocument]) as never} roles={['armement']} />);

    expect(await screen.findByRole('heading', { name: 'Gestion des Ressources Humaines' })).toBeInTheDocument();
    expect(screen.getByText('3 documents affiches sur le perimetre RH.')).toBeInTheDocument();
    expect(screen.getByLabelText('Documents manquants')).toHaveTextContent('0');
    expect(screen.queryByRole('region', { name: 'Documents RH a rattacher' })).not.toBeInTheDocument();
  });

  it('creates a personnel record for office roles', async () => {
    const user = userEvent.setup();
    const createdPerson = {
      ...activePerson,
      id: 3,
      user_id: null,
      first_name: 'Marie',
      last_name: 'LEGRAND',
      email: 'marie@example.test',
      function_label: 'Lieutenant',
      grade_label: 'Pont',
      role_label: null,
      register_label: null,
      sex: null,
      sailor_number: null,
      m365_account: null,
    };
    const single = vi.fn().mockResolvedValue({ data: createdPerson, error: null });
    const insertSelect = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select: insertSelect });
    const client = createClient([activePerson], []) as ReturnType<typeof createClient> & {
      from: ReturnType<typeof vi.fn>;
    };

    client.from.mockImplementation((table: string) => {
      if (table === 'people') {
        return {
          ...createOrderedSelect([activePerson]),
          insert,
        };
      }

      if (table === 'hr_documents') {
        return createDocumentsSelect([]);
      }

      throw new Error(`Unexpected table ${table}`);
    });

    render(<HumanResourcesPage client={client as never} roles={['armement']} />);

    await screen.findByText('Jean MARTIN');
    await user.click(screen.getByRole('button', { name: 'Nouveau Collaborateur' }));
    fireEvent.change(screen.getByLabelText('Prenom'), { target: { value: 'Marie' } });
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'LEGRAND' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'marie@example.test' } });
    fireEvent.change(screen.getByLabelText('Fonction'), { target: { value: 'Lieutenant' } });
    fireEvent.change(screen.getByLabelText('Grade'), { target: { value: 'Pont' } });
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(insert).toHaveBeenCalledWith({
        first_name: 'Marie',
        last_name: 'LEGRAND',
        email: 'marie@example.test',
        function_label: 'Lieutenant',
        grade_label: 'Pont',
        role_label: null,
        register_label: null,
        sex: null,
        sailor_number: null,
        m365_account: null,
      }),
    );
    expect(await screen.findByText('Marie LEGRAND')).toBeInTheDocument();
    expect(screen.getByText('Collaborateur ajoute.')).toBeInTheDocument();
  });

  it('keeps marins in read-only mode', async () => {
    render(<HumanResourcesPage client={createClient([activePerson], [...documents, unassignedDocument]) as never} roles={['marin']} />);

    expect(await screen.findByText('Jean MARTIN')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nouveau Collaborateur' })).not.toBeInTheDocument();
    expect(screen.getByText('Lecture seule')).toBeInTheDocument();
    expect(screen.queryByLabelText('Documents a rattacher')).not.toBeInTheDocument();
    expect(screen.queryByText('Brevet pont a rattacher')).not.toBeInTheDocument();
  });
});
