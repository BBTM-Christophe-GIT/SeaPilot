// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { emptyProjectLocationPlan, parseProjectLocationPlan, PROJECT_LOCATION_LIMITS, type ProjectLocationPlan } from '../projects/projectLocation';
import { emptySeaOperation, isSeaOperationPayload } from './seaOperationModel';
import { copyProjectLocationToSeaOperation } from './seaOperationProjectLocation';

const point = (id: string, longitude = '0') => ({ id, number: id, descriptionVhf: 'Description conservée', latitude: '0', longitude, eta: '', ukc: '3', denseTraffic: false });
describe('project location copied when selecting a sea-operation mission', () => {
  it('imports an independent project frame and clears the previous manual frame when the chosen plan uses automatic framing', () => {
    const plan = { ...emptyProjectLocationPlan(), mapViewport: { centerLatitude: 49.654321, centerLongitude: -1.789012, longitudeSpan: .023456789 } };
    const draft = emptySeaOperation(); draft.mapViewport = { centerLatitude: 0, centerLongitude: 0, longitudeSpan: 20 };
    const result = copyProjectLocationToSeaOperation(draft, plan);
    expect(result.mapViewport).toEqual(plan.mapViewport); expect(result.mapViewport).not.toBe(plan.mapViewport);
    result.mapViewport!.centerLongitude = 10;
    expect(plan.mapViewport.centerLongitude).toBe(-1.789012); expect(draft.mapViewport.centerLongitude).toBe(0);
    expect(copyProjectLocationToSeaOperation(result, emptyProjectLocationPlan())).not.toHaveProperty('mapViewport');
    expect(copyProjectLocationToSeaOperation(draft, null)).toBe(draft);
  });
  it('copies independent route/points/zones with fresh identities and no retained provider captures', () => {
    const plan = { ...emptyProjectLocationPlan(), charts: '7120 - 7421', etd: '2026-10-27T10:00', waypoints: [point('a'), point('b', '1')],
      points: [{ ...point('isolated', '40'), weather: { stale: true } }], zones: [{ id: 'zone', name: 'Zone', vertices: [{ latitude: '1', longitude: '1' }] }] };
    const draft = emptySeaOperation(); draft.vessel.etd = '2026-10-27T08:00';
    const original = structuredClone(plan); let id = 0;
    // Deliberately model an unchecked provider capture at the import boundary.
    const result = copyProjectLocationToSeaOperation(draft, plan as unknown as ProjectLocationPlan, 20, () => `fresh-${++id}`);
    expect(result.vessel.etd).toBe(plan.etd); expect(result.charts).toBe(plan.charts);
    expect(result.waypoints.map(point => [point.id, point.eta])).toEqual([['fresh-1', '2026-10-27T10:00'], ['fresh-2', '2026-10-27T15:00']]);
    expect(result.locationOverlay).toMatchObject({ version: 1, points: [{ id: 'fresh-3', longitude: '40' }], zones: [{ id: 'fresh-4', name: 'Zone' }] });
    expect(result.locationOverlay!.points[0]).not.toHaveProperty('weather');
    result.locationOverlay!.zones[0].vertices[0].latitude = '5'; result.waypoints[0].descriptionVhf = 'Capitaine';
    expect(plan).toEqual(original); expect(draft.waypoints).toEqual([]);
  });
  it('preserves manual times and explicitly cleared manual anchors', () => {
    const plan = { ...emptyProjectLocationPlan(), etd: '2026-10-27T10:00', waypoints: [{ ...point('a'), eta: '2026-10-27T09:07', etaMode: 'manual' as const },
      { ...point('b', '1'), eta: '2026-10-27T19:15', etaMode: 'manual' as const }] };
    expect(copyProjectLocationToSeaOperation(emptySeaOperation(), plan, 20).waypoints.map(point => point.eta)).toEqual(['2026-10-27T09:07', '2026-10-27T19:15']);
    plan.waypoints[0].eta = '';
    expect(copyProjectLocationToSeaOperation(emptySeaOperation(), plan, 20).waypoints[0].eta).toBe('');
  });
  it('turns the first project-calculated departure into a retained operation anchor without losing the subsequent automatic route', () => {
    const plan = { ...emptyProjectLocationPlan(), etd: '2026-10-27T10:00', waypoints: [
      { ...point('a'), eta: '2026-10-26T08:00', etaMode: 'automatic' as const }, point('b', '1')] };
    const result = copyProjectLocationToSeaOperation(emptySeaOperation(), plan, 20);
    expect(result.waypoints[0]).toMatchObject({ eta: '2026-10-27T10:00', etaMode: 'manual' });
    expect(result.waypoints[1]).toMatchObject({ eta: '2026-10-27T15:00', etaMode: 'automatic' });
  });
  it.each(['', '10:00', '2026-03-29T02:30', '2026-10-25T02:30'])('does not guess a first ETA from absent, incomplete or ambiguous ETD %s', etd => {
    const result = copyProjectLocationToSeaOperation(emptySeaOperation(), { ...emptyProjectLocationPlan(), etd, waypoints: [point('a'), point('b', '1')] }, 20);
    expect(result.waypoints.map(point => point.eta)).toEqual(['', '']);
  });
  it('keeps a declaration unchanged when the selected project has no location', () => {
    const draft = emptySeaOperation(); expect(copyProjectLocationToSeaOperation(draft, null)).toBe(draft);
  });
  it('imports a maximum-size 200-waypoint plan into a complete planning draft within the existing base budget', () => {
    const plan = { ...emptyProjectLocationPlan(), etd: '2026-10-27T10:00', waypoints: Array.from({ length: 200 }, (_, index) => point(`source-${index}`)) };
    let remaining = PROJECT_LOCATION_LIMITS.bytes - new TextEncoder().encode(JSON.stringify(plan)).byteLength;
    for (const point of plan.waypoints) {
      const count = Math.min(remaining, 4000 - point.descriptionVhf.length);
      point.descriptionVhf += 'x'.repeat(count); remaining -= count;
    }
    expect(remaining).toBe(0);
    expect(new TextEncoder().encode(JSON.stringify(plan)).byteLength).toBe(PROJECT_LOCATION_LIMITS.bytes);
    expect(parseProjectLocationPlan(plan)?.waypoints).toHaveLength(200);
    const draft = emptySeaOperation();
    draft.planning = { date: '2026-10-27', projectId: '52', operationId: '72:3', captainPersonId: '14' };
    draft.project = 'P104 – Mission de travail'; draft.client = 'Client de la mission'; draft.clientContact = '12 quai du port, Cherbourg';
    draft.description = 'Description de l’opération sélectionnée';
    Object.assign(draft.vessel, { id: '3', name: 'Navire de mission', captainName: 'Capitaine temporaire', departurePort: 'Cherbourg', arrivalPort: 'Dieppe' });
    const copied = copyProjectLocationToSeaOperation(draft, plan, 12);
    expect(isSeaOperationPayload(copied)).toBe(true);
    const { locationOverlay: _overlay, ...base } = copied;
    expect(_overlay).toEqual({ version: 1, points: [], zones: [] });
    // SQL jsonb::text includes separator whitespace; reserve that extra space too.
    expect(new TextEncoder().encode(JSON.stringify(base, null, 1)).byteLength).toBeLessThan(500000);
  });
});
