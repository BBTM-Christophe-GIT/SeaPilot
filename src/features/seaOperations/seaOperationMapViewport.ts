/** A retained manual map frame. Absence keeps the map's automatic route fit. */
export interface SeaOperationMapViewport {
  centerLatitude: number;
  centerLongitude: number;
  longitudeSpan: number;
}

export function isSeaOperationMapViewport(value: unknown): value is SeaOperationMapViewport {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const viewport = value as Record<string, unknown>;
  if (Object.keys(viewport).length !== 3 || !['centerLatitude', 'centerLongitude', 'longitudeSpan'].every(key =>
    Object.hasOwn(viewport, key) && typeof viewport[key] === 'number' && Number.isFinite(viewport[key]))) return false;
  return (viewport.centerLatitude as number) >= -90 && (viewport.centerLatitude as number) <= 90
    && (viewport.centerLongitude as number) >= -180 && (viewport.centerLongitude as number) <= 180
    && (viewport.longitudeSpan as number) >= .02 && (viewport.longitudeSpan as number) <= 360;
}

/** Validate without rounding or clamping, and return an independent snapshot. */
export function parseSeaOperationMapViewport(value: unknown): SeaOperationMapViewport | undefined {
  if (value === undefined) return undefined;
  if (!isSeaOperationMapViewport(value)) throw new Error('Le cadrage de la carte est invalide.');
  return { centerLatitude: value.centerLatitude, centerLongitude: value.centerLongitude, longitudeSpan: value.longitudeSpan };
}
