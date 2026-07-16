import { describe, expect, it, vi } from 'vitest';
import {
  buildHumanResourcesDashboard,
  buildHumanResourcesRosterGroups,
  buildStaffEvolution,
  createPerson,
  fetchHumanResourcesData,
  fetchPeople,
  getHrFunctionVisibilityKey,
  mapHrDocumentRows,
  mapPersonRows,
  normalizeHrFunctionLabel,
  renewHrDocument,
  saveHrVisibilityRules,
  updateHrDocumentMedicalDetails,
  updatePersonDetails,
  updatePersonActive,
} from './peopleQueries';

const personRow = {
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

const documentRow = {
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
};

describe('mapPersonRows', () => {
  it('maps Supabase people rows to personnel records', () => {
    expect(mapPersonRows([personRow])).toEqual([
      {
        id: 1,
        userId: 'user-1',
        firstName: 'Jean',
        lastName: 'MARTIN',
        email: 'jean@example.test',
        functionLabel: 'Capitaine',
        gradeLabel: 'Capitaine 200',
        roleLabel: 'Navigant',
        registerLabel: 'RIF',
        sex: 'Homme',
        sailorNumber: '2009574',
        m365Account: 'jean.martin@bbtm.fr',
        phone: '+33 1 02 03 04 05',
        postalAddress: '1 quai des pilotes, 76000 Rouen',
        birthDate: '1985-04-12',
        birthPlace: 'Rouen',
        identityDocumentNumber: 'ID-12345',
        identityDocumentType: 'Passeport',
        contractType: 'CDI',
        hiredOn: '2024-01-01',
        departedOn: '',
        departureReason: '',
        emergencyContactName: 'Marie MARTIN',
        emergencyContactRelationship: 'Conjointe',
        emergencyContactPhone: '+33 6 00 00 00 00',
        emergencyContactAddress: '2 rue du Port, 76000 Rouen',
        waistSize: '84',
        chestSize: '102',
        fullHeightSize: '178',
        inseamSize: '82',
        hipSize: '96',
        weightKg: '78',
        shoeSize: '43',
        coverallSize: 'L',
        pantsSize: '42',
        jacketSize: 'L',
        deckCertificateLabel: 'Capitaine 200',
        engineCertificateLabel: 'Mecanicien 250 kW',
        craneTrainingOn: '2025-03-10',
        craneInductionOn: '2025-03-12',
        active: true,
      },
    ]);
  });

  it('normalizes nullable labels to empty strings', () => {
    expect(
      mapPersonRows([
        {
          ...personRow,
          user_id: null,
          email: null,
          function_label: null,
          grade_label: null,
          role_label: null,
          register_label: null,
          sex: null,
          sailor_number: null,
          m365_account: null,
          phone: null,
          postal_address: null,
          birth_date: null,
          birth_place: null,
          identity_document_number: null,
          identity_document_type: null,
          contract_type: null,
          hired_on: null,
          departed_on: null,
          departure_reason: null,
          emergency_contact_name: null,
          emergency_contact_relationship: null,
          emergency_contact_phone: null,
          emergency_contact_address: null,
          waist_size: null,
          chest_size: null,
          full_height_size: null,
          inseam_size: null,
          hip_size: null,
          weight_kg: null,
          shoe_size: null,
          coverall_size: null,
          pants_size: null,
          jacket_size: null,
          deck_certificate_label: null,
          engine_certificate_label: null,
          crane_training_on: null,
          crane_induction_on: null,
        },
      ]),
    ).toEqual([
      {
        id: 1,
        userId: null,
        firstName: 'Jean',
        lastName: 'MARTIN',
        email: '',
        functionLabel: '',
        gradeLabel: '',
        roleLabel: '',
        registerLabel: '',
        sex: '',
        sailorNumber: '',
        m365Account: '',
        phone: '',
        postalAddress: '',
        birthDate: '',
        birthPlace: '',
        identityDocumentNumber: '',
        identityDocumentType: '',
        contractType: '',
        hiredOn: '',
        departedOn: '',
        departureReason: '',
        emergencyContactName: '',
        emergencyContactRelationship: '',
        emergencyContactPhone: '',
        emergencyContactAddress: '',
        waistSize: '',
        chestSize: '',
        fullHeightSize: '',
        inseamSize: '',
        hipSize: '',
        weightKg: '',
        shoeSize: '',
        coverallSize: '',
        pantsSize: '',
        jacketSize: '',
        deckCertificateLabel: '',
        engineCertificateLabel: '',
        craneTrainingOn: '',
        craneInductionOn: '',
        active: true,
      },
    ]);
  });
});

describe('mapHrDocumentRows', () => {
  it('maps Supabase HR document rows to document records', () => {
    expect(mapHrDocumentRows([documentRow])).toEqual([
      {
        id: 10,
        personId: 1,
        personName: 'Jean MARTIN',
        personSharePointItemId: '1',
        categoryKey: 'medical_visit',
        title: 'Visite medicale',
        status: 'renew_due',
        issuedOn: '2025-01-15',
        expiresOn: '2026-08-15',
        requiresCaptainValidation: true,
        medicalRestriction: '',
        medicalBridgeWatch: null,
        medicalUnfit: false,
        sourceLabel: 'SharePoint',
        notes: 'Validation capitaine requise',
        fileUrl: 'https://sharepoint.test/visite-medicale.pdf',
        storageBucket: '',
        storagePath: '',
        fileSizeBytes: null,
        mimeType: '',
      },
    ]);
  });

  it('keeps imported documents without a resolved collaborator link', () => {
    expect(mapHrDocumentRows([{ ...documentRow, person_id: null, person_name: 'Julien LECOCQ', person_sharepoint_item_id: '42' }])).toEqual([
      expect.objectContaining({
        personId: null,
        personName: 'Julien LECOCQ',
        personSharePointItemId: '42',
      }),
    ]);
  });
});

describe('renewHrDocument', () => {
  it('normalizes accented storage keys, updates metadata and removes the previous Supabase object', async () => {
    const person = mapPersonRows([{ ...personRow, id: 31, first_name: 'Boris', last_name: 'BROT' }])[0];
    const document = mapHrDocumentRows([
      {
        ...documentRow,
        person_id: 31,
        person_name: 'Boris BROT',
        title: 'Visite Médicale',
        storage_bucket: 'hr-documents',
        storage_path: 'people/31/old-medical.pdf',
        medical_restriction: null,
        medical_bridge_watch: true,
        medical_unfit: false,
      },
    ])[0];
    const file = new File(['medical'], 'certificat.pdf', { type: 'application/pdf' });
    const expectedStoragePath = 'people/31/Boris BROT - Visite Medicale - 2029.pdf';
    const upload = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });
    const single = vi.fn().mockResolvedValue({
      data: {
        ...documentRow,
        person_id: 31,
        person_name: 'Boris BROT',
        title: 'Boris BROT - Visite Médicale - 2029',
        status: 'valid',
        expires_on: '2029-07-05',
        source_label: 'supabase',
        file_url: null,
        storage_bucket: 'hr-documents',
        storage_path: expectedStoragePath,
        file_size_bytes: file.size,
        mime_type: 'application/pdf',
        medical_restriction: '2eme Categorie',
        medical_bridge_watch: false,
        medical_unfit: false,
      },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    const storageFrom = vi.fn().mockReturnValue({ upload, remove });
    const from = vi.fn().mockReturnValue({ update });

    await expect(
      renewHrDocument(
        {
          from,
          storage: {
            from: storageFrom,
          },
        } as never,
        {
          document,
          dueDate: '2029-07-05',
          file,
          medicalBridgeWatch: false,
          medicalRestriction: '2eme Categorie',
          medicalUnfit: false,
          person,
        },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        expiresOn: '2029-07-05',
        fileSizeBytes: file.size,
        medicalBridgeWatch: false,
        medicalRestriction: '2eme Categorie',
        sourceLabel: 'supabase',
        storagePath: expectedStoragePath,
      }),
    );

    expect(upload).toHaveBeenCalledWith(expectedStoragePath, file, {
      contentType: 'application/pdf',
      upsert: false,
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        expires_on: '2029-07-05',
        file_size_bytes: file.size,
        file_url: null,
        medical_bridge_watch: false,
        medical_restriction: '2eme Categorie',
        medical_unfit: false,
        mime_type: 'application/pdf',
        source_label: 'supabase',
        storage_bucket: 'hr-documents',
        storage_path: expectedStoragePath,
      }),
    );
    expect(remove).toHaveBeenCalledWith(['people/31/old-medical.pdf']);
  });
});

