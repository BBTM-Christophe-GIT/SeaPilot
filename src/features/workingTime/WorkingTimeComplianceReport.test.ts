import { describe, expect, it } from 'vitest';
import { workingTimeComplianceErrorMessage } from './WorkingTimeComplianceReport';

describe('workingTimeComplianceErrorMessage', () => {
  it('does not expose an import-specific timeout message in the compliance report', () => {
    expect(workingTimeComplianceErrorMessage(new Error('canceling statement due to statement timeout')))
      .toBe('La génération du rapport a dépassé le délai serveur. Réduisez le périmètre ou relancez la génération.');
  });
});
