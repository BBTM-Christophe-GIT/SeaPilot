import { describe, expect, it } from 'vitest';
import { buildWorkingTimePreviewPdf } from './workingTimePreviewPdf';
import type { WorkingTimePreviewPdfInput } from './workingTimePreviewPdf';

function input(kind: WorkingTimePreviewPdfInput['kind'] = 'register'): WorkingTimePreviewPdfInput {
  return {
    kind,
    personName: 'Alex MARIN',
    vesselName: 'Navire de démonstration',
    periodLabel: 'Octobre 2026',
    days: [{
      date: '2026-10-13',
      phases: [{ startsAt: '2026-10-13T06:00', endsAt: '2026-10-13T19:00', comment: 'Opération pont' }],
      comment: 'Relève organisée avec le quart suivant',
      approval: { status: 'validated', sailorName: 'Alex MARIN', sailorSignedAt: '13/10/2026 19:05', captainName: 'Camille CAPITAINE', captainSignedAt: '13/10/2026 20:00' },
    }],
  };
}

function pageContent(data: WorkingTimePreviewPdfInput): string {
  return buildWorkingTimePreviewPdf(data).document.internal.pages.flat().join('\n');
}

describe('factual preview PDF exports', () => {
  it.each(['register', 'report'] as const)('exports actual hours, comments and approval names without diagnostics in the %s', (kind) => {
    const data = {
      ...input(kind),
      // Even accidentally passing the screen's additional diagnostics must not print them.
      diagnostics: [{ label: 'NON CONFORME', violationCodes: ['rest_24h'], thresholdLabel: 'Seuil de 12 h', excessLabel: 'DEPASSEMENT_AUTOMATIQUE' }],
    };
    const generated = buildWorkingTimePreviewPdf(data);
    const content = generated.document.internal.pages.flat().join('\n');

    expect(content).toContain('(13 h)');
    expect(content).toContain('(11 h)');
    expect(content).toContain('06:00 - 19:00');
    expect(content).toContain('Opération pont');
    expect(content).toContain('Relève organisée avec le quart suivant');
    expect(content).toContain('Alex MARIN');
    expect(content).toContain('Camille CAPITAINE');
    expect(content).toContain('13/10/2026 20:00');
    expect(content).not.toMatch(/NON CONFORME|rest_24h|Seuil de 12 h|DEPASSEMENT_AUTOMATIQUE|non.conform|hachur|écart automatique/i);
    expect(content).not.toContain('1 0 0 rg');
    expect(new TextDecoder().decode(new Uint8Array(generated.document.output('arraybuffer')).slice(0, 4))).toBe('%PDF');
    expect(generated.filename).toBe(`SeaPilot-preversion-${kind === 'register' ? 'registre' : 'rapport'}-Alex-MARIN-2026-10-13.pdf`);
  });

  it('counts overlapping and duplicate intervals once while preserving all user comments', () => {
    const data = input();
    data.days[0].approval = undefined;
    data.days[0].phases = [
      { startsAt: '2026-10-13T08:00', endsAt: '2026-10-13T12:00', comment: 'Préparation' },
      { startsAt: '2026-10-13T10:00', endsAt: '2026-10-13T14:00', comment: 'Manoeuvre' },
      { startsAt: '2026-10-13T08:00', endsAt: '2026-10-13T12:00', comment: 'Préparation' },
    ];
    const content = pageContent(data);

    expect(content).toContain('08:00 - 14:00');
    expect(content).toContain('(6 h)');
    expect(content).toContain('(18 h)');
    expect(content).not.toContain('(12 h)');
    expect(content).toContain('Préparation');
    expect(content).toContain('Manoeuvre');
  });

  it('splits a night shift between both calendar days and does not count it again on the second day', () => {
    const data = input();
    const night = { startsAt: '2026-10-13T22:00', endsAt: '2026-10-14T06:00' };
    data.days = [
      { date: '2026-10-13', phases: [night] },
      { date: '2026-10-14', phases: [night] },
    ];
    const content = pageContent(data);

    expect(content).toContain('22:00 - 24:00');
    expect(content).toContain('00:00 - 06:00');
    expect(content).toContain('(2 h)');
    expect(content).toContain('(6 h)');
    expect(content).toContain('Travail saisi : 8 h');
    expect(content).not.toContain('(16 h)');
  });

  it('preserves a user-authored explanation without adding automatic deviation information', () => {
    const data = input();
    data.days[0].comment = 'Écart signalé au capitaine par le marin.';
    const content = pageContent(data);

    expect(content).toContain('Écart signalé au capitaine par le marin.');
    expect(content).not.toContain('NON CONFORME');
  });

  it.each(['draft', 'reopened'] as const)('does not display historical approval names as current signatures on a %s day', (status) => {
    const data = input();
    data.days[0].approval!.status = status;
    const content = pageContent(data);

    expect(content).not.toContain('Camille CAPITAINE');
    expect(content).not.toContain('Marin : Alex MARIN');
    expect(content).not.toContain('13/10/2026 20:00');
    expect(content).toContain('Opération pont');
  });

  it('rejects impossible or reversed clock records instead of creating an incorrect factual export', () => {
    const empty = input();
    empty.days = [];
    expect(() => buildWorkingTimePreviewPdf(empty)).toThrow('au moins une journée');
    const reversed = input();
    reversed.days[0].phases[0].endsAt = '2026-10-13T05:00';
    expect(() => buildWorkingTimePreviewPdf(reversed)).toThrow('fin de la plage');
    const invalidDay = input();
    invalidDay.days[0].date = '2026-02-31';
    expect(() => buildWorkingTimePreviewPdf(invalidDay)).toThrow('Journée invalide');
  });
});
