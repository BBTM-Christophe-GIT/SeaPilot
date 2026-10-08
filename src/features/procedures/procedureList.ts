import { normalizeFleetName } from '../fleet/fleetDisplay';
import type { ProcedureRecord } from './procedureQueries';

/** A document without a vessel applies to the whole fleet. */
export function procedureAppliesToVessel(record: Pick<ProcedureRecord, 'vesselName'>, vessel: string): boolean {
  const assignedVessel = normalizeFleetName(record.vesselName);
  return !vessel.trim() || !assignedVessel || assignedVessel === normalizeFleetName(vessel);
}

export function selectProcedureList(records: ProcedureRecord[], vessel: string, excludedIds: ReadonlySet<number>): ProcedureRecord[] {
  return records.filter((record) => procedureAppliesToVessel(record, vessel) && !excludedIds.has(record.id));
}
