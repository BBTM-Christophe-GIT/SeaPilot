import { describe, expect, it } from 'vitest';
import { emptySeaOperationWaypoint } from '../seaOperations/seaOperationModel';
import { emptyProjectLocationPlan } from './projectLocation';
import { projectLocationRouteEtas } from './projectLocationRouteEtas';

describe('project location ETA preparation', () => {
  it('seeds an empty first ETA from explicit Paris ETD and recalculates automatic slots without mutating the plan', () => {
    const plan = emptyProjectLocationPlan(); plan.etd = '2026-10-27T10:00';
    plan.waypoints = [0, .1].map((longitude, index) => ({ ...emptySeaOperationWaypoint(`p${index}`), latitude: '0', longitude: String(longitude) }));
    const original = structuredClone(plan), result = projectLocationRouteEtas(plan, 10);
    expect(result.waypoints.map(point => point.eta)).toEqual(['2026-10-27T10:00', '2026-10-27T11:00']);
    expect(result.waypoints.map(point => point.etaMode)).toEqual(['automatic', 'automatic']); expect(plan).toEqual(original);
    expect(projectLocationRouteEtas({ ...result, etd: '2026-10-27T12:00' }, 10).waypoints[1].eta).toBe('2026-10-27T13:00');
  });
  it('preserves manual times and explicitly cleared anchors', () => {
    const plan = emptyProjectLocationPlan(); plan.etd = '2026-10-27T10:00';
    plan.waypoints = [{ ...emptySeaOperationWaypoint('first'), eta: '', etaMode: 'manual', latitude: '0', longitude: '0' }];
    expect(projectLocationRouteEtas(plan, 10)).toBe(plan);
    plan.waypoints[0].eta = '2026-10-27T16:00'; expect(projectLocationRouteEtas(plan, 10)).toBe(plan);
  });
  it('keeps the first ETA unavailable when ETD is invalid instead of inventing a departure', () => {
    const plan = emptyProjectLocationPlan(); plan.etd = '10:00'; plan.waypoints = [{ ...emptySeaOperationWaypoint('first'), etaMode: 'automatic' }];
    expect(projectLocationRouteEtas(plan, 10).waypoints[0].eta).toBe('');
  });
});