describe('updateHrDocumentMedicalDetails', () => {
  it('updates the medical statement independently from document renewal', async () => {
    const updatedRow = {
      ...documentRow,
      medical_restriction: null,
      medical_bridge_watch: true,
      medical_unfit: false,
    };
    const single = vi.fn().mockResolvedValue({ data: updatedRow, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });

    await expect(
      updateHrDocumentMedicalDetails({ from } as never, documentRow.id, {
        medicalBridgeWatch: true,
        medicalRestriction: '',
        medicalUnfit: false,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        medicalBridgeWatch: true,
        medicalRestriction: '',
        medicalUnfit: false,
      }),
    );

    expect(update).toHaveBeenCalledWith({
      medical_bridge_watch: true,
      medical_restriction: null,
      medical_unfit: false,
    });
    expect(eq).toHaveBeenCalledWith('id', documentRow.id);
  });
});

describe('HR function ordering', () => {
  it('removes numeric prefixes, normalizes primary labels and omits empty functions', () => {
    expect(normalizeHrFunctionLabel('3-2nd Capitaine')).toBe('2nd Capitaine');
    expect(normalizeHrFunctionLabel(' 5 - Matelot Polyvalent ')).toBe('Matelot polyvalent');
    expect(getHrFunctionVisibilityKey("Maître d'Equipage")).toBe('maitre-d-equipage');

    const dashboard = buildHumanResourcesDashboard(
      mapPersonRows([
        { ...personRow, id: 1, function_label: '3-2nd Capitaine' },
        { ...personRow, id: 2, function_label: '1-Capitaine' },
        { ...personRow, id: 3, function_label: null },
      ]),
      [],
    );

    expect(dashboard.groups.map((group) => group.label)).toEqual(['Capitaine', '2nd Capitaine']);
  });

  it('groups the specified office functions under a two-level Sedentaire branch', () => {
    const dashboard = buildHumanResourcesDashboard(
      mapPersonRows([
        { ...personRow, id: 1, function_label: '1-Capitaine' },
        { ...personRow, id: 2, function_label: 'Fleet Technical Manager' },
        { ...personRow, id: 3, function_label: 'Pr\u00e9sident' },
        { ...personRow, id: 4, function_label: 'Directrice Administrative et Financi\u00e8re' },
      ]),
      [],
    );

    const rosterGroups = buildHumanResourcesRosterGroups(dashboard.groups);
    const sedentaryGroup = rosterGroups.find((group) => group.label === 'S\u00e9dentaire');

    expect(rosterGroups.map((group) => group.label)).toEqual(['Capitaine', 'S\u00e9dentaire']);
    expect(sedentaryGroup?.children?.map((group) => group.label)).toEqual([
      'Directrice Administrative et Financi\u00e8re',
      'Fleet Technical Manager',
      'Pr\u00e9sident',
    ]);
    expect(sedentaryGroup?.people).toHaveLength(3);
  });
});

