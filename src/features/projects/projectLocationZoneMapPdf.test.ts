// @vitest-environment node
import { readFile, writeFile } from 'node:fs/promises';
import { jsPDF } from 'jspdf';
import { PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import fixture from '../seaOperations/testFixtures/sea-operation-zones.json';
import { emptySeaOperation, emptySeaOperationWaypoint } from '../seaOperations/seaOperationModel';
import { generateSeaOperationPdf } from '../seaOperations/seaOperationPdf';
import type { SeaOperationRecord } from '../seaOperations/seaOperationQueries';
import { seaOperationZonePositions } from '../seaOperations/seaOperationMapLayers';
import { projectSeaOperationMapPlace } from '../seaOperations/seaOperationMapPlaces';
import { drawProjectLocationMapPdf } from './projectLocationPdf';
import { emptyProjectLocationPlan } from './projectLocation';

const location = () => ({ ...emptyProjectLocationPlan(), ...structuredClone(fixture),
  waypoints: fixture.waypoints.map((point, index) => ({ ...emptySeaOperationWaypoint(`zone-route-${index}`), ...point, number: String(index + 1) })) });
const pageBodies = (pdf: PDFDocument) => pdf.getPages().map(page => {
  const objects = page.node.Resources()!.lookup(PDFName.of('XObject'), PDFDict);
  const body = objects.lookup(objects.keys()[0]);
  if (!(body instanceof PDFRawStream)) throw new Error('Expected the generated body stream');
  return Buffer.from(decodePDFRawStream(body).decode()).toString('latin1');
});

describe('Sea-operation zone maps in PDF', () => {
  it('exports the reported six-vertex zones as complete named tables with all twelve retained coordinates', async () => {
    const plan = location(), draft = { ...emptySeaOperation(), project: 'Recette zones', waypoints: plan.waypoints,
      mapViewport: plan.mapViewport, locationOverlay: { version: 1 as const, points: [], zones: plan.zones } };
    const record: SeaOperationRecord = { id: 'zone-report', companyId: 1, version: 1, status: 'signed', draft,
      createdBy: 'qa', createdByName: 'Recette', createdAt: '2026-10-27T08:00:00Z', updatedBy: 'qa', updatedByName: 'Recette', updatedAt: '2026-10-27T08:00:00Z',
      signedBy: 'qa', signedByName: 'Capitaine fictif', signedAt: '2026-10-27T08:00:00Z', captainName: 'Capitaine fictif', canEdit: false, canSign: false };
    const original = structuredClone(record);
    const templateBytes = new Uint8Array(await readFile(new URL('../../../public/templates/sea-operation/word-header-footer.pdf', import.meta.url)));
    const output = await generateSeaOperationPdf(record, { templateBytes });
    const pdf = await PDFDocument.load(output.bytes);
    const bodies = pageBodies(pdf);
    expect(bodies.find(body => body.includes('(Zones - hors calcul de navigation) Tj'))).toContain('(Z1 - Zone de Travaux) Tj');
    for (const [index, zone] of plan.zones.entries()) {
      const tablePage = bodies.find(body => body.includes(`(Z${index + 1} - ${zone.name}) Tj`) && body.includes('(Point) Tj') && body.includes('(Coordonnées) Tj'));
      expect(tablePage).toBeDefined();
      for (let vertex = 1; vertex <= 6; vertex++) expect(tablePage).toContain(`(Z${index + 1}.${vertex}) Tj`);
    }
    expect(record).toEqual(original);
    if (process.env.SEAPILOT_PDF_ZONE_REPORT_QA_OUTPUT) await writeFile(process.env.SEAPILOT_PDF_ZONE_REPORT_QA_OUTPUT, output.bytes);
  });

  it('keeps successive long zone titles inside the page using their actual rendered font', async () => {
    const plan = location();
    plan.zones[0].name = 'LONG-TITLE-ALPHA monitoring perimeter '.repeat(12);
    plan.zones[1].name = 'LONG-TITLE-BETA protective perimeter '.repeat(12);
    const draft = { ...emptySeaOperation(), project: 'Zone titles', locationOverlay: { version: 1 as const, points: [], zones: plan.zones } };
    const record: SeaOperationRecord = { id: 'zone-titles', companyId: 1, version: 1, status: 'draft', draft,
      createdBy: 'qa', createdByName: 'Recette', createdAt: '2026-10-27T08:00:00Z', updatedBy: 'qa', updatedByName: 'Recette', updatedAt: '2026-10-27T08:00:00Z',
      signedBy: null, signedByName: null, signedAt: null, captainName: '', canEdit: true, canSign: false };
    const templateBytes = new Uint8Array(await readFile(new URL('../../../public/templates/sea-operation/word-header-footer.pdf', import.meta.url)));
    const output = await generateSeaOperationPdf(record, { templateBytes }), pdf = await PDFDocument.load(output.bytes);
    const measure = new jsPDF({ unit: 'pt' }); let lines = 0;
    pageBodies(pdf).forEach((body, pageIndex) => {
      for (const run of body.matchAll(/BT\n([\s\S]*?)\nET/g)) {
        if (!run[1].includes('LONG-TITLE-') || !run[1].includes('/F2 ')) continue;
        const size = /\/F2 ([\d.]+) Tf/.exec(run[1]), position = /([\d.-]+) ([\d.-]+) Td/.exec(run[1]);
        if (!size || !position) continue;
        measure.setFont('helvetica', 'bold'); measure.setFontSize(Number(size[1]));
        for (const text of run[1].matchAll(/\(([^)]*)\) Tj/g)) {
          expect(Number(position[1]) + measure.getTextWidth(text[1])).toBeLessThanOrEqual(pdf.getPages()[pageIndex].getWidth() - 48);
          lines++;
        }
      }
    });
    expect(lines).toBeGreaterThan(3);
  });

  it('contains both reported zones in the flatter document while retaining the recorded manual centre and route', async () => {
    const plan = location(), original = structuredClone(plan), document = new jsPDF({ unit: 'pt', orientation: 'landscape' });
    const bounds = { x: 30, y: 60, width: 782, height: 190 };
    const vertices = plan.zones.flatMap(zone => seaOperationZonePositions(zone) || []);
    const previous = drawProjectLocationMapPdf(document, plan, bounds);
    expect(vertices.some(vertex => projectSeaOperationMapPlace(previous, vertex) === null)).toBe(true);
    document.addPage();
    const fitted = drawProjectLocationMapPdf(document, plan, bounds, { ensureZonesVisible: true });
    expect(fitted.viewport!.centerLatitude).toBeCloseTo(plan.mapViewport.centerLatitude, 10);
    expect(fitted.viewport!.centerLongitude).toBeCloseTo(plan.mapViewport.centerLongitude, 10);
    expect(fitted.viewport!.longitudeSpan).toBeGreaterThan(plan.mapViewport.longitudeSpan);
    expect(vertices.every(vertex => projectSeaOperationMapPlace(fitted, vertex) !== null)).toBe(true);
    expect(fitted.points).toHaveLength(3); expect(fitted.segments).toHaveLength(2); expect(plan).toEqual(original);
    const commands = document.output();
    for (const label of ['Z1.1', 'Z1.6', 'Z2.1', 'Z2.6', '(Z1)', '(Z2)']) expect(commands).toContain(label);
    const bytes = new Uint8Array(document.output('arraybuffer')), pdf = await PDFDocument.load(bytes);
    expect(pdf.getPages().every(page => {
      const images = page.node.Resources()?.lookup(PDFName.of('XObject'), PDFDict);
      return !images || images.keys().length === 0;
    })).toBe(true);
    if (process.env.SEAPILOT_PDF_ZONE_MAP_QA_OUTPUT) await writeFile(process.env.SEAPILOT_PDF_ZONE_MAP_QA_OUTPUT, bytes);
  });

  it('keeps automatic framing automatic and does not enlarge a manual frame when no complete zone requires it', () => {
    const plan = location(), document = new jsPDF({ unit: 'pt', orientation: 'landscape' }), bounds = { x: 30, y: 60, width: 782, height: 190 };
    const automatic = { ...plan, mapViewport: undefined };
    const previous = drawProjectLocationMapPdf(document, automatic, bounds);
    expect(drawProjectLocationMapPdf(document, automatic, bounds, { ensureZonesVisible: true }).viewport).toEqual(previous.viewport);
    const incomplete = { ...plan, zones: [{ ...plan.zones[0], vertices: plan.zones[0].vertices.slice(0, 2) }] };
    const retained = drawProjectLocationMapPdf(document, incomplete, bounds, { ensureZonesVisible: true }).viewport!;
    expect(retained.longitudeSpan).toBe(plan.mapViewport.longitudeSpan);
    expect(retained.centerLatitude).toBeCloseTo(plan.mapViewport.centerLatitude, 10);
    expect(retained.centerLongitude).toBeCloseTo(plan.mapViewport.centerLongitude, 10);
  });
});
