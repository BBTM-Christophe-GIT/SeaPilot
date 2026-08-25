import { describe, expect, it } from 'vitest';
import { buildManagerHomeItems, type ManagerHomeSourceRows } from './managerHomeData';

const TODAY = new Date(2026, 7, 25, 12);

function sources(overrides: Partial<ManagerHomeSourceRows> = {}): ManagerHomeSourceRows {
  return {
    purchases: [],
    fleetCertificates: [],
    people: [],
    hrDocuments: [],
    workingTimeCalculations: [],
    ...overrides,
  };
}

describe('managerHomeDashboard', () => {
  it('aggregates actionable records and keeps the approved category order', () => {
    const items = buildManagerHomeItems(sources({
      purchases: [{
        id: 84,
        request_number: '84',
        title: 'Pompe de cale',
        requested_on: '2026-08-20',
        requester_name: 'Julien Morel',
        project_code: 'P206',
        vessel_name: 'M/V BBTM Pioneer',
        status: 'Approbation en attente',
        urgent: true,
        approval_status: 'En attente',
        ordered_on: null,
        expected_delivery_on: null,
        received_on: null,
      }],
      people: [{
        id: 11,
        first_name: 'Lucas',
        last_name: 'Martin',
        function_label: 'Matelot',
        departed_on: '2026-08-31',
        active: true,
      }],
      fleetCertificates: [{
        id: 21,
        vessel_name: 'M/V BBTM Pioneer',
        document_title: 'Certificat de classe',
        title: 'Certificat de classe',
        status: 'renew_due',
        expires_on: '2026-08-28',
        planned_on: null,
        workflow_status: 'due',
        is_active_fleet: true,
      }],
      workingTimeCalculations: [{
        id: 31,
        person_id: 11,
        local_window_end_date: '2026-08-24',
        rest_24h_seconds: 36_000,
        longest_rest_24h_seconds: 18_000,
        is_compliant: false,
        violation_codes: ['consecutive_rest'],
        calculated_at: '2026-08-24T18:00:00Z',
      }],
    }), TODAY);

    expect(items.map((item) => item.group)).toEqual([
      'purchases',
      'workingTime',
      'fleetDocuments',
      'humanResources',
    ]);
    expect(items[0].title).toBe('DA-2026-084 · Pompe de cale');
    expect(items[2].visibleDates).toEqual(expect.arrayContaining(['2026-08-25', '2026-08-28']));
    expect(items[3].deadline).toContain('31 août');
  });

  it('excludes completed purchases, inactive people and distant valid documents', () => {
    const items = buildManagerHomeItems(sources({
      purchases: [{
        id: 1,
        request_number: '1',
        title: 'Demande terminée',
        requested_on: '2026-08-01',
        requester_name: null,
        project_code: null,
        vessel_name: null,
        status: 'Traitée',
        urgent: false,
        approval_status: 'Approuvée',
        ordered_on: '2026-08-02',
        expected_delivery_on: '2026-08-03',
        received_on: '2026-08-03',
      }],
      people: [{
        id: 2,
        first_name: 'Ancien',
        last_name: 'Marin',
        function_label: 'Matelot',
        departed_on: '2026-08-31',
        active: false,
      }],
      hrDocuments: [{
        id: 3,
        person_id: 2,
        person_name: 'Ancien Marin',
        category_key: 'medical_visit',
        title: 'Visite médicale',
        status: 'valid',
        expires_on: '2027-12-01',
        medical_unfit: false,
      }],
    }), TODAY);

    expect(items).toEqual([]);
  });

  it('keeps only the latest working-time alarm per person', () => {
    const items = buildManagerHomeItems(sources({
      people: [{
        id: 7,
        first_name: 'Sophie',
        last_name: 'Le Gall',
        function_label: 'Chef de quart',
        departed_on: null,
        active: true,
      }],
      workingTimeCalculations: [
        {
          id: 1,
          person_id: 7,
          local_window_end_date: '2026-08-23',
          rest_24h_seconds: 38_000,
          longest_rest_24h_seconds: 18_000,
          is_compliant: false,
          violation_codes: ['rest_24h'],
          calculated_at: '2026-08-23T18:00:00Z',
        },
        {
          id: 2,
          person_id: 7,
          local_window_end_date: '2026-08-24',
          rest_24h_seconds: 40_000,
          longest_rest_24h_seconds: 20_000,
          is_compliant: false,
          violation_codes: ['work_24h'],
          calculated_at: '2026-08-24T18:00:00Z',
        },
      ],
    }), TODAY);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'working-time-2', title: 'Dépassement du temps de travail', urgent: true });
    expect(items[0].visibleDates).toEqual(expect.arrayContaining(['2026-08-24', '2026-08-25']));
  });

  it('excludes personnel alarms after departure and prefixes every HR document with the person name', () => {
    const items = buildManagerHomeItems(sources({
      people: [
        {
          id: 8,
          first_name: 'Ancien',
          last_name: 'MARIN',
          function_label: 'Matelot',
          departed_on: '2026-08-24',
          active: false,
        },
        {
          id: 9,
          first_name: 'Nicolas',
          last_name: 'BOUVILLE',
          function_label: 'Matelot polyvalent',
          departed_on: '2026-06-25',
          active: false,
        },
        {
          id: 10,
          first_name: 'Sophie',
          last_name: 'LE GALL',
          function_label: 'QHSE',
          departed_on: null,
          active: true,
        },
        {
          id: 11,
          first_name: 'Départ',
          last_name: 'AUJOURD’HUI',
          function_label: 'Matelot',
          departed_on: '2026-08-25',
          active: false,
        },
      ],
      hrDocuments: [
        {
          id: 80,
          person_id: 8,
          person_name: 'Ancien MARIN',
          category_key: 'safety_training',
          title: 'LEMS - HSE Induction',
          status: 'renew_due',
          expires_on: '2026-09-08',
          medical_unfit: false,
        },
        {
          id: 90,
          person_id: null,
          person_name: 'Nicolas BOUVILLE',
          category_key: 'medical_visit',
          title: 'Visite médicale',
          status: 'renew_due',
          expires_on: '2026-08-31',
          medical_unfit: false,
        },
        {
          id: 100,
          person_id: 10,
          person_name: 'Sophie LE GALL',
          category_key: 'safety_training',
          title: 'LEMS - HSE Induction',
          status: 'renew_due',
          expires_on: '2026-09-08',
          medical_unfit: false,
        },
      ],
      workingTimeCalculations: [
        {
          id: 81,
          person_id: 8,
          local_window_end_date: '2026-08-24',
          rest_24h_seconds: 36_000,
          longest_rest_24h_seconds: 18_000,
          is_compliant: false,
          violation_codes: ['rest_24h'],
          calculated_at: '2026-08-24T18:00:00Z',
        },
        {
          id: 91,
          person_id: 11,
          local_window_end_date: '2026-08-25',
          rest_24h_seconds: 36_000,
          longest_rest_24h_seconds: 18_000,
          is_compliant: false,
          violation_codes: ['rest_24h'],
          calculated_at: '2026-08-25T08:00:00Z',
        },
      ],
    }), TODAY);

    expect(items.map((item) => item.id)).not.toContain('hr-document-80');
    expect(items.map((item) => item.id)).not.toContain('hr-document-90');
    expect(items.map((item) => item.id)).not.toContain('working-time-81');
    expect(items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'working-time-91' }),
      expect.objectContaining({ id: 'hr-document-100', title: 'Sophie LE GALL - LEMS - HSE Induction' }),
    ]));
  });
});
