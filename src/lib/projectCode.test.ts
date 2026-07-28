import { describe, expect, it } from 'vitest';
import { compareProjectCodesNewestFirst } from './projectCode';

describe('project code ordering', () => {
  it('sorts mixed project prefixes by their numeric part, newest first', () => {
    const codes = ['SP-52', 'P266', 'P9', 'SP-105', 'Sans numéro', 'P265'];

    expect([...codes].sort(compareProjectCodesNewestFirst)).toEqual([
      'P266',
      'P265',
      'SP-105',
      'SP-52',
      'P9',
      'Sans numéro',
    ]);
  });

  it('handles leading zeroes and arbitrarily long numbers without numeric overflow', () => {
    const codes = ['P00052', 'SP-53', 'P999999999999999999999999', 'P51'];

    expect([...codes].sort(compareProjectCodesNewestFirst)).toEqual([
      'P999999999999999999999999',
      'SP-53',
      'P00052',
      'P51',
    ]);
  });
});
