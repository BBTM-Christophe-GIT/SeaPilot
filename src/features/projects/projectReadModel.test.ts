import { describe, expect, it } from 'vitest';
import type { ProjectContractRecord, ProjectRecord } from './projectQueries';
import {
  buildSupplytimePreview,
  EMPTY_PROJECT_FILTERS,
  projectMatchesFilters,
  resolveSelectedProject,
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
    const groups = buildSupplytimePreview(makeProject(), makeContract());
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
    expect(fields.find((field) => field.key === 'box34_additional_clauses')).toMatchObject({
      source: 'empty',
      value: '',
    });
  });
});
