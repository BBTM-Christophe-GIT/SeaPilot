import type { ProcessPerformance } from './processPerformance';

export interface ProcessPerformanceSummary {
  score: number | null;
  ratedCount: number;
  totalCount: number;
  notApplicableCount: number;
  unavailableCount: number;
  coverageRate: number | null;
  unavailableSources: string[];
  processes: ProcessPerformance[];
  methodology: string;
}

export const PROCESS_PERFORMANCE_SUMMARY_METHOD = 'Moyenne des processus notés, à poids égaux. Les processus non applicables sont exclus. Une source indisponible suspend la note globale.';

/** Exclude confidential medical-logbook data even if a caller supplies a previous dashboard snapshot. */
export function summarizeProcessPerformance(input: readonly ProcessPerformance[]): ProcessPerformanceSummary {
  const processes = input.filter((process) => process.key !== 'medicalLogbook');
  let sum = 0;
  let ratedCount = 0;
  let unavailableCount = 0;
  let notApplicableCount = 0;
  const unavailableSources = new Set<string>();
  for (const process of processes) {
    const sources = process.unavailableSources || [];
    const validScore = typeof process.score === 'number' && Number.isFinite(process.score) && process.score >= 0 && process.score <= 100;
    if (sources.length || (process.score !== null && !validScore)) {
      unavailableCount += 1;
      for (const source of sources) unavailableSources.add(source);
      if (!sources.length) unavailableSources.add(`Score indisponible : ${process.label}`);
    } else if (validScore) {
      sum += process.score!;
      ratedCount += 1;
    } else {
      notApplicableCount += 1;
    }
  }
  const totalCount = processes.length;
  return {
    score: unavailableCount || !ratedCount ? null : Math.round(sum / ratedCount),
    ratedCount,
    totalCount,
    notApplicableCount,
    unavailableCount,
    coverageRate: totalCount ? Math.round(100 * ratedCount / totalCount) : null,
    unavailableSources: [...unavailableSources],
    processes,
    methodology: PROCESS_PERFORMANCE_SUMMARY_METHOD,
  };
}
