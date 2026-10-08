import { describe, expect, it } from 'vitest';
import { normalizeProcedureSearch, normalizeProcedureTags, parseProcedureTags } from './procedureTags';

describe('procedure tags', () => {
  it('preserves the first label while trimming, collapsing spaces and removing duplicates', () => {
    const values = ['  Sécurité   à bord  ', '', 'securite a bord', '  Évacuation ', 'ÉVACUATION', 'machine'];
    expect(normalizeProcedureTags(values)).toEqual(['Sécurité à bord', 'Évacuation', 'machine']);
    expect(values[0]).toBe('  Sécurité   à bord  ');
  });

  it('accepts comma and semicolon separators and removes empty tags', () => {
    expect(parseProcedureTags('  , Sécurité; ; Évacuation, securite;')).toEqual(['Sécurité', 'Évacuation']);
    expect(parseProcedureTags(' , ; ')).toEqual([]);
  });

  it('uses the same case, accent and whitespace rules for searches', () => {
    expect(normalizeProcedureSearch('  SÉCURITÉ   À BORD  ')).toBe('securite a bord');
    expect(normalizeProcedureSearch('')).toBe('');
  });
});
