import { describe, expect, it, vi } from 'vitest';
import { countVesselExpiries, vesselExpiryToday } from './vesselExpiryAlerts';

describe('vessel expiry alert counts', () => {
  it('counts J0 and J30 as due, earlier dates as expired, and ignores unknown or invalid dates', () => {
    expect(countVesselExpiries([
      { vessel_id: 1, expires_on: '2026-10-20' }, { vessel_id: 1, expires_on: '2026-11-19' },
      { vessel_id: 1, expires_on: '2026-11-20' }, { vessel_id: 1, expires_on: '2026-10-19' },
      { vessel_id: 2, expires_on: '2024-02-29' }, { vessel_id: 3, expires_on: null },
      { vessel_id: 3, expires_on: '2026-02-30' }, { vessel_id: 3, expires_on: 'not a date' },
      { vessel_id: 0, expires_on: '2026-10-20' },
    ], '2026-10-20')).toEqual({ 1: { due: 2, expired: 1 }, 2: { due: 0, expired: 1 } });
    expect(countVesselExpiries([], '2026-10-20')).toEqual({});
    expect(() => countVesselExpiries([], '2026-02-30')).toThrow('Date');
  });

  it('uses Paris calendar dates and counts days across daylight saving changes', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-20T22:01:00Z'));
      expect(vesselExpiryToday()).toBe('2026-10-21');
      expect(countVesselExpiries([{ vessel_id: 1, expires_on: '2026-04-27' }], '2026-03-28')).toEqual({ 1: { due: 1, expired: 0 } });
    } finally { vi.useRealTimers(); }
  });
});
