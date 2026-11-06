import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SeaOperationConsumption } from './seaOperationConsumption';
import { emptySeaOperation } from './seaOperationModel';
import { renderSeaOperationVoyageFuelDetails } from './SeaOperationVoyageFuelMetrics';

const consumption: SeaOperationConsumption = {
  operationId: 'operation',
  canEdit: false,
  calibration: { kind: 'rozel', defaultGaugeUnit: 'percent', nominalCapacityLiters: 18000 },
  reference: { vesselId: 2, transitLitersPerNm: 8, towageLitersPerNm: 12, pricePerLiter: 1.5, priceDate: '2026-11-06' },
  record: null,
};

describe('Sea operation fuel metrics', () => {
  it('shows a towing estimate with the current tariff and without exposing the rate of a different vessel', () => {
    const draft = emptySeaOperation();
    draft.vessel.id = '2';
    draft.applicability.towing = 'yes';
    const view = render(renderSeaOperationVoyageFuelDetails(consumption, draft, 50));
    const metrics = within(screen.getByRole('region', { name: 'Estimation du carburant' }));
    expect(metrics.getByText('600 L')).toBeVisible();
    expect(metrics.getByText('900 € HT')).toBeVisible();
    expect(metrics.getByText('1,64 t')).toBeVisible();
    expect(metrics.getByText('12 L/NM')).toBeVisible();
    view.rerender(renderSeaOperationVoyageFuelDetails(consumption, { ...draft, vessel: { ...draft.vessel, id: '4' } }, 50));
    expect(screen.queryByText('12 L/NM')).not.toBeInTheDocument();
  });

  it('uses recorded litres and the current tariff when a Conso reading exists', () => {
    const draft = emptySeaOperation();
    draft.vessel.id = '2';
    render(renderSeaOperationVoyageFuelDetails({
      ...consumption,
      record: {
        version: 1, updatedAt: '2026-11-06T12:00:00Z', includedInReference: false, completed: true,
        durationMinutes: 240, averageSpeedKnots: 10, gaugeUnit: 'percent', departureGauge: 70, arrivalGauge: 68,
        refuelLiters: null, pricePerLiter: 1, actualArrival: null, distanceNm: 40, departureLiters: 13000,
        arrivalLiters: 12500, consumedLiters: 500, litersPerHour: 125, litersPerNm: 12.5, costEuros: 500,
      },
    }, draft, 50));
    const metrics = within(screen.getByRole('region', { name: 'Carburant du relevé Conso' }));
    expect(metrics.getByText('500 L')).toBeVisible();
    expect(metrics.getByText('750 € HT')).toBeVisible();
    expect(metrics.getByText('12,5 L/NM')).toBeVisible();
  });
});
