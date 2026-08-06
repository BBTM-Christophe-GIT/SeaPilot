import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
  formatWorkingTimeImportPhases,
  parseWorkingTimeImportPhaseText,
} from './workingTimeExcelImportModel';
import { parseWorkingTimeXlsm } from './workingTimeExcelImport';

function inlineCell(address: string, value: string, style = 0): string {
  return `<c r="${address}" s="${style}" t="inlineStr"><is><t>${value}</t></is></c>`;
}

function columnName(number: number): string {
  let value = '';
  for (let current = number; current; current = Math.floor((current - 1) / 26)) {
    value = String.fromCharCode(65 + ((current - 1) % 26)) + value;
  }
  return value;
}

async function syntheticWorkbook(options: { reportedHours?: number; macro?: boolean; workCells?: string[] } = {}): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  zip.file('xl/workbook.xml', `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Janvier" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`);
  zip.file('xl/styles.xml', `<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF156082"/></patternFill></fill></fills><cellXfs count="2"><xf fillId="0"/><xf fillId="2" applyFill="1"/></cellXfs></styleSheet>`);
  const headerCells = [inlineCell('D3', '00h'), inlineCell('AZ3', '00h'), inlineCell('BB3', 'Heures travaillées'), inlineCell('BE3', 'Capitaine'), inlineCell('BF3', 'Navire'), inlineCell('BG3', 'OMI'), inlineCell('BH3', 'Pavillon'), inlineCell('BI3', 'Commentaire')].join('');
  const workCells = (options.workCells || ['E4', 'F4', 'I4', 'J4']).map((address) => `<c r="${address}" s="1"/>`).join('');
  zip.file('xl/worksheets/sheet1.xml', `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="2">${inlineCell('A2', 'Marin')}${inlineCell('B2', 'Alexandre ROUPSARD')}</row><row r="3">${headerCells}</row><row r="4"><c r="C4"><v>46023</v></c>${workCells}<c r="BB4"><v>${options.reportedHours ?? 2}</v></c>${inlineCell('BE4', 'Camille CAPITAINE')}${inlineCell('BF4', 'SUROIT')}${inlineCell('BG4', '1234567')}${inlineCell('BH4', 'France')}${inlineCell('BI4', 'Deux phases')}</row></sheetData></worksheet>`);
  if (options.macro !== false) zip.file('xl/vbaProject.bin', new Uint8Array([1, 2, 3, 4]));
  return zip.generateAsync({ type: 'uint8array' });
}

describe('working-time XLSM parser', () => {
  it('reads styled half-hours, preserves disjoint phases and never executes the macro', async () => {
    const result = await parseWorkingTimeXlsm(await syntheticWorkbook(), 'Alexandre ROUPSARD - 2026.xlsm');

    expect(result.detectedPersonName).toBe('Alexandre ROUPSARD');
    expect(result.detectedYear).toBe(2026);
    expect(result.gridYear).toBe(2026);
    expect(result.warnings).toEqual([]);
    expect(result.macroPresent).toBe(true);
    expect(result.macroExecution).toBe('disabled');
    expect(result.rows[0]).toMatchObject({
      date: '2026-01-01', detectedWorkSeconds: 7200, reportedWorkSeconds: 7200,
      captainName: 'Camille CAPITAINE', vesselName: 'SUROIT', sourceComment: 'Deux phases', issues: [],
    });
    expect(result.rows[0].detectedPhases).toEqual([
      { startMinute: 0, endMinute: 60 },
      { startMinute: 120, endMinute: 180 },
    ]);
  });

  it('flags a mismatch between the declared total and the detected grid', async () => {
    const result = await parseWorkingTimeXlsm(await syntheticWorkbook({ reportedHours: 3 }), 'registre.xlsm');
    expect(result.rows[0].issues).toContain('total_mismatch');
  });

  it('uses the 48 cells between the two midnight boundaries without a half-hour offset', async () => {
    const pierreSlots = [
      ...Array.from({ length: 2 }, (_, index) => index),
      ...Array.from({ length: 7 }, (_, index) => index + 18),
      ...Array.from({ length: 17 }, (_, index) => index + 31),
    ];
    const result = await parseWorkingTimeXlsm(await syntheticWorkbook({
      reportedHours: 13,
      workCells: pierreSlots.map((slot) => `${columnName(5 + slot)}4`),
    }), 'Pierre LEPRETRE - 2026.xlsm');

    expect(result.parserVersion).toBe('seapilot-xlsm-v2');
    expect(result.rows[0].detectedWorkSeconds).toBe(13 * 3600);
    expect(result.rows[0].detectedPhases).toEqual([
      { startMinute: 0, endMinute: 60 },
      { startMinute: 540, endMinute: 750 },
      { startMinute: 930, endMinute: 1440 },
    ]);
    expect(result.rows[0].issues).not.toContain('total_mismatch');
  });

  it('surfaces and traces a mismatch between the filename year and the cached grid year', async () => {
    const result = await parseWorkingTimeXlsm(await syntheticWorkbook(), 'registre annuel 2027.xlsm');
    expect(result.detectedYear).toBe(2027);
    expect(result.gridYear).toBe(2026);
    expect(result.rows[0].date).toBe('2027-01-01');
    expect(result.warnings[0]).toContain('diffère');
    expect(result.rows[0].issues).toContain('source_year_mismatch');
  });

  it('parses corrections at 30-minute precision and rejects overlaps', () => {
    const phases = parseWorkingTimeImportPhaseText('08:00-12:30, 14:00-24:00');
    expect(formatWorkingTimeImportPhases(phases)).toBe('08:00-12:30, 14:00-24:00');
    expect(() => parseWorkingTimeImportPhaseText('08:00-12:30, 12:00-14:00')).toThrow('ne doivent pas se chevaucher');
    expect(() => parseWorkingTimeImportPhaseText('08:15-09:00')).toThrow('Créneau invalide');
  });
});
