import type { SupabaseClient } from '@supabase/supabase-js';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptySeaOperation, type SeaOperationPayload } from './seaOperationModel';
import { SeaOperationsPage } from './SeaOperationsPage';
import { fetchSeaOperationCaptainSignature, fetchSeaOperationData, fetchSeaOperationDetail, fetchSeaOperationPlanning, loadSeaOperationSignature, saveSeaOperation, type SeaOperationData, type SeaOperationPlanningChoice, type SeaOperationRecord } from './seaOperationQueries';
import { fetchSeaOperationProjectDocuments } from './seaOperationDocumentQueries';
import { fetchSeaOperationWaypointWeather } from './seaOperationWeatherQueries';
import { seaOperationEtaUtc, type SeaOperationWeatherInput, type SeaOperationWaypointWeather } from './seaOperationWeatherModel';

// Keep the real weather panel, capture helper, cards, preview and printable document.
// Mock only authenticated RPC/provider boundaries and unrelated heavyweight maps.
vi.mock('./seaOperationQueries', () => ({
  fetchSeaOperationData: vi.fn(), fetchSeaOperationDetail: vi.fn(), fetchSeaOperationPlanning: vi.fn(),
  fetchSeaOperationCaptainSignature: vi.fn(), loadSeaOperationSignature: vi.fn(), saveSeaOperation: vi.fn(),
  signSeaOperation: vi.fn(), fetchSeaOperationWeatherObservations: vi.fn(), reviseSeaOperation: vi.fn(), deleteSeaOperation: vi.fn(),
}));
vi.mock('./seaOperationWeatherQueries', () => ({ fetchSeaOperationWaypointWeather: vi.fn() }));
vi.mock('./seaOperationDocumentQueries', () => ({ fetchSeaOperationProjectDocuments: vi.fn(), createSeaOperationProjectDocumentUrl: vi.fn() }));
vi.mock('./seaOperationPdf', () => ({ exportSeaOperationPdf: vi.fn() }));
vi.mock('./SeaOperationChartsPanel', () => ({ SeaOperationChartsPanel: () => null }));
vi.mock('./SeaOperationWaypointMapEditor', () => ({ SeaOperationWaypointMapEditor: () => null }));
vi.mock('./SeaOperationRouteMap', () => ({ SeaOperationRouteMap: () => null }));

const actor = { id: 'actual-captain-weather-fixture', name: 'Camille MARTIN' };
const client = { fixtureAccountId: actor.id } as unknown as SupabaseClient;
const project = 'METEO-26 - Passage de recette';
const horizonMessage = 'Horizon de prévision dépassé pour cette ETA.';

function mission(): SeaOperationPlanningChoice {
  return {
    operationId: '401:12', projectId: '501', project, client: 'Port de recette', clientContact: 'Client de recette · client@example.test',
    description: 'Opération fictive de vérification du passage plan.',
    vessel: { id: '12', name: 'GOURY', registrationImo: 'RECETTE-12', departurePort: 'Dieppe', arrivalPort: 'Dieppe', etd: '2026-10-23T08:00', eta: '2026-10-23T23:50' },
    captains: [{ personId: '101', name: actor.name, functionLabel: 'Capitaine', hasSignature: false, canSign: true }], canSign: true,
  };
}

function draftFixture(linked = true): SeaOperationPayload {
  const draft = emptySeaOperation(), choice = mission();
  draft.project = project; draft.client = choice.client; draft.clientContact = choice.clientContact; draft.description = choice.description;
  if (linked) draft.planning = { date: '2026-10-23', operationId: choice.operationId, projectId: choice.projectId, captainPersonId: '101' };
  draft.vessel = { ...draft.vessel, ...choice.vessel, captainName: actor.name };
  draft.signature = { captainName: actor.name, date: '2026-10-23', place: 'Dieppe', acknowledged: false };
  draft.waypoints = [{ id: 'weather-flow-point', number: '1', descriptionVhf: 'Approche de Dieppe', latitude: '49.95', longitude: '1.08', ukc: '2 m', eta: '2026-10-25T21:44', denseTraffic: false }];
  return draft;
}

