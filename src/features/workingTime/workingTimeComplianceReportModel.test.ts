import { describe, expect, it } from 'vitest';
import { workingTimeReportDateChunks } from './workingTimeComplianceReportModel';

describe('workingTimeReportDateChunks', () => {
  it('conserve une courte période dans une seule requête', () => {
    expect(workingTimeReportDateChunks('2026-08-03', '2026-08-09')).toEqual([
      { start: '2026-08-03', end: '2026-08-09' },
    ]);
  });

  it('découpe une année par mois sans trou ni chevauchement', () => {
    const chunks = workingTimeReportDateChunks('2026-01-01', '2026-12-31');

    expect(chunks).toHaveLength(12);
    expect(chunks[0]).toEqual({ start: '2026-01-01', end: '2026-01-31' });
    expect(chunks[1]).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(chunks.at(-1)).toEqual({ start: '2026-12-01', end: '2026-12-31' });
  });

  it('gère correctement une période à cheval sur une année bissextile', () => {
    expect(workingTimeReportDateChunks('2024-02-27', '2024-03-02')).toEqual([
      { start: '2024-02-27', end: '2024-02-29' },
      { start: '2024-03-01', end: '2024-03-02' },
    ]);
  });
});
