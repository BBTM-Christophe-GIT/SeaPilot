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
Object.assign(rozel.operation.draft.vessel, { id: '12', name: 'LE ROZEL', registrationImo: '937905', departurePort: 'Le Havre', arrivalPort: 'Brest', etd: '2026-11-05T04:15' });

const suroit: SeaOperationConsumptionWorkbookRow = {
  operation: { id: 'suroit', draft: emptySeaOperation() },
  consumption: {
    ...rozel.consumption, gaugeUnit: 'cm', departureGauge: 105, arrivalGauge: 105,
    consumedLiters: 0, litersPerHour: 0, litersPerNm: 0, refuelLiters: null, pricePerLiter: null,
    costEuros: null, actualArrival: null,
  },
};
Object.assign(suroit.operation.draft.vessel, { id: '13', name: 'SUROIT', registrationImo: '926637' });

async function readWorkbook(blob: Blob) {
  const archive = await JSZip.loadAsync(await blob.arrayBuffer());
  const read = async (path: string) => new DOMParser().parseFromString(await archive.file(path)!.async('string'), 'application/xml');
  const workbook = await read('xl/workbook.xml');
  expect(workbook.querySelector('parsererror')).toBeNull();
  const names = [...workbook.querySelectorAll('sheet')].map(sheet => sheet.getAttribute('name'));
  return { names, readSheet: async (index: number) => {
    const sheet = await read(`xl/worksheets/sheet${index + 1}.xml`);
    expect(sheet.querySelector('parsererror')).toBeNull();
    const at = (address: string) => sheet.querySelector(`c[r="${address}"]`);
    return { sheet, at, numeric: (address: string) => Number(at(address)?.querySelector('v')?.textContent) };
  } };
}

