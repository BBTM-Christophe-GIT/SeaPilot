import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HrDocumentRecord, PersonRecord } from './peopleQueries';
import { buildTrainingPlanReport, openTrainingPlanReport } from './trainingPlanReport';

function person(id: number, firstName: string, lastName: string, active = true): PersonRecord {
  return { active, firstName, id, lastName } as PersonRecord;
}

function document(
  id: number,
  personId: number,
  title: string,
  expiresOn: string,
  categoryKey = 'safety_training',
): HrDocumentRecord {
  return { categoryKey, expiresOn, id, personId, title } as HrDocumentRecord;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildTrainingPlanReport', () => {
  it('recreates the SPFx training plan rules for the following year', () => {
    const people = [
      person(1, 'Adrien', 'BOIS'),
      person(2, 'Arthur', 'RICHER'),
      person(3, 'Mathieu', 'QUESNOT'),
      person(4, 'Arnaud', 'HAUTEMANIERE'),
      person(5, 'David', 'FIDELIN'),
      person(6, 'Alexandre', 'ROUPSARD'),
      person(7, 'Ancien', 'INACTIF', false),
    ];
    const documents = [
      document(1, 1, 'CFBS', '2027-09-20'),
      document(2, 2, "CGO - Certificat Général d'Opérateur", '2027-02-02'),
      document(3, 3, 'CRO', '2027-06-29'),
      document(4, 4, 'Enseignement Médical de niveau I', '2027-12-08'),
      document(5, 5, 'Enseignement Médical de niveau III', '2027-11-17'),
      document(6, 6, "Certificat Médical d'Aptitude à la Navigation Maritime", '2027-08-27', 'medical_visit'),
      document(7, 1, 'CFBS hors année', '2028-01-05'),
      document(8, 7, 'CFBS inactif', '2027-03-02'),
    ];

    const report = buildTrainingPlanReport({
      averageTenureYears: 2.4,
      documents,
      generatedOn: new Date('2026-07-12T12:00:00'),
      people,
      turnoverRate: 13.3,
    });

    expect(report.targetYear).toBe(2027);
    expect(report.totalActions).toBe(5);
    expect(report.totalCost).toBe(5000);
    expect(report.medicalCertificateCount).toBe(1);
    expect(report.fileName).toBe('Plan-de-Formation-2027.pdf');
    expect(report.html).toContain('Plan de Formation 2027');
    expect(report.html).toContain('Turnover annuel 2026');
    expect(report.html).toContain('13,3 %');
    expect(report.html).toContain('Ancienneté moyenne');
    expect(report.html).toContain('2,4 ans');
    expect(report.html).toContain('Adrien BOIS');
    expect(report.html).toContain('Alexandre ROUPSARD');
    expect(report.html).not.toContain('Ancien INACTIF');
    expect(report.html).not.toContain('CFBS hors année');
  });

  it('reports a blocked popup without attempting to write', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const report = buildTrainingPlanReport({
      averageTenureYears: 0,
      documents: [],
      generatedOn: new Date('2026-07-12T12:00:00'),
      people: [],
      turnoverRate: 0,
    });

    expect(openTrainingPlanReport(report)).toBe(false);
  });
});
