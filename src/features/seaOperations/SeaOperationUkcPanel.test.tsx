import { readFileSync } from 'node:fs';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SeaOperationUkcPanel } from './SeaOperationUkcPanel';
import { SeaOperationUkcField } from './SeaOperationUkcField';
import { emptySeaOperation, emptySeaOperationWaypoint, type SeaOperationPayload } from './seaOperationModel';
import { calculateSeaOperationCopernicusEstimate, type SeaOperationCopernicusInput, type SeaOperationCopernicusEstimate } from './seaOperationCopernicusModel';
import { fetchSeaOperationWaypointUkc } from './seaOperationUkcQueries';
import { ukcRequestKey } from './seaOperationValidationUkc';
import { seaOperationUkcReference } from './seaOperationWaypointSnapshots';

vi.mock('./seaOperationUkcQueries', () => ({ fetchSeaOperationWaypointUkc: vi.fn() }));
const fixture = JSON.parse(readFileSync('src/features/seaOperations/testFixtures/copernicus-ukc.json', 'utf8'));
const client = {} as SupabaseClient;
const forecast = (input: SeaOperationCopernicusInput = fixture.input) => calculateSeaOperationCopernicusEstimate(input, fixture.provider, fixture.fetchedAt);
function payload(): SeaOperationPayload {
  const draft = emptySeaOperation();
  draft.planning = { date: '2026-10-27', operationId: '2:1', projectId: '2', captainPersonId: '3' };
  draft.vessel.id = '1'; draft.vessel.draftMeters = 2;
  draft.waypoints = [{ ...emptySeaOperationWaypoint('wp-1'), latitude: '49.65', longitude: '-1.62', eta: fixture.input.eta,
    ukcMode: 'automatic', ukc: '12.5' }]; return draft;
}
const load = () => act(async () => { await vi.advanceTimersByTimeAsync(750); });
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date(fixture.fetchedAt)); });
afterEach(() => vi.useRealTimers());

describe('automatic UKC editor loader', () => {
  it('waits for a complete identity, debounces edits, and publishes visible loading and failure statuses', async () => {
    let reject!: (error: Error) => void;
    vi.mocked(fetchSeaOperationWaypointUkc).mockReturnValue(new Promise((_, fail) => { reject = fail; }));
    const draft = payload(), onStatusChange = vi.fn();
    const view = render(<SeaOperationUkcPanel client={client} payload={draft} active onStatusChange={onStatusChange} />);
    expect(fetchSeaOperationWaypointUkc).not.toHaveBeenCalled(); await load();
    const key = ukcRequestKey(seaOperationUkcReference(draft), draft.waypoints[0]);
    expect(onStatusChange).toHaveBeenLastCalledWith({ [key]: { loading: true } }, client);
    await act(async () => reject(new Error('Connexion Copernicus indisponible.')));
    expect(onStatusChange).toHaveBeenLastCalledWith({ [key]: { loading: false, error: 'Connexion Copernicus indisponible.' } }, client);
    view.rerender(<SeaOperationUkcPanel client={client} payload={{ ...draft, vessel: { ...draft.vessel, draftMeters: null } }} active onStatusChange={onStatusChange} />);
    await load(); expect(fetchSeaOperationWaypointUkc).toHaveBeenCalledTimes(1);
    expect(Object.values(onStatusChange.mock.lastCall![0])).toEqual([{ loading: false, error: 'Renseignez le tirant d’eau du navire dans Navires.' }]);
  });

  it('keeps a successful capture stable through parent rerenders and refreshes only on explicit request', async () => {
    const draft = payload(), onUkcLoaded = vi.fn(); vi.mocked(fetchSeaOperationWaypointUkc).mockResolvedValue(forecast());
    const view = render(<SeaOperationUkcPanel client={client} payload={draft} active onUkcLoaded={onUkcLoaded} />);
    await load(); expect(onUkcLoaded).toHaveBeenCalledWith(forecast(), expect.objectContaining({ pointId: 'wp-1', draftMeters: 2 }), client);
    const captured = structuredClone(draft); captured.waypoints[0].ukcForecast = forecast();
    view.rerender(<SeaOperationUkcPanel client={client} payload={captured} active onUkcLoaded={onUkcLoaded} />);
    await load(); expect(fetchSeaOperationWaypointUkc).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Actualiser l’UKC' })); await load();
    expect(fetchSeaOperationWaypointUkc).toHaveBeenCalledTimes(2);
  });

  it.each(['project', 'coordinates', 'eta', 'draught', 'client'] as const)('aborts old work after %s changes and discards its delayed result', async changed => {
    let resolve!: (value: SeaOperationCopernicusEstimate) => void;
    vi.mocked(fetchSeaOperationWaypointUkc).mockReturnValue(new Promise(done => { resolve = done; }));
    const draft = payload(), onUkcLoaded = vi.fn();
    const view = render(<SeaOperationUkcPanel client={client} payload={draft} active onUkcLoaded={onUkcLoaded} />);
    await load(); const signal = vi.mocked(fetchSeaOperationWaypointUkc).mock.calls[0][2]?.signal;
    const updated = structuredClone(draft);
    if (changed === 'project') updated.planning!.projectId = '9';
    if (changed === 'coordinates') updated.waypoints[0].latitude = '49.64';
    if (changed === 'eta') updated.waypoints[0].eta = '2026-10-27T13:00';
    if (changed === 'draught') updated.vessel.draftMeters = 3;
    view.rerender(<SeaOperationUkcPanel client={changed === 'client' ? {} as SupabaseClient : client} payload={updated} active onUkcLoaded={onUkcLoaded} />);
    expect(signal?.aborted).toBe(true); await act(async () => resolve(forecast()));
    expect(onUkcLoaded).not.toHaveBeenCalled();
  });

  it.each(['inactive', 'readOnly', 'preview'] as const)('never calls the authenticated endpoint for an %s form', async mode => {
    render(<SeaOperationUkcPanel client={client} payload={payload()} active={mode !== 'inactive'} readOnly={mode === 'readOnly'} preview={mode === 'preview'} />);
    await load(); expect(fetchSeaOperationWaypointUkc).not.toHaveBeenCalled();
    if (mode === 'readOnly') expect(screen.queryByRole('button', { name: 'Actualiser l’UKC' })).not.toBeInTheDocument();
    else expect(screen.getByRole('button', { name: 'Actualiser l’UKC' })).toBeDisabled();
  });

  it('retains signed captures when transitioning from an editable request', async () => {
    let resolve!: (value: SeaOperationCopernicusEstimate) => void;
    vi.mocked(fetchSeaOperationWaypointUkc).mockReturnValue(new Promise(done => { resolve = done; }));
    const draft = payload(), onUkcLoaded = vi.fn();
    const view = render(<SeaOperationUkcPanel client={client} payload={draft} active onUkcLoaded={onUkcLoaded} />);
    await load(); const signal = vi.mocked(fetchSeaOperationWaypointUkc).mock.calls[0][2]?.signal;
    const signed = structuredClone(draft); signed.waypoints[0].ukcForecast = forecast();
    view.rerender(<SeaOperationUkcPanel client={client} payload={signed} active={false} readOnly onUkcLoaded={onUkcLoaded} />);
    expect(signal?.aborted).toBe(true); await act(async () => resolve(forecast()));
    expect(onUkcLoaded).not.toHaveBeenCalled(); expect(signed.waypoints[0].ukcForecast).toEqual(forecast());
  });
});

