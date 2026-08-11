import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FleetCertificateRecord } from './fleetCertificateQueries';
import type { FleetCertificateFinding } from './fleetCertificateFindings';
import {
  buildFleetFindingReportHierarchy,
  calculateContainSize,
  generateFleetFindingReport,
} from './fleetCertificateFindingReport';

const certificate = {
  id: 42,
  vesselName: 'GOURY',
  categoryLabel: '02 - Centre de Sécurité des Navires',
  documentTitle: 'Certificat de Franc-Bord',
} as FleetCertificateRecord;

const finding: FleetCertificateFinding = {
  id: 81,
  companyId: 1,
  certificateId: 42,
  reference: 'EC-2026-0012',
  findingType: 'major_non_conformity',
  title: 'Corrosion du support bâbord',
  description: 'Corrosion perforante à reprendre avant validation.',
  detectedOn: '2026-07-16',
  treatmentDelayDays: 21,
  treatmentDueOn: '2026-08-06',
  status: 'closed',
  progress: 100,
  responsiblePersonId: 9303,
  responsibleName: 'Luc MARTIN',
  closedAt: '2026-08-07T11:30:00Z',
  createdAt: '2026-07-16T09:14:00Z',
  updatedAt: '2026-08-07T11:30:00Z',
  attachments: [],
  events: [{
    id: 91,
    findingId: 81,
    eventType: 'commented',
    fromStatus: 'in_progress',
    toStatus: 'in_progress',
    note: 'Réparation terminée et contrôlée.',
    authorName: 'Arthur DEMO',
    createdAt: '2026-08-07T10:15:00Z',
  }],
};

describe('fleet certificate action plan report', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
  });

  it('groups findings by vessel, category and document', () => {
    const hierarchy = buildFleetFindingReportHierarchy([certificate], [finding]);
    expect(hierarchy[0].name).toBe('GOURY');
    expect(hierarchy[0].categories[0].label).toBe('02 - Centre de Sécurité des Navires');
    expect(hierarchy[0].categories[0].documents[0].certificate.documentTitle).toBe('Certificat de Franc-Bord');
    expect(hierarchy[0].categories[0].documents[0].findings[0]).toMatchObject({
      title: 'Corrosion du support bâbord',
      closedAt: '2026-08-07T11:30:00Z',
    });
  });

  it('preserves image proportions inside the requested box', () => {
    expect(calculateContainSize(500, 500, 34, 15)).toEqual({ width: 15, height: 15 });
    expect(calculateContainSize(1200, 600, 184, 150)).toEqual({ width: 184, height: 92 });
  });

  it('generates a Plan d Action PDF with the canonical filename', async () => {
    const report = await generateFleetFindingReport({
      certificates: [certificate],
      findings: [finding],
      generatedOn: new Date('2026-08-11T12:00:00Z'),
    });
    expect(report.filename).toBe('BBTM-Plan-d-Action-2026-08-11.pdf');
    expect(report.blob.type).toBe('application/pdf');
    expect(report.blob.size).toBeGreaterThan(1_000);
  });
});
