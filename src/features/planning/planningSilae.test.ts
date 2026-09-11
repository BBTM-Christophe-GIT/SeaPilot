import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { addPlanningDays } from './planningDates';
import { buildSilaeEmployee, buildSilaeRows, isSilaeEligible, silaeMonthRange, type SilaeData, type SilaePerson, type SilaeSource } from './planningSilae';
import { generateSilaeWorkbook } from './planningSilaeWorkbook';

const person: SilaePerson = { id: 1, firstName: 'Pierre', lastName: 'Auguin', employeeNumber: '00004', enimFunctionCode: 'AA01A', enimCategory: '15', functionLabel: 'Capitaine', gradeLabel: '', roleLabel: '', hiredOn: '2020-01-01', departedOn: '', active: true };
const source = (startsOn: string, endsOn: string, status: string, extra: Partial<SilaeSource> = {}): SilaeSource => ({ personId: 1, startsOn, endsOn, status, vesselId: 10, priority: 1, ...extra });
const data = (sources: SilaeSource[]): SilaeData => ({ people: [person], vessels: [{ id: 10, name: 'Navire', registrationNumber: '937905' }, { id: 11, name: 'Second', registrationNumber: '001234' }], sources });
// Actual planning has only these two assignments; the example's rest periods
// are the gaps before, between and after them.
const august = data([source('2026-08-03', '2026-08-10', 'En Mer'), source('2026-08-19', '2026-08-28', 'En Mer')]);

