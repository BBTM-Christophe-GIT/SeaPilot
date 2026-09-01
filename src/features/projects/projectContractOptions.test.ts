import { describe, expect, it } from 'vitest';
import {
  BAREBOAT_CONTRACT_TYPE,
  DEFAULT_BAREBOAT_CONTRACT_FIELDS,
  DEFAULT_TOWAGE_OPTIONAL_COSTS,
  normalizeProjectContractType,
  towageOptionalCostsWithDefault,
  withBareboatContractDefaults,
  withTowageContractDefaults,
} from './projectContractOptions';
import { localTodayIso } from './projectBareboatContract';

describe('towage contract defaults', () => {
  it('keeps the optional costs on two consecutive lines', () => {
    expect(DEFAULT_TOWAGE_OPTIONAL_COSTS).toBe(
      'Remorqueur au port : 3400€ HT / 24h.\nRemorqueur en mer : 4900€ HT / 24h (fuel inclus).',
    );
    expect(DEFAULT_TOWAGE_OPTIONAL_COSTS.match(/\n/g)).toHaveLength(1);
  });

  it('upgrades the former defaults while preserving custom clauses', () => {
    const defaultWithBlankLine = 'Remorqueur au port : 3400€ HT / 24h\r\n\r\nRemorqueur en mer : 4900€ HT / 24h (fuel inclus)';
    const defaultOnOneLine = 'Remorqueur au port : 3400€ HT / 24h. Remorqueur en mer : 4900€ HT / 24h (fuel inclus)';
    expect(towageOptionalCostsWithDefault(defaultWithBlankLine)).toBe(DEFAULT_TOWAGE_OPTIONAL_COSTS);
    expect(towageOptionalCostsWithDefault(defaultOnOneLine)).toBe(DEFAULT_TOWAGE_OPTIONAL_COSTS);
    expect(towageOptionalCostsWithDefault('Tarification spéciale')).toBe('Tarification spéciale');
  });

  it('applies the two-line default to a new towage contract', () => {
    expect(withTowageContractDefaults({}).optional_costs).toBe(DEFAULT_TOWAGE_OPTIONAL_COSTS);
  });
});

describe('bareboat charter contract defaults', () => {
  it('normalizes the attached bareboat wording without changing time charters', () => {
    expect(normalizeProjectContractType("Contrat d'Affrètement")).toBe(BAREBOAT_CONTRACT_TYPE);
    expect(normalizeProjectContractType('Contrat d’affrètement coque nue')).toBe(BAREBOAT_CONTRACT_TYPE);
    expect(normalizeProjectContractType('Affrètement à temps')).toBe('BIMCO');
  });

  it('applies the legal defaults while preserving project-specific values', () => {
    expect(withBareboatContractDefaults({})).toMatchObject(DEFAULT_BAREBOAT_CONTRACT_FIELDS);
    expect(withBareboatContractDefaults({})).toMatchObject({
      bareboat_contract_date: localTodayIso(),
      bareboat_contract_place: 'Cherbourg-En-Cotentin',
      bareboat_delivery_by_truck: 'false',
    });
    expect(withBareboatContractDefaults({ bareboat_contract_place: 'LE HAVRE' }).bareboat_contract_place)
      .toBe('Cherbourg-En-Cotentin');
    expect(withBareboatContractDefaults({ bareboat_jurisdiction: 'Tribunal de commerce de Cherbourg' }))
      .toMatchObject({
        bareboat_applicable_law: 'Française',
        bareboat_jurisdiction: 'Tribunal de commerce de Cherbourg',
      });
  });
});
