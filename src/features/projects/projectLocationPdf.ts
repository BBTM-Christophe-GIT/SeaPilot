import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { buildSeaOperationRouteMap, routeMapViewportContainingPositions, type SeaOperationRouteMapGeometry } from '../seaOperations/seaOperationRouteMapGeometry';
import { projectSeaOperationMapPlace, resolveSeaOperationMapPorts, seaOperationMapPlaces, type SeaOperationResolvedMapPort } from '../seaOperations/seaOperationMapPlaces';
import { seaWaypointPosition } from '../seaOperations/seaOperationNavigation';
import { buildSeaOperationRouteLegs, formatSeaOperationVoyageDuration, seaOperationVoyageTiming } from '../seaOperations/seaOperationRouteLegs';
import { passagePlanCellData } from '../seaOperations/seaOperationPassagePlan';
import { formatSeaLatitude, formatSeaLongitude } from '../seaOperations/seaOperationCoordinates';
import { seaOperationRouteArrivalEta } from '../seaOperations/seaOperationVoyageSummary';
import { seaOperationMapLayers, seaOperationZonePositions } from '../seaOperations/seaOperationMapLayers';
import { parseProjectLocationPlan, hasProjectLocationContent, type ProjectLocationPlan, type ProjectLocationOverlay } from './projectLocation';
import type { SeaOperationWaypoint } from '../seaOperations/seaOperationModel';
import { drawSeaOperationIsolatedPointPdf } from '../seaOperations/seaOperationIsolatedPointPdf';

const BLUE = [12, 85, 152] as const;
const MUTED = [82, 102, 121] as const;
const pale = [255, 250, 240] as const;
const clean = (value: string) => value.replace(/[′’]/g, "'").replace(/[–—−]/g, '-').replace(/…/g, '...').replace(/\u00a0|\u202f/g, ' ');
const value = (text: string) => clean(text.trim() || '—');

export interface ProjectLocationPdfOptions {
  projectLabel: string;
  vesselName?: string;
  maxSpeedKnots?: number | null;
  draftMeters?: number | null;
  language?: 'fr' | 'en';
  departurePort?: string;
  arrivalPort?: string;
}
type LocationGeometry = Pick<ProjectLocationPlan, 'waypoints' | 'points' | 'zones' | 'mapViewport'>;

/** Named voyage endpoints are contextual markers, never extra navigation legs. */
export function drawDefinedMapPortsPdf(document: jsPDF, geometry: SeaOperationRouteMapGeometry,
  bounds: { x: number; y: number; width: number; height: number }, ports: readonly SeaOperationResolvedMapPort[], labelRightInset = 0) {
  const unit = (points: number) => points / document.internal.scaleFactor;
  document.saveGraphicsState();
  for (const port of ports) {
    const pixel = projectSeaOperationMapPlace(geometry, port.location);
    if (!pixel) continue;
    const x = bounds.x + pixel.x / geometry.width * bounds.width, y = bounds.y + pixel.y / geometry.height * bounds.height;
    document.setFillColor(...BLUE); document.setDrawColor(255, 255, 255); document.setLineWidth(unit(.9));
    document.circle(x, y, unit(2.7), 'FD');
    document.setFont('helvetica', 'bold'); document.setFontSize(6.5);
    const maximumWidth = Math.min(unit(150), bounds.width - labelRightInset - unit(12));
    const lines = document.splitTextToSize(clean(`${port.roleLabel} : ${port.port.port}`), maximumWidth) as string[];
    const textWidth = Math.max(...lines.map(line => document.getTextWidth(line)));
    const labelX = Math.max(bounds.x + unit(4), Math.min(x + unit(7), bounds.x + bounds.width - labelRightInset - textWidth - unit(4)));
    const overlapsWaypoint = geometry.points.some(point => Math.hypot(point.x - pixel.x, point.y - pixel.y) < 28);
    const labelY = Math.max(bounds.y + unit(9), Math.min(y + unit(overlapsWaypoint ? 18 : -6), bounds.y + bounds.height - unit(lines.length * 8 + 2)));
    document.setFillColor(255, 255, 255); document.rect(labelX - unit(2), labelY - unit(7), textWidth + unit(4), unit(lines.length * 8 + 2), 'F');
    document.setTextColor(...BLUE); document.text(lines, labelX, labelY, { lineHeightFactor: 1.2 });
  }
  document.restoreGraphicsState();
}

