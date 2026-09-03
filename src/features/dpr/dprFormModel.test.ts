import { describe, expect, it } from 'vitest';
import { EMPTY_DPR_PAYLOAD, validateDprPayload } from './dprFormModel.ts';

function validPayload() {
  const payload = structuredClone(EMPTY_DPR_PAYLOAD);
  payload.reportDate = '2026-07-22';
  payload.projectId = 52;
  payload.vesselId = 3;
  payload.description = 'Opérations réalisées sans événement.';
  return payload;
}

describe('validateDprPayload', () => {
  it('accepts a complete DPR validated with Supabase references', () => {
    expect(validateDprPayload(validPayload(), true)).toEqual([]);
  });

  it('requires project, vessel and description only at validation', () => {
    const payload = structuredClone(EMPTY_DPR_PAYLOAD);
    payload.reportDate = '2026-07-22';
    expect(validateDprPayload(payload, false)).toEqual([]);
    expect(validateDprPayload(payload, true)).toEqual(expect.arrayContaining([
      'Le projet est obligatoire avant validation.',
      'Le navire est obligatoire avant validation.',
      'La description de la journée est obligatoire avant validation.',
    ]));
  });

  it('rejects negative quantities, invalid chronology and a TBT without theme', () => {
    const payload = validPayload();
    payload.metrics.fuelConsumedLiters = '-1';
    payload.hseActions.tbtPerformed = true;
    payload.portCalls[0].arrivalAt = '2026-07-22T12:00';
    payload.portCalls[0].departureAt = '2026-07-22T11:00';
    expect(validateDprPayload(payload)).toEqual(expect.arrayContaining([
      'Le thème du TBT est obligatoire lorsque le TBT est coché.',
      "L'appareillage ne peut pas précéder l'accostage.",
      'Les quantités et compteurs ne peuvent pas être négatifs.',
    ]));
  });

  it('enforces the single referenced-or-unlisted project choice', () => {
    const payload = validPayload();
    payload.unlistedProjectName = 'Projet libre';
    expect(validateDprPayload(payload)).toContain('Choisissez un projet référencé ou saisissez un projet hors liste, pas les deux.');
  });

  it('requires one mutually exclusive Port Call category behind Crew Change', () => {
    const payload = validPayload();
    payload.portCalls[0].reasons = ['port-call-14h'];
    expect(validateDprPayload(payload)).toContain('La qualification 14h/24h Port Call nécessite le motif Crew Change.');

    payload.portCalls[0].reasons = ['crew-change', 'port-call-14h', 'port-call-24h'];
    expect(validateDprPayload(payload)).toContain("Une escale Crew Change ne peut être qualifiée qu'en 14h Port Call ou 24h Port Call.");
  });
});
