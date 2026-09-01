import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FleetCertificateRecord } from './fleetCertificateQueries';
import type { FleetCertificateFinding } from './fleetCertificateFindings';
import {
  buildFleetCertificateActionReportHierarchy,
  buildFleetCertificateDocumentReportHierarchy,
  buildFleetCertificateDocumentReportRows,
  buildFleetFindingReportHierarchy,
  calculateContainSize,
  formatFleetCertificateDocumentExpiry,
  generateFleetFindingReport,
  sanitizeFleetReportText,
} from './fleetCertificateFindingReport';

const certificate = {
  id: 42,
  vesselName: 'GOURY',
  categoryLabel: '02 - Centre de Sécurité des Navires',
  documentTitle: 'Certificat de Franc-Bord',
  expiresOn: '2027-09-15',
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

function pdfPageCount(arrayBuffer: ArrayBuffer): number {
  return new TextDecoder('latin1').decode(arrayBuffer).match(/\/Type \/Page\b/g)?.length || 0;
}

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

  it('sorts report findings by type before due year and object', () => {
    const hierarchy = buildFleetFindingReportHierarchy([certificate], [
      { ...finding, id: 83, reference: 'EC-2026-0014', findingType: 'prescription', treatmentDueOn: '2024-01-01', title: '1. Prescription' },
      { ...finding, id: 82, reference: 'EC-2026-0013', findingType: 'observation', treatmentDueOn: '2025-01-01', title: '1. Observation' },
      { ...finding, id: 84, reference: 'EC-2026-0015', findingType: 'remark', treatmentDueOn: '2026-01-01', title: '1. Remarque' },
    ]);

    expect(hierarchy[0].categories[0].documents[0].findings.map((item) => item.findingType)).toEqual([
      'remark',
      'observation',
      'prescription',
    ]);
  });

  it('associates documents and findings with the corresponding vessel and category', () => {
    const secondCertificate = {
      ...certificate,
      id: 43,
      vesselName: 'SUROIT',
      categoryLabel: '03 - Organismes de classification',
      documentTitle: 'Certificat de classe',
    } as FleetCertificateRecord;
    const hierarchy = buildFleetCertificateActionReportHierarchy(
      [secondCertificate, certificate],
      [finding],
      new Date('2026-08-11T12:00:00Z'),
    );

    expect(hierarchy.map((vessel) => vessel.name)).toEqual(['GOURY', 'SUROIT']);
    expect(hierarchy[0].categories[0]).toMatchObject({
      label: '02 - Centre de Sécurité des Navires',
      documents: [{
        reportRow: expect.objectContaining({ documentTitle: 'Certificat de Franc-Bord', validity: 'Valide' }),
        findings: [expect.objectContaining({ reference: 'EC-2026-0012' })],
      }],
    });
    expect(hierarchy[1].categories[0].documents[0].findings).toEqual([]);
  });

  it('keeps the parent category above its LSA subcategory', () => {
    const lsaCertificate = {
      ...certificate,
      categoryKey: '07-1-radeaux-hru',
      categoryLabel: '07.1 - Radeaux / HRU',
      documentTitle: 'Radeau de survie bâbord',
    } as FleetCertificateRecord;

    const hierarchy = buildFleetCertificateActionReportHierarchy(
      [lsaCertificate],
      [],
      new Date('2026-08-19T12:00:00Z'),
    );

    expect(hierarchy[0].categories[0]).toMatchObject({
      key: '07-1-radeaux-hru',
      label: '07.1 - Radeaux / HRU',
      parentKey: '07-lsa',
      parentLabel: '07 - LSA',
    });
  });

  it('preserves image proportions inside the requested box', () => {
    expect(calculateContainSize(500, 500, 34, 15)).toEqual({ width: 15, height: 15 });
    expect(calculateContainSize(1200, 600, 184, 150)).toEqual({ width: 184, height: 92 });
  });

  it('builds the document list with expiry dates and binary validity labels', () => {
    const rows = buildFleetCertificateDocumentReportRows([
      certificate,
      { ...certificate, id: 43, vesselName: 'SUROIT', documentTitle: 'Certificat extincteurs', expiresOn: '2026-08-01' },
      { ...certificate, id: 44, documentTitle: 'Permis de Navigation', expiresOn: '' },
    ], new Date('2026-08-11T12:00:00Z'));

    expect(rows).toEqual([
      expect.objectContaining({ documentTitle: 'Certificat de Franc-Bord', expiresOn: '2027-09-15', validity: 'Valide' }),
      expect.objectContaining({ documentTitle: 'Permis de Navigation', expiresOn: '', validity: 'Valide' }),
      expect.objectContaining({ documentTitle: 'Certificat extincteurs', expiresOn: '2026-08-01', validity: 'Échu' }),
    ]);
    expect(formatFleetCertificateDocumentExpiry('')).toBe('Validité illimitée');
    expect(formatFleetCertificateDocumentExpiry('2027-09-15')).toBe('15/09/2027');

    const hierarchy = buildFleetCertificateDocumentReportHierarchy(rows);
    expect(hierarchy.map((vessel) => vessel.name)).toEqual(['GOURY', 'SUROIT']);
    expect(hierarchy[0].categories[0]).toMatchObject({
      label: '02 - Centre de Sécurité des Navires',
      documents: [
        expect.objectContaining({ documentTitle: 'Certificat de Franc-Bord' }),
        expect.objectContaining({ documentTitle: 'Permis de Navigation' }),
      ],
    });
  });

  it('removes the report brand word regardless of casing', () => {
    expect(sanitizeFleetReportText('Système SeaPilot - SEAPILOT - seaPilot')).toBe('Système - -');
  });

  it('generates the fleet certificate action plan PDF with the canonical filename', async () => {
    const report = await generateFleetFindingReport({
      certificates: [certificate],
      findings: [finding],
      generatedOn: new Date('2026-08-11T12:00:00Z'),
      includeDocuments: true,
      includeFindings: false,
    });
    expect(report.filename).toBe('BBTM-Certificats-Flotte-Plan-d-Action-2026-08-11.pdf');
    expect(report.blob.type).toBe('application/pdf');
    expect(report.blob.size).toBeGreaterThan(1_000);
  });

  it('starts the report directly with one dedicated page per vessel', async () => {
    const report = await generateFleetFindingReport({
      certificates: [
        certificate,
        { ...certificate, id: 43, vesselName: 'SUROIT', documentTitle: 'Certificat de classe' },
      ],
      findings: [finding],
      generatedOn: new Date('2026-08-11T12:00:00Z'),
      includeDocuments: true,
      includeFindings: true,
    });
    expect(pdfPageCount(report.arrayBuffer)).toBe(2);
  });

  it('keeps an 18-document single-vessel list on one page', async () => {
    const categoryLabels = Array.from({ length: 14 }, (_, index) => (
      `${String(index + 1).padStart(2, '0')} - Catégorie ${index + 1}`
    ));
    const certificates = Array.from({ length: 18 }, (_, index) => ({
      ...certificate,
      id: 100 + index,
      vesselName: 'SUROIT',
      categoryKey: index === 0 ? '07-1-radeaux-hru' : `category-${Math.min(index, categoryLabels.length - 1)}`,
      categoryLabel: index === 0
        ? '07.1 - Radeaux / HRU'
        : categoryLabels[Math.min(index, categoryLabels.length - 1)],
      documentTitle: `Document réglementaire ${String(index + 1).padStart(2, '0')}`,
      expiresOn: index % 4 === 0 ? '' : '2027-09-15',
    } as FleetCertificateRecord));

    const report = await generateFleetFindingReport({
      certificates,
      findings: [],
      generatedOn: new Date('2026-08-19T12:00:00Z'),
      includeDocuments: true,
      includeFindings: false,
    });

    expect(pdfPageCount(report.arrayBuffer)).toBe(1);
    expect(report.blob.size).toBeGreaterThan(1_000);
  });

  it('generates a findings-only report with the same vessel and category organization', async () => {
    const report = await generateFleetFindingReport({
      certificates: [certificate],
      findings: [finding],
      generatedOn: new Date('2026-08-11T12:00:00Z'),
      includeDocuments: false,
      includeFindings: true,
    });
    expect(pdfPageCount(report.arrayBuffer)).toBe(1);
    expect(report.blob.size).toBeGreaterThan(1_000);
  });

  it('rejects a report with neither list selected', async () => {
    await expect(generateFleetFindingReport({
      certificates: [certificate],
      findings: [finding],
      includeDocuments: false,
      includeFindings: false,
    })).rejects.toThrow('Sélectionnez au moins une liste à éditer.');
  });
});
