// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { emptySeaOperation, emptySeaOperationWaypoint } from './seaOperationModel';
import { calculateSeaOperationCopernicusEstimate, type SeaOperationCopernicusInput, type SeaOperationCopernicusProviderResult } from './seaOperationCopernicusModel';
import { seaOperationUkcPresentation } from './seaOperationUkcPresentation';
import { assessSeaOperationUkc } from './seaOperationUkc';

function fixture() {
  const source = JSON.parse(readFileSync(new URL('./testFixtures/copernicus-ukc.json', import.meta.url), 'utf8')) as {
    input: SeaOperationCopernicusInput; provider: SeaOperationCopernicusProviderResult; fetchedAt: string;
  };
  const payload = emptySeaOperation();
  payload.planning = { date: '2026-10-27', operationId: '1', projectId: source.input.projectId, captainPersonId: '3' };
  payload.vessel.id = source.input.vesselId; payload.vessel.draftMeters = source.input.draftMeters;
  const point = { ...emptySeaOperationWaypoint(source.input.pointId), ukcMode: 'automatic' as const, ukc: 'MANUAL-OLD',
    latitude: String(source.input.latitude), longitude: String(source.input.longitude), eta: source.input.eta,
    ukcForecast: calculateSeaOperationCopernicusEstimate(source.input, source.provider, source.fetchedAt) };
  payload.waypoints = [point];
  return { payload, point, source };
}

describe('retained UKC presentation', () => {
  it('keeps manual annotations and precision unchanged', () => {
    const point = { ...emptySeaOperationWaypoint('manual'), ukc: ' 4,000001 mètres ' };
    expect(seaOperationUkcPresentation(undefined, point)).toMatchObject({ rawValue: ' 4,000001 mètres ', automatic: false,
      approximate: false, displayValue: ' 4,000001 mètres ', caption: '', sourceFootnote: '', details: [] });
  });
  it('presents the matching calculation with model geoid, DMM cell, retained draught, sources and unquantified uncertainty', () => {
    const { payload, point } = fixture();
    const original = structuredClone(payload);
    const result = seaOperationUkcPresentation(payload, point);
    expect(result).toMatchObject({ rawValue: '19.62', displayValue: '≈ 19,62 m', pdfValue: '~ 19,62 m', automatic: true, approximate: true });
    expect(result.sourceFootnote).toContain('profondeur 20,00 m + niveau d’eau 1,62 m − tirant d’eau du navire conservé 2,00 m');
    expect(result.sourceFootnote).toContain('49° 39.000′ N — 001° 37.200′ W');
    expect(result.sourceFootnote).toContain('version 202511');
    expect(result.sourceFootnote).toContain('Incertitude totale non quantifiée');
    expect(result.sourceFootnote).toContain('Heure du réseau du modèle non fournie');
    expect(result.sourceFootnote).toContain('Generated using E.U. Copernicus Marine Service Information.');
    expect(result.sourceFootnote).not.toMatch(/±|95\s*%/);
    expect(result.sourceUrls).toContain('https://doi.org/10.48670/moi-00054');
    expect(payload).toEqual(original);
  });
  it('never reuses manual text or a calculation for another draught, vessel, project, position or ETA in automatic mode', () => {
    const { payload, point } = fixture();
    const variants = [undefined, { ...payload, vessel: { ...payload.vessel, draftMeters: 3 } },
      { ...payload, vessel: { ...payload.vessel, id: '999' } }, { ...payload, planning: { ...payload.planning!, projectId: '999' } }];
    for (const changed of variants) expect(seaOperationUkcPresentation(changed, point)).toMatchObject({ rawValue: '', displayValue: '', approximate: false, sourceUrls: [] });
    for (const patch of [{ latitude: '49.66' }, { eta: '2026-10-27T13:07' }, { ukcForecast: undefined }]) {
      const result = seaOperationUkcPresentation(payload, { ...point, ...patch });
      expect(result.rawValue).toBe(''); expect(result.sourceFootnote).not.toContain('MANUAL-OLD');
    }
  });
  it('rounds only the displayed approximation and classifies the original value near a threshold', () => {
    const { payload, point, source } = fixture();
    source.input.draftMeters = 6; source.provider.cell!.depthMeters = 12.380001;
    payload.vessel.draftMeters = 6;
    point.ukcForecast = calculateSeaOperationCopernicusEstimate(source.input, source.provider, source.fetchedAt);
    const result = seaOperationUkcPresentation(payload, point);
    expect(result.displayValue).toBe('≈ 8,00 m');
    expect(Number(result.rawValue)).toBeGreaterThan(8);
    expect(assessSeaOperationUkc(result.rawValue, 6)?.level).toBe('success');
  });
});
