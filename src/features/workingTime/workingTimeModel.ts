export const WORKING_TIME_REGISTER_STATUSES = [
  'draft',
  'awaiting_sailor_signature',
  'submitted',
  'validated',
  'reopened',
] as const;

export type WorkingTimeRegisterStatus = typeof WORKING_TIME_REGISTER_STATUSES[number];

export const WORKING_TIME_PERIOD_KINDS = ['weekly', 'monthly'] as const;
export type WorkingTimePeriodKind = typeof WORKING_TIME_PERIOD_KINDS[number];

export const WORKING_TIME_SOURCE_TYPES = [
  'manual',
  'excel_import',
  'planning',
  'sedentary_planning',
  'migration',
  'api',
] as const;

export type WorkingTimeSourceType = typeof WORKING_TIME_SOURCE_TYPES[number];

export const WORKING_TIME_ACTIONS = [
  'request_sailor_signature',
  'sailor_sign',
  'captain_validate',
  'reopen',
] as const;

export type WorkingTimeAction = typeof WORKING_TIME_ACTIONS[number];

export interface WorkingTimeRegister {
  id: number;
  companyId: number;
  personId: number;
  periodKind: WorkingTimePeriodKind;
  periodStart: string;
  periodEnd: string;
  status: WorkingTimeRegisterStatus;
  workRestPolicyId: number | null;
}

export interface WorkingTimeInterval {
  id: number;
  registerId: number;
  companyId: number;
  personId: number;
  localWorkDate: string;
  startsAt: string;
  endsAt: string;
  timezoneName: string;
  utcOffsetMinutes: number;
  vesselId: number | null;
  watchGroup: string | null;
  comment: string | null;
  authorUserId: string | null;
  authorPersonId: number | null;
  sourceType: WorkingTimeSourceType;
  sourceReference: string | null;
  sourceRecordKey: string | null;
}

export const WORKING_TIME_VIOLATION_CODES = [
  'work_24h',
  'rest_24h',
  'consecutive_rest',
  'rest_periods_24h',
  'work_7d',
  'rest_7d',
  'night_work_24h',
] as const;

export type WorkingTimeViolationCode = typeof WORKING_TIME_VIOLATION_CODES[number];

/** Read-only projection produced by the database calculation engine. */
export interface WorkingTimeCalculationWindow {
  id: number;
  companyId: number;
  personId: number;
  windowEnd: string;
  localWindowEndDate: string;
  timezoneName: string;
  vesselId: number | null;
  workRestPolicyId: number | null;
  work24hSeconds: number;
  rest24hSeconds: number;
  longestRest24hSeconds: number;
  restPeriodCount24h: number;
  work7dSeconds: number;
  rest7dSeconds: number;
  nightWork24hSeconds: number | null;
  isCompliant: boolean | null;
  violationCodes: WorkingTimeViolationCode[];
  calculationVersion: number;
  calculatedAt: string;
}

export interface WorkingTimeSignatureSnapshot {
  signatureId: number;
  versionNumber: number;
  storageBucket: 'working-time-signatures';
  storagePath: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  fileSizeBytes: number;
  sha256: string;
  validFrom: string;
}

const TRANSITION_TARGETS: Record<WorkingTimeAction, Partial<Record<WorkingTimeRegisterStatus, WorkingTimeRegisterStatus>>> = {
  request_sailor_signature: {
    draft: 'awaiting_sailor_signature',
    reopened: 'awaiting_sailor_signature',
  },
  sailor_sign: {
    awaiting_sailor_signature: 'submitted',
  },
  captain_validate: {
    submitted: 'validated',
  },
  reopen: {
    awaiting_sailor_signature: 'reopened',
    submitted: 'reopened',
    validated: 'reopened',
  },
};

export function workingTimeTransitionTarget(
  status: WorkingTimeRegisterStatus,
  action: WorkingTimeAction,
): WorkingTimeRegisterStatus | null {
  return TRANSITION_TARGETS[action][status] ?? null;
}

export function canTransitionWorkingTimeRegister(
  status: WorkingTimeRegisterStatus,
  action: WorkingTimeAction,
): boolean {
  return workingTimeTransitionTarget(status, action) !== null;
}

export function workingTimeActionRequiresSignature(action: WorkingTimeAction): boolean {
  return action === 'sailor_sign' || action === 'captain_validate';
}

export function workingTimeIntervalMinutes(interval: Pick<WorkingTimeInterval, 'startsAt' | 'endsAt'>): number {
  const startsAt = Date.parse(interval.startsAt);
  const endsAt = Date.parse(interval.endsAt);
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) {
    throw new Error('Intervalle de travail invalide.');
  }
  return (endsAt - startsAt) / 60_000;
}

function parseLocalDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Date locale invalide.');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('Date locale invalide.');
  }
  return date;
}

function formatLocalDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function workingTimePeriodBounds(
  periodKind: WorkingTimePeriodKind,
  anchorDate: string,
): { periodStart: string; periodEnd: string } {
  const anchor = parseLocalDate(anchorDate);
  if (periodKind === 'weekly') {
    const end = new Date(anchor);
    end.setUTCDate(end.getUTCDate() + 6);
    return { periodStart: anchorDate, periodEnd: formatLocalDate(end) };
  }

  const start = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
  const end = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0));
  return { periodStart: formatLocalDate(start), periodEnd: formatLocalDate(end) };
}