function recordFixture(linked = true): SeaOperationRecord {
  return { id: 'weather-flow-operation', companyId: 1, version: 3, status: 'draft', draft: draftFixture(linked),
    createdBy: 'actual-armament-fixture', createdByName: 'Armement de recette', createdAt: '2026-10-23T07:00:00Z',
    updatedBy: actor.id, updatedByName: actor.name, updatedAt: '2026-10-23T08:00:00Z',
    signedBy: null, signedByName: null, signedAt: null, captainName: null, canEdit: true, canSign: true,
    canRevise: false, canDelete: false };
}

function forecast(input: SeaOperationWeatherInput, unavailable = false): SeaOperationWaypointWeather {
  const etaUtc = seaOperationEtaUtc(input.eta);
  const time = new Date(Math.round(Date.parse(etaUtc) / 3_600_000) * 3_600_000).toISOString();
  return { pointId: input.pointId, latitude: input.latitude, longitude: input.longitude, etaUtc,
    fetchedAt: new Date().toISOString(), attribution: 'Météo-France',
    sourceUrl: 'https://www.data.gouv.fr/datasets/paquets-de-modele-de-vagues-mfwam-resolution-0-025deg',
    wind: unavailable ? null : { time, speedKnots: 14, gustKnots: null, directionDegrees: 245 },
    waves: unavailable ? null : { time, heightMeters: 1.2, periodSeconds: 8, directionDegrees: 260, component: 'swell' },
    windMessage: unavailable ? horizonMessage : '', wavesMessage: unavailable ? horizonMessage : '' };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const form = () => within(document.querySelector('.so-editor-form-pane')!);
const preview = () => within(document.querySelector('.so-editor-document-pane')!);
const editorWeather = () => within(document.querySelector('.so-editor-form-pane .so-passage-field.is-weather')!);
const footer = () => within(screen.getByRole('dialog', { name: 'Fiche Opération en Mer' }).querySelector('.app-dialog__footer')!);
async function step(index: number) {
  await act(async () => { fireEvent.click(within(screen.getByRole('navigation', { name: 'Étapes de la préparation' })).getAllByRole('button')[index]); });
}
async function advance(milliseconds: number) { await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); }); }

async function openFixture(linked = true) {
  let stored = recordFixture(linked);
  const data: SeaOperationData = { companyId: 1, actorId: actor.id, actorName: actor.name, records: [structuredClone(stored)],
    vessels: [{ id: 12, name: 'GOURY', registrationImo: 'RECETTE-12', lengthOverall: '30.62', canSign: true }] };
  vi.mocked(fetchSeaOperationData).mockResolvedValue(data);
  vi.mocked(fetchSeaOperationDetail).mockImplementation(async () => structuredClone(stored));
  vi.mocked(fetchSeaOperationPlanning).mockImplementation(async (_client, date) => ({ date, choices: linked ? [mission()] : [] }));
  vi.mocked(saveSeaOperation).mockImplementation(async (_client, draft) => (stored = { ...stored, draft: structuredClone(draft), version: stored.version + 1 }));
  await act(async () => {
    render(<MemoryRouter initialEntries={['/modules/seaOperations']}><Routes><Route element={<Outlet context={{ client, previewMode: false }} />}>
      <Route path="modules/seaOperations" element={<SeaOperationsPage />} />
    </Route></Routes></MemoryRouter>);
  });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^METEO-26/ })); });
  expect(screen.getByRole('dialog', { name: 'Fiche Opération en Mer' })).toBeVisible();
  return () => structuredClone(stored);
}

beforeEach(() => {
  vi.resetAllMocks(); sessionStorage.clear();
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(new Date('2026-10-23T08:00:00Z'));
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: false, media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.mocked(fetchSeaOperationCaptainSignature).mockResolvedValue(null);
  vi.mocked(loadSeaOperationSignature).mockResolvedValue(null);
  vi.mocked(fetchSeaOperationProjectDocuments).mockResolvedValue([]);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); sessionStorage.clear(); });

