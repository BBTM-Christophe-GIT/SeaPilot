/**
 * Pure advisory calculations shared by the entry graph and fixture preview.
 * The caller supplies the applicable policy; these projections never persist
 * or authorize compliance results. Gaps are shown as calculated rest and only confirmed by
 * the provided history coverage; incomplete histories are explicitly unconfirmed.
 */
export interface PreviewWorkPhase {
  id?: string | number;
  startsAt: string;
  endsAt: string;
}

export interface PreviewPolicy {
  /** Legacy field name: effective work per calculation day, beginning at a long rest. */
  maxWork24Hours: number;
  minRest24Hours: number;
  minContinuousRestHours: number;
  maxWork7DaysHours: number;
  minRest7DaysHours: number;
  maxRestPeriods: number;
  maxIntervalBetweenRestsHours: number;
  maxAmplitudeHours: number;
}

/** Illustrative policy, explicitly selected for this prototype. */
export const PREVIEW_DEMO_POLICY: Readonly<PreviewPolicy> = Object.freeze({
  maxWork24Hours: 12,
  minRest24Hours: 10,
  minContinuousRestHours: 6,
  maxWork7DaysHours: 84,
  minRest7DaysHours: 77,
  maxRestPeriods: 2,
  maxIntervalBetweenRestsHours: 14,
  maxAmplitudeHours: 14,
});

export interface PreviewSegment {
  startsAt: string;
  endsAt: string;
  startMs: number;
  endMs: number;
  hours: number;
}

export interface PreviewWindow extends PreviewSegment {
  workHours: number;
  restHours: number;
  longestRestHours: number;
  restPeriodCount: number;
  maxIntervalBetweenRestsHours: number;
  workSegments: PreviewSegment[];
  restSegments: PreviewSegment[];
}

/** Informational period since the latest qualifying rest; never a compliance result. */
export interface PreviewOperationalPeriod {
  observedWindow: PreviewWindow;
  precedingRest: PreviewSegment;
  amplitude: PreviewSegment;
  horizonEndsAt: string;
  remainingHours: number;
  /** Attests this period only, independently of the seven-day history. */
  historyCovered: boolean;
}

/** A calculation day starts at the beginning of its preceding qualifying rest. */
export interface PreviewCalculationDay extends PreviewWindow {
  /** Null while the new day contains only an attested qualifying rest. */
  workSequence: PreviewSegment | null;
  precedingRest: PreviewSegment | null;
  status: 'open' | 'closed';
  horizonEndsAt: string;
  remainingHours: number;
  /** Also covers the qualifying rest that closes this day, when observed. */
  historyCovered: boolean;
}

export type PreviewRuleKey =
  | 'max_work_24h'
  | 'min_rest_24h'
  | 'min_continuous_rest'
  | 'max_work_7d'
  | 'min_rest_7d'
  | 'max_rest_periods'
  | 'max_interval_between_rests'
  | 'max_amplitude';

export interface PreviewRuleResult {
  key: PreviewRuleKey;
  label: string;
  actual: number;
  limit: number;
  unit: 'hours' | 'periods';
  direction: 'maximum' | 'minimum';
  status: 'ok' | 'deviation' | 'unknown';
  deviation: number;
  window: '24h' | '7d';
}

export interface PreviewInvalidPhase {
  source: 'history' | 'phases';
  index: number;
  message: string;
}

export interface WorkingTimePreviewInput {
  selectedDate: string;
  history: readonly PreviewWorkPhase[];
  phases: readonly PreviewWorkPhase[];
  policy?: Partial<PreviewPolicy>;
  /** True only for a deliberately complete, attested demo fixture. */
  coverageComplete?: boolean;
  /** Explicit attested history bounds take precedence over the boolean flag. */
  coverage?: { startsAt: string; endsAt: string };
}

