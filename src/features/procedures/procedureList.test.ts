import { describe, expect, it } from 'vitest';
import { procedureAppliesToVessel, selectProcedureList } from './procedureList';
import type { ProcedureRecord } from './procedureQueries';

describe('procedure vessel scope', () => {
  it.each(['', '  ', 'LE ROZEL', ' le rozel '])('includes common or matching vessel %j', (vesselName) => {
    expect(procedureAppliesToVessel({ vesselName }, 'LE ROZEL')).toBe(true);
  });
  it('does not match another vessel or a partial vessel name', () => {
    expect(procedureAppliesToVessel({ vesselName: 'GOURY' }, 'LE ROZEL')).toBe(false);
    expect(procedureAppliesToVessel({ vesselName: 'LE ROZEL II' }, 'LE ROZEL')).toBe(false);
  });
  it('never exports checked records from another vessel and supports an empty selection', () => {
    const records = [{ id: 1, vesselName: 'LE ROZEL' }, { id: 2, vesselName: '' }, { id: 3, vesselName: 'GOURY' }] as ProcedureRecord[];
    expect(selectProcedureList(records, 'LE ROZEL', new Set([2])).map((item) => item.id)).toEqual([1]);
    expect(selectProcedureList(records, 'LE ROZEL', new Set([1, 2]))).toEqual([]);
    expect(selectProcedureList(records, '', new Set())).toHaveLength(3);
  });
});
