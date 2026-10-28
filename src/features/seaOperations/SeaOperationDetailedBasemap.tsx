import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { SeaOperationRouteMapGeometry } from './seaOperationRouteMapGeometry';
import { detailedBasemapTransform, detailedMapFrame, detailedMapFrameKey, type DetailedBasemapReply, type DetailedBasemapStatus } from './seaOperationDetailedBasemapModel';
import './seaOperationDetailedBasemap.css';
export { DETAILED_BASEMAP_ATTRIBUTION } from './seaOperationDetailedBasemapModel';

/** The parent camera transforms this group during gestures; decoding never runs on the UI thread. */
export function SeaOperationDetailedBasemap({ geometry, onStatusChange }: {
  geometry: SeaOperationRouteMapGeometry;
  onStatusChange?: (status: DetailedBasemapStatus) => void;
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const worker = useRef<Worker | null>(null), generation = useRef(0), alive = useRef(false);
  const callback = useRef(onStatusChange); callback.current = onStatusChange;
  const status = useRef<DetailedBasemapStatus | null>(null);
  const [result, setResult] = useState<DetailedBasemapReply | null>(null);
  const { width, height } = geometry;
  const centerLatitude = geometry.projection?.centerLatitude, centerLongitude = geometry.projection?.centerLongitude;
  const latitudePixelsPerDegree = geometry.projection?.latitudePixelsPerDegree, longitudePixelsPerDegree = geometry.projection?.longitudePixelsPerDegree;
  const frame = useMemo(() => detailedMapFrame({ width, height, projection: centerLatitude === undefined || centerLongitude === undefined
    || latitudePixelsPerDegree === undefined || longitudePixelsPerDegree === undefined ? null
    : { centerLatitude, centerLongitude, latitudePixelsPerDegree, longitudePixelsPerDegree } }),
  [width, height, centerLatitude, centerLongitude, latitudePixelsPerDegree, longitudePixelsPerDegree]);
  const key = detailedMapFrameKey(frame), currentKey = useRef(key); currentKey.current = key;
  const report = useCallback((next: DetailedBasemapStatus) => { if (alive.current && status.current !== next) { status.current = next; callback.current?.(next); } }, []);

  useEffect(() => {
    alive.current = true;
    try {
      if (typeof Worker === 'undefined') throw new Error('Worker unavailable');
      const instance = new Worker(new URL('./seaOperationDetailedBasemap.worker.ts', import.meta.url), { type: 'module' });
      worker.current = instance;
      instance.onmessage = (event: MessageEvent<DetailedBasemapReply>) => {
        const value = event.data;
        if (!alive.current || value.id !== generation.current || detailedMapFrameKey(value.frame) !== currentKey.current) return;
        if (value.tiles.length) setResult(value);
        report(value.tiles.length ? value.failed ? 'partial' : 'ready' : 'unavailable');
      };
      instance.onerror = event => { event.preventDefault(); instance.terminate(); if (worker.current === instance) worker.current = null; report('unavailable'); };
    } catch { report('unavailable'); }
    return () => { alive.current = false; generation.current += 1; worker.current?.terminate(); worker.current = null; };
  }, [report]);

  useEffect(() => {
    const request = ++generation.current;
    if (!frame || !worker.current) return;
    report('loading');
    // Wheel preview updates the existing SVG matrix; request only once the camera settles.
    const timer = window.setTimeout(() => { try { worker.current?.postMessage({ id: request, frame }); } catch { report('unavailable'); } }, 180);
    return () => { window.clearTimeout(timer); try { worker.current?.postMessage({ cancel: request }); } catch { /* Worker has already failed. */ } };
  }, [key, frame, report]);

  if (!result || !frame) return null;
  return <g aria-hidden="true" className="so-detailed-basemap" transform={detailedBasemapTransform(result.frame, frame)}>
    {result.tiles.map((tile, index) => <g key={tile.key}>
      <defs><clipPath id={`${id}-tile-${index}`}><rect x={tile.x} y={tile.y} width={tile.width} height={tile.height} /></clipPath></defs>
      <g clipPath={`url(#${id}-tile-${index})`}>
        <rect className="so-detailed-basemap-land" x={tile.x} y={tile.y} width={tile.width} height={tile.height} />
        <path className="so-detailed-basemap-water" d={tile.water} fillRule="nonzero" />
        <path className="so-detailed-basemap-road" d={tile.roads} />
        <path className="so-detailed-basemap-building" d={tile.buildings} fillRule="nonzero" />
        <path className="so-detailed-basemap-pier" d={tile.piers} fillRule="nonzero" />
        <path className="so-detailed-basemap-pier-line" d={tile.pierLines} />
      </g>
    </g>)}
  </g>;
}
