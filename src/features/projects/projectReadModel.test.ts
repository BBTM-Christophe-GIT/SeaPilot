import { describe, expect, it } from 'vitest';
import type { ProjectContractRecord, ProjectRecord } from './projectQueries';
import {
  buildSupplytimePreview,
  EMPTY_PROJECT_FILTERS,
  projectMatchesFilters,
  resolveSelectedProject,
  sortProjects,
} from './projectReadModel';

function makeProject(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    archivedAt: '',
    charterEndsAt: '',
    charterStartsAt: '',
    clientId: 50,
    clientName: 'Ifremer',
    clientSharePointItemId: '50',
    contractType: 'SUPPLYTIME 2017',
    deliveryAt: '2026-07-01T08:00:00+02:00',
    deliveryPort: 'Brest',
    description: 'Campagne bathymétrie',
    endsOn: '2026-07-15',
    id: 880,
    isDivingSupport: false,
    isRovSupport: true,
    operationArea: 'Atlantique Nord',
    primaryVesselId: 12,
    primaryVesselName: 'COTENTIN',
    primaryVesselSharePointItemId: '12',
    projectCode: 'P1086',
    redeliveryAt: '2026-07-15T18:00:00+02:00',
    redeliveryPort: 'Saint-Nazaire',
    secondaryVesselId: null,
    secondaryVesselName: '',
    secondaryVesselSharePointItemId: '',
    sharePointItemId: '880',
    sharePointListTitle: 'BBTM - Projets',
    sourceLabel: 'sharepoint',
    sourceModifiedAt: '2026-07-14T12:00:00Z',
    startsOn: '2026-07-01',
    status: 'Contrat signé',
    title: 'Campagne Atlantique 2026',
    updatedAt: '2026-07-15T10:00:00Z',
    ...overrides,
  };
}

function makeContract(overrides: Partial<ProjectContractRecord> = {}): ProjectContractRecord {
  return {
    archivedAt: '',
    autoExtensionPeriod: 'Voyage',
    charterHire: 12000,
    demobilisationFee: 1000,
    extensionCount: 1,
    extensionDuration: 5,
    extensionHire: 13000,
    extensionUnit: 'jours',
    feeCurrency: 'EUR',
    hireCurrency: 'EUR',
    hireUnit: 'jour',
    id: 10,
    maxAuditPeriod: '30 jours',
    maxExtensionDays: 10,
    mobilisationFee: 2000,
    ownerIdentity: 'Armateur BBTM',
    projectId: 880,
    sharePointItemId: '880',
    sharePointListTitle: 'BBTM - Projets',
    sourceLabel: 'sharepoint',
    sourceModifiedAt: '2026-07-14T12:00:00Z',
    supplytimeData: {
      box02_charterers: 'Ancienne valeur client',
      box05_cancelling_date: '30 juin 2026 à 18 h',
    },
    supplytimeSchemaVersion: 'supplytime-2017-v1',
    vesselAssignmentLimit: 'Europe',
    ...overrides,
  };
}

describe('projectReadModel', () => {
  it('sorts the portfolio by descending project number across prefixes', () => {
    const projects = [
      makeProject({ id: 1, projectCode: 'SP-52', title: 'Hors Projet' }),
      makeProject({ id: 2, projectCode: 'P266', title: 'Remorquage' }),
      makeProject({ id: 3, projectCode: 'P265', title: 'Affrètement' }),
      makeProject({ id: 4, projectCode: 'SP-49', title: 'Arrêt technique' }),
    ];

    expect(sortProjects(projects).map((project) => project.projectCode)).toEqual([
      'P266',
      'P265',
      'SP-52',
      'SP-49',
    ]);
  });

  it('applies accent-insensitive text, structured and overlapping-period filters', () => {
    const project = makeProject();

    expect(
      projectMatchesFilters(project, {
        ...EMPTY_PROJECT_FILTERS,
        clientName: 'Ifremer',
        dateFrom: '2026-07-10',
        dateTo: '2026-07-20',
        search: 'bathymetrie',
        status: 'Contrat signé',
        vesselName: 'COTENTIN',
      }),
    ).toBe(true);
    expect(projectMatchesFilters(project, { ...EMPTY_PROJECT_FILTERS, dateFrom: '2026-07-16' })).toBe(false);
    expect(projectMatchesFilters(project, { ...EMPTY_PROJECT_FILTERS, vesselName: 'SUROIT' })).toBe(false);
  });

  it('keeps a valid selection and otherwise selects the first visible project', () => {
    const first = makeProject();
    const second = makeProject({ id: 881, title: 'Campagne Manche' });

    expect(resolveSelectedProject([first, second], 881)).toBe(second);
    expect(resolveSelectedProject([first, second], 999)).toBe(first);
    expect(resolveSelectedProject([], 880)).toBeNull();
  });

  it('builds all 34 SUPPLYTIME boxes and signatures with canonical values taking priority', () => {
    const groups = buildSupplytimePreview(makeProject(), makeContract({
      hirePeriods: [{
        id: 1,
        projectId: 880,
        contractId: 10,
        startsOn: '2026-07-01',
        endsOn: '',
        charterHire: 12000,
        standbyHire: 9000,
        weatherStandbyHire: 6000,
        hireCurrency: 'EUR',
        hireUnit: 'jour',
      }],
    }));
    const fields = groups.flatMap((group) => group.fields);

    expect(fields).toHaveLength(36);
    expect(fields.find((field) => field.key === 'box02_charterers')).toMatchObject({
      source: 'canonical',
      value: 'Ifremer',
    });
    expect(fields.find((field) => field.key === 'box05_cancelling_date')).toMatchObject({
      source: 'supplytime',
      value: '30 juin 2026 à 18 h',
    });
    expect(fields.find((field) => field.key === 'box20_charter_hire')).toMatchObject({
      source: 'canonical',
      value: expect.stringContaining('Weather Stand-by'),
    });
    expect(fields.find((field) => field.key === 'box34_additional_clauses')).toMatchObject({
      source: 'empty',
      value: '',
    });
  });
});