export interface WorkingTimePreviewProjection {
  policy: PreviewPolicy;
  window24: PreviewWindow;
  window7: PreviewWindow;
  /** Longest work sequence touching the rolling window, separated by qualifying rest. */
  dailyAmplitudeHours: number;
  amplitudeSequences: PreviewSegment[];
  maximumAmplitudeSequence: PreviewSegment | null;
  operationalPeriod: PreviewOperationalPeriod | null;
  calculationDays: PreviewCalculationDay[];
  latestCalculationDay: PreviewCalculationDay | null;
  maximumCalculationDay: PreviewCalculationDay | null;
  dailyWorkHours: number;
  rules: PreviewRuleResult[];
  excessWorkSegments: PreviewSegment[];
  coverageComplete: boolean;
  invalidPhases: PreviewInvalidPhase[];
}

interface TimeRange {
  startMs: number;
  endMs: number;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const EPSILON = 1e-9;

/** Local input timestamps deliberately follow the browser's local timezone. */
function localIso(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function segment(range: TimeRange): PreviewSegment {
  return {
    ...range,
    startsAt: localIso(range.startMs),
    endsAt: localIso(range.endMs),
    hours: (range.endMs - range.startMs) / HOUR_MS,
  };
}

function mergeRanges(ranges: readonly TimeRange[]): TimeRange[] {
  const sorted = ranges.map((range) => ({ ...range }))
    .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs);
  const merged: TimeRange[] = [];
  for (const current of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && current.startMs <= previous.endMs) {
      previous.endMs = Math.max(previous.endMs, current.endMs);
    } else {
      merged.push(current);
    }
  }
  return merged;
}

function intersect(range: TimeRange, window: TimeRange): TimeRange | null {
  const startMs = Math.max(range.startMs, window.startMs);
  const endMs = Math.min(range.endMs, window.endMs);
  return endMs > startMs ? { startMs, endMs } : null;
}

function windowMetrics(work: readonly TimeRange[], bounds: TimeRange): PreviewWindow {
  const workSegments = work.flatMap((range) => {
    const overlap = intersect(range, bounds);
    return overlap ? [segment(overlap)] : [];
  });
  const restSegments: PreviewSegment[] = [];
  let cursor = bounds.startMs;
  for (const range of workSegments) {
    if (range.startMs > cursor) restSegments.push(segment({ startMs: cursor, endMs: range.startMs }));
    cursor = range.endMs;
  }
  if (cursor < bounds.endMs) restSegments.push(segment({ startMs: cursor, endMs: bounds.endMs }));
  const workHours = workSegments.reduce((sum, range) => sum + range.hours, 0);
  // The interval between consecutive rest periods is elapsed continuous work,
  // including a work block that straddles a displayed window boundary.
  const maxIntervalBetweenRestsHours = Math.max(0, ...work
    .filter((range) => intersect(range, bounds) !== null)
    .map((range) => (range.endMs - range.startMs) / HOUR_MS));
  return {
    ...segment(bounds),
    workHours,
    restHours: (bounds.endMs - bounds.startMs) / HOUR_MS - workHours,
    longestRestHours: Math.max(0, ...restSegments.map((range) => range.hours)),
    restPeriodCount: restSegments.length,
    maxIntervalBetweenRestsHours,
    workSegments,
    restSegments,
  };
}

function exceededWork(work: readonly PreviewSegment[], capHours: number): PreviewSegment[] {
  let remainingMs = capHours * HOUR_MS;
  const excess: PreviewSegment[] = [];
  for (const range of work) {
    const duration = range.endMs - range.startMs;
    if (remainingMs >= duration) {
      remainingMs -= duration;
    } else {
      excess.push(segment({ startMs: range.startMs + Math.max(remainingMs, 0), endMs: range.endMs }));
      remainingMs = 0;
    }
  }
  return excess;
}

/** Keep the full sequence start: midnight and the rolling boundary do not reset it. */
function amplitudeSequences(work: readonly TimeRange[], bounds: TimeRange, restHours: number): PreviewSegment[] {
  const sequences: Array<TimeRange & { relevant: boolean }> = [];
  for (const range of work) {
    if (range.startMs >= bounds.endMs) break;
    const endMs = Math.min(range.endMs, bounds.endMs);
    const relevant = intersect(range, bounds) !== null;
    const previous = sequences.at(-1);
    if (previous && (range.startMs - previous.endMs) / HOUR_MS < restHours) {
      previous.endMs = endMs;
      previous.relevant ||= relevant;
    } else {
      sequences.push({ startMs: range.startMs, endMs, relevant });
    }
  }
  return sequences.filter((sequence) => sequence.relevant)
    .map(({ startMs, endMs }) => segment({ startMs, endMs }));
}

