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
  contract_type: 'CDI',
  hired_on: '2024-01-01',
  departed_on: null,
  emergency_contact_name: 'Marie MARTIN',
  emergency_contact_phone: '+33 6 00 00 00 00',
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

const documents = [
  {
    id: 10,
    person_id: 1,
    category_key: 'medical_visit',
    title: 'Visite medicale',
    status: 'renew_due',
    issued_on: '2025-01-15',
    expires_on: '2026-08-15',
    requires_captain_validation: true,
    source_label: 'SharePoint',
    notes: 'Validation capitaine requise',
  },
  {
    id: 11,
    person_id: 1,
    category_key: 'certificate',
    title: 'CGO',
    status: 'expired',
    issued_on: '2024-01-15',
    expires_on: '2026-01-15',
    requires_captain_validation: false,
    source_label: 'SharePoint',
    notes: null,
  },
];

function createOrderedSelect(data: unknown[]) {
  return {
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data, error: null }),
      }),
    }),
  };
}

function createDocumentsSelect(data = documents) {
  return {
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({ data, error: null }),
    }),
  };
}

function createClient(people = [activePerson, inactivePerson], hrDocuments = documents) {
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
    expect(screen.getByLabelText('Effectif RH')).toHaveTextContent('1');
    expect(screen.getByLabelText('Documents RH')).toHaveTextContent('2');
    expect(screen.getByLabelText('Documents a renouveler')).toHaveTextContent('2');
    expect(screen.getByText('Capitaine')).toBeInTheDocument();
    expect(screen.getByText('Jean MARTIN')).toBeInTheDocument();
    expect(screen.queryByText('Paul DURAND')).not.toBeInTheDocument();
    expect(screen.getByText('Visite Medicale')).toBeInTheDocument();
    expect(screen.getByText('Certificats')).toBeInTheDocument();
    expect(screen.getByText('Validation capitaine')).toBeInTheDocument();
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
    expect(within(dialog).getAllByText('Identite et poste').length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText('Contrat et dates').length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText('Coordonnees').length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText('Contact urgence').length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText('Documents administratifs').length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText('Sante et habilitations').length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText('Tenues et mensurations').length).toBeGreaterThan(0);
    expect(within(dialog).getByText('Numero de marin')).toBeInTheDocument();
    expect(within(dialog).getByText('2009574')).toBeInTheDocument();
    expect(within(dialog).getByText('Compte M365')).toBeInTheDocument();
    expect(within(dialog).getByText('jean.martin@bbtm.fr')).toBeInTheDocument();
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
    render(<HumanResourcesPage client={createClient([activePerson], documents) as never} roles={['marin']} />);

    expect(await screen.findByText('Jean MARTIN')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nouveau Collaborateur' })).not.toBeInTheDocument();
    expect(screen.getByText('Lecture seule')).toBeInTheDocument();
  });
});
