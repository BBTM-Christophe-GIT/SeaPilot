import { describe, expect, it } from 'vitest';
import {
  buildManagerHomeAssignmentScope,
  buildManagerHomeItems,
  filterManagerHomeSourcesForScope,
  type ManagerHomeSourceRows,
} from './managerHomeData';

const TODAY = new Date(2026, 7, 25, 12);

function emptySources(overrides: Partial<ManagerHomeSourceRows> = {}): ManagerHomeSourceRows {
  return {
    purchases: [],
    procedures: [],
    fleetCertificates: [],
    people: [],
    hrDocuments: [],
    workingTimeCalculations: [],
    ...overrides,
  };
}

describe('manager home alarms and assignment scope', () => {
  it('shows expired deadlines in red and deadlines up to J-90 in orange in the consolidated queue', () => {
    const items = buildManagerHomeItems(emptySources({
      fleetCertificates: [
        {
          id: 1,
          vessel_id: 10,
          vessel_name: 'GOURY',
          document_title: 'Certificat expiré',
          title: 'Certificat expiré',
          status: 'expired',
          expires_on: '2026-08-24',
          planned_on: null,
          workflow_status: null,
          is_active_fleet: true,
        },
        {
          id: 2,
          vessel_id: 10,
          vessel_name: 'GOURY',
          document_title: 'Certificat à renouveler',
          title: 'Certificat à renouveler',
          status: 'valid',
          expires_on: '2026-11-23',
          planned_on: null,
          workflow_status: null,
          is_active_fleet: true,
        },
        {
          id: 3,
          vessel_id: 10,
          vessel_name: 'GOURY',
          document_title: 'Certificat hors alarme',
          title: 'Certificat hors alarme',
          status: 'valid',
          expires_on: '2026-11-24',
          planned_on: null,
          workflow_status: null,
          is_active_fleet: true,
        },
      ],
    }), TODAY);

    expect(items.find((item) => item.id === 'fleet-1')).toMatchObject({
      queueTone: 'danger',
      urgent: true,
    });
    expect(items.find((item) => item.id === 'fleet-2')).toMatchObject({
      queueTone: 'warning',
      urgent: false,
    });
    expect(items.find((item) => item.id === 'fleet-2')?.queueVisibleDates).toContain('2026-08-25');
    expect(items.find((item) => item.id === 'fleet-3')).toBeUndefined();
  });

  it('limits personnel to the assigned watch and operational items to the assigned vessel', () => {
    const scope = buildManagerHomeAssignmentScope([
      { vessel_id: 10, captain_person_id: 42, crew_person_id: 42, watch_group: 'Bordée A', vessels: { name: 'GOURY' } },
      { vessel_id: 10, captain_person_id: 42, crew_person_id: 43, watch_group: 'Bordée A', vessels: { name: 'GOURY' } },
      { vessel_id: 10, captain_person_id: 44, crew_person_id: 44, watch_group: 'Bordée B', vessels: { name: 'GOURY' } },
      { vessel_id: 11, captain_person_id: 45, crew_person_id: 45, watch_group: 'Bordée A', vessels: { name: 'KROKDUR' } },
    ], 42);
    const filtered = filterManagerHomeSourcesForScope(emptySources({
      people: [
        { id: 42, first_name: 'Alice', last_name: 'CAPITAINE', function_label: 'Capitaine', departed_on: null, active: true },
        { id: 43, first_name: 'Marc', last_name: 'MARIN', function_label: 'Matelot', departed_on: null, active: true },
        { id: 44, first_name: 'Zoé', last_name: 'AUTRE', function_label: 'Matelot', departed_on: null, active: true },
      ],
      procedures: [
        { id: 1, procedure_code: 'GOU', title: 'Procédure GOURY', diffusion_on: '2025-08-25', annual_review: true, vessel_name: 'GOURY', project_name: null, status: 'approved' },
        { id: 2, procedure_code: 'KRO', title: 'Procédure KROKDUR', diffusion_on: '2025-08-25', annual_review: true, vessel_name: 'KROKDUR', project_name: null, status: 'approved' },
      ],
    }), scope);

    expect(scope).toMatchObject({
      vesselIds: [10],
      vesselNames: ['GOURY'],
      personIds: [42, 43],
      watchGroups: ['Bordée A'],
    });
    expect(filtered.people.map((person) => person.id)).toEqual([42, 43]);
    expect(filtered.procedures.map((procedure) => procedure.id)).toEqual([1]);
  });
});