describe('UKC editor field', () => {
  it('leaves historical manual text editable and emits an explicit mode switch', () => {
    const draft = payload(), onChange = vi.fn(); delete draft.waypoints[0].ukcMode;
    render(<SeaOperationUkcField payload={draft} point={draft.waypoints[0]} index={0} disabled={false} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('UKC · point 1'), { target: { value: '4.2' } });
    expect(onChange).toHaveBeenLastCalledWith({ ukc: '4.2', ukcMode: 'manual' });
    fireEvent.click(screen.getByRole('button', { name: 'Auto' })); expect(onChange).toHaveBeenLastCalledWith({ ukcMode: 'automatic' });
  });

  it('formats a long automatic value while retaining raw classification and provenance', () => {
    const draft = payload(); draft.waypoints[0].ukcForecast = forecast();
    render(<SeaOperationUkcField payload={draft} point={draft.waypoints[0]} index={0} disabled={false} onChange={vi.fn()} />);
    expect(screen.getByLabelText('UKC · point 1')).toHaveValue('≈ 19,62');
    expect(screen.getByLabelText('UKC · point 1')).toHaveAttribute('readonly');
    expect(screen.getByText('Détails UKC')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Source Copernicus Marine', hidden: true })[0]).toHaveAttribute('href', fixture.provider.source.sourceUrl);
  });

  it('shows an unavailable status without reusing the old manual value', () => {
    const draft = payload();
    render(<SeaOperationUkcField payload={draft} point={draft.waypoints[0]} index={0} disabled={false}
      status={{ loading: false, error: 'Hors horizon du modèle.' }} onChange={vi.fn()} />);
    expect(screen.getByLabelText('UKC · point 1')).toHaveValue('');
    expect(screen.getByRole('status')).toHaveTextContent('Hors horizon du modèle.');
    expect(screen.queryByText(/12,5 m/)).not.toBeInTheDocument();
  });

  it('keeps manual input and both mode buttons immutable in read-only records independently of disabled', () => {
    const draft = payload(); delete draft.waypoints[0].ukcMode;
    render(<SeaOperationUkcField payload={draft} point={draft.waypoints[0]} index={0} disabled={false} readOnly onChange={vi.fn()} />);
    expect(screen.getByLabelText('UKC · point 1')).toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: 'Auto' })).toBeDisabled(); expect(screen.getByRole('button', { name: 'Manuel' })).toBeDisabled();
  });
});
