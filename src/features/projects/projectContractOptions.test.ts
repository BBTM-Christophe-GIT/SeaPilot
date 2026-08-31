import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TOWAGE_OPTIONAL_COSTS,
  towageOptionalCostsWithDefault,
  withTowageContractDefaults,
} from './projectContractOptions';

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
