import { describe, expect, it } from 'vitest';
import type { PlanningOverview } from './planningQueries';
import {
  buildPlanningAssistantSuggestions,
  planningAssistantSuggestionSnapshot,
} from './planningP21';
import type { PlanningP13Data } from './planningP13';
import { EMPTY_PLANNING_OVERVIEW } from './usePlanningOverview';

function fixture(): { overview: PlanningOverview; data: PlanningP13Data } {
  const overview: PlanningOverview = {
    ...EMPTY_PLANNING_OVERVIEW,
    vessels: [{ id: 10, name: 'COTENTIN', acronym: 'CTN', active: true }, { id: 11, name: 'SUROIT', acronym: 'SRT', active: true }],
    people: [
      { id: 1, firstName: 'Alice', lastName: 'MARTIN', functionLabel: 'Capitaine', gradeLabel: '', roleLabel: '', contractType: 'CDI', hiredOn: '', departedOn: '', deckCertificateLabel: 'Capitaine 3000', active: true },
      { id: 2, firstName: 'Benoît', lastName: 'DURAND', functionLabel: 'Capitaine', gradeLabel: '', roleLabel: '', contractType: 'CDI', hiredOn: '', departedOn: '', deckCertificateLabel: 'Capitaine 3000', active: true },
      { id: 3, firstName: 'Chloé', lastName: 'ROBERT', functionLabel: 'Capitaine', gradeLabel: '', roleLabel: '', contractType: 'CDI', hiredOn: '', departedOn: '', deckCertificateLabel: 'Capitaine 3000', active: true },
    ],
    assignments: [
      { id: 1, vesselId: 10, vesselName: 'COTENTIN', captainPersonId: null, captainName: '', crewPersonId: 1, crewName: 'Alice MARTIN', startsOn: '2026-08-01', endsOn: '2026-08-14', startsAt: '', endsAt: '', assignmentRole: 'Capitaine', statusLabel: 'Embarqué', confirmationStatus: 'confirmed', watchGroup: 'A', comments: '', sourceLabel: 'test' },
      { id: 2, vesselId: 10, vesselName: 'COTENTIN', captainPersonId: null, captainName: '', crewPersonId: 2, crewName: 'Benoît DURAND', startsOn: '2026-08-15', endsOn: '2026-08-28', startsAt: '', endsAt: '', assignmentRole: 'Capitaine', statusLabel: 'Embarqué', confirmationStatus: 'confirmed', watchGroup: 'B', comments: '', sourceLabel: 'test' },
      { id: 3, vesselId: 11, vesselName: 'SUROIT', captainPersonId: null, captainName: '', crewPersonId: 3, crewName: 'Chloé ROBERT', startsOn: '2026-08-01', endsOn: '2026-08-20', startsAt: '', endsAt: '', assignmentRole: 'Capitaine', statusLabel: 'Embarqué', confirmationStatus: 'confirmed', watchGroup: 'A', comments: '', sourceLabel: 'test' },
    ],
    hrDocuments: [
      { id: 1, personId: 1, personName: 'Alice MARTIN', categoryKey: 'certificate', title: 'Capitaine 3000', status: 'expired', expiresOn: '2026-07-01', requiresCaptainValidation: false, medicalRestriction: '', medicalUnfit: false, fileUrl: '' },
      { id: 2, personId: 2, personName: 'Benoît DURAND', categoryKey: 'certificate', title: 'Capitaine 3000', status: 'valid', expiresOn: '2027-12-31', requiresCaptainValidation: false, medicalRestriction: '', medicalUnfit: false, fileUrl: '' },
      { id: 3, personId: 2, personName: 'Benoît DURAND', categoryKey: 'qualification', title: 'Grue offshore', status: 'valid', expiresOn: '2027-12-31', requiresCaptainValidation: false, medicalRestriction: '', medicalUnfit: false, fileUrl: '' },
      { id: 4, personId: 3, personName: 'Chloé ROBERT', categoryKey: 'certificate', title: 'Capitaine 3000', status: 'valid', expiresOn: '2027-12-31', requiresCaptainValidation: false, medicalRestriction: '', medicalUnfit: false, fileUrl: '' },
    ],
    history: [{ id: 1, entityKind: 'assignment', entityId: 1, action: 'update', payload: {}, changedBy: 'user', changedByName: 'Bureau', changedAt: '2026-08-03T10:00:00Z', vesselId: 10, startsOn: '2026-08-01', endsOn: '2026-08-14', summary: 'Affectation modifiée' }],
  };
  const data: PlanningP13Data = {
    policies: [], notifications: [], dependencies: [],
    p12: {
      absences: [{ id: 60, personId: 1, absenceType: 'leave', startsAt: '2026-08-04T06:00:00Z', endsAt: '2026-08-10T16:00:00Z', startsOn: '2026-08-04', endsOn: '2026-08-10', reason: 'Congé validé', status: 'approved', requestedBy: 'user', reviewedBy: 'manager', reviewedAt: '', reviewComment: '', createdAt: '', updatedAt: '' }],
      conflictCases: [], conflictHistory: [],
      matrices: [{ id: 70, vesselId: 10, name: 'Armement', effectiveFrom: '2026-01-01', effectiveTo: '', status: 'active', notes: '', version: 1, requirements: [{ id: 71, matrixId: 70, functionLabel: 'Capitaine', minimumCount: 1, targetCount: 1, requiredCertificates: ['Capitaine 3000'], requiredQualifications: ['Grue offshore'], requiredAuthorizations: [], requiredTrainings: [], restrictions: [], displayOrder: 0 }] }],
    },
  };
  return { overview, data };
}

