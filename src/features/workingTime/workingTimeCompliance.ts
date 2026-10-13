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
  value: (calculation: WorkingTimeCalculationWindow, measurements: WindowMeasurements) => number | null;
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
  value: number | null;
  windowStartsAt?: string;
  windowEndsAt?: string;
  reconstructedMeasurement?: boolean;
}

const HOURS_24 = 24 * 60 * 60 * 1000;
const DAYS_7 = 7 * HOURS_24;

interface MeasuredRange { start: number; end: number; workSeconds: number }
interface WindowMeasurements {
  amplitude: MeasuredRange | null;
  restInterval: MeasuredRange | null;
  calculationDay: MeasuredRange | null;
}

const RULES: Record<WorkingTimeViolationCode | 'amplitude' | 'rest_interval', ViolationRule> = {
  work_24h: {
    label: 'Travail maximal par journée de calcul', thresholdKind: 'maximum', unit: 'hours',
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
  amplitude: {
    label: 'Amplitude entre repos', thresholdKind: 'maximum', unit: 'hours',
    value: (_calculation, measurements) => measurements.amplitude
      ? (measurements.amplitude.end - measurements.amplitude.start) / 3_600_000 : null,
    threshold: (policy) => policy.maxAmplitudeHours ?? 14,
    windowMilliseconds: HOURS_24,
  },
  rest_interval: {
    label: 'Intervalle entre deux repos', thresholdKind: 'maximum', unit: 'hours',
    value: (_calculation, measurements) => measurements.restInterval
      ? (measurements.restInterval.end - measurements.restInterval.start) / 3_600_000 : null,
    threshold: (policy) => policy.maxIntervalBetweenRestsHours ?? 14,
    windowMilliseconds: HOURS_24,
  },
};

/** Reconstruct only explanatory bounds; persisted violation codes remain authoritative. */
function windowMeasurements(calculation: WorkingTimeCalculationWindow, intervals: WorkingTimeInterval[], minimumRestHours: number): WindowMeasurements {
  const end = Date.parse(calculation.windowEnd);
  const start = end - HOURS_24;
  const ranges = intervals.filter((interval) => interval.personId === calculation.personId)
    .map((interval) => ({ start: Date.parse(interval.startsAt), end: Math.min(end, Date.parse(interval.endsAt)) }))
    .filter((range) => Number.isFinite(range.start) && Number.isFinite(range.end) && range.end > range.start)
    .sort((left, right) => left.start - right.start)
    .reduce<MeasuredRange[]>((merged, range) => {
      const previous = merged.at(-1);
      if (previous && range.start <= previous.end) {
        previous.end = Math.max(previous.end, range.end);
        previous.workSeconds = (previous.end - previous.start) / 1000;
      } else merged.push({ ...range, workSeconds: (range.end - range.start) / 1000 });
      return merged;
    }, []);
  const sequences = ranges.reduce<Array<MeasuredRange & { dayStart: number }>>((grouped, range) => {
    const previous = grouped.at(-1);
    if (previous && range.start - previous.end < minimumRestHours * 3_600_000) {
      previous.end = range.end;
      previous.workSeconds += range.workSeconds;
    } else grouped.push({ ...range, dayStart: previous?.end ?? range.start });
    return grouped;
  }, []);
  const relevant = sequences.flatMap((sequence, index) => {
    const closed = index < sequences.length - 1 || end - sequence.end >= minimumRestHours * 3_600_000;
    const dayEnd = closed ? sequence.end : end;
    return dayEnd > start && sequence.dayStart < end ? [{ ...sequence, dayEnd }] : [];
  });
  const amplitude = relevant.reduce<MeasuredRange | null>((longest, sequence) => !longest
    || sequence.end - sequence.start >= longest.end - longest.start ? sequence : longest, null);
  const restInterval = ranges.filter((range) => range.end > start && range.start < end)
    .reduce<MeasuredRange | null>((longest, range) => !longest
      || range.end - range.start >= longest.end - longest.start ? range : longest, null);
  const maximumDay = relevant.reduce<(typeof relevant)[number] | null>((maximum, sequence) => !maximum
    || sequence.workSeconds >= maximum.workSeconds ? sequence : maximum, null);
  const calculationDay = calculation.calculationVersion >= 4 && maximumDay
    && Math.abs(maximumDay.workSeconds - calculation.work24hSeconds) < 1
    ? { start: maximumDay.dayStart, end: maximumDay.dayEnd, workSeconds: maximumDay.workSeconds } : null;
  return { amplitude, restInterval, calculationDay };
}

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
      const needsMeasurements = calculation.violationCodes.some((code) => code === 'amplitude' || code === 'rest_interval'
        || (code === 'work_24h' && calculation.calculationVersion >= 4));
      const measurements = needsMeasurements ? windowMeasurements(calculation, intervals, policy?.minConsecutiveRestHours ?? 6)
        : { amplitude: null, restInterval: null, calculationDay: null };
      return calculation.violationCodes.flatMap((code) => {
        const alarmDay = violationAlarmDay(calculation, code, intervals);
        if (!alarmDay) return [];
        const rule = RULES[code];
        const measuredBounds = code === 'amplitude' ? measurements.amplitude
          : code === 'rest_interval' ? measurements.restInterval
            : code === 'work_24h' ? measurements.calculationDay : null;
        const measuredValue = rule.value(calculation, measurements);
        const threshold = policy ? rule.threshold(policy) : null;
        // Incomplete loaded history cannot turn a server breach into a smaller, apparently valid measurement.
        const value = (code === 'amplitude' || code === 'rest_interval') && measuredValue !== null
          && threshold !== null && measuredValue <= threshold ? null : measuredValue;
        return [{
          alarmDay,
          calculation,
          code,
          label: rule.label,
          policyName: policy?.name || null,
          threshold,
          thresholdKind: rule.thresholdKind,
          unit: rule.unit,
          value,
          ...((code === 'amplitude' || code === 'rest_interval' || measuredBounds) ? { reconstructedMeasurement: true } : {}),
          ...(measuredBounds && value !== null ? {
            windowStartsAt: new Date(measuredBounds.start).toISOString(),
            windowEndsAt: new Date(measuredBounds.end).toISOString(),
          } : {}),
        } satisfies WorkingTimeViolationDetail];
      });
    });
}

function breachMagnitude(detail: WorkingTimeViolationDetail): number {
  if (detail.threshold === null || detail.value === null) return 0;
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
  if (detail.value === null) {
    const limit = detail.threshold === null ? '' : ` / ${detail.thresholdKind} ${formatNumber(detail.threshold)} h`;
    return `${detail.label} : mesure à confirmer${limit}`;
  }
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
  const windowEnd = new Date(detail.windowEndsAt || detail.calculation.windowEnd);
  const windowStart = detail.windowStartsAt ? new Date(detail.windowStartsAt)
    : new Date(windowEnd.getTime() - RULES[detail.code].windowMilliseconds);
  const label = detail.windowStartsAt
    ? detail.code === 'work_24h' ? 'Journée de calcul'
      : detail.code === 'amplitude' ? 'Séquence de travail' : 'Travail continu entre repos'
    : 'Fenêtre d’analyse';
  return `${label} du ${formatWindowPart(windowStart, detail.calculation.timezoneName)} au ${formatWindowPart(windowEnd, detail.calculation.timezoneName)}.${detail.reconstructedMeasurement ? ' Mesure reconstituée à partir de l’historique chargé ; couverture à confirmer.' : ''}`;
}