describe('SILAE monthly service lines', () => {
  it('reproduces every populated field in the Pierre AUGUIN August example, with explicit text zeroes', () => {
    const employee = buildSilaeEmployee(august, person, '2026-08');
    expect(employee.issues).toEqual([]);
    expect(employee.periods.map((period) => [period.startsOn, period.endsOn, period.seaDays, period.embarkedDays])).toEqual([
      ['2026-08-01', '2026-08-02', 0, 2], ['2026-08-03', '2026-08-10', 8, 8], ['2026-08-11', '2026-08-18', 0, 8],
      ['2026-08-19', '2026-08-28', 10, 10], ['2026-08-29', '2026-08-31', 0, 2],
    ]);
    const [headers, row] = buildSilaeRows([employee]);
    expect(headers).toHaveLength(482);
    expect(headers.slice(0, 18)).toEqual(['Matricule', 'Salarié', 'ID_Ligne 1', 'DtDeb 1', 'DtFin 1', 'JrsMer 1', 'JrsEmbarque 1', 'NumNavire 1', 'Genre 1', 'Fonction 1', 'Position 1', 'NbjPos15 1', 'ValPos15 1', 'Categ 1', 'Taux ENIM 1', 'NbPart 1', 'JrsNonExo 1', 'HrsNonExo 1']);
    expect(row.slice(0, 18)).toEqual(['00004', 'AUGUIN Pierre', '', '01082026', '02082026', '0', '2', '937905', '01', 'AA01A', '57', '', '', '15', 'COMPL07', '', '', '']);
    expect(row.slice(18, 34)).toEqual(['', '03082026', '10082026', '8', '8', '937905', '01', 'AA01A', '00', '', '', '15', 'COMPL07', '', '', '']);
    expect(row.every((cell) => typeof cell === 'string')).toBe(true);
    expect(employee.periods.reduce((sum, period) => sum + period.embarkedDays, 0)).toBe(30);
  });

  it.each([
    { active: false }, { departedOn: '2026-09-01' }, { hiredOn: '2027-01-01' },
    { firstName: ' ADAM ', lastName: 'Débordeaux' }, { gradeLabel: 'Sédentaire' }, { roleLabel: 'Direction' },
    { functionLabel: 'Fleet Technical Manager' }, { functionLabel: 'Directrice Administrative et Financière' },
  ])('excludes former staff, future hires, sedentary staff and Adam: %j', (changes) => {
    expect(isSilaeEligible({ ...person, ...changes }, '2026-09-11')).toBe(false);
  });

  it('uses present employment for a historical export and retains future departures', () => {
    expect(isSilaeEligible({ ...person, active: false, departedOn: '2026-12-01' }, '2026-09-11')).toBe(true);
    expect(isSilaeEligible({ ...person, departedOn: '2026-09-11' }, '2026-09-11')).toBe(false);
  });

  it('clips month boundaries, joins En Mer/A Terre and splits on a ship change', () => {
    const result = buildSilaeEmployee(data([source('2026-08-10', '2026-09-10', 'En Mer'), source('2026-09-11', '2026-09-20', 'A Terre'), source('2026-09-21', '2026-10-03', 'En Mer', { vesselId: 11 })]), person, '2026-09');
    expect(result.issues).toEqual([]);
    expect(result.periods.map((p) => [p.startsOn, p.endsOn, p.seaDays, p.registrationNumber])).toEqual([['2026-09-01', '2026-09-20', 20, '937905'], ['2026-09-21', '2026-09-30', 10, '001234']]);
  });

  it('subtracts only once and keeps real dates when the last rest is a single day', () => {
    const result = buildSilaeEmployee(data([source('2026-08-01', '2026-08-30', 'En Mer'), source('2026-08-31', '2026-08-31', 'Congés')]), person, '2026-08');
    expect(result.periods[1]).toMatchObject({ startsOn: '2026-08-31', endsOn: '2026-08-31', seaDays: 0, embarkedDays: 0 });
  });

  it('adds two JrsMer once in February, without changing JrsEmbarque or dates', () => {
    const result = buildSilaeEmployee(data([source('2026-02-01', '2026-02-10', 'En Mer'), source('2026-02-11', '2026-02-20', 'Repos'), source('2026-02-21', '2026-02-28', 'A Terre')]), person, '2026-02');
    expect(result.issues).toEqual([]);
    expect(result.periods.map((p) => [p.seaDays, p.embarkedDays])).toEqual([[10, 10], [0, 10], [10, 8]]);
  });

  it('retains the previous known ship at rest, or the first of the month when none precedes it', () => {
    const inputs = data([source('2026-09-01', '2026-09-04', 'Repos', { vesselId: null }), source('2026-09-05', '2026-09-30', 'En Mer', { vesselId: 11 })]);
    expect(buildSilaeEmployee(inputs, person, '2026-09').periods[0].registrationNumber).toBe('001234');
    inputs.sources.push(source('2026-08-01', '2026-08-15', 'En Mer'));
    expect(buildSilaeEmployee(inputs, person, '2026-09').periods[0].registrationNumber).toBe('937905');
  });

  it('honours daily edits and approved leave, and rejects conflicting sources at the same level', () => {
    const inputs = data([source('2026-09-01', '2026-09-30', 'En Mer'), source('2026-09-02', '2026-09-02', 'Repos', { priority: 3 }), source('2026-09-03', '2026-09-04', 'Congés', { priority: 4, vesselId: null })]);
    expect(buildSilaeEmployee(inputs, person, '2026-09').periods.map((p) => [p.startsOn, p.endsOn, p.state])).toEqual([['2026-09-01', '2026-09-01', 'sea'], ['2026-09-02', '2026-09-04', 'rest'], ['2026-09-05', '2026-09-30', 'sea']]);
    inputs.sources.push(source('2026-09-01', '2026-09-01', 'Repos'));
    expect(buildSilaeEmployee(inputs, person, '2026-09').issues.join()).toContain('contradictoire');
  });

  it.each([
    ['2026-08', 'En Mer', '31 jours sans repos'], ['2026-02', 'Repos', 'Février sans travail'],
    ['2028-02', 'En Mer', '29 jours'], ['2026-09', 'Arrêt Maladie', 'Statut à préciser'],
    ['2026-09', 'Accident du Travail', 'Statut à préciser'], ['2026-09', '', 'non renseigné'],
  ])('blocks unspecified rule %s / %s', (month, status, expected) => {
    const range = silaeMonthRange(month);
    const result = buildSilaeEmployee(data([source(range.start, range.end, status)]), person, month);
    expect(result.issues.join()).toContain(expected);
    expect(() => buildSilaeRows([result])).toThrow();
  });

  it('blocks missing HR data, ships and mid-month hires', () => {
    const result = buildSilaeEmployee(data([source('2026-09-02', '2026-09-30', 'En Mer', { vesselId: null })]), { ...person, employeeNumber: '', enimFunctionCode: '', enimCategory: '', hiredOn: '2026-09-02' }, '2026-09');
    expect(result.issues).toHaveLength(5);
  });

  it('does not truncate 31 alternating periods, and rejects empty/duplicate/ineligible selections', () => {
    const result = buildSilaeEmployee(data(Array.from({ length: 31 }, (_, i) => source(addPlanningDays('2026-08-01', i), addPlanningDays('2026-08-01', i), i % 2 ? 'Repos' : 'En Mer'))), person, '2026-08');
    expect(buildSilaeRows([result])[0]).toHaveLength(498);
    expect(() => buildSilaeRows([])).toThrow();
    expect(() => buildSilaeRows([result, result])).toThrow('matricule');
    expect(() => buildSilaeRows([{ ...result, person: { ...person, departedOn: '2026-09-01' } }])).toThrow('éligible');
  });

  it('writes every Excel cell as native text, preserves zeroes, escapes XML and never emits formulas or totals', async () => {
    const result = buildSilaeEmployee(august, { ...person, firstName: '=Test & <Pierre>' }, '2026-08');
    const zip = await JSZip.loadAsync(await generateSilaeWorkbook([result]));
    const sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    const styles = await zip.file('xl/styles.xml')!.async('string');
    const doc = new DOMParser().parseFromString(sheet, 'application/xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.querySelectorAll('c')).toHaveLength(964);
    expect([...doc.querySelectorAll('c')].every((cell) => cell.getAttribute('t') === 'inlineStr' && ['1', '2'].includes(cell.getAttribute('s') || ''))).toBe(true);
    expect(doc.querySelector('c[r="A2"] t')?.textContent).toBe('00004');
    expect(doc.querySelector('c[r="D2"] t')?.textContent).toBe('01082026');
    expect(doc.querySelector('c[r="I2"] t')?.textContent).toBe('01');
    expect(doc.querySelector('c[r="B2"] t')?.textContent).toBe('AUGUIN =Test & <Pierre>');
    expect(doc.querySelector('f')).toBeNull();
    expect(sheet).not.toContain('Totaux');
    expect(styles.match(/numFmtId="49"/g)).toHaveLength(2);
  });
});
