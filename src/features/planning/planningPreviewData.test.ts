import { describe, expect, it } from 'vitest';
import { buildPlanningCrewRows, buildPlanningTimeline } from './planningModel';
import { createPlanningPreviewOverview } from './planningPreviewData';

describe('Planning preview data', () => {
  it('provides a vessel, watch and sailor hierarchy without exposing an empty vessel', () => {
    const anchorDate = '2026-07-14';
    const overview = createPlanningPreviewOverview(anchorDate);
    const rows = buildPlanningCrewRows(overview, buildPlanningTimeline(anchorDate, 'month'), {
      vesselName: '',
      personName: '',
      eventType: '',
      status: '',
      responsible: '',
    });

    expect(rows.some((row) => row.type === 'vessel' && row.label === 'GOURY')).toBe(true);
    expect(rows.some((row) => row.type === 'board' && row.label === 'Bordée 1')).toBe(true);
    expect(rows.some((row) => row.type === 'person' && row.label === 'Pierre LEPRETRE')).toBe(true);
    expect(rows.some((row) => row.type === 'person' && row.label === 'Alain ANCIEN' && row.events.length === 0)).toBe(true);
    expect(rows.some((row) => row.type === 'vessel' && row.label === 'NAVIRES SANS EQUIPAGE')).toBe(false);
  });
});
