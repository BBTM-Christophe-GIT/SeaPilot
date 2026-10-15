import type { WorkingTimeEntryGraphPreview } from './WorkingTimeEntryBoard';
import type { WorkingTimePhaseInput, WorkingTimePolicyThresholds } from './workingTimeQueries';
import { analyzeWorkingTimePreview, type PreviewSegment } from './preview/workingTimePreviewProjection';

const pad = (value: number) => String(value).padStart(2, '0');
export function entryDuration(hours: number) {
  const minutes = Math.max(0, Math.round(hours * 60));
  return `${Math.floor(minutes / 60)} h ${pad(minutes % 60)}`;
}

export function entryDateTime(value: string) {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
}

export function entryBounds(segment: Pick<PreviewSegment, 'startsAt' | 'endsAt'>) {
  return `${entryDateTime(segment.startsAt)} → ${entryDateTime(segment.endsAt)}`;
}

function localMinute(timestamp: number, start: number, end: number) {
  if (timestamp <= start) return 0;
  if (timestamp >= end) return 1440;
  const date = new Date(timestamp);
  return date.getHours() * 60 + date.getMinutes();
}

/** Pure advisory projection of the loaded real history; never writes or authorizes. */
export function buildWorkingTimeEntryAnalysis(input: {
  selectedDate: string;
  history: readonly (WorkingTimePhaseInput & { id?: number; isPending?: boolean })[];
  phases: readonly WorkingTimePhaseInput[];
  policy: WorkingTimePolicyThresholds;
  coverage: { startsAt: string; endsAt: string };
}) {
  const projection = analyzeWorkingTimePreview({
    selectedDate: input.selectedDate, history: input.history, phases: input.phases, coverage: input.coverage,
    policy: {
      maxWork24Hours: input.policy.maxWork24h, minRest24Hours: input.policy.minRest24h,
      minContinuousRestHours: input.policy.minConsecutiveRestHours,
      maxWork7DaysHours: input.policy.maxWork7d, minRest7DaysHours: input.policy.minRest7d,
      maxRestPeriods: input.policy.maxRestPeriods24h,
      maxAmplitudeHours: input.policy.maxAmplitudeHours ?? 14,
      maxIntervalBetweenRestsHours: input.policy.maxIntervalBetweenRestsHours ?? 14,
    },
  });
  const deviations = projection.rules.filter((rule) => rule.status === 'deviation');
  const workDeviation = deviations.find((rule) => rule.key === 'max_work_24h');
  const day = projection.latestCalculationDay;
  const dayStart = new Date(`${input.selectedDate}T00:00`).getTime();
  const nextDate = new Date(dayStart); nextDate.setDate(nextDate.getDate() + 1);
  const dayEnd = nextDate.getTime();
  const minute = (timestamp: number) => localMinute(timestamp, dayStart, dayEnd);
  const firstExcess = projection.excessWorkSegments.find((range) => range.startMs >= dayStart && range.startMs < dayEnd);
  const phaseLabel = (phase: WorkingTimePhaseInput, isPending: boolean) => {
    const startMinute = minute(Date.parse(phase.startsAt));
    const endMinute = minute(Date.parse(phase.endsAt));
    const clock = (value: number) => `${pad(Math.floor(value / 60))}:${pad(value % 60)}`;
    return { startMinute, endMinute, label: `${clock(startMinute)}–${clock(endMinute)}`, isPending };
  };
  const overlapsDay = (phase: WorkingTimePhaseInput) => Date.parse(phase.startsAt) < dayEnd && Date.parse(phase.endsAt) > dayStart;
  const graph: WorkingTimeEntryGraphPreview = {
    workLimitMarkerMinute: firstExcess ? minute(firstExcess.startMs) : null,
    excessRanges: projection.excessWorkSegments.filter((range) => range.endMs > dayStart && range.startMs < dayEnd)
      .map((range) => ({ startMinute: minute(range.startMs), endMinute: minute(range.endMs) })),
    windowLabel: day ? `Journée de calcul : ${entryBounds(day)}` : 'Journée de calcul : début à confirmer',
    workTotalLabel: `Cumul : ${entryDuration(day?.workHours ?? 0)}`,
    excessLabel: workDeviation ? `${projection.maximumCalculationDay?.startsAt !== day?.startsAt ? 'Journée précédente : dépassement' : 'Dépassement'} +${entryDuration(workDeviation.deviation)}` : null,
    isProjected: input.phases.length > 0,
    phaseLabels: [...input.history.filter(overlapsDay).map((phase) => phaseLabel(phase, phase.isPending ?? false)),
      ...input.phases.filter(overlapsDay).map((phase) => phaseLabel(phase, true))],
    ruleAlerts: deviations.filter((rule) => rule.key !== 'max_work_24h').map((rule) =>
      `${rule.label} : ${rule.unit === 'periods' ? rule.actual : entryDuration(rule.actual)} (${rule.direction === 'maximum' ? 'maximum' : 'minimum'} ${rule.limit}${rule.unit === 'hours' ? ' h' : ''})`),
    summaryLabel: day ? undefined : 'Aucune journée de calcul identifiable pour ce jour.',
    contextNotes: day ? [
      ...projection.calculationDays.filter((candidate) => candidate.status === 'closed').map((candidate) =>
        `Journée clôturée : ${entryBounds(candidate)} · ${entryDuration(candidate.workHours)} de travail`),
      ...(day.precedingRest ? [`Repos au départ : ${entryBounds(day.precedingRest)} (${entryDuration(day.precedingRest.hours)})`] : []),
      `Repère de 24 h : ${entryDateTime(day.horizonEndsAt)}${day.remainingHours > 0 ? ' · bilan en cours' : ' · repère atteint'}`,
      ...(!day.historyCovered ? ['Historique incomplet · début et valeurs à confirmer.'] : []),
    ] : [],
    analysisStatusLabel: 'Projection des plages · contrôles serveur à l’enregistrement',
  };
  return { projection, graph };
}
