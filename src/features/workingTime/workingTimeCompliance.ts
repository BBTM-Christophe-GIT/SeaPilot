import type {
  WorkingTimeCalculationWindow,
  WorkingTimeInterval,
  WorkingTimeViolationCode,
} from './workingTimeModel';
import type { WorkingTimePolicyThresholds } from './workingTimeQueries';

type ThresholdKind = 'maximum' | 'minimum';
type ViolationUnit = 'hours' | 'periods';

interface ViolationRule {
  label: string;
  thresholdKind: ThresholdKind;
  unit: ViolationUnit;
  value: (calculation: WorkingTimeCalculationWindow) => number;
  threshold: (policy: WorkingTimePolicyThresholds) => number;
  windowMilliseconds: number;
}

export interface WorkingTimeViolationDetail {
  alarmDay: string;
  calculation: WorkingTimeCalculationWindow;
  code: WorkingTimeViolationCode;
  label: string;
  policyName: string | null;
  threshold: number | null;
  thresholdKind: ThresholdKind;
  unit: ViolationUnit;
  value: number;
}

const HOURS_24 = 24 * 60 * 60 * 1000;
const DAYS_7 = 7 * HOURS_24;

const RULES: Record<WorkingTimeViolationCode, ViolationRule> = {
  work_24h: {
    label: 'Travail sur 24 h', thresholdKind: 'maximum', unit: 'hours',
    value: (calculation) => calculation.work24hSeconds / 3600,
    threshold: (policy) => policy.maxWork24h,
    windowMilliseconds: HOURS_24,
  },
  rest_24h: {
    label: 'Repos sur 24 h', thresholdKind: 'minimum', unit: 'hours',
    value: (calculation) => calculation.rest24hSeconds / 3600,
    threshold: (policy) => policy.minRest24h,
    windowMilliseconds: HOURS_24,
  },
  consecutive_rest: {
    label: 'Repos consécutif sur 24 h', thresholdKind: 'minimum', unit: 'hours',
    value: (calculation) => calculation.longestRest24hSeconds / 3600,
    threshold: (policy) => policy.minConsecutiveRestHours,
    windowMilliseconds: HOURS_24,
  },
  rest_periods_24h: {
    label: 'Fractionnement du repos sur 24 h', thresholdKind: 'maximum', unit: 'periods',
    value: (calculation) => calculation.restPeriodCount24h,
    threshold: (policy) => policy.maxRestPeriods24h,
    windowMilliseconds: HOURS_24,
  },
  work_7d: {
    label: 'Travail sur 7 jours', thresholdKind: 'maximum', unit: 'hours',
    value: (calculation) => calculation.work7dSeconds / 3600,
    threshold: (policy) => policy.maxWork7d,
    windowMilliseconds: DAYS_7,
  },
  rest_7d: {
    label: 'Repos sur 7 jours', thresholdKind: 'minimum', unit: 'hours',
    value: (calculation) => calculation.rest7dSeconds / 3600,
    threshold: (policy) => policy.minRest7d,
    windowMilliseconds: DAYS_7,
  },
  night_work_24h: {
    label: 'Travail de nuit sur 24 h', thresholdKind: 'maximum', unit: 'hours',
    value: (calculation) => (calculation.nightWork24hSeconds || 0) / 3600,
    threshold: (policy) => policy.maxNightWork24h,
    windowMilliseconds: HOURS_24,
  },
};

function calculationsForDay(calculations: WorkingTimeCalculationWindow[], day: string) {
  return calculations
    .filter((calculation) => calculation.localWindowEndDate === day)
    .sort((left, right) => left.windowEnd.localeCompare(right.windowEnd));
}

function violationAlarmDay(
  calculation: WorkingTimeCalculationWindow,
  code: WorkingTimeViolationCode,
  intervals: WorkingTimeInterval[],
): string | null {
  const windowEnd = new Date(calculation.windowEnd).getTime();
  const windowStart = windowEnd - RULES[code].windowMilliseconds;
  return intervals
    .filter((interval) => new Date(interval.startsAt).getTime() < windowEnd
      && new Date(interval.endsAt).getTime() > windowStart)
    .sort((left, right) => left.endsAt.localeCompare(right.endsAt))
    .at(-1)?.localWorkDate || null;
}

function allViolationDetails(
  calculations: WorkingTimeCalculationWindow[],
  intervals: WorkingTimeInterval[],
  policies: WorkingTimePolicyThresholds[],
): WorkingTimeViolationDetail[] {
  return calculations
    .filter((calculation) => calculation.isCompliant === false)
    .flatMap((calculation) => {
      const policy = policies.find((candidate) => candidate.id === calculation.workRestPolicyId) || null;
      return calculation.violationCodes.flatMap((code) => {
        const alarmDay = violationAlarmDay(calculation, code, intervals);
        if (!alarmDay) return [];
        const rule = RULES[code];
        return [{
          alarmDay,
          calculation,
          code,
          label: rule.label,
          policyName: policy?.name || null,
          threshold: policy ? rule.threshold(policy) : null,
          thresholdKind: rule.thresholdKind,
          unit: rule.unit,
          value: rule.value(calculation),
        } satisfies WorkingTimeViolationDetail];
      });
    });
}

