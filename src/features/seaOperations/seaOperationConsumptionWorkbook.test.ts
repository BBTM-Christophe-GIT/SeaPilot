import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildSeaOperationConsumptionWorkbook, type SeaOperationConsumptionWorkbookRow } from './seaOperationConsumptionWorkbook';
import { emptySeaOperation } from './seaOperationModel';

const rozel: SeaOperationConsumptionWorkbookRow = {
  operation: { id: 'rozel', draft: emptySeaOperation() },
  consumption: {
    durationMinutes: 1500, averageSpeedKnots: 8, distanceNm: 200, gaugeUnit: 'percent',
    departureGauge: 80, arrivalGauge: 72, departureLiters: 13320, arrivalLiters: 11985,
    consumedLiters: 1335, litersPerHour: 53.4, litersPerNm: 6.675,
    refuelLiters: 4000, pricePerLiter: 1.254, costEuros: 1674.09,
    actualArrival: '2026-11-06T05:15', completed: true, includedInReference: true,
    updatedAt: '2026-11-06T10:00:00Z', version: 1,
  },
};
rozel.operation.draft.transit = { date: '2026-11-05', captainPersonId: 'captain' };
rozel.operation.draft.project = '=2+2 & <Transit>';
Object.assign(rozel.operation.draft.vessel, { name: 'LE ROZEL', departurePort: 'Le Havre', arrivalPort: 'Brest', etd: '2026-11-05T04:15' });

const suroit: SeaOperationConsumptionWorkbookRow = {
  operation: { id: 'suroit', draft: emptySeaOperation() },
  consumption: {
    ...rozel.consumption, gaugeUnit: 'cm', departureGauge: 105, arrivalGauge: 105,
    consumedLiters: 0, litersPerHour: 0, litersPerNm: 0, refuelLiters: null, pricePerLiter: null,
    costEuros: null, actualArrival: null,
  },
};
suroit.operation.draft.vessel.name = 'SUROIT';

