import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppDialog } from '../../components/AppDialog';
import type { SeaOperationWaypoint } from './seaOperationModel';
import type { SeaPosition } from './seaOperationNavigation';
import { SeaOperationWaypointMapEditor } from './SeaOperationWaypointMapEditor';
import { buildSeaOperationRouteMap, DEFAULT_ROUTE_MAP_VIEWPORT, routeMapPositionAt, zoomRouteMapViewport, type RouteMapViewport } from './seaOperationRouteMapGeometry';
import * as mapGeometry from './seaOperationRouteMapGeometry';
import * as mapPlaces from './seaOperationMapPlaces';
import { SEA_OPERATION_MAP_PORT_CATALOG, seaOperationMapPlaces } from './seaOperationMapPlaces';
import { formatProjectPort } from '../projects/projectPorts';

function point(index: number, latitude = '49.65', longitude = '-1.62'): SeaOperationWaypoint {
  return { id: `point-${index}`, number: String(index), descriptionVhf: '', latitude, longitude, eta: '', ukc: '', denseTraffic: false };
}

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;
  readonly isPrimary: boolean;
  readonly pointerType: string;
  constructor(type: string, init: PointerEventInit & { timeStamp?: number } = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.isPrimary = init.isPrimary ?? true;
    this.pointerType = init.pointerType ?? 'mouse';
    if (init.timeStamp !== undefined) Object.defineProperty(this, 'timeStamp', { value: init.timeStamp });
  }
}

beforeEach(() => { vi.stubGlobal('PointerEvent', TestPointerEvent); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function activate() {
  fireEvent.click(screen.getByRole('button', { name: 'Placer les waypoints' }));
  const surface = screen.getByRole('button', { name: 'Zone de placement des waypoints' });
  const svg = surface instanceof SVGElement ? surface.ownerSVGElement : null;
  if (!svg) throw new Error('The placement surface must belong to its SVG map.');
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 50, width: 450, height: 160, right: 550, bottom: 210, x: 100, y: 50, toJSON: () => ({}) });
  return { surface, svg };
}

function tap(surface: HTMLElement | SVGElement, x = 325, y = 130, pointerId = 1, pointerType = 'mouse', timeStamp?: number) {
  fireEvent.pointerDown(surface, { clientX: x, clientY: y, button: 0, pointerId, pointerType, timeStamp });
  fireEvent.pointerUp(surface, { clientX: x, clientY: y, button: 0, pointerId, pointerType, timeStamp });
}

function animationFrames() {
  let time = 0, nextId = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.spyOn(performance, 'now').mockImplementation(() => time);
  const request = vi.fn((callback: FrameRequestCallback) => { nextId += 1; frames.set(nextId, callback); return nextId; });
  const cancel = vi.fn((id: number) => { frames.delete(id); });
  vi.stubGlobal('requestAnimationFrame', request); vi.stubGlobal('cancelAnimationFrame', cancel);
  return { request, cancel, has: (id: number) => frames.has(id), get pending() { return frames.size; }, advance(milliseconds: number) {
    time += milliseconds;
    const callbacks = [...frames.values()]; frames.clear();
    act(() => callbacks.forEach(callback => callback(time)));
  } };
}

function cameraTransform(container: HTMLElement) {
  return container.querySelector('.so-route-map-camera')?.getAttribute('transform') ?? null;
}

