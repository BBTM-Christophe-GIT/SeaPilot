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

const formerPerson = {
  ...activePerson,
  id: 2,
  user_id: null,
  first_name: 'Paul',
  last_name: 'DURAND',
  email: 'paul@example.test',
  function_label: 'Matelot Polyvalent',
  grade_label: 'Matelot',
  sailor_number: '2011111',
  departed_on: '2000-01-01',
  active: true,
};

const futureDeparturePerson = {
  ...activePerson,
  id: 4,
  user_id: null,
  first_name: 'Luc',
  last_name: 'AVENIR',
  email: 'luc@example.test',
  departed_on: '2999-12-31',
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
  medical_restriction?: string | null;
  medical_bridge_watch?: boolean | null;
  medical_unfit?: boolean | null;
  source_label: string;
  notes: string | null;
  file_url: string | null;
  storage_bucket?: string | null;
  storage_path?: string | null;
  file_size_bytes?: number | null;
  mime_type?: string | null;
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
    requires_captain_validation: false,
    medical_restriction: '2ème Catégorie',
    medical_bridge_watch: false,
    medical_unfit: false,
    source_label: 'SharePoint',
    notes: null,
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
    file_url: 'sites/QHSE/Brevets et Visites Mdicales/Jean/capitaine-200.pdf',
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

function createClient(people: Array<Record<string, unknown>> = [activePerson, formerPerson], hrDocuments: HrDocumentFixture[] = documents) {
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

    expect(await screen.findByRole('heading', { name: 'Ressources humaines' })).toBeInTheDocument();
    expect(screen.getByText('Évolution des effectifs')).toBeInTheDocument();
    expect(screen.getByLabelText('Effectif RH')).toHaveTextContent('1');
    expect(screen.getByLabelText('À revalider')).toHaveTextContent('2');
    expect(screen.getByLabelText('Certificats a revalider')).toHaveTextContent('1');
    expect(screen.getByLabelText('Visites medicales a revalider')).toHaveTextContent('1');
    expect(screen.getByLabelText('Urgent')).toHaveTextContent('1');
    expect(screen.getByLabelText('Documents echus')).toHaveTextContent('1');
    expect(screen.getByLabelText('Documents manquants')).toHaveTextContent('0');
    expect(screen.getByRole('button', { name: 'Plan de Formation' })).toBeInTheDocument();
    expect(screen.getAllByText('Capitaine').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Afficher la fiche de Jean MARTIN' })).toBeInTheDocument();
    expect(screen.queryByText('Paul DURAND')).not.toBeInTheDocument();
    expect(screen.queryByText('N° marin 2009574')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Actif' })).not.toBeInTheDocument();

    const profile = screen.getByRole('complementary', { name: 'Fiche RH de Jean MARTIN' });
    expect(within(profile).getByRole('button', { name: 'Identité et poste' })).toHaveAttribute('aria-current', 'page');
    expect(within(profile).getByRole('button', { name: 'Documents' })).toBeInTheDocument();
    expect(within(profile).getByText('Numero de marin')).toBeInTheDocument();
    expect(within(profile).getByText('2009574')).toBeInTheDocument();
  });

  it('filters the workforce curve by year and calculates turnover from departure dates', async () => {
    const user = userEvent.setup();
    const analyticsPeople = [
      { ...activePerson, hired_on: '2020-01-01', departed_on: null },
      {
        ...formerPerson,
        id: 20,
        hired_on: '2020-01-01',
        departed_on: '2024-06-15',
        active: false,
      },
      {
        ...activePerson,
        id: 21,
        first_name: 'Alice',
        last_name: 'NOUVELLE',
        hired_on: '2024-03-01',
        departed_on: null,
      },
    ];

    render(<HumanResourcesPage client={createClient(analyticsPeople, []) as never} roles={['admin']} />);

    const chart = await screen.findByRole('region', { name: 'Evolution des effectifs' });
    const periodFilter = within(chart).getByLabelText('Période du graphe des effectifs');
    expect(periodFilter).toHaveValue('all');
    expect(within(periodFilter).getByRole('option', { name: 'Toutes les années' })).toBeInTheDocument();

    await user.selectOptions(periodFilter, '2024');

    expect(within(chart).getByText('Janvier – Déc 2024')).toBeInTheDocument();
    const turnover = within(chart).getByLabelText('Turnover sur 12 mois');
    expect(turnover).toHaveTextContent('Turnover 2024');
    expect(turnover).toHaveTextContent('50 %');
    expect(turnover).toHaveTextContent('1 départ · effectif moyen 2');
    expect(within(chart).getAllByText('3').length).toBeGreaterThan(0);
  });

  it('groups sedentary functions into one distribution row', async () => {
    const sedentaryFunctions = [
      'Directeur QHSE / Chef de Projet',
      'Directrice Administrative et Financière',
      'Fleet Technical Manager',
      'Président',
      'Yard Manager - Le Havre',
    ];
    const sedentaryPeople = sedentaryFunctions.map((functionLabel, index) => ({
      ...activePerson,
      id: index + 10,
      first_name: `Sedentaire${index + 1}`,
      function_label: functionLabel,
      grade_label: 'Sédentaire',
      role_label: 'Navigant',
      user_id: null,
    }));

    render(<HumanResourcesPage client={createClient([activePerson, ...sedentaryPeople], []) as never} roles={['admin']} />);

    const distribution = await screen.findByRole('region', { name: 'Effectifs par fonction' });
    expect(within(distribution).getByText('Sédentaires')).toBeInTheDocument();
    expect(within(distribution).getByText('5')).toBeInTheDocument();
    expect(within(screen.getByLabelText('Effectif RH')).getByText('5')).toBeInTheDocument();
    sedentaryFunctions.forEach((functionLabel) => {
      expect(within(distribution).queryByText(functionLabel)).not.toBeInTheDocument();
    });
  });

  it('shows the selected collaborator in the profile card and collapses document categories', async () => {
    const user = userEvent.setup();

    render(<HumanResourcesPage client={createClient() as never} roles={['admin']} />);

    await user.click(await screen.findByRole('button', { name: 'Afficher la fiche de Jean MARTIN' }));
    const profile = screen.getByRole('complementary', { name: 'Fiche RH de Jean MARTIN' });
    await user.click(within(profile).getByRole('button', { name: 'Documents' }));
    const categoryToggle = within(profile).getByRole('button', { name: 'Pont 1' });

    expect(categoryToggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(profile).getByText('Capitaine 200')).toBeInTheDocument();

    await user.click(categoryToggle);

    expect(categoryToggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(profile).queryByText('Capitaine 200')).not.toBeInTheDocument();
  });

  it('does not render the role visibility access controls', async () => {
    render(<HumanResourcesPage client={createClient() as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Ressources humaines' });
    expect(screen.queryByRole('button', { name: 'Paramétrer les accès' })).not.toBeInTheDocument();
    expect(screen.queryByText('Visibilité par rôle')).not.toBeInTheDocument();
    expect(screen.queryByText('Fonctions, documents et sections')).not.toBeInTheDocument();
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

    expect(await screen.findByRole('button', { name: 'Afficher la fiche de Jean MARTIN' })).toBeInTheDocument();
    expect(screen.getByText('Lea BUREAU')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'S\u00e9dentaire, 1 collaborateur(s)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yard Manager - Le Havre, niveau 2, 1 collaborateur(s)' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Afficher la fiche de Lea BUREAU' }));
    expect(screen.getByRole('complementary', { name: 'Fiche RH de Lea BUREAU' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Afficher les filtres' }));
    await user.selectOptions(screen.getByLabelText('Collaborateur'), '1');
    await user.selectOptions(screen.getByLabelText('Catégories'), 'medical_visit');
    await user.selectOptions(screen.getByLabelText('Statut'), 'renew_due');
    await user.selectOptions(screen.getByLabelText('Échéances'), 'renewal_due');

    expect(screen.getByRole('button', { name: 'Afficher la fiche de Jean MARTIN' })).toBeInTheDocument();
    expect(screen.queryByText('Lea BUREAU')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Effectif RH')).toHaveTextContent('1');
    await user.click(screen.getByRole('button', { name: 'Afficher la fiche de Jean MARTIN' }));
    const profile = screen.getByRole('complementary', { name: 'Fiche RH de Jean MARTIN' });
    await user.click(within(profile).getByRole('button', { name: 'Documents' }));
    expect(within(profile).getByText('Visite medicale')).toBeInTheDocument();
    expect(within(profile).getByText('Capitaine 200')).toBeInTheDocument();
  });

  it('uses departure dates for the roster and can switch to former collaborators', async () => {
    const user = userEvent.setup();

    render(<HumanResourcesPage client={createClient([activePerson, formerPerson, futureDeparturePerson]) as never} roles={['admin']} />);

    const currentPersonRow = await screen.findByRole('button', { name: 'Afficher la fiche de Jean MARTIN' });
    expect(screen.getByRole('button', { name: 'Afficher la fiche de Luc AVENIR' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Afficher la fiche de Paul DURAND' })).not.toBeInTheDocument();
    expect(within(currentPersonRow).queryByText('Actif')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Recherche RH'), { target: { value: 'durand' } });

    expect(screen.queryByText('Jean MARTIN')).not.toBeInTheDocument();
    expect(screen.queryByText('Paul DURAND')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Voir les anciens' }));

    expect(screen.getByRole('button', { name: 'Afficher la fiche de Paul DURAND' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voir les personnes en poste' })).toBeInTheDocument();
  });

  it('opens a structured personnel file with Dashboard sections', async () => {
    const user = userEvent.setup();

    render(<HumanResourcesPage client={createClient() as never} roles={['admin']} />);

    const profile = await screen.findByRole('complementary', { name: 'Fiche RH de Jean MARTIN' });
    const identitySection = within(profile).getByRole('button', { name: 'Identité et poste' });
    const contractSection = within(profile).getByRole('button', { name: 'Contrat et dates' });
    const contactSection = within(profile).getByRole('button', { name: 'Coordonnées' });
    const emergencySection = within(profile).getByRole('button', { name: 'Contact urgence' });
    const administrativeSection = within(profile).getByRole('button', { name: 'Documents administratifs' });
    const healthSection = within(profile).getByRole('button', { name: 'Santé et habilitations' });
    const clothingSection = within(profile).getByRole('button', { name: 'Tenues et mensurations' });

    expect(identitySection).toHaveAttribute('aria-current', 'page');
    expect(within(profile).getByText('Numero de marin')).toBeInTheDocument();
    expect(within(profile).getByText('2009574')).toBeInTheDocument();
    expect(within(profile).getByText('Compte M365')).toBeInTheDocument();
    expect(within(profile).getByText('jean.martin@bbtm.fr')).toBeInTheDocument();
    expect(within(profile).queryByText('Date naissance')).not.toBeInTheDocument();

    await user.click(contractSection);

    expect(contractSection).toHaveAttribute('aria-current', 'page');
    expect(within(profile).getByText('Date naissance')).toBeInTheDocument();
    expect(within(profile).getByText('1985-04-12')).toBeInTheDocument();
    expect(within(profile).getByText('Lieu naissance')).toBeInTheDocument();
    expect(within(profile).getByText('Rouen')).toBeInTheDocument();

    await user.click(contactSection);

    expect(within(profile).getByText('Adresse postale')).toBeInTheDocument();
    expect(within(profile).getByText('1 quai des pilotes, 76000 Rouen')).toBeInTheDocument();

    await user.click(emergencySection);

    expect(within(profile).getByText('Lien parente')).toBeInTheDocument();
    expect(within(profile).getByText('Conjointe')).toBeInTheDocument();
    expect(within(profile).getByText('Adresse urgence')).toBeInTheDocument();
    expect(within(profile).getByText('2 rue du Port, 76000 Rouen')).toBeInTheDocument();

    await user.click(administrativeSection);

    expect(within(profile).getByText('Type document identite')).toBeInTheDocument();
    expect(within(profile).getByText('Passeport')).toBeInTheDocument();
    expect(within(profile).getByText('Numero document identite')).toBeInTheDocument();
    expect(within(profile).getByText('ID-12345')).toBeInTheDocument();

    await user.click(healthSection);

    expect(within(profile).getByText('Brevet Pont')).toBeInTheDocument();
    expect(within(profile).getByText('Brevet Machine')).toBeInTheDocument();
    expect(within(profile).getByText('Mecanicien 250 kW')).toBeInTheDocument();
    expect(within(profile).getByText('Formation grutage')).toBeInTheDocument();
    expect(within(profile).getByText('2025-03-10')).toBeInTheDocument();

    await user.click(clothingSection);

    expect(within(profile).getByText('Tour de taille')).toBeInTheDocument();
    expect(within(profile).getByText('84')).toBeInTheDocument();
    expect(within(profile).getByText('Pointure')).toBeInTheDocument();
    expect(within(profile).getByText('43')).toBeInTheDocument();
    expect(within(profile).getByText('Combinaison')).toBeInTheDocument();
    expect(within(profile).getByText('Veste')).toBeInTheDocument();
  });

  it('shows linked HR documents in the Documents section', async () => {
    const user = userEvent.setup();

    render(<HumanResourcesPage client={createClient() as never} roles={['admin']} />);

    const profile = await screen.findByRole('complementary', { name: 'Fiche RH de Jean MARTIN' });
    await user.click(within(profile).getByRole('button', { name: 'Documents' }));

    expect(within(profile).getByText('Visite medicale')).toBeInTheDocument();
    expect(within(profile).getByText('Expire le 15/08/2026')).toBeInTheDocument();
    expect(within(profile).getByText('Capitaine 200')).toBeInTheDocument();
  });

  it('adds a catalog document with an expiry date and the SPFx automatic file name', async () => {
    const user = userEvent.setup();
    const catalogRows = [
      {
        id: 25,
        source_item_id: 25,
        name: 'CFBS - Certificat de Formation de Base à la Sécurité',
        category: 'Formation de Sécurité',
        file_name: 'CFBS',
      },
    ];
    const file = new File(['certificate'], 'scan-cfbs.pdf', { type: 'application/pdf' });
    const storagePath = 'people/1/Jean MARTIN - CFBS - 2030.pdf';
    const createdDocument = {
      ...documents[1],
      id: 42,
      category_key: 'safety_training',
      title: 'Jean MARTIN - CFBS - 2030',
      status: 'valid',
      issued_on: null,
      expires_on: '2030-06-30',
      source_label: 'supabase',
      notes: null,
      file_url: null,
      storage_bucket: 'hr-documents',
      storage_path: storagePath,
      file_size_bytes: file.size,
      mime_type: 'application/pdf',
    };
    const upload = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });
    const createdSingle = vi.fn().mockResolvedValue({ data: createdDocument, error: null });
    const insertedSelect = vi.fn().mockReturnValue({ single: createdSingle });
    const insert = vi.fn().mockReturnValue({ select: insertedSelect });
    const catalogueOrderByName = vi.fn().mockResolvedValue({ data: catalogRows, error: null });
    const catalogueOrderByCategory = vi.fn().mockReturnValue({ order: catalogueOrderByName });
    const catalogueEq = vi.fn().mockReturnValue({ order: catalogueOrderByCategory });
    const catalogueSelect = vi.fn().mockReturnValue({ eq: catalogueEq });
    const client = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'people') return createOrderedSelect([activePerson]);
        if (table === 'hr_documents') return { ...createDocumentsSelect(documents), insert };
        if (table === 'stcw_certificates') return { select: catalogueSelect };
        throw new Error(`Unexpected table ${table}`);
      }),
      storage: {
        from: vi.fn().mockReturnValue({ upload, remove }),
      },
    };

    render(<HumanResourcesPage client={client as never} roles={['armement']} />);

    const profile = await screen.findByRole('complementary', { name: 'Fiche RH de Jean MARTIN' });
    await user.click(within(profile).getByRole('button', { name: 'Documents' }));
    await user.click(within(profile).getByRole('button', { name: 'Ajouter un document' }));

    const dialog = screen.getByRole('dialog', { name: 'Ajouter un document pour Jean MARTIN' });
    await user.selectOptions(within(dialog).getByLabelText('Brevet / document'), '25');
    fireEvent.change(within(dialog).getByLabelText("Date d'echeance"), { target: { value: '2030-06-30' } });
    await user.upload(within(dialog).getByLabelText('Fichier'), file);

    expect(within(dialog).getByLabelText('Nom genere')).toHaveValue('Jean MARTIN - CFBS - 2030.pdf');
    expect(within(dialog).getByRole('button', { name: 'Creer le document' })).toBeEnabled();
    fireEvent.submit(dialog.querySelector('form') as HTMLFormElement);

    await waitFor(() => expect(upload).toHaveBeenCalledWith(storagePath, file, { contentType: 'application/pdf', upsert: false }));
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      category_key: 'safety_training',
      expires_on: '2030-06-30',
      storage_path: storagePath,
      title: 'Jean MARTIN - CFBS - 2030',
    }));
    expect(await screen.findByText('Document ajoute.')).toBeInTheDocument();
    expect(within(profile).getByText('CFBS')).toBeInTheDocument();
  });

  it('downloads one selected HR document with the stored file extension', async () => {
    const user = userEvent.setup();
    const wordDocument: HrDocumentFixture = {
      ...documents[1],
      id: 43,
      category_key: 'administrative',
      title: 'Jean MARTIN - Contrat - 2030',
      file_url: 'https://sharepoint.test/documents/contrat-signe.docx?download=1',
      mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    const fetchMock = vi.fn().mockResolvedValue({
      blob: () => Promise.resolve(new Blob(['document'])),
      ok: true,
    });
    const originalFetch = globalThis.fetch;
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    const createObjectURL = vi.fn(() => 'blob:document-rh');
    const revokeObjectURL = vi.fn();
    let downloadedFileName = '';
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloadedFileName = this.download;
    });
    globalThis.fetch = fetchMock as typeof fetch;
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });

    try {
      render(<HumanResourcesPage client={createClient([activePerson], [wordDocument]) as never} roles={['admin']} />);

      const profile = await screen.findByRole('complementary', { name: 'Fiche RH de Jean MARTIN' });
      await user.click(within(profile).getByRole('button', { name: 'Documents' }));
      await user.click(within(profile).getByRole('checkbox', { name: 'Sélectionner Jean MARTIN - Contrat - 2030' }));
      await user.click(screen.getByRole('button', { name: 'Telecharger' }));

      await waitFor(() => expect(downloadedFileName).toBe('Jean MARTIN - Contrat - 2030.docx'));
      expect(fetchMock).toHaveBeenCalledWith(wordDocument.file_url, { credentials: 'include' });
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:document-rh');
    } finally {
      globalThis.fetch = originalFetch;
      Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: originalCreateObjectUrl });
      Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: originalRevokeObjectUrl });
      clickSpy.mockRestore();
    }
  });

  it('downloads multiple selected HR documents as a ZIP archive', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      blob: () => Promise.resolve(new Blob(['document'], { type: 'application/pdf' })),
      ok: true,
    });
    const originalFetch = globalThis.fetch;
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    const createObjectURL = vi.fn(() => 'blob:documents-rh');
    const revokeObjectURL = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    globalThis.fetch = fetchMock as typeof fetch;
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });

    try {
      render(<HumanResourcesPage client={createClient() as never} roles={['admin']} />);

      const profile = await screen.findByRole('complementary', { name: 'Fiche RH de Jean MARTIN' });
      await user.click(within(profile).getByRole('button', { name: 'Documents' }));
      await user.click(within(profile).getByRole('checkbox', { name: 'Sélectionner Visite medicale' }));
      await user.click(within(profile).getByRole('checkbox', { name: 'Sélectionner Capitaine 200' }));

      const selectionBar = screen.getByRole('region', { name: 'Selection documentaire RH' });
      expect(selectionBar).toHaveTextContent('2 document(s) selectionne(s)');
      await user.click(within(selectionBar).getByRole('button', { name: 'Telecharger' }));

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.queryByRole('region', { name: 'Selection documentaire RH' })).not.toBeInTheDocument());
      expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:documents-rh');
    } finally {
      globalThis.fetch = originalFetch;
      Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: originalCreateObjectUrl });
      Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: originalRevokeObjectUrl });
      clickSpy.mockRestore();
    }
  });

  it('uses controlled dropdowns for structured personnel fields and departure reasons', async () => {
    const user = userEvent.setup();

    render(<HumanResourcesPage client={createClient() as never} roles={['admin']} />);

    const profile = await screen.findByRole('complementary', { name: 'Fiche RH de Jean MARTIN' });
    await user.click(within(profile).getByRole('button', { name: 'Modifier la fiche RH' }));
    await user.click(within(profile).getByRole('button', { name: 'Contrat et dates' }));

    const departureReason = within(profile).getByLabelText('Cause depart');
    expect(departureReason).toHaveRole('combobox');
    expect(within(departureReason).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Non renseigné',
      'Autres',
      'Décès',
      'Démission',
      'Fin de contrat',
      "Fin Période d'essai",
      'Licenciement économique',
      'Licenciement individuel',
      'Retraite',
      'Rupture conventionnelle',
    ]);
    await user.selectOptions(departureReason, 'Retraite');
    expect(departureReason).toHaveValue('Retraite');

    await user.click(within(profile).getByRole('button', { name: 'Documents administratifs' }));

    expect(within(profile).getByLabelText('Type document identite')).toHaveRole('combobox');
    expect(within(profile).getByLabelText('Type document identite')).toHaveValue('Passeport');
  });

  it('edits the medical visit statement directly from Sante et habilitations', async () => {
    const user = userEvent.setup();
    const updatedMedicalDocument = {
      ...documents[0],
      medical_restriction: null,
      medical_bridge_watch: true,
      medical_unfit: false,
    };
    const personSingle = vi.fn().mockResolvedValue({ data: activePerson, error: null });
    const personSelect = vi.fn().mockReturnValue({ single: personSingle });
    const personEq = vi.fn().mockReturnValue({ select: personSelect });
    const personUpdate = vi.fn().mockReturnValue({ eq: personEq });
    const documentSingle = vi.fn().mockResolvedValue({ data: updatedMedicalDocument, error: null });
    const documentUpdateSelect = vi.fn().mockReturnValue({ single: documentSingle });
    const documentEq = vi.fn().mockReturnValue({ select: documentUpdateSelect });
    const documentUpdate = vi.fn().mockReturnValue({ eq: documentEq });
    const client = createClient([activePerson], documents) as ReturnType<typeof createClient> & {
      from: ReturnType<typeof vi.fn>;
    };

    client.from.mockImplementation((table: string) => {
      if (table === 'people') {
        return {
          ...createOrderedSelect([activePerson]),
          update: personUpdate,
        };
      }

      if (table === 'hr_documents') {
        return {
          ...createDocumentsSelect(documents),
          update: documentUpdate,
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    render(<HumanResourcesPage client={client as never} roles={['armement']} />);

    const profile = await screen.findByRole('complementary', { name: 'Fiche RH de Jean MARTIN' });
    await user.click(within(profile).getByRole('button', { name: 'Modifier la fiche RH' }));
    await user.click(within(profile).getByRole('button', { name: 'Santé et habilitations' }));

    const withoutBridgeWatch = within(profile).getByRole('checkbox', { name: /n'impliquant pas la veille/i });
    const withBridgeWatch = within(profile).getByRole('checkbox', { name: /y compris la veille/i });
    expect(withoutBridgeWatch).toBeChecked();

    await user.click(withBridgeWatch);
    await user.clear(within(profile).getByLabelText('Est apte avec les restrictions suivantes'));
    await user.click(within(profile).getByRole('button', { name: 'Enregistrer la fiche' }));

    await waitFor(() =>
      expect(documentUpdate).toHaveBeenCalledWith({
        medical_bridge_watch: true,
        medical_restriction: null,
        medical_unfit: false,
      }),
    );
    expect(documentEq).toHaveBeenCalledWith('id', documents[0].id);
    await user.click(within(profile).getByRole('button', { name: 'Santé et habilitations' }));
    expect(
      within(profile).getByText(
        'Remplit les conditions médicales requises pour toutes les fonctions à bord y compris la veille à la passerelle',
      ),
    ).toBeInTheDocument();
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

    const profile = await screen.findByRole('complementary', { name: 'Fiche RH de Jean MARTIN' });
    await user.click(within(profile).getByRole('button', { name: 'Documents' }));

    expect(within(profile).queryByText(/sites\/QHSE\/Brevets et Visites Mdicales/i)).not.toBeInTheDocument();
    expect(within(profile).getByText('Visite medicale')).toBeInTheDocument();
  });

  it('updates the structured personnel file for office roles', async () => {
    const user = userEvent.setup();
    const updatedPerson = {
      ...activePerson,
      phone: '+33 6 11 22 33 44',
      postal_address: '3 quai BBTM, 76600 Le Havre',
      contract_type: 'CDD',
      departure_reason: 'Retraite',
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

    const profile = await screen.findByRole('complementary', { name: 'Fiche RH de Jean MARTIN' });
    await user.click(within(profile).getByRole('button', { name: 'Modifier la fiche RH' }));
    await user.click(within(profile).getByRole('button', { name: 'Coordonnées' }));
    fireEvent.change(within(profile).getByLabelText('Telephone'), { target: { value: '+33 6 11 22 33 44' } });
    fireEvent.change(within(profile).getByLabelText('Adresse postale'), {
      target: { value: '3 quai BBTM, 76600 Le Havre' },
    });
    await user.click(within(profile).getByRole('button', { name: 'Contrat et dates' }));
    fireEvent.change(within(profile).getByLabelText('Type de contrat'), { target: { value: 'CDD' } });
    await user.selectOptions(within(profile).getByLabelText('Cause depart'), 'Retraite');
    await user.click(within(profile).getByRole('button', { name: 'Tenues et mensurations' }));
    fireEvent.change(within(profile).getByLabelText('Tour de taille'), { target: { value: '90' } });
    await user.click(within(profile).getByRole('button', { name: 'Enregistrer la fiche' }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          phone: '+33 6 11 22 33 44',
          postal_address: '3 quai BBTM, 76600 Le Havre',
          contract_type: 'CDD',
          departure_reason: 'Retraite',
          waist_size: 90,
        }),
      ),
    );
    expect(eq).toHaveBeenCalledWith('id', 1);
    expect(await screen.findByText('Fiche collaborateur mise a jour.')).toBeInTheDocument();
    await user.click(within(profile).getByRole('button', { name: 'Coordonnées' }));
    expect(within(profile).getByText('+33 6 11 22 33 44')).toBeInTheDocument();
    await user.click(within(profile).getByRole('button', { name: 'Contrat et dates' }));
    expect(within(profile).getByText('CDD')).toBeInTheDocument();
    expect(within(profile).getByText('Retraite')).toBeInTheDocument();
  });

  it('shows imported HR documents waiting for collaborator reconciliation to office roles', async () => {
    render(<HumanResourcesPage client={createClient([activePerson], [...documents, unassignedDocument]) as never} roles={['armement']} />);

    expect(await screen.findByRole('heading', { name: 'Ressources humaines' })).toBeInTheDocument();
    expect(screen.getByText('Pilotage RH analytique · 3 documents suivis')).toBeInTheDocument();
    expect(screen.getByLabelText('Documents manquants')).toHaveTextContent('0');
    expect(screen.queryByRole('region', { name: 'Documents RH a rattacher' })).not.toBeInTheDocument();
  });

  it('creates a complete Supabase personnel record from all RH sections', async () => {
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

    await screen.findByRole('button', { name: 'Afficher la fiche de Jean MARTIN' });
    await user.click(screen.getByRole('button', { name: 'Nouveau Collaborateur' }));
    const dialog = screen.getByRole('dialog', { name: 'Nouveau collaborateur' });
    expect(within(dialog).getAllByRole('button', { name: /Identité et poste|Contrat et dates|Coordonnées|Contact urgence|Documents administratifs|Santé et habilitations|Tenues et mensurations|Documents/ })).toHaveLength(8);
    fireEvent.change(within(dialog).getByLabelText('Prénom'), { target: { value: 'Marie' } });
    fireEvent.change(within(dialog).getByLabelText('Nom'), { target: { value: 'LEGRAND' } });
    fireEvent.change(within(dialog).getByLabelText('Email'), { target: { value: 'marie@example.test' } });
    fireEvent.change(within(dialog).getByLabelText('Fonction'), { target: { value: 'Lieutenant' } });
    fireEvent.change(within(dialog).getByLabelText('Grade'), { target: { value: 'Pont' } });
    await user.click(within(dialog).getByRole('button', { name: 'Contrat et dates' }));
    await user.selectOptions(within(dialog).getByLabelText('Type de contrat'), 'CDI');
    fireEvent.change(within(dialog).getByLabelText('Date embauche'), { target: { value: '2026-08-01' } });
    fireEvent.change(within(dialog).getByLabelText('Date naissance'), { target: { value: '1990-05-12' } });
    await user.click(within(dialog).getByRole('button', { name: 'Coordonnées' }));
    fireEvent.change(within(dialog).getByLabelText('Téléphone'), { target: { value: '+33 6 10 20 30 40' } });
    fireEvent.change(within(dialog).getByLabelText('Adresse postale'), { target: { value: '5 quai de France, Rouen' } });
    await user.click(within(dialog).getByRole('button', { name: 'Contact urgence' }));
    fireEvent.change(within(dialog).getByLabelText('Contact'), { target: { value: 'Paul LEGRAND' } });
    fireEvent.change(within(dialog).getByLabelText('Téléphone urgence'), { target: { value: '+33 6 99 88 77 66' } });
    await user.click(within(dialog).getByRole('button', { name: 'Documents administratifs' }));
    await user.selectOptions(within(dialog).getByLabelText('Type document identité'), 'Passeport');
    fireEvent.change(within(dialog).getByLabelText('Numéro document identité'), { target: { value: 'FR123456' } });
    await user.click(within(dialog).getByRole('button', { name: 'Santé et habilitations' }));
    fireEvent.change(within(dialog).getByLabelText('Brevet Pont'), { target: { value: 'Capitaine 200' } });
    fireEvent.change(within(dialog).getByLabelText('Formation grutage'), { target: { value: '2026-06-15' } });
    await user.click(within(dialog).getByRole('button', { name: 'Tenues et mensurations' }));
    fireEvent.change(within(dialog).getByLabelText('Combinaison'), { target: { value: 'M' } });
    fireEvent.change(within(dialog).getByLabelText('Pointure'), { target: { value: '39' } });
    await user.click(within(dialog).getByRole('button', { name: 'Documents' }));
    expect(within(dialog).getByText('Documents à rattacher après création')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(insert).toHaveBeenCalledWith(expect.objectContaining({
        first_name: 'Marie',
        last_name: 'LEGRAND',
        email: 'marie@example.test',
        function_label: 'Lieutenant',
        grade_label: 'Pont',
        contract_type: 'CDI',
        hired_on: '2026-08-01',
        birth_date: '1990-05-12',
        phone: '+33 6 10 20 30 40',
        postal_address: '5 quai de France, Rouen',
        emergency_contact_name: 'Paul LEGRAND',
        emergency_contact_phone: '+33 6 99 88 77 66',
        identity_document_type: 'Passeport',
        identity_document_number: 'FR123456',
        deck_certificate_label: 'Capitaine 200',
        crane_training_on: '2026-06-15',
        coverall_size: 'M',
        shoe_size: 39,
      })),
    );
    expect(await screen.findByRole('button', { name: 'Afficher la fiche de Marie LEGRAND' })).toBeInTheDocument();
    expect(screen.getByText('Collaborateur ajoute.')).toBeInTheDocument();
  });

  it('keeps marins in read-only mode', async () => {
    render(<HumanResourcesPage client={createClient([activePerson], [...documents, unassignedDocument]) as never} roles={['marin']} />);

    expect(await screen.findByRole('button', { name: 'Afficher la fiche de Jean MARTIN' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nouveau Collaborateur' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Lecture seule').length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('Documents a rattacher')).not.toBeInTheDocument();
    expect(screen.queryByText('Brevet pont a rattacher')).not.toBeInTheDocument();
  });
});
