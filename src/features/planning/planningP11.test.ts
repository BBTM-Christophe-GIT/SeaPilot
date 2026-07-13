import { describe, expect, it } from 'vitest';
import { EMPTY_PLANNING_OVERVIEW } from './usePlanningOverview';
import {
  buildManningMatrixComparison,
  buildRotationPreview,
  daysBetweenInclusive,
  rotationPatternDays,
  rotationPreviewHasOverlaps,
  type PlanningManningMatrix,
} from './planningP11';

describe('planning P1.1 rotations', () => {
  it('generates a 14/14 series without duplicate or overlapping dates', () => {
    const pattern = rotationPatternDays('14_14');
    expect(pattern).toEqual({ onboardDays: 14, restDays: 14 });
    const preview = buildRotationPreview('2026-08-01', pattern!.onboardDays, pattern!.restDays, 4);
    expect(preview).toHaveLength(4);
    expect(preview.map((item) => item.startsOn)).toEqual(['2026-08-01', '2026-08-29', '2026-09-26', '2026-10-24']);
    expect(preview[0]).toMatchObject({ endsOn: '2026-08-14', restStartsOn: '2026-08-15', restEndsOn: '2026-08-28' });
    expect(new Set(preview.map((item) => `${item.startsOn}:${item.endsOn}`)).size).toBe(4);
    expect(rotationPreviewHasOverlaps(preview)).toBe(false);
  });

  it('supports custom periods across calendar boundaries', () => {
    const preview = buildRotationPreview('2026-10-25', 10, 8, 2);
    expect(preview).toEqual([
      { occurrenceNumber: 1, startsOn: '2026-10-25', endsOn: '2026-11-03', restStartsOn: '2026-11-04', restEndsOn: '2026-11-11' },
      { occurrenceNumber: 2, startsOn: '2026-11-12', endsOn: '2026-11-21', restStartsOn: '2026-11-22', restEndsOn: '2026-11-29' },
    ]);
    expect(daysBetweenInclusive(preview[0].startsOn, preview[0].endsOn)).toBe(10);
  });
});

describe('planning P1.1 manning matrix comparison', () => {
  const matrix: PlanningManningMatrix = {
    id: 1,
    vesselId: 10,
    name: 'Armement côtier',
    effectiveFrom: '2026-01-01',
    effectiveTo: '',
    status: 'active',
    notes: '',
    version: 1,
    requirements: [
      {
        id: 1,
        matrixId: 1,
        functionLabel: 'Capitaine',
        minimumCount: 1,
        targetCount: 1,
        requiredCertificates: ['Capitaine 3000'],
        requiredQualifications: [],
        requiredAuthorizations: [],
        requiredTrainings: ['Sécurité'],
        restrictions: ['Aptitude médicale valide'],
        displayOrder: 0,
      },
      {
        id: 2,
        matrixId: 1,
        functionLabel: 'Matelot',
        minimumCount: 2,
        targetCount: 2,
        requiredCertificates: [],
        requiredQualifications: [],
        requiredAuthorizations: [],
        requiredTrainings: [],
        restrictions: [],
        displayOrder: 1,
      },
    ],
  };

  it('identifies vacancies, duplicate functions and missing documents', () => {
    const overview = {
      ...EMPTY_PLANNING_OVERVIEW,
      people: [
        { id: 1, firstName: 'Alix', lastName: 'MARTIN', functionLabel: 'Capitaine', gradeLabel: '', roleLabel: '', contractType: '', hiredOn: '', departedOn: '', deckCertificateLabel: 'Capitaine 3000', active: true },
        { id: 2, firstName: 'Sam', lastName: 'LEGRAND', functionLabel: 'Matelot', gradeLabel: '', roleLabel: '', contractType: '', hiredOn: '', departedOn: '', active: true },
        { id: 3, firstName: 'Noa', lastName: 'ROBERT', functionLabel: 'Capitaine', gradeLabel: '', roleLabel: '', contractType: '', hiredOn: '', departedOn: '', active: true },
      ],
      assignments: [
        { id: 1, vesselId: 10, vesselName: 'COTENTIN', captainPersonId: null, captainName: '', crewPersonId: 1, crewName: 'Alix MARTIN', startsOn: '2026-08-01', endsOn: '2026-08-14', assignmentRole: 'Capitaine', statusLabel: 'Embarqué', confirmationStatus: 'confirmed' as const, watchGroup: 'A', comments: '', sourceLabel: 'seapilot' },
        { id: 2, vesselId: 10, vesselName: 'COTENTIN', captainPersonId: null, captainName: '', crewPersonId: 3, crewName: 'Noa ROBERT', startsOn: '2026-08-01', endsOn: '2026-08-14', assignmentRole: 'Capitaine', statusLabel: 'Embarqué', confirmationStatus: 'confirmed' as const, watchGroup: 'B', comments: '', sourceLabel: 'seapilot' },
        { id: 3, vesselId: 10, vesselName: 'COTENTIN', captainPersonId: null, captainName: '', crewPersonId: 2, crewName: 'Sam LEGRAND', startsOn: '2026-08-01', endsOn: '2026-08-14', assignmentRole: 'Matelot', statusLabel: 'Embarqué', confirmationStatus: 'confirmed' as const, watchGroup: 'A', comments: '', sourceLabel: 'seapilot' },
      ],
      hrDocuments: [
        { id: 1, personId: 1, personName: 'Alix MARTIN', categoryKey: 'training', title: 'Sécurité', status: 'Valide', expiresOn: '2027-01-01', requiresCaptainValidation: false, medicalRestriction: '', medicalUnfit: false, fileUrl: '' },
      ],
    };
    const comparison = buildManningMatrixComparison(overview, matrix, '2026-08-01', '2026-08-31');
    expect(comparison[0]).toMatchObject({ plannedCount: 2, vacantCount: 0, duplicateCount: 1 });
    expect(comparison[0].noncompliant).toEqual([{ personId: 3, personName: 'Noa ROBERT', missing: ['Capitaine 3000', 'Sécurité'] }]);
    expect(comparison[1]).toMatchObject({ plannedCount: 1, vacantCount: 1, duplicateCount: 0 });
  });
});
