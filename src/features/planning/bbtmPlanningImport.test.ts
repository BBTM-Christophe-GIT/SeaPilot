import { describe, expect, it } from 'vitest';
import {
  BBTM_IMPORT_SOURCE_LABEL,
  buildBbtmImportSql,
  cleanBbtmPersonName,
  classifyBbtmValue,
  normalizePersonKey,
  type BbtmImportPreview,
} from './bbtmPlanningImport';

describe('BBTM planning import rules', () => {
  it.each([
    ['LR', 'LE ROZEL'],
    ['RZL', 'LE ROZEL'],
    ['SU/LDM', 'SUROIT'],
    ['SU/LH', 'SUROIT'],
    ['KD', 'KROKDUR'],
    ['KDR', 'KROKDUR'],
    ['GRY', 'GOURY'],
    ['HIR', 'HIRONDELLE DE LA MANCHE'],
    ['LDM', 'LANDEMER'],
    ['HE', 'HOLENN EUSA'],
    ['LH', 'YARD - LE HAVRE'],
    ['CH', 'ARMEMENT CHERBOURG'],
  ])('maps %s to %s', (source, expected) => {
    expect(classifyBbtmValue(source)).toMatchObject({ kind: 'assignment', vesselName: expected });
  });

  it('maps personal statuses with the approved SeaPilot labels and comments', () => {
    expect(classifyBbtmValue('CP')).toMatchObject({ kind: 'status', sailorStatus: 'Vacance', comment: '' });
    expect(classifyBbtmValue('Dentiste')).toMatchObject({ kind: 'status', sailorStatus: 'Vacance', comment: 'Dentiste' });
    expect(classifyBbtmValue('Vacances')).toMatchObject({ kind: 'status', sailorStatus: 'Vacance', comment: '' });
    expect(classifyBbtmValue('Formation CQALI')).toMatchObject({ kind: 'status', sailorStatus: 'A Terre', comment: 'En formation' });
    expect(classifyBbtmValue('AST')).toMatchObject({ kind: 'status', sailorStatus: 'A Terre', comment: 'Astreinte' });
    expect(classifyBbtmValue('TT')).toMatchObject({ kind: 'status', sailorStatus: 'A Terre', comment: 'Télétravail' });
    expect(classifyBbtmValue('VM')).toMatchObject({ kind: 'status', sailorStatus: 'A Terre', comment: 'Visite médicale' });
  });

  it.each(['DK', 'SPA', 'BR', 'FLA', 'OR', 'SEANERGY'])('excludes %s', (source) => {
    expect(classifyBbtmValue(source).kind).toBe('excluded');
  });

  it('keeps unapproved free text for review', () => {
    expect(classifyBbtmValue('Hellfest')).toMatchObject({ kind: 'unmapped' });
  });

  it('normalizes emojis, accents and phone numbers for person matching', () => {
    expect(normalizePersonKey('JÉRÉMI TIPHAIGNE 🍕')).toBe('JEREMI TIPHAIGNE');
    expect(normalizePersonKey('AMAURY DEHOUL 07 66 03 22 13')).toBe('AMAURY DEHOUL');
  });

  it('removes icons and phone numbers from displayed person names', () => {
    expect(cleanBbtmPersonName('ADRIEN BOIS 🙀')).toBe('ADRIEN BOIS');
    expect(cleanBbtmPersonName('JULIEN LECOCQ ❤️')).toBe('JULIEN LECOCQ');
    expect(cleanBbtmPersonName('GABIN GIOVANNON 07 87 54 39 16')).toBe('GABIN GIOVANNON');
  });

  it('builds an atomic, source-scoped import and rollback bundle', () => {
    const preview = {
      sourceLabel: BBTM_IMPORT_SOURCE_LABEL,
      sourceFile: "C:\\Imports\\BBTM l'été.xlsx",
      cutoffDate: '2026-06-30',
      generatedAt: '2026-07-23T12:00:00.000Z',
      periods: [
        {
          sourceKey: '2026:28:2026-01-01:assignment:SU',
          sheet: '2026',
          person: "Jean D'Armor",
          personKey: 'JEAN D ARMOR',
          personId: 42,
          personActive: true,
          category: 'Équipage',
          vesselName: 'SUROIT',
          vesselId: 4,
          sailorStatus: 'En Mer',
          watchGroup: 'Bordée A',
          startsOn: '2026-01-01',
          endsOn: '2026-01-07',
          dayCount: 7,
          comment: '',
          importable: true,
          warning: '',
        },
        {
          sourceKey: 'blocked',
          sheet: '2026',
          person: 'Inconnu',
          personKey: 'INCONNU',
          personId: null,
          personActive: null,
          category: 'Extra',
          vesselName: 'SUROIT',
          vesselId: 4,
          sailorStatus: 'En Mer',
          watchGroup: '',
          startsOn: '2026-01-08',
          endsOn: '2026-01-08',
          dayCount: 1,
          comment: '',
          importable: false,
          warning: 'Personne absente de SeaPilot',
        },
      ],
      boards: [],
      people: [
        {
          sourceName: "Jean D'Armor 🍕",
          personKey: 'JEAN D ARMOR',
          categories: ['Équipage'],
          personId: 42,
          matchedName: 'Jean Darmore',
          active: true,
          importable: true,
          warning: '',
        },
      ],
      reviewCells: [],
      excludedCells: [],
      metrics: {
        sourcePeople: 2,
        matchedPeople: 1,
        unmatchedPeople: 1,
        inactivePeople: 0,
        importablePeriods: 1,
        blockedPeriods: 1,
        reviewCells: 0,
        excludedCells: 0,
        inferredBoards: 1,
      },
    } satisfies BbtmImportPreview;

    const bundle = buildBbtmImportSql(preview);

    expect(bundle.rowCount).toBe(1);
    expect(bundle.applySql).toContain('begin;');
    expect(bundle.applySql).toContain('commit;');
    expect(bundle.applySql).toContain("'Jean Darmore'");
    expect(bundle.applySql).not.toContain("Jean D''Armor");
    expect(bundle.applySql).toContain("BBTM l''été.xlsx");
    expect(bundle.applySql).toContain('if inserted_count <> 1');
    expect(bundle.applySql).not.toContain("'Inconnu'");
    expect(bundle.rollbackSql).toContain(`source_label = '${BBTM_IMPORT_SOURCE_LABEL}'`);
  });
});