describe('Passage Plan weather through the real editor and preview', () => {
  it('keeps the forecast acquisition after applying an ETA and leaving Passage Plan before the debounce expires', async () => {
    vi.mocked(fetchSeaOperationWaypointWeather).mockImplementation(async (_client, input) => forecast(input));
    await openFixture(); await step(2);
    const picker = within(form().getByRole('group', { name: 'ETA · date et heure · point 1' }));
    await act(async () => { fireEvent.change(picker.getByLabelText('Heure de l’ETA (Paris)'), { target: { value: '21:45' } }); });
    await act(async () => { fireEvent.click(picker.getByRole('button', { name: 'Appliquer' })); });
    await step(3);
    expect(fetchSeaOperationWaypointWeather).not.toHaveBeenCalled();
    await advance(750);
    expect(fetchSeaOperationWaypointWeather).toHaveBeenCalledWith(client,
      expect.objectContaining({ projectId: '501', pointId: 'weather-flow-point', eta: '2026-10-25T21:45' }), expect.any(Object));
    expect(preview().getByRole('cell', { name: /Houle Hs\s*1,20\s*m/ })).toHaveTextContent('Vent moyen 10 m14 nd');
    await step(2);
    expect(editorWeather().getByText('1,20')).toBeVisible();
    expect(editorWeather().queryByText(/Prévisions météo non enregistrées/)).not.toBeInTheDocument();
  });

  it('retains a successful out-of-horizon response arriving after leaving Passage Plan and saves its explanation', async () => {
    const response = deferred<SeaOperationWaypointWeather>();
    vi.mocked(fetchSeaOperationWaypointWeather).mockReturnValue(response.promise);
    const stored = await openFixture(); await step(2); await advance(750);
    const [, input, options] = vi.mocked(fetchSeaOperationWaypointWeather).mock.calls[0];
    await step(3);
    expect(options?.signal?.aborted).toBe(false);
    await act(async () => { response.resolve(forecast(input, true)); });
    expect(preview().getByRole('cell', { name: new RegExp(horizonMessage) })).toHaveTextContent(horizonMessage);
    await step(2);
    expect(editorWeather().getByText(horizonMessage)).toBeVisible();
    expect(editorWeather().queryByText(/Prévisions météo non enregistrées/)).not.toBeInTheDocument();
    await act(async () => { fireEvent.click(footer().getByRole('button', { name: 'Enregistrer le brouillon' })); });
    expect(stored().draft.waypoints[0].weather).toMatchObject({ wind: null, waves: null, wavesMessage: horizonMessage });
    expect(preview().getByRole('cell', { name: new RegExp(horizonMessage) })).toHaveTextContent(horizonMessage);
  });

  it('waits for the missing forecast before persisting a draft saved from Armement', async () => {
    const response = deferred<SeaOperationWaypointWeather>();
    vi.mocked(fetchSeaOperationWaypointWeather).mockReturnValue(response.promise);
    const stored = await openFixture();
    await act(async () => { fireEvent.click(footer().getByRole('button', { name: 'Enregistrer le brouillon' })); });
    expect(fetchSeaOperationWaypointWeather).toHaveBeenCalled();
    expect(saveSeaOperation).not.toHaveBeenCalled();
    expect(footer().getByText('Enregistrement…')).toBeVisible();
    const input = vi.mocked(fetchSeaOperationWaypointWeather).mock.calls[0][1];
    await act(async () => { response.resolve(forecast(input)); });
    expect(saveSeaOperation).toHaveBeenCalledOnce();
    expect(stored().draft.waypoints[0].weather).toEqual(forecast(input));
    expect(preview().getByRole('cell', { name: /Houle Hs\s*1,20\s*m/ })).toHaveTextContent('Vent moyen 10 m14 nd');
    expect(form().getByText('Brouillon enregistré.')).toBeVisible();
  });

  it('explains a missing Planning project in the weather column instead of silently pretending the forecast is absent', async () => {
    await openFixture(false); await step(2); await advance(750);
    expect(fetchSeaOperationWaypointWeather).not.toHaveBeenCalled();
    expect(editorWeather().getByText(/projet.*planning/i)).toBeVisible();
    expect(editorWeather().queryByText(/Prévisions météo non enregistrées/)).not.toBeInTheDocument();
  });
});