describe('buildHumanResourcesDashboard', () => {
  it('computes RH metrics, grouped collaborators and document alerts', () => {
    const people = mapPersonRows([
      personRow,
      {
        ...personRow,
        id: 2,
        user_id: null,
        first_name: 'Paul',
        last_name: 'DURAND',
        contract_type: null,
        emergency_contact_name: null,
        emergency_contact_phone: null,
        deck_certificate_label: null,
        engine_certificate_label: null,
        crane_training_on: null,
        crane_induction_on: null,
        function_label: '5-Matelot Polyvalent',
        role_label: 'Navigant',
        active: true,
      },
      {
        ...personRow,
        id: 3,
        user_id: null,
        first_name: 'Lea',
        last_name: 'BUREAU',
        function_label: 'Responsable administratif',
        grade_label: 'Sedentaire',
        role_label: 'Navigant',
        active: true,
      },
    ]);
    const documents = mapHrDocumentRows([
      documentRow,
      { ...documentRow, id: 11, person_id: 1, category_key: 'certificate', title: 'CGO', status: 'expired' },
      { ...documentRow, id: 12, person_id: 2, category_key: 'safety_training', title: 'CFBS', status: 'valid' },
      { ...documentRow, id: 13, person_id: 2, category_key: 'administrative', title: 'Piece identite', status: 'missing' },
    ]);

    const dashboard = buildHumanResourcesDashboard(people, documents);

    expect(dashboard.metrics).toEqual({
      activePeople: 3,
      sedentaryPeople: 1,
      seafarerPeople: 2,
      trainees: 0,
      documents: 4,
      renewalDue: 2,
      urgent: 2,
      missing: 1,
      expiredDocuments: 1,
      certificateRenewals: 1,
      medicalVisitRenewals: 1,
      unassignedDocuments: 0,
      contractsReady: 2,
      emergencyContactsReady: 2,
      habilitationsReady: 2,
      turnoverRate: 0,
      averageTenureYears: expect.any(Number),
      medicalComplianceRate: 50,
    });
    expect(dashboard.groups.map((group) => group.label)).toEqual([
      'Capitaine',
      'Matelot polyvalent',
      'Responsable administratif',
    ]);
    expect(dashboard.groups[0].people[0].categorySummaries).toEqual([
      { key: 'certificate', label: 'Certificats', count: 1, urgentCount: 1, renewalDueCount: 1 },
      { key: 'medical_visit', label: 'Visite Médicale', count: 1, urgentCount: 0, renewalDueCount: 1 },
    ]);
  });
});

