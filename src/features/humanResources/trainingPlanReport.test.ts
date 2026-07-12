import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HrDocumentRecord, PersonRecord } from './peopleQueries';
import { buildAnnualHrIndicators, buildTrainingPlanReport, openTrainingPlanReport } from './trainingPlanReport';

function person(
  id: number,
  firstName: string,
  lastName: string,
  active = true,
  hiredOn = '2024-01-01',
  departedOn = '',
): PersonRecord {
  return { active, departedOn, firstName, hiredOn, id, lastName } as PersonRecord;
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
      person(7, 'Ancien', 'INACTIF', false, '2023-01-01', '2025-06-30'),
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
      documents,
      generatedOn: new Date('2026-07-12T12:00:00'),
      people,
    });

    expect(report.targetYear).toBe(2027);
    expect(report.totalActions).toBe(5);
    expect(report.totalCost).toBe(5000);
    expect(report.medicalCertificateCount).toBe(1);
    expect(report.fileName).toBe('Plan-de-Formation-2027.pdf');
    expect(report.trainingGroups[0].actions[0].personName).toBe('Adrien BOIS');
    expect(report.medicalCertificates[0].personName).toBe('Alexandre ROUPSARD');
    expect(report.annualIndicators[0].year).toBe(2023);
    expect(report.annualIndicators.at(-1)?.year).toBe(2026);
  });

  it('calculates annual turnover and average tenure from the first hire year', () => {
    const indicators = buildAnnualHrIndicators(
      [
        person(1, 'Alice', 'ACTIVE', true, '2020-01-01'),
        person(2, 'Bob', 'DEPARTED', false, '2021-01-01', '2022-06-30'),
      ],
      new Date('2023-07-01T12:00:00'),
    );

    expect(indicators.map((indicator) => indicator.year)).toEqual([2020, 2021, 2022, 2023]);
    expect(indicators[2]).toMatchObject({
      averageHeadcount: 1.5,
      departures: 1,
      headcountEnd: 1,
      headcountStart: 2,
      turnoverRate: 66.7,
    });
    expect(indicators[3].peopleWithTenure).toBe(1);
    expect(indicators[3].averageTenureYears).toBe(3.5);
  });

  it('reports a blocked popup without attempting to generate the PDF', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const report = buildTrainingPlanReport({
      documents: [],
      generatedOn: new Date('2026-07-12T12:00:00'),
      people: [],
    });

    await expect(openTrainingPlanReport(report)).resolves.toBe(false);
  });
});
