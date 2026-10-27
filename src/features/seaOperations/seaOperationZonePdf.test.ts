// @vitest-environment node
import { writeFile } from 'node:fs/promises';
import { jsPDF } from 'jspdf';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import { drawSeaOperationZoneTablePdf } from './seaOperationZonePdf';
import { seaOperationZoneAppearance } from './seaOperationZonePresentation';
import { drawProjectLocationMapPdf, generateProjectLocationPdf } from '../projects/projectLocationPdf';
import { emptyProjectLocationPlan } from '../projects/projectLocation';
import { emptySeaOperationWaypoint } from './seaOperationModel';
import fixture from './testFixtures/sea-operation-zones.json';

function contents(pdf: PDFDocument) {
  return pdf.getPages().map(page => {
    const data = page.node.Contents(), entries = data instanceof PDFArray ? data.asArray() : data ? [data] : [];
    return entries.map(entry => { const stream = pdf.context.lookup(entry); return stream instanceof PDFRawStream
      ? Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1') : ''; }).join('\n');
  });
}

describe('coloured zone hierarchy in PDF', () => {
  it('uses one coloured parent heading and indented children instead of repeating the zone name', () => {
    const document = new jsPDF({ unit: 'pt' }), line = vi.spyOn(document, 'line');
    const zone = structuredClone(fixture.zones[0]), original = structuredClone(zone);
    drawSeaOperationZoneTablePdf(document, zone, 0, { y: 80, left: 40, right: 40, top: 40, bottom: 40 });
    const pdf = document.output();
    expect(pdf.match(/Zone de Travaux/g)).toHaveLength(1);
    expect(pdf).toContain('(Z1 - Zone de Travaux) Tj');
    expect(pdf).toContain('(Point) Tj');
    for (let i = 1; i <= 6; i++) expect(pdf).toContain(`(Z1.${i}) Tj`);
    expect(line).toHaveBeenCalled(); expect(zone).toEqual(original);
  });

  it('uses the identical palette for nested map outlines and the parent table', () => {
    const plan = { ...emptyProjectLocationPlan(), ...structuredClone(fixture), waypoints: [], points: [] };
    const document = new jsPDF({ unit: 'pt', orientation: 'landscape' }), colors = vi.spyOn(document, 'setDrawColor');
    drawProjectLocationMapPdf(document, plan, { x: 30, y: 60, width: 782, height: 190 }, { ensureZonesVisible: true });
    for (const index of [0, 1]) expect(colors).toHaveBeenCalledWith(...seaOperationZoneAppearance(index).rgb);
    const text = document.output();
    expect(text).toContain('(Z1) Tj'); expect(text).toContain('(Z2) Tj');
    expect(text).not.toContain('(Zone de Travaux) Tj'); expect(text).not.toContain('(Zone Tampon) Tj');
  });

  it('exports the reported project as a readable hierarchy, keeping source data and vector maps', async () => {
    const plan = { ...emptyProjectLocationPlan(), ...structuredClone(fixture), includeInPdf: true, waypoints: [],
      points: [{ ...emptySeaOperationWaypoint('oss'), number: 'OSS', descriptionVhf: 'OSS', latitude: '50.1797', longitude: '1.1723', isolatedPointIcon: 'platform' as const }] };
    const original = structuredClone(plan), bytes = await generateProjectLocationPdf(plan, { projectLabel: 'P144 - GUARD VESSEL EMDT', vesselName: 'GOURY' });
    const pdf = await PDFDocument.load(bytes), text = contents(pdf).join('\n');
    for (const index of [0, 1]) {
      expect(text).toContain(`(Z${index + 1} - ${plan.zones[index].name}) Tj`);
      for (let vertex = 1; vertex <= 6; vertex++) expect(text).toContain(`(Z${index + 1}.${vertex}) Tj`);
    }
    expect(plan).toEqual(original);
    expect(pdf.getPages().every(page => { const images = page.node.Resources()?.lookup(PDFName.of('XObject'), PDFDict); return !images || images.keys().length === 0; })).toBe(true);
    if (process.env.SEAPILOT_ZONE_HIERARCHY_PROJECT_QA_OUTPUT) await writeFile(process.env.SEAPILOT_ZONE_HIERARCHY_PROJECT_QA_OUTPUT, bytes);
  });

  it('keeps every child and repeats the long parent when a 200-vertex zone paginates', () => {
    const document = new jsPDF({ unit: 'pt' }), zone = { id: 'many', name: 'LONG-PARENT '.repeat(40),
      vertices: Array.from({ length: 200 }, (_, index) => ({ latitude: String(50 + index / 1000), longitude: '1' })) };
    drawSeaOperationZoneTablePdf(document, zone, 49, { y: 680, left: 40, right: 40, top: 50, bottom: 40 });
    expect(document.getNumberOfPages()).toBeGreaterThan(3);
    const pdf = document.output();
    expect((pdf.match(/Z50 - LONG-PARENT/g) || []).length).toBeGreaterThan(1);
    for (let vertex = 1; vertex <= 200; vertex++) expect(pdf).toContain(`(Z50.${vertex}) Tj`);
  });

  it('keeps the section heading with its first parent after a nearly full isolated-point table', async () => {
    const plan = { ...emptyProjectLocationPlan(), ...structuredClone(fixture), waypoints: [],
      points: Array.from({ length: 8 }, (_, index) => ({ ...emptySeaOperationWaypoint(`isolated-${index}`), number: `P${index + 1}`, descriptionVhf: 'Point isolé', latitude: '50.1', longitude: '1.1' })) };
    const pdf = await PDFDocument.load(await generateProjectLocationPdf(plan, { projectLabel: 'Pagination des zones' }));
    const section = contents(pdf).find(body => body.includes('(Zones) Tj'));
    expect(section).toContain('(Z1 - Zone de Travaux) Tj');
    expect(section).toContain('(Z1.1) Tj');
  });
});