describe('Excel consumption export', () => {
  it('writes searchable headers and typed dates, durations and readings for both gauge units', async () => {
    const blob = await buildSeaOperationConsumptionWorkbook([rozel, suroit]);
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const archive = await JSZip.loadAsync(await blob.arrayBuffer());
    await expect(archive.file('xl/workbook.xml')!.async('string')).resolves.toContain('name="RELEVES"');
    const xml = await archive.file('xl/worksheets/sheet1.xml')!.async('string');
    const sheet = new DOMParser().parseFromString(xml, 'application/xml');
    const at = (address: string) => sheet.querySelector(`c[r="${address}"]`);
    const numeric = (address: string) => Number(at(address)?.querySelector('v')?.textContent);

    expect(sheet.querySelector('parsererror')).toBeNull();
    expect(sheet.querySelector('autoFilter')?.getAttribute('ref')).toBe('A3:AC5');
    expect(sheet.querySelector('pane')?.getAttribute('state')).toBe('frozen');
    expect(at('O2')?.textContent).toBe('Consommation');
    expect(at('B4')?.textContent).toBe('LE ROZEL');
    expect(at('B5')?.textContent).toBe('SUROIT');
    expect(at('C4')?.getAttribute('t')).toBe('inlineStr');
    expect(at('C4')?.textContent).toBe('=2+2 & <Transit>');
    expect(sheet.querySelector('f')).toBeNull();
    expect(numeric('G4') - numeric('F4')).toBeCloseTo(25 / 24, 8);
    expect(numeric('I4')).toBeCloseTo(25 / 24, 8);
    expect(at('L4')?.textContent).toBe('%');
    expect(at('L5')?.textContent).toBe('cm');
    expect(numeric('M5')).toBe(105);
    expect(numeric('Q4')).toBe(1335);
    expect(numeric('S4')).toBe(6.675);
    expect(numeric('T4')).toBe(1674.09);
    expect(numeric('V4')).toBe(1.254);
    expect(numeric('Q5')).toBe(0);
    expect(at('T5')).toBeNull();
    expect(at('V5')).toBeNull();
  });

  it('exports historical snapshots in separate sheets even without live readings', async () => {
    const rozelCells = ['=A1', 'Brest', 15, 45815.25, 45815.5, 'Non', 0.25, 2.5, 0.7, null, 0.6, 12000, 900, 150, 60, 1234.5, 0, 1.2];
    const suroitCells = ['Brest', 'Lorient', 8, 46180.25, 46180.5, 'Oui', 0.25, 1.3, 115, 112, 3944.5, 3841.6, 102.9, 17.15, 12.86, 123.48, 0, 1.2, 0.5, 61.74, 'À vérifier', 0, null];
    const blob = await buildSeaOperationConsumptionWorkbook([], {
      rozel: [{ sourceRow: 19, cells: rozelCells }],
      suroit: [{ sourceRow: 7, cells: suroitCells }],
      rozelGauge: [{ sourceRow: 2, cells: [0.1, 459.75] }],
    });
    const archive = await JSZip.loadAsync(await blob.arrayBuffer());
    const workbook = await archive.file('xl/workbook.xml')!.async('string');
    expect(workbook).toContain('name="Historique Le Rozel"');
    expect(workbook).toContain('name="Historique Suroît"');
    expect(workbook).toContain('name="Courbe des soutes"');
    const readSheet = async (index: number) => new DOMParser().parseFromString(
      await archive.file(`xl/worksheets/sheet${index}.xml`)!.async('string'), 'application/xml');
    const rozelSheet = await readSheet(2);
    expect(rozelSheet.querySelector('c[r="A4"]')?.getAttribute('t')).toBe('inlineStr');
    expect(rozelSheet.querySelector('c[r="A4"]')?.textContent).toBe('=A1');
    expect(rozelSheet.querySelector('c[r="D4"][s="5"] v')?.textContent).toBe('45815.25');
    expect(rozelSheet.querySelector('c[r="G4"][s="6"] v')?.textContent).toBe('0.25');
    expect(rozelSheet.querySelector('c[r="I4"] v')?.textContent).toBe('0.7');
    expect(rozelSheet.querySelector('c[r="I3"]')?.textContent).toContain('%');
    expect(rozelSheet.querySelector('c[r="S4"] v')?.textContent).toBe('19');
    const suroitSheet = await readSheet(3);
    expect(suroitSheet.querySelector('c[r="I3"]')?.textContent).toContain('cm');
    expect(suroitSheet.querySelector('c[r="Q4"] v')?.textContent).toBe('0');
    expect(suroitSheet.querySelector('c[r="U4"]')?.textContent).toBe('À vérifier');
    const gauge = await readSheet(4);
    expect(gauge.querySelector('c[r="B4"] v')?.textContent).toBe('459.75');
  });

  it('exports GPS measurements and leaves trace cells blank for a manual reading', async () => {
    const trace = { startedAt: '2026-11-05T03:15:00.000Z', endedAt: '2026-11-06T04:15:00.000Z',
      durationMinutes: 1500, distanceNm: 220.5, averageSpeedKnots: 8.82, pointCount: 912,
      segmentCount: 2, gapCount: 1, reorderedPointCount: 0, excludedPointCount: 0 };
    const gps = { ...rozel, consumption: { ...rozel.consumption, trace } };
    const blob = await buildSeaOperationConsumptionWorkbook([gps, suroit, rozel]);
    const archive = await JSZip.loadAsync(await blob.arrayBuffer());
    const sheet = new DOMParser().parseFromString(await archive.file('xl/worksheets/sheet1.xml')!.async('string'), 'application/xml');
    const at = (address: string) => sheet.querySelector(`c[r="${address}"]`);
    expect(at('W4')?.textContent).toBe('GPS');
    expect(at('W5')?.textContent).toBe('Manuelle');
    expect(at('W6')?.textContent).toBe('Manuelle');
    expect(Number(at('Y4')?.textContent) - Number(at('X4')?.textContent)).toBeCloseTo(25 / 24, 8);
    expect(Number(at('Z4')?.textContent)).toBeCloseTo(25 / 24, 8);
    expect(at('AA4')?.textContent).toBe('220.5');
    expect(at('AB4')?.textContent).toBe('8.82');
    expect(at('AC4')?.textContent).toBe('912');
    expect(at('X5')).toBeNull();
  });
});
