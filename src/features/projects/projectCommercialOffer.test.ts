import { describe, expect, it } from 'vitest';
import {
  buildCommercialReserves,
  COMMERCIAL_CHARTER_HIRE_DESCRIPTION_KEY,
  COMMERCIAL_CONDITIONS_DESCRIPTION_KEY,
  COMMERCIAL_CONDITIONS_MODE_KEY,
  COMMERCIAL_DEMOBILISATION_DESCRIPTION_KEY,
  COMMERCIAL_MOBILISATION_DESCRIPTION_KEY,
  COMMERCIAL_RESERVE_AVAILABILITY,
  COMMERCIAL_RESERVE_AVAILABILITY_KEY,
  COMMERCIAL_RESERVE_OTHER_KEY,
  COMMERCIAL_RESERVE_WEATHER,
  COMMERCIAL_RESERVE_WEATHER_KEY,
  formatProjectDocumentEmitterName,
  getCommercialConditionsDescription,
  getCommercialConditionsMode,
  getCommercialIncludedServiceDescriptions,
  getCommercialIncludedServiceRichDescriptions,
  shouldDisplayCommercialOfferRoute,
} from './projectCommercialOffer';

describe('projectCommercialOffer', () => {
  it('omits the commercial-reserves block when no option or free text is supplied', () => {
    expect(buildCommercialReserves({})).toEqual([]);
    expect(buildCommercialReserves({
      [COMMERCIAL_RESERVE_AVAILABILITY_KEY]: 'false',
      [COMMERCIAL_RESERVE_OTHER_KEY]: '   ',
      [COMMERCIAL_RESERVE_WEATHER_KEY]: 'false',
    })).toEqual([]);
  });

  it('keeps selected standard reserves and the trimmed custom reserve in display order', () => {
    expect(buildCommercialReserves({
      [COMMERCIAL_RESERVE_AVAILABILITY_KEY]: 'true',
      [COMMERCIAL_RESERVE_OTHER_KEY]: '  Sous réserve de l’accord du port.  ',
      [COMMERCIAL_RESERVE_WEATHER_KEY]: '1',
    })).toEqual([
      COMMERCIAL_RESERVE_AVAILABILITY,
      COMMERCIAL_RESERVE_WEATHER,
      'Sous réserve de l’accord du port.',
    ]);
  });

  it('trims included-service descriptions and keeps empty values absent', () => {
    expect(getCommercialIncludedServiceDescriptions({
      [COMMERCIAL_CHARTER_HIRE_DESCRIPTION_KEY]: '  Navire et équipage dédiés.  ',
      [COMMERCIAL_DEMOBILISATION_DESCRIPTION_KEY]: '   ',
      [COMMERCIAL_MOBILISATION_DESCRIPTION_KEY]: 'Transit vers le port de livraison.',
    })).toEqual({
      charterHire: 'Navire et équipage dédiés.',
      demobilisation: '',
      mobilisation: 'Transit vers le port de livraison.',
    });
  });

  it('keeps rich commercial descriptions sanitized and defaults historical offers to the structured mode', () => {
    const payload = {
      [COMMERCIAL_CHARTER_HIRE_DESCRIPTION_KEY]: '<p><strong>Navire</strong><script>alert(1)</script> et équipage.</p>',
      [COMMERCIAL_CONDITIONS_DESCRIPTION_KEY]: '<h2>Conditions</h2><p onclick="alert(1)">Transit inclus.</p>',
    };

    expect(getCommercialConditionsMode(payload)).toBe('structured');
    expect(getCommercialIncludedServiceRichDescriptions(payload).charterHire).toBe('<p><strong>Navire</strong> et équipage.</p>');
    expect(getCommercialConditionsDescription(payload)).toBe('<h2>Conditions</h2><p>Transit inclus.</p>');
    expect(getCommercialConditionsMode({ [COMMERCIAL_CONDITIONS_MODE_KEY]: 'free_text' })).toBe('free_text');
    expect(getCommercialConditionsMode({ [COMMERCIAL_CONDITIONS_MODE_KEY]: 'unexpected' })).toBe('structured');
  });

  it('formats the emitter with a preserved first name and an uppercase RH last name', () => {
    expect(formatProjectDocumentEmitterName({
      firstName: 'Christophe',
      functionLabel: 'Directeur commercial',
      lastName: 'Minassian',
    })).toBe('Christophe MINASSIAN');
  });

  it('omits the route when delivery and redelivery use the same port', () => {
    expect(shouldDisplayCommercialOfferRoute('Port de Dieppe', 'Port de Dieppe')).toBe(false);
    expect(shouldDisplayCommercialOfferRoute('  PORT DE DIEPPE ', 'Port-de-Dieppe')).toBe(false);
    expect(shouldDisplayCommercialOfferRoute('Port de Dieppe', 'Le Havre')).toBe(true);
    expect(shouldDisplayCommercialOfferRoute('Port de Dieppe', '')).toBe(true);
  });
});
