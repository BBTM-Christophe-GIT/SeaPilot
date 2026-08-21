import type { WorkingTimeCalculationWindow, WorkingTimeViolationCode } from './workingTimeModel';
import type { WorkingTimePolicyThresholds } from './workingTimeQueries';

type ThresholdKind = 'maximum' | 'minimum';
type ViolationUnit = 'hours' | 'periods';

interface ViolationRule {
  label: string;
  thresholdKind: ThresholdKind;
  unit: ViolationUnit;
  value: (calculation: WorkingTimeCalculationWindow) => number;
  threshold: (policy: WorkingTimePolicyThresholds) => number;
}

export interface WorkingTimeViolationDetail {
  calculation: WorkingTimeCalculationWindow;
  code: WorkingTimeViolationCode;
  label: string;
  policyName: string | null;
  threshold: number | null;
  thresholdKind: ThresholdKind;
  unit: ViolationUnit;
  value: number;
}

const RULES: Record<WorkingTimeViolationCode, ViolationRule> = {
  work_24h: {
    label: 'Travail sur 24 h',
    thresholdKind: 'maximum',
    unit: 'hours',
    value: (calculation) => calculation.work24hSeconds / 3600,
    threshold: (policy) => policy.maxWork24h,
  },
  rest_24h: {
    label: 'Repos sur 24 h',
    thresholdKind: 'minimum',
    unit: 'hours',
    value: (calculation) => calculation.rest24hSeconds / 3600,
    threshold: (policy) => policy.minRest24h,
  },
  consecutive_rest: {
    label: 'Repos consécutif sur 24 h',
    thresholdKind: 'minimum',
    unit: 'hours',
    value: (calculation) => calculation.longestRest24hSeconds / 3600,
    threshold: (policy) => policy.minConsecutiveRestHours,
  },
  rest_periods_24h: {
    label: 'Fractionnement du repos sur 24 h',
    thresholdKind: 'maximum',
    unit: 'periods',
    value: (calculation) => calculation.restPeriodCount24h,
    threshold: (policy) => policy.maxRestPeriods24h,
  },
  work_7d: {
    label: 'Travail sur 7 jours',
    thresholdKind: 'maximum',
    unit: 'hours',
    value: (calculation) => calculation.work7dSeconds / 3600,
    threshold: (policy) => policy.maxWork7d,
  },
  rest_7d: {
    label: 'Repos sur 7 jours',
    thresholdKind: 'minimum',
    unit: 'hours',
    value: (calculation) => calculation.rest7dSeconds / 3600,
    threshold: (policy) => policy.minRest7d,
  },
  night_work_24h: {
    label: 'Travail de nuit sur 24 h',
    thresholdKind: 'maximum',
    unit: 'hours',
    value: (calculation) => (calculation.nightWork24hSeconds || 0) / 3600,
    threshold: (policy) => policy.maxNightWork24h,
  },
};

function calculationsForDay(calculations: WorkingTimeCalculationWindow[], day: string) {
  return calculations
    .filter((calculation) => calculation.localWindowEndDate === day)
    .sort((left, right) => left.windowEnd.localeCompare(right.windowEnd));
}

function breachMagnitude(detail: WorkingTimeViolationDetail): number {
  if (detail.threshold === null) return 0;
  return detail.thresholdKind === 'maximum'
    ? detail.value - detail.threshold
    : detail.threshold - detail.value;
}

export function workingTimeViolationDetails(
  calculations: WorkingTimeCalculationWindow[],
  day: string,
  policies: WorkingTimePolicyThresholds[],
): WorkingTimeViolationDetail[] {
  const details = new Map<WorkingTimeViolationCode, WorkingTimeViolationDetail>();
  calculationsForDay(calculations, day)
    .filter((calculation) => calculation.isCompliant === false)
    .forEach((calculation) => {
      const policy = policies.find((candidate) => candidate.id === calculation.workRestPolicyId) || null;
      calculation.violationCodes.forEach((code) => {
        const rule = RULES[code];
        const detail: WorkingTimeViolationDetail = {
          calculation,
          code,
          label: rule.label,
          policyName: policy?.name || null,
          threshold: policy ? rule.threshold(policy) : null,
          thresholdKind: rule.thresholdKind,
          unit: rule.unit,
          value: rule.value(calculation),
        };
        const previous = details.get(code);
        if (!previous
          || breachMagnitude(detail) > breachMagnitude(previous)
          || (breachMagnitude(detail) === breachMagnitude(previous)
            && detail.calculation.windowEnd > previous.calculation.windowEnd)) {
          details.set(code, detail);
        }
      });
    });
  return Array.from(details.values());
}

export function workingTimeStatusCalculation(
  calculations: WorkingTimeCalculationWindow[],
  day: string,
): WorkingTimeCalculationWindow | null {
  const candidates = calculationsForDay(calculations, day);
  const violating = candidates.filter((calculation) => calculation.isCompliant === false);
  return violating.at(-1) || candidates.at(-1) || null;
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
  const windowStart = new Date(windowEnd.getTime() - 24 * 60 * 60 * 1000);
  return `Fenêtre glissante du ${formatWindowPart(windowStart, detail.calculation.timezoneName)} au ${formatWindowPart(windowEnd, detail.calculation.timezoneName)}.`;
}