describe('Excel consumption export', () => {
  it('exports direct consumption and leaves unmeasured fuel levels empty', async () => {
    const { readSheet } = await readWorkbook(await buildSeaOperationConsumptionWorkbook([{
      ...rozel,
      consumption: { ...rozel.consumption, gaugeUnit: null, departureGauge: null, arrivalGauge: null,
        departureLiters: null, arrivalLiters: null, consumedLiters: 1335 },
    }]));
    const { at, numeric } = await readSheet(0);
    for (const column of ['L', 'M', 'N', 'O', 'P']) expect(at(`${column}4`)).toBeNull();
    expect(numeric('Q4')).toBe(1335);
  });

  it('writes searchable headers and typed dates, durations and readings for both gauge units', async () => {
    const blob = await buildSeaOperationConsumptionWorkbook([rozel, suroit]);
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const { names, readSheet } = await readWorkbook(blob);
    expect(names).toEqual(['LE ROZEL', 'SUROIT']);
    const { sheet, at, numeric } = await readSheet(0);
    const other = await readSheet(1);

    expect(sheet.querySelector('parsererror')).toBeNull();
    expect(sheet.querySelector('autoFilter')?.getAttribute('ref')).toBe('A3:AD4');
    expect(sheet.querySelector('pane')?.getAttribute('state')).toBe('frozen');
    expect(at('O2')?.textContent).toBe('Consommation');
    expect(at('B4')?.textContent).toBe('LE ROZEL');
    expect(other.at('B4')?.textContent).toBe('SUROIT');
    expect(at('C4')?.getAttribute('t')).toBe('inlineStr');
    expect(at('C4')?.textContent).toBe('=2+2 & <Transit>');
    expect(sheet.querySelector('f')).toBeNull();
    expect(numeric('G4') - numeric('F4')).toBeCloseTo(25 / 24, 8);
    expect(numeric('I4')).toBeCloseTo(25 / 24, 8);
    expect(at('L4')?.textContent).toBe('%');
    expect(at('M4')?.getAttribute('s')).toBe('9');
    expect(numeric('M4')).toBe(0.8);
    expect(other.at('L4')?.textContent).toBe('cm');
    expect(other.numeric('M4')).toBe(105);
    expect(numeric('Q4')).toBe(1335);
    expect(numeric('S4')).toBe(6.675);
    expect(numeric('T4')).toBe(1674.09);
    expect(numeric('V4')).toBe(1.254);
    expect(other.numeric('Q4')).toBe(0);
    expect(other.at('T4')).toBeNull();
    expect(other.at('V4')).toBeNull();
  });

  it('combines source and live readings per vessel and includes the gauge curve on the Rozel tab', async () => {
    const rozelCells = ['=A1', 'Brest', 15, 45815.75, 45815.5, 'Non', -0.25, 2.5, 0.7, null, 0.6, 12000, 900, 150, 60, 1234.5, 0, 1.2];
    const suroitCells = ['Brest', 'Lorient', 8, 46180.25, 46180.5, 'Oui', 0.25, 1.3, 115, 112, 3944.5, 3841.6, 102.9, 17.15, 12.86, 123.48, 0, 1.2, 0.5, 61.74, 'À vérifier', 0, 'R'];
    const blob = await buildSeaOperationConsumptionWorkbook([rozel], {
      rozel: [{ sourceRow: 19, cells: rozelCells }],
      suroit: [{ sourceRow: 7, cells: suroitCells }],
      rozelGauge: [{ sourceRow: 2, cells: [0.1, 459.75] }],
    });
    const { names, readSheet } = await readWorkbook(blob);
    expect(names).toEqual(['LE ROZEL', 'SUROIT']);
    const rozelSheet = await readSheet(0);
    expect(rozelSheet.at('AD4')?.textContent).toBe('SeaPilot');
    expect(rozelSheet.at('AD5')?.textContent).toBe('CX-3-RZL');
    expect(rozelSheet.at('D5')?.getAttribute('t')).toBe('inlineStr');
    expect(rozelSheet.at('D5')?.textContent).toBe('=A1');
    expect(rozelSheet.at('F5')?.getAttribute('s')).toBe('5');
    expect(rozelSheet.numeric('F5')).toBe(45815.75);
    expect(rozelSheet.at('I5')?.getAttribute('s')).toBe('10');
    expect(rozelSheet.numeric('I5')).toBe(-0.25);
    expect(rozelSheet.at('M5')?.getAttribute('s')).toBe('9');
    expect(rozelSheet.numeric('M5')).toBe(0.7);
    expect(rozelSheet.numeric('AE5')).toBe(19);
    expect(rozelSheet.sheet.querySelector('autoFilter')?.getAttribute('ref')).toBe('A3:AJ5');
    expect(rozelSheet.at('A8')?.textContent).toContain('Courbe des soutes');
    expect(rozelSheet.numeric('B10')).toBe(459.75);
    const suroitSheet = await readSheet(1);
    expect(suroitSheet.at('L4')?.textContent).toBe('cm');
    expect(suroitSheet.numeric('U4')).toBe(0);
    expect(suroitSheet.numeric('N4')).toBe(112);
    expect(suroitSheet.numeric('P4')).toBe(3841.6);
    expect(suroitSheet.at('AH4')?.textContent).toBe('À vérifier');
    expect(suroitSheet.at('AJ4')?.textContent).toBe('R');
    expect(suroitSheet.sheet.querySelector('hyperlink, f')).toBeNull();
    expect(rozelSheet.sheet.querySelector('f')).toBeNull();
  });

  it('includes empty fleet vessels in length order and separates registered homonyms', async () => {
    const history = { rozel: [], suroit: [], rozelGauge: [{ sourceRow: 2, cells: [0.1, 459.75] }] };
    const blob = await buildSeaOperationConsumptionWorkbook([rozel], history, [
      { id: 12, name: 'LE ROZEL', registrationImo: '937905', lengthOverall: '19.2' },
      { id: 14, name: 'LE ROZEL', registrationImo: '123456', lengthOverall: '21' },
      { id: 15, name: 'GOURY', registrationImo: '765432', lengthOverall: '36' },
    ]);
    const { names, readSheet } = await readWorkbook(blob);
    expect(names).toEqual(['GOURY', 'LE ROZEL', 'LE ROZEL (2)']);
    expect((await readSheet(0)).at('A4')?.textContent).toBe('Aucun relevé pour ce navire.');
    expect((await readSheet(0)).sheet.querySelector('hyperlink')).toBeNull();
    const homonym = await readSheet(1);
    expect(homonym.at('AD4')).toBeNull();
    expect(homonym.sheet.querySelector('hyperlink')).toBeNull();
    const registered = await readSheet(2);
    expect(registered.at('AD4')?.textContent).toBe('SeaPilot');
    expect(registered.at('A7')?.textContent).toContain('Courbe des soutes');
  });

  it('keeps the Rozel curve separate from a fleet vessel with the same name but no verified registration', async () => {
    const blob = await buildSeaOperationConsumptionWorkbook([], {
      rozel: [], suroit: [], rozelGauge: [{ sourceRow: 2, cells: [0.1, 459.75] }],
    }, [{ id: 1, name: 'LE ROZEL', registrationImo: '', lengthOverall: '21' }]);
    const { names, readSheet } = await readWorkbook(blob);
    expect(names).toEqual(['LE ROZEL', 'LE ROZEL (2)']);
    expect((await readSheet(0)).sheet.querySelector('hyperlink')).toBeNull();
    expect((await readSheet(1)).sheet.querySelector('hyperlink')?.getAttribute('location')).toBe("'LE ROZEL (2)'!A6");
  });

  it('escapes and disambiguates worksheet names safely', async () => {
    const longName = 'A & B "C" / [12] Voyage international';
    const blob = await buildSeaOperationConsumptionWorkbook([], undefined, [
      { id: 1, name: longName, registrationImo: '', lengthOverall: '20' },
      { id: 2, name: longName, registrationImo: '', lengthOverall: '10' },
    ]);
    const { names, readSheet } = await readWorkbook(blob);
    expect(new Set(names).size).toBe(2);
    expect(names.every(name => name && name.length <= 31 && !/[\\/?*:[\]]/.test(name))).toBe(true);
    expect(names[0]).toContain('A & B "C"');
    expect((await readSheet(1)).at('A1')?.textContent).toContain(longName);
  });

  it('exports GPS measurements and leaves trace cells blank for a manual reading', async () => {
    const trace = { startedAt: '2026-11-05T03:15:00.000Z', endedAt: '2026-11-06T04:15:00.000Z',
      durationMinutes: 1500, distanceNm: 220.5, averageSpeedKnots: 8.82, pointCount: 912,
      segmentCount: 2, gapCount: 1, reorderedPointCount: 0, excludedPointCount: 0 };
    const gps = { ...rozel, consumption: { ...rozel.consumption, trace } };
    const blob = await buildSeaOperationConsumptionWorkbook([gps, suroit, rozel]);
    const { readSheet } = await readWorkbook(blob);
    const { at } = await readSheet(0);
    expect(at('W4')?.textContent).toBe('GPS');
    expect(at('W5')?.textContent).toBe('Manuelle');
    expect(Number(at('Y4')?.textContent) - Number(at('X4')?.textContent)).toBeCloseTo(25 / 24, 8);
    expect(Number(at('Z4')?.textContent)).toBeCloseTo(25 / 24, 8);
    expect(at('AA4')?.textContent).toBe('220.5');
    expect(at('AB4')?.textContent).toBe('8.82');
    expect(at('AC4')?.textContent).toBe('912');
    expect(at('X5')).toBeNull();
  });
});
