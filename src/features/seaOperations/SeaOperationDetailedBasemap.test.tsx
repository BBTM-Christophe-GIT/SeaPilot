import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SeaOperationDetailedBasemap } from './SeaOperationDetailedBasemap';
import { detailedBasemapTransform, type DetailedBasemapReply, type DetailedBasemapRequest } from './seaOperationDetailedBasemapModel';
import type { SeaOperationRouteMapGeometry } from './seaOperationRouteMapGeometry';

class MockWorker {
  static instances: MockWorker[] = [];
  onmessage: ((event: MessageEvent<DetailedBasemapReply>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  requests: Array<DetailedBasemapRequest | { cancel: number }> = [];
  terminate = vi.fn();
  constructor() { MockWorker.instances.push(this); }
  postMessage = (message: DetailedBasemapRequest | { cancel: number }) => { this.requests.push(message); };
  emit(request: DetailedBasemapRequest, failed = 0) {
    this.onmessage?.({ data: { ...request, failed, tiles: [{ key: '14/1/1', x: 0, y: 0, width: 500, height: 400, water: 'M0 0L10 0L10 10Z', roads: '', buildings: '', piers: '', pierLines: '' }] } } as MessageEvent<DetailedBasemapReply>);
  }
}
function geometry(centerLongitude = -1.62, width = 900): SeaOperationRouteMapGeometry {
  return { width, height: 320, land: [], points: [], grid: [], segments: [], invalidCount: 0, scale: null,
    viewport: { centerLatitude: 49.65, centerLongitude, longitudeSpan: .02 },
    projection: { centerLatitude: 49.65, centerLongitude, longitudePixelsPerDegree: width / .02, latitudePixelsPerDegree: width / .02 / Math.cos(49.65 * Math.PI / 180) } };
}
const latest = () => MockWorker.instances.at(-1)!;
const request = (worker = latest()) => worker.requests.filter((value): value is DetailedBasemapRequest => 'id' in value).at(-1)!;

beforeEach(() => { vi.useFakeTimers(); MockWorker.instances = []; vi.stubGlobal('Worker', MockWorker); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Detailed coastal SVG basemap', () => {
  it('waits for the final camera rather than requesting every wheel preview', () => {
    const status = vi.fn(), view = render(<svg><SeaOperationDetailedBasemap geometry={geometry()} onStatusChange={status} /></svg>);
    act(() => vi.advanceTimersByTime(179)); expect(request()).toBeUndefined();
    for (let index = 1; index <= 4; index += 1) {
      view.rerender(<svg><SeaOperationDetailedBasemap geometry={geometry(-1.62 + index * .001)} onStatusChange={status} /></svg>);
      act(() => vi.advanceTimersByTime(160));
    }
    expect(request()).toBeUndefined(); act(() => vi.advanceTimersByTime(20));
    expect(latest().requests.filter(value => 'id' in value)).toHaveLength(1); expect(status).toHaveBeenCalledTimes(1);
    expect(request().frame.projection.centerLongitude).toBeCloseTo(-1.616);
  });
  it('renders bounded tile clips and keeps loaded paths aligned while another frame is pending', () => {
    const source = geometry(), view = render(<svg><SeaOperationDetailedBasemap geometry={source} /></svg>);
    act(() => vi.advanceTimersByTime(180)); const first = request(); act(() => latest().emit(first));
    const layer = view.container.querySelector('.so-detailed-basemap')!;
    expect(layer.querySelector('clipPath rect')).toHaveAttribute('width', '500');
    expect(layer.querySelector('.so-detailed-basemap-water')).toHaveAttribute('fill-rule', 'nonzero');
    const moved = geometry(-1.619, 1200); view.rerender(<svg><SeaOperationDetailedBasemap geometry={moved} /></svg>);
    expect(layer).toHaveAttribute('transform', detailedBasemapTransform(first.frame, { width: moved.width, height: moved.height, projection: moved.projection! }));
    expect(layer.querySelector('.so-detailed-basemap-water')).toHaveAttribute('d', 'M0 0L10 0L10 10Z');
  });
  it('ignores worker replies from a previous generation and cancels obsolete requests', () => {
    const status = vi.fn(), view = render(<svg><SeaOperationDetailedBasemap geometry={geometry()} onStatusChange={status} /></svg>);
    act(() => vi.advanceTimersByTime(180)); const first = request();
    view.rerender(<svg><SeaOperationDetailedBasemap geometry={geometry(-1.61)} onStatusChange={status} /></svg>);
    expect(latest().requests).toContainEqual({ cancel: first.id });
    act(() => latest().emit(first)); expect(view.container.querySelector('.so-detailed-basemap')).toBeNull();
    act(() => vi.advanceTimersByTime(180)); act(() => latest().emit(request(), 1));
    expect(view.container.querySelector('.so-detailed-basemap')).not.toBeNull(); expect(status).toHaveBeenLastCalledWith('partial');
  });
  it('terminates the worker and ignores completion after unmount', () => {
    const status = vi.fn(), view = render(<svg><SeaOperationDetailedBasemap geometry={geometry()} onStatusChange={status} /></svg>);
    act(() => vi.advanceTimersByTime(180)); const worker = latest(), pending = request(); view.unmount();
    expect(worker.terminate).toHaveBeenCalledOnce(); const count = status.mock.calls.length;
    act(() => worker.emit(pending)); expect(status).toHaveBeenCalledTimes(count);
  });
  it('falls back gracefully when workers cannot be created or fail', () => {
    vi.stubGlobal('Worker', undefined); const status = vi.fn();
    const view = render(<svg><SeaOperationDetailedBasemap geometry={geometry()} onStatusChange={status} /></svg>);
    expect(status).toHaveBeenCalledWith('unavailable'); expect(view.container.querySelector('.so-detailed-basemap')).toBeNull(); view.unmount();
    vi.stubGlobal('Worker', MockWorker); render(<svg><SeaOperationDetailedBasemap geometry={geometry()} onStatusChange={status} /></svg>);
    act(() => latest().onerror?.(new ErrorEvent('error', { cancelable: true })));
    expect(status).toHaveBeenLastCalledWith('unavailable'); expect(latest().terminate).toHaveBeenCalledOnce();
  });
});
