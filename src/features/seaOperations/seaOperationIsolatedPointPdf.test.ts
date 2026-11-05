// @vitest-environment node
import { readFile, writeFile } from 'node:fs/promises';
import { jsPDF } from 'jspdf';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import { drawSeaOperationIsolatedPointPdf } from './seaOperationIsolatedPointPdf';
import { SEA_OPERATION_ISOLATED_POINT_ICONS } from './seaOperationIsolatedPointIcons';
import { emptySeaOperation, emptySeaOperationWaypoint } from './seaOperationModel';
import { copyProjectLocationToSeaOperation } from './seaOperationProjectLocation';
import { generateSeaOperationPdf } from './seaOperationPdf';
import type { SeaOperationRecord } from './seaOperationQueries';
import { emptyProjectLocationPlan } from '../projects/projectLocation';
import { drawProjectLocationMapPdf, generateProjectLocationPdf } from '../projects/projectLocationPdf';

describe('isolated-point symbols in PDF', () => {
  it.each(SEA_OPERATION_ISOLATED_POINT_ICONS)('renders $label as green vectors with the entered number', ({ value }) => {
    const document = new jsPDF({ unit: 'pt' }), point = { number: ' B04 ', isolatedPointIcon: value }, original = structuredClone(point);
    const color = vi.spyOn(document, 'setDrawColor');
    const line = vi.spyOn(document, 'line'), path = vi.spyOn(document, 'path');
    drawSeaOperationIsolatedPointPdf(document, point, 1, { x: 100, y: 100, left: 30, right: 550 });
    expect(document.output()).toContain('(B04) Tj'); expect(document.output()).not.toContain('(P1) Tj');
    expect(document.output()).not.toContain('/Subtype /Image'); expect(color).toHaveBeenCalledWith(37, 129, 95);
    expect(line.mock.calls).toEqual([[96, 100, 104, 100], [100, 96, 100, 104]]);
    const coordinates = path.mock.calls.flatMap(([operations]) => (operations ?? []) as { c: number[] }[]).flatMap(({ c }) => c);
    expect(coordinates.length).toBeGreaterThan(0);
    expect(coordinates.filter((_, index) => index % 2 === 0).every(x => x < 96)).toBe(true);
    expect(point).toEqual(original);
  });

  it('keeps the legacy square, falls back only for an empty number and bounds long visual labels without changing them', () => {
    const document = new jsPDF({ unit: 'pt' });
    const line = vi.spyOn(document, 'line'), rect = vi.spyOn(document, 'rect');
    drawSeaOperationIsolatedPointPdf(document, { number: '   ' }, 7, { x: 540, y: 100, left: 30, right: 550 });
    expect(document.output()).toContain('(P7) Tj');
    expect(line.mock.calls).toEqual([[536, 100, 544, 100], [540, 96, 540, 104]]);
    expect(rect).toHaveBeenCalledWith(536, 86, 8, 8, 'FD');
    const point = { number: 'ABCDEFGH'.repeat(10) }, original = structuredClone(point);
    drawSeaOperationIsolatedPointPdf(document, point, 8, { x: 500, y: 200, left: 30, right: 550 });
    expect(document.output()).toContain(`(${point.number.slice(0, 17)}...) Tj`); expect(point).toEqual(original);
  });

  it('keeps the pictogram inside the top edge without shifting the position cross', () => {
    const document = new jsPDF({ unit: 'pt' });
    const line = vi.spyOn(document, 'line'), path = vi.spyOn(document, 'path');
    drawSeaOperationIsolatedPointPdf(document, { number: 'B04', isolatedPointIcon: 'buoy' }, 1,
      { x: 32, y: 62, left: 30, right: 550, top: 60, bottom: 250 });
    expect(line.mock.calls).toEqual([[28, 62, 36, 62], [32, 58, 32, 66]]);
    const coordinates = path.mock.calls.flatMap(([operations]) => (operations ?? []) as { c: number[] }[]).flatMap(({ c }) => c);
    expect(coordinates.length).toBeGreaterThan(0);
    expect(coordinates.filter((_, index) => index % 2).every(y => y > 66)).toBe(true);
    expect(coordinates.filter((_, index) => index % 2 === 0).every(x => x > 30)).toBe(true);
  });

  it('keeps every selected icon in the appendix and preserves route, zones, coordinates and voyage data', async () => {
    const plan = emptyProjectLocationPlan(); plan.includeInPdf = true;
    plan.waypoints = [{ ...emptySeaOperationWaypoint('route-1'), number: '1', latitude: '49.65', longitude: '-1.62' },
      { ...emptySeaOperationWaypoint('route-2'), number: '2', latitude: '49.68', longitude: '-1.60' }];
    plan.zones = [{ id: 'zone', name: 'Zone conservée', vertices: [{ latitude: '49.66', longitude: '-1.63' }, { latitude: '49.68', longitude: '-1.63' }, { latitude: '49.67', longitude: '-1.65' }] }];
    plan.points = SEA_OPERATION_ISOLATED_POINT_ICONS.map((icon, index) => ({ ...emptySeaOperationWaypoint(`icon-${index}`),
      number: `B${String(index + 4).padStart(2, '0')}`, descriptionVhf: icon.label, latitude: String(49.60 + index * .02), longitude: '-1.52', isolatedPointIcon: icon.value }));
    const original = structuredClone(plan), document = new jsPDF({ unit: 'pt', orientation: 'landscape' });
    const geometry = drawProjectLocationMapPdf(document, plan, { x: 30, y: 60, width: 782, height: 250 });
    expect(geometry.points).toHaveLength(2); expect(geometry.segments).toHaveLength(1); expect(plan).toEqual(original);
    for (const point of plan.points) expect(document.output()).toContain(`(${point.number}) Tj`);
    const bytes = await generateProjectLocationPdf(plan, { projectLabel: 'Icônes des points isolés' });
    const output = await PDFDocument.load(bytes);
    expect(output.getPages().every(page => {
      const images = page.node.Resources()?.lookup(PDFName.of('XObject'), PDFDict);
      return !images || images.keys().length === 0;
    })).toBe(true);
    expect(plan).toEqual(original);
    if (process.env.SEAPILOT_ISOLATED_ICON_PDF_QA_OUTPUT) await writeFile(process.env.SEAPILOT_ISOLATED_ICON_PDF_QA_OUTPUT, bytes);
    const draft = copyProjectLocationToSeaOperation(emptySeaOperation(), plan, 12);
    const record: SeaOperationRecord = { id: 'icon-export', companyId: 1, version: 1, status: 'draft', draft,
      createdBy: 'qa', createdByName: 'Recette', createdAt: '2026-10-27T08:00:00Z', updatedBy: 'qa', updatedByName: 'Recette', updatedAt: '2026-10-27T08:00:00Z',
      signedBy: null, signedByName: null, signedAt: null, captainName: '', canEdit: true, canSign: false };
    const templateBytes = new Uint8Array(await readFile(new URL('../../../public/templates/sea-operation/word-header-footer.pdf', import.meta.url)));
    const operation = await generateSeaOperationPdf(record, { templateBytes });
    expect(draft.locationOverlay!.points.map(point => point.isolatedPointIcon)).toEqual(SEA_OPERATION_ISOLATED_POINT_ICONS.map(icon => icon.value));
    expect(plan).toEqual(original);
    if (process.env.SEAPILOT_ISOLATED_ICON_SEA_PDF_QA_OUTPUT) await writeFile(process.env.SEAPILOT_ISOLATED_ICON_SEA_PDF_QA_OUTPUT, operation.bytes);
  });
});
