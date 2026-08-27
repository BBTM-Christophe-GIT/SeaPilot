import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { dprArchiveFilename, generateDprArchive } from './dprExport.ts';
import type { DprReportRecord } from './dprQueries.ts';

function report(id: number, number: number, date: string): DprReportRecord {
  return {
    id, number, status: 'validated', reportDate: date, projectId: 144, projectCode: 'P144',
    projectTitle: 'Projet', unlistedProjectName: '', vesselId: 3, vesselName: 'GOURY',
    validatorPersonId: 12, validatorName: 'Pierre LEPRETRE',
    issuerName: 'Christophe', description: 'Opération', qhseNote: '', createdBy: 'user-1', createdAt: `${date}T08:00:00Z`,
    updatedAt: `${date}T18:00:00Z`, fuelConsumedLiters: 600, incidentCount: 0, files: [],
  };
}

describe('DPR on-demand archive', () => {
  it('builds a deterministic archive filename from its scope', () => {
    expect(dprArchiveFilename([report(1, 1070, '2026-07-28'), report(2, 1071, '2026-07-29')]))
      .toBe('GOURY_P144_DPR_2026-07-28_2026-07-29.zip');
  });

  it('creates one PDF per DPR without persisting files', async () => {
    const reports = [report(1, 1070, '2026-07-28'), report(2, 1071, '2026-07-29')];
    const progress = vi.fn();
    const generate = vi.fn(async (item: DprReportRecord) => ({
      blob: new Blob([`DPR-${item.number}`], { type: 'application/pdf' }),
      filename: `DPR-${item.number}.pdf`,
    }));

    const generated = await generateDprArchive(reports, generate, progress);
    const zip = await JSZip.loadAsync(await generated.blob.arrayBuffer());

    expect(Object.keys(zip.files)).toEqual(['1-DPR-1070.pdf', '2-DPR-1071.pdf']);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenLastCalledWith({ completed: 2, total: 2, report: reports[1] });
  });
});