describe('buildStaffEvolution', () => {
  it('builds cumulative active staff counts for the RH evolution chart', () => {
    const people = mapPersonRows([
      { ...personRow, id: 1, hired_on: '2021-06-01', active: true },
      { ...personRow, id: 2, hired_on: '2023-01-10', active: true },
      { ...personRow, id: 3, hired_on: null, active: true },
      { ...personRow, id: 4, hired_on: '2022-03-01', active: false },
    ]);

    expect(buildStaffEvolution(people, [2020, 2021, 2022, 2023])).toEqual([
      { year: 2020, count: 0 },
      { year: 2021, count: 1 },
      { year: 2022, count: 1 },
      { year: 2023, count: 3 },
    ]);
  });
});

describe('fetchPeople', () => {
  it('loads ordered personnel records', async () => {
    const orderByFirstName = vi.fn().mockResolvedValue({ data: [personRow], error: null });
    const orderByLastName = vi.fn().mockReturnValue({ order: orderByFirstName });
    const select = vi.fn().mockReturnValue({ order: orderByLastName });
    const from = vi.fn().mockReturnValue({ select });

    await expect(fetchPeople({ from } as never)).resolves.toEqual([
      {
        id: 1,
        userId: 'user-1',
        firstName: 'Jean',
        lastName: 'MARTIN',
        email: 'jean@example.test',
        functionLabel: 'Capitaine',
        gradeLabel: 'Capitaine 200',
        roleLabel: 'Navigant',
        registerLabel: 'RIF',
        sex: 'Homme',
        sailorNumber: '2009574',
        m365Account: 'jean.martin@bbtm.fr',
        phone: '+33 1 02 03 04 05',
        postalAddress: '1 quai des pilotes, 76000 Rouen',
        birthDate: '1985-04-12',
        birthPlace: 'Rouen',
        identityDocumentNumber: 'ID-12345',
        identityDocumentType: 'Passeport',
        contractType: 'CDI',
        hiredOn: '2024-01-01',
        departedOn: '',
        departureReason: '',
        emergencyContactName: 'Marie MARTIN',
        emergencyContactRelationship: 'Conjointe',
        emergencyContactPhone: '+33 6 00 00 00 00',
        emergencyContactAddress: '2 rue du Port, 76000 Rouen',
        waistSize: '84',
        chestSize: '102',
        fullHeightSize: '178',
        inseamSize: '82',
        hipSize: '96',
        weightKg: '78',
        shoeSize: '43',
        coverallSize: 'L',
        pantsSize: '42',
        jacketSize: 'L',
        deckCertificateLabel: 'Capitaine 200',
        engineCertificateLabel: 'Mecanicien 250 kW',
        craneTrainingOn: '2025-03-10',
        craneInductionOn: '2025-03-12',
        active: true,
      },
    ]);
    expect(from).toHaveBeenCalledWith('people');
    expect(select).toHaveBeenCalledWith(
      'id, user_id, first_name, last_name, email, function_label, grade_label, role_label, register_label, sex, sailor_number, m365_account, phone, postal_address, birth_date, birth_place, identity_document_number, identity_document_type, contract_type, hired_on, departed_on, departure_reason, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, emergency_contact_address, waist_size, chest_size, full_height_size, inseam_size, hip_size, weight_kg, shoe_size, coverall_size, pants_size, jacket_size, deck_certificate_label, engine_certificate_label, crane_training_on, crane_induction_on, active',
    );
    expect(orderByLastName).toHaveBeenCalledWith('last_name', { ascending: true });
    expect(orderByFirstName).toHaveBeenCalledWith('first_name', { ascending: true });
  });
});

