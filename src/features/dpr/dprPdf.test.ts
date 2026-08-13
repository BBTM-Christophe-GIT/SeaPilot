import { PDFDocument } from 'pdf-lib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_DPR_PAYLOAD } from './dprFormModel.ts';
import { dprPdfFilename, generateDprPdf } from './dprPdf.ts';
import type { DprReferenceData, DprReportRecord } from './dprQueries.ts';

const report: DprReportRecord = {
  id: 1071,
  number: 1071,
  status: 'validated',
  reportDate: '2026-07-29',
  projectId: 144,
  projectCode: 'P144',
  projectTitle: 'Guard Vessel EMDT',
  unlistedProjectName: '',
  vesselId: 3,
  vesselName: 'GOURY',
  validatorPersonId: 12,
  validatorName: 'Pierre LEPRETRE',
  issuerName: 'Christophe',
  description: 'Opération de surveillance',
  qhseNote: 'RAS',
  createdBy: 'user-1',
  updatedAt: '2026-07-30T00:47:00+02:00',
  fuelConsumedLiters: 600,
  incidentCount: 0,
  files: [],
};

const references: DprReferenceData = {
  projects: [{ id: 144, code: 'P144', title: 'Guard Vessel EMDT' }],
  vessels: [{ id: 3, name: 'GOURY' }],
  people: [],
  exerciseTypes: [],
  portReasons: [],
};

describe('DPR PDF Power BI reference layout', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
  });

  it('uses the selected DPR identity in the filename', () => {
    expect(dprPdfFilename(report, references)).toBe('DPR-1071 - GOURY - 29-07-2026.pdf');
  });

  it('generates one portrait page with the reference dimensions', async () => {
    const payload = structuredClone(EMPTY_DPR_PAYLOAD);
    payload.reportDate = report.reportDate;
    payload.projectId = report.projectId;
    payload.vesselId = report.vesselId;
    payload.description = report.description;
    payload.metrics.fuelConsumedLiters = '600';

    const generated = await generateDprPdf(report, payload, references);
    const document = await PDFDocument.load(await generated.blob.arrayBuffer());
    const [page] = document.getPages();

    expect(document.getPageCount()).toBe(1);
    expect(page.getWidth()).toBeCloseTo(1896, 1);
    expect(page.getHeight()).toBeCloseTo(2667.12, 1);
    expect(document.getTitle()).toBe('Daily Progress Report - DPR-1071');
  });
});
