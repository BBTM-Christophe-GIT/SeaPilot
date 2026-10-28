import type { RouteMapViewport, SeaOperationRouteMapGeometry } from './seaOperationRouteMapGeometry';

const wrapLongitude = (longitude: number) => ((longitude + 180) % 360 + 360) % 360 - 180;

/**
 * Transient camera preview of already projected SVG content. The caller supplies a
 * normalized viewport and still rebuilds exact geometry when the gesture finishes.
 * Clipped coastlines, visibility and label placement are not recalculated here.
 */
export function routeMapCameraTransform(geometry: SeaOperationRouteMapGeometry, viewport: RouteMapViewport): string | null {
  const base = geometry.projection;
  if (!base || ![geometry.width, geometry.height, base.latitudePixelsPerDegree, base.longitudePixelsPerDegree, viewport.longitudeSpan]
    .every(value => Number.isFinite(value) && value > 0)
    || ![base.centerLatitude, base.centerLongitude, viewport.centerLatitude, viewport.centerLongitude].every(Number.isFinite)
    || Math.abs(base.centerLatitude) > 90 || Math.abs(viewport.centerLatitude) > 90) return null;

  const longitudePixelsPerDegree = geometry.width / viewport.longitudeSpan;
  const latitudePixelsPerDegree = longitudePixelsPerDegree / Math.max(.05, Math.cos(viewport.centerLatitude * Math.PI / 180));
  const sx = longitudePixelsPerDegree / base.longitudePixelsPerDegree;
  const sy = latitudePixelsPerDegree / base.latitudePixelsPerDegree;
  const tx = geometry.width / 2 * (1 - sx)
    + wrapLongitude(base.centerLongitude - viewport.centerLongitude) * longitudePixelsPerDegree;
  const ty = geometry.height / 2 * (1 - sy)
    + (viewport.centerLatitude - base.centerLatitude) * latitudePixelsPerDegree;
  if (![sx, sy, tx, ty].every(Number.isFinite) || sx <= 0 || sy <= 0) return null;

  // Commas are accepted by both the SVG transform attribute and CSS transform.
  return `matrix(${sx}, 0, 0, ${sy}, ${tx}, ${ty})`;
}