/** All three layers share a viewport, but only the ordered route creates navigation legs. */
export function projectLocationMapPositions(location: Pick<ProjectLocationOverlay, 'points' | 'zones'>) {
  return [...location.points.map(seaWaypointPosition), ...location.zones.flatMap(zone => zone.vertices.map(seaWaypointPosition))]
    .filter((position): position is NonNullable<typeof position> => position !== null);
}

export function projectLocationVoyage(location: Pick<ProjectLocationPlan, 'waypoints' | 'etd'>, maxSpeedKnots?: number | null) {
  const route = buildSeaOperationRouteLegs(location.waypoints, maxSpeedKnots);
  const timing = seaOperationVoyageTiming(location.waypoints[0]?.eta || location.etd, route.totalDurationMinutes,
    seaOperationRouteArrivalEta(location));
  return { route, timing, duration: formatSeaOperationVoyageDuration(timing.durationMinutes ?? route.totalDurationMinutes) };
}

/** Vector-only situational map, shared by project appendices and imported SeaOps overlays. */
export function drawProjectLocationMapPdf(document: jsPDF, location: LocationGeometry, bounds: { x: number; y: number; width: number; height: number },
  options?: { etd?: string; maxSpeedKnots?: number | null; showVoyage?: boolean; departurePort?: string; arrivalPort?: string; ensureZonesVisible?: boolean }) {
  const unit = (points: number) => points / document.internal.scaleFactor;
  const fitRightInset = options?.showVoyage && location.waypoints.length > 1
    ? (Math.min(bounds.width - unit(12), unit(200)) + unit(12)) / bounds.width * 900 : 0;
  const definedPorts = resolveSeaOperationMapPorts(options?.departurePort, options?.arrivalPort);
  const mapHeight = Math.max(160, 900 * bounds.height / bounds.width);
  const viewport = options?.ensureZonesVisible ? routeMapViewportContainingPositions(location.mapViewport,
    location.zones.flatMap(zone => seaOperationZonePositions(zone) || []), 900, mapHeight) : location.mapViewport;
  const geometry = buildSeaOperationRouteMap(location.waypoints, 900, mapHeight, viewport,
    [...projectLocationMapPositions(location), ...definedPorts.ports.map(port => port.location)], fitRightInset);
  const at = (point: { x: number; y: number }) => ({ x: bounds.x + point.x / geometry.width * bounds.width, y: bounds.y + point.y / geometry.height * bounds.height });
  const projected = (position: { latitude: number; longitude: number }) => {
    const point = projectSeaOperationMapPlace(geometry, position);
    return point ? at(point) : null;
  };
  const write = (text: string, x: number, y: number, size = 7, align: 'left' | 'right' | 'center' = 'left') => {
    document.setFont('helvetica', 'normal'); document.setFontSize(size); document.text(clean(text), x, y, { align });
  };
  document.saveGraphicsState();
  document.setFillColor(236, 246, 251); document.setDrawColor(190, 208, 219); document.setLineWidth(unit(.6));
  document.rect(bounds.x, bounds.y, bounds.width, bounds.height, 'FD');
  document.rect(bounds.x, bounds.y, bounds.width, bounds.height, null); document.clip(); document.discardPath();
  if (!geometry.projection) {
    document.setTextColor(...MUTED); write('Aucun point géolocalisé', bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, 9, 'center');
    document.restoreGraphicsState(); return geometry;
  }
  document.setFillColor(226, 233, 220);
  for (const polygon of geometry.land) {
    if (polygon.length < 3) continue;
    document.path([...polygon.map((point, index) => ({ op: index ? 'l' : 'm', c: [at(point).x, at(point).y] })), { op: 'h', c: [] }]); document.fill();
  }
  document.setDrawColor(202, 216, 226); document.setTextColor(...MUTED); document.setLineWidth(unit(.35));
  for (const line of geometry.grid) {
    const from = at(line.from), to = at(line.to), label = at(line.labelAt);
    document.line(from.x, from.y, to.x, to.y); write(line.label, label.x, label.y, 6);
  }
  const zoneLayers = seaOperationMapLayers(geometry, [], location.zones).polygons;
  const vertexPixels = zoneLayers.flatMap(({ vertices }) => vertices.map(at));
  const occupiedLabels = geometry.points.map(point => {
    const pixel = at(point); return { left: pixel.x - unit(10), right: pixel.x + unit(10), top: pixel.y - unit(10), bottom: pixel.y + unit(10) };
  });
  let vertexLabelCount = 0;
  const zoneLabel = (label: string, position: { x: number; y: number }, size: number) => {
    document.setFont('helvetica', 'normal'); document.setFontSize(size);
    const textWidth = document.getTextWidth(label), padding = unit(1.5), textHeight = unit(size);
    const overlaps = (a: { left: number; right: number; top: number; bottom: number }, b: typeof a) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const candidates = [5, 11, 18].flatMap(distance => {
      const gap = unit(distance); return [[gap, -gap], [-gap - textWidth, -gap], [gap, gap + textHeight], [-gap - textWidth, gap + textHeight]];
    })
      .map(([dx, dy]) => {
        const x = Math.max(bounds.x + padding, Math.min(position.x + dx, bounds.x + bounds.width - textWidth - padding));
        const y = Math.max(bounds.y + textHeight + padding, Math.min(position.y + dy, bounds.y + bounds.height - padding));
        const rect = { left: x - padding, right: x + textWidth + padding, top: y - textHeight - padding, bottom: y + padding };
        const score = occupiedLabels.filter(other => overlaps(rect, other)).length * 1000
          + vertexPixels.filter(point => point.x >= rect.left - unit(2) && point.x <= rect.right + unit(2) && point.y >= rect.top - unit(2) && point.y <= rect.bottom + unit(2)).length * 100
          + Math.hypot(x + textWidth / 2 - position.x, y - textHeight / 2 - position.y);
        return { x, y, rect, score };
      });
    const selected = candidates.reduce((best, candidate) => candidate.score < best.score ? candidate : best);
    occupiedLabels.push(selected.rect);
    document.setFillColor(255, 255, 255);
    document.rect(selected.rect.left, selected.rect.top, selected.rect.right - selected.rect.left, selected.rect.bottom - selected.rect.top, 'F');
    document.setTextColor(...BLUE); write(label, selected.x, selected.y, size);
  };
  // Draw every fill before the outlines so overlapping zones remain distinguishable.
  for (const { vertices } of zoneLayers) {
    const positions = vertices.map(at);
    document.setFillColor(216, 231, 244);
    document.path([...positions.map((position, index) => ({ op: index ? 'l' : 'm', c: [position.x, position.y] })), { op: 'h', c: [] }]); document.fill();
  }
  for (const { zone, vertices } of zoneLayers) {
    const positions = vertices.map(at), zoneNumber = location.zones.findIndex(item => item.id === zone.id) + 1;
    document.setDrawColor(...BLUE); document.setLineWidth(unit(.9));
    document.path([...positions.map((position, index) => ({ op: index ? 'l' : 'm', c: [position.x, position.y] })), { op: 'h', c: [] }]); document.stroke();
    if (options?.ensureZonesVisible) positions.forEach((position, vertexIndex) => {
      document.setFillColor(...BLUE); document.circle(position.x, position.y, unit(1.8), 'F');
      // Large plans retain every table row and vertex; a bounded label budget keeps the map legible.
      if (vertexLabelCount++ < 120) zoneLabel(`Z${zoneNumber}.${vertexIndex + 1}`, position, 5.5);
    });
    const center = { x: positions.reduce((sum, position) => sum + position.x, 0) / positions.length, y: positions.reduce((sum, position) => sum + position.y, 0) / positions.length };
    if (options?.ensureZonesVisible) zoneLabel(`Z${zoneNumber}`, center, 7);
    else { document.setTextColor(...BLUE); write(zone.name || 'Zone', center.x, center.y, 7, 'center'); }
  }
  const places = seaOperationMapPlaces(geometry, definedPorts.ports.flatMap(port => {
    const position = projectSeaOperationMapPlace(geometry, port.location); return position ? [position] : [];
  }));
  for (const city of places.cities.slice(0, 50)) {
    const point = at(city), label = at(city.label); document.setFillColor(37, 129, 95); document.circle(point.x, point.y, unit(1.5), 'F');
    document.setTextColor(...MUTED); write(city.name, label.x, label.y, 5.5, city.label.anchor === 'end' ? 'right' : 'left');
  }
  for (const port of places.markers.slice(0, 80)) {
    if (definedPorts.ports.some(defined => defined.key === `${port.location.source}:${port.location.sourceId}`)) continue;
    const point = at(port); document.setFillColor(...BLUE); document.circle(point.x, point.y, unit(1.4), 'F');
    if (port.label) { const label = at(port.label); document.setTextColor(...MUTED); write(port.ports[0].port.port, label.x, label.y, 5.5, port.label.anchor === 'end' ? 'right' : 'left'); }
  }
  document.setDrawColor(...BLUE); document.setLineWidth(unit(1.3));
  for (const segment of geometry.segments) { const from = at(segment.from), to = at(segment.to); document.line(from.x, from.y, to.x, to.y); }
  const voyage = projectLocationVoyage({ waypoints: location.waypoints, etd: options?.etd || '' }, options?.maxSpeedKnots);
  if (options?.showVoyage) for (const leg of voyage.route.legs.slice(0, 20)) {
    const from = geometry.points.find(point => point.index === leg.fromIndex), to = geometry.points.find(point => point.index === leg.toIndex);
    if (!from || !to) continue;
    const a = at(from), b = at(to), text = `${leg.distanceLabel} · ${leg.durationLabel || 'Durée indisponible'}`;
    const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2 - unit(5);
    document.setFontSize(6); const width = document.getTextWidth(clean(text)) + unit(6);
    if (x - width / 2 < bounds.x + unit(2) || x + width / 2 > bounds.x + bounds.width - unit(2) || y < bounds.y + unit(10)) continue;
    document.setFillColor(255, 255, 255); document.setDrawColor(209, 220, 230); document.roundedRect(x - width / 2, y - unit(7), width, unit(11), unit(2), unit(2), 'FD');
    document.setTextColor(...BLUE); write(text, x, y, 6, 'center');
  }
  const groups = new Map<string, typeof geometry.points>();
  for (const point of geometry.points) { if (point.x < 0 || point.x > geometry.width || point.y < 0 || point.y > geometry.height) continue; const key = `${point.x}:${point.y}`; groups.set(key, [...(groups.get(key) || []), point]); }
  for (const group of groups.values()) {
    const point = at(group[0]), ordinal = group.length > 4 ? `${group[0].index}/.../${group.at(-1)!.index}` : group.map(item => item.index).join('/'), start = group.some(item => item.index === 1);
    if (start) document.setFillColor(...BLUE); else document.setFillColor(255, 255, 255);
    document.setDrawColor(...BLUE); document.setLineWidth(unit(.8));
    document.setFontSize(7); document.setFont('helvetica', 'bold'); const width = Math.min(unit(110), Math.max(unit(13), document.getTextWidth(ordinal) + unit(8)));
    const markerX = Math.max(bounds.x + unit(3), Math.min(point.x - width / 2, bounds.x + bounds.width - width - unit(3)));
    document.roundedRect(markerX, point.y - unit(7), width, unit(14), unit(7), unit(7), 'FD');
    if (start) document.setTextColor(255, 255, 255); else document.setTextColor(...BLUE);
    document.text(ordinal, markerX + width / 2, point.y + unit(2.4), { align: 'center' });
    if (group.some(item => location.waypoints[item.index - 1]?.denseTraffic)) {
      const eyeX = Math.min(bounds.x + bounds.width - unit(7), point.x + width / 2 + unit(10));
      document.setFillColor(...pale); document.setDrawColor(138, 97, 0); document.roundedRect(eyeX - unit(6), point.y - unit(5), unit(12), unit(10), unit(3), unit(3), 'FD');
      document.ellipse(eyeX, point.y, unit(4), unit(2.5), 'S'); document.setFillColor(138, 97, 0); document.circle(eyeX, point.y, unit(1), 'F');
    }
  }
  location.points.forEach((point, index) => {
    const position = seaWaypointPosition(point), p = position && projected(position); if (!p) return;
    drawSeaOperationIsolatedPointPdf(document, point, index + 1, { x: p.x, y: p.y, left: bounds.x, right: bounds.x + bounds.width, top: bounds.y, bottom: bounds.y + bounds.height });
    if (point.denseTraffic) {
      const x = Math.min(bounds.x + bounds.width - unit(7), p.x + unit(14));
      document.setDrawColor(138, 97, 0); document.setFillColor(...pale);
      document.roundedRect(x - unit(6), p.y - unit(5), unit(12), unit(10), unit(3), unit(3), 'FD');
      document.ellipse(x, p.y, unit(4), unit(2.5), 'S'); document.setFillColor(138, 97, 0); document.circle(x, p.y, unit(1), 'F');
    }
  });
  drawDefinedMapPortsPdf(document, geometry, bounds, definedPorts.ports,
    options?.showVoyage && location.waypoints.length > 1 ? Math.min(bounds.width - unit(12), unit(200)) + unit(12) : 0);
  if (options?.showVoyage && location.waypoints.length > 1) {
    const width = Math.min(bounds.width - unit(12), unit(200)), height = unit(67), x = bounds.x + bounds.width - width - unit(6), y = bounds.y + bounds.height - height - unit(6);
    document.setFillColor(255, 255, 255); document.setDrawColor(209, 220, 230); document.roundedRect(x, y, width, height, unit(3), unit(3), 'FD');
    document.setTextColor(...BLUE); document.setFont('helvetica', 'bold'); document.setFontSize(8);
    document.text(clean(voyage.route.totalDistanceLabel || 'Distance indisponible'), x + unit(7), y + unit(12));
    const duration = document.splitTextToSize(clean(voyage.duration || 'Durée indisponible'), width - unit(14));
    document.setFontSize(7); document.text(duration, x + unit(7), y + unit(23));
    document.setTextColor(...MUTED); write(`ETD : ${voyage.timing.etdLabel || 'À renseigner'}`, x + unit(7), y + unit(44), 6.5);
    write(`ETA : ${voyage.timing.etaLabel || 'Indisponible'}`, x + unit(7), y + unit(57), 6.5);
  }
  document.setTextColor(...BLUE); write('N', bounds.x + bounds.width - unit(12), bounds.y + unit(12), 8, 'center');
  if (geometry.scale) {
    const length = Math.abs(at(geometry.scale.to).x - at(geometry.scale.from).x);
    const x = bounds.x + unit(14), y = bounds.y + bounds.height - unit(22);
    document.setDrawColor(...MUTED); document.setLineWidth(unit(.6)); document.line(x, y, x + length, y);
    write(geometry.scale.label, x + length / 2, y - unit(4), 6, 'center');
  }
  document.restoreGraphicsState(); return geometry;
}

