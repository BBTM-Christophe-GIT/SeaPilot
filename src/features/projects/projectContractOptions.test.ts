import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TOWAGE_OPTIONAL_COSTS,
  towageOptionalCostsWithDefault,
  withTowageContractDefaults,
} from './projectContractOptions';

describe('towage contract defaults', () => {
  it('keeps the optional costs on one continuous line', () => {
    expect(DEFAULT_TOWAGE_OPTIONAL_COSTS).toBe(
      'Remorqueur au port : 3400€ HT / 24h. Remorqueur en mer : 4900€ HT / 24h (fuel inclus)',
    );
    expect(DEFAULT_TOWAGE_OPTIONAL_COSTS).not.toContain('\n');
  });

  it('upgrades the former default while preserving custom clauses', () => {
    const formerDefault = 'Remorqueur au port : 3400€ HT / 24h\r\n\r\nRemorqueur en mer : 4900€ HT / 24h (fuel inclus)';
    expect(towageOptionalCostsWithDefault(formerDefault)).toBe(DEFAULT_TOWAGE_OPTIONAL_COSTS);
    expect(towageOptionalCostsWithDefault('Tarification spéciale')).toBe('Tarification spéciale');
  });

  it('applies the continuous default to a new towage contract', () => {
    expect(withTowageContractDefaults({}).optional_costs).toBe(DEFAULT_TOWAGE_OPTIONAL_COSTS);
  });
});
