import { describe, expect, it, vi } from 'vitest';
import {
  buildHumanResourcesDashboard,
  createPerson,
  fetchHumanResourcesData,
  fetchPeople,
  mapHrDocumentRows,
  mapPersonRows,
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
  contract_type: 'CDI',
  hired_on: '2024-01-01',
  departed_on: null,
  emergency_contact_name: 'Marie MARTIN',
  emergency_contact_phone: '+33 6 00 00 00 00',
  active: true,
};

const documentRow = {
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
        contractType: 'CDI',
        hiredOn: '2024-01-01',
        departedOn: '',
        emergencyContactName: 'Marie MARTIN',
        emergencyContactPhone: '+33 6 00 00 00 00',
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
          contract_type: null,
          hired_on: null,
          departed_on: null,
          emergency_contact_name: null,
          emergency_contact_phone: null,
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
        contractType: '',
        hiredOn: '',
        departedOn: '',
        emergencyContactName: '',
        emergencyContactPhone: '',
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
        categoryKey: 'medical_visit',
        title: 'Visite medicale',
        status: 'renew_due',
        issuedOn: '2025-01-15',
        expiresOn: '2026-08-15',
        requiresCaptainValidation: true,
        sourceLabel: 'SharePoint',
        notes: 'Validation capitaine requise',
        fileUrl: 'https://sharepoint.test/visite-medicale.pdf',
      },
    ]);
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
        function_label: 'Matelot Polyvalent',
        role_label: 'Navigant',
        active: true,
      },
      {
        ...personRow,
        id: 3,
        user_id: null,
        first_name: 'Lea',
        last_name: 'BUREAU',
        function_label: 'Direction',
        role_label: 'Sedentaire',
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
    });
    expect(dashboard.groups.map((group) => group.label)).toEqual(['Capitaine', 'Direction', 'Matelot Polyvalent']);
    expect(dashboard.groups[0].people[0].categorySummaries).toEqual([
      { key: 'certificate', label: 'Certificats', count: 1, urgentCount: 1, renewalDueCount: 1 },
      { key: 'medical_visit', label: 'Visite Medicale', count: 1, urgentCount: 0, renewalDueCount: 1 },
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
        contractType: 'CDI',
        hiredOn: '2024-01-01',
        departedOn: '',
        emergencyContactName: 'Marie MARTIN',
        emergencyContactPhone: '+33 6 00 00 00 00',
        active: true,
      },
    ]);
    expect(from).toHaveBeenCalledWith('people');
    expect(select).toHaveBeenCalledWith(
      'id, user_id, first_name, last_name, email, function_label, grade_label, role_label, register_label, sex, sailor_number, m365_account, phone, contract_type, hired_on, departed_on, emergency_contact_name, emergency_contact_phone, active',
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
    });
    expect(from).toHaveBeenCalledWith('people');
    expect(from).toHaveBeenCalledWith('hr_documents');
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
      }),
    ).resolves.toEqual(mapPersonRows([personRow])[0]);
    expect(insert).toHaveBeenCalledWith({
      first_name: 'Jean',
      last_name: 'Martin',
      email: 'jean@example.test',
      function_label: 'Capitaine',
      grade_label: 'Capitaine 200',
      role_label: null,
      register_label: null,
      sex: null,
      sailor_number: null,
      m365_account: null,
    });
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