describe('fetchHumanResourcesData', () => {
  it('loads personnel and HR documents together', async () => {
    const peopleOrderByFirstName = vi.fn().mockResolvedValue({ data: [personRow], error: null });
    const peopleOrderByLastName = vi.fn().mockReturnValue({ order: peopleOrderByFirstName });
    const peopleSelect = vi.fn().mockReturnValue({ order: peopleOrderByLastName });
    const documentsOrder = vi.fn().mockResolvedValue({ data: [documentRow], error: null });
    const documentsSelect = vi.fn().mockReturnValue({ order: documentsOrder });
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'people') {
        return { select: peopleSelect };
      }

      if (table === 'hr_documents') {
        return { select: documentsSelect };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    await expect(fetchHumanResourcesData({ from } as never)).resolves.toEqual({
      people: mapPersonRows([personRow]),
      documents: mapHrDocumentRows([documentRow]),
      visibilityRules: [],
    });
    expect(from).toHaveBeenCalledWith('people');
    expect(from).toHaveBeenCalledWith('hr_documents');
  });
});

describe('saveHrVisibilityRules', () => {
  it('persists role visibility and always keeps admin access', async () => {
    const rows = [
      {
        scope: 'section',
        item_key: 'health',
        item_label: 'Santé et habilitations',
        visible_to_roles: ['admin', 'armement'],
      },
    ];
    const select = vi.fn().mockResolvedValue({ data: rows, error: null });
    const upsert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ upsert });

    await expect(
      saveHrVisibilityRules({ from } as never, [
        {
          scope: 'section',
          itemKey: 'health',
          itemLabel: 'Santé et habilitations',
          visibleToRoles: ['armement'],
        },
      ]),
    ).resolves.toEqual([
      {
        scope: 'section',
        itemKey: 'health',
        itemLabel: 'Santé et habilitations',
        visibleToRoles: ['admin', 'armement'],
      },
    ]);

    expect(upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          scope: 'section',
          item_key: 'health',
          visible_to_roles: ['admin', 'armement'],
        }),
      ],
      { onConflict: 'scope,item_key' },
    );
  });
});

describe('createPerson', () => {
  it('inserts a trimmed personnel record and returns the created row', async () => {
    const single = vi.fn().mockResolvedValue({ data: personRow, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });

    await expect(
      createPerson({ from } as never, {
        firstName: ' Jean ',
        lastName: ' Martin ',
        email: ' jean@example.test ',
        functionLabel: ' Capitaine ',
        gradeLabel: ' Capitaine 200 ',
        phone: ' +33 1 02 03 04 05 ',
        postalAddress: ' 1 quai des pilotes, 76000 Rouen ',
        contractType: ' CDI ',
      }),
    ).resolves.toEqual(mapPersonRows([personRow])[0]);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      first_name: 'Jean',
      last_name: 'Martin',
      email: 'jean@example.test',
      function_label: 'Capitaine',
      grade_label: 'Capitaine 200',
      phone: '+33 1 02 03 04 05',
      postal_address: '1 quai des pilotes, 76000 Rouen',
      contract_type: 'CDI',
    }));
  });
});