describe('Planning P2.1 explainable assistant', () => {
  it('identifies vacancies, proposes compatible sailors and explains incompatibilities', () => {
    const { overview, data } = fixture();
    const suggestions = buildPlanningAssistantSuggestions(overview, data, { start: '2026-08-01', end: '2026-08-31' });
    expect(suggestions.some((item) => item.type === 'vacant_position')).toBe(true);
    const candidates = suggestions.find((item) => item.type === 'compatible_sailor')!;
    expect(candidates.candidates.find((candidate) => candidate.personId === 2)).toMatchObject({ compatibility: 'compatible' });
    expect(candidates.candidates.find((candidate) => candidate.personId === 3)).toMatchObject({ compatibility: 'incompatible' });
    expect(candidates.candidates.find((candidate) => candidate.personId === 3)?.reasons.join(' ')).toContain('Déjà affecté');
  });

  it('suggests handovers, missing-document actions, reorganization and a change summary', () => {
    const { overview, data } = fixture();
    const suggestions = buildPlanningAssistantSuggestions(overview, data, { start: '2026-08-01', end: '2026-08-31' });
    expect(suggestions.find((item) => item.type === 'handover')?.summary).toContain('Benoît DURAND');
    expect(suggestions.some((item) => item.type === 'missing_document')).toBe(true);
    expect(suggestions.some((item) => item.type === 'reorganization')).toBe(true);
    expect(suggestions.find((item) => item.type === 'change_summary')?.summary).toContain('1 modification');
  });

  it('does not suggest a handover outside the analysed period', () => {
    const { overview, data } = fixture();
    const suggestions = buildPlanningAssistantSuggestions(overview, data, { start: '2026-09-01', end: '2026-09-30' });
    expect(suggestions.some((item) => item.type === 'handover')).toBe(false);
  });

  it('provides every required evidence field and always requires human validation', () => {
    const { overview, data } = fixture();
    const suggestions = buildPlanningAssistantSuggestions(overview, data, { start: '2026-08-01', end: '2026-08-31' });
    for (const suggestion of suggestions) {
      expect(suggestion.criteriaUsed.length).toBeGreaterThan(0);
      expect(suggestion.dataChecked.length).toBeGreaterThan(0);
      expect(suggestion.rulesApplied.length).toBeGreaterThan(0);
      expect(suggestion.confidence.score).toBeGreaterThanOrEqual(0);
      expect(suggestion.justification.length).toBeGreaterThan(0);
      expect(suggestion.humanValidationRequired).toBe(true);
    }
    expect(planningAssistantSuggestionSnapshot(suggestions[0])).toMatchObject({
      human_validation_required: true,
      criteria_used: expect.any(Array),
      data_checked: expect.any(Array),
      rules_applied: expect.any(Array),
      conflicts_detected: expect.any(Array),
      unavailable_data: expect.any(Array),
      confidence: expect.any(Object),
      justification: expect.any(String),
    });
  });

  it('is deterministic and does not mutate the Planning source', () => {
    const { overview, data } = fixture();
    const before = JSON.stringify({ overview, data });
    const first = buildPlanningAssistantSuggestions(overview, data, { start: '2026-08-01', end: '2026-08-31' });
    const second = buildPlanningAssistantSuggestions(overview, data, { start: '2026-08-01', end: '2026-08-31' });
    expect(second).toEqual(first);
    expect(JSON.stringify({ overview, data })).toBe(before);
  });

  it('keeps a large pilot population analysis within the performance budget', () => {
    const { overview, data } = fixture();
    overview.people = Array.from({ length: 500 }, (_, index) => ({ ...overview.people[1], id: index + 10, firstName: `Marin${index}` }));
    overview.assignments = [];
    overview.hrDocuments = [];
    data.p12.absences = [];
    data.p12.matrices = [];
    const startedAt = performance.now();
    const suggestions = buildPlanningAssistantSuggestions(overview, data, { start: '2026-08-01', end: '2026-08-31' });
    expect(suggestions).toHaveLength(1);
    expect(performance.now() - startedAt).toBeLessThan(500);
  });
});