function latestOperationalPeriod(
  work: readonly TimeRange[],
  sequences: readonly PreviewSegment[],
  selectedDay: TimeRange,
  windowEnd: number,
  restHours: number,
  historyCovers: (bounds: TimeRange) => boolean,
): PreviewOperationalPeriod | null {
  const amplitude = sequences.filter((sequence) => work.some((range) => {
    const selectedWork = intersect(range, selectedDay);
    return selectedWork !== null && intersect(selectedWork, sequence) !== null;
  })).at(-1);
  if (!amplitude) return null;
  const previousWork = work.filter((range) => range.endMs <= amplitude.startMs).at(-1);
  if (!previousWork || (amplitude.startMs - previousWork.endMs) / HOUR_MS < restHours) return null;

  const precedingRest = segment({ startMs: previousWork.endMs, endMs: amplitude.startMs });
  const bounds = { startMs: precedingRest.startMs, endMs: windowEnd };
  // Future recorded work is deliberately excluded, including from continuous-work metrics.
  const observedWork = work.filter((range) => range.startMs < windowEnd)
    .map((range) => ({ ...range, endMs: Math.min(range.endMs, windowEnd) }));
  const horizonEnd = bounds.startMs + DAY_MS;
  return {
    observedWindow: windowMetrics(observedWork, bounds),
    precedingRest,
    amplitude,
    horizonEndsAt: localIso(horizonEnd),
    remainingHours: Math.max(0, (horizonEnd - windowEnd) / HOUR_MS),
    historyCovered: historyCovers(bounds),
  };
}

function buildCalculationDays(
  work: readonly TimeRange[],
  sequences: readonly PreviewSegment[],
  windowEnd: number,
  restHours: number,
  historyCovers: (bounds: TimeRange) => boolean,
): PreviewCalculationDay[] {
  const observedWork = work.filter((range) => range.startMs < windowEnd)
    .map((range) => ({ ...range, endMs: Math.min(range.endMs, windowEnd) }));
  const days: PreviewCalculationDay[] = sequences.map((workSequence) => {
    const previousWork = observedWork.filter((range) => range.endMs <= workSequence.startMs).at(-1);
    const precedingRest = previousWork && (workSequence.startMs - previousWork.endMs) / HOUR_MS >= restHours
      ? segment({ startMs: previousWork.endMs, endMs: workSequence.startMs }) : null;
    // The next long rest closes this day at the beginning of that rest. The
    // same instant becomes the next day's start, even before work resumes.
    const nextWork = observedWork.find((range) => range.startMs >= workSequence.endMs);
    const followingRestEnd = nextWork?.startMs ?? windowEnd;
    const closed = (followingRestEnd - workSequence.endMs) / HOUR_MS >= restHours;
    const bounds = {
      startMs: precedingRest?.startMs ?? workSequence.startMs,
      endMs: closed ? workSequence.endMs : windowEnd,
    };
    const horizonEnd = bounds.startMs + DAY_MS;
    return {
      ...windowMetrics(observedWork, bounds),
      workSequence,
      precedingRest,
      status: closed ? 'closed' : 'open',
      horizonEndsAt: localIso(horizonEnd),
      remainingHours: closed ? 0 : Math.max(0, (horizonEnd - bounds.endMs) / HOUR_MS),
      historyCovered: precedingRest !== null && historyCovers({
        startMs: bounds.startMs,
        endMs: closed ? followingRestEnd : bounds.endMs,
      }),
    };
  });
  const lastWork = observedWork.at(-1);
  if (lastWork && windowEnd > lastWork.endMs
    && (windowEnd - lastWork.endMs) / HOUR_MS >= restHours) {
    const bounds = { startMs: lastWork.endMs, endMs: windowEnd };
    // An empty date alone never attests rest. With observed coverage, the new
    // day already exists at the rest's beginning, before any work resumes.
    if (historyCovers(bounds)) {
      const horizonEnd = bounds.startMs + DAY_MS;
      days.push({
        ...windowMetrics(observedWork, bounds),
        workSequence: null,
        precedingRest: segment(bounds),
        status: 'open',
        horizonEndsAt: localIso(horizonEnd),
        remainingHours: Math.max(0, (horizonEnd - bounds.endMs) / HOUR_MS),
        historyCovered: true,
      });
    }
  }
  return days;
}

