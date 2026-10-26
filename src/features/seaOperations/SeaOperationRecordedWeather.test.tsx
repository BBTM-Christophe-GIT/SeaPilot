import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptySeaOperation, type SeaOperationWaypoint } from './seaOperationModel';
import type { SeaOperationRecord } from './seaOperationQueries';
import type { ObservationResult } from './seaOperationWeatherObservationsModel';
import { SeaOperationRecordedWeather } from './SeaOperationRecordedWeather';

const calls = vi.hoisted(() => ({ weather: vi.fn(), save: vi.fn(), sign: vi.fn(), revise: vi.fn(), remove: vi.fn(), read: vi.fn() }));
vi.mock('./seaOperationQueries', () => ({ saveSeaOperation: calls.save, signSeaOperation: calls.sign,
  reviseSeaOperation: calls.revise, deleteSeaOperation: calls.remove, fetchSeaOperationWeatherObservations: calls.read }));
vi.mock('./SeaOperationWeatherCard', () => ({ SeaOperationWeatherCard: (props: Record<string, unknown>) => {
  calls.weather(props);
  const point = props.point as SeaOperationWaypoint;
  const observations = props.observations as readonly ObservationResult[] | undefined;
  return <div data-testid={`saved-weather-${point.id}`}>{point.descriptionVhf} · ETA {point.eta}
    {point.weather?.waves ? <span>Prévision Hs conservée : {point.weather.waves.heightMeters}</span> : null}
    {observations?.length ? <span>Mesures conservées : {observations.length}</span> : null}</div>;
} }));

function fixture(overrides: Partial<SeaOperationRecord> = {}): SeaOperationRecord {
  const draft = emptySeaOperation();
  draft.waypoints = [{ id: 'saved-wp', number: '7', descriptionVhf: 'Approche enregistrée', latitude: '49.65', longitude: '-1.62',
    eta: '2026-10-27T12:07', ukc: '2', denseTraffic: false }];
  draft.waypoints[0].weather = { pointId: 'saved-wp', latitude: 49.65, longitude: -1.62, etaUtc: '2026-10-27T11:07:00Z',
    fetchedAt: '2026-10-26T08:00:00Z', attribution: 'Open-Meteo', sourceUrl: 'https://open-meteo.com/en/docs/marine-weather-api',
    wind: null, waves: { time: '2026-10-27T11:00:00Z', heightMeters: 0.6, periodSeconds: 6, directionDegrees: 220, component: 'swell' },
    windMessage: 'Vent indisponible.', wavesMessage: '' };
  return { id: 'saved-operation', companyId: 1, version: 4, status: 'draft', draft,
    createdBy: 'armament-server-account', createdByName: 'Armement', createdAt: '2026-10-26T07:00:00Z',
    updatedBy: 'captain-server-account', updatedByName: 'Camille MARTIN', updatedAt: '2026-10-26T08:00:00Z',
    signedBy: null, signedByName: null, signedAt: null, captainName: null, canEdit: true, canSign: true, ...overrides };
}

function observation(): ObservationResult {
  return { pointId: 'saved-wp', latitude: 49.65, longitude: -1.62, etaUtc: '2026-10-27T11:07:00Z',
    recordedAt: '2026-10-28T09:30:00Z', status: 'pending', message: 'Recherche de mesures officielles en cours.', wind: null, waves: null };
}

const latestWeatherProps = () => calls.weather.mock.calls.at(-1)![0] as Record<string, unknown>;
const expectNoQuery = () => {
  for (const query of [calls.save, calls.sign, calls.revise, calls.remove, calls.read]) expect(query).not.toHaveBeenCalled();
};