export async function generateProjectLocationPdf(plan: ProjectLocationPlan, options: ProjectLocationPdfOptions): Promise<Uint8Array> {
  const document = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4', compress: true });
  const left = 30, width = document.internal.pageSize.getWidth() - left * 2, pageHeight = document.internal.pageSize.getHeight();
  document.setProperties({ title: `Annexe Localisation - ${options.projectLabel}`, creator: 'SeaPilot' });
  document.setFont('helvetica', 'bold'); document.setFontSize(14); document.setTextColor(...BLUE);
  document.text(options.language === 'en' ? 'APPENDIX - LOCATION / PASSAGE PLAN' : 'ANNEXE - LOCALISATION / PASSAGE PLAN', left, 32);
  document.setFont('helvetica', 'normal'); document.setFontSize(9); document.setTextColor(...MUTED);
  document.text(clean(`${options.projectLabel}${options.vesselName ? ` · ${options.vesselName}` : ''}`), left, 48);
  drawProjectLocationMapPdf(document, plan, { x: left, y: 60, width, height: 190 }, { etd: plan.etd, maxSpeedKnots: options.maxSpeedKnots, showVoyage: true, departurePort: options.departurePort, arrivalPort: options.arrivalPort });
  document.setFontSize(6.5); document.setTextColor(...MUTED);
  document.text('Fond Natural Earth · Tracé indicatif · Distances directes, sans routage · Coordonnées WGS84', left, 260);
  let y = 274;
  if (plan.charts) {
    const lines = document.splitTextToSize(clean(`Cartes marines : ${plan.charts}`), width) as string[];
    for (const line of lines) { if (y > pageHeight - 35) { document.addPage(); y = 34; } document.text(line, left, y); y += 9; }
    y += 3;
  }
  const table = (title: string, points: readonly SeaOperationWaypoint[], isolated = false) => {
    if (!points.length) return;
    if (y > pageHeight - 90) { document.addPage(); y = 34; }
    document.setFont('helvetica', 'bold'); document.setFontSize(9); document.setTextColor(...BLUE); document.text(title, left, y); y += 8;
    const rows = isolated
      ? points.map((point, index) => [point.number || String(index + 1), point.descriptionVhf || `Point isolé ${index + 1}`, formatSeaLatitude(point.latitude), formatSeaLongitude(point.longitude)])
      : points.map(point => passagePlanCellData(point, { allowLiveRadio: true })).map(row => [row.waypoint, row.description, row.latitude, row.longitude, row.ukc, row.eta, row.vhf, 'À actualiser dans Opérations en mer', row.denseTraffic === 'Oui' ? 'Trafic dense' : 'Non']);
    autoTable(document, { startY: y, margin: { left, right: left, top: 30, bottom: 26 }, theme: 'grid',
      head: [isolated ? ['Point', 'Description', 'Latitude', 'Longitude'] : ['Waypoint', 'Description', 'Latitude', 'Longitude', 'UKC', 'ETA\nDate - Heure', 'Contacts VHF', 'Météo à l’ETA', 'Trafic dense']],
      body: rows.map(row => row.map(clean)),
      styles: { font: 'helvetica', fontSize: 7, cellPadding: 4, valign: 'middle', halign: 'center', lineColor: [209, 220, 230], lineWidth: .35, overflow: 'linebreak' },
      headStyles: { fillColor: [246, 249, 252], textColor: [12, 85, 152], fontStyle: 'bold' }, rowPageBreak: 'avoid',
      columnStyles: isolated ? { 0: { cellWidth: 48 }, 1: { cellWidth: width - 288 }, 2: { cellWidth: 120 }, 3: { cellWidth: 120 } }
        : { 0: { cellWidth: 48 }, 1: { cellWidth: 95 }, 2: { cellWidth: 65 }, 3: { cellWidth: 65 }, 4: { cellWidth: 55 }, 5: { cellWidth: 76 }, 6: { cellWidth: 120 }, 7: { cellWidth: width - 569 }, 8: { cellWidth: 45 } },
      didParseCell(cell) {
        if (cell.section === 'head' && cell.column.index === 0) { cell.cell.styles.overflow = 'visible'; cell.cell.text = [isolated ? 'Point' : 'Waypoint']; }
        if (!isolated && cell.section === 'body' && points[cell.row.index]?.denseTraffic) {
          cell.cell.styles.fillColor = [...pale];
          if (cell.column.index === 8) { cell.cell.styles.minCellHeight = 40; cell.cell.styles.cellPadding = { top: 17, bottom: 4, left: 4, right: 4 }; }
        }
      },
      didDrawCell(cell) {
        if (isolated || cell.section !== 'body' || cell.column.index !== 8 || !points[cell.row.index]?.denseTraffic) return;
        const x = cell.cell.x + cell.cell.width / 2, y = cell.cell.y + cell.cell.height / 2 - 9;
        document.saveGraphicsState(); document.setDrawColor(138, 97, 0); document.setLineWidth(.6); document.ellipse(x, y, 5, 3, 'S');
        document.setFillColor(138, 97, 0); document.circle(x, y, 1.2, 'F'); document.restoreGraphicsState();
      },
    });
    y = ((document as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || y) + 20;
  };
  table('Passage plan', plan.waypoints); table('Points isolés - hors calcul de navigation', plan.points, true);
  if (plan.zones.length) {
    if (y > pageHeight - 90) { document.addPage(); y = 34; }
    document.setFont('helvetica', 'bold'); document.setFontSize(9); document.setTextColor(...BLUE); document.text('Zones', left, y); y += 8;
    autoTable(document, { startY: y, margin: { left, right: left, top: 30, bottom: 26 }, theme: 'grid', head: [['Zone', 'Sommet', 'Latitude', 'Longitude']],
      body: plan.zones.flatMap((zone, index) => zone.vertices.length ? zone.vertices.map((vertex, vertexIndex) => [value(zone.name || `Zone ${index + 1}`), String(vertexIndex + 1), value(formatSeaLatitude(vertex.latitude)), value(formatSeaLongitude(vertex.longitude))]) : [[value(zone.name || `Zone ${index + 1}`), 'À compléter', '—', '—']]),
      styles: { font: 'helvetica', fontSize: 7, cellPadding: 4, halign: 'center', valign: 'middle', lineColor: [209, 220, 230], lineWidth: .35 }, headStyles: { fillColor: [246, 249, 252], textColor: [12, 85, 152] },
    });
  }
  for (let page = 1; page <= document.getNumberOfPages(); page++) { document.setPage(page); document.setFont('helvetica', 'normal'); document.setFontSize(6.5); document.setTextColor(...MUTED); document.text(`Annexe Localisation · ${page} / ${document.getNumberOfPages()}`, document.internal.pageSize.getWidth() - left, pageHeight - 12, { align: 'right' }); }
  return new Uint8Array(document.output('arraybuffer'));
}

/** Opt-in appendix only; an absent/unchecked section returns the original contract bytes untouched. */
export async function appendProjectLocationPdf(base: Blob, rawPlan: unknown, options: ProjectLocationPdfOptions): Promise<Blob> {
  const plan = parseProjectLocationPlan(rawPlan);
  if (!plan?.includeInPdf || !hasProjectLocationContent(plan) && !resolveSeaOperationMapPorts(options.departurePort, options.arrivalPort).ports.length) return base;
  const [{ PDFDocument }, baseBytes, appendix] = await Promise.all([import('pdf-lib'), base.arrayBuffer(), generateProjectLocationPdf(plan, options)]);
  const document = await PDFDocument.load(baseBytes), annex = await PDFDocument.load(appendix);
  const pages = await document.copyPages(annex, annex.getPageIndices()); pages.forEach(page => document.addPage(page));
  return new Blob([new Uint8Array(await document.save({ useObjectStreams: true }))], { type: 'application/pdf' });
}
