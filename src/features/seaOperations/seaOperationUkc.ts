export type SeaOperationUkcLevel = 'danger' | 'warning' | 'success';

export interface SeaOperationUkcAssessment {
  level: SeaOperationUkcLevel;
  valueMeters: number;
  draftMeters: number;
  formattedValue: string;
  label: string;
  tooltip: string;
}

const metres = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 20 });

/** Same admissible range as the Navires draft_m field. */
export function isVesselDraftMeters(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 50;
}

/** Historical annotations remain plain text; never classify a partially parsed value. */
export function seaOperationUkcMeters(value: string): number | undefined {
  const match = /^([+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+))\s*(?:m|mètres?)?$/iu.exec(value.trim());
  if (!match) return undefined;
  const parsed = Number(match[1].replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** User-defined display bands; this assessment never changes the captain's GO / NO GO. */
export function assessSeaOperationUkc(value: string, draftMeters: unknown): SeaOperationUkcAssessment | undefined {
  const valueMeters = seaOperationUkcMeters(value);
  if (valueMeters === undefined || !isVesselDraftMeters(draftMeters)) return undefined;
  const level = valueMeters <= draftMeters ? 'danger' : valueMeters <= draftMeters + 2 ? 'warning' : 'success';
  const label = level === 'danger' ? 'UKC inférieure ou égale au tirant d’eau'
    : level === 'warning' ? 'UKC supérieure au tirant d’eau, jusqu’à +2 m inclus'
      : 'UKC supérieure au tirant d’eau +2 m';
  // Keep the entered precision: rounding a value just above a boundary could
  // otherwise show "4 m" in green while exactly 4 m belongs to orange.
  const formattedValue = `${value.trim().replace(/\s*(?:m|mètres?)$/iu, '').trim().replace('.', ',')} m`;
  return { level, valueMeters, draftMeters, formattedValue, label,
    tooltip: `${label}. UKC : ${formattedValue} ; tirant d’eau de référence : ${metres.format(draftMeters)} m. Comparaison indicative selon les seuils définis, sans validation de l’appareillage.` };
}
