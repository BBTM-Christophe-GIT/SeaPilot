import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppDialog } from '../../components/AppDialog';
import type { SeaOperationWaypoint } from './seaOperationModel';
import type { SeaPosition } from './seaOperationNavigation';
import { SeaOperationWaypointMapEditor } from './SeaOperationWaypointMapEditor';
import { buildSeaOperationRouteMap, DEFAULT_ROUTE_MAP_VIEWPORT, routeMapPositionAt } from './seaOperationRouteMapGeometry';
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

describe('SeaOperationWaypointMapEditor', () => {
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
    const points = [point(1, 'invalid', ''), point(2), point(3, '50', '0')], original = structuredClone(points);
    const add = vi.fn(), move = vi.fn();
    const view = render(<SeaOperationWaypointMapEditor waypoints={points} onAddWaypoint={add} onMoveWaypoint={move} />);
    activate();
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
    const add = vi.fn();
    const view = render(<SeaOperationWaypointMapEditor waypoints={[]} onAddWaypoint={add} />);
    const { surface } = activate();
    const pixel = { x: 675, y: 100 };
    const expected = routeMapPositionAt(buildSeaOperationRouteMap([], 900, 320, { ...DEFAULT_ROUTE_MAP_VIEWPORT }), pixel.x, pixel.y)!;
    fireEvent.pointerDown(surface, { clientX: 437.5, clientY: 100, pointerId: 1, button: 0 });
    expect(fireEvent.wheel(surface, { deltaY: -120, clientX: 437.5, clientY: 100, cancelable: true })).toBe(false);
    fireEvent.pointerUp(surface, { clientX: 437.5, clientY: 100, pointerId: 1 });
    expect(add).not.toHaveBeenCalled();
    tap(surface, 437.5, 100, 2);
    expect(add).toHaveBeenCalledOnce();
    expect(add.mock.calls[0][0].latitude).toBeCloseTo(expected.latitude, 8);
    expect(add.mock.calls[0][0].longitude).toBeCloseTo(expected.longitude, 8);
    view.rerender(<SeaOperationWaypointMapEditor waypoints={[]} onAddWaypoint={add} disabled />);
    expect(fireEvent.wheel(surface, { deltaY: -120, clientX: 437.5, clientY: 100, cancelable: true })).toBe(true);
  });
  it('keeps gestures opt-in, shows a local background when empty, and ends placement explicitly', () => {
    const add = vi.fn();
    const { container } = render(<SeaOperationWaypointMapEditor waypoints={[]} onAddWaypoint={add} />);
    expect(screen.queryByRole('button', { name: 'Ajouter au centre' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Zone de placement des waypoints' })).not.toBeInTheDocument();
    expect(screen.getByText(/Renseignez une latitude/)).toBeVisible();
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

  it('appends controlled positions without recentering and only fits the route on request', () => {
    function ControlledEditor() {
      const [points, setPoints] = useState<SeaOperationWaypoint[]>([]);
      const add = (position: SeaPosition) => setPoints((previous) => [...previous, point(previous.length + 1, String(position.latitude), String(position.longitude))]);
      return <SeaOperationWaypointMapEditor waypoints={points} onAddWaypoint={add} />;
    }
    const { container } = render(<ControlledEditor />);
    const { surface } = activate();
    tap(surface);
    expect(container.querySelector('[data-point-indices="1"]')).toHaveAttribute('transform', 'translate(450 160)');
    tap(surface, 437.5, 130, 2);
    expect(screen.getByText('2 points géolocalisés')).toBeVisible();
    expect(container.querySelector('[data-point-indices="1"]')).toHaveAttribute('transform', 'translate(450 160)');
    expect(container.querySelector('[data-point-indices="2"]')).toHaveAttribute('transform', 'translate(675 160)');
    fireEvent.click(screen.getByRole('button', { name: 'Cadrer le parcours' }));
    expect(container.querySelector('[data-point-indices="1"]')).not.toHaveAttribute('transform', 'translate(450 160)');
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