describe('updatePersonActive', () => {
  it('updates active state and returns the updated row', async () => {
    const updatedRow = { ...personRow, active: false };
    const single = vi.fn().mockResolvedValue({ data: updatedRow, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });

    await expect(updatePersonActive({ from } as never, 1, false)).resolves.toEqual(mapPersonRows([updatedRow])[0]);
    expect(update).toHaveBeenCalledWith({ active: false });
    expect(eq).toHaveBeenCalledWith('id', 1);
  });
});

describe('updatePersonDetails', () => {
  it('updates the full personnel file and normalizes empty fields', async () => {
    const updatedRow = {
      ...personRow,
      email: 'jean.updated@example.test',
      phone: '+33 6 11 22 33 44',
      postal_address: '3 quai BBTM, 76600 Le Havre',
      contract_type: 'CDD',
      departed_on: null,
      waist_size: 90.5,
    };
    const single = vi.fn().mockResolvedValue({ data: updatedRow, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });

    await expect(
      updatePersonDetails({ from } as never, 1, {
        firstName: ' Jean ',
        lastName: ' MARTIN ',
        email: ' jean.updated@example.test ',
        functionLabel: ' Capitaine ',
        gradeLabel: ' Capitaine 200 ',
        roleLabel: ' Navigant ',
        registerLabel: ' RIF ',
        sex: ' Homme ',
        sailorNumber: ' 2009574 ',
        m365Account: ' jean.martin@bbtm.fr ',
        phone: ' +33 6 11 22 33 44 ',
        postalAddress: ' 3 quai BBTM, 76600 Le Havre ',
        birthDate: '1985-04-12',
        birthPlace: ' Rouen ',
        identityDocumentNumber: ' ID-12345 ',
        identityDocumentType: ' Passeport ',
        contractType: ' CDD ',
        hiredOn: '2024-01-01',
        departedOn: '',
        departureReason: '',
        emergencyContactName: ' Marie MARTIN ',
        emergencyContactRelationship: ' Conjointe ',
        emergencyContactPhone: ' +33 6 00 00 00 00 ',
        emergencyContactAddress: ' 2 rue du Port, 76000 Rouen ',
        waistSize: '90,5',
        chestSize: '102',
        fullHeightSize: '178',
        inseamSize: '82',
        hipSize: '96',
        weightKg: '78',
        shoeSize: '43',
        coverallSize: 'L',
        pantsSize: '42',
        jacketSize: 'L',
        deckCertificateLabel: ' Capitaine 200 ',
        engineCertificateLabel: ' Mecanicien 250 kW ',
        craneTrainingOn: '2025-03-10',
        craneInductionOn: '2025-03-12',
      }),
    ).resolves.toEqual(mapPersonRows([updatedRow])[0]);
    expect(update).toHaveBeenCalledWith({
      first_name: 'Jean',
      last_name: 'MARTIN',
      email: 'jean.updated@example.test',
      function_label: 'Capitaine',
      grade_label: 'Capitaine 200',
      role_label: 'Navigant',
      register_label: 'RIF',
      sex: 'Homme',
      sailor_number: '2009574',
      m365_account: 'jean.martin@bbtm.fr',
      phone: '+33 6 11 22 33 44',
      postal_address: '3 quai BBTM, 76600 Le Havre',
      birth_date: '1985-04-12',
      birth_place: 'Rouen',
      identity_document_number: 'ID-12345',
      identity_document_type: 'Passeport',
      contract_type: 'CDD',
      hired_on: '2024-01-01',
      departed_on: null,
      departure_reason: null,
      emergency_contact_name: 'Marie MARTIN',
      emergency_contact_relationship: 'Conjointe',
      emergency_contact_phone: '+33 6 00 00 00 00',
      emergency_contact_address: '2 rue du Port, 76000 Rouen',
      waist_size: 90.5,
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
    });
    expect(eq).toHaveBeenCalledWith('id', 1);
  });
});
