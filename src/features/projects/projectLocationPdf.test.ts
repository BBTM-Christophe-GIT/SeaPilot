import { PDFDocument, PDFArray, PDFName, PDFDict, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { jsPDF } from 'jspdf';
import { describe, expect, it } from 'vitest';
import { emptySeaOperationWaypoint } from '../seaOperations/seaOperationModel';
import { emptyProjectLocationPlan } from './projectLocation';
import { appendProjectLocationPdf, drawProjectLocationMapPdf, generateProjectLocationPdf, projectLocationVoyage } from './projectLocationPdf';
import { projectSeaOperationMapPlace, resolveSeaOperationMapPorts } from '../seaOperations/seaOperationMapPlaces';

function fixture() {
  const plan = emptyProjectLocationPlan();
  plan.includeInPdf = true; plan.etd = '2026-10-27T08:00'; plan.charts = '7421 - 7312';
  plan.waypoints = [
    { ...emptySeaOperationWaypoint('route-1'), number: '1', descriptionVhf: 'Port de Cherbourg', latitude: '49.65', longitude: '-1.62', eta: plan.etd },
    { ...emptySeaOperationWaypoint('route-2'), number: '2', descriptionVhf: 'Waypoint 2', latitude: '49.75', longitude: '-1.7', eta: '2026-10-27T09:00', ukc: '5', denseTraffic: true },
  ];
  plan.points = [{ ...emptySeaOperationWaypoint('isolated'), number: 'P1', descriptionVhf: 'Point isolé', latitude: '48.5', longitude: '-4' }];
  plan.zones = [{ id: 'area', name: 'Zone de travail', vertices: [{ latitude: '49.5', longitude: '-2' }, { latitude: '49.6', longitude: '-2.1' }, { latitude: '49.55', longitude: '-2.2' }] }];
  return plan;
}

function streams(document: PDFDocument) {
  return document.getPages().map(page => {
    const contents = page.node.Contents();
    const entries = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
    return entries.map(entry => {
      const stream = document.context.lookup(entry);
      return stream instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1') : '';
    }).join('\n');
  }).join('\n');
}

describe('Project location appendix', () => {
  it('fits the defined ports as named context without adding voyage legs, and retains a manual frame', async () => {
    const plan = fixture(); plan.points = []; plan.zones = [];
    const original = structuredClone(plan), options = { departurePort: 'Cherbourg', arrivalPort: 'Brest', showVoyage: true, maxSpeedKnots: 12 };
    const ports = resolveSeaOperationMapPorts(options.departurePort, options.arrivalPort).ports;
    expect(ports).toHaveLength(2);
    const document = new jsPDF({ unit: 'pt', orientation: 'landscape' });
    const map = drawProjectLocationMapPdf(document, plan, { x: 30, y: 60, width: 782, height: 190 }, options);
    for (const port of ports) expect(projectSeaOperationMapPlace(map, port.location)).not.toBeNull();
    expect(map.points).toHaveLength(2); expect(map.segments).toHaveLength(1); expect(plan).toEqual(original);
    const bytes = await generateProjectLocationPdf(plan, { ...options, projectLabel: 'Ports conserves' });
    const text = streams(await PDFDocument.load(bytes));
    expect(text).toContain('Cherbourg'); expect(text).toContain('Brest');
    const viewport = { centerLatitude: 49.65, centerLongitude: -1.62, longitudeSpan: .25 };
    const manual = drawProjectLocationMapPdf(document, { ...plan, mapViewport: viewport }, { x: 30, y: 60, width: 782, height: 190 }, options);
    expect(manual.viewport?.centerLatitude).toBeCloseTo(viewport.centerLatitude, 10);
    expect(manual.viewport?.centerLongitude).toBeCloseTo(viewport.centerLongitude, 10);
    expect(manual.viewport?.longitudeSpan).toBe(viewport.longitudeSpan);
    expect(projectSeaOperationMapPlace(manual, ports.find(port => port.roles.includes('arrival'))!.location)).toBeNull();
  });
  it('keeps every short-route marker outside the bottom-right navigation summary', () => {
    const plan = fixture();
    plan.waypoints = [['49.65', '-1.64'], ['49.655', '-1.62'], ['49.65', '-1.60']].map(([latitude, longitude], index) => ({ ...emptySeaOperationWaypoint(`short-${index}`), number: String(index + 1), latitude, longitude }));
    plan.points = []; plan.zones = [];
    const document = new jsPDF({ unit: 'pt', orientation: 'landscape' });
    const bounds = { x: 30, y: 60, width: 782, height: 190 };
    const map = drawProjectLocationMapPdf(document, plan, bounds, { maxSpeedKnots: 12, showVoyage: true });
    const summaryLeft = bounds.x + bounds.width - 206;
    expect(map.points).toHaveLength(3);
    expect(map.points.every(point => bounds.x + point.x / map.width * bounds.width + 12 < summaryLeft)).toBe(true);
    expect(map.segments).toHaveLength(2);
  });

  it('returns the exact original contract when absent, unchecked or empty', async () => {
    const base = new Blob(['untouched contract']); const plan = fixture(); plan.includeInPdf = false;
    for (const location of [null, plan, { ...emptyProjectLocationPlan(), includeInPdf: true }]) {
      expect(await appendProjectLocationPdf(base, location, { projectLabel: 'P1' })).toBe(base);
    }
  });

  it('appends landscape pages after every original page without changing original content or geometry', async () => {
    const original = await PDFDocument.create(); original.addPage([400, 700]); original.addPage([500, 710]);
    original.getPage(0).drawText('Original contract untouched');
    const base = new Blob([new Uint8Array(await original.save())]);
    const result = await appendProjectLocationPdf(base, fixture(), { projectLabel: 'P1107 - Localisation', maxSpeedKnots: 12 });
    const output = await PDFDocument.load(await result.arrayBuffer());
    expect(output.getPageCount()).toBeGreaterThan(2);
    expect(output.getPages().slice(0, 2).map(page => page.getSize())).toEqual([{ width: 400, height: 700 }, { width: 500, height: 710 }]);
    expect(streams(output)).toContain(streams(original));
    expect(output.getPages().slice(2).every(page => page.getWidth() > page.getHeight())).toBe(true);
    const text = streams(output);
    for (const label of ['Passage plan', 'Waypoint 2', '7421 - 7312', 'Zone de travail', 'Points isol', 'ETD', 'ETA']) expect(text).toContain(label);
    expect(await output.getPage(0).node.Contents()).toBeDefined();
  });

  it('fits all layers but never creates legs or duration from isolated points or zone vertices', () => {
    const plan = fixture(); const document = new jsPDF({ unit: 'pt', orientation: 'landscape' });
    const route = projectLocationVoyage(plan, 12);
    const map = drawProjectLocationMapPdf(document, plan, { x: 20, y: 20, width: 800, height: 250 });
    expect(map.points).toHaveLength(2); expect(map.segments).toHaveLength(1);
    expect(route.route.legs).toHaveLength(1);
    expect(projectLocationVoyage({ ...plan, points: [] } as typeof plan, 12)).toEqual(route);
    const overlayOnly = drawProjectLocationMapPdf(document, { ...plan, waypoints: [] }, { x: 20, y: 20, width: 800, height: 250 });
    expect(overlayOnly.projection).not.toBeNull(); expect(overlayOnly.segments).toHaveLength(0); expect(overlayOnly.points).toHaveLength(0);
  });

  it('paginates many waypoint rows without dropping the last point or unfinished zone', async () => {
    const plan = fixture(); plan.waypoints = Array.from({ length: 35 }, (_, index) => ({ ...plan.waypoints[0], id: `w-${index}`, number: String(index + 1), descriptionVhf: `ROW-END-${index + 1}` }));
    plan.zones.push({ id: 'unfinished', name: 'Zone inachevee', vertices: [] });
    const output = await PDFDocument.load(await generateProjectLocationPdf(plan, { projectLabel: 'Pagination', maxSpeedKnots: 12 }));
    expect(output.getPageCount()).toBeGreaterThan(2);
    expect(streams(output)).toContain('ROW-END-35'); expect(streams(output)).toContain('Zone inachevee');
    const images = output.getPages().map(page => page.node.Resources()?.lookup(PDFName.of('XObject'), PDFDict));
    expect(images.every(image => !image || image.keys().length === 0)).toBe(true);
  });
});
