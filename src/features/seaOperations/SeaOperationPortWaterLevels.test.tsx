import type { SupabaseClient } from '@supabase/supabase-js';
import { act, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SeaOperationPortWaterLevels } from './SeaOperationPortWaterLevels';
import { emptySeaOperation, isSeaOperationPayload } from './seaOperationModel';
import { cleanPortWaterLevels, retainPortWaterLevel, retainedPortWaterLevel, PORT_WATER_LEVEL_SOURCES, type PortWaterLevelSnapshot } from './seaOperationPortWaterLevel';
import { seaOperationEtaUtc } from './seaOperationWeatherModel';

const level = {
  portKey: 'sandre:123', portName: 'Cherbourg', etaUtc: '2099-01-20T11:00:00.000Z', fetchedAt: '2026-11-20T08:00:00Z',
  latitude: 49.64, longitude: -1.61, sampleLatitude: 49.645, sampleLongitude: -1.61, heightMeters: 0,
  source: 'shom-tolosa', datum: 'model-mean-sea-level', sourceUrl: PORT_WATER_LEVEL_SOURCES['shom-tolosa'].url,
} satisfies PortWaterLevelSnapshot;

function voyage() {
  const payload = emptySeaOperation();
  payload.planning = { date: '2099-01-20', operationId: '4', projectId: '7', captainPersonId: '9' };
  payload.vessel = { ...payload.vessel, id: '2', departurePort: 'Cherbourg', etd: '2099-01-20T12:00',
    arrivalPort: 'Dieppe', eta: '2099-01-20T15:00' };
  return payload;
}

const client = { auth: { getSession: async () => ({ data: { session: { access_token: 'captain-fixture', user: { id: 'captain' } } }, error: null }) } } as unknown as SupabaseClient;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('port water-level snapshots', () => {
  it('queries departure and arrival independently and keeps a signed zero height with its provenance', async () => {
    vi.useFakeTimers();
    const payload = voyage();
    const onCapture = vi.fn();
    const fetchLevel = vi.fn(async (_url: string, request: RequestInit) => {
      const body = JSON.parse(String(request.body));
      return Response.json({ ...level, portKey: body.portKey, etaUtc: seaOperationEtaUtc(body.eta),
        latitude: body.latitude, longitude: body.longitude, sampleLatitude: body.latitude, sampleLongitude: body.longitude });
    });
    vi.stubGlobal('fetch', fetchLevel);
    const view = render(<SeaOperationPortWaterLevels client={client} payload={payload} active disabled={false} onCapture={onCapture} />);
    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(fetchLevel).toHaveBeenCalledTimes(2);
    expect(fetchLevel.mock.calls.map(([url, options]) => [url, JSON.parse(String(options.body)).eta])).toEqual([
      ['/api/sea-operation-ukc', '2099-01-20T12:00'], ['/api/sea-operation-ukc', '2099-01-20T15:00'],
    ]);
    expect(onCapture).toHaveBeenCalledWith('departure', expect.objectContaining({ portName: 'Cherbourg', heightMeters: 0 }), client);
    expect(onCapture).toHaveBeenCalledWith('arrival', expect.objectContaining({ portName: 'Dieppe', heightMeters: 0 }), client);

    const saved = retainPortWaterLevel(payload, 'departure', level);
    expect(isSeaOperationPayload(saved)).toBe(true);
    view.rerender(<SeaOperationPortWaterLevels client={client} payload={saved} active={false} disabled onCapture={onCapture} />);
    const ports = within(screen.getByRole('region', { name: 'Hauteurs d’eau aux ports' }));
    expect(ports.getByText(/0 m · niveau moyen du modèle/)).toBeInTheDocument();
    expect(ports.queryByRole('button', { name: 'Actualiser les hauteurs d’eau' })).not.toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(fetchLevel).toHaveBeenCalledTimes(2);
  });

  it('drops stale levels when the port or its time changes while retaining the other port', () => {
    let payload = retainPortWaterLevel(voyage(), 'departure', level);
    const arrival = { ...level, portName: 'Dieppe', etaUtc: '2099-01-20T14:00:00.000Z' };
    payload = retainPortWaterLevel(payload, 'arrival', arrival);
    expect(retainPortWaterLevel(payload, 'departure', { ...level, fetchedAt: '2026-11-19T08:00:00Z' })).toBe(payload);
    const changed = cleanPortWaterLevels({ ...payload.vessel, etd: '2099-01-20T12:01' });
    expect(changed.portWaterLevels).toEqual({ arrival });
    expect(retainedPortWaterLevel({ ...payload.vessel, departurePort: 'Fécamp' }, 'departure')).toBeUndefined();
  });
});
