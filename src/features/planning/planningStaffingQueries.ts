import type { SupabaseClient } from '@supabase/supabase-js';

export interface PlanningStaffingCompositionMember {
  assignmentId: number;
  personId: number;
  personName: string;
  hrFunctionLabel: string;
  planningFunctionLabel: string;
  confirmationStatus: string;
  startsOn: string;
  endsOn: string;
}

export type PlanningStaffingDiscrepancySeverity = 'blocking' | 'warning' | 'derogated';

export interface PlanningStaffingDiscrepancy {
  type: string;
  severity: PlanningStaffingDiscrepancySeverity;
  message: string;
  requirementId: number | null;
  functionLabel: string;
  personId: number | null;
  personName: string;
  credentialLabel: string;
  derogation: boolean;
}

export interface PlanningStaffingBoardStatus {
  vesselId: number;
  watchGroup: string;
  workDate: string;
  matrixId: number | null;
  matrixName: string;
  composition: PlanningStaffingCompositionMember[];
  discrepancies: PlanningStaffingDiscrepancy[];
  blockingCount: number;
  warningCount: number;
  publishable: boolean;
}

interface StaffingAlertRow {
  vessel_id: number | string;
  watch_group: string;
  work_date: string;
  status: Record<string, unknown>;
}

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function mapStatus(raw: Record<string, unknown>, row?: StaffingAlertRow): PlanningStaffingBoardStatus {
  const composition = Array.isArray(raw.composition) ? raw.composition : [];
  const discrepancies = Array.isArray(raw.discrepancies) ? raw.discrepancies : [];
  return {
    vesselId: Number(raw.vessel_id ?? row?.vessel_id),
    watchGroup: String(raw.watch_group ?? row?.watch_group ?? ''),
    workDate: String(raw.work_date ?? row?.work_date ?? ''),
    matrixId: numberOrNull(raw.matrix_id),
    matrixName: String(raw.matrix_name || ''),
    composition: composition.map((item) => {
      const value = item as Record<string, unknown>;
      return {
        assignmentId: Number(value.assignment_id),
        personId: Number(value.person_id),
        personName: String(value.person_name || ''),
        hrFunctionLabel: String(value.hr_function_label || ''),
        planningFunctionLabel: String(value.planning_function_label || ''),
        confirmationStatus: String(value.confirmation_status || ''),
        startsOn: String(value.starts_on || ''),
        endsOn: String(value.ends_on || ''),
      };
    }),
    discrepancies: discrepancies.map((item) => {
      const value = item as Record<string, unknown>;
      const severity = String(value.severity || 'blocking');
      return {
        type: String(value.type || ''),
        severity: severity === 'warning' || severity === 'derogated' ? severity : 'blocking',
        message: String(value.message || ''),
        requirementId: numberOrNull(value.requirement_id),
        functionLabel: String(value.function_label || ''),
        personId: numberOrNull(value.person_id),
        personName: String(value.person_name || ''),
        credentialLabel: String(value.credential_label || ''),
        derogation: Boolean(value.derogation),
      };
    }),
    blockingCount: Number(raw.blocking_count || 0),
    warningCount: Number(raw.warning_count || 0),
    publishable: Boolean(raw.publishable),
  };
}

export function planningStaffingBoardKey(vesselId: number, watchGroup: string, workDate: string): string {
  return `${vesselId}:${watchGroup.trim().toLocaleLowerCase('fr-FR')}:${workDate}`;
}

export async function fetchPlanningStaffingAlerts(
  client: SupabaseClient,
  startsOn: string,
  endsOn: string,
): Promise<PlanningStaffingBoardStatus[]> {
  const { data, error } = await client.rpc('planning_staffing_alerts', { p_starts_on: startsOn, p_ends_on: endsOn });
  if (error) throw error;
  return ((data || []) as StaffingAlertRow[]).map((row) => mapStatus(row.status, row));
}

export async function confirmPlanningBoardFunctions(
  client: SupabaseClient,
  status: PlanningStaffingBoardStatus,
  functions: Array<{ assignmentId: number; functionLabel: string }>,
): Promise<PlanningStaffingBoardStatus> {
  const { data, error } = await client.rpc('confirm_planning_board_functions', {
    p_vessel_id: status.vesselId,
    p_watch_group: status.watchGroup,
    p_work_date: status.workDate,
    p_positions: functions,
  });
  if (error) throw error;
  return mapStatus((data || {}) as Record<string, unknown>);
}

export async function grantPlanningStaffingDerogation(client: SupabaseClient, input: {
  vesselId: number;
  watchGroup: string;
  startsOn: string;
  endsOn: string;
  requirementId: number;
  credentialLabel: string;
  reason: string;
}): Promise<number> {
  const { data, error } = await client.rpc('grant_planning_staffing_derogation', {
    p_vessel_id: input.vesselId,
    p_watch_group: input.watchGroup,
    p_starts_on: input.startsOn,
    p_ends_on: input.endsOn,
    p_requirement_id: input.requirementId,
    p_credential_label: input.credentialLabel,
    p_reason: input.reason,
  });
  if (error) throw error;
  return Number(data);
}
