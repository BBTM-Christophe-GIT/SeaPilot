import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SeaOperationWaypoint } from './seaOperationModel';
import { SeaOperationRouteMap } from './SeaOperationRouteMap';
import { projectSeaOperationMapPlace, resolveSeaOperationMapPorts, SEA_OPERATION_MAP_PORT_CATALOG } from './seaOperationMapPlaces';
import { formatProjectPort } from '../projects/projectPorts';
import { buildSeaOperationRouteMap, DEFAULT_ROUTE_MAP_VIEWPORT } from './seaOperationRouteMapGeometry';
import { SEA_OPERATION_ISOLATED_POINT_ICONS } from './seaOperationIsolatedPointIcons';
import { seaOperationMapExtraPositions } from './seaOperationMapLayers';
import { seaOperationZoneAppearance } from './seaOperationZonePresentation';

function point(index: number, latitude: string, longitude: string, number = `WP${index}`): SeaOperationWaypoint {
  return { id: `point-${index}`, number, descriptionVhf: `Description du point ${index}`, latitude, longitude, eta: '', ukc: '', denseTraffic: false };
}
const channelRoute = () => [point(1, '49.65', '-1.62'), point(2, '48.36', '-4.53'), point(3, '50.37', '-4.14')];

afterEach(() => { vi.unstubAllGlobals(); });

