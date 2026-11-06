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
    expect(sheet.querySelector('autoFilter')?.getAttribute('ref')).toBe('A3:V5');
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
});
