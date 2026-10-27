import { describe, expect, it } from 'vitest';
import { formatClientContactLines } from './clientContact';

describe('client contact presentation', () => {
  it('separates serialized fields while preserving postal lines, punctuation and every contact value', () => {
    const raw = 'Benoit COEVOET · benoit@example.test · +33 2 00 00 00 00 · AGENCE LE HAVRE\nRoute du Môle Central – Port n°372, bâtiment A\n76600 Le Havre, France';
    const result = formatClientContactLines(raw);
    expect(result).toBe('Benoit COEVOET\nbenoit@example.test\n+33 2 00 00 00 00\nAGENCE LE HAVRE\nRoute du Môle Central – Port n°372, bâtiment A\n76600 Le Havre, France');
    expect(formatClientContactLines(result)).toBe(result);
    expect(raw).toContain(' · ');
  });
  it.each(['', 'ACME·Services', 'Service, bâtiment A; quai 2', 'Contact manuel\nTéléphone : +33 2 00 00 00 00\nAdresse libre'])('retains manual text exactly: %s', raw => {
    expect(formatClientContactLines(raw)).toBe(raw);
  });
});