describe('SeaOperationRouteMap', () => {
  it.each(SEA_OPERATION_ISOLATED_POINT_ICONS)('renders the shared green $label SVG with its recorded isolated point number in compact documents', icon => {
    const invalid = { ...point(1, '', ''), id: 'invalid', number: '' };
    const isolated = { ...point(2, '49.65', '-1.62'), number: '  B04  ', isolatedPointIcon: icon.value, descriptionVhf: 'Balise de contrôle' };
    const original = structuredClone(isolated);
    const { container } = render(<SeaOperationRouteMap waypoints={[]} isolatedPoints={[invalid, isolated]} compact />);
    const marker = container.querySelector('[data-isolated-point-id="point-2"]')!;
    expect(marker.querySelector('.so-route-map-isolated-ordinal')).toHaveTextContent('B04');
    expect([...marker.querySelectorAll('text')].map(text => text.textContent)).toEqual(['B04']);
    expect(marker.querySelector('.so-route-map-isolated-ordinal')).not.toHaveTextContent('P2');
    expect(marker).toHaveAttribute('aria-label', expect.stringContaining('Point isolé 2 : B04 · Balise de contrôle'));
    expect(marker.querySelector('title')).toHaveTextContent(`B04 · Balise de contrôle · ${icon.label}`);
    const svg = marker.querySelector('.so-route-map-isolated-icon')!;
    expect(svg).toHaveAttribute('stroke', 'currentColor'); expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
    expect([...svg.querySelectorAll('path')].map(path => path.getAttribute('d'))).toEqual(icon.paths.map(path => path.d));
    expect(marker.querySelector(':scope > rect')).toBeNull(); expect(container.querySelector('image')).toBeNull();
    expect(isolated).toEqual(original);
  });

  it('keeps the legacy square with a custom number, bounds long visual labels and falls back to the original ordinal when blank', () => {
    const isolated = { ...point(2, '49.65', '-1.62'), number: 'B04' };
    const { container, rerender } = render(<SeaOperationRouteMap waypoints={[]} isolatedPoints={[{ ...point(1, '', ''), number: '' }, isolated]} />);
    const marker = () => container.querySelector('[data-isolated-point-id="point-2"]')!;
    expect(marker().querySelector(':scope > rect')).not.toBeNull(); expect(marker().querySelector('.so-route-map-isolated-ordinal')).toHaveTextContent('B04');
    expect(marker().querySelector('.so-route-map-point-label')).toBeNull();
    rerender(<SeaOperationRouteMap waypoints={[]} isolatedPoints={[{ ...point(1, '', ''), number: '' }, { ...isolated, number: '   ' }]} />);
    expect(marker().querySelector('.so-route-map-isolated-ordinal')).toHaveTextContent('P2');
    const longNumber = 'BALISE-'.repeat(11).slice(0, 80);
    rerender(<SeaOperationRouteMap waypoints={[]} isolatedPoints={[{ ...isolated, number: longNumber, isolatedPointIcon: 'anchor' }]} />);
    expect(marker().querySelector('.so-route-map-isolated-ordinal')!.textContent).toBe(`${longNumber.slice(0, 17)}…`);
    expect(marker().querySelector('title')).toHaveTextContent(longNumber); expect(marker()).toHaveAttribute('aria-label', expect.stringContaining(longNumber));
  });

  it('changes only isolated marker rendering when an icon is selected, preserving the route, zones and port symbols', () => {
    const route = channelRoute(), isolated = { ...point(4, '49.7', '-1.4'), number: 'B04' };
    const zones = [{ id: 'zone', name: 'Zone conservée', vertices: [{ latitude: '49.7', longitude: '-1.4' }, { latitude: '49.8', longitude: '-1.4' }, { latitude: '49.75', longitude: '-1.3' }] }];
    const { container, rerender } = render(<SeaOperationRouteMap waypoints={route} isolatedPoints={[isolated]} zones={zones} departurePort="Cherbourg" />);
    const layers = () => ['.so-route-map-track', '.so-route-map-points', '.so-route-map-zones', '.so-route-map-zone-vertices', '.so-route-map-defined-ports'].map(selector => container.querySelector(selector)!.innerHTML);
    const before = layers();
    rerender(<SeaOperationRouteMap waypoints={route} isolatedPoints={[{ ...isolated, isolatedPointIcon: 'platform' }]} zones={zones} departurePort="Cherbourg" />);
    expect(layers()).toEqual(before);
  });

  it('widens a compact document only when requested to contain complete zones, preserving its saved manual frame', () => {
    const route = [point(1, '49.93', '1.08'), point(2, '49.99', '1.02'), point(3, '50.15', '1.13')];
    const viewport = { centerLatitude: 50.05, centerLongitude: 1.2, longitudeSpan: 1.7 };
    const zones = [{ id: 'z1', name: 'Zone nord', vertices: [{ latitude: '50.22', longitude: '1.02' }, { latitude: '50.26', longitude: '1.16' }, { latitude: '50.17', longitude: '1.24' }] }];
    const original = structuredClone({ route, viewport, zones }), onGeometry = vi.fn();
    const { container, rerender } = render(<SeaOperationRouteMap waypoints={route} zones={zones} viewport={viewport} compact onGeometry={onGeometry} />);
    const polygon = () => container.querySelector('.so-route-map-zones polygon')!.getAttribute('points')!.split(' ').map(point => point.split(',').map(Number));
    expect(polygon().some(([, y]) => y < 0)).toBe(true);
    expect(onGeometry.mock.calls.at(-1)![0].viewport.longitudeSpan).toBe(1.7);
    rerender(<SeaOperationRouteMap waypoints={route} zones={zones} viewport={viewport} compact ensureZonesVisible onGeometry={onGeometry} />);
    expect(polygon().every(([x, y]) => x >= 40 && x <= 860 && y >= 31.99 && y <= 188.01)).toBe(true);
    const adapted = onGeometry.mock.calls.at(-1)![0].viewport;
    expect(adapted.longitudeSpan).toBeGreaterThan(1.7); expect(adapted.centerLatitude).toBe(50.05); expect(adapted.centerLongitude).toBeCloseTo(1.2, 10);
    expect(container.querySelectorAll('.so-route-map-zone-vertices circle')).toHaveLength(3);
    expect(container.querySelector('.so-route-map-zone-vertices')).toHaveTextContent('Z1.1');
    expect({ route, viewport, zones }).toEqual(original);
    rerender(<SeaOperationRouteMap waypoints={route} zones={zones} viewport={viewport} onGeometry={onGeometry} />);
    expect(onGeometry.mock.calls.at(-1)![0].viewport.longitudeSpan).toBe(1.7);
  });

  it('does not expand a document for an incomplete or duplicate-only polygon', () => {
    const viewport = { centerLatitude: 50, centerLongitude: 1, longitudeSpan: 1 };
    const onGeometry = vi.fn();
    const vertices = [{ latitude: '60', longitude: '1' }, { latitude: '61', longitude: '1' }];
    const { container } = render(<SeaOperationRouteMap waypoints={[]} zones={[{ id: 'incomplete', name: 'Inachevée', vertices }, { id: 'duplicate', name: 'Doublons', vertices: [...vertices, vertices[0]] }]} viewport={viewport} compact ensureZonesVisible onGeometry={onGeometry} />);
    expect(onGeometry.mock.calls.at(-1)![0].viewport).toEqual(viewport);
    expect(container.querySelectorAll('.so-route-map-zones polygon')).toHaveLength(0);
  });

  it('uses separated document zone tags with original ordinals and keeps complete names in the legend and accessibility text', () => {
    const route = [point(1, '49.93', '1.08'), point(2, '49.99', '1.02'), point(3, '50.15', '1.13')];
    const vertices = [{ latitude: '50.12', longitude: '1.1' }, { latitude: '50.18', longitude: '1.1' }, { latitude: '50.15', longitude: '1.19' }];
    const zones = [{ id: 'unfinished', name: 'Inachevée', vertices: vertices.slice(0, 2) }, { id: 'a', name: 'Première zone de travaux détaillée', vertices }, { id: 'b', name: 'Deuxième zone de travaux détaillée', vertices }];
    const viewport = { centerLatitude: 50.05, centerLongitude: 1.2, longitudeSpan: 1.7 }, onGeometry = vi.fn();
    const { container, rerender } = render(<SeaOperationRouteMap waypoints={route} zones={zones} viewport={viewport} compact ensureZonesVisible onGeometry={onGeometry} />);
    const tags = [...container.querySelectorAll('.so-route-map-zone-tag')];
    expect(tags.map(tag => [...tag.querySelectorAll('text tspan')].map(line => line.textContent).join(' '))).toEqual(['Première zone de travaux détaillée', 'Deuxième zone de travaux détaillée']);
    expect(tags.map(tag => tag.getAttribute('data-zone-code'))).toEqual(['Z2', 'Z3']);
    const anchors = tags.map(tag => { const line = tag.querySelector('line')!; return { x: Number(line.getAttribute('x1')), y: Number(line.getAttribute('y1')) }; });
    const projectedVertices = [...container.querySelectorAll('.so-route-map-zone-vertices circle')].map(circle => ({ x: Number(circle.getAttribute('cx')), y: Number(circle.getAttribute('cy')) }));
    expect(anchors.every(anchor => projectedVertices.some(vertex => vertex.x === anchor.x && vertex.y === anchor.y))).toBe(true);
    expect(Math.hypot(anchors[0].x - anchors[1].x, anchors[0].y - anchors[1].y)).toBeGreaterThan(20);
    const boxes = tags.map(tag => { const rect = tag.querySelector('rect')!; return { x: Number(rect.getAttribute('x')), y: Number(rect.getAttribute('y')), width: Number(rect.getAttribute('width')), height: Number(rect.getAttribute('height')) }; });
    expect(boxes[0].x + boxes[0].width <= boxes[1].x || boxes[1].x + boxes[1].width <= boxes[0].x || boxes[0].y + boxes[0].height <= boxes[1].y || boxes[1].y + boxes[1].height <= boxes[0].y).toBe(true);
    const waypoint = onGeometry.mock.calls.at(-1)![0].points[2];
    for (const box of boxes) expect(waypoint.x >= box.x && waypoint.x <= box.x + box.width && waypoint.y >= box.y && waypoint.y <= box.y + box.height).toBe(false);
    const legend = screen.getByLabelText('Légende des zones');
    expect(legend).toHaveTextContent('Z2 — Première zone de travaux détaillée'); expect(legend).toHaveTextContent('Z3 — Deuxième zone de travaux détaillée');
    expect(legend).not.toHaveTextContent('Z1'); expect(legend).not.toHaveTextContent('Inachevée');
    expect(screen.getByRole('img', { name: 'Zone : Première zone de travaux détaillée' }).querySelector('title')).toHaveTextContent('Première zone de travaux détaillée');
    expect(container.querySelector('.so-route-map-zone-vertices')).toHaveTextContent('Z2.1');
    rerender(<SeaOperationRouteMap waypoints={route} zones={zones} viewport={viewport} />);
    expect(container.querySelectorAll('.so-route-map-zone-tag')).toHaveLength(2);
    expect(container.querySelector('.so-route-map-zones')).toHaveTextContent('Première zone de travaux détaillée');
    expect(screen.getByLabelText('Légende des zones')).toHaveTextContent('Z2 — Première zone de travaux détaillée');
  });

  it.each([false, true])('keeps nested zone outlines, codes and colours legible on every shared map without altering its geometry (compact=%s)', compact => {
    const route = [point(1, '50.02', '1.02'), point(2, '50.1', '1.1'), point(3, '50.15', '1.13')];
    const inner = [{ latitude: '50.08', longitude: '1.08' }, { latitude: '50.12', longitude: '1.08' }, { latitude: '50.12', longitude: '1.12' }, { latitude: '50.08', longitude: '1.12' }];
    const outer = [{ latitude: '50.04', longitude: '1.04' }, { latitude: '50.16', longitude: '1.04' }, { latitude: '50.16', longitude: '1.16' }, { latitude: '50.04', longitude: '1.16' }];
    const zones = [{ id: 'incomplete', name: 'Incomplète', vertices: inner.slice(0, 2) }, { id: 'inner', name: 'Zone intérieure détaillée', vertices: inner }, { id: 'outer', name: 'Zone extérieure détaillée', vertices: outer }];
    const original = structuredClone({ route, zones }), onGeometry = vi.fn();
    const { container } = render(<SeaOperationRouteMap waypoints={route} zones={zones} compact={compact} onGeometry={onGeometry} />);
    expect([...container.querySelectorAll('.so-route-map-zone-fills path')].map(path => path.getAttribute('data-zone-code'))).toEqual(['Z3', 'Z2']);
    const fills = container.querySelector('.so-route-map-zone-fills')!, outlines = container.querySelector('.so-route-map-zone-outlines')!;
    expect(fills.compareDocumentPosition(outlines) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const tagBoxes = [...container.querySelectorAll('.so-route-map-zone-tag rect')].map(rect => ({ west: Number(rect.getAttribute('x')), east: Number(rect.getAttribute('x')) + Number(rect.getAttribute('width')), north: Number(rect.getAttribute('y')), south: Number(rect.getAttribute('y')) + Number(rect.getAttribute('height')) }));
    expect(tagBoxes).toHaveLength(2); expect(tagBoxes[0].west < tagBoxes[1].east && tagBoxes[0].east > tagBoxes[1].west && tagBoxes[0].north < tagBoxes[1].south && tagBoxes[0].south > tagBoxes[1].north).toBe(false);
    for (const index of [1, 2]) {
      const appearance = seaOperationZoneAppearance(index), outline = container.querySelector(`.so-route-map-zone-outlines [data-zone-code="${appearance.code}"]`) as SVGElement;
      expect(outline.style.stroke).toBe(`rgb(${appearance.rgb.join(', ')})`);
      expect((container.querySelector(`.so-route-map-zone-fills [data-zone-code="${appearance.code}"]`) as SVGElement).style.fill).toBe(`rgb(${appearance.fillRgb.join(', ')})`);
      expect((container.querySelector(`.so-route-map-zone-tag[data-zone-code="${appearance.code}"]`) as SVGElement).style.color).toBe(`rgb(${appearance.rgb.join(', ')})`);
      const legendCode = within(screen.getByLabelText('Légende des zones')).getByText(appearance.code);
      expect(legendCode).toHaveStyle({ color: appearance.stroke });
    }
    expect(container.querySelectorAll('.so-route-map-zone-vertices circle')).toHaveLength(10);
    expect(container.querySelectorAll('.so-route-map-zone-vertices text').length).toBeLessThan(10);
    const vertexLabels = [...container.querySelectorAll('.so-route-map-zone-vertices text')].map(text => {
      const x = Number(text.getAttribute('x')), y = Number(text.getAttribute('y')), width = (text.textContent?.length || 0) * 6 + 4;
      return { west: text.getAttribute('text-anchor') === 'end' ? x - width : x, east: text.getAttribute('text-anchor') === 'end' ? x : x + width, north: y - 11, south: y + 2 };
    });
    const overlap = (a: typeof tagBoxes[number], b: typeof tagBoxes[number]) => a.west < b.east && a.east > b.west && a.north < b.south && a.south > b.north;
    vertexLabels.forEach((label, index) => { expect(tagBoxes.some(tag => overlap(label, tag))).toBe(false); expect(vertexLabels.slice(index + 1).some(other => overlap(label, other))).toBe(false); });
    expect([...container.querySelectorAll('.so-route-map-zone-vertices circle')].map(circle => (circle as SVGElement).style.fill)).toEqual([0, 0, 1, 1, 1, 1, 2, 2, 2, 2].map(index => `rgb(${seaOperationZoneAppearance(index).rgb.join(', ')})`));
    expect(container.querySelector('.so-route-map-zones')!.querySelectorAll('text')).toHaveLength(0);
    expect(screen.getByLabelText('Légende des zones')).toHaveTextContent('Z2 — Zone intérieure détaillée');
    expect(onGeometry.mock.calls.at(-1)![0]).toEqual(buildSeaOperationRouteMap(route, 900, compact ? 220 : 320, undefined, seaOperationMapExtraPositions([], zones)));
    expect({ route, zones }).toEqual(original);
  });

  it('keeps an empty automatic editor cheap until an explicit temporary placement viewport is supplied', () => {
    const onGeometry = vi.fn();
    const { container, rerender } = render(<SeaOperationRouteMap waypoints={[]} onGeometry={onGeometry} renderOverlay={() => <rect role="button" aria-label="Ajouter le premier waypoint" />} />);
    expect(container.querySelector('.so-route-map-svg')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ajouter le premier waypoint' })).not.toBeInTheDocument();
    rerender(<SeaOperationRouteMap waypoints={[]} viewport={DEFAULT_ROUTE_MAP_VIEWPORT} onGeometry={onGeometry} renderOverlay={() => <rect role="button" aria-label="Ajouter le premier waypoint" />} />);
    expect(screen.getByRole('button', { name: 'Ajouter le premier waypoint' })).toBeInTheDocument();
    expect(onGeometry.mock.calls.at(-1)![0]).toMatchObject({ viewport: DEFAULT_ROUTE_MAP_VIEWPORT, points: [], segments: [] });
    expect(container.querySelector('.so-route-map-point')).toBeNull();
    rerender(<SeaOperationRouteMap waypoints={[]} onGeometry={onGeometry} />);
    expect(container.querySelector('.so-route-map-svg')).toBeNull();
    rerender(<SeaOperationRouteMap waypoints={[]} compact onGeometry={onGeometry} renderOverlay={() => <rect />} />);
    expect(container.querySelector('.so-route-map-svg')).toBeNull();
    rerender(<SeaOperationRouteMap waypoints={[]} departurePort="Cherbourg" onGeometry={onGeometry} renderOverlay={() => <rect />} />);
    expect(onGeometry.mock.calls.at(-1)![0].viewport.longitudeSpan).toBeLessThan(1);
    expect(screen.getByRole('img', { name: /Départ : .*Cherbourg/ })).toBeInTheDocument();
  });
  it.each([false, true])('frames and displays the defined ports even without regional places (compact=%s)', compact => {
    const onGeometry = vi.fn(), route = [point(1, '49.65', '-1.62'), point(2, '49.66', '-1.60')];
    const { container } = render(<SeaOperationRouteMap waypoints={route} departurePort="Cherbourg" arrivalPort="Brest" compact={compact} onGeometry={onGeometry} showRouteLegs={!compact} maxSpeedKnots={12} />);
    expect(screen.getByRole('img', { name: /Départ : .*Cherbourg/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Arrivée : .*Brest/ })).toBeInTheDocument();
    expect(container.querySelectorAll('.so-route-map-defined-ports .so-route-map-port-dot')).toHaveLength(2);
    expect(container.querySelector('.so-route-map-places-layer')).toBeNull();
    expect(container.querySelectorAll('.so-route-map-track line')).toHaveLength(1);
    const geometry = onGeometry.mock.calls.at(-1)![0];
    expect(geometry.points.map((point: { index: number }) => point.index)).toEqual([1, 2]);
    for (const port of resolveSeaOperationMapPorts('Cherbourg', 'Brest').ports) expect(projectSeaOperationMapPlace(geometry, port.location)).not.toBeNull();
  });
  it('shows a ports-only map, groups identical endpoints and reports unresolved ports without inventing positions', () => {
    const { container, rerender } = render(<SeaOperationRouteMap waypoints={[]} departurePort="Cherbourg" arrivalPort="Cherbourg" compact />);
    expect(screen.getByRole('img', { name: /Départ \/ Arrivée : .*Cherbourg/ })).toBeInTheDocument();
    expect(container.querySelectorAll('.so-route-map-defined-ports .so-route-map-port-dot')).toHaveLength(1);
    expect(container.querySelector('.so-route-map-track line')).toBeNull(); expect(container.querySelector('.so-route-map-point')).toBeNull();
    rerender(<SeaOperationRouteMap waypoints={[]} departurePort="Port de Saint-Pierre" arrivalPort="Millbay Docks" />);
    expect(screen.getByRole('status')).toHaveTextContent('plusieurs ports correspondent');
    expect(screen.getByRole('status')).toHaveTextContent('position propre non disponible');
    expect(container.querySelector('.so-route-map-svg')).toBeNull();
  });
  it('keeps defined ports distinct from regional port markers instead of drawing duplicate dots', () => {
    const { container } = render(<SeaOperationRouteMap waypoints={[]} departurePort="Cherbourg" arrivalPort="Brest" showPlaces />);
    const position = (circle: Element) => `${circle.getAttribute('cx')}:${circle.getAttribute('cy')}`;
    const defined = new Set([...container.querySelectorAll('.so-route-map-defined-ports .so-route-map-port-dot')].map(position));
    expect(defined.size).toBe(2);
    expect([...container.querySelectorAll('.so-route-map-ports .so-route-map-port-dot')].every(circle => !defined.has(position(circle)))).toBe(true);
  });
  it('keeps navigation totals independent of ports and respects the saved manual frame in compact previews', () => {
    const route = channelRoute(), onGeometry = vi.fn();
    const { rerender } = render(<SeaOperationRouteMap waypoints={route} showRouteLegs maxSpeedKnots={12} etd="2026-10-27T10:00" />);
    const summary = screen.getByRole('complementary', { name: 'Estimation du parcours' }).textContent;
    rerender(<SeaOperationRouteMap waypoints={route} departurePort="Cherbourg" arrivalPort="Portsmouth" showRouteLegs maxSpeedKnots={12} etd="2026-10-27T10:00" />);
    expect(screen.getByRole('complementary', { name: 'Estimation du parcours' }).textContent).toBe(summary);
    const viewport = { centerLatitude: 49.65, centerLongitude: -1.62, longitudeSpan: .02 };
    rerender(<SeaOperationRouteMap waypoints={route} departurePort="Cherbourg" arrivalPort="Brest" compact viewport={viewport} onGeometry={onGeometry} />);
    const retained = onGeometry.mock.calls.at(-1)![0].viewport;
    expect(retained.centerLatitude).toBe(viewport.centerLatitude); expect(retained.longitudeSpan).toBe(viewport.longitudeSpan);
    expect(retained.centerLongitude).toBeCloseTo(viewport.centerLongitude, 10);
    expect(screen.getByRole('status')).toHaveTextContent('Brest — hors du cadre conservé');
  });
  it('keeps a short route visible beside the voyage summary instead of covering its arrival', () => {
    const onGeometry = vi.fn();
    const points = [point(1, '49.65', '-1.64'), point(2, '49.655', '-1.62'), point(3, '49.65', '-1.60')];
    render(<SeaOperationRouteMap waypoints={points} showRouteLegs maxSpeedKnots={12} onGeometry={onGeometry} />);
    const map = onGeometry.mock.calls.at(-1)![0] as ReturnType<typeof import('./seaOperationRouteMapGeometry').buildSeaOperationRouteMap>;
    expect(map.points).toHaveLength(3);
    expect(map.points.every(point => point.x > 30 && point.x < map.width - 264 - 25)).toBe(true);
    expect(map.segments).toHaveLength(2);
    expect(screen.getByLabelText('Estimation du parcours')).toBeInTheDocument();
  });

  it('shows routes, isolated points and valid zones together without including overlays in travel totals', () => {
    const route = [point(1, '0', '0'), point(2, '0', '1')];
    const isolated = [{ ...point(3, '0', '4'), descriptionVhf: 'Inspection isolée', denseTraffic: true }];
    const zones = [{ id: 'zone', name: 'Travaux', vertices: [{ latitude: '-0.2', longitude: '2' }, { latitude: '0.2', longitude: '2' }, { latitude: '0', longitude: '2.5' }] }];
    const original = structuredClone({ route, isolated, zones });
    const { container, rerender } = render(<SeaOperationRouteMap waypoints={route} showRouteLegs maxSpeedKnots={12} />);
    const summary = screen.getByRole('complementary', { name: 'Estimation du parcours' }).textContent;
    rerender(<SeaOperationRouteMap waypoints={route} isolatedPoints={isolated} zones={zones} showRouteLegs maxSpeedKnots={12} />);
    expect(container.querySelectorAll('.so-route-map-track line')).toHaveLength(1);
    expect(container.querySelectorAll('.so-route-map-isolated-points > g')).toHaveLength(1);
    expect(container.querySelectorAll('.so-route-map-zones polygon')).toHaveLength(1);
    expect(screen.getByRole('img', { name: 'Vigilance : trafic dense, risque de collision · Point isolé 1 : WP3' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Estimation du parcours' }).textContent).toBe(summary);
    expect(container.querySelector('desc')).toHaveTextContent('Inspection isolée'); expect(container.querySelector('desc')).toHaveTextContent('Zone : Travaux');
    expect({ route, isolated, zones }).toEqual(original);
  });
  it('frames overlays alone, keeps clipped zones visible and never closes incomplete or duplicate drafts', () => {
    const zone = { id: 'zone', name: 'Zone cadrée', vertices: [{ latitude: '-1', longitude: '-1' }, { latitude: '1', longitude: '-1' }, { latitude: '1', longitude: '1' }, { latitude: '-1', longitude: '1' }] };
    const { container, rerender } = render(<SeaOperationRouteMap waypoints={[]} zones={[zone]} viewport={{ centerLatitude: 0, centerLongitude: 0, longitudeSpan: .5 }} />);
    expect(container.querySelector('.so-route-map-zones polygon')).not.toBeNull();
    expect(container.querySelector('.so-route-map-track line')).toBeNull();
    rerender(<SeaOperationRouteMap waypoints={[]} zones={[{ ...zone, vertices: [zone.vertices[0], zone.vertices[1], zone.vertices[0]] }]} />);
    expect(container.querySelector('.so-route-map-svg')).not.toBeNull(); expect(container.querySelector('.so-route-map-zones polygon')).toBeNull();
    rerender(<SeaOperationRouteMap waypoints={[]} isolatedPoints={[point(1, '49', '-2')]} compact />);
    expect(container.querySelector('.so-route-map-svg')).not.toBeNull(); expect(container.querySelectorAll('.so-route-map-isolated-points > g')).toHaveLength(1);
  });
  it('adds vigilance beside the original numbered waypoint without changing its label, coordinates or source', () => {
    const points = [point(1, '', ''), point(2, '49.65', '-1.62'), point(3, '50', '0')];
    points[1].denseTraffic = true;
    const original = structuredClone(points);
    const { container, rerender } = render(<SeaOperationRouteMap waypoints={points} showWaypointCoordinates />);
    const badge = screen.getByRole('img', { name: 'Vigilance : trafic dense, risque de collision · Waypoint 2' });
    expect(badge).toHaveClass('so-route-map-point-vigilance'); expect(badge.querySelector('.lucide-eye')).not.toBeNull();
    const pin = container.querySelector('[data-point-indices="2"]')!;
    const transform = pin.getAttribute('transform');
    expect(pin.querySelector('.so-route-map-ordinal')).toHaveTextContent('2');
    expect(pin.querySelector('.so-route-map-point-label')).toHaveTextContent('WP2');
    expect(pin.querySelector('.so-route-map-point-coordinates')).toHaveTextContent('49° 39.000′ N');
    expect(pin.querySelector('title')).toHaveTextContent('Vigilance : trafic dense, risque de collision · Waypoint 2');
    expect(container.querySelectorAll('.so-route-map-point-vigilance')).toHaveLength(1);
    const circle = badge.querySelector('circle')!;
    expect(Math.abs(Number(circle.getAttribute('cx')))).toBeGreaterThan(23);
    expect(circle).toHaveAttribute('cy', '0');
    expect(points).toEqual(original);
    rerender(<SeaOperationRouteMap waypoints={points.map(point => ({ ...point, denseTraffic: false }))} showWaypointCoordinates />);
    expect(container.querySelector('.so-route-map-point-vigilance')).toBeNull();
    expect(container.querySelector('[data-point-indices="2"]')).toHaveAttribute('transform', transform);
    expect(container.querySelector('desc')).not.toHaveTextContent('trafic dense');
  });

  it.each([false, true])('gives coincident dense waypoints a single eye and global accessible description (compact=%s)', (compact) => {
    const points = [point(1, '', ''), point(2, '49.65', '-1.62'), point(3, '49.65', '-1.62'), point(4, '49.65', '-1.62')];
    points[0].denseTraffic = true; points[1].denseTraffic = true; points[3].denseTraffic = true;
    const { container } = render(<SeaOperationRouteMap waypoints={points} compact={compact} fillAvailableSpace={!compact} showWaypointCoordinates />);
    expect(container.querySelectorAll('.so-route-map-point-vigilance')).toHaveLength(1);
    const badge = container.querySelector('.so-route-map-point-vigilance')!;
    expect(badge).toHaveAttribute('aria-label', 'Vigilance : trafic dense, risque de collision · Waypoints 2, 4');
    expect(badge.querySelector('title')).toHaveTextContent('Waypoints 2, 4');
    expect(container.querySelector('.so-route-map-ordinal')).toHaveTextContent('2/3/4');
    const map = container.querySelector('.so-route-map-svg')!;
    expect(map).toHaveAccessibleDescription(/Vigilance : trafic dense, risque de collision · Waypoints 2, 4/);
    expect(container.querySelector('desc')).not.toHaveTextContent('Waypoints 1');
  });

  it.each(['-2.75', '-2.28'])('keeps the vigilance eye clear of names and coordinates near the lower map edge at latitude %s', (latitude) => {
    const waypoint = point(1, latitude, '0'); waypoint.denseTraffic = true;
    const { container } = render(<SeaOperationRouteMap waypoints={[waypoint]} showWaypointCoordinates viewport={{ centerLatitude: 0, centerLongitude: 0, longitudeSpan: 16 }} />);
    const badge = container.querySelector('.so-route-map-point-vigilance')!;
    const coordinateY = Number(container.querySelector('.so-route-map-point-coordinates')!.getAttribute('y'));
    const badgeY = Number(badge.querySelector('circle')!.getAttribute('cy'));
    expect(badgeY).toBe(-44); expect(badgeY + 10).toBeLessThan(-29);
    expect(badgeY + 10).toBeLessThan(coordinateY - 10);
  });

  it('shows total elapsed days, hours and minutes while keeping each leg compact', () => {
    render(<SeaOperationRouteMap waypoints={[point(1, '0', '0'), point(2, '0', '1')]} showRouteLegs maxSpeedKnots={12} etd="2026-10-27T08:00" eta="2026-10-29T11:50" />);
    const summary = screen.getByRole('complementary', { name: 'Estimation du parcours' });
    expect(summary).toHaveTextContent('2 jours 3 heures 50 minutes');
    expect(summary).toHaveTextContent('27/10/2026 – 08:00');
    expect(summary).toHaveTextContent('29/10/2026 – 11:50');
    expect(screen.getByRole('img', { name: 'Waypoint 1 vers 2 : 60,0 NM · 07:30' })).toBeInTheDocument();
  });

  it('previews a dragged route while preserving controlled metrics, labels and layout until release', () => {
    const points = channelRoute(), original = structuredClone(points), report = vi.fn();
    const viewport = { centerLatitude: 49, centerLongitude: -3, longitudeSpan: 16 };
    const { container, rerender } = render(<SeaOperationRouteMap waypoints={points} showPlaces showWaypointCoordinates showRouteLegs maxSpeedKnots={12} viewport={viewport} onGeometry={report} />);
    const transform = container.querySelector('[data-point-indices="2"]')!.getAttribute('transform');
    const metrics = container.querySelector('.so-route-map-leg-summary')!.innerHTML;
    const summary = screen.getByRole('complementary', { name: 'Estimation du parcours' }).innerHTML;
    const places = container.querySelector('.so-route-map-places')!.innerHTML;
    rerender(<SeaOperationRouteMap waypoints={points} showPlaces showWaypointCoordinates showRouteLegs maxSpeedKnots={12} viewport={viewport} onGeometry={report} previewWaypoint={{ id: points[1].id, position: { latitude: 51, longitude: -3 } }} />);
    expect(container.querySelector('[data-point-indices="2"]')!.getAttribute('transform')).not.toBe(transform);
    expect(container.querySelector('[data-point-indices="2"] .so-route-map-point-coordinates')).toHaveTextContent('51° 00.000′ N');
    expect(container.querySelector('.so-route-map-leg-summary')!.innerHTML).toBe(metrics);
    expect(screen.getByRole('complementary', { name: 'Estimation du parcours' }).innerHTML).toBe(summary);
    expect(container.querySelector('.so-route-map-places')!.innerHTML).toBe(places);
    expect(report).toHaveBeenCalledOnce(); expect(points).toEqual(original);
  });

  it('shows leg distances, elapsed duration and Paris ETD/estimated ETA without changing waypoint ETA', () => {
    const points = [point(1, '0', '0'), point(2, '0', '1')]; points[1].eta = '2026-10-27T19:15';
    const original = structuredClone(points);
    const { container } = render(<SeaOperationRouteMap waypoints={points} showRouteLegs maxSpeedKnots={12} etd="2026-10-27T10:00" />);
    expect(screen.getByRole('img', { name: 'Waypoint 1 vers 2 : 60,0 NM · 07:30' })).toBeInTheDocument();
    const summary = screen.getByRole('complementary', { name: 'Estimation du parcours' });
    expect(summary).toHaveTextContent('60,0 NM'); expect(summary).toHaveTextContent('7 heures 30 minutes');
    expect(summary).toHaveTextContent('27/10/2026 – 10:00'); expect(summary).toHaveTextContent('27/10/2026 – 17:30');
    expect(summary).toHaveTextContent('ETA estimée');
    expect(container.querySelector('.so-route-map-leg-summary')).toHaveTextContent('Estimations à 8 nd');
    expect(container.querySelector('.so-route-map-leg-summary')).toHaveTextContent('60 % de la vitesse maximale');
    expect(points).toEqual(original);
  });

  it('uses a compact leg list on narrow maps and reports unavailable duration/ETA instead of inventing speed', () => {
    let resize!: ResizeObserverCallback;
    vi.stubGlobal('ResizeObserver', class { constructor(callback: ResizeObserverCallback) { resize = callback; } observe() {} disconnect() {} });
    const { container } = render(<SeaOperationRouteMap waypoints={[point(1, '0', '0'), point(2, '0', '1')]} showRouteLegs etd="2026-10-27T10:00" />);
    act(() => resize([{ contentRect: { width: 330 } } as ResizeObserverEntry], {} as ResizeObserver));
    expect(container.querySelector('.so-route-map-leg-labels')).toBeNull();
    expect(screen.getByRole('list', { name: 'Distances et durées entre les waypoints' })).toHaveTextContent('1 → 2');
    expect(screen.getByRole('list', { name: 'Distances et durées entre les waypoints' })).toHaveTextContent('60,0 NM · Durée indisponible');
    const summary = screen.getByRole('complementary', { name: 'Estimation du parcours' });
    expect(summary).toHaveTextContent('ETD27/10/2026 – 10:00'); expect(summary).toHaveTextContent('ETA estiméeIndisponible');
    expect(container.querySelector('.so-route-map-leg-summary')).toHaveTextContent('durée indisponible sans vitesse maximale du navire');
    expect(summary.closest('.so-route-map-frame')).toBeNull();
    expect(summary.parentElement).toBe(screen.getByRole('figure'));
    expect(summary).toHaveClass('is-below-map');
    expect(screen.getAllByRole('complementary', { name: 'Estimation du parcours' })).toHaveLength(1);
  });

  it('retains the supplied arrival time instead of replacing a manually adjusted final waypoint ETA', () => {
    render(<SeaOperationRouteMap waypoints={[point(1, '0', '0'), point(2, '0', '1')]} showRouteLegs maxSpeedKnots={12} etd="2026-10-27T10:00" eta="2026-10-27T19:15" />);
    const summary = screen.getByRole('complementary', { name: 'Estimation du parcours' });
    expect(summary).toHaveTextContent('9 heures 15 minutes'); expect(summary).toHaveTextContent('60,0 NM');
    expect(summary).toHaveTextContent('ETA arrivée27/10/2026 – 19:15');
    expect(summary).not.toHaveTextContent('17:30');
  });

  it('shows constant-speed transit duration before departure is entered without inventing dates', () => {
    render(<SeaOperationRouteMap waypoints={[point(1, '0', '0'), point(2, '0', '1')]} showRouteLegs maxSpeedKnots={12} />);
    const summary = screen.getByRole('complementary', { name: 'Estimation du parcours' });
    expect(summary).toHaveTextContent('60,0 NM'); expect(summary).toHaveTextContent('7 heures 30 minutes');
    expect(summary).toHaveTextContent('Durée estimée à vitesse constante.');
    expect(summary).toHaveTextContent('ETDÀ renseigner'); expect(summary).toHaveTextContent('ETA estiméeIndisponible');
    expect(summary.textContent).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it('keeps an invalid retained arrival unavailable while clearly qualifying the transit-duration fallback', () => {
    render(<SeaOperationRouteMap waypoints={[point(1, '0', '0'), point(2, '0', '1')]} showRouteLegs maxSpeedKnots={12} etd="2026-10-27T10:00" eta="2026-10-27T09:00" />);
    const summary = screen.getByRole('complementary', { name: 'Estimation du parcours' });
    expect(summary).toHaveTextContent('7 heures 30 minutes'); expect(summary).toHaveTextContent('Durée estimée à vitesse constante.');
    expect(summary).toHaveTextContent('ETA arrivéeIndisponible'); expect(summary).not.toHaveTextContent('17:30');
  });

  it('offers only genuinely located regional ports as explicit choices and keeps compact export free of new controls', () => {
    const select = vi.fn();
    const { container, rerender } = render(<SeaOperationRouteMap waypoints={[]} showPlaces viewport={{ centerLatitude: 49, centerLongitude: -3, longitudeSpan: 16 }} onPortSelect={select} />);
    fireEvent.click(screen.getByText(/^Ports dans cette région/));
    const port = SEA_OPERATION_MAP_PORT_CATALOG.find(item => item.port.port === 'Port de Barfleur')!;
    fireEvent.click(screen.getByRole('button', { name: `Ajouter le port ${formatProjectPort(port.port)} comme waypoint` }));
    expect(select).toHaveBeenCalledExactlyOnceWith([expect.objectContaining({ key: port.key, location: port.location })]);
    const unlocated = screen.queryByRole('list', { name: 'Ports rattachés sans position propre' });
    if (unlocated) expect(within(unlocated).queryByRole('button')).not.toBeInTheDocument();
    rerender(<SeaOperationRouteMap waypoints={channelRoute()} compact showPlaces showRouteLegs maxSpeedKnots={12} etd="2026-10-27T10:00" onPortSelect={select} />);
    expect(container.querySelector('.so-route-map-voyage-summary')).toBeNull();
    expect(container.querySelector('.so-route-map-leg-labels')).toBeNull();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it('draws a local north-up route with ordered markers, directions, coasts and attribution', () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const { container } = render(<SeaOperationRouteMap waypoints={channelRoute()} />);
    expect(screen.getByRole('heading', { name: 'Carte du parcours' })).toBeVisible();
    expect(screen.getByText('3 points géolocalisés')).toBeVisible();
    expect(screen.getByRole('img', { name: 'Carte du parcours · 3 points géolocalisés' })).toBeInTheDocument();
    expect([...container.querySelectorAll('.so-route-map-point')].map((marker) => marker.getAttribute('data-point-indices'))).toEqual(['1', '2', '3']);
    expect(container.querySelectorAll('.so-route-map-track line')).toHaveLength(2);
    expect(container.querySelectorAll('.so-route-map-direction')).toHaveLength(2);
    expect(container.querySelectorAll('.so-route-map-land polygon').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.so-route-map-grid line').length).toBeGreaterThan(0);
    expect(container.querySelector('.so-route-map-point.is-start')).toHaveAttribute('data-point-indices', '1');
    expect(container.querySelector('.so-route-map-point.is-end')).toHaveAttribute('data-point-indices', '3');
    expect(screen.getByText('N', { selector: 'text' })).toBeInTheDocument();
    expect(screen.getByText('Départ')).toBeVisible();
    expect(screen.getByText('Arrivée')).toBeVisible();
    expect(screen.getByText('Numéros : ordre du tableau')).toBeVisible();
    expect(screen.getByText('Fond Natural Earth · Tracé indicatif')).toBeVisible();
    expect(container.querySelector('.so-sea-state')).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('omits invalid positions explicitly and leaves a break instead of connecting across a missing point', () => {
    const points = channelRoute(); points[1].latitude = '';
    const { container } = render(<SeaOperationRouteMap waypoints={points} />);
    expect(screen.getByText('2 points géolocalisés')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('1 point sans coordonnées valides n’est pas représenté');
    expect([...container.querySelectorAll('.so-route-map-point')].map((marker) => marker.getAttribute('data-point-indices'))).toEqual(['1', '3']);
    expect(container.querySelectorAll('.so-route-map-track line')).toHaveLength(0);
  });

  it('keeps true table ordinals and does not invent a departure when the first position is missing', () => {
    const points = channelRoute(); points[0].longitude = 'invalide';
    const { container } = render(<SeaOperationRouteMap waypoints={points} />);
    expect(container.querySelector('.so-route-map-point.is-start')).toBeNull();
    expect(container.querySelector('.so-route-map-point.is-end')).toHaveAttribute('data-point-indices', '3');
    expect(container.querySelectorAll('.so-route-map-track line')).toHaveLength(1);
  });

  it('combines coincident departure and arrival ordinals without hiding either point', () => {
    const points = channelRoute(); points[2] = point(3, points[0].latitude, points[0].longitude, 'Retour au port');
    const { container } = render(<SeaOperationRouteMap waypoints={points} />);
    expect(screen.getByText('3 points géolocalisés')).toBeVisible();
    expect(container.querySelectorAll('.so-route-map-point')).toHaveLength(2);
    const shared = container.querySelector('.so-route-map-point[data-point-indices="1/3"]');
    expect(shared).toHaveClass('is-start', 'is-end');
    expect(shared).toHaveTextContent('1/3');
    expect(shared?.querySelector('title')).toHaveTextContent('WP1');
    expect(shared?.querySelector('title')).toHaveTextContent('Retour au port');
  });

  it('renders a coordinate prompt for an empty route and a single point without an arrival ring', () => {
    const { container, rerender } = render(<SeaOperationRouteMap waypoints={[]} />);
    expect(screen.getByText('0 points géolocalisés')).toBeVisible();
    expect(screen.getByText(/Renseignez une latitude et une longitude valides/)).toBeVisible();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    rerender(<SeaOperationRouteMap waypoints={[point(1, '49.65', '-1.62')]} />);
    expect(screen.getByText('1 point géolocalisé')).toBeVisible();
    expect(container.querySelector('.so-route-map-point.is-start')).toBeInTheDocument();
    expect(container.querySelector('.so-route-map-point.is-end')).toBeNull();
    expect(container.querySelectorAll('.so-route-map-track line')).toHaveLength(0);
  });

  it('refreshes recorded positions and labels without mutating the source route', () => {
    const points = channelRoute().map((value) => Object.freeze(value));
    Object.freeze(points);
    const { container, rerender } = render(<SeaOperationRouteMap waypoints={points} />);
    const initial = container.querySelector('.so-route-map-point[data-point-indices="1"]')?.getAttribute('transform');
    rerender(<SeaOperationRouteMap waypoints={[{ ...points[0], latitude: '52.5', number: 'Nouveau point' }, points[1], points[2]]} />);
    expect(container.querySelector('.so-route-map-point[data-point-indices="1"]')?.getAttribute('transform')).not.toBe(initial);
    expect(container.querySelector('.so-route-map-point[data-point-indices="1"] title')).toHaveTextContent('Nouveau point');
    expect(points[0].latitude).toBe('49.65');
  });

  it('adapts the plotting coordinates to a narrow container and disconnects its observer', () => {
    let onResize!: ResizeObserverCallback;
    const disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { onResize = callback; }
      observe() {}
      disconnect = disconnect;
    });
    const { unmount } = render(<SeaOperationRouteMap waypoints={channelRoute()} />);
    act(() => onResize([{ contentRect: { width: 330 } } as ResizeObserverEntry], {} as ResizeObserver));
    expect(screen.getByRole('img')).toHaveAttribute('viewBox', '0 0 330 280');
    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('offers the same route and attribution in the compact print layout', () => {
    const { container } = render(<SeaOperationRouteMap waypoints={channelRoute()} compact />);
    expect(screen.getByRole('figure')).toHaveClass('is-compact');
    expect(screen.getByRole('img')).toHaveAttribute('viewBox', '0 0 900 220');
    expect(container.querySelectorAll('.so-route-map-point')).toHaveLength(3);
    expect(screen.getByText('Fond Natural Earth · Tracé indicatif')).toBeInTheDocument();
  });

  it('accepts a locked empty viewport and an opt-in overlay without adding built-in controls', () => {
    const report = vi.fn();
    render(<SeaOperationRouteMap waypoints={[]} viewport={{ centerLatitude: 49, centerLongitude: -3, longitudeSpan: 16 }} onGeometry={report} renderOverlay={(geometry) => <text>Centre {geometry.viewport?.centerLongitude}</text>} />);
    expect(screen.getByRole('group', { name: 'Carte du parcours · 0 points géolocalisés' })).toBeInTheDocument();
    expect(screen.getByText('Centre -3')).toBeInTheDocument();
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ width: 900, viewport: { centerLatitude: 49, centerLongitude: -3, longitudeSpan: 16 } }));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('ignores placement overlays and locked viewports in compact print mode', () => {
    const overlay = vi.fn();
    render(<SeaOperationRouteMap waypoints={channelRoute()} compact viewport={{ centerLatitude: 0, centerLongitude: 0, longitudeSpan: 16 }} renderOverlay={overlay} />);
    expect(screen.getByRole('img')).toHaveAttribute('viewBox', '0 0 900 220');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(overlay).not.toHaveBeenCalled();
  });

  it('uses both exact measured dimensions when filling the available map frame', () => {
    let onResize!: ResizeObserverCallback;
    vi.stubGlobal('ResizeObserver', class { constructor(callback: ResizeObserverCallback) { onResize = callback; } observe() {} disconnect() {} });
    const report = vi.fn();
    render(<SeaOperationRouteMap waypoints={channelRoute()} fillAvailableSpace onGeometry={report} />);
    act(() => onResize([{ contentRect: { width: 1440.5, height: 681.25 } } as ResizeObserverEntry], {} as ResizeObserver));
    expect(screen.getByRole('img')).toHaveAttribute('viewBox', '0 0 1440.5 681.25');
    expect(screen.getByRole('figure')).toHaveClass('is-filling');
    expect(report).toHaveBeenLastCalledWith(expect.objectContaining({ width: 1440.5, height: 681.25 }));
  });

  it('keeps compact print dimensions independent of a fullscreen frame request', () => {
    render(<SeaOperationRouteMap waypoints={channelRoute()} compact fillAvailableSpace />);
    expect(screen.getByRole('figure')).not.toHaveClass('is-filling');
    expect(screen.getByRole('img')).toHaveAttribute('viewBox', '0 0 900 220');
  });

  it('shows cities, port markers and the complete regional project-port list only when explicitly enabled', () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const { container } = render(<SeaOperationRouteMap waypoints={[]} showPlaces viewport={{ centerLatitude: 49, centerLongitude: -3, longitudeSpan: 16 }} />);
    expect(container.querySelector('.so-route-map-cities')).toHaveTextContent('Paris');
    expect(container.querySelectorAll('.so-route-map-port-dot').length).toBeGreaterThan(30);
    expect(container.querySelector('.so-route-map-port title')).toHaveTextContent(/point de référence indicatif/);
    const list = screen.getByRole('list', { name: 'Ports du catalogue dans le cadre affiché', hidden: true });
    expect(within(list).getAllByRole('listitem', { hidden: true }).length).toBeGreaterThan(30);
    expect(list).toHaveTextContent(/Cherbourg/);
    expect(screen.getByText(/Catalogue partagé avec Projets/)).toBeInTheDocument();
    expect(screen.getByText(/Couverture partielle et précision non garantie/)).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('prints no new places or coordinate labels even when editor-only options are requested', () => {
    const { container, rerender } = render(<SeaOperationRouteMap waypoints={channelRoute()} showPlaces showWaypointCoordinates compact />);
    expect(container.querySelector('.so-route-map-cities')).not.toBeInTheDocument();
    expect(container.querySelector('.so-route-map-places')).not.toBeInTheDocument();
    expect(container.querySelector('.so-route-map-point-coordinates')).not.toBeInTheDocument();
    rerender(<SeaOperationRouteMap waypoints={channelRoute()} />);
    expect(container.querySelector('.so-route-map-cities')).not.toBeInTheDocument();
  });

  it('labels marker positions in degrees and minutes using original table indices after missing rows', () => {
    const points = channelRoute(); points[0].latitude = '';
    const { container } = render(<SeaOperationRouteMap waypoints={points} showWaypointCoordinates />);
    const labels = container.querySelectorAll('.so-route-map-point-coordinates'); expect(labels).toHaveLength(2);
    expect(container.querySelector('[data-point-indices="2"] .so-route-map-point-coordinates')).toHaveTextContent('48° 21.600′ N');
    expect(container.querySelector('[data-point-indices="2"] .so-route-map-point-coordinates')).toHaveTextContent('004° 31.800′ W');
    expect(container.querySelector('[data-point-indices="3"] .so-route-map-point-coordinates')).toHaveTextContent('50° 22.200′ N');
    expect(points[1].latitude).toBe('48.36');
  });
});