/**
 * Projects the entered phases together with retained history. The caller must
 * remove replaced phases from history first. The displayed rolling windows end
 * at the latest entered phase; with no entry, they end at the latest recorded
 * phase starting on the selected day, or at that day's end if it is empty.
 * Amplitude is the longest sequence touching the 24-hour window, with a new
 * sequence after the configured continuous rest. Calculation days start at the
 * beginning of that rest and close at the next qualifying rest's beginning.
 * Their work cap is independent of raw rolling work/rest totals, which never
 * reset and merge all overlaps independently of amplitude.
 */
export function analyzeWorkingTimePreview(input: WorkingTimePreviewInput): WorkingTimePreviewProjection {
  const dayStart = new Date(`${input.selectedDate}T00:00:00`).getTime();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.selectedDate)
    || !Number.isFinite(dayStart) || localIso(dayStart).slice(0, 10) !== input.selectedDate) {
    throw new Error('Date de saisie invalide.');
  }
  const dayEndDate = new Date(dayStart);
  dayEndDate.setDate(dayEndDate.getDate() + 1);
  const dayEnd = dayEndDate.getTime();
  const policy: PreviewPolicy = { ...PREVIEW_DEMO_POLICY, ...input.policy };
  if (Object.values(policy).some((value) => !Number.isFinite(value) || value < 0)
    || !Number.isInteger(policy.maxRestPeriods)) {
    throw new Error('Règles de démonstration invalides.');
  }

  const invalidPhases: PreviewInvalidPhase[] = [];
  const parsePhases = (phases: readonly PreviewWorkPhase[], source: PreviewInvalidPhase['source']) =>
    phases.flatMap((phase, index) => {
      const startMs = Date.parse(phase.startsAt);
      const endMs = Date.parse(phase.endsAt);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
        invalidPhases.push({ source, index, message: 'La fin de la plage doit suivre son début.' });
        return [];
      }
      return [{ startMs, endMs }];
    });
  const history = parsePhases(input.history, 'history');
  const entered = parsePhases(input.phases, 'phases');
  const work = mergeRanges([...history, ...entered]);
  const recordedDayPhases = history.filter((phase) => phase.startMs >= dayStart && phase.startMs < dayEnd);
  const anchorPhases = entered.length ? entered : recordedDayPhases;
  const windowEnd = anchorPhases.length ? Math.max(...anchorPhases.map((phase) => phase.endMs)) : dayEnd;
  const window24 = windowMetrics(work, { startMs: windowEnd - DAY_MS, endMs: windowEnd });
  const window7 = windowMetrics(work, { startMs: windowEnd - 7 * DAY_MS, endMs: windowEnd });
  const sequences = amplitudeSequences(work, window24, policy.minContinuousRestHours);
  const maximumAmplitudeSequence = sequences.reduce<PreviewSegment | null>((longest, current) =>
    !longest || current.hours > longest.hours ? current : longest, null);
  const dailyAmplitudeHours = maximumAmplitudeSequence?.hours ?? 0;
  const dailyWorkHours = work.reduce((sum, phase) => {
    const overlap = intersect(phase, { startMs: dayStart, endMs: dayEnd });
    return sum + (overlap ? (overlap.endMs - overlap.startMs) / HOUR_MS : 0);
  }, 0);
  const coverageStart = input.coverage ? Date.parse(input.coverage.startsAt) : null;
  const coverageEnd = input.coverage ? Date.parse(input.coverage.endsAt) : null;
  const windowsCovered = input.coverage
    ? coverageStart !== null && coverageEnd !== null
      && Number.isFinite(coverageStart) && Number.isFinite(coverageEnd)
      && coverageEnd > coverageStart
      && window7.startMs >= coverageStart && window7.endMs <= coverageEnd
      && window24.startMs >= coverageStart && window24.endMs <= coverageEnd
    : input.coverageComplete === true;
  const coverageComplete = windowsCovered && invalidPhases.length === 0;
  const historyCovers = (bounds: TimeRange) => invalidPhases.length === 0 && (input.coverage
    ? coverageStart !== null && coverageEnd !== null
      && Number.isFinite(coverageStart) && Number.isFinite(coverageEnd)
      && coverageEnd > coverageStart
      && bounds.startMs >= coverageStart && bounds.endMs <= coverageEnd
    : input.coverageComplete === true);
  const calculationDays = buildCalculationDays(work, sequences, windowEnd, policy.minContinuousRestHours, historyCovers);
  const latestCalculationDay = calculationDays.at(-1) ?? null;
  const maximumCalculationDay = calculationDays.reduce<PreviewCalculationDay | null>((largest, current) =>
    !largest || current.workHours > largest.workHours ? current : largest, null);
  const operationalPeriod = latestOperationalPeriod(
    work, sequences, { startMs: dayStart, endMs: dayEnd }, windowEnd,
    policy.minContinuousRestHours, historyCovers,
  );
  const rules: PreviewRuleResult[] = [];
  const rule = (key: PreviewRuleKey, label: string, actual: number, limit: number,
    direction: PreviewRuleResult['direction'], window: PreviewRuleResult['window'],
    unit: PreviewRuleResult['unit'] = 'hours', requiresCompleteHistory = false, covered = coverageComplete) => {
    const deviation = Math.max(0, direction === 'maximum' ? actual - limit : limit - actual);
    const canEstablishDeviation = deviation > EPSILON && !requiresCompleteHistory;
    rules.push({
      key, label, actual, limit, direction, window, unit,
      deviation: deviation > EPSILON ? deviation : 0,
      status: covered ? (deviation > EPSILON ? 'deviation' : 'ok')
        : (canEstablishDeviation ? 'deviation' : 'unknown'),
    });
  };
  rule('max_work_24h', 'Travail maximal par journée de calcul', maximumCalculationDay?.workHours ?? 0,
    policy.maxWork24Hours, 'maximum', '24h', 'hours', false,
    calculationDays.length ? calculationDays.every((day) => day.historyCovered) : coverageComplete);
  rule('min_rest_24h', 'Repos sur 24 h', window24.restHours, policy.minRest24Hours, 'minimum', '24h');
  rule('min_continuous_rest', 'Repos continu', window24.longestRestHours,
    policy.minContinuousRestHours, 'minimum', '24h');
  rule('max_work_7d', 'Travail sur 7 jours', window7.workHours, policy.maxWork7DaysHours, 'maximum', '7d');
  rule('min_rest_7d', 'Repos sur 7 jours', window7.restHours, policy.minRest7DaysHours, 'minimum', '7d');
  rule('max_rest_periods', 'Périodes de repos sur 24 h', window24.restPeriodCount,
    policy.maxRestPeriods, 'maximum', '24h', 'periods', true);
  rule('max_interval_between_rests', 'Intervalle entre deux repos', window24.maxIntervalBetweenRestsHours,
    policy.maxIntervalBetweenRestsHours, 'maximum', '24h');
  rule('max_amplitude', 'Amplitude entre repos', dailyAmplitudeHours, policy.maxAmplitudeHours, 'maximum', '24h');
  return {
    policy, window24, window7, dailyAmplitudeHours, dailyWorkHours, rules,
    amplitudeSequences: sequences, maximumAmplitudeSequence, operationalPeriod,
    calculationDays, latestCalculationDay, maximumCalculationDay,
    excessWorkSegments: mergeRanges(calculationDays.flatMap((day) => exceededWork(day.workSegments, policy.maxWork24Hours))).map(segment),
    coverageComplete, invalidPhases,
  };
}