function breachMagnitude(detail: WorkingTimeViolationDetail): number {
  if (detail.threshold === null) return 0;
  return detail.thresholdKind === 'maximum'
    ? detail.value - detail.threshold
    : detail.threshold - detail.value;
}

function chooseDetails(details: WorkingTimeViolationDetail[], alarmDay?: string): WorkingTimeViolationDetail[] {
  const chosen = new Map<WorkingTimeViolationCode, WorkingTimeViolationDetail>();
  details.forEach((detail) => {
    const previous = chosen.get(detail.code);
    const detailEndsOnAlarmDay = detail.calculation.localWindowEndDate === alarmDay;
    const previousEndsOnAlarmDay = previous?.calculation.localWindowEndDate === alarmDay;
    if (!previous
      || (detailEndsOnAlarmDay && !previousEndsOnAlarmDay)
      || (detailEndsOnAlarmDay === previousEndsOnAlarmDay && breachMagnitude(detail) > breachMagnitude(previous))
      || (detailEndsOnAlarmDay === previousEndsOnAlarmDay
        && breachMagnitude(detail) === breachMagnitude(previous)
        && detail.calculation.windowEnd > previous.calculation.windowEnd)) {
      chosen.set(detail.code, detail);
    }
  });
  return Array.from(chosen.values());
}

export function workingTimeNonCompliantDates(
  calculations: WorkingTimeCalculationWindow[],
  intervals: WorkingTimeInterval[],
): string[] {
  return Array.from(new Set(allViolationDetails(calculations, intervals, []).map((detail) => detail.alarmDay))).sort();
}

export function workingTimeViolationDetails(
  calculations: WorkingTimeCalculationWindow[],
  intervals: WorkingTimeInterval[],
  day: string,
  policies: WorkingTimePolicyThresholds[],
): WorkingTimeViolationDetail[] {
  return chooseDetails(
    allViolationDetails(calculations, intervals, policies).filter((detail) => detail.alarmDay === day),
    day,
  );
}

export function workingTimeRollingImpactDetails(
  calculations: WorkingTimeCalculationWindow[],
  intervals: WorkingTimeInterval[],
  day: string,
  policies: WorkingTimePolicyThresholds[],
): WorkingTimeViolationDetail[] {
  return chooseDetails(allViolationDetails(calculations, intervals, policies).filter((detail) => (
    detail.calculation.localWindowEndDate === day && detail.alarmDay !== day
  )));
}

export function workingTimeStatusCalculation(
  calculations: WorkingTimeCalculationWindow[],
  intervals: WorkingTimeInterval[],
  day: string,
): WorkingTimeCalculationWindow | null {
  const attributedViolations = calculations
    .filter((calculation) => calculation.isCompliant === false
      && calculation.violationCodes.some((code) => violationAlarmDay(calculation, code, intervals) === day))
    .sort((left, right) => left.windowEnd.localeCompare(right.windowEnd));
  const sameDayViolation = attributedViolations.filter((calculation) => calculation.localWindowEndDate === day).at(-1);
  return sameDayViolation || attributedViolations.at(-1) || calculationsForDay(calculations, day).at(-1) || null;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value);
}

export function workingTimeViolationText(detail: WorkingTimeViolationDetail): string {
  const value = `${formatNumber(detail.value)}${detail.unit === 'hours' ? ' h' : ` période${detail.value > 1 ? 's' : ''}`}`;
  if (detail.threshold === null) return `${detail.label} : ${value}`;
  const threshold = `${formatNumber(detail.threshold)}${detail.unit === 'hours' ? ' h' : ''}`;
  return `${detail.label} : ${value} / ${detail.thresholdKind} ${threshold}`;
}

function formatWindowPart(value: Date, timezoneName: string): string {
  const date = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short', day: '2-digit', month: 'short', timeZone: timezoneName,
  }).format(value).replace('.', '');
  const time = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: timezoneName,
  }).format(value);
  return `${date} à ${time}`;
}

export function workingTimeViolationWindowText(detail: WorkingTimeViolationDetail): string {
  const windowEnd = new Date(detail.calculation.windowEnd);
  const windowStart = new Date(windowEnd.getTime() - RULES[detail.code].windowMilliseconds);
  return `Fenêtre glissante du ${formatWindowPart(windowStart, detail.calculation.timezoneName)} au ${formatWindowPart(windowEnd, detail.calculation.timezoneName)}.`;
}
