import { readFile, writeFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import type { WorkingTimeComplianceReportData } from './workingTimeComplianceReportModel';
import { buildWorkingTimeCompliancePdf } from './workingTimeComplianceReportPdf';

const report: WorkingTimeComplianceReportData = {
  analysis: 'Les heures sont maîtrisées sur la période. Une journée non conforme nécessite une revue opérationnelle.',
  assumptions: ['Les données proviennent des intervalles horodatés.', 'Les taux non configurés restent vides.'],
  breakdownByPerson: [{ id: '1', label: 'Pierre LEPRETRE', value: 1 }],
  breakdownByVessel: [{ id: '7', label: 'GOURY', value: 1 }],
  end: '2026-12-31',
  formulas: ['LTI = FAT + LWDC.', 'LTIFR = LTI × 1 000 000 / heures d’exposition.'],
  generatedAt: '2026-08-09T08:00:00Z',
  methodologyLabel: 'Méthode BBTM · v1',
  metricKeys: ['imca', 'french', 'non_compliance'],
  nonCompliantDays: 1,
  peopleAffected: 1,
  periodLabel: '01 janvier 2026 – 31 décembre 2026',
  rates: { LTI: 1, LTIFR: 2.1, TRIR: 3.2, FAR: 0, FAC_rate: 1.2, MTC_rate: 0, RWC_rate: 0, SOFR: 5.4, french_frequency_rate: 2.1, french_severity_rate: 0.4 },
  rawKpis: { exposure_hours: 476_000, FAT: 0, LWDC: 1, RWC: 0, MTC: 0, FAC: 2, near_miss: 3, safety_observation: 8, lost_days: 12 },
  start: '2026-01-01',
  trend: Array.from({ length: 12 }, (_, index) => ({ key: `2026-${String(index + 1).padStart(2, '0')}`, label: `M${index + 1}`, nonCompliantDays: index === 4 ? 1 : 0, workHours: 720 + index * 24 })),
  workHours: 10_452.5,
};

describe('buildWorkingTimeCompliancePdf', () => {
  it('creates a branded multi-section PDF and keeps formulas as the final chapter', async () => {
    const logo = await readFile('public/bbtm-report-logo.png');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => logo.buffer.slice(logo.byteOffset, logo.byteOffset + logo.byteLength),
    }));
    const generated = await buildWorkingTimeCompliancePdf(report, report.analysis);
    const bytes = new Uint8Array(generated.document.output('arraybuffer'));

    expect(generated.filename).toBe('rapport-suivi-temps-travail-2026-01-01-2026-12-31.pdf');
    expect(generated.document.getNumberOfPages()).toBeGreaterThanOrEqual(2);
    expect(bytes.byteLength).toBeGreaterThan(10_000);

    if (process.env.WORKING_TIME_PDF_SAMPLE) {
      await writeFile(process.env.WORKING_TIME_PDF_SAMPLE, bytes);
    }
  });
});