function cameraScale(container: HTMLElement) {
  const transform = cameraTransform(container);
  if (!transform) return 1;
  const scale = /^matrix\(\s*([-+\d.eE]+)/.exec(transform)?.[1];
  if (scale === undefined) throw new Error(`Expected a camera matrix, received ${transform}`);
  return Number(scale);
}

describe('SeaOperationWaypointMapEditor', () => {
  it('follows points and ports automatically until manual framing is chosen, then restores the saved frame on remount', () => {
    const changed = vi.fn(), build = vi.spyOn(mapGeometry, 'buildSeaOperationRouteMap');
    const initial = [point(1)], add = vi.fn();
    const view = render(<SeaOperationWaypointMapEditor waypoints={initial} onAddWaypoint={add} departurePort="Port de Cherbourg" arrivalPort="Port de Barfleur" onMapViewportChange={changed} />);
    const mode = () => screen.getByRole('combobox', { name: 'Mode de cadrage de la carte' });
    expect(mode()).toHaveDisplayValue('Cadrage automatique');
    const original = build.mock.results.at(-1)!.value.viewport;
    view.rerender(<SeaOperationWaypointMapEditor waypoints={[point(1, '49.8', '-1.3')]} onAddWaypoint={add} departurePort="Port de Cherbourg" arrivalPort="Port de Barfleur" onMapViewportChange={changed} />);
    expect(build.mock.results.at(-1)!.value.viewport).not.toEqual(original); expect(changed).not.toHaveBeenCalled();
    fireEvent.change(mode(), { target: { value: 'manual' } });
    expect(changed).toHaveBeenCalledOnce(); const retained = changed.mock.calls[0][0];
    expect(retained.longitudeSpan).toBeGreaterThanOrEqual(.02);
    view.rerender(<SeaOperationWaypointMapEditor waypoints={[point(1, '48.5', '-4.5')]} onAddWaypoint={add} departurePort="Port de Brest" arrivalPort="Port de Dieppe" onMapViewportChange={changed} />);
    expect(mode()).toHaveDisplayValue('Cadrage manuel'); expect(build.mock.calls.at(-1)![3]).toEqual(retained); expect(changed).toHaveBeenCalledOnce();
    view.unmount();
    render(<SeaOperationWaypointMapEditor waypoints={initial} onAddWaypoint={add} mapViewport={retained} onMapViewportChange={changed} />);
    expect(mode()).toHaveDisplayValue('Cadrage manuel'); expect(build.mock.calls.at(-1)![3]).toEqual(retained);
    activate(); fireEvent.click(screen.getByRole('button', { name: 'Cadrer le parcours' }));
    expect(mode()).toHaveDisplayValue('Cadrage automatique'); expect(changed).toHaveBeenLastCalledWith(undefined);
  });

  it('allows manual camera navigation and zoom without enabling waypoint placement or adding on a tap or Enter', () => {
    const changed = vi.fn(), add = vi.fn(), frames = animationFrames();
    render(<SeaOperationWaypointMapEditor waypoints={[]} onAddWaypoint={add} onMapViewportChange={changed} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'manual' } });
    const surface = screen.getByRole('button', { name: 'Zone de navigation de la carte' });
    if (!(surface instanceof SVGElement) || !surface.ownerSVGElement) throw new Error('The navigation surface must belong to its SVG map.');
    const svg = surface.ownerSVGElement;
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 50, width: 450, height: 160, right: 550, bottom: 210, x: 100, y: 50, toJSON: () => ({}) });
    expect(screen.getByRole('button', { name: 'Placer les waypoints' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: 'Ajouter au centre' })).not.toBeInTheDocument();
    tap(surface); fireEvent.keyDown(surface, { key: 'Enter' }); expect(add).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Zoomer sur la carte' }));
    expect(changed).toHaveBeenCalledTimes(2);
    fireEvent.pointerDown(surface, { clientX: 325, clientY: 130, pointerId: 2, button: 0 });
    fireEvent.pointerMove(surface, { clientX: 345, clientY: 130, pointerId: 2 }); expect(changed).toHaveBeenCalledTimes(2);
    fireEvent.pointerUp(surface, { clientX: 345, clientY: 130, pointerId: 2 }); expect(changed).toHaveBeenCalledTimes(3);
    fireEvent.wheel(surface, { deltaY: -120, clientX: 325, clientY: 130 }); frames.advance(100);
    expect(changed).toHaveBeenCalledTimes(4); expect(add).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cadrer le parcours' }));
    expect(screen.getByRole('combobox')).toHaveDisplayValue('Cadrage automatique'); expect(changed).toHaveBeenLastCalledWith(undefined);
    expect(screen.queryByRole('button', { name: 'Zone de navigation de la carte' })).not.toBeInTheDocument();
  });

  it('publishes a pan once on release and keeps manual framing when placement ends', () => {
    const changed = vi.fn(); render(<SeaOperationWaypointMapEditor waypoints={[]} onAddWaypoint={vi.fn()} onMapViewportChange={changed} />);
    const { surface } = activate();
    fireEvent.pointerDown(surface, { clientX: 325, clientY: 130, pointerId: 1, button: 0 });
    fireEvent.pointerMove(surface, { clientX: 365, clientY: 130, pointerId: 1 });
    expect(changed).not.toHaveBeenCalled(); expect(screen.getByRole('combobox')).toHaveDisplayValue('Cadrage manuel');
    fireEvent.pointerUp(surface, { clientX: 365, clientY: 130, pointerId: 1 });
    expect(changed).toHaveBeenCalledOnce(); expect(changed.mock.calls[0][0].longitudeSpan).toBe(16);
    fireEvent.click(screen.getByRole('button', { name: 'Terminer le placement' }));
    expect(screen.getByRole('combobox')).toHaveDisplayValue('Cadrage manuel'); expect(changed).toHaveBeenCalledOnce();
  });

  it.each([{ key: 'Tab', target: 'surface' }, { key: 'Escape', target: 'surface' }, { key: 'ArrowDown', target: 'mode' }])('restores the committed manual frame when $key interrupts a wheel animation outside placement on $target', ({ key, target }) => {
    const frames = animationFrames(), changed = vi.fn(), build = vi.spyOn(mapGeometry, 'buildSeaOperationRouteMap');
    const view = render(<SeaOperationWaypointMapEditor waypoints={[]} onAddWaypoint={vi.fn()} mapViewport={{ ...DEFAULT_ROUTE_MAP_VIEWPORT }} onMapViewportChange={changed} />);
    const surface = screen.getByRole('button', { name: 'Zone de navigation de la carte' });
    if (!(surface instanceof SVGElement) || !surface.ownerSVGElement) throw new Error('The navigation surface must belong to its SVG map.');
    vi.spyOn(surface.ownerSVGElement, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 50, width: 450, height: 160, right: 550, bottom: 210, x: 100, y: 50, toJSON: () => ({}) });
    const committedCentre = screen.getByText(/^Centre :/).textContent;
    fireEvent.wheel(surface, { deltaY: -120, clientX: 437.5, clientY: 100 }); frames.advance(50);
    expect(cameraTransform(view.container)).not.toBeNull(); expect(changed).not.toHaveBeenCalled();
    fireEvent.keyDown(target === 'surface' ? surface : screen.getByRole('combobox'), { key });
    expect(screen.getByText(/^Centre :/).textContent).toBe(committedCentre);
    expect(cameraTransform(view.container)).toBeNull();
    expect(build.mock.results.at(-1)!.value.viewport).toEqual(DEFAULT_ROUTE_MAP_VIEWPORT);
    expect(frames.pending).toBe(0); frames.advance(1000); expect(changed).not.toHaveBeenCalled();
  });

  it('starts keyboard navigation from the visible intermediate wheel frame', () => {
    const frames = animationFrames(), changed = vi.fn();
    render(<SeaOperationWaypointMapEditor waypoints={[]} onAddWaypoint={vi.fn()} mapViewport={{ ...DEFAULT_ROUTE_MAP_VIEWPORT }} onMapViewportChange={changed} />);
    const surface = screen.getByRole('button', { name: 'Zone de navigation de la carte' });
    if (!(surface instanceof SVGElement) || !surface.ownerSVGElement) throw new Error('The navigation surface must belong to its SVG map.');
    vi.spyOn(surface.ownerSVGElement, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 50, width: 450, height: 160, right: 550, bottom: 210, x: 100, y: 50, toJSON: () => ({}) });
    fireEvent.wheel(surface, { deltaY: -120, clientX: 325, clientY: 130 }); frames.advance(50);
    fireEvent.keyDown(surface, { key: 'ArrowRight' });
    expect(changed).toHaveBeenCalledOnce(); expect(changed.mock.calls[0][0].longitudeSpan).toBeCloseTo(16 * Math.exp(-.12), 10);
    frames.advance(1000); expect(changed).toHaveBeenCalledOnce();
  });

  it.each(['heading', 'summary'])('commits the visible manual frame when a pointer presses the map %s during wheel interpolation', target => {
    const frames = animationFrames(), changed = vi.fn(), build = vi.spyOn(mapGeometry, 'buildSeaOperationRouteMap');
    const view = render(<SeaOperationWaypointMapEditor waypoints={[]} onAddWaypoint={vi.fn()} mapViewport={{ ...DEFAULT_ROUTE_MAP_VIEWPORT }} onMapViewportChange={changed} />);
    const surface = screen.getByRole('button', { name: 'Zone de navigation de la carte' });
    if (!(surface instanceof SVGElement) || !surface.ownerSVGElement) throw new Error('The navigation surface must belong to its SVG map.');
    vi.spyOn(surface.ownerSVGElement, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 50, width: 450, height: 160, right: 550, bottom: 210, x: 100, y: 50, toJSON: () => ({}) });
    fireEvent.wheel(surface, { deltaY: -120, clientX: 325, clientY: 130 }); frames.advance(50);
    expect(cameraTransform(view.container)).not.toBeNull();
    fireEvent.pointerDown(target === 'heading' ? screen.getByRole('heading', { name: 'Carte du parcours' }) : screen.getByText(/^Ports dans cette région/), { pointerId: 2, button: 0 });
    expect(build.mock.results.at(-1)!.value.viewport.longitudeSpan).toBeCloseTo(16 * Math.exp(-.12), 10);
    expect(cameraTransform(view.container)).toBeNull();
    expect(changed).toHaveBeenCalledOnce(); expect(changed.mock.calls[0][0]).toEqual(build.mock.results.at(-1)!.value.viewport);
    expect(frames.pending).toBe(0); frames.advance(1000); expect(changed).toHaveBeenCalledOnce();
  });

  it('continues a camera zoom button from the visible intermediate wheel frame', () => {
    const frames = animationFrames(), changed = vi.fn();
    render(<SeaOperationWaypointMapEditor waypoints={[]} onAddWaypoint={vi.fn()} mapViewport={{ ...DEFAULT_ROUTE_MAP_VIEWPORT }} onMapViewportChange={changed} />);
    const surface = screen.getByRole('button', { name: 'Zone de navigation de la carte' });
    if (!(surface instanceof SVGElement) || !surface.ownerSVGElement) throw new Error('The navigation surface must belong to its SVG map.');
    vi.spyOn(surface.ownerSVGElement, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 50, width: 450, height: 160, right: 550, bottom: 210, x: 100, y: 50, toJSON: () => ({}) });
    fireEvent.wheel(surface, { deltaY: -120, clientX: 325, clientY: 130 }); frames.advance(50);
    const zoom = screen.getByRole('button', { name: 'Zoomer sur la carte' });
    fireEvent.pointerDown(zoom, { pointerId: 2, button: 0 }); fireEvent.pointerUp(zoom, { pointerId: 2, button: 0 }); fireEvent.click(zoom);
    expect(changed).toHaveBeenCalledTimes(2); expect(changed.mock.calls[0][0].longitudeSpan).toBeCloseTo(16 * Math.exp(-.12), 10);
    expect(changed.mock.calls[1][0].longitudeSpan).toBeCloseTo(8 * Math.exp(-.12), 10);
    frames.advance(1000); expect(changed).toHaveBeenCalledTimes(2);
  });

  it('commits the intermediate frame before a waypoint tap opens its menu without repositioning it', () => {
    const frames = animationFrames(), changed = vi.fn(), move = vi.fn(), build = vi.spyOn(mapGeometry, 'buildSeaOperationRouteMap');
    render(<SeaOperationWaypointMapEditor waypoints={[point(1)]} onAddWaypoint={vi.fn()} onMoveWaypoint={move} onDeleteWaypoint={vi.fn()} mapViewport={{ ...DEFAULT_ROUTE_MAP_VIEWPORT }} onMapViewportChange={changed} />);
    const { surface } = activate();
    fireEvent.wheel(surface, { deltaY: -120, clientX: 325, clientY: 130 }); frames.advance(50);
    const marker = screen.getByRole('button', { name: 'Sélectionner le waypoint 1' });
    tap(marker, 350, 120, 2); fireEvent.click(marker);
    expect(screen.getByRole('menuitem', { name: 'Supprimer' })).toBeVisible(); expect(move).not.toHaveBeenCalled();
    expect(changed).toHaveBeenCalledOnce(); expect(changed.mock.calls[0][0].longitudeSpan).toBeCloseTo(16 * Math.exp(-.12), 10);
    expect(build.mock.results.at(-1)!.value.viewport).toEqual(changed.mock.calls[0][0]);
    frames.advance(1000); expect(changed).toHaveBeenCalledOnce(); expect(move).not.toHaveBeenCalled();
  });

  it('publishes wheel framing only at its final frame and resumes a pan from the visible intermediate zoom', () => {
    const frames = animationFrames(), changed = vi.fn();
    render(<SeaOperationWaypointMapEditor waypoints={[]} onAddWaypoint={vi.fn()} onMapViewportChange={changed} />);
    const { surface } = activate();
    fireEvent.wheel(surface, { deltaY: -120, clientX: 325, clientY: 130 }); frames.advance(20);
    expect(changed).not.toHaveBeenCalled(); expect(screen.getByRole('combobox')).toHaveDisplayValue('Cadrage manuel');
    frames.advance(80); expect(changed).toHaveBeenCalledOnce(); expect(changed.mock.calls[0][0].longitudeSpan).toBeCloseTo(16 * Math.exp(-.24), 10);
    fireEvent.wheel(surface, { deltaY: -120, clientX: 325, clientY: 130 }); frames.advance(20);
    fireEvent.pointerDown(surface, { clientX: 325, clientY: 130, pointerId: 2, button: 0 });
    expect(screen.getByRole('combobox')).toHaveDisplayValue('Cadrage manuel');
    fireEvent.pointerMove(surface, { clientX: 345, clientY: 130, pointerId: 2 });
    fireEvent.pointerUp(surface, { clientX: 345, clientY: 130, pointerId: 2 });
    expect(changed).toHaveBeenCalledTimes(3); expect(changed.mock.calls[2][0].longitudeSpan).toBeCloseTo(16 * Math.exp(-.288), 10);
    frames.advance(1000); expect(changed).toHaveBeenCalledTimes(3);
  });

  it('restores the last committed frame on cancellation and honors external automatic/readonly changes without callbacks', () => {
    const frames = animationFrames(), changed = vi.fn(), points = [point(1)], initial = { ...DEFAULT_ROUTE_MAP_VIEWPORT };
    const view = render(<SeaOperationWaypointMapEditor waypoints={points} onAddWaypoint={vi.fn()} mapViewport={initial} onMapViewportChange={changed} />);
    const { surface } = activate();
    fireEvent.wheel(surface, { deltaY: -120, clientX: 325, clientY: 130 }); frames.advance(20);
    fireEvent.blur(window); frames.advance(1000); expect(changed).not.toHaveBeenCalled();
    const external = { centerLatitude: 48, centerLongitude: -4, longitudeSpan: 2 };
    view.rerender(<SeaOperationWaypointMapEditor waypoints={points} onAddWaypoint={vi.fn()} mapViewport={external} onMapViewportChange={changed} />);
    expect(screen.getByText('Centre : 48° 00.000′ N — 004° 00.000′ W')).toBeVisible();
    fireEvent.wheel(surface, { deltaY: -120, clientX: 325, clientY: 130 });
    view.rerender(<SeaOperationWaypointMapEditor waypoints={points} onAddWaypoint={vi.fn()} onMapViewportChange={changed} disabled />);
    frames.advance(1000); expect(changed).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox')).toBeDisabled(); expect(screen.getByRole('combobox')).toHaveDisplayValue('Cadrage automatique');
  });

  it('requires an explicit layer choice at coincident route, isolated point and zone vertex positions', () => {
    const route = [point(1)], isolated = [{ ...point(2), id: 'isolated', number: 'B04', isolatedPointIcon: 'buoy' as const }];
    const zones = [{ id: 'zone', name: 'Travaux', vertices: [{ latitude: route[0].latitude, longitude: route[0].longitude }] }];
    const removeRoute = vi.fn(), removePoint = vi.fn(), removeVertex = vi.fn(), movePoint = vi.fn(), add = vi.fn();
    render(<SeaOperationWaypointMapEditor waypoints={route} isolatedPoints={isolated} zones={zones} onAddWaypoint={add} onDeleteWaypoint={removeRoute} onDeleteIsolatedPoint={removePoint} onDeleteZoneVertex={removeVertex} onMoveIsolatedPoint={movePoint} />);
    activate();
    const cluster = screen.getByRole('button', { name: /^Sélectionner les localisations : Waypoint 1,/ });
    fireEvent.click(cluster);
    expect(screen.getByRole('menuitem', { name: 'Waypoint 1' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Point isolé 1 · B04' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Sommet 1 · Travaux' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Point isolé 1 · B04' }));
    fireEvent.keyDown(cluster, { key: 'ArrowRight', altKey: true }); expect(movePoint).toHaveBeenCalledExactlyOnceWith('isolated', expect.any(Object));
    fireEvent.click(cluster); fireEvent.click(screen.getByRole('menuitem', { name: 'Point isolé 1 · B04' })); fireEvent.click(screen.getByRole('menuitem', { name: 'Supprimer' }));
    expect(removePoint).toHaveBeenCalledExactlyOnceWith('isolated'); expect(removeRoute).not.toHaveBeenCalled(); expect(removeVertex).not.toHaveBeenCalled();
    fireEvent.click(cluster); fireEvent.click(screen.getByRole('menuitem', { name: 'Waypoint 1' })); fireEvent.click(screen.getByRole('menuitem', { name: 'Supprimer' })); expect(removeRoute).toHaveBeenCalledExactlyOnceWith('point-1');
    fireEvent.click(cluster); fireEvent.click(screen.getByRole('menuitem', { name: 'Sommet 1 · Travaux' })); fireEvent.click(screen.getByRole('menuitem', { name: 'Supprimer' })); expect(removeVertex).toHaveBeenCalledExactlyOnceWith('zone', 0);
    expect(add).not.toHaveBeenCalled();
  });
  it('moves and deletes overlay points and zone vertices through their own callbacks without adding route legs', () => {
    const route = [point(1)], isolated = [{ ...point(2, '49.4', '-2'), id: 'isolated', number: 'B04', isolatedPointIcon: 'buoy' as const }];
    const zones = [{ id: 'zone', name: 'Travaux', vertices: [{ latitude: '49.2', longitude: '-2.2' }, { latitude: '49.25', longitude: '-2.1' }, { latitude: '49.15', longitude: '-2' }] }];
    const original = structuredClone({ route, isolated, zones });
    const movePoint = vi.fn(), deletePoint = vi.fn(), moveVertex = vi.fn(), deleteVertex = vi.fn(), add = vi.fn();
    render(<SeaOperationWaypointMapEditor waypoints={route} isolatedPoints={isolated} zones={zones} onAddWaypoint={add} onMoveIsolatedPoint={movePoint} onDeleteIsolatedPoint={deletePoint} onMoveZoneVertex={moveVertex} onDeleteZoneVertex={deleteVertex} />);
    activate();
    const isolatedTarget = screen.getByRole('button', { name: 'Sélectionner Point isolé 1 · B04' });
    fireEvent.keyDown(isolatedTarget, { key: 'ArrowRight', altKey: true });
    expect(movePoint).toHaveBeenCalledExactlyOnceWith('isolated', expect.objectContaining({ latitude: expect.any(Number), longitude: expect.any(Number) }));
    fireEvent.click(isolatedTarget); fireEvent.click(screen.getByRole('menuitem', { name: 'Supprimer' })); expect(deletePoint).toHaveBeenCalledExactlyOnceWith('isolated');
    const vertex = screen.getByRole('button', { name: 'Sélectionner Sommet 1 · Travaux' });
    fireEvent.keyDown(vertex, { key: 'ArrowUp', altKey: true }); expect(moveVertex).toHaveBeenCalledExactlyOnceWith('zone', 0, expect.any(Object));
    fireEvent.click(vertex); fireEvent.click(screen.getByRole('menuitem', { name: 'Supprimer' })); expect(deleteVertex).toHaveBeenCalledExactlyOnceWith('zone', 0);
    expect(add).not.toHaveBeenCalled(); expect({ route, isolated, zones }).toEqual(original);
  });
  it('adds an exact catalog port immediately on click before placement, without confirmation or route mutation', () => {
    const port = SEA_OPERATION_MAP_PORT_CATALOG.find(item => item.port.port === 'Port de Barfleur')!;
    const points = [point(1, String(port.location!.latitude), String(port.location!.longitude))], original = structuredClone(points);
    const add = vi.fn();
    render(<SeaOperationWaypointMapEditor waypoints={points} onAddWaypoint={add} />);
    fireEvent.click(within(screen.getByRole('group', { name: /Carte du parcours ·/ })).getByRole('button', { name: `Ajouter le port ${formatProjectPort(port.port)} comme waypoint` }));
    expect(add).toHaveBeenCalledExactlyOnceWith({ latitude: port.location!.latitude, longitude: port.location!.longitude }, { name: port.port.port, portKey: port.key });
    expect(screen.queryByText('Ajouter ce port comme waypoint')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Terminer le placement' })).toBeInTheDocument();
    expect(points).toEqual(original);
  });

  it('retains a port target through the wheel commit and adds the exact port on its first pointer click', () => {
    const frames = animationFrames(), add = vi.fn(), changed = vi.fn();
    const port = SEA_OPERATION_MAP_PORT_CATALOG.find(item => item.port.port === 'Port de Barfleur')!;
    const view = render(<SeaOperationWaypointMapEditor waypoints={[]} onAddWaypoint={add} mapViewport={{ ...DEFAULT_ROUTE_MAP_VIEWPORT }} onMapViewportChange={changed} />);
    const { surface } = activate();
    const portTarget = () => within(screen.getByRole('group', { name: /Carte du parcours ·/ })).getByRole('button', { name: `Ajouter le port ${formatProjectPort(port.port)} comme waypoint` });
    const retained = portTarget(), circle = retained.querySelector('circle')!;
    fireEvent.wheel(surface, { deltaY: -120, clientX: 325, clientY: 130 }); frames.advance(50);
    const matrix = cameraTransform(view.container)!.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi)!.map(Number);
    const x = Number(circle.getAttribute('cx')), y = Number(circle.getAttribute('cy'));
    const clientX = 100 + (matrix[0] * x + matrix[2] * y + matrix[4]) / 2;
    const clientY = 50 + (matrix[1] * x + matrix[3] * y + matrix[5]) / 2;
    expect(changed).not.toHaveBeenCalled(); expect(add).not.toHaveBeenCalled();
    fireEvent.pointerDown(retained, { clientX, clientY, button: 0, pointerId: 2 });
    expect(retained.isConnected).toBe(true); expect(portTarget()).toBe(retained);
    expect(changed).toHaveBeenCalledOnce(); expect(add).not.toHaveBeenCalled();
    fireEvent.pointerUp(retained, { clientX, clientY, button: 0, pointerId: 2 });
    fireEvent.click(retained, { clientX, clientY, button: 0 });
    expect(add).toHaveBeenCalledExactlyOnceWith({ latitude: port.location!.latitude, longitude: port.location!.longitude }, { name: port.port.port, portKey: port.key });
    frames.advance(1000); expect(add).toHaveBeenCalledTimes(1); expect(changed).toHaveBeenCalledOnce();
  });

  it('adds a port with Enter and ignores repeated key events', () => {
    const port = SEA_OPERATION_MAP_PORT_CATALOG.find(item => item.port.port === 'Port de Barfleur')!;
    const add = vi.fn();
    render(<SeaOperationWaypointMapEditor waypoints={[point(1, String(port.location!.latitude), String(port.location!.longitude))]} onAddWaypoint={add} />);
    const target = within(screen.getByRole('group', { name: /Carte du parcours ·/ })).getByRole('button', { name: `Ajouter le port ${formatProjectPort(port.port)} comme waypoint` });
    fireEvent.keyDown(target, { key: 'Enter', repeat: true }); expect(add).not.toHaveBeenCalled();
    fireEvent.keyDown(target, { key: 'Enter' });
    expect(add).toHaveBeenCalledExactlyOnceWith({ latitude: port.location!.latitude, longitude: port.location!.longitude }, { name: port.port.port, portKey: port.key });
  });

  it('requires choosing an identity for coincident ports, then adds it without a second confirmation', () => {
    const first = SEA_OPERATION_MAP_PORT_CATALOG.find(item => item.port.port === 'Port de Barfleur')!;
    const second = SEA_OPERATION_MAP_PORT_CATALOG.find(item => item.port.port === 'Port de Dieppe')!;
    const originalLocation = second.location;
    second.location = first.location;
    try {
      const model = seaOperationMapPlaces(buildSeaOperationRouteMap([], 900, 320, { ...DEFAULT_ROUTE_MAP_VIEWPORT }));
      const marker = model.markers.find(item => item.ports.length > 1)!;
      const add = vi.fn();
      render(<SeaOperationWaypointMapEditor waypoints={[]} onAddWaypoint={add} />);
      activate();
      fireEvent.click(screen.getByRole('button', { name: `Choisir un port parmi ${marker.ports.map(port => port.port.port).join(', ')}` }));
      expect(screen.getByRole('menu', { name: 'Ports à cette position' })).toBeInTheDocument();
      expect(add).not.toHaveBeenCalled();
      const port = marker.ports[1];
      fireEvent.click(screen.getByRole('menuitem', { name: formatProjectPort(port.port) }));
      expect(add).toHaveBeenCalledExactlyOnceWith({ latitude: port.location!.latitude, longitude: port.location!.longitude }, { name: port.port.port, portKey: port.key });
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    } finally { second.location = originalLocation; }
  });

  it('keeps clicks on the read-only voyage summary separate from waypoint placement', () => {
    const add = vi.fn();
    render(<SeaOperationWaypointMapEditor waypoints={[point(1), point(2, '48.36', '-4.53')]} maxSpeedKnots={12} etd="2026-10-27T10:00" onAddWaypoint={add} />);
    activate();
    const summary = screen.getByRole('complementary', { name: 'Estimation du parcours' });
    fireEvent.pointerDown(summary, { clientX: 400, clientY: 160, pointerId: 1, button: 0 });
    fireEvent.pointerUp(summary, { clientX: 400, clientY: 160, pointerId: 1 }); fireEvent.click(summary);
    expect(add).not.toHaveBeenCalled();
    expect(summary).toHaveTextContent('ETD'); expect(summary).toHaveTextContent('ETA estimée');
  });

  it('opens a menu beside the original waypoint containing only Delete, then deletes its ID', () => {
    const points = [point(1, 'invalid', ''), point(2), point(3, '50', '0')], original = structuredClone(points);
    const add = vi.fn(), move = vi.fn(), remove = vi.fn();
    render(<SeaOperationWaypointMapEditor waypoints={points} onAddWaypoint={add} onMoveWaypoint={move} onDeleteWaypoint={remove} />);
    activate();
    const marker = screen.getByRole('button', { name: 'Sélectionner le waypoint 3' });
    vi.spyOn(marker, 'getBoundingClientRect').mockReturnValue({ left: 210, right: 250, top: 120, bottom: 160, width: 40, height: 40, x: 210, y: 120, toJSON: () => ({}) });
    fireEvent.click(marker);
    const menu = screen.getByRole('menu', { name: 'Waypoint 3' });
    expect(menu).toHaveStyle({ left: '258px', top: '120px' });
    expect(screen.getAllByRole('menuitem')).toHaveLength(1);
    expect(screen.getByRole('menuitem', { name: 'Supprimer' })).toBeInTheDocument();
    expect(screen.queryByText('Repositionner')).not.toBeInTheDocument();
    expect(screen.queryByText('Annuler la sélection')).not.toBeInTheDocument();
    expect(document.querySelector('.so-waypoint-map-crosshair')).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Supprimer' }));
    expect(remove).toHaveBeenCalledExactlyOnceWith('point-3');
    expect(add).not.toHaveBeenCalled(); expect(move).not.toHaveBeenCalled(); expect(points).toEqual(original);
  });

  it('previews a held waypoint drag and commits its original ID only on release without adding', () => {
    vi.useFakeTimers();
    const points = [point(1, 'invalid', ''), point(2), point(3, '50', '0')]; points[1].denseTraffic = true;
    const original = structuredClone(points);
    const add = vi.fn(), move = vi.fn();
    const view = render(<SeaOperationWaypointMapEditor waypoints={points} onAddWaypoint={add} onMoveWaypoint={move} />);
    activate();
    expect(screen.getByRole('img', { name: 'Vigilance : trafic dense, risque de collision · Waypoint 2' })).toBeInTheDocument();
    const marker = screen.getByRole('button', { name: 'Sélectionner le waypoint 2' });
    const transform = marker.getAttribute('transform')!.match(/translate\(([-\d.]+) ([-\d.]+)\)/)!;
    const x = 100 + Number(transform[1]) / 2, y = 50 + Number(transform[2]) / 2;
    fireEvent.pointerDown(marker, { clientX: x, clientY: y, pointerId: 1, button: 0 });
    act(() => vi.advanceTimersByTime(300));
    expect(view.container.querySelector('.is-grabbing')).not.toBeNull();
    fireEvent.pointerMove(marker, { clientX: x + 30, clientY: y - 10, pointerId: 1 });
    expect(move).not.toHaveBeenCalled();
    expect(view.container.querySelector('[data-point-indices="2"]')!.getAttribute('transform')).not.toBe(marker.getAttribute('transform'));
    fireEvent.pointerUp(marker, { clientX: x + 30, clientY: y - 10, pointerId: 1 });
    expect(move).toHaveBeenCalledExactlyOnceWith('point-2', expect.objectContaining({ latitude: expect.any(Number), longitude: expect.any(Number) }));
    expect(move.mock.calls[0][1].latitude).toBeGreaterThan(49.65); expect(move.mock.calls[0][1].longitude).toBeGreaterThan(-1.62);
    fireEvent.click(marker);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(add).not.toHaveBeenCalled(); expect(points).toEqual(original);
  });

  it('lets a direct drag finish exactly on an occupied waypoint position without losing capture or adding', () => {
    const add = vi.fn(), move = vi.fn();
    render(<SeaOperationWaypointMapEditor waypoints={[point(1), point(2, '50', '0')]} onAddWaypoint={add} onMoveWaypoint={move} />);
    activate();
    const first = screen.getByRole('button', { name: 'Sélectionner le waypoint 1' });
    const second = screen.getByRole('button', { name: 'Sélectionner le waypoint 2' });
    const position = (marker: HTMLElement) => {
      const match = marker.getAttribute('transform')!.match(/translate\(([-\d.]+) ([-\d.]+)\)/)!;
      return { clientX: 100 + Number(match[1]) / 2, clientY: 50 + Number(match[2]) / 2 };
    };
    const start = position(first), end = position(second);
    fireEvent.pointerDown(first, { ...start, pointerId: 1, button: 0 });
    fireEvent.pointerMove(first, { ...end, pointerId: 1 });
    expect(first).toBeInTheDocument();
    fireEvent.pointerUp(first, { ...end, pointerId: 1 });
    expect(move).toHaveBeenCalledExactlyOnceWith('point-1', expect.objectContaining({ latitude: expect.any(Number), longitude: expect.any(Number) }));
    expect(move.mock.calls[0][1].latitude).toBeCloseTo(50, 4); expect(move.mock.calls[0][1].longitude).toBeCloseTo(0, 4);
    expect(add).not.toHaveBeenCalled();
  });

  it('requires an explicit identity before deleting coincident waypoints', () => {
    const add = vi.fn(), remove = vi.fn();
    render(<SeaOperationWaypointMapEditor waypoints={[point(1, 'invalid', ''), point(2), point(3)]} onAddWaypoint={add} onDeleteWaypoint={remove} />);
    activate();
    fireEvent.click(screen.getByRole('button', { name: 'Sélectionner les waypoints 2, 3' }));
    expect(screen.getByRole('menu', { name: 'Waypoints à cette position' })).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: 'Supprimer' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Waypoint 3' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Supprimer' }));
    expect(remove).toHaveBeenCalledExactlyOnceWith('point-3'); expect(add).not.toHaveBeenCalled();
  });

  it('closes the waypoint menu with Escape without closing the form and supports keyboard movement', () => {
    const add = vi.fn(), move = vi.fn(), close = vi.fn();
    render(<AppDialog title="Mission" onClose={close}><SeaOperationWaypointMapEditor waypoints={[point(1)]} onAddWaypoint={add} onMoveWaypoint={move} onDeleteWaypoint={vi.fn()} /></AppDialog>);
    const { surface } = activate();
    const marker = screen.getByRole('button', { name: 'Sélectionner le waypoint 1' });
    fireEvent.keyDown(marker, { key: 'Enter' });
    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Supprimer' }), { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument(); expect(close).not.toHaveBeenCalled();
    expect(surface).toHaveFocus();
    fireEvent.keyDown(marker, { key: 'ArrowRight', altKey: true });
    expect(move).toHaveBeenCalledExactlyOnceWith('point-1', expect.objectContaining({ latitude: expect.any(Number), longitude: expect.any(Number) }));
    expect(move.mock.calls[0][1].longitude).toBeGreaterThan(-1.62); expect(add).not.toHaveBeenCalled();
  });

  it('cancels waypoint drag previews on pointer cancellation, blur and permission changes', () => {
    vi.useFakeTimers();
    const add = vi.fn(), move = vi.fn();
    const view = render(<SeaOperationWaypointMapEditor waypoints={[point(1)]} onAddWaypoint={add} onMoveWaypoint={move} />);
    activate();
    const marker = screen.getByRole('button', { name: 'Sélectionner le waypoint 1' });
    const begin = () => {
      fireEvent.pointerDown(marker, { clientX: 325, clientY: 130, pointerId: 1, button: 0 });
      fireEvent.pointerMove(marker, { clientX: 345, clientY: 140, pointerId: 1 });
    };
    begin(); fireEvent.pointerCancel(marker, { pointerId: 1 });
    begin(); fireEvent.blur(window);
    begin(); view.rerender(<SeaOperationWaypointMapEditor waypoints={[point(1)]} onAddWaypoint={add} onMoveWaypoint={move} disabled />);
    act(() => vi.advanceTimersByTime(500));
    fireEvent.pointerUp(marker, { clientX: 345, clientY: 140, pointerId: 1 });
    expect(move).not.toHaveBeenCalled(); expect(add).not.toHaveBeenCalled();
    expect(view.container.querySelector('.is-grabbing')).toBeNull();
    expect(screen.queryByRole('button', { name: /Ajouter le port/ })).not.toBeInTheDocument();
  });

  it('grabs after a sustained press, suppresses addition even without movement and cleans the hold on blur or disable', () => {
    vi.useFakeTimers();
    const add = vi.fn();
    const view = render(<SeaOperationWaypointMapEditor waypoints={[]} onAddWaypoint={add} />);
    const { surface } = activate();
    fireEvent.pointerDown(surface, { clientX: 325, clientY: 130, pointerId: 1, button: 0 });
    act(() => vi.advanceTimersByTime(299));
    expect(view.container.querySelector('.is-grabbing')).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(view.container.querySelector('.is-grabbing')).not.toBeNull();
    fireEvent.pointerUp(surface, { clientX: 325, clientY: 130, pointerId: 1 });
    expect(add).not.toHaveBeenCalled(); expect(view.container.querySelector('.is-grabbing')).toBeNull();
    fireEvent.pointerDown(surface, { clientX: 325, clientY: 130, pointerId: 2, button: 0 });
    fireEvent.blur(window); act(() => vi.advanceTimersByTime(400));
    expect(view.container.querySelector('.is-grabbing')).toBeNull();
    fireEvent.pointerUp(surface, { clientX: 325, clientY: 130, pointerId: 2 });
    fireEvent.pointerDown(surface, { clientX: 325, clientY: 130, pointerId: 3, button: 0 });
    view.rerender(<SeaOperationWaypointMapEditor waypoints={[]} onAddWaypoint={add} disabled />);
    act(() => vi.advanceTimersByTime(400));
    expect(view.container.querySelector('.is-grabbing')).toBeNull(); expect(add).not.toHaveBeenCalled();
  });

  it('zooms at the pointer coordinate with a nonpassive wheel listener and cancels any active pointer gesture', () => {
    const frames = animationFrames();
    const add = vi.fn();
    const view = render(<SeaOperationWaypointMapEditor waypoints={[]} onAddWaypoint={add} />);
    const { surface } = activate();
    const pixel = { x: 675, y: 100 };
    const expected = routeMapPositionAt(buildSeaOperationRouteMap([], 900, 320, { ...DEFAULT_ROUTE_MAP_VIEWPORT }), pixel.x, pixel.y)!;
    fireEvent.pointerDown(surface, { clientX: 437.5, clientY: 100, pointerId: 1, button: 0 });
    expect(fireEvent.wheel(surface, { deltaY: -120, clientX: 437.5, clientY: 100, cancelable: true })).toBe(false);
    fireEvent.pointerUp(surface, { clientX: 437.5, clientY: 100, pointerId: 1 });
    expect(add).not.toHaveBeenCalled();
    frames.advance(100);
    tap(surface, 437.5, 100, 2);
    expect(add).toHaveBeenCalledOnce();
    expect(add.mock.calls[0][0].latitude).toBeCloseTo(expected.latitude, 8);
    expect(add.mock.calls[0][0].longitude).toBeCloseTo(expected.longitude, 8);
    view.rerender(<SeaOperationWaypointMapEditor waypoints={[]} onAddWaypoint={add} disabled />);
    expect(fireEvent.wheel(surface, { deltaY: -120, clientX: 437.5, clientY: 100, cancelable: true })).toBe(true);
  });

  it('coalesces wheel input into lightweight camera frames and keeps the latest cursor coordinate fixed', () => {
    const frames = animationFrames(), add = vi.fn(), changed = vi.fn(), build = vi.spyOn(mapGeometry, 'buildSeaOperationRouteMap');
    const view = render(<SeaOperationWaypointMapEditor waypoints={[]} onAddWaypoint={add} mapViewport={{ ...DEFAULT_ROUTE_MAP_VIEWPORT }} onMapViewportChange={changed} />);
    const { surface } = activate(); build.mockClear();
    for (const clientX of [325, 400, 437.5]) fireEvent.wheel(surface, { deltaY: -40, clientX, clientY: 100, cancelable: true });
    expect(frames.request).toHaveBeenCalledOnce(); expect(frames.pending).toBe(1);
    expect(build).not.toHaveBeenCalled();
    frames.advance(16);
    const intermediate = cameraTransform(view.container);
    expect(intermediate).not.toBeNull(); expect(build).not.toHaveBeenCalled(); expect(frames.pending).toBe(1);
    expect(view.container.querySelector('.so-waypoint-map-camera-targets')).toHaveAttribute('transform', intermediate!);
    frames.advance(16);
    expect(cameraTransform(view.container)).not.toBe(intermediate); expect(build).not.toHaveBeenCalled(); expect(changed).not.toHaveBeenCalled();
    frames.advance(68); expect(frames.pending).toBe(0);
    expect(build).toHaveBeenCalledOnce(); expect(changed).toHaveBeenCalledOnce(); expect(cameraTransform(view.container)).toBeNull();
    const original = routeMapPositionAt(buildSeaOperationRouteMap([], 900, 320, { ...DEFAULT_ROUTE_MAP_VIEWPORT }), 675, 100)!;
    tap(surface, 437.5, 100, 2);
    expect(add.mock.calls[0][0].latitude).toBeCloseTo(original.latitude, 8);
    expect(add.mock.calls[0][0].longitude).toBeCloseTo(original.longitude, 8);
    tap(surface, 325, 100, 3);
    const span = (add.mock.calls[0][0].longitude - add.mock.calls[1][0].longitude) * 4;
    expect(span).toBeCloseTo(DEFAULT_ROUTE_MAP_VIEWPORT.longitudeSpan * Math.exp(-120 * .002), 8);
  });

  it('responds throughout an 8ms wheel stream while limiting full rebuilds and publishing only its final frame', () => {
    const frames = animationFrames(), add = vi.fn(), move = vi.fn(), remove = vi.fn(), changed = vi.fn();
    const build = vi.spyOn(mapGeometry, 'buildSeaOperationRouteMap'), places = vi.spyOn(mapPlaces, 'seaOperationMapPlaces');
    const points = [point(1), point(2, '49.8', '-2.5')], original = structuredClone(points);
    const view = render(<SeaOperationWaypointMapEditor waypoints={points} onAddWaypoint={add} onMoveWaypoint={move} onDeleteWaypoint={remove} mapViewport={{ ...DEFAULT_ROUTE_MAP_VIEWPORT }} onMapViewportChange={changed} />);
    const { surface } = activate(); build.mockClear(); places.mockClear();
    let firstFrame: string | null = null;
    for (let event = 0; event < 50; event += 1) {
      fireEvent.wheel(surface, { deltaY: -4, clientX: 437.5, clientY: 100, cancelable: true });
      frames.advance(8);
      if (event === 1) {
        firstFrame = cameraTransform(view.container);
        expect(firstFrame).not.toBeNull(); expect(cameraScale(view.container)).toBeGreaterThan(1);
        expect(view.container.querySelector('.so-waypoint-map-camera-targets')).toHaveAttribute('transform', firstFrame!);
      }
      if (event === 3) expect(cameraTransform(view.container)).not.toBe(firstFrame);
      expect(changed).not.toHaveBeenCalled();
    }
    expect(build.mock.calls.length).toBeLessThanOrEqual(3); expect(places.mock.calls.length).toBeLessThanOrEqual(3);
    expect(view.container.querySelector('.so-route-map-north')?.closest('.so-route-map-camera')).toBeNull();
    expect(surface.closest('.so-waypoint-map-camera-targets')).toBeNull();
    frames.advance(100);
    expect(frames.pending).toBe(0); expect(changed).toHaveBeenCalledOnce();
    expect(build.mock.calls.length).toBeLessThanOrEqual(4); expect(places.mock.calls.length).toBeLessThanOrEqual(4);
    expect(changed.mock.calls[0][0].longitudeSpan).toBeCloseTo(16 * Math.exp(-50 * 4 * .002), 10);
    const final = build.mock.results.at(-1)!.value;
    const anchor = routeMapPositionAt(buildSeaOperationRouteMap([], 900, 320, { ...DEFAULT_ROUTE_MAP_VIEWPORT }), 675, 100)!;
    const finalAnchor = routeMapPositionAt(final, 675, 100)!;
    expect(finalAnchor.latitude).toBeCloseTo(anchor.latitude, 8); expect(finalAnchor.longitude).toBeCloseTo(anchor.longitude, 8);
    expect(cameraTransform(view.container)).toBeNull(); expect(points).toEqual(original);
    expect(add).not.toHaveBeenCalled(); expect(move).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled();
  });

  it('reverses the visible camera on the next frame without publishing the interrupted target', () => {
    const frames = animationFrames(), changed = vi.fn(), add = vi.fn();
    const points = [point(1)], original = structuredClone(points);
    const view = render(<SeaOperationWaypointMapEditor waypoints={points} onAddWaypoint={add} mapViewport={{ ...DEFAULT_ROUTE_MAP_VIEWPORT }} onMapViewportChange={changed} />);
    const { surface } = activate();
    fireEvent.wheel(surface, { deltaY: -120, clientX: 325, clientY: 130 }); frames.advance(16);
    const forwardScale = cameraScale(view.container);
    expect(forwardScale).toBeGreaterThan(1); expect(changed).not.toHaveBeenCalled();
    fireEvent.wheel(surface, { deltaY: 60, clientX: 325, clientY: 130 }); frames.advance(16);
    expect(cameraScale(view.container)).toBeLessThan(forwardScale); expect(changed).not.toHaveBeenCalled();
    frames.advance(100);
    expect(changed).toHaveBeenCalledOnce(); expect(frames.pending).toBe(0);
    expect(changed.mock.calls[0][0].longitudeSpan).toBeCloseTo(16 / forwardScale * Math.exp(.12), 8);
    expect(points).toEqual(original); expect(add).not.toHaveBeenCalled();
  });

  it.each(['blur', 'permission toggle'])('refreshes its camera hit targets after %s before starting another wheel preview', interruption => {
    const frames = animationFrames(), add = vi.fn(), changed = vi.fn(), points: SeaOperationWaypoint[] = [];
    const viewport = { ...DEFAULT_ROUTE_MAP_VIEWPORT };
    const view = render(<SeaOperationWaypointMapEditor waypoints={points} onAddWaypoint={add} mapViewport={viewport} onMapViewportChange={changed} />);
    const { surface } = activate();
    const previousTargets = view.container.querySelector('.so-waypoint-map-camera-targets');
    fireEvent.wheel(surface, { deltaY: -120, clientX: 325, clientY: 130 }); frames.advance(20);
    expect(previousTargets).toHaveAttribute('transform', cameraTransform(view.container)!);
    if (interruption === 'blur') fireEvent.blur(window);
    else {
      view.rerender(<SeaOperationWaypointMapEditor waypoints={points} onAddWaypoint={add} mapViewport={viewport} onMapViewportChange={changed} disabled />);
      expect(view.container.querySelector('.so-waypoint-map-camera-targets')).toBeNull();
      view.rerender(<SeaOperationWaypointMapEditor waypoints={points} onAddWaypoint={add} mapViewport={viewport} onMapViewportChange={changed} />);
      expect(view.container.querySelector('.so-waypoint-map-camera-targets')).not.toBe(previousTargets);
    }
    expect(cameraTransform(view.container)).toBeNull(); expect(frames.pending).toBe(0); expect(changed).not.toHaveBeenCalled();
    fireEvent.wheel(screen.getByRole('button', { name: 'Zone de placement des waypoints' }), { deltaY: -120, clientX: 325, clientY: 130 }); frames.advance(16);
    expect(cameraTransform(view.container)).not.toBeNull();
    expect(view.container.querySelector('.so-waypoint-map-camera-targets')).toHaveAttribute('transform', cameraTransform(view.container)!);
    frames.advance(84);
    expect(changed).toHaveBeenCalledOnce(); expect(add).not.toHaveBeenCalled(); expect(frames.pending).toBe(0);
  });

  it('accumulates new wheel deltas between frames but reverses immediately from the visible view', () => {
    const frames = animationFrames(), add = vi.fn();
    render(<SeaOperationWaypointMapEditor waypoints={[]} onAddWaypoint={add} />);
    const { surface } = activate();
    fireEvent.wheel(surface, { deltaY: -60, clientX: 325, clientY: 130 }); frames.advance(50);
    fireEvent.wheel(surface, { deltaY: -60, clientX: 325, clientY: 130 }); frames.advance(100);
    tap(surface, 437.5, 130, 1);
    expect(add.mock.calls[0][0].longitude).toBeCloseTo(-3 + 4 * Math.exp(-.24), 8);
    fireEvent.wheel(surface, { deltaY: -120, clientX: 325, clientY: 130 }); frames.advance(50);
    fireEvent.wheel(surface, { deltaY: 60, clientX: 325, clientY: 130 }); frames.advance(100);
    tap(surface, 437.5, 130, 2, 'mouse', 1000);
    expect(add.mock.calls[1][0].longitude).toBeCloseTo(add.mock.calls[0][0].longitude, 8);
  });

  it.each([{ deltaY: -7.5, deltaMode: 1 }, { deltaY: -.375, deltaMode: 2 }, { deltaY: -120, deltaMode: 0 }])('normalizes wheel mode $deltaMode without changing the final zoom', input => {
    const frames = animationFrames(), add = vi.fn();
    render(<SeaOperationWaypointMapEditor waypoints={[]} onAddWaypoint={add} />);
    const { surface } = activate();
    fireEvent.wheel(surface, { ...input, clientX: 325, clientY: 130 }); frames.advance(100);
    tap(surface, 437.5, 130);
    expect(add.mock.calls[0][0].longitude).toBeCloseTo(-3 + 4 * Math.exp(-.24), 8);
  });

  it('finishes exactly at the zoom limit and does not keep animating against that limit', () => {
    const frames = animationFrames(), add = vi.fn();
    render(<SeaOperationWaypointMapEditor waypoints={[]} onAddWaypoint={add} />);
    const { surface } = activate();
    for (let index = 0; index < 20; index += 1) fireEvent.wheel(surface, { deltaY: -800, clientX: 325, clientY: 130 });
    frames.advance(100);
    expect(frames.pending).toBe(0); const requests = frames.request.mock.calls.length;
    fireEvent.wheel(surface, { deltaY: -120, clientX: 325, clientY: 130 });
    expect(frames.pending).toBe(0); expect(frames.request).toHaveBeenCalledTimes(requests);
    tap(surface, 437.5, 130);
    const minimum = zoomRouteMapViewport({ ...DEFAULT_ROUTE_MAP_VIEWPORT }, 1e12).longitudeSpan;
    expect(add.mock.calls[0][0].longitude).toBeCloseTo(-3 + minimum / 4, 8);
  });

  it.each(['blur', 'fit', 'zoom', 'pan', 'pointer', 'fullscreen', 'finish', 'disabled', 'source', 'unmount'] as const)('cancels scheduled wheel frames on %s instead of applying stale zoom later', action => {
    const frames = animationFrames(), add = vi.fn(), points: SeaOperationWaypoint[] = [];
    const view = render(<SeaOperationWaypointMapEditor waypoints={points} onAddWaypoint={add} />);
    const { surface } = activate();
    fireEvent.wheel(surface, { deltaY: -120, clientX: 437.5, clientY: 100 });
    expect(frames.pending).toBe(1);
    const zoomFrame = frames.request.mock.results[0].value as number;
    if (action === 'blur') fireEvent.blur(window);
    else if (action === 'fit') fireEvent.click(screen.getByRole('button', { name: 'Cadrer le parcours' }));
    else if (action === 'zoom') fireEvent.click(screen.getByRole('button', { name: 'Zoomer sur la carte' }));
    else if (action === 'pan') fireEvent.click(screen.getByRole('button', { name: 'Déplacer la carte vers le nord' }));
    else if (action === 'pointer') fireEvent.pointerDown(surface, { clientX: 325, clientY: 130, pointerId: 2, button: 0 });
    else if (action === 'fullscreen') fireEvent.click(screen.getByRole('button', { name: 'Afficher la carte en plein écran' }));
    else if (action === 'finish') fireEvent.click(screen.getByRole('button', { name: 'Terminer le placement' }));
    else if (action === 'disabled') view.rerender(<SeaOperationWaypointMapEditor waypoints={points} onAddWaypoint={add} disabled />);
    else if (action === 'source') view.rerender(<SeaOperationWaypointMapEditor waypoints={[point(1)]} onAddWaypoint={add} />);
    else view.unmount();
    expect(frames.has(zoomFrame)).toBe(false); expect(frames.cancel).toHaveBeenCalledWith(zoomFrame);
    // Fullscreen may schedule its own focus restoration frame; it must not retain the zoom frame.
    if (action !== 'fullscreen') expect(frames.pending).toBe(0);
    const before = view.container.textContent;
    frames.advance(1000); expect(view.container.textContent).toBe(before); expect(add).not.toHaveBeenCalled();
  });

  it('cancels wheel interpolation when the map is resized', () => {
    let onResize!: ResizeObserverCallback;
    vi.stubGlobal('ResizeObserver', class { constructor(callback: ResizeObserverCallback) { onResize = callback; } observe() {} disconnect() {} });
    const frames = animationFrames();
    render(<SeaOperationWaypointMapEditor waypoints={[]} onAddWaypoint={vi.fn()} />);
    const { surface } = activate();
    fireEvent.wheel(surface, { deltaY: -120, clientX: 325, clientY: 130 });
    act(() => onResize([{ contentRect: { width: 330, height: 280 } } as ResizeObserverEntry], {} as ResizeObserver));
    expect(frames.pending).toBe(0); frames.advance(1000);
    expect(screen.getByRole('combobox')).toHaveDisplayValue('Cadrage automatique');
  });
  it('keeps gestures opt-in, shows a local background when empty, and ends placement explicitly', () => {
    const add = vi.fn();
    const { container } = render(<SeaOperationWaypointMapEditor waypoints={[]} onAddWaypoint={add} />);
    expect(screen.queryByRole('button', { name: 'Ajouter au centre' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Zone de placement des waypoints' })).not.toBeInTheDocument();
    expect(screen.getByText('0 points géolocalisés')).toBeVisible();
    const { surface } = activate();
    expect(surface).toHaveFocus();
    expect(screen.getByText(/Glissez le fond pour naviguer/)).toBeVisible();
    expect(container.querySelectorAll('.so-route-map-land polygon').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Terminer le placement' }));
    expect(screen.queryByRole('button', { name: 'Zone de placement des waypoints' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Placer les waypoints' })).toHaveFocus();
    expect(add).not.toHaveBeenCalled();
  });

  it('inverts CSS-scaled SVG coordinates and adds exactly once for a pointer gesture followed by click', () => {
    const add = vi.fn();
    render(<SeaOperationWaypointMapEditor waypoints={[]} onAddWaypoint={add} />);
    const { surface } = activate();
    tap(surface, 437.5, 130, 1, 'mouse', 1000);
    fireEvent.click(surface, { clientX: 437.5, clientY: 130 });
    expect(add).toHaveBeenCalledExactlyOnceWith({ latitude: 49, longitude: 1 });
    expect(screen.getByRole('status')).toHaveTextContent('Point 1 ajouté au tableau');
    expect(screen.getByRole('status')).toHaveTextContent('49° 00.000′ N — 001° 00.000′ E');
    tap(surface, 437.5, 130, 2, 'mouse', 1100); // accidental second click/tap at the same pixel
    expect(add).toHaveBeenCalledOnce();
  });

  it('keeps automatic placement steady between clicks, fits on exit and preserves later additions in manual mode', () => {
    const changed = vi.fn();
    function ControlledEditor() {
      const [points, setPoints] = useState<SeaOperationWaypoint[]>([]);
      const [frame, setFrame] = useState<RouteMapViewport>();
      const add = (position: SeaPosition) => setPoints((previous) => [...previous, point(previous.length + 1, String(position.latitude), String(position.longitude))]);
      return <SeaOperationWaypointMapEditor waypoints={points} onAddWaypoint={add} mapViewport={frame} onMapViewportChange={next => { changed(next); setFrame(next); }} />;
    }
    const { container } = render(<ControlledEditor />);
    const { surface } = activate();
    tap(surface);
    expect(container.querySelector('[data-point-indices="1"]')).toHaveAttribute('transform', 'translate(450 160)');
    tap(surface, 437.5, 130, 2);
    expect(screen.getByText('2 points géolocalisés')).toBeVisible();
    expect(container.querySelector('[data-point-indices="1"]')).toHaveAttribute('transform', 'translate(450 160)');
    expect(container.querySelector('[data-point-indices="2"]')).toHaveAttribute('transform', 'translate(675 160)');
    expect(screen.getByRole('combobox')).toHaveDisplayValue('Cadrage automatique'); expect(changed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Terminer le placement' }));
    expect(container.querySelector('[data-point-indices="1"]')).not.toHaveAttribute('transform', 'translate(450 160)');
    expect(changed).not.toHaveBeenCalled();
    const { surface: resumed } = activate();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'manual' } });
    const firstPosition = container.querySelector('[data-point-indices="1"]')!.getAttribute('transform');
    tap(resumed, 325, 130, 3);
    expect(screen.getByText('3 points géolocalisés')).toBeVisible();
    expect(container.querySelector('[data-point-indices="1"]')).toHaveAttribute('transform', firstPosition);
    expect(changed).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Cadrer le parcours' }));
    expect(screen.getByRole('combobox')).toHaveDisplayValue('Cadrage automatique'); expect(changed).toHaveBeenLastCalledWith(undefined);
    expect(screen.getByRole('button', { name: 'Terminer le placement' })).toBeVisible();
  });

  it('pans on drag and never adds, including when the pointer returns to its starting position', () => {
    const add = vi.fn();
    render(<SeaOperationWaypointMapEditor waypoints={[]} onAddWaypoint={add} />);
    const { surface } = activate();
    fireEvent.pointerDown(surface, { clientX: 325, clientY: 130, pointerId: 1, button: 0 });
    fireEvent.pointerMove(surface, { clientX: 415, clientY: 130, pointerId: 1 });
    expect(screen.getByText('Centre : 49° 00.000′ N — 006° 12.000′ W')).toBeVisible();
    fireEvent.pointerMove(surface, { clientX: 325, clientY: 130, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 325, clientY: 130, pointerId: 1 });
    fireEvent.click(surface);
    expect(add).not.toHaveBeenCalled();
  });

  it('accepts a touch tap but cancels multitouch, cancelled and off-map gestures', () => {
    const add = vi.fn();
    render(<SeaOperationWaypointMapEditor waypoints={[]} onAddWaypoint={add} />);
    const { surface } = activate();
    fireEvent.pointerDown(surface, { clientX: 325, clientY: 130, pointerId: 1, button: 0, pointerType: 'touch' });
    fireEvent.pointerDown(surface, { clientX: 340, clientY: 140, pointerId: 2, button: 0, pointerType: 'touch', isPrimary: false });
    fireEvent.pointerUp(surface, { clientX: 340, clientY: 140, pointerId: 2 });
    fireEvent.pointerUp(surface, { clientX: 325, clientY: 130, pointerId: 1 });
    fireEvent.pointerDown(surface, { clientX: 325, clientY: 130, pointerId: 3, button: 0 });
    fireEvent.pointerCancel(surface, { pointerId: 3 });
    fireEvent.pointerUp(surface, { clientX: 325, clientY: 130, pointerId: 3 });
    tap(surface, 98, 130, 4);
    expect(add).not.toHaveBeenCalled();
    tap(surface, 325, 130, 5, 'touch');
    expect(add).toHaveBeenCalledExactlyOnceWith({ latitude: 49, longitude: -3 });
  });

  it('supports keyboard pan and Enter, ignores repeated additions, and leaves button Enter to the native control', () => {
    const add = vi.fn();
    render(<SeaOperationWaypointMapEditor waypoints={[]} onAddWaypoint={add} />);
    const { surface } = activate();
    fireEvent.keyDown(surface, { key: 'ArrowRight' });
    fireEvent.keyDown(surface, { key: 'Enter', repeat: true });
    expect(add).not.toHaveBeenCalled();
    fireEvent.keyDown(surface, { key: 'Enter' });
    expect(add).toHaveBeenCalledOnce();
    expect(add.mock.calls[0][0].latitude).toBe(49);
    expect(add.mock.calls[0][0].longitude).toBeCloseTo(-.6);
    const centre = screen.getByRole('button', { name: 'Ajouter au centre' });
    fireEvent.keyDown(centre, { key: 'Enter' });
    expect(add).toHaveBeenCalledOnce();
    fireEvent.click(centre);
    expect(add).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(surface, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Placer les waypoints' })).toHaveFocus();
  });

  it('zooms and pans the view with accessible buttons without adding or intercepting wheel scrolling', () => {
    const add = vi.fn();
    render(<SeaOperationWaypointMapEditor waypoints={[]} onAddWaypoint={add} />);
    const { surface } = activate();
    fireEvent.click(screen.getByRole('button', { name: 'Zoomer sur la carte' }));
    fireEvent.click(screen.getByRole('button', { name: 'Déplacer la carte vers l’est' }));
    expect(screen.getByText('Centre : 49° 00.000′ N — 001° 24.000′ W')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Déplacer la carte vers le nord' }));
    fireEvent.click(screen.getByRole('button', { name: 'Déplacer la carte vers le sud' }));
    fireEvent.click(screen.getByRole('button', { name: 'Déplacer la carte vers l’ouest' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dézoomer la carte' }));
    expect(fireEvent.wheel(surface, { deltaY: 120, cancelable: true })).toBe(true);
    expect(add).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter au centre' }));
    expect(add.mock.calls[0][0].latitude).toBeCloseTo(49);
    expect(add.mock.calls[0][0].longitude).toBeCloseTo(-3);
  });

  it('explicitly disables every command and cancels an in-progress gesture when busy changes', () => {
    const add = vi.fn();
    const { rerender } = render(<SeaOperationWaypointMapEditor waypoints={[]} onAddWaypoint={add} />);
    const { surface } = activate();
    fireEvent.pointerDown(surface, { clientX: 325, clientY: 130, pointerId: 1, button: 0 });
    rerender(<SeaOperationWaypointMapEditor waypoints={[]} onAddWaypoint={add} disabled />);
    expect(screen.queryByRole('button', { name: 'Zone de placement des waypoints' })).not.toBeInTheDocument();
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
    fireEvent.pointerUp(surface, { clientX: 325, clientY: 130, pointerId: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter au centre' }));
    expect(add).not.toHaveBeenCalled();
    rerender(<SeaOperationWaypointMapEditor waypoints={[]} onAddWaypoint={add} />);
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Zone de placement des waypoints' }), { clientX: 325, clientY: 130, pointerId: 1 });
    expect(add).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter au centre' }));
    expect(add).toHaveBeenCalledOnce();
  });

  it('retains the locked longitude span and target on resize rather than refitting the route', () => {
    let onResize!: ResizeObserverCallback;
    vi.stubGlobal('ResizeObserver', class { constructor(callback: ResizeObserverCallback) { onResize = callback; } observe() {} disconnect() {} });
    const add = vi.fn();
    render(<SeaOperationWaypointMapEditor waypoints={[point(1), point(2, '48.36', '-4.53')]} onAddWaypoint={add} />);
    activate();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'manual' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter au centre' }));
    const originalCentre = add.mock.calls[0][0];
    act(() => onResize([{ contentRect: { width: 330 } } as ResizeObserverEntry], {} as ResizeObserver));
    expect(screen.getByRole('group', { name: /Carte du parcours/ })).toHaveAttribute('viewBox', '0 0 330 280');
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter au centre' }));
    expect(add.mock.calls[1][0]).toEqual(originalCentre);
  });

  it('ends placement with Escape from the surface or controls without closing its enclosing dialog', () => {
    const close = vi.fn();
    render(<AppDialog title="Opération en mer" onClose={close}><SeaOperationWaypointMapEditor waypoints={[]} onAddWaypoint={vi.fn()} /></AppDialog>);
    const { surface } = activate();
    fireEvent.keyDown(surface, { key: 'Escape' });
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Placer les waypoints' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Placer les waypoints' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Zoomer sur la carte' }), { key: 'Escape' });
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Placer les waypoints' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Placer les waypoints' }), { key: 'Escape' });
    expect(close).toHaveBeenCalledOnce();
  });

  it('accepts an immediate click at the same pixel after a view command instead of suppressing its new position', () => {
    const add = vi.fn();
    render(<SeaOperationWaypointMapEditor waypoints={[]} onAddWaypoint={add} />);
    const { surface } = activate();
    tap(surface, 437.5, 130);
    fireEvent.click(screen.getByRole('button', { name: 'Zoomer sur la carte' }));
    tap(surface, 437.5, 130, 2);
    expect(add).toHaveBeenCalledTimes(2);
    expect(add.mock.calls[0][0].longitude).toBe(1);
    expect(add.mock.calls[1][0].longitude).toBe(-1);
    fireEvent.click(screen.getByRole('button', { name: 'Déplacer la carte vers l’est' }));
    tap(surface, 437.5, 130, 3);
    expect(add).toHaveBeenCalledTimes(3);
    expect(add.mock.calls[2][0].longitude).toBeCloseTo(.6);
  });

  it('cancels a gesture and the pixel deduplication guard whenever the plotting dimensions change', () => {
    let onResize!: ResizeObserverCallback;
    vi.stubGlobal('ResizeObserver', class { constructor(callback: ResizeObserverCallback) { onResize = callback; } observe() {} disconnect() {} });
    const add = vi.fn();
    render(<SeaOperationWaypointMapEditor waypoints={[]} onAddWaypoint={add} />);
    const { surface } = activate();
    tap(surface);
    fireEvent.pointerDown(surface, { clientX: 325, clientY: 130, pointerId: 2, button: 0 });
    act(() => onResize([{ contentRect: { width: 330, height: 280 } } as ResizeObserverEntry], {} as ResizeObserver));
    fireEvent.pointerUp(surface, { clientX: 325, clientY: 130, pointerId: 2 });
    expect(add).toHaveBeenCalledOnce();
    tap(surface, 325, 130, 3);
    expect(add).toHaveBeenCalledTimes(2);
  });

  it('uses the SVG screen transform for accurate click coordinates even with viewport letterboxing', () => {
    const add = vi.fn();
    render(<SeaOperationWaypointMapEditor waypoints={[]} onAddWaypoint={add} />);
    const { surface, svg } = activate();
    const inverse = vi.fn(() => ({ inverseTransform: true }));
    const transform = vi.fn(() => ({ x: 675, y: 160 }));
    Object.defineProperty(svg, 'getScreenCTM', { configurable: true, value: () => ({ inverse }) });
    Object.defineProperty(svg, 'createSVGPoint', { configurable: true, value: () => ({ x: 0, y: 0, matrixTransform: transform }) });
    tap(surface, 400, 100);
    expect(inverse).toHaveBeenCalledOnce();
    expect(transform).toHaveBeenCalledWith({ inverseTransform: true });
    expect(add).toHaveBeenCalledExactlyOnceWith({ latitude: 49, longitude: 1 });
  });
});