describe('recorded waypoint weather', () => {
  beforeEach(() => vi.clearAllMocks());

  it('labels a saved draft before signature and withholds any stale signature and annex metadata', () => {
    const record = fixture({ signedAt: '2026-10-26T09:00:00Z', weatherObservations: [observation()] });
    const refresh = vi.fn();
    render(<SeaOperationRecordedWeather record={record} hasUnsavedChanges={false} onRefresh={refresh} />);
    expect(screen.getByText('Version 4 · Prévisions du brouillon sauvegardé, avant signature.')).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText(/Prévisions conservées avec la décision/)).not.toBeInTheDocument();
    expect(latestWeatherProps()).toMatchObject({ point: record.draft.waypoints[0], variant: 'comparison' });
    expect(latestWeatherProps().validatedAt).toBeUndefined();
    expect(latestWeatherProps().observations).toBeUndefined();
    expect(refresh).not.toHaveBeenCalled();
    expectNoQuery();
  });

  it('maps the saved revision rather than an independently edited draft', () => {
    const record = fixture();
    record.draft.waypoints.push({ ...record.draft.waypoints[0], id: 'saved-wp-2', number: '', descriptionVhf: '' });
    const currentDraft = structuredClone(record.draft);
    currentDraft.waypoints[0].descriptionVhf = 'Modification non enregistrée';
    currentDraft.waypoints[0].eta = '2026-10-28T18:00';
    currentDraft.waypoints.pop();
    const original = structuredClone(record);
    render(<SeaOperationRecordedWeather record={record} hasUnsavedChanges onRefresh={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Waypoint 7 · Approche enregistrée' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Waypoint 2' })).toBeVisible();
    expect(screen.getByTestId('saved-weather-saved-wp')).toHaveTextContent('ETA 2026-10-27T12:07');
    expect(screen.queryByText(/Modification non enregistrée/)).not.toBeInTheDocument();
    const renderedPoints = calls.weather.mock.calls.map(([props]) => props.point);
    expect(renderedPoints).toEqual(record.draft.waypoints);
    expect(renderedPoints[0]).toBe(record.draft.waypoints[0]);
    expect(renderedPoints[0]).not.toBe(currentDraft.waypoints[0]);
    expect(record).toEqual(original);
    expectNoQuery();
  });

  it('explains that dirty edits are absent from the latest recorded version', () => {
    const record = fixture();
    const view = render(<SeaOperationRecordedWeather record={record} hasUnsavedChanges onRefresh={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Ces cartes reprennent la dernière version enregistrée. Enregistrez vos modifications');
    view.rerender(<SeaOperationRecordedWeather record={record} hasUnsavedChanges={false} onRefresh={vi.fn()} />);
    expect(screen.queryByText(/Ces cartes reprennent la dernière version enregistrée/)).not.toBeInTheDocument();
  });

  it.each([
    { profile: 'Marin', account: 'sailor-server-account', canRevise: false },
    { profile: 'Capitaine', account: 'captain-server-account', canRevise: false },
    { profile: 'Administrateur', account: 'admin-server-account', canRevise: true },
  ])('remains a read-only comparison for the authenticated $profile record capabilities', ({ account, canRevise }) => {
    const record = fixture({ updatedBy: account, canEdit: false, canSign: false, canRevise, canDelete: canRevise });
    const original = structuredClone(record);
    render(<SeaOperationRecordedWeather record={record} hasUnsavedChanges={false} onRefresh={vi.fn()} />);
    const region = screen.getByRole('region', { name: 'Météo enregistrée aux waypoints' });
    expect(within(region).queryByRole('button')).not.toBeInTheDocument();
    expect(within(region).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(region).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByTestId('saved-weather-saved-wp')).toBeVisible();
    expect(record).toEqual(original);
    expectNoQuery();
  });

  it('passes the signed timestamp and annex and delegates rereading only to onRefresh', () => {
    const record = fixture({ status: 'signed', signedAt: '2026-10-26T09:00:00Z', canEdit: false, canSign: false,
      weatherObservations: [observation()] });
    const original = structuredClone(record);
    const refresh = vi.fn();
    render(<SeaOperationRecordedWeather record={record} hasUnsavedChanges={false} onRefresh={refresh} />);
    expect(screen.getByText('Version 4 · Prévisions conservées avec la décision du Capitaine.')).toBeVisible();
    expect(latestWeatherProps().validatedAt).toBe(record.signedAt);
    expect(latestWeatherProps().observations).toBe(record.weatherObservations);
    fireEvent.click(screen.getByRole('button', { name: 'Actualiser les mesures enregistrées' }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(record).toEqual(original);
    expectNoQuery();
  });

  it('disables the signed reread action while loading and restores it afterwards', () => {
    const record = fixture({ status: 'signed', signedAt: '2026-10-26T09:00:00Z', canEdit: false, canSign: false });
    const refresh = vi.fn();
    const view = render(<SeaOperationRecordedWeather record={record} hasUnsavedChanges={false} loading onRefresh={refresh} />);
    const loading = screen.getByRole('button', { name: 'Lecture des mesures…' });
    expect(loading).toBeDisabled();
    fireEvent.click(loading);
    expect(refresh).not.toHaveBeenCalled();
    view.rerender(<SeaOperationRecordedWeather record={record} hasUnsavedChanges={false} loading={false} onRefresh={refresh} />);
    const ready = screen.getByRole('button', { name: 'Actualiser les mesures enregistrées' });
    expect(ready).toBeEnabled();
    fireEvent.click(ready);
    expect(refresh).toHaveBeenCalledTimes(1);
    expectNoQuery();
  });

  it('shows a distinct reread error while preserving previously loaded weather and observations', () => {
    const record = fixture({ status: 'signed', signedAt: '2026-10-26T09:00:00Z', weatherObservations: [observation()] });
    const view = render(<SeaOperationRecordedWeather record={record} hasUnsavedChanges={false} onRefresh={vi.fn()} />);
    const priorPoint = latestWeatherProps().point;
    const priorObservations = latestWeatherProps().observations;
    const failedRead = { ...record, weatherHistoryError: 'Lecture des mesures temporairement indisponible. Réessayez.' };
    view.rerender(<SeaOperationRecordedWeather record={failedRead} hasUnsavedChanges={false} onRefresh={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent(failedRead.weatherHistoryError!);
    expect(screen.getByTestId('saved-weather-saved-wp')).toHaveTextContent('Approche enregistrée');
    expect(screen.getByTestId('saved-weather-saved-wp')).toHaveTextContent('Prévision Hs conservée : 0.6');
    expect(screen.getByTestId('saved-weather-saved-wp')).toHaveTextContent('Mesures conservées : 1');
    expect(latestWeatherProps().point).toBe(priorPoint);
    expect(latestWeatherProps().observations).toBe(priorObservations);
    expectNoQuery();
  });

  it('explains when the recorded revision has no waypoint without rendering a weather card', () => {
    const record = fixture();
    record.draft.waypoints = [];
    render(<SeaOperationRecordedWeather record={record} hasUnsavedChanges={false} onRefresh={vi.fn()} />);
    expect(screen.getByText('Aucun waypoint dans cette version enregistrée.')).toBeVisible();
    expect(calls.weather).not.toHaveBeenCalled();
    expectNoQuery();
  });
});
