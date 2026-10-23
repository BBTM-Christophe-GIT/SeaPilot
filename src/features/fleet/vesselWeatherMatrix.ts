/** Vessel-specific Hs / swell-period bands. Lower bounds are inclusive; no interpolation. */
export const VESSEL_SEA_STATE_LEVELS = ['comfortable', 'uncomfortable', 'tiring', 'twelve_hours', 'unlivable'] as const;
export type VesselSeaStateLevel = typeof VESSEL_SEA_STATE_LEVELS[number];
export const VESSEL_SEA_STATE_LABELS: Record<VesselSeaStateLevel, string> = {
  comfortable: 'Confortable', uncomfortable: 'Peu confortable', tiring: 'Fatiguant', twelve_hours: '12 heures max', unlivable: 'Rude',
};
export interface VesselWeatherMatrix {
  version: 1;
  hsLowerBoundsMeters: number[];
  hsUpperBoundMeters: number;
  periodLowerBoundsSeconds: number[];
  levels: (VesselSeaStateLevel | null)[][];
}
const validBounds = (value: unknown, length: number, maximum: number): value is number[] => Array.isArray(value)
  && value.length === length && value[0] === 0
  && value.every((bound, index) => typeof bound === 'number' && Number.isFinite(bound) && bound >= 0 && bound <= maximum
    && (index === 0 || bound > value[index - 1]));
export function isVesselWeatherMatrix(value: unknown): value is VesselWeatherMatrix {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const matrix = value as Record<string, unknown>;
  return matrix.version === 1 && validBounds(matrix.hsLowerBoundsMeters, 7, 50)
    && typeof matrix.hsUpperBoundMeters === 'number' && Number.isFinite(matrix.hsUpperBoundMeters)
    && matrix.hsUpperBoundMeters > matrix.hsLowerBoundsMeters[6] && matrix.hsUpperBoundMeters <= 50
    && validBounds(matrix.periodLowerBoundsSeconds, 6, 120)
    && Array.isArray(matrix.levels) && matrix.levels.length === 6
    && matrix.levels.every((row) => Array.isArray(row) && row.length === 7
      && row.every((level) => level === null || VESSEL_SEA_STATE_LEVELS.includes(level as VesselSeaStateLevel)));
}
export function cloneVesselWeatherMatrix(matrix: VesselWeatherMatrix): VesselWeatherMatrix {
  return { version: 1, hsLowerBoundsMeters: [...matrix.hsLowerBoundsMeters], hsUpperBoundMeters: matrix.hsUpperBoundMeters,
    periodLowerBoundsSeconds: [...matrix.periodLowerBoundsSeconds], levels: matrix.levels.map((row) => [...row]) };
}
export const parseVesselWeatherMatrix = (value: unknown): VesselWeatherMatrix | null => isVesselWeatherMatrix(value) ? cloneVesselWeatherMatrix(value) : null;
export function createEmptyVesselWeatherMatrix(): VesselWeatherMatrix {
  return { version: 1, hsLowerBoundsMeters: [0, .5, 1, 1.5, 2, 2.5, 3], hsUpperBoundMeters: 3.5,
    periodLowerBoundsSeconds: [0, 5, 7, 9, 11, 13], levels: Array.from({ length: 6 }, () => Array<VesselSeaStateLevel | null>(7).fill(null)) };
}
const c = 'comfortable', u = 'uncomfortable', t = 'tiring', h = 'twelve_hours', i = 'unlivable';
/** Transcription of the GOURY reference supplied by the user; never a default for another vessel. */
export const GOURY_WEATHER_MATRIX: VesselWeatherMatrix = { ...createEmptyVesselWeatherMatrix(), levels: [
  [c, c, u, t, i, i, i], [c, c, u, t, h, i, i], [c, c, u, t, h, i, i],
  [c, c, c, u, h, i, i], [c, c, c, u, t, h, i], [c, c, c, c, u, t, h],
] };
const format = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 });
export function vesselHsRange(matrix: VesselWeatherMatrix, index: number): string {
  return `${format.format(matrix.hsLowerBoundsMeters[index])} à ${format.format(matrix.hsLowerBoundsMeters[index + 1] ?? matrix.hsUpperBoundMeters)} m`;
}
export function vesselPeriodRange(matrix: VesselWeatherMatrix, index: number): string {
  return index === matrix.periodLowerBoundsSeconds.length - 1 ? `≥ ${format.format(matrix.periodLowerBoundsSeconds[index])} s`
    : index === 0 ? `< ${format.format(matrix.periodLowerBoundsSeconds[1])} s`
      : `${format.format(matrix.periodLowerBoundsSeconds[index])} à < ${format.format(matrix.periodLowerBoundsSeconds[index + 1])} s`;
}
export interface VesselSeaStateAssessment {
  code: VesselSeaStateLevel | 'no_matrix' | 'no_forecast' | 'outside_matrix' | 'not_defined';
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'critical' | 'neutral';
  row?: number;
  column?: number;
  hsRange?: string;
  periodRange?: string;
}
const tones: Record<VesselSeaStateLevel, VesselSeaStateAssessment['tone']> = {
  comfortable: 'success', uncomfortable: 'warning', tiring: 'danger', twelve_hours: 'danger', unlivable: 'critical',
};
export function evaluateVesselSeaState(matrix: VesselWeatherMatrix | null | undefined,
  waves: { heightMeters: number | null; periodSeconds: number | null } | null | undefined): VesselSeaStateAssessment {
  if (!isVesselWeatherMatrix(matrix)) return { code: 'no_matrix', label: 'Matrice non renseignée', tone: 'neutral' };
  if (!matrix.levels.some((row) => row.some((level) => level !== null))) return { code: 'not_defined', label: 'Condition non définie', tone: 'neutral' };
  const hs = waves?.heightMeters, period = waves?.periodSeconds;
  if (typeof hs !== 'number' || !Number.isFinite(hs) || hs < 0 || typeof period !== 'number' || !Number.isFinite(period) || period < 0)
    return { code: 'no_forecast', label: 'Hs / période indisponible', tone: 'neutral' };
  if (hs > matrix.hsUpperBoundMeters) return { code: 'outside_matrix', label: 'Hors matrice', tone: 'warning' };
  const column = matrix.hsLowerBoundsMeters.reduce((selected, bound, index) => hs >= bound ? index : selected, 0);
  const row = matrix.periodLowerBoundsSeconds.reduce((selected, bound, index) => period >= bound ? index : selected, 0);
  const level = matrix.levels[row][column];
  const bands = { row, column, hsRange: vesselHsRange(matrix, column), periodRange: vesselPeriodRange(matrix, row) };
  return level ? { code: level, label: VESSEL_SEA_STATE_LABELS[level], tone: tones[level], ...bands }
    : { code: 'not_defined', label: 'Condition non définie', tone: 'neutral', ...bands };
}
