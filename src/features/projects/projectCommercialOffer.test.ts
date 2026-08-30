import { describe, expect, it } from 'vitest';
import {
  buildCommercialReserves,
  COMMERCIAL_RESERVE_AVAILABILITY,
  COMMERCIAL_RESERVE_AVAILABILITY_KEY,
  COMMERCIAL_RESERVE_OTHER_KEY,
  COMMERCIAL_RESERVE_WEATHER,
  COMMERCIAL_RESERVE_WEATHER_KEY,
  formatProjectDocumentEmitterName,
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
