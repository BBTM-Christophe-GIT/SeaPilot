import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptySeaOperation, createTransitSeaOperation, DIVING_MEDICAL_KIT, SEA_OPERATION_CHECKS, seaOperationToday, validateSeaOperation, type SeaOperationPayload } from './seaOperationModel';
import { fetchSeaOperationCaptainSignature, fetchSeaOperationVesselContext, fetchSeaOperationVesselCaptainSignature, fetchSeaOperationData, fetchSeaOperationDetail, fetchSeaOperationPlanning, fetchSeaOperationWeatherObservations, loadSeaOperationSignature, saveSeaOperation, signSeaOperation, reviseSeaOperation, deleteSeaOperation, type SeaOperationData, type SeaOperationPlanningContext, type SeaOperationPlanningChoice, type SeaOperationRecord, type SeaOperationVesselContext } from './seaOperationQueries';
import { exportSeaOperationPdf } from './seaOperationPdf';
import { SeaOperationsPage } from './SeaOperationsPage';
import { fetchSeaOperationProjectDocuments } from './seaOperationDocumentQueries';
import type { SeaOperationWaypointWeather } from './seaOperationWeatherModel';
import { seaOperationEtaUtc } from './seaOperationWeatherModel';
import { GOURY_WEATHER_MATRIX, createEmptyVesselWeatherMatrix } from '../fleet/vesselWeatherMatrix';
import { captureSeaOperationRadios } from './seaOperationWaypointSnapshots';
import { captureSeaOperationValidationWeather } from './seaOperationValidationWeather';
import type { ObservationResult } from './seaOperationWeatherObservationsModel';
import { weatherRequestKey, type WeatherRequestStatus } from './seaOperationWeatherStatus';
import { formatSeaLatitude, formatSeaLongitude } from './seaOperationCoordinates';
import { captureSeaOperationValidationUkc, ukcRequestKey, type SeaOperationUkcRequestStatus } from './seaOperationValidationUkc';
import { calculateSeaOperationCopernicusEstimate, COPERNICUS_UKC_PRODUCTS, type SeaOperationCopernicusEstimate } from './seaOperationCopernicusModel';
import { seaOperationUkcReference, type SeaOperationUkcCaptureContext } from './seaOperationWaypointSnapshots';
import { seaOperationPlanningChoiceKey, seaOperationPlanningChoiceLabel, seaOperationPlanningWindowDates } from './seaOperationPlanningWindow';
import { emptyProjectLocationPlan } from '../projects/projectLocation';

const weatherPanelMock = vi.hoisted(() => vi.fn());
const chartsPanelMock = vi.hoisted(() => vi.fn());
const ukcPanelMock = vi.hoisted(() => vi.fn());
const waypointMapMock = vi.hoisted(() => vi.fn());

vi.mock('./seaOperationQueries', () => ({
  fetchSeaOperationData: vi.fn(), fetchSeaOperationDetail: vi.fn(), saveSeaOperation: vi.fn(), signSeaOperation: vi.fn(),
  fetchSeaOperationPlanning: vi.fn(), fetchSeaOperationCaptainSignature: vi.fn(), fetchSeaOperationVesselContext: vi.fn(), fetchSeaOperationVesselCaptainSignature: vi.fn(), loadSeaOperationSignature: vi.fn().mockResolvedValue(null),
  fetchSeaOperationWeatherObservations: vi.fn(), reviseSeaOperation: vi.fn(), deleteSeaOperation: vi.fn(),
}));
vi.mock('./seaOperationValidationWeather', () => ({ captureSeaOperationValidationWeather: vi.fn() }));
vi.mock('./seaOperationValidationUkc', async importOriginal => ({ ...await importOriginal<typeof import('./seaOperationValidationUkc')>(), captureSeaOperationValidationUkc: vi.fn() }));
vi.mock('./seaOperationPdf', () => ({ exportSeaOperationPdf: vi.fn() }));
vi.mock('./seaOperationDocumentQueries', () => ({ fetchSeaOperationProjectDocuments: vi.fn(), createSeaOperationProjectDocumentUrl: vi.fn() }));
vi.mock('./SeaOperationWeatherPanel', () => ({ SeaOperationWeatherPanel: (props: Record<string, unknown>) => { weatherPanelMock(props); return null; } }));
vi.mock('./SeaOperationChartsPanel', () => ({ SeaOperationChartsPanel: (props: Record<string, unknown>) => { chartsPanelMock(props); return <div data-testid="sea-charts-panel" />; } }));
vi.mock('./SeaOperationUkcPanel', () => ({ SeaOperationUkcPanel: (props: Record<string, unknown>) => { ukcPanelMock(props); return null; } }));
vi.mock('./SeaOperationWaypointMapEditor', async importOriginal => {
  const original = await importOriginal<typeof import('./SeaOperationWaypointMapEditor')>();
  return { SeaOperationWaypointMapEditor: (props: Parameters<typeof original.SeaOperationWaypointMapEditor>[0]) => {
    waypointMapMock(props); return <original.SeaOperationWaypointMapEditor {...props} />;
  } };
});

const captainAccount = { id: 'captain-server-account', name: 'Camille MARTIN', canSign: true };
const sailorAccount = { id: 'sailor-server-account', name: 'Alex DUPONT', canSign: false };
const adminAccount = { id: 'admin-server-account', name: 'Alice ADMIN', canSign: false };
type Account = typeof captainAccount;

function plannedMissions(date = seaOperationToday()): SeaOperationPlanningChoice[] {
  return [
    {
      operationId: '401:12', projectId: '501', project: 'BAL-26 - Inspection des balises',
      client: 'Port de Cherbourg', clientContact: 'Léa CLIENT · lea@example.test · +33 2 10 20 30 40', description: 'Inspection des balises du chenal de Cherbourg.',
      vessel: { id: '12', name: 'GOURY', registrationImo: 'CH-100 / IMO 1234567', departurePort: 'Cherbourg', arrivalPort: 'Le Havre', etd: `${date}T08:00`, eta: `${date}T16:00` },
      captains: [{ personId: '101', name: 'MARTIN Camille', functionLabel: 'Capitaine', hasSignature: true, canSign: false }], canSign: false,
    },
    {
      operationId: '402:13', projectId: '502', project: 'BATH-26 - Mesures bathymétriques',
      client: 'Chantier de Caen', clientContact: 'Hugo CLIENT · hugo@example.test · +33 2 50 60 70 80', description: 'Mesures bathymétriques avant travaux sur le chenal.',
      vessel: { id: '13', name: 'LE ROZEL', registrationImo: 'CH-200 / IMO 7654321', departurePort: 'Caen', arrivalPort: 'Dieppe', etd: `${date}T09:30`, eta: `${date}T18:00` },
      captains: [{ personId: '102', name: 'DUPONT Alex', functionLabel: 'Capitaine temporaire', hasSignature: true, canSign: true }], canSign: true,
    },
  ];
}

function profileSignature(personId = '102') {
  return {
    url: `https://signature.example.test/${personId}.png`,
    snapshot: { signature_id: 10, signer_person_id: Number(personId), signer_name: 'Capitaine du Planning', storage_bucket: 'working-time-signatures', storage_path: `fixture/${personId}.png`, mime_type: 'image/png', sha256: 'a'.repeat(64), version_number: 1 },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise, resolve };
}

function noGoDraft(): SeaOperationPayload {
  const draft = emptySeaOperation();
  draft.project = 'Inspection de la bouée';
  draft.vessel = { ...draft.vessel, id: '12', name: 'GOURY', captainName: captainAccount.name };
  draft.decision = 'NO_GO';
  draft.risks = 'Limite météo dépassée, appareillage suspendu.';
  draft.signature = { captainName: captainAccount.name, date: '2026-10-16', place: 'Cherbourg', acknowledged: true };
  return draft;
}

function waypointCaptureDraft(mission = plannedMissions()[1]): SeaOperationPayload {
  const draft = noGoDraft();
  draft.project = mission.project;
  draft.planning = { date: seaOperationToday(), operationId: mission.operationId, projectId: mission.projectId, captainPersonId: mission.captains[0].personId };
  draft.description = 'Description métier conservée pendant les captures.';
  draft.charts = 'Carte SHOM 7000';
  draft.specialPersonnel = [{ name: 'Observateur embarqué', phone: '0200000000' }];
  draft.signature = { ...draft.signature, captainName: mission.captains[0].name, place: mission.vessel.departurePort };
  draft.vessel = { ...draft.vessel, ...mission.vessel, captainName: mission.captains[0].name };
  draft.waypoints = [{ id: 'capture-point', number: '3', descriptionVhf: 'Entrée de Cherbourg', latitude: '49.65', longitude: '-1.62', ukc: '2,4 m validés par le Capitaine', eta: '2026-10-23T14:00', denseTraffic: true }];
  return draft;
}

function waypointWeather(): SeaOperationWaypointWeather {
  return {
    pointId: 'capture-point', latitude: 49.65, longitude: -1.62, etaUtc: '2026-10-23T12:00:00.000Z', fetchedAt: '2026-10-23T08:00:00.000Z',
    wind: { time: '2026-10-23T12:00:00.000Z', speedKnots: 14, gustKnots: null, directionDegrees: 245 },
    waves: { time: '2026-10-23T12:00:00.000Z', heightMeters: 1.2, periodSeconds: 8, directionDegrees: 260, component: 'swell' },
    windMessage: '', wavesMessage: '', attribution: 'Météo-France', sourceUrl: 'https://www.data.gouv.fr/datasets/paquets-de-modele-de-vagues-mfwam-resolution-0-025deg',
  };
}

interface CapturingWeatherPanelProps {
  waypoints: SeaOperationPayload['waypoints'];
  active?: boolean;
  readOnly?: boolean;
  validatedAt?: string | null;
  observations?: readonly ObservationResult[];
  onWeatherLoaded?: (weather: SeaOperationWaypointWeather, context: { projectId: string; pointId: string; latitude: string; longitude: string; eta: string }, sourceClient: unknown) => void;
  onStatusChange?: (statuses: Record<string, WeatherRequestStatus>, sourceClient: unknown) => void;
}
const capturingWeatherPanel = () => weatherPanelMock.mock.lastCall![0] as CapturingWeatherPanelProps;
const waypointWeatherContext = (draft: SeaOperationPayload) => ({ projectId: draft.planning?.projectId || '', pointId: draft.waypoints[0].id, latitude: draft.waypoints[0].latitude, longitude: draft.waypoints[0].longitude, eta: draft.waypoints[0].eta });

interface CapturingUkcPanelProps {
  payload: SeaOperationPayload; active?: boolean; readOnly?: boolean;
  onUkcLoaded?: (capture: SeaOperationCopernicusEstimate, context: SeaOperationUkcCaptureContext, sourceClient: unknown) => void;
  onStatusChange?: (statuses: Record<string, SeaOperationUkcRequestStatus>, sourceClient: unknown) => void;
}
const capturingUkcPanel = () => ukcPanelMock.mock.lastCall![0] as CapturingUkcPanelProps;
function automaticUkcDraft(go = false): SeaOperationPayload {
  const draft = waypointCaptureDraft(), mission = plannedMissions()[1];
  draft.vessel.draftMeters = 2;
  draft.waypoints[0] = { ...draft.waypoints[0], ukcMode: 'automatic', eta: `${new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)}T12:05` };
  if (go) {
    draft.decision = 'GO'; draft.client = mission.client; draft.clientContact = mission.clientContact;
    draft.dapaq = { method: 'nomade', preparedBy: 'captain', agentName: '', agentContact: '' };
    draft.vessel.departureQuay = 'Quai 1'; draft.vessel.arrivalQuay = 'Quai 2';
    draft.applicability = { towing: 'no', cargo: 'no', divingSupport: 'no', supplies: 'no' };
    draft.portServices = ['none']; for (const check of SEA_OPERATION_CHECKS) draft.checks[check.id] = 'yes';
  }
  return draft;
}
function waypointUkc(draft: SeaOperationPayload): SeaOperationCopernicusEstimate {
  const point = draft.waypoints[0], eta = Date.parse(seaOperationEtaUtc(point.eta)), before = Math.floor(eta / 900000) * 900000;
  return calculateSeaOperationCopernicusEstimate({ projectId: draft.planning!.projectId, vesselId: draft.vessel.id, draftMeters: draft.vessel.draftMeters!,
    pointId: point.id, latitude: Number(point.latitude), longitude: Number(point.longitude), eta: point.eta }, { status: 'available', message: '',
    source: { model: 'NWS', ...COPERNICUS_UKC_PRODUCTS.NWS, datum: 'model-geoid', referenceTimeUtc: null,
      sourceUrl: 'https://data.marine.copernicus.eu/product/NWSHELF_ANALYSISFORECAST_PHY_004_013/description' },
    cell: { latitude: 49.65, longitude: -1.62, bounds: { west: -1.64, east: -1.6, south: 49.64, north: 49.66 }, resolutionMeters: 2300,
      depthMeters: 20, depthMinMeters: null, depthMaxMeters: null },
    waterLevel: { timeBeforeUtc: new Date(before).toISOString(), timeAfterUtc: new Date(before + 900000).toISOString(), heightBeforeMeters: 2, heightAfterMeters: 5 } }, new Date(Date.now() - 1000).toISOString());
}
const waypointUkcContext = (draft: SeaOperationPayload): SeaOperationUkcCaptureContext => ({ ...waypointWeatherContext(draft),
  vesselId: draft.vessel.id, draftMeters: draft.vessel.draftMeters! });

function recordFixture(account: Account, overrides: Partial<SeaOperationRecord> = {}): SeaOperationRecord {
  return {
    id: 'sea-operation-server-record', companyId: 1, version: 3, status: 'draft', draft: noGoDraft(),
    createdBy: 'armament-server-account', createdByName: 'Armement', createdAt: '2026-10-16T08:00:00Z',
    updatedBy: account.id, updatedByName: account.name, updatedAt: '2026-10-16T09:00:00Z',
    signedBy: null, signedByName: null, signedAt: null, captainName: null, canEdit: true, canSign: account.canSign,
    ...overrides,
  };
}

function renderAccount(account: Account = captainAccount, record?: SeaOperationRecord, companyId = 1, choices: SeaOperationPlanningChoice[] = [], previewMode = false) {
  const client = { fixtureAccountId: account.id };
  const data: SeaOperationData = {
    companyId, actorId: account.id, actorName: account.name,
    records: record ? [record] : [],
    clients: [{ id: '701', name: 'Client du port', contact: 'Service maritime · contact@example.test' },
      { id: '702', name: 'Client chantier', contact: 'Chantier · chantier@example.test' }],
    vessels: [
      { id: 12, name: 'GOURY', registrationImo: 'IMO-1234567', lengthOverall: '36', canSign: account.canSign },
      { id: 13, name: 'LE ROZEL', registrationImo: 'IMO-7654321', lengthOverall: '19.2', canSign: account.canSign },
    ],
  };
  vi.mocked(fetchSeaOperationData).mockResolvedValue(data);
  const choicesDate = record?.draft.planning?.date || seaOperationToday();
  vi.mocked(fetchSeaOperationPlanning).mockImplementation(async (_client, date) => ({ date, choices: date === choicesDate ? choices : [] }));
  vi.mocked(fetchSeaOperationCaptainSignature).mockResolvedValue(null);
  vi.mocked(fetchSeaOperationVesselContext).mockImplementation(async (_client, date, vesselId) => ({ date, vesselId, captains: [], canSign: false }));
  vi.mocked(fetchSeaOperationVesselCaptainSignature).mockResolvedValue(null);
  vi.mocked(loadSeaOperationSignature).mockResolvedValue(null);
  vi.mocked(fetchSeaOperationProjectDocuments).mockResolvedValue([]);
  if (record) vi.mocked(fetchSeaOperationDetail).mockResolvedValue(record);
  const application = (outletClient = client) => <MemoryRouter initialEntries={['/modules/seaOperations']}><Routes>
    <Route element={<><nav aria-label="Navigation principale"><Link to="/modules/fleet">Navires</Link></nav><Outlet context={{ client: outletClient, previewMode }} /></>}>
      <Route path="modules/seaOperations" element={<SeaOperationsPage />} />
      <Route path="modules/fleet" element={<h1>Flotte destination</h1>} />
    </Route>
  </Routes></MemoryRouter>;
  const view = render(application());
  return { client, data, unmount: view.unmount, rerenderClient: (nextClient: typeof client) => view.rerender(application(nextClient)) };
}

async function openRecord(record: SeaOperationRecord) {
  await userEvent.click(await screen.findByRole('button', { name: new RegExp(record.draft.project) }));
  await screen.findByRole('dialog', { name: 'Fiche Opération en Mer' });
}

const formQueries = () => within(document.querySelector('.so-editor-form-pane')!);
const footerQueries = () => within(screen.getByRole('dialog').querySelector('.app-dialog__footer')!);
const recordActions = (record: SeaOperationRecord) => within(screen.getByRole('group', { name: `Actions pour ${record.draft.project || 'Opération sans titre'}` }));
const stepButton = (index: number) => within(screen.getByRole('navigation', { name: 'Étapes de la préparation' })).getAllByRole('button')[index];
const choiceQueries = (label: string) => within(formQueries().getByRole('group', { name: label }));
const optionLabels: Record<string, string> = { yes: 'Oui', no: 'Non', nomade: 'NOMADE', email: 'Mail à la Capitainerie', armament: 'Armement', captain: 'Capitaine', agent: 'Agent consignataire', sms: 'Pas de mesures autres que le SMS', specific: 'Mesures spécifiques prises', GO: 'GO · la mission peut être réalisée', NO_GO: 'NO GO · la mission ne peut être réalisée' };
const choiceInput = (label: string, value: string) => choiceQueries(label).getByRole('checkbox', { name: optionLabels[value] });
const answerInput = (label: string) => formQueries().getByRole('switch', { name: label });
const etaGroup = (index = 1) => formQueries().getByRole('group', { name: `ETA · date et heure · point ${index}` });
const etaQueries = (index = 1) => within(etaGroup(index));
const etaDayLabel = (date: string) => new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
function expectEtaTime(time: string, picker: ReturnType<typeof within>) {
  const [hours = '', minutes = ''] = time.split(':');
  expect(picker.getByLabelText('Heures de l’ETA (Paris)')).toHaveValue(hours);
  expect(picker.getByLabelText('Minutes de l’ETA (Paris)')).toHaveValue(minutes);
}
function changeEtaTime(picker: ReturnType<typeof within>, time: string) {
  const [hours = '', minutes = ''] = time.split(':');
  fireEvent.change(picker.getByLabelText('Heures de l’ETA (Paris)'), { target: { value: hours } });
  fireEvent.change(picker.getByLabelText('Minutes de l’ETA (Paris)'), { target: { value: minutes } });
}
function expectEta(date: string, time: string, index = 1) {
  expect(etaGroup(index)).toBeVisible();
  expectEtaTime(time, etaQueries(index));
  expect(etaQueries(index).getByRole('button', { name: etaDayLabel(date) }).closest('[role="gridcell"]')).toHaveAttribute('aria-selected', 'true');
}
function applyEta(date: string, time: string, index = 1) {
  const current = capturingWeatherPanel().waypoints[index - 1].eta;
  const displayedDate = /^\d{4}-\d{2}-\d{2}T/.test(current) ? current : seaOperationToday();
  const months = (Number(date.slice(0, 4)) - Number(displayedDate.slice(0, 4))) * 12 + Number(date.slice(5, 7)) - Number(displayedDate.slice(5, 7));
  const picker = etaQueries(index);
  for (let month = 0; month < Math.abs(months); month++) fireEvent.click(picker.getByRole('button', { name: months < 0 ? 'Mois précédent' : 'Mois suivant' }));
  fireEvent.click(picker.getByRole('button', { name: etaDayLabel(date) }));
  changeEtaTime(picker, time);
}
async function selectChoice(label: string, value: string) {
  if (value === 'yes' || value === 'no') {
    if (value === 'no' && answerInput(label).textContent === 'À vérifier') await userEvent.click(answerInput(label));
    if (answerInput(label).getAttribute('aria-checked') !== String(value === 'yes')) await userEvent.click(answerInput(label));
    return;
  }
  const input = choiceInput(label, value);
  if (!(input as HTMLInputElement).checked) await userEvent.click(input);
}
async function chooseMission(choice: SeaOperationPlanningChoice, date = seaOperationToday()) {
  const dated = { ...choice, date };
  await screen.findByRole('option', { name: seaOperationPlanningChoiceLabel(dated) });
  await userEvent.selectOptions(formQueries().getByLabelText('Projet'), seaOperationPlanningChoiceKey(dated));
}

async function chooseTransit() {
  await waitFor(() => expect(formQueries().getByLabelText('Projet')).toBeEnabled());
  await userEvent.selectOptions(formQueries().getByLabelText('Projet'), '__transit');
}

async function saveDraft() {
  await userEvent.click(footerQueries().getByRole('button', { name: 'Enregistrer le brouillon' }));
}

async function decisionStep() {
  await userEvent.click(stepButton(3));
}

function viewport(width: number) {
  vi.stubGlobal('innerWidth', width);
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: width <= 1100, media: query, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  })));
}

beforeEach(() => {
  vi.resetAllMocks(); sessionStorage.clear(); viewport(1440);
  vi.mocked(captureSeaOperationValidationWeather).mockImplementation(async (_client, draft) => draft);
  vi.mocked(captureSeaOperationValidationUkc).mockImplementation(async (_client, draft) => draft);
  vi.mocked(fetchSeaOperationWeatherObservations).mockResolvedValue([]);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); document.body.style.overflow = ''; });

function adminSignedRecord(): SeaOperationRecord {
  const draft = waypointCaptureDraft();
  draft.waypoints[0].weather = waypointWeather();
  return recordFixture(adminAccount, { id: 'admin-signed-record', draft, status: 'signed', canEdit: false, canSign: false,
    canRevise: true, canDelete: true, signedBy: captainAccount.id, signedByName: captainAccount.name,
    signedAt: '2026-10-23T08:15:00Z', signatureSnapshot: profileSignature().snapshot });
}

describe('Saved route map framing in operation forms', () => {
  it('forwards voyage ports and preserves manual map framing through save and reopen', async () => {
    const record = recordFixture(captainAccount, { draft: waypointCaptureDraft() });
    renderAccount(captainAccount, record, 1, plannedMissions());
    let saved = record;
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, draft) => {
      saved = { ...record, version: 4, draft: structuredClone(draft) }; return saved;
    });
    await openRecord(record); await userEvent.click(stepButton(2));
    const map = () => waypointMapMock.mock.lastCall![0] as Parameters<typeof import('./SeaOperationWaypointMapEditor').SeaOperationWaypointMapEditor>[0];
    expect(map()).toMatchObject({ departurePort: record.draft.vessel.departurePort, arrivalPort: record.draft.vessel.arrivalPort });
    expect(map().mapViewport).toBeUndefined();
    const retained = { centerLatitude: 49.6, centerLongitude: -1.4, longitudeSpan: 2.7 };
    act(() => map().onMapViewportChange!(retained));
    expect(capturingUkcPanel().payload.mapViewport).toEqual(retained); expect(capturingUkcPanel().payload.mapViewport).not.toBe(retained);
    await saveDraft(); await waitFor(() => expect(footerQueries().getByText('Version 4 enregistrée')).toBeVisible());
    expect(saved.draft.mapViewport).toEqual(retained);
    await userEvent.click(footerQueries().getByRole('button', { name: 'Annuler' }));
    vi.mocked(fetchSeaOperationDetail).mockResolvedValue(saved);
    await openRecord(saved); await userEvent.click(stepButton(2));
    expect(map().mapViewport).toEqual(retained);
    act(() => map().onMapViewportChange!(undefined));
    expect(capturingUkcPanel().payload.mapViewport).toBeUndefined(); expect(saved.draft.mapViewport).toEqual(retained);
  });

  it('rejects a framing callback from previous voyage ports and from a signed operation', async () => {
    const record = recordFixture(captainAccount, { draft: waypointCaptureDraft() });
    const signed = recordFixture(captainAccount, { id: 'signed-map-framing', draft: { ...waypointCaptureDraft(), project: 'Carte historique signée', mapViewport: { centerLatitude: 49, centerLongitude: -2, longitudeSpan: 4 } }, status: 'signed', canEdit: false });
    const { data } = renderAccount(captainAccount, record, 1, plannedMissions()); data.records.push(signed);
    vi.mocked(fetchSeaOperationDetail).mockImplementation(async (_client, id) => id === signed.id ? signed : record);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await openRecord(record); await userEvent.click(stepButton(2));
    const old = waypointMapMock.mock.lastCall![0] as Parameters<typeof import('./SeaOperationWaypointMapEditor').SeaOperationWaypointMapEditor>[0];
    await userEvent.click(stepButton(0));
    fireEvent.change(formQueries().getByLabelText('Port de départ'), { target: { value: 'Port de Granville' } });
    const stale = { centerLatitude: 44, centerLongitude: -5, longitudeSpan: 10 };
    act(() => old.onMapViewportChange!(stale)); expect(capturingUkcPanel().payload.mapViewport).toBeUndefined();
    await userEvent.click(footerQueries().getByRole('button', { name: 'Annuler' }));
    await openRecord(signed); await userEvent.click(stepButton(2));
    const snapshot = structuredClone(capturingUkcPanel().payload);
    act(() => old.onMapViewportChange!(stale));
    expect(capturingUkcPanel().payload).toEqual(snapshot); expect(signed.draft.mapViewport).toEqual(snapshot.mapViewport);
    expect(formQueries().queryByRole('combobox', { name: 'Mode de cadrage de la carte' })).not.toBeInTheDocument();
  });
});

describe('Transit and editable voyages with real-profile permission fixtures', () => {
  it.each([captainAccount, sailorAccount, adminAccount])('starts a free Transit form with registered clients and the actual vessel captain for $id', async account => {
    const choices = plannedMissions(), { client, data } = renderAccount(account, undefined, 1, choices);
    data.vessels.reverse();
    data.vessels.forEach(vessel => { vessel.canSign = false; }); // A temporary captain grant comes from the dated context.
    vi.mocked(fetchSeaOperationVesselContext).mockImplementation(async (_client, date, vesselId) => ({ date, vesselId,
      captains: [{ personId: '301', name: 'Capitaine du transit', functionLabel: 'Capitaine temporaire', hasSignature: true, canSign: account.canSign }], canSign: account.canSign }));
    vi.mocked(fetchSeaOperationVesselCaptainSignature).mockResolvedValue(profileSignature('301'));
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await chooseMission(choices[0]); await chooseTransit();
    expect(formQueries().getByLabelText('Projet')).toHaveDisplayValue('Transit');
    for (const label of ['Description de l’opération', 'Coordonnées du client', 'Port de départ', 'Port d’arrivée', 'ETD · date et heure de départ', 'ETA · date et heure d’arrivée']) expect(formQueries().getByLabelText(label)).toHaveValue('');
    expect(formQueries().getByLabelText('Navire')).toHaveValue('');
    expect(within(formQueries().getByLabelText('Navire')).getAllByRole('option').map(option => option.textContent)).toEqual(['Choisir un navire', 'GOURY', 'LE ROZEL']);
    expect(formQueries().getByLabelText('Client')).toBeEnabled();
    await userEvent.selectOptions(formQueries().getByLabelText('Client'), '701');
    expect(formQueries().getByLabelText('Coordonnées du client')).toHaveValue(data.clients![0].contact);
    fireEvent.change(formQueries().getByLabelText('Coordonnées du client'), { target: { value: 'Contact opérationnel' } });
    fireEvent.change(formQueries().getByLabelText('Description de l’opération'), { target: { value: 'Transit de Cherbourg à Caen' } });
    await userEvent.selectOptions(formQueries().getByLabelText('Navire'), '12');
    await waitFor(() => expect(formQueries().getByLabelText('Prénom NOM du Capitaine')).toHaveValue('Capitaine du transit'));
    expect(fetchSeaOperationVesselContext).toHaveBeenLastCalledWith(client, seaOperationToday(), '12');
    expect(formQueries().getByLabelText('Immatriculation / IMO')).toHaveValue('IMO-1234567');
    expect(formQueries().getByLabelText('Immatriculation / IMO')).toHaveAttribute('readonly');
    const payload = capturingUkcPanel().payload;
    expect(payload.planning).toBeUndefined(); expect(payload.transit).toEqual({ date: seaOperationToday(), captainPersonId: '301' });
    expect(payload).toMatchObject({ project: 'Transit', clientId: '701', client: 'Client du port', clientContact: 'Contact opérationnel' });
    await decisionStep(); await selectChoice('Décision', 'NO_GO');
    expect(await formQueries().findByRole('img', { name: 'Signature de Capitaine du transit' })).toHaveAttribute('src', profileSignature('301').url);
    const sign = footerQueries().getByRole('button', { name: 'Signer la décision NO GO' });
    if (account.canSign) expect(sign).toBeEnabled(); else expect(sign).toBeDisabled();
    expect(saveSeaOperation).not.toHaveBeenCalled();
  });

  it.each([captainAccount, sailorAccount, adminAccount])('lets $id override a planned voyage and recaptures vessel safety references without retaining the old captain', async account => {
    const choices = plannedMissions();
    choices.forEach(choice => choice.captains.forEach(captain => { captain.canSign = account.canSign; }));
    const draft = automaticUkcDraft(), original = structuredClone(draft);
    draft.vessel.draftMeters = 2; draft.vessel.weatherMatrix = structuredClone(GOURY_WEATHER_MATRIX);
    draft.waypoints[0].ukcForecast = waypointUkc(draft);
    const record = recordFixture(account, { draft }), pending = deferred<SeaOperationVesselContext>();
    const { data } = renderAccount(account, record, 1, choices);
    data.vessels[0].draftMeters = 3.2; data.vessels[0].weatherMatrix = null;
    data.vessels[1].draftMeters = 2; data.vessels[1].weatherMatrix = structuredClone(GOURY_WEATHER_MATRIX);
    vi.mocked(fetchSeaOperationVesselContext).mockReturnValue(pending.promise);
    vi.mocked(fetchSeaOperationVesselCaptainSignature).mockResolvedValue(profileSignature('303'));
    await openRecord(record);
    await waitFor(() => expect(formQueries().getByLabelText('Projet')).toBeEnabled());
    expect(formQueries().getByLabelText('Client')).toBeDisabled();
    for (const [label, value] of [['Port de départ', 'Granville'], ['Quai de départ', 'Quai 5'], ['Port d’arrivée', 'Saint-Malo'], ['Quai d’arrivée', 'Quai 8'], ['ETD · date et heure de départ', '2026-11-01T07:00'], ['ETA · date et heure d’arrivée', '2026-11-01T14:00'], ['Description de l’opération', 'Voyage adapté'], ['Coordonnées du client', 'Autre contact autorisé']]) {
      const input = formQueries().getByLabelText(label); expect(input).toBeEnabled(); expect(input).not.toHaveAttribute('readonly');
      fireEvent.change(input, { target: { value } });
    }
    await userEvent.selectOptions(formQueries().getByLabelText('Navire'), '12');
    expect(formQueries().getByLabelText('Prénom NOM du Capitaine')).toHaveValue('');
    const changed = capturingUkcPanel().payload;
    expect(changed.vessel).toMatchObject({ id: '12', registrationImo: 'IMO-1234567', draftMeters: 3.2, weatherMatrix: null, departurePort: 'Granville', arrivalPort: 'Saint-Malo' });
    expect(changed.waypoints[0].ukcForecast).toBeUndefined();
    expect(changed.signature).toMatchObject({ captainName: '', acknowledged: false });
    expect(changed.planning).toMatchObject({ operationId: choices[1].operationId, projectId: choices[1].projectId, captainPersonId: '' });
    await act(async () => pending.resolve({ date: draft.planning!.date, vesselId: '12', captains: [{ personId: '303', name: 'Capitaine remplaçant', functionLabel: 'Capitaine temporaire', hasSignature: true, canSign: account.canSign }], canSign: account.canSign }));
    await waitFor(() => expect(formQueries().getByLabelText('Prénom NOM du Capitaine')).toHaveValue('Capitaine remplaçant'));
    await decisionStep(); await selectChoice('Décision', 'NO_GO');
    expect(await formQueries().findByRole('img', { name: 'Signature de Capitaine remplaçant' })).toHaveAttribute('src', profileSignature('303').url);
    if (account.canSign) expect(footerQueries().getByRole('button', { name: 'Signer la décision NO GO' })).toBeEnabled();
    else expect(footerQueries().getByRole('button', { name: 'Signer la décision NO GO' })).toBeDisabled();
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, payload) => ({ ...record, draft: structuredClone(payload), version: record.version + 1 }));
    await saveDraft();
    await waitFor(() => expect(saveSeaOperation).toHaveBeenCalled());
    expect(vi.mocked(saveSeaOperation).mock.lastCall![1].vessel).toMatchObject({ etd: '2026-11-01T07:00', eta: '2026-11-01T14:00' });
    expect(record.draft.vessel.id).toBe(original.vessel.id);
  });

  it('saves Transit departure and arrival times with route points and locks the recorded client identity only after saving', async () => {
    const { client, data } = renderAccount(); data.vessels[0].maxSpeedKnots = 12;
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, draft) => recordFixture(captainAccount, { version: 1, draft: structuredClone(draft) }));
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' })); await chooseTransit();
    await userEvent.selectOptions(formQueries().getByLabelText('Client'), '701');
    expect(formQueries().getByLabelText('Client')).toBeEnabled();
    await userEvent.selectOptions(formQueries().getByLabelText('Navire'), '12');
    fireEvent.change(formQueries().getByLabelText('ETD · date et heure de départ'), { target: { value: '2026-11-01T08:00' } });
    fireEvent.change(formQueries().getByLabelText('ETA · date et heure d’arrivée'), { target: { value: '2026-11-01T17:00' } });
    await userEvent.click(stepButton(2));
    const map = waypointMapMock.mock.lastCall![0] as Parameters<typeof import('./SeaOperationWaypointMapEditor').SeaOperationWaypointMapEditor>[0];
    act(() => { map.onAddWaypoint({ latitude: 49.65, longitude: -1.62 }); map.onAddWaypoint({ latitude: 49.67, longitude: -1.25 }); });
    await saveDraft();
    await waitFor(() => expect(footerQueries().getByText('Version 1 enregistrée')).toBeVisible());
    expect(saveSeaOperation).toHaveBeenCalledWith(client, expect.objectContaining({ project: 'Transit', clientId: '701',
      vessel: expect.objectContaining({ etd: '2026-11-01T08:00', eta: '2026-11-01T17:00' }), waypoints: expect.any(Array) }), undefined);
    expect(vi.mocked(saveSeaOperation).mock.lastCall![1].waypoints).toHaveLength(2);
    await userEvent.click(stepButton(0));
    expect(formQueries().getByLabelText('Client')).toBeDisabled(); expect(formQueries().getByLabelText('Client')).toHaveDisplayValue('Client du port');
    fireEvent.change(formQueries().getByLabelText('Client'), { target: { value: '702' } });
    fireEvent.change(formQueries().getByLabelText('Coordonnées du client'), { target: { value: 'Contact après sauvegarde' } });
    expect(capturingUkcPanel().payload).toMatchObject({ clientId: '701', client: 'Client du port', clientContact: 'Contact après sauvegarde' });
    expect(formQueries().getByLabelText('ETD · date et heure de départ')).toHaveValue('2026-11-01T08:00');
    expect(formQueries().getByLabelText('ETA · date et heure d’arrivée')).toHaveValue('2026-11-01T17:00');
  });

  it('loads captain authority for the selected vessel when the original planned mission is no longer available', async () => {
    const draft = waypointCaptureDraft(), record = recordFixture(captainAccount, { draft });
    const { client, data } = renderAccount(captainAccount, record);
    data.vessels.forEach(vessel => { vessel.canSign = false; });
    vi.mocked(fetchSeaOperationVesselContext).mockImplementation(async (_client, date, vesselId) => ({ date, vesselId,
      captains: [{ personId: '303', name: 'Capitaine affecté conservé', functionLabel: 'Capitaine temporaire', hasSignature: true, canSign: true }], canSign: true }));
    vi.mocked(fetchSeaOperationVesselCaptainSignature).mockResolvedValue(profileSignature('303'));
    await openRecord(record);
    await waitFor(() => expect(fetchSeaOperationVesselContext).toHaveBeenCalledWith(client, draft.planning!.date, draft.vessel.id));
    await waitFor(() => expect(formQueries().getByLabelText('Prénom NOM du Capitaine')).toHaveValue('Capitaine affecté conservé'));
    expect(fetchSeaOperationVesselContext).toHaveBeenLastCalledWith(client, draft.planning!.date, draft.vessel.id);
    fireEvent.change(formQueries().getByLabelText('Port de départ'), { target: { value: 'Granville' } });
    expect(formQueries().getByLabelText('Port de départ')).toHaveValue('Granville');
    await decisionStep();
    expect(footerQueries().getByRole('button', { name: 'Signer la décision NO GO' })).toBeEnabled();
  });

  it('keeps a saved Transit client identity outside the active catalog while allowing contact edits and a real mission change', async () => {
    const draft = { ...createTransitSeaOperation(), clientId: '701', client: 'Client historique', clientContact: 'Ancien contact' };
    const record = recordFixture(captainAccount, { draft }), choices = plannedMissions();
    const { data } = renderAccount(captainAccount, record, 1, choices);
    data.clients = data.clients!.filter(client => client.id !== '701');
    await openRecord(record); await waitFor(() => expect(formQueries().getByLabelText('Projet')).toBeEnabled());
    expect(formQueries().getByLabelText('Client')).toHaveDisplayValue('Client historique'); expect(formQueries().getByLabelText('Client')).toBeDisabled();
    fireEvent.change(formQueries().getByLabelText('Coordonnées du client'), { target: { value: 'Nouveau contact' } });
    expect(capturingUkcPanel().payload).toMatchObject({ clientId: '701', client: 'Client historique', clientContact: 'Nouveau contact' });
    await chooseMission(choices[0]);
    expect(formQueries().getByLabelText('Client')).toHaveDisplayValue(choices[0].client);
    expect(capturingUkcPanel().payload.transit).toBeUndefined();
  });

  it('uses the explicit Transit date for captain authority, preserves voyage edits and ignores an old vessel signature response', async () => {
    const { client } = renderAccount(captainAccount), oldSignature = deferred<ReturnType<typeof profileSignature> | null>();
    vi.mocked(fetchSeaOperationVesselContext).mockImplementation(async (_client, date, vesselId) => ({ date, vesselId,
      captains: [{ personId: vesselId === '12' ? '301' : '302', name: `Capitaine ${vesselId} · ${date}`, functionLabel: 'Capitaine temporaire', hasSignature: true, canSign: true }], canSign: true }));
    vi.mocked(fetchSeaOperationVesselCaptainSignature).mockImplementation(async (_client, _date, vesselId) => vesselId === '12' ? oldSignature.promise : profileSignature('302'));
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' })); await chooseTransit();
    fireEvent.change(formQueries().getByLabelText('Description de l’opération'), { target: { value: 'Transit conservé' } });
    await userEvent.selectOptions(formQueries().getByLabelText('Navire'), '12');
    await waitFor(() => expect(fetchSeaOperationVesselCaptainSignature).toHaveBeenCalled());
    fireEvent.change(formQueries().getByLabelText('ETD · date et heure de départ'), { target: { value: '2026-11-02T09:00' } });
    expect(fetchSeaOperationVesselContext).toHaveBeenCalledTimes(1);
    await userEvent.selectOptions(formQueries().getByLabelText('Navire'), '13');
    await waitFor(() => expect(formQueries().getByLabelText('Prénom NOM du Capitaine')).toHaveValue(`Capitaine 13 · ${seaOperationToday()}`));
    fireEvent.change(formQueries().getByLabelText('Date de l’opération'), { target: { value: '2026-10-20' } });
    await waitFor(() => expect(formQueries().getByLabelText('Prénom NOM du Capitaine')).toHaveValue('Capitaine 13 · 2026-10-20'));
    expect(fetchSeaOperationVesselContext).toHaveBeenLastCalledWith(client, '2026-10-20', '13');
    expect(formQueries().getByLabelText('Description de l’opération')).toHaveValue('Transit conservé');
    expect(formQueries().getByLabelText('ETD · date et heure de départ')).toHaveValue('2026-11-02T09:00');
    await decisionStep();
    expect(await formQueries().findByRole('img', { name: 'Signature de Capitaine 13 · 2026-10-20' })).toHaveAttribute('src', profileSignature('302').url);
    await act(async () => oldSignature.resolve(profileSignature('301')));
    expect(formQueries().getByRole('img', { name: 'Signature de Capitaine 13 · 2026-10-20' })).toHaveAttribute('src', profileSignature('302').url);
    expect(formQueries().queryByRole('img', { name: /Signature de Capitaine 12/ })).not.toBeInTheDocument();
  });

  it('ignores old map callbacks after selecting another Transit vessel or operation date', async () => {
    renderAccount(); await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' })); await chooseTransit();
    await userEvent.selectOptions(formQueries().getByLabelText('Navire'), '12'); await userEvent.click(stepButton(2));
    const old = waypointMapMock.mock.lastCall![0] as Parameters<typeof import('./SeaOperationWaypointMapEditor').SeaOperationWaypointMapEditor>[0];
    await userEvent.click(stepButton(0)); await userEvent.selectOptions(formQueries().getByLabelText('Navire'), '13');
    act(() => old.onAddWaypoint({ latitude: 49.5, longitude: -1.5 }));
    expect(capturingUkcPanel().payload.waypoints).toHaveLength(0);
    await userEvent.click(stepButton(2));
    const beforeDate = waypointMapMock.mock.lastCall![0] as typeof old;
    await userEvent.click(stepButton(0)); fireEvent.change(formQueries().getByLabelText('Date de l’opération'), { target: { value: '2026-10-20' } });
    act(() => beforeDate.onAddWaypoint({ latitude: 49.6, longitude: -1.6 }));
    expect(capturingUkcPanel().payload.waypoints).toHaveLength(0);
  });

  it('keeps a signed Transit immutable without loading live captain authority or signatures', async () => {
    const draft = { ...noGoDraft(), ...createTransitSeaOperation('2026-10-16') };
    draft.vessel = { ...draft.vessel, id: '12', name: 'GOURY', captainName: 'Capitaine historique' };
    draft.signature.captainName = 'Capitaine historique';
    const original = structuredClone(draft), record = recordFixture(captainAccount, { draft, status: 'signed', canEdit: false });
    renderAccount(captainAccount, record); await openRecord(record);
    for (const label of ['Projet', 'Client', 'Navire', 'Port de départ', 'Port d’arrivée']) expect(formQueries().getByLabelText(label)).toBeDisabled();
    expect(fetchSeaOperationVesselContext).not.toHaveBeenCalled(); expect(fetchSeaOperationVesselCaptainSignature).not.toHaveBeenCalled();
    expect(record.draft).toEqual(original);
  });
});
function adminRevision(record: SeaOperationRecord): SeaOperationRecord {
  const draft = structuredClone(record.draft);
  draft.decision = '';
  draft.signature.acknowledged = false;
  return recordFixture(adminAccount, { id: 'admin-revised-preparation', version: 1, draft, canEdit: true, canSign: false,
    canRevise: false, canDelete: true, previousRevisionId: record.id, signatureSnapshot: null });
}

describe('project location copied into real-profile operation fixtures', () => {
  it.each([captainAccount, sailorAccount])('prefills a new P144 route without dates at the current Paris time for $id and allows overrides', async account => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-27T13:27:00Z'));
    const date = seaOperationToday(), choices = plannedMissions(date);
    choices[0].project = 'P144 · Projet sur plusieurs jours';
    choices[0].locationPlan = { ...emptyProjectLocationPlan(), waypoints: [0, .1].map((longitude, index) => ({
      id: `p144-${index}`, number: String(index + 1), descriptionVhf: `Waypoint ${index + 1}`, latitude: '0', longitude: String(longitude), eta: '', ukc: '', denseTraffic: false,
    })) };
    const { data } = renderAccount(account, undefined, 1, choices);
    data.vessels.find(vessel => String(vessel.id) === String(choices[0].vessel.id))!.maxSpeedKnots = 10;
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' })); await chooseMission(choices[0]);
    await userEvent.click(stepButton(2));
    expect(capturingWeatherPanel().waypoints.map(point => point.eta)).toEqual(['2026-10-27T14:25', '2026-10-27T15:25']);
    const picker = etaQueries();
    expect(picker.getAllByRole('gridcell', { selected: true })).toHaveLength(1);
    expect(picker.getByRole('gridcell', { selected: true })).toHaveTextContent('27');
    applyEta('2026-10-28', '10:35');
    expect(capturingWeatherPanel().waypoints.map(point => point.eta)).toEqual(['2026-10-28T10:35', '2026-10-28T11:35']);
    expect(choices[0].locationPlan.waypoints.every(point => point.eta === '')).toBe(true);
  });

  it.each([captainAccount, sailorAccount])('copies selected route, ETD and editable independent overlays for $id', async account => {
    const date = seaOperationToday(), choices = plannedMissions(date);
    const point = { id: 'source-route', number: '1', descriptionVhf: 'Route du projet', latitude: '49.65', longitude: '-1.62', ukc: '3', eta: '', denseTraffic: true };
    const location = { ...emptyProjectLocationPlan(), etd: `${date}T10:00`, charts: '7120 - 7421', waypoints: [point],
      points: [{ ...point, id: 'source-isolated', number: 'P1', descriptionVhf: 'Repère du projet' }],
      zones: [{ id: 'source-zone', name: 'Travaux', vertices: [{ latitude: '49.6', longitude: '-1.6' }, { latitude: '49.7', longitude: '-1.6' }, { latitude: '49.7', longitude: '-1.5' }] }] };
    choices[0].locationPlan = location;
    const source = structuredClone(location), { client } = renderAccount(account, undefined, 1, choices);
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, draft) => recordFixture(account, { draft: structuredClone(draft), version: 1 }));
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' })); await chooseMission(choices[0]);
    expect(formQueries().getByLabelText('ETD · date et heure de départ')).toHaveValue(`${date}T10:00`);
    await userEvent.click(stepButton(2));
    expect(formQueries().getByLabelText('Numéro de la ou des cartes marines')).toHaveValue(location.charts);
    const copied = capturingUkcPanel().payload;
    expect(copied.waypoints[0]).toMatchObject({ descriptionVhf: 'Route du projet', eta: `${date}T10:00` });
    expect(copied.waypoints[0].id).not.toBe('source-route');
    expect(copied.locationOverlay!.points[0].id).not.toBe('source-isolated');
    expect(copied.locationOverlay!.zones[0].id).not.toBe('source-zone');
    const map = waypointMapMock.mock.calls.at(-1)![0] as { onMoveIsolatedPoint: (id: string, position: { latitude: number; longitude: number }) => void };
    act(() => map.onMoveIsolatedPoint(copied.locationOverlay!.points[0].id, { latitude: 50.1, longitude: 1.2 }));
    expect(capturingUkcPanel().payload.locationOverlay!.points[0]).toMatchObject({ latitude: '50.1', longitude: '1.2' });
    expect(location).toEqual(source);
    await saveDraft();
    expect(saveSeaOperation).toHaveBeenCalledWith(client, expect.objectContaining({ locationOverlay: expect.objectContaining({ points: [expect.objectContaining({ latitude: '50.1' })] }) }), undefined);
    await userEvent.click(stepButton(0)); await chooseMission(choices[1]);
    expect(capturingUkcPanel().payload.locationOverlay).toBeUndefined();
    act(() => map.onMoveIsolatedPoint(copied.locationOverlay!.points[0].id, { latitude: 51, longitude: 2 }));
    expect(capturingUkcPanel().payload.locationOverlay).toBeUndefined();
  });

  it.each([false, true])('does not refresh a retained location from the live project when reopening (signed=%s)', async signed => {
    const choices = plannedMissions(), draft = waypointCaptureDraft(choices[0]);
    draft.waypoints[0].descriptionVhf = 'Route modifiée par le Capitaine';
    draft.locationOverlay = { version: 1, points: [], zones: [{ id: 'retained-zone', name: 'Zone retenue', vertices: [] }] };
    choices[0].locationPlan = { ...emptyProjectLocationPlan(), charts: 'NOUVELLE CARTE', zones: [{ id: 'new-zone', name: 'Projet modifié', vertices: [] }] };
    const record = recordFixture(captainAccount, { draft, status: signed ? 'signed' : 'draft', canEdit: !signed, canSign: !signed });
    renderAccount(captainAccount, record, 1, choices); await openRecord(record); await userEvent.click(stepButton(2));
    expect(capturingUkcPanel().payload.locationOverlay).toEqual(draft.locationOverlay);
    expect(capturingUkcPanel().payload.waypoints[0].descriptionVhf).toBe('Route modifiée par le Capitaine');
    expect(formQueries().getByLabelText('Numéro de la ou des cartes marines')).toHaveValue(draft.charts);
  });
});

describe('Planning project choices across four Paris calendar days', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-16T22:30:00Z')); // Already 17 October in Paris.
  });

  it('offers today through J+3 independently of the operation date and selects the dated temporary captain', async () => {
    const dates = seaOperationPlanningWindowDates(seaOperationToday());
    const missions = dates.map((date, index) => plannedMissions(date)[index % 2]);
    const { client } = renderAccount(captainAccount);
    vi.mocked(fetchSeaOperationPlanning).mockImplementation(async (_client, date) => ({ date, choices: dates.includes(date) ? [missions[dates.indexOf(date)]] : plannedMissions(date) }));
    vi.mocked(fetchSeaOperationCaptainSignature).mockImplementation(async (_client, _date, _operation, personId) => profileSignature(personId));
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    const selector = formQueries().getByLabelText('Projet');
    await waitFor(() => expect(selector).toBeEnabled());
    expect(within(selector).getAllByRole('option').map(option => option.textContent)).toEqual(['Choisir un projet du planning', 'Transit',
      ...missions.map((mission, index) => seaOperationPlanningChoiceLabel({ ...mission, date: dates[index] }))]);
    expect(formQueries().getByText('Projets planifiés du 17/10/2026 au 20/10/2026 inclus.')).toBeVisible();
    expect(fetchSeaOperationPlanning).not.toHaveBeenCalledWith(client, '2026-10-16');
    expect(fetchSeaOperationPlanning).not.toHaveBeenCalledWith(client, '2026-10-21');
    await chooseMission(missions[0], dates[0]);
    await chooseMission(missions[3], dates[3]);
    expect(formQueries().getByLabelText('Date de l’opération')).toHaveValue('2026-10-20');
    expect(formQueries().getByLabelText('Client')).toHaveDisplayValue(missions[3].client);
    expect(formQueries().getByLabelText('Coordonnées du client')).toHaveValue(missions[3].clientContact);
    expect(formQueries().getByLabelText('Description de l’opération')).toHaveValue(missions[3].description);
    expect(formQueries().getByLabelText('Navire')).toHaveValue(missions[3].vessel.id);
    expect(formQueries().getByLabelText('Immatriculation / IMO')).toHaveValue(missions[3].vessel.registrationImo);
    expect(formQueries().getByLabelText('Prénom NOM du Capitaine')).toHaveValue(missions[3].captains[0].name);
    await decisionStep();
    expect(await formQueries().findByRole('img', { name: `Signature de ${missions[3].captains[0].name}` })).toHaveAttribute('src', profileSignature('102').url);
    expect(formQueries().getByLabelText('Date de la décision')).toHaveValue('2026-10-17');
    expect(fetchSeaOperationCaptainSignature).toHaveBeenLastCalledWith(client, dates[3], missions[3].operationId, '102');
    await userEvent.click(stepButton(0));
    fireEvent.change(formQueries().getByLabelText('Date de l’opération'), { target: { value: '2026-09-01' } });
    await waitFor(() => expect(selector).toBeEnabled());
    expect(formQueries().getByLabelText('Date de l’opération')).toHaveValue('2026-09-01');
    expect(within(selector).getAllByRole('option')).toHaveLength(6);
    expect(selector).toHaveValue('');
    fireEvent.change(formQueries().getByLabelText('Date de l’opération'), { target: { value: '' } });
    await waitFor(() => expect(selector).toBeEnabled());
    expect(within(selector).getAllByRole('option')).toHaveLength(6);
    expect(selector).toHaveValue('');
  });

  it('selects the sole future mission on creation but preserves a subsequently entered manual date', async () => {
    const date = '2026-10-19', [mission] = plannedMissions(date);
    renderAccount(captainAccount);
    vi.mocked(fetchSeaOperationPlanning).mockImplementation(async (_client, requested) => ({ date: requested, choices: requested === date ? [mission] : [] }));
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await waitFor(() => expect(formQueries().getByLabelText('Projet')).toHaveValue(seaOperationPlanningChoiceKey({ ...mission, date })));
    expect(formQueries().getByLabelText('Date de l’opération')).toHaveValue(date);
    fireEvent.change(formQueries().getByLabelText('Date de l’opération'), { target: { value: '2026-09-01' } });
    await waitFor(() => expect(formQueries().getByLabelText('Projet')).toBeEnabled());
    expect(formQueries().getByLabelText('Date de l’opération')).toHaveValue('2026-09-01');
    expect(formQueries().getByLabelText('Projet')).toHaveValue('');
    expect(formQueries().getByLabelText('Description de l’opération')).toHaveValue('');
  });

  it('offers the same dated window to a real sailor fixture while retaining its server refusal to sign', async () => {
    const date = '2026-10-20', mission = plannedMissions(date)[1];
    mission.canSign = false; mission.captains[0].canSign = false;
    renderAccount(sailorAccount);
    vi.mocked(fetchSeaOperationPlanning).mockImplementation(async (_client, requested) => ({ date: requested, choices: requested === date ? [mission] : [] }));
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await waitFor(() => expect(formQueries().getByLabelText('Date de l’opération')).toHaveValue(date));
    expect(formQueries().getByLabelText('Projet')).toHaveDisplayValue(seaOperationPlanningChoiceLabel({ ...mission, date }));
    await decisionStep(); await selectChoice('Décision', 'NO_GO');
    expect(formQueries().getByText(/La signature est réservée au compte réel du Capitaine affecté au navire/)).toBeVisible();
    expect(footerQueries().getByRole('button', { name: 'Signer la décision NO GO' })).toBeDisabled();
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

  it('retains only the captured historical mission outside the offered window and uses its own date context', async () => {
    const date = '2026-09-01', historic = plannedMissions(date)[0], otherHistoric = plannedMissions(date)[1];
    historic.canSign = true; historic.captains[0].canSign = true;
    const draft = waypointCaptureDraft(historic); draft.planning!.date = date;
    draft.planning!.captainPersonId = ''; draft.vessel.captainName = ''; draft.signature.captainName = '';
    const record = recordFixture(captainAccount, { draft });
    const fresh = plannedMissions('2026-10-17')[0]; fresh.captains[0].name = 'Capitaine du nouveau jour';
    const { client } = renderAccount(captainAccount, record);
    vi.mocked(fetchSeaOperationCaptainSignature).mockResolvedValue(profileSignature('101'));
    vi.mocked(fetchSeaOperationPlanning).mockImplementation(async (_client, requested) => ({ date: requested,
      choices: requested === date ? [historic, otherHistoric] : requested === '2026-10-17' ? [fresh] : [] }));
    await openRecord(record);
    await waitFor(() => expect(formQueries().getByLabelText('Projet')).toBeEnabled());
    expect(formQueries().getByLabelText('Projet')).toHaveValue(seaOperationPlanningChoiceKey({ ...historic, date }));
    expect(formQueries().getByLabelText('Projet')).toHaveDisplayValue(seaOperationPlanningChoiceLabel({ ...historic, date }));
    expect(formQueries().queryByRole('option', { name: seaOperationPlanningChoiceLabel({ ...otherHistoric, date }) })).not.toBeInTheDocument();
    expect(formQueries().getByRole('option', { name: seaOperationPlanningChoiceLabel({ ...fresh, date: '2026-10-17' }) })).toBeInTheDocument();
    expect(formQueries().getByLabelText('Prénom NOM du Capitaine')).toHaveValue(historic.captains[0].name);
    expect(fetchSeaOperationCaptainSignature).toHaveBeenCalledWith(client, date, historic.operationId, historic.captains[0].personId);
    await decisionStep();
    expect(await formQueries().findByRole('img', { name: `Signature de ${historic.captains[0].name}` })).toHaveAttribute('src', profileSignature('101').url);
    expect(footerQueries().getByRole('button', { name: 'Signer la décision NO GO' })).toBeEnabled();
  });

  it('rejects a retained map callback after selecting the same operation on another day', async () => {
    const firstDate = '2026-10-17', secondDate = '2026-10-18';
    const first = plannedMissions(firstDate)[0], second = plannedMissions(secondDate)[0];
    renderAccount(captainAccount);
    vi.mocked(fetchSeaOperationPlanning).mockImplementation(async (_client, date) => ({ date, choices: date === firstDate ? [first] : date === secondDate ? [second] : [] }));
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await chooseMission(first, firstDate); await userEvent.click(stepButton(2));
    const oldMap = waypointMapMock.mock.calls.at(-1)![0] as { onAddWaypoint: (position: { latitude: number; longitude: number }) => void };
    await userEvent.click(stepButton(0)); await chooseMission(second, secondDate); await userEvent.click(stepButton(2));
    const currentPoints = structuredClone(capturingWeatherPanel().waypoints);
    act(() => oldMap.onAddWaypoint({ latitude: 50, longitude: 1 }));
    expect(capturingWeatherPanel().waypoints).toEqual(currentPoints);
    expect(formQueries().getByLabelText('Date de l’opération')).toHaveValue(secondDate);
  });

  it('opens a signed legacy planning date without formatting it as a new dated choice or fetching Planning', async () => {
    const draft = noGoDraft();
    draft.planning = { date: 'ancienne date', operationId: 'legacy-operation', projectId: '501', captainPersonId: '101' };
    const record = recordFixture(captainAccount, { draft, status: 'signed', canEdit: false, canSign: false });
    const original = structuredClone(record);
    renderAccount(captainAccount, record);
    await openRecord(record);
    expect(formQueries().getByLabelText('Projet')).toHaveDisplayValue(`${draft.project} · ${draft.vessel.name}`);
    expect(fetchSeaOperationPlanning).not.toHaveBeenCalled();
    expect(record).toEqual(original);
  });
});

describe('Copernicus UKC in authenticated operation forms', () => {
  it('retains a calculation across wizard sections while preserving the original manual annotation', async () => {
    const draft = automaticUkcDraft(), forecast = waypointUkc(draft), record = recordFixture(captainAccount, { draft });
    const { client } = renderAccount(captainAccount, record, 1, plannedMissions());
    await openRecord(record); fireEvent.click(stepButton(2));
    const panel = capturingUkcPanel(); expect(panel.active).toBe(true);
    fireEvent.click(stepButton(1));
    expect(capturingUkcPanel().active).toBe(true);
    act(() => panel.onUkcLoaded?.(forecast, waypointUkcContext(draft), client));
    expect(capturingUkcPanel().payload.waypoints[0].ukcForecast).toEqual(forecast);
    expect(capturingUkcPanel().payload.waypoints[0].ukc).toBe(draft.waypoints[0].ukc);
    fireEvent.click(stepButton(2));
    expect(formQueries().getByLabelText('UKC · point 1')).toHaveTextContent('≈ 21,00 m');
    expect(formQueries().getByLabelText('UKC · point 1').tagName).toBe('OUTPUT');
    fireEvent.click(within(formQueries().getByRole('group', { name: 'Mode UKC · point 1' })).getByRole('button', { name: 'Manuel' }));
    expect(formQueries().getByLabelText('UKC · point 1')).toHaveValue(draft.waypoints[0].ukc);
    expect(capturingUkcPanel().payload.waypoints[0]).not.toHaveProperty('ukcForecast');
    expect(record.draft).toEqual(draft); expect(saveSeaOperation).not.toHaveBeenCalled();
  });

  it.each([captainAccount, sailorAccount])('does not modify signed or server read-only data for $id', async account => {
    const draft = automaticUkcDraft(); draft.waypoints[0].ukcForecast = waypointUkc(draft);
    const record = recordFixture(account, { draft, canEdit: false, status: account === captainAccount ? 'signed' : 'draft' });
    const original = structuredClone(record), { client } = renderAccount(account, record, 1, plannedMissions());
    await openRecord(record); fireEvent.click(stepButton(2));
    expect(capturingUkcPanel().active).toBe(false); expect(capturingUkcPanel().readOnly).toBe(true);
    expect(formQueries().getByRole('group', { name: 'Mode UKC · point 1' })).toHaveTextContent('Automatique');
    expect(within(formQueries().getByRole('group', { name: 'Mode UKC · point 1' })).queryByRole('button')).not.toBeInTheDocument();
    act(() => capturingUkcPanel().onUkcLoaded?.(waypointUkc(draft), waypointUkcContext(draft), client));
    expect(record).toEqual(original); expect(saveSeaOperation).not.toHaveBeenCalled();
  });

  it('ignores queued results and statuses after a coordinate edit or a switch back to manual mode', async () => {
    const draft = automaticUkcDraft(), forecast = waypointUkc(draft), record = recordFixture(captainAccount, { draft });
    const { client } = renderAccount(captainAccount, record, 1, plannedMissions());
    await openRecord(record); fireEvent.click(stepButton(2)); const panel = capturingUkcPanel();
    fireEvent.change(formQueries().getByLabelText('Latitude · point 1'), { target: { value: '49.5' } });
    act(() => {
      panel.onUkcLoaded?.(forecast, waypointUkcContext(draft), client);
      panel.onStatusChange?.({ [ukcRequestKey(seaOperationUkcReference(draft), draft.waypoints[0])]: { loading: false, error: 'Ancienne erreur du point' } }, client);
    });
    expect(capturingUkcPanel().payload.waypoints[0]).not.toHaveProperty('ukcForecast');
    expect(formQueries().queryByText('Ancienne erreur du point')).not.toBeInTheDocument();
    fireEvent.click(within(formQueries().getByRole('group', { name: 'Mode UKC · point 1' })).getByRole('button', { name: 'Manuel' }));
    act(() => panel.onUkcLoaded?.(forecast, waypointUkcContext(draft), client));
    expect(capturingUkcPanel().payload.waypoints[0].ukcMode).toBe('manual');
    expect(formQueries().getByLabelText('UKC · point 1')).toHaveValue(draft.waypoints[0].ukc);
  });

  it('waits for save-time captures and drains a compatible silent response received while busy', async () => {
    const draft = automaticUkcDraft(), forecast = waypointUkc(draft), record = recordFixture(captainAccount, { draft });
    const capture = deferred<SeaOperationPayload>(); vi.mocked(captureSeaOperationValidationUkc).mockReturnValue(capture.promise);
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, payload) => recordFixture(captainAccount, { draft: payload, version: 4 }));
    const { client } = renderAccount(captainAccount, record, 1, plannedMissions());
    await openRecord(record); fireEvent.click(stepButton(2));
    fireEvent.click(footerQueries().getByRole('button', { name: 'Enregistrer le brouillon' }));
    await waitFor(() => expect(captureSeaOperationValidationUkc).toHaveBeenCalled());
    expect(saveSeaOperation).not.toHaveBeenCalled();
    act(() => capturingUkcPanel().onUkcLoaded?.(forecast, waypointUkcContext(draft), client));
    await act(async () => { capture.resolve(draft); });
    await waitFor(() => expect(saveSeaOperation).toHaveBeenCalled());
    expect(vi.mocked(saveSeaOperation).mock.calls[0][1].waypoints[0].ukcForecast).toEqual(forecast);
    expect(vi.mocked(saveSeaOperation).mock.calls[0][1].waypoints[0].ukc).toBe(draft.waypoints[0].ukc);
    expect(await formQueries().findByText('Brouillon enregistré.')).toBeInTheDocument();
    expect(footerQueries().queryByText('Modifications non enregistrées')).not.toBeInTheDocument();
  });

  it('keeps an incomplete draft saveable when Copernicus is not configured', async () => {
    const draft = automaticUkcDraft(), record = recordFixture(captainAccount, { draft });
    vi.mocked(captureSeaOperationValidationUkc).mockImplementation(async (_client, payload, options) => {
      options?.onError?.(payload.waypoints[0], 'La connexion Copernicus Marine n’est pas encore configurée. Contactez l’Armement.'); return payload;
    });
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, payload) => recordFixture(captainAccount, { draft: payload, version: 4 }));
    renderAccount(captainAccount, record, 1, plannedMissions());
    await openRecord(record); fireEvent.click(stepButton(2)); await saveDraft();
    expect(await formQueries().findByText('Brouillon enregistré.')).toBeInTheDocument();
    expect(formQueries().getByText('La connexion Copernicus Marine n’est pas encore configurée. Contactez l’Armement.')).toBeVisible();
    expect(vi.mocked(saveSeaOperation).mock.calls[0][1].waypoints[0].ukcMode).toBe('automatic');
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

  it('refreshes automatic forecasts before GO and signs only the saved compatible capture', async () => {
    const draft = automaticUkcDraft(true), record = recordFixture(captainAccount, { draft });
    let stored = record;
    vi.mocked(captureSeaOperationValidationUkc).mockImplementation(async (_client, payload) => ({ ...payload,
      waypoints: payload.waypoints.map((point, index) => index === 0 ? { ...point, ukcForecast: waypointUkc(payload) } : point) }));
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, payload) => { stored = recordFixture(captainAccount, { draft: payload, version: 4 }); return stored; });
    vi.mocked(signSeaOperation).mockImplementation(async () => ({ ...stored, status: 'signed', canEdit: false, signedBy: captainAccount.id, signedAt: new Date().toISOString() }));
    renderAccount(captainAccount, record, 1, plannedMissions()); await openRecord(record); await decisionStep();
    await waitFor(() => expect(footerQueries().getByRole('button', { name: 'Signer la décision GO' })).toBeEnabled());
    fireEvent.click(footerQueries().getByRole('button', { name: 'Signer la décision GO' }));
    await waitFor(() => expect(signSeaOperation).toHaveBeenCalled());
    expect(captureSeaOperationValidationUkc).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ missingOnly: false }));
    expect(stored.draft.waypoints[0].ukcForecast?.status).toBe('available');
    expect(stored.draft.waypoints[0].ukc).toBe(draft.waypoints[0].ukc);
  });

  it('stops GO signing when canonical save changes the draught and removes the obsolete capture', async () => {
    const draft = automaticUkcDraft(true); draft.waypoints[0].ukcForecast = waypointUkc(draft);
    const record = recordFixture(captainAccount, { draft });
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, payload) => {
      const canonical = structuredClone(payload); canonical.vessel.draftMeters = 3; delete canonical.waypoints[0].ukcForecast;
      return recordFixture(captainAccount, { draft: canonical, version: 4 });
    });
    renderAccount(captainAccount, record, 1, plannedMissions()); await openRecord(record); await decisionStep();
    await waitFor(() => expect(footerQueries().getByRole('button', { name: 'Signer la décision GO' })).toBeEnabled());
    fireEvent.click(footerQueries().getByRole('button', { name: 'Signer la décision GO' }));
    expect(await formQueries().findByText('L’UKC du point n° 1 est obligatoire.')).toBeInTheDocument();
    expect(saveSeaOperation).toHaveBeenCalled(); expect(signSeaOperation).not.toHaveBeenCalled();
    expect(capturingUkcPanel().payload.vessel.draftMeters).toBe(3);
    expect(capturingUkcPanel().payload.waypoints[0]).not.toHaveProperty('ukcForecast');
  });

  it('still permits an explicit NO GO without a successful automatic estimate', async () => {
    const draft = automaticUkcDraft(), record = recordFixture(captainAccount, { draft }); let stored = record;
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, payload) => { stored = recordFixture(captainAccount, { draft: payload, version: 4 }); return stored; });
    vi.mocked(signSeaOperation).mockImplementation(async () => ({ ...stored, status: 'signed', canEdit: false, signedBy: captainAccount.id, signedAt: new Date().toISOString() }));
    renderAccount(captainAccount, record, 1, plannedMissions()); await openRecord(record); await decisionStep();
    await waitFor(() => expect(footerQueries().getByRole('button', { name: 'Signer la décision NO GO' })).toBeEnabled());
    fireEvent.click(footerQueries().getByRole('button', { name: 'Signer la décision NO GO' }));
    await waitFor(() => expect(signSeaOperation).toHaveBeenCalled());
    expect(stored.draft.waypoints[0]).not.toHaveProperty('ukcForecast'); expect(stored.draft.decision).toBe('NO_GO');
  });
});

describe('Opération en Mer administration with authenticated server permissions', () => {
  it('places row actions outside the record button and opens editable drafts without revising or granting signature rights', async () => {
    const record = recordFixture(adminAccount, { canDelete: true, canSign: false });
    renderAccount(adminAccount, record);
    await screen.findByRole('group', { name: `Actions pour ${record.draft.project}` });
    expect(document.querySelector('.so-record button')).toBeNull();
    expect(document.querySelector('.so-record-actions')?.closest('button')).toBeNull();
    fireEvent.click(recordActions(record).getByRole('button', { name: 'Modifier' }));
    await screen.findByRole('dialog', { name: 'Fiche Opération en Mer' });
    expect(formQueries().getByLabelText('Description de l’opération')).toBeEnabled();
    expect(reviseSeaOperation).not.toHaveBeenCalled();
    await decisionStep();
    expect(footerQueries().getByRole('button', { name: 'Signer la décision NO GO' })).toBeDisabled();
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

  it.each([captainAccount, sailorAccount])('keeps signed records readonly without server administration capabilities for $id', async (account) => {
    const record = recordFixture(account, { status: 'signed', canEdit: true, canSign: true });
    renderAccount(account, record);
    await screen.findByRole('button', { name: new RegExp(record.draft.project) });
    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument();
    await openRecord(record);
    expect(formQueries().getByLabelText('Projet')).toBeDisabled();
    expect(footerQueries().queryByRole('button', { name: 'Modifier cette fiche' })).not.toBeInTheDocument();
    expect(footerQueries().queryByRole('button', { name: 'Supprimer cette fiche' })).not.toBeInTheDocument();
    expect(reviseSeaOperation).not.toHaveBeenCalled();
    expect(deleteSeaOperation).not.toHaveBeenCalled();
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

  it('requires an explicit confirmation before revising a signed record and cancels without a write', async () => {
    const record = adminSignedRecord();
    const original = structuredClone(record);
    renderAccount(adminAccount, record);
    await screen.findByRole('group', { name: `Actions pour ${record.draft.project}` });
    fireEvent.click(recordActions(record).getByRole('button', { name: 'Modifier' }));
    const confirmation = screen.getByRole('dialog', { name: 'Modifier une fiche signée' });
    expect(within(confirmation).getByText(/La version signée restera conservée dans l’historique/)).toBeVisible();
    expect(reviseSeaOperation).not.toHaveBeenCalled();
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(recordActions(record).getByRole('button', { name: 'Modifier' })).toBeEnabled();
    expect(record).toEqual(original);
    expect(reviseSeaOperation).not.toHaveBeenCalled();
  });

  it('waits for the signed-record revision and opens only the new editable preparation without inheriting the captain signature', async () => {
    const original = adminSignedRecord();
    const immutable = structuredClone(original);
    const revised = adminRevision(original);
    const pending = deferred<SeaOperationRecord>();
    const { client } = renderAccount(adminAccount, original);
    vi.mocked(reviseSeaOperation).mockReturnValue(pending.promise);
    await screen.findByRole('group', { name: `Actions pour ${original.draft.project}` });
    fireEvent.click(recordActions(original).getByRole('button', { name: 'Modifier' }));
    const confirmation = screen.getByRole('dialog', { name: 'Modifier une fiche signée' });
    const confirm = within(confirmation).getByRole('button', { name: 'Créer la nouvelle préparation' });
    fireEvent.click(confirm); fireEvent.click(confirm);
    expect(reviseSeaOperation).toHaveBeenCalledExactlyOnceWith(client, { id: original.id, version: original.version });
    expect(confirmation).toHaveAttribute('aria-busy', 'true');
    for (const button of within(confirmation).getAllByRole('button')) expect(button).toBeDisabled();
    expect(document.querySelector('.so-screen')).toHaveAttribute('inert');
    expect(document.querySelectorAll('.so-record-entry')).toHaveLength(1);
    await userEvent.keyboard('{Escape}');
    expect(confirmation).toBeInTheDocument();
    await act(async () => pending.resolve(revised));
    expect(await formQueries().findByText(/Nouvelle préparation créée/)).toBeVisible();
    expect(screen.queryByRole('dialog', { name: 'Modifier une fiche signée' })).not.toBeInTheDocument();
    expect(formQueries().getByLabelText('Projet')).toBeEnabled();
    expect(formQueries().getByRole('button', { name: 'Version précédente signée' })).toBeVisible();
    expect(formQueries().getByLabelText('Description de l’opération')).toHaveValue(revised.draft.description);
    expect(capturingWeatherPanel().waypoints).toEqual(revised.draft.waypoints);
    expect(sessionStorage.length).toBe(0);
    await decisionStep();
    expect(formQueries().getByRole('checkbox', { name: /En qualité de Capitaine/ })).not.toBeChecked();
    expect(formQueries().queryByRole('img', { name: /Signature de/ })).not.toBeInTheDocument();
    expect(footerQueries().getByRole('button', { name: 'Signer la décision' })).toBeDisabled();
    expect(original).toEqual(immutable);
    expect(saveSeaOperation).not.toHaveBeenCalled();
    expect(signSeaOperation).not.toHaveBeenCalled();
    fireEvent.click(footerQueries().getByRole('button', { name: 'Annuler' }));
    expect(document.querySelectorAll('.so-record-entry')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /NO GO/ })).not.toBeInTheDocument();
  });

  it.each([
    { code: '40001', message: 'La fiche a été modifiée. Rechargez-la.' },
    { code: '42501', message: 'Cette modification est réservée aux administrateurs.' },
  ])('retains a signed record and shows a revision failure inside its confirmation: $code', async (failure) => {
    const record = adminSignedRecord();
    renderAccount(adminAccount, record);
    vi.mocked(reviseSeaOperation).mockRejectedValue(failure);
    await screen.findByRole('group', { name: `Actions pour ${record.draft.project}` });
    fireEvent.click(recordActions(record).getByRole('button', { name: 'Modifier' }));
    const confirmation = within(screen.getByRole('dialog', { name: 'Modifier une fiche signée' }));
    fireEvent.click(confirmation.getByRole('button', { name: 'Créer la nouvelle préparation' }));
    expect(await confirmation.findByRole('alert')).toHaveTextContent(failure.message);
    expect(confirmation.getByRole('button', { name: 'Créer la nouvelle préparation' })).toBeEnabled();
    expect(document.querySelectorAll('.so-record-entry')).toHaveLength(1);
    expect(screen.queryByRole('dialog', { name: 'Fiche Opération en Mer' })).not.toBeInTheDocument();
    expect(saveSeaOperation).not.toHaveBeenCalled();
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

  it('opens the previous signed version as history and returns to the current preparation without reinserting history in the register', async () => {
    const original = adminSignedRecord();
    const revised = adminRevision(original);
    const historical = { ...original, supersededById: revised.id, canEdit: false, canSign: false, canRevise: false, canDelete: false };
    renderAccount(adminAccount, revised);
    vi.mocked(fetchSeaOperationDetail).mockImplementation(async (_client, id) => id === original.id ? historical : revised);
    await openRecord(revised);
    fireEvent.click(formQueries().getByRole('button', { name: 'Version précédente signée' }));
    expect(await formQueries().findByText('Cette version signée est conservée dans l’historique.')).toBeVisible();
    expect(formQueries().getByLabelText('Projet')).toBeDisabled();
    expect(footerQueries().queryByRole('button', { name: /Modifier cette fiche|Supprimer cette fiche/ })).not.toBeInTheDocument();
    expect(capturingWeatherPanel().waypoints).toEqual(historical.draft.waypoints);
    expect(document.querySelectorAll('.so-record-entry')).toHaveLength(1);
    fireEvent.click(formQueries().getByRole('button', { name: 'Version suivante' }));
    await waitFor(() => expect(formQueries().getByLabelText('Projet')).toBeEnabled());
    expect(formQueries().getByRole('button', { name: 'Version précédente signée' })).toBeVisible();
    expect(fetchSeaOperationDetail).toHaveBeenCalledWith(expect.anything(), original.id);
    expect(fetchSeaOperationDetail).toHaveBeenLastCalledWith(expect.anything(), revised.id);
    expect(document.querySelectorAll('.so-record-entry')).toHaveLength(1);
    expect(reviseSeaOperation).not.toHaveBeenCalled();
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

  it.each(['draft', 'signed'] as const)('cancels removal of an administered %s without deleting it', async (status) => {
    const record = { ...adminSignedRecord(), status, canEdit: status === 'draft' };
    renderAccount(adminAccount, record);
    await screen.findByRole('group', { name: `Actions pour ${record.draft.project}` });
    fireEvent.click(recordActions(record).getByRole('button', { name: 'Supprimer' }));
    const confirmation = screen.getByRole('dialog', { name: 'Supprimer cette fiche du registre ?' });
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.querySelectorAll('.so-record-entry')).toHaveLength(1);
    expect(deleteSeaOperation).not.toHaveBeenCalled();
  });

  it.each(['draft', 'signed'] as const)('removes an open %s only after server confirmation and clears its editor and print copy', async (status) => {
    const record = { ...adminSignedRecord(), status, canEdit: status === 'draft', canRevise: status === 'signed' };
    const pending = deferred<void>();
    const { client } = renderAccount(adminAccount, record);
    vi.mocked(deleteSeaOperation).mockReturnValue(pending.promise);
    await openRecord(record);
    fireEvent.click(footerQueries().getByRole('button', { name: 'Supprimer cette fiche' }));
    const confirmation = screen.getByRole('dialog', { name: 'Supprimer cette fiche du registre ?' });
    const confirm = within(confirmation).getByRole('button', { name: 'Supprimer' });
    fireEvent.click(confirm); fireEvent.click(confirm);
    expect(deleteSeaOperation).toHaveBeenCalledExactlyOnceWith(client, { id: record.id, version: record.version });
    expect(document.querySelectorAll('.so-record-entry')).toHaveLength(1);
    for (const button of within(confirmation).getAllByRole('button')) expect(button).toBeDisabled();
    await act(async () => pending.resolve());
    expect(await screen.findByText('Opération supprimée du registre.')).toBeVisible();
    expect(document.querySelectorAll('.so-record-entry')).toHaveLength(0);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.querySelector('.so-page > .so-print')).toBeNull();
    expect(screen.getByText('Préparez votre première opération en mer')).toBeVisible();
    expect(saveSeaOperation).not.toHaveBeenCalled();
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

  it('keeps a failed deletion visible in the confirmation and retries the same expected revision', async () => {
    const record = adminSignedRecord();
    const { client } = renderAccount(adminAccount, record);
    vi.mocked(deleteSeaOperation).mockRejectedValueOnce({ code: '40001', message: 'Rechargez la fiche avant de la supprimer.' }).mockResolvedValueOnce();
    await screen.findByRole('group', { name: `Actions pour ${record.draft.project}` });
    fireEvent.click(recordActions(record).getByRole('button', { name: 'Supprimer' }));
    const confirmation = within(screen.getByRole('dialog', { name: 'Supprimer cette fiche du registre ?' }));
    fireEvent.click(confirmation.getByRole('button', { name: 'Supprimer' }));
    expect(await confirmation.findByRole('alert')).toHaveTextContent('Rechargez la fiche avant de la supprimer.');
    expect(document.querySelectorAll('.so-record-entry')).toHaveLength(1);
    fireEvent.click(confirmation.getByRole('button', { name: 'Supprimer' }));
    expect(await screen.findByText('Opération supprimée du registre.')).toBeVisible();
    expect(deleteSeaOperation).toHaveBeenCalledTimes(2);
    expect(deleteSeaOperation).toHaveBeenLastCalledWith(client, { id: record.id, version: record.version });
    expect(reviseSeaOperation).not.toHaveBeenCalled();
  });

  it.each(['revise', 'delete'] as const)('ignores a late %s result after the authenticated client changes', async (kind) => {
    const original = adminSignedRecord();
    const revised = adminRevision(original);
    const pending = deferred<SeaOperationRecord>();
    const view = renderAccount(adminAccount, original);
    if (kind === 'revise') vi.mocked(reviseSeaOperation).mockReturnValue(pending.promise);
    else vi.mocked(deleteSeaOperation).mockImplementation(async () => { await pending.promise; });
    await screen.findByRole('group', { name: `Actions pour ${original.draft.project}` });
    fireEvent.click(recordActions(original).getByRole('button', { name: kind === 'revise' ? 'Modifier' : 'Supprimer' }));
    const confirmation = within(screen.getByRole('dialog', { name: kind === 'revise' ? 'Modifier une fiche signée' : 'Supprimer cette fiche du registre ?' }));
    fireEvent.click(confirmation.getByRole('button', { name: kind === 'revise' ? 'Créer la nouvelle préparation' : 'Supprimer' }));
    const other = recordFixture(sailorAccount, { id: 'other-company-record', companyId: 2, canEdit: false,
      draft: { ...noGoDraft(), project: 'Autre société à conserver' } });
    vi.mocked(fetchSeaOperationData).mockResolvedValue({ ...view.data, companyId: 2, actorId: sailorAccount.id, actorName: sailorAccount.name, records: [other] });
    view.rerenderClient({ fixtureAccountId: sailorAccount.id });
    expect(await screen.findByRole('button', { name: /Autre société à conserver/ })).toBeVisible();
    await act(async () => pending.resolve(revised));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Autre société à conserver/ })).toBeEnabled();
    expect(screen.queryByRole('button', { name: new RegExp(original.draft.project) })).not.toBeInTheDocument();
    expect(document.querySelectorAll('.so-record-entry')).toHaveLength(1);
    expect(saveSeaOperation).not.toHaveBeenCalled();
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

  it('disables administration actions while the signed PDF export is pending', async () => {
    const record = adminSignedRecord();
    const pending = deferred<string | null>();
    renderAccount(adminAccount, record);
    vi.mocked(loadSeaOperationSignature).mockReturnValue(pending.promise);
    vi.mocked(exportSeaOperationPdf).mockResolvedValue({ bytes: new Uint8Array(), filename: 'operation.pdf', pageCount: 1 });
    await openRecord(record);
    fireEvent.click(footerQueries().getByRole('button', { name: 'Exporter le PDF' }));
    expect(footerQueries().getByRole('button', { name: 'Modifier cette fiche' })).toBeDisabled();
    expect(footerQueries().getByRole('button', { name: 'Supprimer cette fiche' })).toBeDisabled();
    for (const button of recordActions(record).getAllByRole('button')) expect(button).toBeDisabled();
    await act(async () => pending.resolve(null));
    await waitFor(() => expect(footerQueries().getByRole('button', { name: 'Modifier cette fiche' })).toBeEnabled());
    expect(reviseSeaOperation).not.toHaveBeenCalled();
    expect(deleteSeaOperation).not.toHaveBeenCalled();
  });

  it('does not let a previous client detail failure clear a new account deletion in progress', async () => {
    const original = adminSignedRecord();
    const staleDetail = deferred<SeaOperationRecord>();
    const pendingDelete = deferred<void>();
    const view = renderAccount(adminAccount, original);
    vi.mocked(fetchSeaOperationDetail).mockImplementation(async () => { await staleDetail.promise; throw new Error('Ancienne lecture à ignorer.'); });
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(original.draft.project) }));
    expect(fetchSeaOperationDetail).toHaveBeenCalledWith(view.client, original.id);
    const other = recordFixture(adminAccount, { id: 'other-admin-record', companyId: 2, canDelete: true,
      draft: { ...noGoDraft(), project: 'Préparation du second compte' } });
    vi.mocked(fetchSeaOperationData).mockResolvedValue({ ...view.data, companyId: 2, actorId: 'other-admin-account', records: [other] });
    vi.mocked(deleteSeaOperation).mockReturnValue(pendingDelete.promise);
    view.rerenderClient({ fixtureAccountId: 'other-admin-account' });
    await screen.findByRole('group', { name: `Actions pour ${other.draft.project}` });
    fireEvent.click(recordActions(other).getByRole('button', { name: 'Supprimer' }));
    const confirmation = screen.getByRole('dialog', { name: 'Supprimer cette fiche du registre ?' });
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Supprimer' }));
    await act(async () => staleDetail.resolve(original));
    expect(confirmation).toHaveAttribute('aria-busy', 'true');
    expect(within(confirmation).getByRole('button', { name: 'Traitement…' })).toBeDisabled();
    expect(screen.queryByText('Ancienne lecture à ignorer.')).not.toBeInTheDocument();
    await act(async () => pendingDelete.resolve());
    expect(await screen.findByText('Opération supprimée du registre.')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Opération en Mer with authenticated server permission fixtures', () => {
  it('defaults missing descriptions to waypoint names, keeps them editable and saves the edited label', async () => {
    const draft = waypointCaptureDraft();
    draft.waypoints[0].number = '2'; draft.waypoints[0].descriptionVhf = '';
    const record = recordFixture(captainAccount, { draft });
    const { client } = renderAccount(captainAccount, record);
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, edited) => ({ ...record, version: 4, draft: structuredClone(edited) }));
    await openRecord(record); fireEvent.click(stepButton(2));
    const description = formQueries().getByLabelText('Description · point 1');
    expect(description).toHaveValue('Waypoint 2');
    fireEvent.change(description, { target: { value: 'Attente pilote' } });
    fireEvent.blur(description);
    expect(description).toHaveValue('Attente pilote');
    fireEvent.click(footerQueries().getByRole('button', { name: 'Enregistrer le brouillon' }));
    await formQueries().findByText('Brouillon enregistré.');
    expect(saveSeaOperation).toHaveBeenCalledWith(client, expect.objectContaining({ waypoints: [expect.objectContaining({ descriptionVhf: 'Attente pilote' })] }), record);
    expect(record.draft.waypoints[0].descriptionVhf).toBe('');
  });

  it('adds a selected port with its name and exact coordinates and uses the selected vessel speed and departure', async () => {
    const draft = waypointCaptureDraft();
    const record = recordFixture(captainAccount, { draft });
    const { client, data } = renderAccount(captainAccount, record);
    data.vessels[0].maxSpeedKnots = 19;
    data.vessels[1].maxSpeedKnots = 12;
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, edited) => ({ ...record, version: 4, draft: structuredClone(edited) }));
    await openRecord(record); fireEvent.click(stepButton(2));
    const map = waypointMapMock.mock.lastCall![0] as {
      maxSpeedKnots?: number | null; etd?: string;
      onAddWaypoint: (position: { latitude: number; longitude: number }, port?: { name: string; portKey?: string }) => void;
    };
    expect(map.maxSpeedKnots).toBe(12);
    expect(map.etd).toBe(draft.waypoints[0].eta);
    act(() => map.onAddWaypoint({ latitude: 49.646976, longitude: -1.622339 }, { name: 'Port de Cherbourg', portKey: 'public-port' }));
    const point = capturingWeatherPanel().waypoints[1];
    expect(point).toMatchObject({ descriptionVhf: 'Port de Cherbourg', latitude: '49.646976', longitude: '-1.622339', eta: '2026-10-23T14:02', etaMode: 'automatic', ukcMode: 'automatic' });
    expect(formQueries().getByLabelText('Description · point 2')).toHaveValue('Port de Cherbourg');
    expect(formQueries().getByLabelText('Latitude · point 2')).toHaveValue(formatSeaLatitude(point.latitude));
    expect(formQueries().getByLabelText('Longitude · point 2')).toHaveValue(formatSeaLongitude(point.longitude));
    fireEvent.click(footerQueries().getByRole('button', { name: 'Enregistrer le brouillon' }));
    await formQueries().findByText('Brouillon enregistré.');
    expect(saveSeaOperation).toHaveBeenCalledWith(client, expect.objectContaining({ waypoints: [expect.anything(), expect.objectContaining(point)] }), record);
  });

  it('prefills later calendars from the first ETA, preserves manual anchors and can restore automatic scheduling', async () => {
    const draft = waypointCaptureDraft();
    const source = draft.waypoints[0];
    draft.waypoints = ['49', '49.1', '49.2'].map((latitude, index) => ({ ...source, id: `eta-route-${index}`, number: String(index + 1), latitude, longitude: '-1', eta: '' }));
    const record = recordFixture(captainAccount, { draft });
    const { client, data } = renderAccount(captainAccount, record);
    data.vessels[1].maxSpeedKnots = 10;
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, edited) => ({ ...record, version: 4, draft: structuredClone(edited) }));
    await openRecord(record); fireEvent.click(stepButton(2));
    applyEta('2026-10-26', '08:00');
    expect(capturingWeatherPanel().waypoints.map(point => point.eta)).toEqual(['2026-10-26T08:00', '2026-10-26T09:00', '2026-10-26T10:00']);
    expectEta('2026-10-26', '09:00', 2);
    applyEta('2026-10-26', '10:30', 2);
    expect(capturingWeatherPanel().waypoints[1]).toMatchObject({ etaMode: 'manual', eta: '2026-10-26T10:30' });
    expect(capturingWeatherPanel().waypoints[2]).toMatchObject({ etaMode: 'automatic', eta: '2026-10-26T11:30' });
    applyEta('2026-10-26', '07:00');
    expect(capturingWeatherPanel().waypoints.map(point => point.eta)).toEqual(['2026-10-26T07:00', '2026-10-26T10:30', '2026-10-26T11:30']);
    fireEvent.click(formQueries().getByRole('button', { name: 'Reprendre le calcul de l’ETA du point 2' }));
    expect(capturingWeatherPanel().waypoints.map(point => point.eta)).toEqual(['2026-10-26T07:00', '2026-10-26T08:00', '2026-10-26T09:00']);
    expectEta('2026-10-26', '08:00', 2);
    fireEvent.click(footerQueries().getByRole('button', { name: 'Enregistrer le brouillon' }));
    await formQueries().findByText('Brouillon enregistré.');
    expect(saveSeaOperation).toHaveBeenCalledWith(client, expect.objectContaining({ waypoints: [
      expect.objectContaining({ eta: '2026-10-26T07:00', etaMode: 'manual' }),
      expect.objectContaining({ eta: '2026-10-26T08:00', etaMode: 'automatic' }),
      expect.objectContaining({ eta: '2026-10-26T09:00', etaMode: 'automatic' }),
    ] }), record);
  });

  it('moves and deletes map points by identity, preserving other points and saving the updated route', async () => {
    const draft = captureSeaOperationRadios(waypointCaptureDraft(), '2026-10-23T08:00:00Z');
    draft.waypoints[0].weather = waypointWeather();
    const first = structuredClone(draft.waypoints[0]);
    const second = { ...structuredClone(first), id: 'second-map-point', number: '4', latitude: '49.8' };
    draft.waypoints.push(second);
    const record = recordFixture(captainAccount, { draft });
    const { client } = renderAccount(captainAccount, record);
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, edited) => ({ ...record, version: 4, draft: structuredClone(edited) }));
    await openRecord(record); fireEvent.click(stepButton(2));
    const map = () => waypointMapMock.mock.lastCall![0] as {
      onMoveWaypoint: (id: string, position: { latitude: number; longitude: number }) => void;
      onDeleteWaypoint: (id: string) => void;
    };
    act(() => map().onMoveWaypoint(first.id, { latitude: 49.7, longitude: -1.7 }));
    expect(capturingWeatherPanel().waypoints[0]).toEqual({ ...first, latitude: '49.7', longitude: '-1.7', weather: undefined, radio: undefined });
    expect(capturingWeatherPanel().waypoints[1]).toEqual(second);
    expect(formQueries().getByLabelText('Latitude · point 1')).toHaveValue(formatSeaLatitude('49.7'));
    act(() => map().onDeleteWaypoint(first.id));
    expect(capturingWeatherPanel().waypoints).toEqual([second]);
    fireEvent.click(footerQueries().getByRole('button', { name: 'Enregistrer le brouillon' }));
    await formQueries().findByText('Brouillon enregistré.');
    expect(saveSeaOperation).toHaveBeenCalledWith(client, expect.objectContaining({ waypoints: [expect.objectContaining({
      id: second.id, number: second.number, latitude: second.latitude, longitude: second.longitude, eta: second.eta, ukc: second.ukc,
    })] }), record);
  });

  it('ignores map callbacks retained by an old record after opening another record', async () => {
    const draft = waypointCaptureDraft();
    const first = recordFixture(captainAccount, { draft });
    renderAccount(captainAccount, first);
    await openRecord(first); fireEvent.click(stepButton(2));
    const oldMap = waypointMapMock.mock.lastCall![0] as {
      onAddWaypoint: (position: { latitude: number; longitude: number }, port?: { name: string }) => void;
      onMoveWaypoint: (id: string, position: { latitude: number; longitude: number }) => void;
      onDeleteWaypoint: (id: string) => void;
    };
    fireEvent.click(footerQueries().getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await openRecord(first); fireEvent.click(stepButton(2));
    act(() => {
      oldMap.onAddWaypoint({ latitude: 49.65, longitude: -1.62 }, { name: 'Port de la fiche précédente' });
      oldMap.onMoveWaypoint(draft.waypoints[0].id, { latitude: 1, longitude: 2 });
      oldMap.onDeleteWaypoint(draft.waypoints[0].id);
    });
    expect(capturingWeatherPanel().waypoints).toEqual(draft.waypoints);
    expect(footerQueries().queryByText('Modifications non enregistrées')).not.toBeInTheDocument();
    expect(saveSeaOperation).not.toHaveBeenCalled();
  });

  it('keeps fullscreen placements and existing captures through return, save and reopening', async () => {
    const draft = waypointCaptureDraft();
    draft.waypoints[0].weather = waypointWeather();
    const record = recordFixture(captainAccount, { draft });
    const { client } = renderAccount(captainAccount, record);
    let stored = record;
    vi.mocked(fetchSeaOperationDetail).mockImplementation(async () => stored);
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, edited) => (stored = { ...record, version: 4, draft: structuredClone(edited) }));
    await openRecord(record);
    fireEvent.click(stepButton(2));
    fireEvent.click(formQueries().getByRole('button', { name: 'Placer les waypoints' }));
    fireEvent.click(formQueries().getByRole('button', { name: 'Afficher la carte en plein écran' }));
    fireEvent.click(formQueries().getByRole('button', { name: 'Ajouter au centre' }));
    const placed = structuredClone(capturingWeatherPanel().waypoints[1]);
    expect(placed).toMatchObject({ number: '2', eta: '', ukc: '', descriptionVhf: 'Waypoint 2', denseTraffic: false });
    expect(placed.latitude).not.toBe('');
    expect(placed.longitude).not.toBe('');
    expect(placed).not.toHaveProperty('weather');
    expect(placed).not.toHaveProperty('radio');
    fireEvent.click(formQueries().getByRole('button', { name: 'Quitter le plein écran' }));
    expect(formQueries().getByRole('button', { name: 'Terminer le placement' })).toBeVisible();
    expect(capturingWeatherPanel().waypoints[0]).toEqual(draft.waypoints[0]);
    expect(formQueries().getByLabelText('Latitude · point 2')).toHaveValue(formatSeaLatitude(placed.latitude));
    expect(formQueries().getByLabelText('Longitude · point 2')).toHaveValue(formatSeaLongitude(placed.longitude));
    fireEvent.click(formQueries().getByRole('button', { name: 'Terminer le placement' }));
    fireEvent.click(footerQueries().getByRole('button', { name: 'Enregistrer le brouillon' }));
    expect(await formQueries().findByText('Brouillon enregistré.')).toBeInTheDocument();
    expect(saveSeaOperation).toHaveBeenCalledWith(client, expect.objectContaining({ waypoints: [expect.objectContaining(draft.waypoints[0]), expect.objectContaining(placed)] }), record);
    fireEvent.click(footerQueries().getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await openRecord(stored);
    fireEvent.click(stepButton(2));
    expect(formQueries().getByLabelText('Latitude · point 2')).toHaveValue(formatSeaLatitude(placed.latitude));
    expect(formQueries().getByLabelText('Longitude · point 2')).toHaveValue(formatSeaLongitude(placed.longitude));
    expect(capturingWeatherPanel().waypoints[0].weather).toEqual(draft.waypoints[0].weather);
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

  it('uses Escape to leave fullscreen before ending placement without closing the operation dialog', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAccount();
    fireEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    fireEvent.click(stepButton(2));
    fireEvent.click(formQueries().getByRole('button', { name: 'Placer les waypoints' }));
    fireEvent.click(formQueries().getByRole('button', { name: 'Afficher la carte en plein écran' }));
    fireEvent.click(formQueries().getByRole('button', { name: 'Ajouter au centre' }));
    const points = structuredClone(capturingWeatherPanel().waypoints);
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(formQueries().queryByRole('button', { name: 'Quitter le plein écran' })).not.toBeInTheDocument();
    expect(formQueries().getByRole('button', { name: 'Terminer le placement' })).toBeVisible();
    await waitFor(() => expect(formQueries().getByRole('button', { name: 'Afficher la carte en plein écran' })).toHaveFocus());
    expect(capturingWeatherPanel().waypoints).toEqual(points);
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(formQueries().getByRole('button', { name: 'Placer les waypoints' })).toBeVisible();
    expect(confirm).not.toHaveBeenCalled();
    expect(capturingWeatherPanel().waypoints).toEqual(points);
    expect(saveSeaOperation).not.toHaveBeenCalled();
  });

  it('does not mark a saved operation dirty when only enlarging and restoring its placement map', async () => {
    const draft = waypointCaptureDraft();
    const record = recordFixture(captainAccount, { draft });
    renderAccount(captainAccount, record);
    await openRecord(record);
    fireEvent.click(stepButton(2));
    fireEvent.click(formQueries().getByRole('button', { name: 'Placer les waypoints' }));
    const originalPoints = structuredClone(capturingWeatherPanel().waypoints);
    expect(sessionStorage.getItem('seapilot:sea-operation-draft:v1:1:captain-server-account')).toBeNull();
    fireEvent.click(formQueries().getByRole('button', { name: 'Afficher la carte en plein écran' }));
    fireEvent.click(formQueries().getByRole('button', { name: 'Quitter le plein écran' }));
    expect(capturingWeatherPanel().waypoints).toEqual(originalPoints);
    expect(sessionStorage.getItem('seapilot:sea-operation-draft:v1:1:captain-server-account')).toBeNull();
    expect(footerQueries().queryByText('Modifications non enregistrées')).not.toBeInTheDocument();
    expect(footerQueries().getByRole('button', { name: 'Exporter le PDF' })).toBeEnabled();
    expect(saveSeaOperation).not.toHaveBeenCalled();
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

  it('never exposes fullscreen placement commands for a signed server record', async () => {
    const record = recordFixture(captainAccount, { draft: waypointCaptureDraft(), status: 'signed', canEdit: false, canSign: false });
    const original = structuredClone(record.draft);
    renderAccount(captainAccount, record);
    await openRecord(record);
    fireEvent.click(stepButton(2));
    expect(formQueries().getByRole('figure', { name: 'Carte du parcours' })).toBeVisible();
    expect(formQueries().queryByRole('button', { name: 'Placer les waypoints' })).not.toBeInTheDocument();
    expect(formQueries().queryByRole('button', { name: 'Afficher la carte en plein écran' })).not.toBeInTheDocument();
    expect(formQueries().queryByRole('button', { name: 'Quitter le plein écran' })).not.toBeInTheDocument();
    expect(formQueries().getByLabelText('ETA · date et heure · point 1')).toHaveTextContent('23/10/2026 à 14:00');
    expect(formQueries().queryByRole('grid', { name: /Calendrier/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Choisir l’ETA' })).not.toBeInTheDocument();
    expect(record.draft).toEqual(original);
    expect(saveSeaOperation).not.toHaveBeenCalled();
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

  it('adds consecutive map placements without losing clicks, defaults the departure to now and leaves unavailable estimates empty', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-27T13:27:00Z'));
    renderAccount();
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await userEvent.click(stepButton(2));
    await userEvent.click(formQueries().getByRole('button', { name: 'Placer les waypoints' }));
    const add = formQueries().getByRole('button', { name: 'Ajouter au centre' });
    act(() => { fireEvent.click(add); fireEvent.click(add); });
    const points = capturingWeatherPanel().waypoints;
    expect(points).toHaveLength(2);
    expect(new Set(points.map((point) => point.id)).size).toBe(2);
    expect(points.map((point) => point.number)).toEqual(['1', '2']);
    for (const [index, point] of points.entries()) {
      expect(point).toMatchObject({ latitude: '49', longitude: '-3', eta: index === 0 ? '2026-10-27T14:25' : '', ukc: '', descriptionVhf: `Waypoint ${index + 1}`, denseTraffic: false });
      expect(point).not.toHaveProperty('weather');
      expect(point).not.toHaveProperty('radio');
      expect(formQueries().getByLabelText(`Latitude · point ${index + 1}`)).toHaveValue('49° 00.000′ N');
      expect(formQueries().getByLabelText(`Longitude · point ${index + 1}`)).toHaveValue('003° 00.000′ W');
      expect(etaGroup(index + 1)).toBeVisible();
      expect(etaQueries(index + 1).getByRole('grid', { name: /Calendrier ·/ })).toBeVisible();
      expectEtaTime(index === 0 ? '14:25' : '', etaQueries(index + 1));
    }
    expect(saveSeaOperation).not.toHaveBeenCalled();
  });

  it('keeps map and manual additions numbered uniquely after deleting a middle row', async () => {
    renderAccount();
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await userEvent.click(stepButton(2));
    for (let index = 0; index < 3; index += 1) await userEvent.click(formQueries().getByRole('button', { name: 'Ajouter un point de passage' }));
    await userEvent.click(formQueries().getByRole('button', { name: 'Supprimer le point 2' }));
    await userEvent.click(formQueries().getByRole('button', { name: 'Placer les waypoints' }));
    await userEvent.click(formQueries().getByRole('button', { name: 'Ajouter au centre' }));
    expect(capturingWeatherPanel().waypoints.map((point) => point.number)).toEqual(['1', '3', '4']);
    expect(formQueries().getByLabelText('Waypoint · point 2')).toHaveValue('3');
    expect(formQueries().getByLabelText('Waypoint · point 3')).toHaveValue('4');
    await userEvent.click(formQueries().getByRole('button', { name: 'Ajouter un point de passage' }));
    expect(capturingWeatherPanel().waypoints.map((point) => point.number)).toEqual(['1', '3', '4', '5']);
  });

  it('ends map placement with Escape while keeping the operation dialog open', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAccount();
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await userEvent.click(stepButton(2));
    await userEvent.click(formQueries().getByRole('button', { name: 'Placer les waypoints' }));
    await userEvent.click(formQueries().getByRole('button', { name: 'Ajouter au centre' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(formQueries().getByRole('button', { name: 'Placer les waypoints' })).toBeVisible();
    expect(confirm).not.toHaveBeenCalled();
    expect(capturingWeatherPanel().waypoints).toHaveLength(1);
  });

  it('saves placed coordinates beside the original waypoint without inheriting its weather, ETA or UKC', async () => {
    const draft = waypointCaptureDraft();
    draft.waypoints[0].weather = waypointWeather();
    const record = recordFixture(captainAccount, { draft });
    const { client } = renderAccount(captainAccount, record, 1, plannedMissions());
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, edited) => ({ ...record, version: 4, draft: structuredClone(edited) }));
    await openRecord(record);
    await userEvent.click(stepButton(2));
    await userEvent.click(formQueries().getByRole('button', { name: 'Placer les waypoints' }));
    await userEvent.click(formQueries().getByRole('button', { name: 'Ajouter au centre' }));
    const placed = capturingWeatherPanel().waypoints[1];
    expect(placed).toMatchObject({ eta: '', ukc: '', denseTraffic: false, descriptionVhf: 'Waypoint 2' });
    expect(placed).not.toHaveProperty('weather');
    expect(placed).not.toHaveProperty('radio');
    expect(capturingWeatherPanel().waypoints[0]).toEqual(draft.waypoints[0]);
    await saveDraft();
    expect(await formQueries().findByText('Brouillon enregistré.')).toBeInTheDocument();
    const saved = vi.mocked(saveSeaOperation).mock.calls[0][1];
    expect(saveSeaOperation).toHaveBeenCalledWith(client, saved, record);
    expect(saved.waypoints).toHaveLength(2);
    expect(saved.waypoints[0]).toMatchObject(draft.waypoints[0]);
    expect(saved.waypoints[1]).toMatchObject(placed);
    expect(saved).toMatchObject({ description: draft.description, charts: draft.charts, specialPersonnel: draft.specialPersonnel });
  });

  it('places a responsive route map before the Passage Plan table and updates it from coordinate edits', async () => {
    renderAccount();
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    expect(formQueries().queryByRole('figure', { name: 'Carte du parcours' })).not.toBeInTheDocument();
    await userEvent.click(stepButton(2));
    const map = formQueries().getByRole('figure', { name: 'Carte du parcours' });
    const table = formQueries().getByRole('table', { name: 'Points de passage' });
    const charts = formQueries().getByLabelText('Numéro de la ou des cartes marines');
    expect(map.compareDocumentPosition(charts) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(charts.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(map.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(within(map).getByText(/Renseignez une latitude et une longitude valides/)).toBeVisible();
    for (const [index, latitude, longitude] of [[1, '49.65', '-1.62'], [2, '48.36', '-4.53']] as const) {
      await userEvent.click(formQueries().getByRole('button', { name: 'Ajouter un point de passage' }));
      fireEvent.change(formQueries().getByLabelText(`Latitude · point ${index}`), { target: { value: latitude } });
      fireEvent.change(formQueries().getByLabelText(`Longitude · point ${index}`), { target: { value: longitude } });
    }
    expect(within(map).getByRole('group', { name: 'Carte du parcours · 2 points géolocalisés' })).toBeVisible();
    expect(map.querySelectorAll('.so-route-map-track line')).toHaveLength(1);
    const denseTraffic = formQueries().getByLabelText('Zone maritime à trafic dense · point 2');
    await userEvent.click(denseTraffic);
    expect(map.querySelector('.so-route-map-point-vigilance')).toHaveAttribute('aria-label', 'Vigilance : trafic dense, risque de collision · Waypoint 2');
    await userEvent.click(denseTraffic);
    expect(map.querySelector('.so-route-map-point-vigilance')).toBeNull();
    fireEvent.change(formQueries().getByLabelText('Latitude · point 1'), { target: { value: '' } });
    expect(within(map).getByRole('status')).toHaveTextContent('1 point sans coordonnées valides');
    expect(map.querySelectorAll('.so-route-map-track line')).toHaveLength(0);
    await userEvent.click(formQueries().getByRole('button', { name: 'Supprimer le point 1' }));
    expect(map.querySelector('.so-route-map-point')).toHaveAttribute('data-point-indices', '1');
    await userEvent.click(stepButton(0));
    expect(formQueries().queryByRole('figure', { name: 'Carte du parcours' })).not.toBeInTheDocument();
    expect(saveSeaOperation).not.toHaveBeenCalled();
  });

  it('displays SMCP coordinates without rounding stored positions or invalidating captures on focus and blur', async () => {
    const draft = waypointCaptureDraft();
    draft.waypoints[0].latitude = '49.6500017';
    draft.waypoints[0].longitude = '-1.6200024';
    draft.waypoints[0].weather = { ...waypointWeather(), latitude: 49.6500017, longitude: -1.6200024 };
    draft.waypoints = captureSeaOperationRadios(draft).waypoints;
    const original = structuredClone(draft);
    const record = recordFixture(captainAccount, { draft });
    renderAccount(captainAccount, record);
    await openRecord(record);
    fireEvent.click(stepButton(2));
    const latitude = formQueries().getByLabelText('Latitude · point 1');
    const longitude = formQueries().getByLabelText('Longitude · point 1');
    expect(latitude).toHaveValue('49° 39.000′ N');
    expect(longitude).toHaveValue('001° 37.200′ W');
    for (const input of [latitude, longitude]) {
      fireEvent.focus(input);
      fireEvent.blur(input);
    }
    expect(latitude).toHaveValue('49° 39.000′ N');
    expect(longitude).toHaveValue('001° 37.200′ W');
    expect(capturingWeatherPanel().waypoints).toEqual(original.waypoints);
    expect(record.draft).toEqual(original);
    expect(sessionStorage.length).toBe(0);
    expect(footerQueries().queryByText('Modifications non enregistrées')).not.toBeInTheDocument();
    expect(saveSeaOperation).not.toHaveBeenCalled();
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

  it('preserves typed decimal, SMCP and incomplete coordinates while formatting only the display after blur', async () => {
    const draft = waypointCaptureDraft();
    const original = structuredClone(draft);
    const record = recordFixture(captainAccount, { draft });
    renderAccount(captainAccount, record);
    await openRecord(record);
    fireEvent.click(stepButton(2));
    const latitude = formQueries().getByLabelText('Latitude · point 1');
    const longitude = formQueries().getByLabelText('Longitude · point 1');
    for (const [lat, lon, displayedLat, displayedLon] of [
      ['50,0710667', '-1,0306667', '50° 04.264′ N', '001° 01.840′ W'],
      ['50° 04.264′ S', '001° 01.840′ E', '50° 04.264′ S', '001° 01.840′ E'],
      ['50 E', '-', '50 E', '-'],
    ]) {
      fireEvent.focus(latitude);
      fireEvent.change(latitude, { target: { value: lat } });
      expect(latitude).toHaveValue(lat);
      fireEvent.blur(latitude);
      fireEvent.focus(longitude);
      fireEvent.change(longitude, { target: { value: lon } });
      expect(longitude).toHaveValue(lon);
      fireEvent.blur(longitude);
      expect(latitude).toHaveValue(displayedLat);
      expect(longitude).toHaveValue(displayedLon);
      expect(capturingWeatherPanel().waypoints[0]).toMatchObject({ latitude: lat, longitude: lon });
    }
    expect(record.draft).toEqual(original);
    expect(saveSeaOperation).not.toHaveBeenCalled();
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

  it.each([captainAccount, sailorAccount])('shows recorded map positions read-only for server account $id without changing access', async (account) => {
    const draft = waypointCaptureDraft();
    const original = structuredClone(draft);
    const record = recordFixture(account, { draft, canEdit: false, canSign: false });
    renderAccount(account, record);
    await openRecord(record);
    await userEvent.click(stepButton(2));
    const map = formQueries().getByRole('figure', { name: 'Carte du parcours' });
    expect(within(map).getByRole('img', { name: 'Carte du parcours · 1 point géolocalisé · 1 port défini' })).toBeVisible();
    expect(within(map).queryByRole('button')).not.toBeInTheDocument();
    expect(formQueries().queryByRole('button', { name: 'Placer les waypoints' })).not.toBeInTheDocument();
    expect(formQueries().queryByRole('button', { name: 'Afficher la carte en plein écran' })).not.toBeInTheDocument();
    expect(formQueries().queryByRole('button', { name: 'Quitter le plein écran' })).not.toBeInTheDocument();
    expect(formQueries().getByLabelText('Latitude · point 1')).toBeDisabled();
    expect(formQueries().getByLabelText('ETA · date et heure · point 1')).toHaveTextContent('23/10/2026 à 14:00');
    expect(formQueries().queryByRole('grid', { name: /Calendrier/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Choisir l’ETA' })).not.toBeInTheDocument();
    expect(saveSeaOperation).not.toHaveBeenCalled();
    expect(signSeaOperation).not.toHaveBeenCalled();
    expect(record.draft).toEqual(original);
  });

  it('updates the captain waypoint UKC pill at both boundaries without changing the departure decision or saving', async () => {
    const draft = waypointCaptureDraft();
    draft.waypoints[0].ukc = '2';
    const original = structuredClone(draft);
    const record = recordFixture(captainAccount, { draft });
    const { data } = renderAccount(captainAccount, record, 1, plannedMissions());
    data.vessels[1].draftMeters = 2;
    await openRecord(record);
    await userEvent.click(stepButton(2));
    const input = formQueries().getByLabelText('UKC · point 1');
    const cell = within(input.closest<HTMLElement>('.so-passage-field.is-ukc')!);
    let pill = cell.getByRole('img', { name: /2 m — UKC inférieure ou égale/ });
    expect(pill).toHaveClass('is-danger');
    expect(pill.querySelector('svg')).not.toBeNull();
    fireEvent.change(input, { target: { value: '4' } });
    pill = cell.getByRole('img', { name: /4 m — UKC supérieure au tirant/ });
    expect(pill).toHaveClass('is-warning');
    expect(pill.querySelector('svg')).not.toBeNull();
    fireEvent.change(input, { target: { value: '4.0001' } });
    pill = cell.getByRole('img', { name: /4,0001 m — UKC supérieure/ });
    expect(pill).toHaveClass('is-success');
    expect(pill.querySelector('svg')).toBeNull();
    fireEvent.change(input, { target: { value: 'À vérifier par le Capitaine' } });
    expect(cell.queryByRole('img')).not.toBeInTheDocument();
    expect(input).toHaveValue('À vérifier par le Capitaine');
    const local = JSON.parse(sessionStorage.getItem('seapilot:sea-operation-draft:v1:1:captain-server-account')!).draft;
    expect(local.decision).toBe(original.decision);
    expect(local.checks).toEqual(original.checks);
    await decisionStep();
    expect(choiceInput('Décision', 'NO_GO')).toBeChecked();
    expect(choiceInput('Décision', 'GO')).not.toBeChecked();
    expect(saveSeaOperation).not.toHaveBeenCalled();
    expect(signSeaOperation).not.toHaveBeenCalled();
    expect(record.draft).toEqual(original);
  });

  it('captures the chosen vessel draught independently from its planning weather matrix and clears missing references', async () => {
    const choices = plannedMissions();
    choices[0].vessel.weatherMatrix = structuredClone(GOURY_WEATHER_MATRIX);
    choices[1].vessel.weatherMatrix = null;
    const { data } = renderAccount(captainAccount, undefined, 1, choices);
    data.vessels[0].draftMeters = 2.65;
    data.vessels[1].draftMeters = null;
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await chooseMission(choices[0]);
    await userEvent.click(stepButton(2));
    expect(formQueries().getByLabelText('Tirant d’eau de référence (m)')).toHaveValue(2.65);
    const stored = () => JSON.parse(sessionStorage.getItem('seapilot:sea-operation-draft:v1:1:captain-server-account')!).draft;
    expect(stored().vessel.draftMeters).toBe(2.65);
    await userEvent.click(stepButton(0));
    await chooseMission(choices[1]);
    await userEvent.click(stepButton(2));
    expect(formQueries().getByLabelText('Tirant d’eau de référence (m)')).toHaveValue(null);
    expect(stored().vessel.draftMeters).toBeNull();
    expect(saveSeaOperation).not.toHaveBeenCalled();
  });

  it.each(['save', 'sign'] as const)('captures the current fleet draught before %s and uses the returned canonical snapshot', async (action) => {
    const choices = plannedMissions();
    const draft = waypointCaptureDraft(choices[1]);
    draft.vessel.draftMeters = 1;
    const original = structuredClone(draft);
    const record = recordFixture(captainAccount, { draft });
    const { client, data } = renderAccount(captainAccount, record, 1, choices);
    data.vessels[1].draftMeters = 2.65;
    vi.mocked(fetchSeaOperationCaptainSignature).mockResolvedValue(profileSignature());
    let canonical = record;
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, edited) => (canonical = { ...record, version: 4,
      draft: { ...structuredClone(edited), vessel: { ...structuredClone(edited.vessel), draftMeters: 2.9 } } }));
    vi.mocked(signSeaOperation).mockImplementation(async (_client, saved) => ({ ...canonical, ...saved, status: 'signed', canEdit: false, canSign: false, version: 5 }));
    await openRecord(record);
    await userEvent.click(stepButton(2));
    expect(formQueries().getByLabelText('Tirant d’eau de référence (m)')).toHaveValue(2.65);
    data.vessels[1].draftMeters = 2.8;
    if (action === 'sign') {
      await decisionStep();
      await userEvent.click(screen.getByRole('button', { name: 'Signer la décision NO GO' }));
      expect(await formQueries().findByText('Décision du Capitaine signée et enregistrée. La fiche est figée.')).toBeInTheDocument();
      expect(signSeaOperation).toHaveBeenCalledWith(client, expect.objectContaining({ draft: expect.objectContaining({
        vessel: expect.objectContaining({ draftMeters: 2.9 }),
      }) }), draft.signature.captainName, true);
    } else {
      await saveDraft();
      expect(await formQueries().findByText('Brouillon enregistré.')).toBeInTheDocument();
    }
    expect(vi.mocked(saveSeaOperation).mock.calls[0][1].vessel.draftMeters).toBe(2.8);
    await userEvent.click(stepButton(2));
    expect(formQueries().getByLabelText('Tirant d’eau de référence (m)')).toHaveValue(2.9);
    expect(draft).toEqual(original);
  });

  it.each([
    { signed: true, snapshot: undefined }, { signed: true, snapshot: 2.1 }, { signed: false, snapshot: 2.1 },
  ])('keeps readonly draught snapshots historical instead of using the current vessel (signed=$signed, snapshot=$snapshot)', async ({ signed, snapshot }) => {
    const draft = waypointCaptureDraft();
    if (snapshot !== undefined) draft.vessel.draftMeters = snapshot;
    const original = structuredClone(draft);
    const record = recordFixture(captainAccount, { draft, status: signed ? 'signed' : 'draft', canEdit: false, canSign: false });
    const { data } = renderAccount(captainAccount, record, 1, plannedMissions());
    data.vessels[1].draftMeters = 9;
    await openRecord(record);
    await userEvent.click(stepButton(2));
    expect(formQueries().getByLabelText('Tirant d’eau de référence (m)')).toHaveValue(snapshot ?? null);
    if (snapshot === undefined) {
      expect(formQueries().getByText('Tirant d’eau de référence non enregistré dans cette version : indicateur UKC indisponible.')).toBeVisible();
      expect(formQueries().queryByText('Renseignez le tirant d’eau du navire dans le module Navires.')).not.toBeInTheDocument();
    }
    expect(record.draft).toEqual(original);
    expect(sessionStorage.length).toBe(0);
    expect(saveSeaOperation).not.toHaveBeenCalled();
  });

  it('removes the old vessel draught when manually choosing a vessel whose source has no measurement', async () => {
    const { data } = renderAccount();
    data.vessels[0].draftMeters = 2.65;
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await userEvent.selectOptions(formQueries().getByLabelText('Navire'), '12');
    await userEvent.click(stepButton(2));
    expect(formQueries().getByLabelText('Tirant d’eau de référence (m)')).toHaveValue(2.65);
    await userEvent.click(stepButton(0));
    await userEvent.selectOptions(formQueries().getByLabelText('Navire'), '13');
    await userEvent.click(stepButton(2));
    expect(formQueries().getByLabelText('Tirant d’eau de référence (m)')).toHaveValue(null);
    expect(JSON.parse(sessionStorage.getItem('seapilot:sea-operation-draft:v1:1:captain-server-account')!).draft.vessel).not.toHaveProperty('draftMeters');
  });

  it('captures the chosen vessel matrix and clears it when changing to a vessel without configuration', async () => {
    const choices = plannedMissions();
    choices[0].vessel.weatherMatrix = structuredClone(GOURY_WEATHER_MATRIX);
    choices[1].vessel.weatherMatrix = null;
    const { data } = renderAccount(captainAccount, undefined, 1, choices);
    data.vessels[0].weatherMatrix = createEmptyVesselWeatherMatrix();
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await chooseMission(choices[0]);
    await waitFor(() => expect(JSON.parse(sessionStorage.getItem('seapilot:sea-operation-draft:v1:1:captain-server-account')!).draft.vessel.weatherMatrix).toEqual(GOURY_WEATHER_MATRIX));
    // Planning is the current source even if an older overview has a different configuration.
    expect(choices[0].vessel.weatherMatrix).toEqual(GOURY_WEATHER_MATRIX);
    await chooseMission(choices[1]);
    await waitFor(() => expect(JSON.parse(sessionStorage.getItem('seapilot:sea-operation-draft:v1:1:captain-server-account')!).draft.vessel.weatherMatrix).toBeNull());
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

  it.each(['save', 'sign'] as const)('refreshes an editable draft matrix and retains the canonical saved snapshot before %s', async (action) => {
    const choices = plannedMissions();
    choices[1].vessel.weatherMatrix = structuredClone(GOURY_WEATHER_MATRIX);
    const draft = waypointCaptureDraft(choices[1]);
    draft.vessel.weatherMatrix = createEmptyVesselWeatherMatrix();
    draft.waypoints[0].weather = waypointWeather();
    const original = structuredClone(draft);
    const record = recordFixture(captainAccount, { draft });
    const { client, data } = renderAccount(captainAccount, record, 1, choices);
    data.vessels[1].weatherMatrix = structuredClone(GOURY_WEATHER_MATRIX);
    vi.mocked(fetchSeaOperationCaptainSignature).mockResolvedValue(profileSignature());
    let storedDraft = structuredClone(record.draft);
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, edited) => {
      storedDraft = structuredClone(edited);
      return { ...record, version: 4, draft: storedDraft };
    });
    vi.mocked(signSeaOperation).mockImplementation(async (_client, saved) => ({ ...record, ...saved, draft: structuredClone(storedDraft), status: 'signed', canEdit: false, canSign: false, version: 5 }));
    await openRecord(record);
    await userEvent.click(stepButton(2));
    expect(formQueries().getByText('Peu confortable').closest('.so-waypoint-weather-card')).toHaveClass('is-editor');
    expect(document.querySelector('.so-passage-field.is-number .so-sea-state')).toBeNull();
    if (action === 'sign') {
      await decisionStep();
      await userEvent.click(screen.getByRole('button', { name: 'Signer la décision NO GO' }));
      expect(await formQueries().findByText('Décision du Capitaine signée et enregistrée. La fiche est figée.')).toBeInTheDocument();
      expect(signSeaOperation).toHaveBeenCalledWith(client, expect.objectContaining({ version: 4, draft: expect.objectContaining({ vessel: expect.objectContaining({ weatherMatrix: GOURY_WEATHER_MATRIX }) }) }), draft.signature.captainName, true);
    } else {
      await saveDraft();
      expect(await formQueries().findByText('Brouillon enregistré.')).toBeInTheDocument();
    }
    expect(vi.mocked(saveSeaOperation).mock.calls[0][1].vessel.weatherMatrix).toEqual(GOURY_WEATHER_MATRIX);
    expect(draft).toEqual(original);
  });

  it.each([true, false])('keeps signed/readonly historical matrix snapshots without current configuration (signed=%s)', async (signed) => {
    const choices = plannedMissions();
    choices[1].vessel.weatherMatrix = structuredClone(GOURY_WEATHER_MATRIX);
    const draft = waypointCaptureDraft(choices[1]);
    draft.vessel.weatherMatrix = createEmptyVesselWeatherMatrix();
    draft.waypoints[0].weather = waypointWeather();
    const record = recordFixture(captainAccount, { draft, status: signed ? 'signed' : 'draft', canEdit: false, canSign: false });
    const { data } = renderAccount(captainAccount, record, 1, choices);
    data.vessels[1].weatherMatrix = structuredClone(GOURY_WEATHER_MATRIX);
    await openRecord(record);
    await userEvent.click(stepButton(2));
    expect(formQueries().queryByText('Condition non définie')).not.toBeInTheDocument();
    expect(document.querySelector('.so-editor-form-pane .so-sea-state')).toBeNull();
    expect(formQueries().queryByText('Peu confortable')).not.toBeInTheDocument();
    expect(saveSeaOperation).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
  });

  it('does not mark an unchanged matrix dirty merely because JSONB returns its properties in another order', async () => {
    const draft = waypointCaptureDraft();
    const matrix = structuredClone(GOURY_WEATHER_MATRIX);
    draft.vessel.weatherMatrix = { levels: matrix.levels, periodLowerBoundsSeconds: matrix.periodLowerBoundsSeconds, hsUpperBoundMeters: matrix.hsUpperBoundMeters, hsLowerBoundsMeters: matrix.hsLowerBoundsMeters, version: 1 };
    const record = recordFixture(captainAccount, { draft });
    const { data } = renderAccount(captainAccount, record);
    data.vessels[1].weatherMatrix = matrix;
    await openRecord(record);
    expect(footerQueries().getByRole('button', { name: 'Exporter le PDF' })).toBeEnabled();
    expect(footerQueries().queryByText('Modifications non enregistrées')).not.toBeInTheDocument();
    expect(sessionStorage.length).toBe(0);
  });

  it('starts the four optional sections at Non and other checks at Oui without choosing a decision', async () => {
    renderAccount();
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await userEvent.click(stepButton(1));
    expect(formQueries().getAllByRole('switch')).toHaveLength(22);
    for (const title of ['Remorquage', 'Chargement de marchandise', 'Navire de support de plongeur', 'Approvisionnement / Avitaillement']) {
      expect(answerInput(`${title} applicable`)).not.toBeChecked();
      expect(answerInput(`${title} applicable`)).toHaveTextContent('Non');
    }
    for (const check of SEA_OPERATION_CHECKS.filter((item) => !item.applicability)) {
      const control = answerInput(check.label);
      expect(control).toBeChecked();
      expect(control).toHaveTextContent('Oui');
    }
    expect(formQueries().queryByRole('switch', { name: 'Shipchandler' })).not.toBeInTheDocument();
    await userEvent.click(answerInput('Remorquage applicable'));
    expect(answerInput('Le plan de remorquage a été réalisé et communiqué à bord')).toBeChecked();
    await userEvent.click(answerInput('Remorquage applicable'));
    expect(formQueries().queryByRole('switch', { name: 'Le plan de remorquage a été réalisé et communiqué à bord' })).not.toBeInTheDocument();
    expect(formQueries().getByText(/Réponses préremplies : à vérifier avant signature/)).toBeVisible();
    await decisionStep();
    expect(choiceInput('Décision', 'GO')).not.toBeChecked();
    expect(choiceInput('Décision', 'NO_GO')).not.toBeChecked();
    expect(formQueries().getByRole('checkbox', { name: /En qualité de Capitaine/ })).not.toBeChecked();
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

  it('passes the selected project and live route to the weather panel and displays only the vessel reference draught', async () => {
    const [mission] = plannedMissions();
    const draft = noGoDraft();
    draft.project = mission.project;
    draft.planning = { date: seaOperationToday(), operationId: mission.operationId, projectId: mission.projectId, captainPersonId: mission.captains[0].personId };
    draft.waypoints = [{ id: 'weather-point', number: '1', descriptionVhf: '', latitude: '', longitude: '', ukc: '', eta: '', denseTraffic: false }];
    const record = recordFixture(captainAccount, { draft });
    const { client, data } = renderAccount(captainAccount, record, 1, [mission], true);
    data.vessels[0].draftMeters = 2.65;
    await openRecord(record);
    expect(weatherPanelMock).toHaveBeenLastCalledWith(expect.objectContaining({ client, projectId: mission.projectId, preview: true, active: true, waypoints: [{ ...draft.waypoints[0], descriptionVhf: 'Waypoint 1' }] }));
    await userEvent.click(stepButton(2));
    expect(formQueries().getByLabelText('Tirant d’eau de référence (m)')).toHaveValue(2.65);
    expect(formQueries().getByLabelText('Tirant d’eau de référence (m)')).toHaveAttribute('readonly');
    expect(formQueries().queryByText(/Renseignez le tirant d’eau/)).not.toBeInTheDocument();
    fireEvent.change(formQueries().getByLabelText('Latitude · point 1'), { target: { value: '49.65' } });
    fireEvent.change(formQueries().getByLabelText('Longitude · point 1'), { target: { value: '-1.62' } });
    applyEta('2026-10-22', '14:30');
    expect(weatherPanelMock).toHaveBeenLastCalledWith(expect.objectContaining({ client, projectId: mission.projectId, preview: true, active: true, waypoints: [expect.objectContaining({ latitude: '49.65', longitude: '-1.62', eta: '2026-10-22T14:30' })] }));
    expect(chartsPanelMock).toHaveBeenLastCalledWith(expect.objectContaining({ client, projectId: mission.projectId, preview: true, active: true, canEdit: true, charts: draft.charts, waypoints: [expect.objectContaining({ latitude: '49.65', longitude: '-1.62' })] }));
    expect(saveSeaOperation).not.toHaveBeenCalled();
  });

  it('keeps weather acquisition active across preparation steps and accepts its completion after leaving the Passage Plan', async () => {
    const draft = waypointCaptureDraft();
    const record = recordFixture(captainAccount, { draft });
    const { client } = renderAccount(captainAccount, record);
    await openRecord(record);
    const callback = capturingWeatherPanel().onWeatherLoaded!;
    const statusCallback = capturingWeatherPanel().onStatusChange;
    for (const index of [2, 1, 0, 3]) {
      fireEvent.click(stepButton(index));
      expect(capturingWeatherPanel().active).toBe(true);
      expect(capturingWeatherPanel().onWeatherLoaded).toBe(callback);
      expect(capturingWeatherPanel().onStatusChange).toBe(statusCallback);
    }
    await act(async () => callback(waypointWeather(), waypointWeatherContext(draft), client));
    expect(capturingWeatherPanel().waypoints[0].weather).toEqual(waypointWeather());
    expect(footerQueries().getByText('Modifications non enregistrées')).toBeVisible();
    expect(saveSeaOperation).not.toHaveBeenCalled();
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

  it('waits for missing draft forecasts before saving from another step and retains them when reopening', async () => {
    const draft = waypointCaptureDraft();
    const record = recordFixture(captainAccount, { draft });
    const pending = deferred<SeaOperationPayload>();
    const { client } = renderAccount(captainAccount, record, 1, [], true);
    let stored = record;
    vi.mocked(fetchSeaOperationDetail).mockImplementation(async () => stored);
    vi.mocked(captureSeaOperationValidationWeather).mockReturnValue(pending.promise);
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, captured) => (stored = { ...record, version: 4, draft: structuredClone(captured) }));
    await openRecord(record);
    fireEvent.click(stepButton(2));
    fireEvent.click(stepButton(0));
    await saveDraft();
    expect(captureSeaOperationValidationWeather).toHaveBeenCalledWith(client, expect.objectContaining({ project: draft.project }), { preview: true, missingOnly: true });
    expect(saveSeaOperation).not.toHaveBeenCalled();
    expect(footerQueries().getByRole('button', { name: 'Enregistrer le brouillon' })).toBeDisabled();
    const prepared = vi.mocked(captureSeaOperationValidationWeather).mock.calls[0][1];
    await act(async () => pending.resolve({ ...prepared, waypoints: [{ ...prepared.waypoints[0], weather: waypointWeather() }] }));
    expect(await formQueries().findByText('Brouillon enregistré.')).toBeVisible();
    expect(saveSeaOperation).toHaveBeenCalledWith(client, expect.objectContaining({ waypoints: [expect.objectContaining({ weather: waypointWeather() })] }), record);
    expect(signSeaOperation).not.toHaveBeenCalled();
    fireEvent.click(footerQueries().getByRole('button', { name: 'Annuler' }));
    await openRecord(stored);
    expect(capturingWeatherPanel().waypoints[0].weather).toEqual(waypointWeather());
  });

  it('displays each weather request error beside its own waypoint without altering the saved preparation', async () => {
    const draft = waypointCaptureDraft();
    draft.waypoints.push({ ...draft.waypoints[0], id: 'second-weather-point', number: '4', eta: '2026-10-25T14:00' });
    const original = structuredClone(draft);
    const record = recordFixture(captainAccount, { draft });
    const { client } = renderAccount(captainAccount, record);
    await openRecord(record);
    const callback = capturingWeatherPanel().onStatusChange!;
    const keys = draft.waypoints.map((point) => weatherRequestKey(draft.planning!.projectId, point));
    await act(async () => callback({ [keys[0]]: { loading: false, error: 'Prévision indisponible pour le premier waypoint.' }, [keys[1]]: { loading: true } }, client));
    fireEvent.click(stepButton(2));
    const firstRow = formQueries().getByLabelText('Description · point 1').closest<HTMLElement>('.so-passage-row')!;
    const secondRow = formQueries().getByLabelText('Description · point 2').closest<HTMLElement>('.so-passage-row')!;
    expect(within(firstRow).getByText('Prévision indisponible pour le premier waypoint.')).toBeVisible();
    expect(within(secondRow).queryByText('Prévision indisponible pour le premier waypoint.')).not.toBeInTheDocument();
    await act(async () => callback({ [keys[0]]: { loading: false }, [keys[1]]: { loading: false, error: 'ETA du second waypoint hors de la période disponible.' } }, client));
    expect(within(firstRow).queryByText('Prévision indisponible pour le premier waypoint.')).not.toBeInTheDocument();
    expect(within(secondRow).getByText('ETA du second waypoint hors de la période disponible.')).toBeVisible();
    expect(capturingWeatherPanel().waypoints).toEqual(original.waypoints);
    expect(sessionStorage.length).toBe(0);
    expect(footerQueries().queryByText('Modifications non enregistrées')).not.toBeInTheDocument();
    expect(saveSeaOperation).not.toHaveBeenCalled();
  });

  it.each([false, true])('clears stale request errors only for successfully saved forecast snapshots, including an unavailable provider response (empty=%s)', async (empty) => {
    const draft = waypointCaptureDraft();
    draft.waypoints.push({ ...draft.waypoints[0], id: 'still-missing-weather', number: '4', eta: '2026-10-25T14:00' });
    const record = recordFixture(captainAccount, { draft });
    const { client } = renderAccount(captainAccount, record);
    const weather = empty ? { ...waypointWeather(), wind: null, waves: null, windMessage: 'Vent indisponible à cette ETA hors horizon.', wavesMessage: 'Houle indisponible à cette ETA hors horizon.' } : waypointWeather();
    vi.mocked(captureSeaOperationValidationWeather).mockImplementation(async (_client, prepared) => ({ ...prepared, waypoints: prepared.waypoints.map((point, index) => index === 0 ? { ...point, weather } : point) }));
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, captured) => ({ ...record, version: 4, draft: structuredClone(captured) }));
    await openRecord(record);
    fireEvent.click(stepButton(2));
    const keys = draft.waypoints.map((point) => weatherRequestKey(draft.planning!.projectId, point));
    await act(async () => capturingWeatherPanel().onStatusChange!({ [keys[0]]: { loading: false, error: 'Ancienne panne du premier point.' }, [keys[1]]: { loading: false, error: 'Le second point reste sans prévision.' } }, client));
    expect(formQueries().getByText('Ancienne panne du premier point.')).toBeVisible();
    await saveDraft();
    expect(await formQueries().findByText('Brouillon enregistré.')).toBeVisible();
    expect(formQueries().queryByText('Ancienne panne du premier point.')).not.toBeInTheDocument();
    expect(formQueries().getByText('Le second point reste sans prévision.')).toBeVisible();
    expect(formQueries().queryByText(/(?:Chargement|Actualisation) des prévisions météo…/)).not.toBeInTheDocument();
    if (empty) expect(within(formQueries().getByRole('table', { name: 'Points de passage' })).getByText('Houle indisponible à cette ETA hors horizon.')).toBeVisible();
    expect(capturingWeatherPanel().waypoints[0].weather).toEqual(weather);
    expect(capturingWeatherPanel().waypoints[1]).not.toHaveProperty('weather');
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

  it('ignores weather request statuses for old coordinates and for an earlier authenticated client', async () => {
    const draft = waypointCaptureDraft();
    const record = recordFixture(captainAccount, { draft });
    const view = renderAccount(captainAccount, record);
    await openRecord(record);
    fireEvent.click(stepButton(2));
    const callback = capturingWeatherPanel().onStatusChange!;
    const oldKey = weatherRequestKey(draft.planning!.projectId, draft.waypoints[0]);
    fireEvent.change(formQueries().getByLabelText('Latitude · point 1'), { target: { value: '49.75' } });
    const currentPoint = capturingWeatherPanel().waypoints[0];
    const currentKey = weatherRequestKey(draft.planning!.projectId, currentPoint);
    await act(async () => callback({ [oldKey]: { loading: false, error: 'Anciennes coordonnées à ignorer.' } }, view.client));
    expect(formQueries().queryByText('Anciennes coordonnées à ignorer.')).not.toBeInTheDocument();
    await act(async () => callback({ [currentKey]: { loading: false, error: 'Erreur du contexte actuel.' } }, view.client));
    expect(formQueries().getByText('Erreur du contexte actuel.')).toBeVisible();
    const other = recordFixture(sailorAccount, { id: 'same-waypoint-other-client', draft: { ...structuredClone(draft), project: 'Autre compte météo', waypoints: [structuredClone(currentPoint)] } });
    vi.mocked(fetchSeaOperationData).mockResolvedValue({ ...view.data, actorId: sailorAccount.id, actorName: sailorAccount.name, records: [other] });
    vi.mocked(fetchSeaOperationDetail).mockResolvedValue(other);
    const nextClient = { fixtureAccountId: sailorAccount.id };
    view.rerenderClient(nextClient);
    await openRecord(other);
    fireEvent.click(stepButton(2));
    expect(capturingWeatherPanel().onStatusChange).toBe(callback);
    await act(async () => callback({ [currentKey]: { loading: false, error: 'Erreur périmée de l’ancien client.' } }, view.client));
    expect(formQueries().queryByText('Erreur périmée de l’ancien client.')).not.toBeInTheDocument();
    expect(formQueries().queryByText('Erreur du contexte actuel.')).not.toBeInTheDocument();
    await act(async () => callback({ [currentKey]: { loading: false, error: 'Prévision du nouveau compte indisponible.' } }, nextClient));
    expect(formQueries().getByText('Prévision du nouveau compte indisponible.')).toBeVisible();
    expect(capturingWeatherPanel().waypoints).toEqual(other.draft.waypoints);
    expect(saveSeaOperation).not.toHaveBeenCalled();
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

  it('keeps request status messages out of a signed record and stops automatic weather acquisition', async () => {
    const draft = waypointCaptureDraft();
    draft.waypoints[0].weather = waypointWeather();
    const record = recordFixture(captainAccount, { draft, status: 'signed', canEdit: false, canSign: false });
    const { client } = renderAccount(captainAccount, record);
    await openRecord(record);
    expect(capturingWeatherPanel().active).toBe(false);
    const key = weatherRequestKey(draft.planning!.projectId, draft.waypoints[0]);
    await act(async () => capturingWeatherPanel().onStatusChange!({ [key]: { loading: false, error: 'État de requête sans valeur historique.' } }, client));
    fireEvent.click(stepButton(2));
    expect(formQueries().queryByText('État de requête sans valeur historique.')).not.toBeInTheDocument();
    expect(capturingWeatherPanel().waypoints[0].weather).toEqual(waypointWeather());
    expect(sessionStorage.length).toBe(0);
    expect(captureSeaOperationValidationWeather).not.toHaveBeenCalled();
    expect(saveSeaOperation).not.toHaveBeenCalled();
  });

  it('waits for the validation forecast before persisting the signed revision and ignores a later panel response', async () => {
    const draft = waypointCaptureDraft();
    const record = recordFixture(captainAccount, { draft });
    const pendingCapture = deferred<SeaOperationPayload>();
    const { client } = renderAccount(captainAccount, record, 1, plannedMissions(), true);
    vi.mocked(fetchSeaOperationCaptainSignature).mockResolvedValue(profileSignature());
    vi.mocked(captureSeaOperationValidationWeather).mockReturnValue(pendingCapture.promise);
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, captured) => ({ ...record, draft: structuredClone(captured), version: 4 }));
    vi.mocked(signSeaOperation).mockImplementation(async (_client, saved) => ({ ...record, ...saved,
      draft: structuredClone(vi.mocked(saveSeaOperation).mock.calls[0][1]), status: 'signed', version: 5, canEdit: false, canSign: false,
      signedBy: captainAccount.id, signedByName: captainAccount.name, signedAt: '2026-10-23T08:15:00Z', weatherObservations: [] }));
    await openRecord(record);
    const callback = capturingWeatherPanel().onWeatherLoaded!;
    await decisionStep();
    await userEvent.click(screen.getByRole('button', { name: 'Signer la décision NO GO' }));
    expect(captureSeaOperationValidationWeather).toHaveBeenCalledWith(client, expect.objectContaining({ project: draft.project }), { preview: true, missingOnly: false });
    expect(saveSeaOperation).not.toHaveBeenCalled();
    expect(signSeaOperation).not.toHaveBeenCalled();
    const stale = { ...waypointWeather(), wind: { ...waypointWeather().wind!, speedKnots: 99 } };
    await act(async () => callback(stale, waypointWeatherContext(draft), client));
    const prepared = vi.mocked(captureSeaOperationValidationWeather).mock.calls[0][1];
    await act(async () => pendingCapture.resolve({ ...prepared, waypoints: [{ ...prepared.waypoints[0], weather: waypointWeather() }] }));
    expect(await formQueries().findByText('Décision du Capitaine signée et enregistrée. La fiche est figée.')).toBeInTheDocument();
    expect(vi.mocked(saveSeaOperation).mock.calls[0][1].waypoints[0].weather).toEqual(waypointWeather());
    expect(capturingWeatherPanel()).toMatchObject({ readOnly: true, validatedAt: '2026-10-23T08:15:00Z', observations: [] });
    await act(async () => callback(stale, waypointWeatherContext(draft), client));
    expect(capturingWeatherPanel().waypoints[0].weather).toEqual(waypointWeather());
    expect(saveSeaOperation).toHaveBeenCalledTimes(1);
    expect(signSeaOperation).toHaveBeenCalledTimes(1);
    expect(sessionStorage.length).toBe(0);
  });

  it('refreshes only the measured annex of a signed operation and retains it when its next read fails', async () => {
    const draft = waypointCaptureDraft();
    draft.waypoints[0].weather = waypointWeather();
    const record = recordFixture(captainAccount, { draft, status: 'signed', canEdit: false, canSign: false,
      signedBy: captainAccount.id, signedByName: captainAccount.name, signedAt: '2026-10-23T08:15:00Z', weatherObservations: [] });
    const original = structuredClone(record);
    const observation: ObservationResult = { pointId: 'capture-point', latitude: 49.65, longitude: -1.62,
      etaUtc: '2026-10-23T12:00:00Z', recordedAt: '2026-10-24T08:00:00Z', wind: null, waves: null,
      status: 'unavailable', message: 'Aucune mesure officielle proche disponible.' };
    const { client } = renderAccount(captainAccount, record, 1, plannedMissions());
    vi.mocked(fetchSeaOperationWeatherObservations).mockResolvedValueOnce([observation]).mockRejectedValueOnce(new Error('Lecture indisponible'));
    await openRecord(record);
    await userEvent.click(stepButton(2));
    expect(capturingWeatherPanel()).toMatchObject({ readOnly: true, observations: [], validatedAt: record.signedAt });
    expect(formQueries().getByRole('button', { name: 'Actualiser les mesures enregistrées' })).toBeEnabled();
    await userEvent.click(formQueries().getByRole('button', { name: 'Actualiser les mesures enregistrées' }));
    await waitFor(() => expect(capturingWeatherPanel().observations).toEqual([observation]));
    expect(fetchSeaOperationWeatherObservations).toHaveBeenCalledWith(client, record.id);
    expect(capturingWeatherPanel().waypoints).toEqual(original.draft.waypoints);
    await userEvent.click(formQueries().getByRole('button', { name: 'Actualiser les mesures enregistrées' }));
    expect(await formQueries().findByText('Les mesures météo enregistrées sont temporairement indisponibles. Réessayez leur lecture.')).toBeVisible();
    expect(capturingWeatherPanel().observations).toEqual([observation]);
    expect(capturingWeatherPanel().waypoints).toEqual(original.draft.waypoints);
    expect(record).toEqual(original);
    expect(captureSeaOperationValidationWeather).not.toHaveBeenCalled();
    expect(saveSeaOperation).not.toHaveBeenCalled();
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

  it.each(['save', 'sign'] as const)('persists matching waypoint weather and sourced radio contacts before %s while preserving preparation fields', async (action) => {
    const draft = waypointCaptureDraft();
    const original = structuredClone(draft);
    const record = recordFixture(captainAccount, { draft });
    const { client } = renderAccount(captainAccount, record, 1, plannedMissions());
    vi.mocked(fetchSeaOperationCaptainSignature).mockResolvedValue(profileSignature());
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, edited) => ({ ...record, draft: structuredClone(edited), version: 4 }));
    vi.mocked(signSeaOperation).mockImplementation(async (_client, saved) => ({ ...record, ...saved, draft: structuredClone(vi.mocked(saveSeaOperation).mock.calls[0][1]), status: 'signed', version: 5, canEdit: false, canSign: false, signedBy: captainAccount.id, signedByName: captainAccount.name, signedAt: '2026-10-23T08:15:00Z' }));
    await openRecord(record);
    const weather = waypointWeather();
    expect(capturingWeatherPanel().onWeatherLoaded).toBeTypeOf('function');
    await act(async () => capturingWeatherPanel().onWeatherLoaded!(weather, waypointWeatherContext(draft), { fixtureAccountId: 'previous-authenticated-client' }));
    expect(capturingWeatherPanel().waypoints[0]).not.toHaveProperty('weather');
    await act(async () => capturingWeatherPanel().onWeatherLoaded!(weather, waypointWeatherContext(draft), client));
    if (action === 'sign') {
      await decisionStep();
      await userEvent.click(screen.getByRole('button', { name: 'Signer la décision NO GO' }));
      expect(await formQueries().findByText('Décision du Capitaine signée et enregistrée. La fiche est figée.')).toBeInTheDocument();
    } else {
      await saveDraft();
      expect(await formQueries().findByText('Brouillon enregistré.')).toBeInTheDocument();
    }
    expect(saveSeaOperation).toHaveBeenCalledTimes(1);
    const savedPayload = vi.mocked(saveSeaOperation).mock.calls[0][1];
    expect(saveSeaOperation).toHaveBeenCalledWith(client, savedPayload, record);
    expect(savedPayload).toEqual({ ...original, waypoints: [expect.objectContaining({ ...original.waypoints[0], weather })] });
    expect(savedPayload.waypoints[0].radio).toEqual(expect.objectContaining({
      version: 1, latitude: 49.65, longitude: -1.62, capturedAt: expect.any(String), verifiedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      contacts: expect.arrayContaining([
        expect.objectContaining({ id: 'cross-jobourg', kind: 'rescue', name: 'CROSS Jobourg', vhf: '16', source: expect.stringContaining('https://'), sourceLabel: expect.any(String), distanceNm: expect.any(Number) }),
        expect.objectContaining({ id: 'cherbourg-port', kind: 'port', name: 'Cherbourg · Capitainerie', vhf: '12', phone: '+33 2 33 20 41 25', source: 'https://portsdenormandie.fr/en/harbour-masters-office/cherbourg', distanceNm: 0 }),
      ]),
    }));
    expect(Number.isFinite(Date.parse(savedPayload.waypoints[0].radio!.capturedAt))).toBe(true);
    expect(draft).toEqual(original);
    if (action === 'sign') {
      expect(signSeaOperation).toHaveBeenCalledWith(client, expect.objectContaining({ version: 4, draft: savedPayload }), draft.signature.captainName, true);
    } else expect(signSeaOperation).not.toHaveBeenCalled();
  });

  it.each(['save', 'sign'] as const)('replays weather arriving during a pending %s only if the completed record stays editable', async (action) => {
    const draft = waypointCaptureDraft();
    const record = recordFixture(captainAccount, { draft });
    const pendingSave = deferred<SeaOperationRecord>();
    const { client } = renderAccount(captainAccount, record, 1, plannedMissions());
    vi.mocked(fetchSeaOperationCaptainSignature).mockResolvedValue(profileSignature());
    vi.mocked(saveSeaOperation).mockImplementationOnce(() => pendingSave.promise)
      .mockImplementation(async (_client, edited) => ({ ...record, draft: structuredClone(edited), version: 5 }));
    vi.mocked(signSeaOperation).mockImplementation(async () => ({ ...record, draft: structuredClone(vi.mocked(saveSeaOperation).mock.calls[0][1]), status: 'signed', version: 5, canEdit: false, canSign: false, signedBy: captainAccount.id, signedByName: captainAccount.name, signedAt: '2026-10-23T08:15:00Z' }));
    await openRecord(record);
    const callback = capturingWeatherPanel().onWeatherLoaded!;
    if (action === 'sign') {
      await decisionStep();
      await userEvent.click(screen.getByRole('button', { name: 'Signer la décision NO GO' }));
    } else await saveDraft();
    expect(saveSeaOperation).toHaveBeenCalledTimes(1);
    const initiallySaved = structuredClone(vi.mocked(saveSeaOperation).mock.calls[0][1]);
    expect(initiallySaved.waypoints[0]).not.toHaveProperty('weather');
    await act(async () => callback(waypointWeather(), waypointWeatherContext(draft), client));
    expect(capturingWeatherPanel().waypoints[0]).not.toHaveProperty('weather');
    expect(footerQueries().getByText('Enregistrement…')).toBeVisible();
    await act(async () => pendingSave.resolve({ ...record, draft: initiallySaved, version: 4 }));
    if (action === 'sign') {
      expect(await formQueries().findByText('Décision du Capitaine signée et enregistrée. La fiche est figée.')).toBeInTheDocument();
      expect(capturingWeatherPanel().waypoints).toEqual(initiallySaved.waypoints);
      expect(capturingWeatherPanel().waypoints[0]).not.toHaveProperty('weather');
      expect(footerQueries().queryByText('Modifications non enregistrées')).not.toBeInTheDocument();
      expect(sessionStorage.length).toBe(0);
      expect(signSeaOperation).toHaveBeenCalledWith(client, expect.objectContaining({ version: 4, draft: initiallySaved }), draft.signature.captainName, true);
    } else {
      expect(await footerQueries().findByText('Modifications non enregistrées')).toBeVisible();
      expect(capturingWeatherPanel().waypoints[0]).toEqual({ ...initiallySaved.waypoints[0], weather: waypointWeather() });
      expect(JSON.parse(sessionStorage.getItem('seapilot:sea-operation-draft:v1:1:captain-server-account')!).draft.waypoints[0].weather).toEqual(waypointWeather());
      expect(saveSeaOperation).toHaveBeenCalledTimes(1);
      await saveDraft();
      expect(await formQueries().findByText('Brouillon enregistré.')).toBeInTheDocument();
      expect(saveSeaOperation).toHaveBeenLastCalledWith(client, expect.objectContaining({ waypoints: [expect.objectContaining({ weather: waypointWeather() })] }), expect.objectContaining({ version: 4 }));
      expect(signSeaOperation).not.toHaveBeenCalled();
    }
  });

  it('ignores a previous project weather response when the next project reuses the same waypoint coordinates and ETA', async () => {
    const choices = plannedMissions();
    const first = recordFixture(captainAccount, { id: 'capture-record-a', draft: waypointCaptureDraft(choices[0]) });
    const second = recordFixture(captainAccount, { id: 'capture-record-b', draft: waypointCaptureDraft(choices[1]) });
    second.draft.description = 'Seconde mission à préserver.';
    const originalSecond = structuredClone(second.draft);
    const { client, data } = renderAccount(captainAccount, first, 1, choices);
    data.records.push(second);
    vi.mocked(fetchSeaOperationDetail).mockImplementation(async (_client, id) => id === first.id ? first : second);
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, edited) => ({ ...second, draft: structuredClone(edited), version: 4 }));
    await openRecord(first);
    const previousCallback = capturingWeatherPanel().onWeatherLoaded!;
    await userEvent.click(footerQueries().getByRole('button', { name: 'Annuler' }));
    await openRecord(second);
    await act(async () => previousCallback(waypointWeather(), waypointWeatherContext(first.draft), client));
    expect(capturingWeatherPanel().waypoints).toEqual(originalSecond.waypoints);
    await saveDraft();
    expect(await formQueries().findByText('Brouillon enregistré.')).toBeInTheDocument();
    expect(saveSeaOperation).toHaveBeenCalledWith(client, expect.objectContaining({
      ...originalSecond,
      waypoints: [expect.objectContaining(originalSecond.waypoints[0])],
    }), second);
    expect(vi.mocked(saveSeaOperation).mock.calls[0][1].waypoints[0]).not.toHaveProperty('weather');
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

  it('ignores an already started weather callback after a signed record opens and preserves its recorded captures', async () => {
    const draft = waypointCaptureDraft();
    const first = recordFixture(captainAccount, { id: 'capture-editable', draft });
    const signedDraft = structuredClone(draft);
    signedDraft.project = 'Captures historiques signées';
    signedDraft.waypoints[0].weather = waypointWeather();
    signedDraft.waypoints[0].radio = { version: 1, latitude: 49.65, longitude: -1.62, capturedAt: '2026-10-22T08:00:00Z', verifiedOn: '2026-10-21', contacts: [{ id: 'historic-contact', kind: 'rescue', name: 'Contact radio archivé', area: 'Manche', vhf: '16', source: 'https://example.test/archive', sourceLabel: 'Source archivée', distanceNm: 4 }] };
    const signedRecord = recordFixture(captainAccount, { id: 'capture-signed', draft: signedDraft, status: 'signed', canEdit: true, canSign: true, signedBy: captainAccount.id, signedByName: captainAccount.name, signedAt: '2026-10-23T08:15:00Z' });
    const originalSigned = structuredClone(signedDraft);
    const { client, data } = renderAccount(captainAccount, first, 1, plannedMissions());
    data.records.push(signedRecord);
    vi.mocked(fetchSeaOperationDetail).mockImplementation(async (_client, id) => id === first.id ? first : signedRecord);
    await openRecord(first);
    const previousCallback = capturingWeatherPanel().onWeatherLoaded!;
    await userEvent.click(footerQueries().getByRole('button', { name: 'Annuler' }));
    await openRecord(signedRecord);
    const refreshedWeather = { ...waypointWeather(), fetchedAt: '2026-10-23T08:30:00.000Z', wind: { ...waypointWeather().wind!, speedKnots: 35 } };
    await act(async () => previousCallback(refreshedWeather, waypointWeatherContext(draft), client));
    expect(capturingWeatherPanel().waypoints).toEqual(originalSigned.waypoints);
    expect(signedDraft).toEqual(originalSigned);
    await userEvent.click(stepButton(2));
    expect(formQueries().getByLabelText('Latitude · point 1')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Enregistrer le brouillon' })).not.toBeInTheDocument();
    expect(saveSeaOperation).not.toHaveBeenCalled();
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

  it('opens a legacy waypoint without inventing saved weather or radio captures', async () => {
    const draft = noGoDraft();
    draft.waypoints = [{ id: 'legacy-without-captures', number: '2', descriptionVhf: 'Ancien descriptif et canal VHF 12', latitude: '49.65', longitude: '-1.62', ukc: 'Ancienne UKC validée à bord', eta: '12:00', denseTraffic: true }];
    const original = structuredClone(draft);
    const record = recordFixture(captainAccount, { draft });
    renderAccount(captainAccount, record);
    await openRecord(record);
    await userEvent.click(stepButton(2));
    expect(capturingWeatherPanel().waypoints).toEqual(original.waypoints);
    expect(capturingWeatherPanel().waypoints[0]).not.toHaveProperty('weather');
    expect(capturingWeatherPanel().waypoints[0]).not.toHaveProperty('radio');
    expect(formQueries().getByLabelText('Description · point 1')).toHaveValue(original.waypoints[0].descriptionVhf);
    expect(formQueries().getByLabelText('UKC · point 1')).toHaveValue(original.waypoints[0].ukc);
    expect(formQueries().getByText(/Ancienne ETA : 12:00/)).toBeVisible();
    expect(sessionStorage.length).toBe(0);
    expect(draft).toEqual(original);
    expect(saveSeaOperation).not.toHaveBeenCalled();
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

  it('leaves a missing vessel draught blank and directs the user to the vessel record', async () => {
    renderAccount();
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await userEvent.selectOptions(formQueries().getByLabelText('Navire'), '12');
    await userEvent.click(stepButton(2));
    expect(formQueries().getByLabelText('Tirant d’eau de référence (m)')).toHaveValue(null);
    expect(formQueries().getByText('Renseignez le tirant d’eau du navire dans le module Navires.')).toBeVisible();
  });

  it('keeps the SHOM consultation outside disabled signed fields and forbids adding references', async () => {
    const record = recordFixture(captainAccount, { status: 'signed', canEdit: false, canSign: false, signedBy: captainAccount.id, signedByName: captainAccount.name, signedAt: '2026-10-16T09:15:00Z' });
    renderAccount(captainAccount, record);
    await openRecord(record);
    await userEvent.click(stepButton(2));
    expect(chartsPanelMock).toHaveBeenLastCalledWith(expect.objectContaining({ canEdit: false }));
    expect(formQueries().getByTestId('sea-charts-panel').closest('fieldset')).toBeNull();
    expect(formQueries().getByLabelText('Numéro de la ou des cartes marines')).toBeDisabled();
    expect(saveSeaOperation).not.toHaveBeenCalled();
  });

  it('repairs an incomplete draft captain identity from Planning and requires its attestation again', async () => {
    const mission = plannedMissions()[0];
    const draft = noGoDraft();
    draft.project = mission.project;
    draft.planning = { date: seaOperationToday(), operationId: mission.operationId, projectId: mission.projectId, captainPersonId: mission.captains[0].personId };
    draft.vessel.captainName = '';
    draft.signature.captainName = '';
    const record = recordFixture(captainAccount, { draft });
    const { client } = renderAccount(captainAccount, record, 1, [mission]);
    await openRecord(record);
    await waitFor(() => expect(formQueries().getByLabelText('Prénom NOM du Capitaine')).toHaveValue(mission.captains[0].name));
    await decisionStep();
    expect(formQueries().getByLabelText('Prénom NOM du Capitaine signataire')).toHaveValue(mission.captains[0].name);
    expect(formQueries().getByLabelText('Prénom NOM du Capitaine signataire')).toHaveAttribute('readonly');
    expect(formQueries().getByRole('checkbox', { name: /En qualité de Capitaine/ })).not.toBeChecked();
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, edited) => ({ ...record, draft: edited, version: 4 }));
    await saveDraft();
    expect(await formQueries().findByText('Brouillon enregistré.')).toBeInTheDocument();
    expect(saveSeaOperation).toHaveBeenCalledWith(client, expect.objectContaining({ signature: expect.objectContaining({ captainName: mission.captains[0].name, acknowledged: false }) }), record);
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

  it('preserves signed historical identity, answers and time-only ETA when today’s Planning has another captain', async () => {
    const mission = plannedMissions()[0];
    const draft = noGoDraft();
    draft.project = mission.project;
    draft.planning = { date: seaOperationToday(), operationId: mission.operationId, projectId: mission.projectId, captainPersonId: mission.captains[0].personId };
    draft.signature.captainName = 'Capitaine historique signé';
    draft.checks.weather = 'no';
    draft.waypoints = [{ id: 'historic-point', number: '1', descriptionVhf: 'Ancien descriptif VHF conservé', latitude: '49 N', longitude: '001 W', ukc: '2 m', eta: '12:00', denseTraffic: false }];
    const record = recordFixture(captainAccount, { draft, status: 'signed', canEdit: false, canSign: false });
    renderAccount(captainAccount, record, 1, [mission]);
    await openRecord(record);
    await userEvent.click(stepButton(1));
    expect(answerInput('Les conditions météo sont conformes aux limites opérationnelles définies')).not.toBeChecked();
    expect(answerInput('Les conditions météo sont conformes aux limites opérationnelles définies')).toBeDisabled();
    await userEvent.click(stepButton(2));
    expect(formQueries().getByLabelText('ETA · date et heure · point 1')).toHaveTextContent('12:00');
    expect(formQueries().queryByRole('button', { name: 'Appliquer la date de l’opération à l’ETA du point 1' })).not.toBeInTheDocument();
    expect(formQueries().getByLabelText('Description · point 1')).toHaveValue('Ancien descriptif VHF conservé');
    await decisionStep();
    expect(formQueries().getByLabelText('Prénom NOM du Capitaine signataire')).toHaveValue('Capitaine historique signé');
    expect(fetchSeaOperationPlanning).not.toHaveBeenCalled();
    expect(saveSeaOperation).not.toHaveBeenCalled();
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

  it('distinguishes two projects on the same day and replaces all linked fields and the temporary captain signature', async () => {
    const choices = plannedMissions();
    const [first, second] = choices;
    const { client } = renderAccount({ id: 'temporary-captain-server-account', name: second.captains[0].name, canSign: true }, undefined, 1, choices);
    vi.mocked(fetchSeaOperationCaptainSignature).mockImplementation(async (_client, _date, _operationId, personId) => profileSignature(personId));
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await chooseMission(first);
    expect(formQueries().getByLabelText('Client')).toHaveDisplayValue(first.client);
    expect(formQueries().getByLabelText('Coordonnées du client')).toHaveValue(first.clientContact);
    expect(formQueries().getByLabelText('Description de l’opération')).toHaveValue(first.description);
    expect(formQueries().getByLabelText('Navire')).toHaveValue('12');
    expect(formQueries().getByLabelText('Immatriculation / IMO')).toHaveValue(first.vessel.registrationImo);
    expect(formQueries().getByLabelText('Prénom NOM du Capitaine')).toHaveValue(first.captains[0].name);
    await decisionStep();
    expect(await formQueries().findByRole('img', { name: `Signature de ${first.captains[0].name}` })).toHaveAttribute('src', 'https://signature.example.test/101.png');
    await userEvent.click(stepButton(0));
    await chooseMission(second);
    expect(formQueries().getByLabelText('Client')).toHaveDisplayValue(second.client);
    expect(formQueries().getByLabelText('Coordonnées du client')).toHaveValue(second.clientContact);
    expect(formQueries().getByLabelText('Description de l’opération')).toHaveValue(second.description);
    expect(formQueries().getByLabelText('Navire')).toHaveValue('13');
    expect(formQueries().getByLabelText('Immatriculation / IMO')).toHaveValue(second.vessel.registrationImo);
    expect(formQueries().getByLabelText('Port de départ')).toHaveValue('Caen');
    expect(formQueries().getByLabelText('Port d’arrivée')).toHaveValue('Dieppe');
    expect(formQueries().getByLabelText('Prénom NOM du Capitaine')).toHaveValue(second.captains[0].name);
    expect(formQueries().getByLabelText('Client')).toBeDisabled();
    await decisionStep();
    expect(formQueries().getByLabelText('Prénom NOM du Capitaine signataire')).toHaveValue(second.captains[0].name);
    expect(await formQueries().findByRole('img', { name: `Signature de ${second.captains[0].name}` })).toHaveAttribute('src', 'https://signature.example.test/102.png');
    expect(formQueries().queryByRole('img', { name: `Signature de ${first.captains[0].name}` })).not.toBeInTheDocument();
    expect(fetchSeaOperationCaptainSignature).toHaveBeenLastCalledWith(client, seaOperationToday(), second.operationId, second.captains[0].personId);
    await selectChoice('Décision', 'NO_GO');
    expect(footerQueries().getByRole('button', { name: 'Signer la décision NO GO' })).toBeEnabled();
  });

  it('defaults the signature to today in Paris even when the selected operation occurs later', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-16T22:30:00Z'));
    const choices = plannedMissions('2026-10-20');
    renderAccount(captainAccount, undefined, 1, choices);
    vi.mocked(fetchSeaOperationPlanning).mockImplementation(async (_client, date) => ({ date, choices: date === '2026-10-20' ? choices : [] }));
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    fireEvent.change(formQueries().getByLabelText('Date de l’opération'), { target: { value: '2026-10-20' } });
    await chooseMission(choices[0], '2026-10-20');
    expect(formQueries().getByLabelText('Date de l’opération')).toHaveValue('2026-10-20');
    await decisionStep();
    expect(formQueries().getByLabelText('Prénom NOM du Capitaine signataire')).toHaveValue('MARTIN Camille');
    expect(formQueries().getByLabelText('Date de la décision')).toHaveValue('2026-10-17');
    expect(formQueries().getByLabelText('Lieu de la décision')).toHaveValue('Cherbourg');
  });

  it('reports a completed null signature response as unavailable instead of leaving it loading', async () => {
    const choices = plannedMissions();
    renderAccount(captainAccount, undefined, 1, choices);
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await chooseMission(choices[0]);
    await decisionStep();
    expect(await formQueries().findByText('La signature RH est indisponible. Rechargez la fiche avant de signer.')).toBeInTheDocument();
    expect(formQueries().queryByText('Chargement de la signature…')).not.toBeInTheDocument();
  });

  it('exports the saved record with its authorized signature snapshot without resaving the declaration', async () => {
    const record = recordFixture(captainAccount, { status: 'signed', signedBy: captainAccount.id, signedByName: captainAccount.name, signedAt: '2026-10-16T10:00:00Z', signatureSnapshot: profileSignature().snapshot, canEdit: false, canSign: false });
    const { client } = renderAccount(captainAccount, record);
    const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
    vi.mocked(loadSeaOperationSignature).mockResolvedValue(image);
    vi.mocked(exportSeaOperationPdf).mockResolvedValue({ bytes: new Uint8Array(), filename: 'operation.pdf', pageCount: 1 });
    await openRecord(record);
    await userEvent.click(footerQueries().getByRole('button', { name: 'Exporter le PDF' }));
    await waitFor(() => expect(exportSeaOperationPdf).toHaveBeenCalledWith(record, { signatureImage: image }));
    expect(loadSeaOperationSignature).toHaveBeenCalledWith(client, record);
    expect(saveSeaOperation).not.toHaveBeenCalled();
    expect(signSeaOperation).not.toHaveBeenCalled();
    expect(formQueries().getByLabelText('Projet')).toHaveDisplayValue(record.draft.project);
    await waitFor(() => expect(footerQueries().getByRole('button', { name: 'Exporter le PDF' })).toBeEnabled());
  });

  it('blocks PDF generation if the saved signature cannot be verified and preserves the signed record', async () => {
    const record = recordFixture(captainAccount, { status: 'signed', version: 8, signedBy: captainAccount.id, signedByName: captainAccount.name, signedAt: '2026-10-16T10:00:00Z', signatureSnapshot: profileSignature().snapshot, canEdit: false, canSign: false });
    renderAccount(captainAccount, record);
    vi.mocked(loadSeaOperationSignature).mockRejectedValue(new Error('La signature RH enregistrée est indisponible.'));
    await openRecord(record);
    await userEvent.click(footerQueries().getByRole('button', { name: 'Exporter le PDF' }));
    expect(await formQueries().findByRole('alert')).toHaveTextContent('La signature RH enregistrée est indisponible.');
    expect(exportSeaOperationPdf).not.toHaveBeenCalled();
    expect(saveSeaOperation).not.toHaveBeenCalled();
    expect(formQueries().getByLabelText('Projet')).toHaveDisplayValue(record.draft.project);
    expect(formQueries().getByLabelText('Projet')).toBeDisabled();
    expect(screen.getByRole('dialog')).toHaveTextContent('Version 8');
    expect(footerQueries().getByRole('button', { name: 'Exporter le PDF' })).toBeEnabled();
  });

  it('requires a captain choice when Planning returns several and uses the selected account capability', async () => {
    const [choice] = plannedMissions();
    const selected = { ...choice.captains[0], personId: '103', name: 'BERNARD Robin', canSign: true };
    const multiple = { ...choice, captains: [choice.captains[0], selected] };
    renderAccount(captainAccount, undefined, 1, [multiple, plannedMissions()[1]]);
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await chooseMission(multiple);
    expect(formQueries().getByLabelText('Prénom NOM du Capitaine')).toHaveValue('');
    await decisionStep();
    expect(formQueries().getByLabelText('Prénom NOM du Capitaine signataire')).toHaveValue('');
    await selectChoice('Décision', 'NO_GO');
    expect(footerQueries().getByRole('button', { name: 'Signer la décision NO GO' })).toBeDisabled();
    await userEvent.click(stepButton(0));
    await userEvent.selectOptions(formQueries().getByLabelText('Prénom NOM du Capitaine'), selected.personId);
    await decisionStep();
    expect(formQueries().getByLabelText('Prénom NOM du Capitaine signataire')).toHaveValue(selected.name);
    expect(footerQueries().getByRole('button', { name: 'Signer la décision NO GO' })).toBeEnabled();
  });

  it('ignores a late signature response from the previous mission after another captain is selected', async () => {
    const choices = plannedMissions();
    const staleSignature = deferred<Awaited<ReturnType<typeof fetchSeaOperationCaptainSignature>>>();
    renderAccount(captainAccount, undefined, 1, choices);
    vi.mocked(fetchSeaOperationCaptainSignature).mockImplementation(async (_client, _date, _operation, personId) => personId === '101' ? staleSignature.promise : profileSignature(personId));
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await chooseMission(choices[0]);
    await chooseMission(choices[1]);
    await decisionStep();
    expect(await formQueries().findByRole('img', { name: 'Signature de DUPONT Alex' })).toHaveAttribute('src', profileSignature('102').url);
    await act(async () => staleSignature.resolve(profileSignature('101')));
    expect(formQueries().getByRole('img', { name: 'Signature de DUPONT Alex' })).toHaveAttribute('src', profileSignature('102').url);
    expect(formQueries().queryByRole('img', { name: 'Signature de MARTIN Camille' })).not.toBeInTheDocument();
    expect(formQueries().getByLabelText('Prénom NOM du Capitaine signataire')).toHaveValue('DUPONT Alex');
  });

  it('ignores an older Planning date response after the next date has loaded and been selected', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-16T10:00:00Z'));
    const oldContext = deferred<SeaOperationPlanningContext>();
    const oldChoices = plannedMissions('2026-10-16').map((choice) => ({ ...choice, project: `${choice.project} - ancien jour` }));
    const newChoices = plannedMissions('2026-10-17').map((choice) => ({ ...choice, project: `${choice.project} - nouveau jour` }));
    const { client } = renderAccount();
    let batch = 0;
    vi.mocked(fetchSeaOperationPlanning).mockImplementation(async (_client, date) => {
      if (date === '2026-10-16') batch += 1;
      if (batch === 1 && date === '2026-10-16') return oldContext.promise;
      return { date, choices: date === '2026-10-17' ? newChoices : [] };
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    fireEvent.change(formQueries().getByLabelText('Date de l’opération'), { target: { value: '2026-10-17' } });
    await chooseMission(newChoices[1], '2026-10-17');
    await act(async () => oldContext.resolve({ date: '2026-10-16', choices: oldChoices }));
    expect(formQueries().getByLabelText('Date de l’opération')).toHaveValue('2026-10-17');
    expect(formQueries().getByLabelText('Projet')).toHaveDisplayValue(seaOperationPlanningChoiceLabel({ ...newChoices[1], date: '2026-10-17' }));
    expect(formQueries().getByLabelText('Description de l’opération')).toHaveValue(newChoices[1].description);
    expect(screen.queryByRole('option', { name: seaOperationPlanningChoiceLabel({ ...oldChoices[1], date: '2026-10-16' }) })).not.toBeInTheDocument();
    expect(fetchSeaOperationPlanning).toHaveBeenCalledWith(client, '2026-10-17');
  });

  it('preserves user input entered while a unique Planning mission is still loading', async () => {
    const context = deferred<SeaOperationPlanningContext>();
    const [choice] = plannedMissions();
    renderAccount();
    vi.mocked(fetchSeaOperationPlanning).mockImplementation(async (_client, date) => date === seaOperationToday() ? context.promise : { date, choices: [] });
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    expect(formQueries().getByLabelText('Projet')).toBeDisabled();
    fireEvent.change(formQueries().getByLabelText('Description de l’opération'), { target: { value: 'Saisie conservée pendant le chargement' } });
    await userEvent.click(stepButton(1));
    await selectChoice('Les conditions météo sont conformes aux limites opérationnelles définies', 'no');
    await act(async () => context.resolve({ date: seaOperationToday(), choices: [choice] }));
    await userEvent.click(stepButton(0));
    expect(formQueries().getByLabelText('Projet')).toHaveValue('');
    expect(formQueries().getByLabelText('Description de l’opération')).toHaveValue('Saisie conservée pendant le chargement');
    await userEvent.click(stepButton(1));
    expect(answerInput('Les conditions météo sont conformes aux limites opérationnelles définies')).not.toBeChecked();
    expect(footerQueries().getByText('Modifications non enregistrées')).toBeInTheDocument();
    expect(saveSeaOperation).not.toHaveBeenCalled();
  });

  it('does not replace a saved incomplete legacy draft when Planning offers only one mission', async () => {
    const draft = noGoDraft();
    draft.project = '';
    draft.description = 'Préparation historique déjà enregistrée';
    draft.checks.weather = 'no';
    draft.charts = 'Carte historique';
    const record = recordFixture(captainAccount, { draft });
    const [choice] = plannedMissions();
    const { client } = renderAccount(captainAccount, record, 1, [choice]);
    await userEvent.click(await screen.findByRole('button', { name: /Opération sans titre/ }));
    await screen.findByRole('dialog', { name: 'Fiche Opération en Mer' });
    await screen.findByRole('option', { name: seaOperationPlanningChoiceLabel({ ...choice, date: seaOperationToday() }) });
    expect(formQueries().getByLabelText('Projet')).toHaveValue('');
    expect(formQueries().getByLabelText('Description de l’opération')).toHaveValue(draft.description);
    await userEvent.click(stepButton(1));
    expect(answerInput('Les conditions météo sont conformes aux limites opérationnelles définies')).not.toBeChecked();
    await userEvent.click(stepButton(2));
    expect(formQueries().getByLabelText('Numéro de la ou des cartes marines')).toHaveValue('Carte historique');
    await decisionStep();
    expect(choiceInput('Décision', 'NO_GO')).toBeChecked();
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, saved) => ({ ...record, draft: structuredClone(saved), version: 4 }));
    await saveDraft();
    expect(await formQueries().findByText('Brouillon enregistré.')).toBeInTheDocument();
    expect(saveSeaOperation).toHaveBeenCalledWith(client, draft, record);
  });

  it('resets safety approvals, passage points and signature acknowledgment when the mission changes', async () => {
    const choices = plannedMissions();
    const draft = noGoDraft();
    draft.project = choices[0].project;
    draft.planning = { date: seaOperationToday(), operationId: choices[0].operationId, projectId: choices[0].projectId, captainPersonId: choices[0].captains[0].personId };
    draft.dapaq = { method: 'nomade', preparedBy: 'captain', agentName: '', agentContact: '' };
    draft.specialPersonnel = [{ name: 'Personne de la première mission', phone: '0100000000' }];
    draft.applicability = { towing: 'yes', cargo: 'yes', divingSupport: 'yes', supplies: 'yes' };
    draft.checks.weather = 'no';
    draft.checks.cargoLashing = 'no';
    draft.charts = 'SHOM 7120';
    draft.waypoints = [{ id: 'old-point', number: '1', descriptionVhf: 'Ancien point', latitude: '49 N', longitude: '001 W', ukc: '2 m', eta: '2026-10-22T12:00', denseTraffic: false }];
    draft.portServices = ['towing'];
    draft.supplies = { ...draft.supplies, delegated: 'no', suppliers: 'Ancien fournisseur', items: ['provisions'] };
    const record = recordFixture(captainAccount, { draft });
    const { client } = renderAccount(captainAccount, record, 1, choices);
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, edited) => ({ ...record, draft: structuredClone(edited), version: 4 }));
    await openRecord(record);
    await chooseMission(choices[1]);
    await saveDraft();
    expect(await formQueries().findByText('Brouillon enregistré.')).toBeInTheDocument();
    expect(saveSeaOperation).toHaveBeenCalledWith(client, expect.objectContaining({
      project: choices[1].project, charts: '', waypoints: [], specialPersonnel: [], decision: '', risks: '', portServices: [],
      checks: expect.objectContaining({ weather: 'yes', cargoLashing: 'yes' }),
      applicability: { towing: 'no', cargo: 'no', divingSupport: 'no', supplies: 'no' },
      dapaq: { method: '', preparedBy: '', agentName: '', agentContact: '' },
      supplies: expect.objectContaining({ delegated: 'yes', suppliers: '', items: [] }),
      signature: { captainName: choices[1].captains[0].name, date: seaOperationToday(), place: 'Caen', acknowledged: false },
    }), record);
  });

  it('uses one accessible binary switch per question and an editable responsive Passage Plan', async () => {
    renderAccount();
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await userEvent.click(stepButton(1));
    const question = 'Les conditions météo sont conformes aux limites opérationnelles définies';
    expect(formQueries().getAllByRole('switch', { name: question })).toHaveLength(1);
    expect(answerInput(question)).toBeChecked();
    expect(answerInput(question)).toHaveTextContent('Oui');
    await userEvent.click(answerInput(question));
    expect(answerInput(question)).not.toBeChecked();
    expect(answerInput(question)).toHaveTextContent('Non');
    expect(formQueries().getByLabelText('Justification — Les conditions météo sont conformes aux limites opérationnelles définies')).toBeInTheDocument();
    await userEvent.keyboard('[Space]');
    expect(answerInput(question)).toBeChecked();
    expect(formQueries().queryByLabelText(`Justification — ${question}`)).not.toBeInTheDocument();
    const yesOnly = 'Vivres en quantité suffisante';
    expect(answerInput(yesOnly)).toBeChecked();
    await userEvent.click(answerInput(yesOnly));
    expect(answerInput(yesOnly)).not.toBeChecked();
    expect(answerInput(yesOnly)).toHaveTextContent('Non');
    await userEvent.click(stepButton(2));
    const table = formQueries().getByRole('table', { name: 'Points de passage' });
    expect(within(table).getByText('Ajoutez le premier point de passage.')).toBeInTheDocument();
    await userEvent.click(formQueries().getByRole('button', { name: 'Ajouter un point de passage' }));
    expect(within(table).getAllByRole('row').filter((row) => row.parentElement === table)).toHaveLength(1);
    expect(table).toHaveClass('so-passage-grid');
    expect(formQueries().queryByLabelText(/Description.*VHF/)).not.toBeInTheDocument();
    await userEvent.clear(formQueries().getByLabelText('Description · point 1'));
    await userEvent.type(formQueries().getByLabelText('Description · point 1'), 'Entrée du chenal');
    await userEvent.click(formQueries().getByRole('checkbox', { name: 'Zone maritime à trafic dense · point 1' }));
    expect(formQueries().getByLabelText('Description · point 1')).toHaveValue('Entrée du chenal');
    expect(etaGroup()).toBeVisible();
    expect(etaQueries().getByRole('grid', { name: /Calendrier ·/ })).toBeVisible();
    expectEtaTime('', etaQueries());
    expect(formQueries().getByRole('checkbox', { name: 'Zone maritime à trafic dense · point 1' })).toBeChecked();
    await userEvent.click(formQueries().getByRole('button', { name: 'Supprimer le point 1' }));
    expect(within(table).getByText('Ajoutez le premier point de passage.')).toBeInTheDocument();
  });

  it('keeps explicit DAPAQ and safety choices clearable while binary boarding and shipchandler switches stay Oui or Non', async () => {
    const { client } = renderAccount();
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, draft) => recordFixture(captainAccount, { draft, version: 1 }));
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await selectChoice('Mode de déclaration', 'email');
    await selectChoice('Préparée par', 'agent');
    expect(formQueries().getByLabelText('Nom de l’agent consignataire')).toBeVisible();
    await selectChoice('Mode de déclaration', 'nomade');
    expect(choiceInput('Mode de déclaration', 'email')).not.toBeChecked();
    expect(choiceQueries('Préparée par').queryByRole('checkbox', { name: 'Agent consignataire' })).not.toBeInTheDocument();
    expect(formQueries().queryByLabelText('Nom de l’agent consignataire')).not.toBeInTheDocument();
    await selectChoice('Préparée par', 'armament');
    await selectChoice('Préparée par', 'captain');
    expect(choiceInput('Préparée par', 'armament')).not.toBeChecked();
    await userEvent.click(choiceInput('Préparée par', 'captain'));
    await userEvent.click(choiceInput('Mode de déclaration', 'nomade'));
    await userEvent.click(stepButton(1));
    await selectChoice('Remorquage applicable', 'yes');
    await selectChoice('Embarquement sur le remorqué', 'yes');
    await selectChoice('Mesures de sécurité sur le remorqué', 'specific');
    expect(formQueries().getByLabelText('Ronde de sécurité, zones dangereuses et mesures prises')).toBeVisible();
    await selectChoice('Mesures de sécurité sur le remorqué', 'sms');
    expect(choiceInput('Mesures de sécurité sur le remorqué', 'specific')).not.toBeChecked();
    expect(formQueries().queryByLabelText('Ronde de sécurité, zones dangereuses et mesures prises')).not.toBeInTheDocument();
    await userEvent.click(choiceInput('Mesures de sécurité sur le remorqué', 'sms'));
    await selectChoice('Embarquement sur le remorqué', 'no');
    expect(answerInput('Embarquement sur le remorqué')).not.toBeChecked();
    await userEvent.click(answerInput('Embarquement sur le remorqué'));
    await selectChoice('Approvisionnement / Avitaillement applicable', 'yes');
    await selectChoice('Shipchandler', 'yes');
    expect(formQueries().getByLabelText('Nom du shipchandler')).toBeVisible();
    await selectChoice('Shipchandler', 'no');
    expect(answerInput('Shipchandler')).not.toBeChecked();
    expect(formQueries().queryByLabelText('Nom du shipchandler')).not.toBeInTheDocument();
    await userEvent.click(answerInput('Shipchandler'));
    await decisionStep();
    await selectChoice('Décision', 'NO_GO');
    await userEvent.click(choiceInput('Décision', 'NO_GO'));
    await saveDraft();
    expect(await formQueries().findByText('Brouillon enregistré.')).toBeInTheDocument();
    expect(saveSeaOperation).toHaveBeenCalledWith(client, expect.objectContaining({
      dapaq: expect.objectContaining({ method: '', preparedBy: '' }), decision: '',
      towedVesselBoarding: expect.objectContaining({ required: 'yes', measures: '' }), supplies: expect.objectContaining({ delegated: 'yes' }),
    }), undefined);
  });

  it('shows every full safety question and its explanatory text alongside its switch', async () => {
    renderAccount();
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await userEvent.click(stepButton(1));
    for (const label of ['Remorquage applicable', 'Chargement de marchandise applicable', 'Navire de support de plongeur applicable', 'Approvisionnement / Avitaillement applicable']) await selectChoice(label, 'yes');
    for (const check of SEA_OPERATION_CHECKS) {
      expect(answerInput(check.label)).toBeVisible();
      expect(formQueries().getByText(check.label, { selector: 'span' })).toBeVisible();
      expect(answerInput(check.label)).toBeChecked();
      if (check.help) expect(formQueries().getByText(check.help)).toBeVisible();
      if (check.yesLabel) expect(formQueries().getByText(check.yesLabel)).toBeVisible();
    }
  });

  it('opens a fullscreen modal with four preparation steps, form, live document, completion and footer actions', async () => {
    renderAccount();
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    const dialog = screen.getByRole('dialog', { name: 'Nouvelle opération en mer' });
    const modal = within(dialog);
    expect(dialog).toHaveClass('app-dialog--fullscreen');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(modal.getByRole('complementary', { name: 'Parcours de l’opération' })).toBeInTheDocument();
    expect(within(modal.getByRole('navigation', { name: 'Étapes de la préparation' })).getAllByRole('button')).toHaveLength(4);
    expect(formQueries().getByRole('region', { name: 'Préparation de l’Armement' })).toBeVisible();
    expect(modal.getByRole('region', { name: 'Aperçu de la fiche' })).toBeInTheDocument();
    expect(modal.getByRole('complementary', { name: 'Complétude de la fiche' })).toBeInTheDocument();
    expect(dialog.querySelector('.so-mobile-switch')).toHaveAttribute('hidden');
    expect(footerQueries().getByRole('button', { name: 'Enregistrer le brouillon' })).toBeEnabled();
    expect(footerQueries().getByRole('button', { name: 'Suivant' })).toBeEnabled();
    expect(footerQueries().getByRole('button', { name: 'Annuler' })).toBeEnabled();
    expect(footerQueries().queryByRole('button', { name: 'Précédent' })).not.toBeInTheDocument();
  });

  it('closes a clean modal with Escape and restores the opener focus and page scrolling', async () => {
    document.body.style.overflow = 'scroll';
    renderAccount();
    const opener = await screen.findByRole('button', { name: 'Créer une opération' });
    await userEvent.click(opener);
    const dialog = screen.getByRole('dialog');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    expect(document.body.style.overflow).toBe('hidden');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(opener).toHaveFocus());
    expect(document.body.style.overflow).toBe('scroll');
    expect(saveSeaOperation).not.toHaveBeenCalled();
  });

  it('retains a dirty modal on refused Escape and closes it only after explicit acceptance', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderAccount();
    const opener = await screen.findByRole('button', { name: 'Créer une opération' });
    await userEvent.click(opener);
    await userEvent.type(formQueries().getByLabelText('Description de l’opération'), 'Mission à conserver');
    await userEvent.keyboard('{Escape}');
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(formQueries().getByLabelText('Description de l’opération')).toHaveValue('Mission à conserver');
    await userEvent.keyboard('{Escape}');
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(opener).toHaveFocus());
    expect(sessionStorage.length).toBe(0);
  });

  it('wraps keyboard focus inside the modal between its close control and fixed footer', async () => {
    renderAccount();
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    const close = within(screen.getByRole('dialog')).getByRole('button', { name: 'Fermer' });
    const next = footerQueries().getByRole('button', { name: 'Suivant' });
    close.focus();
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
    expect(next).toHaveFocus();
    await userEvent.keyboard('{Tab}');
    expect(close).toHaveFocus();
  });

  it('updates the live preview and completion while retaining values across footer and sidebar steps', async () => {
    renderAccount();
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    const preview = screen.getByRole('region', { name: 'Aperçu de la fiche' });
    const progress = screen.getByRole('progressbar', { name: 'Champs de préparation renseignés' });
    const before = Number(progress.getAttribute('aria-valuenow'));
    await userEvent.type(formQueries().getByLabelText('Description de l’opération'), 'Mission aperçue en direct');
    await userEvent.selectOptions(formQueries().getByLabelText('Client'), '701');
    expect(preview).toHaveTextContent('Mission aperçue en direct');
    expect(preview).toHaveTextContent('Client du port');
    expect(Number(progress.getAttribute('aria-valuenow'))).toBeGreaterThan(before);
    await userEvent.click(footerQueries().getByRole('button', { name: 'Suivant' }));
    expect(stepButton(1)).toHaveAttribute('aria-current', 'step');
    expect(formQueries().getByRole('region', { name: 'Contrôles du Capitaine' })).toBeVisible();
    await userEvent.click(footerQueries().getByRole('button', { name: 'Précédent' }));
    expect(formQueries().getByLabelText('Description de l’opération')).toHaveValue('Mission aperçue en direct');
    const completionSteps = within(screen.getByRole('navigation', { name: 'Complétude par étape' })).getAllByRole('button');
    await userEvent.click(completionSteps[2]);
    expect(stepButton(2)).toHaveAttribute('aria-current', 'step');
    expect(formQueries().getByRole('region', { name: 'Passage Plan' })).toBeVisible();
    await userEvent.click(stepButton(0));
    expect(formQueries().getByLabelText('Client')).toHaveDisplayValue('Client du port');
  });

  it('switches compact 390px panes without losing fields and keeps footer actions available', async () => {
    viewport(390);
    renderAccount();
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    const dialog = screen.getByRole('dialog');
    const switcher = within(screen.getByRole('group', { name: 'Affichage de la fiche' }));
    const form = dialog.querySelector('.so-editor-form-pane')!;
    const documentPane = dialog.querySelector('.so-editor-document-pane')!;
    expect(switcher.getByRole('button', { name: 'Saisie' })).toHaveAttribute('aria-pressed', 'true');
    expect(documentPane).toHaveAttribute('hidden');
    await userEvent.type(formQueries().getByLabelText('Description de l’opération'), 'Mission mobile conservée');
    await userEvent.click(switcher.getByRole('button', { name: 'Aperçu et complétude' }));
    expect(form).toHaveAttribute('hidden');
    expect(documentPane).not.toHaveAttribute('hidden');
    expect(switcher.getByRole('button', { name: 'Aperçu et complétude' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('textbox', { name: 'Description de l’opération' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Aperçu de la fiche' })).toHaveTextContent('Mission mobile conservée');
    expect(footerQueries().getByRole('button', { name: 'Enregistrer le brouillon' })).toBeEnabled();
    await userEvent.click(stepButton(2));
    expect(switcher.getByRole('button', { name: 'Saisie' })).toHaveAttribute('aria-pressed', 'true');
    expect(form).not.toHaveAttribute('hidden');
    expect(formQueries().getByRole('region', { name: 'Passage Plan' })).toBeVisible();
    await userEvent.click(stepButton(0));
    expect(formQueries().getByLabelText('Description de l’opération')).toHaveValue('Mission mobile conservée');
  });

  it('reveals and focuses compact-pane server errors and focuses the form heading after completion navigation', async () => {
    viewport(390);
    renderAccount();
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await userEvent.type(formQueries().getByLabelText('Description de l’opération'), 'Mission mobile à enregistrer');
    const switcher = within(screen.getByRole('group', { name: 'Affichage de la fiche' }));
    await userEvent.click(switcher.getByRole('button', { name: 'Aperçu et complétude' }));
    vi.mocked(saveSeaOperation).mockRejectedValueOnce(new Error('Le serveur demande de réessayer.'));
    await saveDraft();
    const alert = await formQueries().findByRole('alert');
    expect(alert).toHaveTextContent('Le serveur demande de réessayer.');
    expect(document.querySelector('.so-editor-form-pane')).not.toHaveAttribute('hidden');
    await waitFor(() => expect(alert).toHaveFocus());
    expect(formQueries().getByLabelText('Description de l’opération')).toHaveValue('Mission mobile à enregistrer');
    await userEvent.click(switcher.getByRole('button', { name: 'Aperçu et complétude' }));
    const completion = within(screen.getByRole('navigation', { name: 'Complétude par étape' }));
    await userEvent.click(completion.getAllByRole('button')[2]);
    const heading = formQueries().getByRole('heading', { name: 'Passage Plan' });
    expect(switcher.getByRole('button', { name: 'Saisie' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it('disables modal dismissal and footer submission while the server save is pending', async () => {
    renderAccount();
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await userEvent.type(formQueries().getByLabelText('Description de l’opération'), 'Mission en cours de sauvegarde');
    let resolveSave!: (record: SeaOperationRecord) => void;
    vi.mocked(saveSeaOperation).mockImplementation(() => new Promise((resolve) => { resolveSave = resolve; }));
    await saveDraft();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-busy', 'true');
    expect(within(dialog).getByRole('button', { name: 'Fermer' })).toBeDisabled();
    expect(footerQueries().getByRole('button', { name: 'Annuler' })).toBeDisabled();
    expect(footerQueries().getByRole('button', { name: 'Enregistrer le brouillon' })).toBeDisabled();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(dialog).toBeInTheDocument();
    const draft = emptySeaOperation(); draft.description = 'Mission en cours de sauvegarde';
    await act(async () => resolveSave(recordFixture(captainAccount, { draft, version: 1 })));
    expect(await formQueries().findByText('Brouillon enregistré.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-busy');
  });

  it('preserves server read-only rights inside the new fullscreen workflow', async () => {
    const record = recordFixture(sailorAccount, { canEdit: false, canSign: false });
    renderAccount(sailorAccount, record);
    await openRecord(record);
    expect(formQueries().getByLabelText('Projet')).toBeDisabled();
    expect(footerQueries().queryByRole('button', { name: 'Enregistrer le brouillon' })).not.toBeInTheDocument();
    await decisionStep();
    expect(choiceInput('Décision', 'NO_GO')).toBeDisabled();
    expect(footerQueries().getByRole('button', { name: 'Signer la décision NO GO' })).toBeDisabled();
    expect(saveSeaOperation).not.toHaveBeenCalled();
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

  it('shows the empty register and saves an incomplete new preparation as a draft', async () => {
    const { client } = renderAccount(sailorAccount);
    expect(await screen.findByText('Préparez votre première opération en mer')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Créer une opération' }));
    await userEvent.type(formQueries().getByLabelText('Description de l’opération'), 'Préparation du balisage');
    await userEvent.selectOptions(formQueries().getByLabelText('Navire'), '12');
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, draft) => recordFixture(sailorAccount, { draft: structuredClone(draft), version: 1 }));
    await saveDraft();
    expect(await formQueries().findByText('Brouillon enregistré.')).toBeInTheDocument();
    expect(saveSeaOperation).toHaveBeenCalledWith(client, expect.objectContaining({ description: 'Préparation du balisage', decision: '', vessel: expect.objectContaining({ id: '12', name: 'GOURY' }) }), undefined);
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

  it('keeps the entered preparation after a failed save and retries without creating a second local draft', async () => {
    renderAccount();
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await userEvent.type(formQueries().getByLabelText('Description de l’opération'), 'Mission conservée');
    vi.mocked(saveSeaOperation).mockRejectedValueOnce(new Error('Connexion interrompue.'));
    await saveDraft();
    expect(await formQueries().findByRole('alert')).toHaveTextContent('Connexion interrompue.');
    expect(formQueries().getByLabelText('Description de l’opération')).toHaveValue('Mission conservée');
    expect(screen.getByText('Modifications non enregistrées')).toBeInTheDocument();
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, draft) => recordFixture(captainAccount, { draft: structuredClone(draft), version: 1 }));
    await saveDraft();
    expect(await formQueries().findByText('Brouillon enregistré.')).toBeInTheDocument();
    expect(saveSeaOperation).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ description: 'Mission conservée' }), undefined);
  });

  it('reveals applicable towing, cargo, diving and supply controls and preserves answers when a section is hidden', async () => {
    renderAccount();
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await userEvent.click(stepButton(1));
    const cases = [
      ['Remorquage applicable', 'towingPlan'], ['Chargement de marchandise applicable', 'cargoLashing'],
      ['Navire de support de plongeur applicable', 'divingMedicalKit'],
    ] as const;
    for (const [label, checkId] of cases) {
      const check = SEA_OPERATION_CHECKS.find((item) => item.id === checkId)!;
      await selectChoice(label, 'no');
      expect(formQueries().queryByRole('switch', { name: check.label })).not.toBeInTheDocument();
      await selectChoice(label, 'yes');
      await selectChoice(check.label, 'no');
      if (checkId === 'divingMedicalKit') {
        await userEvent.click(screen.getByText('Kit médical plongée prévu par le formulaire'));
        for (const item of DIVING_MEDICAL_KIT) expect(screen.getByText((text) => text.includes(item.article) && text.startsWith(`${item.quantity} ×`))).toBeInTheDocument();
      }
      await selectChoice(label, 'no');
      expect(formQueries().queryByRole('switch', { name: check.label })).not.toBeInTheDocument();
      if (checkId === 'divingMedicalKit') expect(screen.queryByText('Kit médical plongée prévu par le formulaire')).not.toBeInTheDocument();
      await selectChoice(label, 'yes');
      expect(answerInput(check.label)).not.toBeChecked();
    }
    await selectChoice('Approvisionnement / Avitaillement applicable', 'yes');
    expect(answerInput('Shipchandler')).toBeInTheDocument();
    await selectChoice('Approvisionnement / Avitaillement applicable', 'no');
    expect(formQueries().queryByRole('switch', { name: 'Shipchandler' })).not.toBeInTheDocument();
  });

  it('blocks GO when a red control is negative and sends no save or signature request', async () => {
    const draft = noGoDraft();
    draft.decision = 'GO';
    draft.checks.weather = 'no';
    const record = recordFixture(captainAccount, { draft });
    renderAccount(captainAccount, record);
    await openRecord(record);
    await decisionStep();
    expect(screen.getByText('NO GO imposé · 1 contrôle(s) bloquant(s)')).toBeInTheDocument();
    expect(choiceInput('Décision', 'GO')).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Signer la décision GO' }));
    expect(await formQueries().findByRole('alert')).toHaveTextContent('NO GO automatique');
    expect(saveSeaOperation).not.toHaveBeenCalled();
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

  it('lets the server-authorized captain finalize NO GO using the newly saved revision', async () => {
    const record = recordFixture(captainAccount);
    expect(validateSeaOperation(record.draft, 'NO_GO')).toEqual([]);
    const canonicalName = 'MARTIN Camille';
    const saved = { ...record, version: 4, draft: { ...record.draft, signature: { ...record.draft.signature, captainName: canonicalName } } };
    const signed: SeaOperationRecord = { ...saved, version: 5, status: 'signed', signedBy: captainAccount.id, signedByName: captainAccount.name, signedAt: '2026-10-16T10:00:00Z', canEdit: false, canSign: false };
    const { client } = renderAccount(captainAccount, record);
    vi.mocked(saveSeaOperation).mockResolvedValue(saved);
    vi.mocked(signSeaOperation).mockResolvedValue(signed);
    await openRecord(record);
    await decisionStep();
    await userEvent.click(screen.getByRole('button', { name: 'Signer la décision NO GO' }));
    expect(await formQueries().findByText('Décision du Capitaine signée et enregistrée. La fiche est figée.')).toBeInTheDocument();
    expect(saveSeaOperation).toHaveBeenCalledWith(client, record.draft, record);
    expect(signSeaOperation).toHaveBeenCalledWith(client, saved, canonicalName, saved.draft.signature.acknowledged);
    expect(choiceInput('Décision', 'NO_GO')).toBeDisabled();
    expect(formQueries().getByLabelText('Projet')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Signer la décision/ })).not.toBeInTheDocument();
  });

  it('keeps a sailor preparation editable while the server denies captain signing rights', async () => {
    const record = recordFixture(sailorAccount);
    renderAccount(sailorAccount, record);
    await openRecord(record);
    await decisionStep();
    expect(formQueries().getByLabelText('Projet')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Signer la décision NO GO' })).toBeDisabled();
    expect(screen.getByText(/La signature est réservée au compte réel du Capitaine affecté au navire/)).toBeInTheDocument();
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

  it('retains the persisted new revision when signature fails and retries from that revision', async () => {
    const record = recordFixture(captainAccount);
    const saved = { ...record, version: 4 };
    const { client } = renderAccount(captainAccount, record);
    vi.mocked(saveSeaOperation).mockResolvedValueOnce(saved).mockResolvedValueOnce({ ...saved, version: 5 });
    vi.mocked(signSeaOperation).mockRejectedValue(new Error('La signature a été refusée par le serveur.'));
    await openRecord(record);
    await decisionStep();
    await userEvent.click(screen.getByRole('button', { name: 'Signer la décision NO GO' }));
    expect(await formQueries().findByRole('alert')).toHaveTextContent('La signature a été refusée par le serveur.');
    expect(formQueries().getByLabelText('Projet')).toHaveDisplayValue(record.draft.project);
    expect(formQueries().getByLabelText('Risques identifiés / informations à transmettre à l’Armement')).toHaveValue(record.draft.risks);
    expect(screen.getByRole('dialog')).toHaveTextContent(/Version 4/);
    await userEvent.click(screen.getByRole('button', { name: 'Signer la décision NO GO' }));
    await waitFor(() => expect(saveSeaOperation).toHaveBeenCalledTimes(2));
    expect(saveSeaOperation).toHaveBeenLastCalledWith(client, saved.draft, saved);
    expect(signSeaOperation).toHaveBeenLastCalledWith(client, expect.objectContaining({ version: 5 }), captainAccount.name, true);
  });

  it('opens an existing signed decision read-only regardless of stale editing permissions', async () => {
    const draft = noGoDraft();
    draft.applicability = { towing: 'yes', cargo: 'yes', divingSupport: 'yes', supplies: 'yes' };
    draft.towedVesselBoarding.required = 'yes';
    const record = recordFixture(captainAccount, { draft, status: 'signed', signedBy: captainAccount.id, signedByName: captainAccount.name, signedAt: '2026-10-16T10:00:00Z', canEdit: true, canSign: true });
    renderAccount(captainAccount, record);
    await openRecord(record);
    expect(formQueries().getByLabelText('Projet')).toBeDisabled();
    for (const input of [...choiceQueries('Mode de déclaration').getAllByRole('checkbox'), ...choiceQueries('Préparée par').getAllByRole('checkbox')]) expect(input).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Enregistrer le brouillon' })).not.toBeInTheDocument();
    await userEvent.click(stepButton(1));
    for (const input of formQueries().getAllByRole('checkbox')) expect(input).toBeDisabled();
    for (const input of formQueries().getAllByRole('switch')) expect(input).toBeDisabled();
    await decisionStep();
    expect(choiceInput('Décision', 'NO_GO')).toBeDisabled();
    expect(screen.getByText(/Décision signée par Camille MARTIN/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Signer la décision/ })).not.toBeInTheDocument();
  });

  it('loads only the selected project documents and leaves them consultable on a signed operation', async () => {
    const mission = plannedMissions()[0];
    const draft = noGoDraft();
    draft.project = mission.project;
    draft.planning = { date: seaOperationToday(), projectId: mission.projectId, operationId: mission.operationId, captainPersonId: mission.captains[0].personId };
    const record = recordFixture(captainAccount, { draft, status: 'signed', canEdit: false, canSign: false });
    const { client } = renderAccount(captainAccount, record, 1, plannedMissions());
    vi.mocked(fetchSeaOperationProjectDocuments).mockResolvedValue([{ id: 'project:101', projectId: mission.projectId, title: 'Plan de prévention autorisé', fileName: 'prevention.pdf', mimeType: 'application/pdf', categoryLabel: 'Sécurité', subcategoryLabel: '', createdAt: '2026-10-22T08:00:00Z', expiresOn: null }]);
    await openRecord(record);
    await userEvent.click(formQueries().getByText('Documents du projet'));
    expect(await formQueries().findByRole('button', { name: 'Ouvrir : Plan de prévention autorisé' })).toBeEnabled();
    expect(fetchSeaOperationProjectDocuments).toHaveBeenCalledWith(client, mission.projectId);
    expect(formQueries().getByLabelText('Projet')).toBeDisabled();
    expect(formQueries().queryByText(/Offre commerciale|Facturation/)).not.toBeInTheDocument();
    await userEvent.click(stepButton(1));
    expect(formQueries().queryByText('Documents du projet')).not.toBeInTheDocument();
    expect(saveSeaOperation).not.toHaveBeenCalled();
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

  it('keeps unsaved inputs when sidebar navigation is refused and leaves only after acceptance', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderAccount(sailorAccount);
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await userEvent.type(formQueries().getByLabelText('Description de l’opération'), 'Préparation à conserver');
    await userEvent.click(screen.getByRole('link', { name: 'Navires' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith('Quitter cette fiche sans enregistrer les modifications ?');
    expect(formQueries().getByLabelText('Description de l’opération')).toHaveValue('Préparation à conserver');
    expect(screen.queryByRole('heading', { name: 'Flotte destination' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Navires' }));
    expect(await screen.findByRole('heading', { name: 'Flotte destination' })).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(screen.queryByLabelText('Projet')).not.toBeInTheDocument();
    expect(saveSeaOperation).not.toHaveBeenCalled();
  });

  it('preserves a legacy time-only ETA until its operation date is explicitly applied', async () => {
    const draft = noGoDraft();
    draft.planning = { date: '2026-10-16', operationId: '', projectId: '', captainPersonId: '' };
    draft.waypoints = [{ id: 'point-server-id', number: '1', descriptionVhf: 'Entrée du chenal', latitude: '49 N', longitude: '001 W', ukc: '2 m', eta: '12:00', denseTraffic: false }];
    const record = recordFixture(captainAccount, { draft });
    const { client } = renderAccount(captainAccount, record);
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, edited) => ({ ...record, version: 4, draft: structuredClone(edited) }));
    await openRecord(record);
    await userEvent.click(stepButton(2));
    expect(etaGroup()).toBeVisible();
    expectEtaTime('', etaQueries());
    expect(etaQueries().queryByRole('gridcell', { selected: true })).not.toBeInTheDocument();
    expect(formQueries().getByText(/Ancienne ETA : 12:00/)).toBeVisible();
    await saveDraft();
    expect(await formQueries().findByText('Brouillon enregistré.')).toBeInTheDocument();
    expect(saveSeaOperation).toHaveBeenLastCalledWith(client, expect.objectContaining({ waypoints: [expect.objectContaining({ eta: '12:00' })] }), record);
    await userEvent.click(formQueries().getByRole('button', { name: 'Appliquer la date de l’opération à l’ETA du point 1' }));
    expectEta('2026-10-16', '12:00');
    expect(capturingWeatherPanel().waypoints[0].eta).toBe('2026-10-16T12:00');
    expect(formQueries().queryByText(/Ancienne ETA/)).not.toBeInTheDocument();
    await saveDraft();
    expect(await formQueries().findByText('Brouillon enregistré.')).toBeInTheDocument();
    expect(saveSeaOperation).toHaveBeenLastCalledWith(client, expect.objectContaining({ waypoints: [expect.objectContaining({ eta: '2026-10-16T12:00' })] }), expect.objectContaining({ version: 4 }));
  });

  it('publishes a complete inline ETA immediately to weather and UKC without Apply and keeps it through Escape', async () => {
    const draft = waypointCaptureDraft();
    delete draft.planning;
    draft.vessel.etd = '2025-01-16T08:00';
    draft.waypoints[0].eta = '';
    const record = recordFixture(captainAccount, { draft });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAccount(captainAccount, record);
    await openRecord(record);
    await waitFor(() => expect(formQueries().getByLabelText('Projet')).toBeEnabled());
    fireEvent.click(stepButton(2));
    await waitFor(() => expect(formQueries().getByRole('heading', { name: 'Passage Plan' })).toHaveFocus());
    const picker = etaQueries();
    expect(etaGroup()).toBeVisible();
    expect(formQueries().queryByRole('button', { name: 'ETA · date et heure · point 1' })).not.toBeInTheDocument();
    const today = seaOperationToday();
    const currentMonth = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${today}T12:00:00Z`));
    expect(picker.getByRole('grid', { name: `Calendrier · ${currentMonth}` })).toBeVisible();
    expect(picker.queryByRole('gridcell', { selected: true })).not.toBeInTheDocument();
    expectEtaTime('', picker);
    expect(picker.queryByRole('button', { name: 'Appliquer' })).not.toBeInTheDocument();
    expect(picker.queryByRole('button', { name: 'Annuler' })).not.toBeInTheDocument();
    fireEvent.click(picker.getByRole('button', { name: etaDayLabel(today) }));
    fireEvent.change(picker.getByLabelText('Heures de l’ETA (Paris)'), { target: { value: '16' } });
    expect(capturingWeatherPanel().waypoints[0].eta).toBe('');
    fireEvent.change(picker.getByLabelText('Minutes de l’ETA (Paris)'), { target: { value: '45' } });
    expect(capturingWeatherPanel().waypoints[0]).toMatchObject({ eta: `${today}T16:45`, etaMode: 'manual' });
    expect(capturingUkcPanel().payload.waypoints[0].eta).toBe(`${today}T16:45`);
    expect(capturingUkcPanel().active).toBe(true);
    picker.getByLabelText('Heures de l’ETA (Paris)').focus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Choisir l’ETA' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Fiche Opération en Mer' })).toBeVisible();
    expect(etaGroup()).toBeVisible();
    expect(picker.getByRole('grid', { name: `Calendrier · ${currentMonth}` })).toBeVisible();
    expect(picker.getByRole('gridcell', { selected: true })).toHaveTextContent(String(Number(today.slice(-2))));
    expectEtaTime('16:45', picker);
    expect(capturingWeatherPanel().waypoints[0].eta).toBe(`${today}T16:45`);
    expect(footerQueries().getByText('Modifications non enregistrées')).toBeVisible();
    expect(confirm).not.toHaveBeenCalled();
    expect(saveSeaOperation).not.toHaveBeenCalled();
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

  it('immediately publishes calendar ETA edits, invalidates weather and rejects its late response while preserving radio', async () => {
    const draft = captureSeaOperationRadios(waypointCaptureDraft(), '2026-10-23T08:00:00Z');
    draft.waypoints[0].weather = waypointWeather();
    const originalPoint = structuredClone(draft.waypoints[0]);
    const record = recordFixture(captainAccount, { draft });
    const { client } = renderAccount(captainAccount, record);
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, edited) => ({ ...record, version: 4, draft: structuredClone(edited) }));
    await openRecord(record);
    await waitFor(() => expect(formQueries().getByLabelText('Projet')).toBeEnabled());
    fireEvent.click(stepButton(2));
    const previousCallback = capturingWeatherPanel().onWeatherLoaded!;
    const picker = etaQueries();
    fireEvent.click(picker.getByRole('button', { name: etaDayLabel('2026-10-24') }));
    changeEtaTime(picker, '15:30');
    expect(capturingWeatherPanel().waypoints[0]).toEqual({ ...originalPoint, eta: '2026-10-24T15:30', etaMode: 'manual', weather: undefined });
    expect(capturingWeatherPanel().waypoints[0]).not.toHaveProperty('weather');
    expect(capturingWeatherPanel().waypoints[0].radio).toEqual(originalPoint.radio);
    await act(async () => previousCallback(waypointWeather(), waypointWeatherContext(draft), client));
    expect(capturingWeatherPanel().waypoints[0]).not.toHaveProperty('weather');
    expect(capturingWeatherPanel().waypoints[0].radio).toEqual(originalPoint.radio);
    expect(footerQueries().getByText('Modifications non enregistrées')).toBeVisible();
    expectEta('2026-10-24', '15:30');
    await saveDraft();
    expect(await formQueries().findByText('Brouillon enregistré.')).toBeInTheDocument();
    const savedPoint = vi.mocked(saveSeaOperation).mock.calls[0][1].waypoints[0];
    expect(savedPoint).toMatchObject({ eta: '2026-10-24T15:30', latitude: originalPoint.latitude, longitude: originalPoint.longitude, descriptionVhf: originalPoint.descriptionVhf });
    expect(savedPoint).not.toHaveProperty('weather');
    expect(savedPoint.radio?.contacts).toEqual(originalPoint.radio?.contacts);
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

  it('loads, saves and reopens a waypoint ETA selected through its date and time calendar', async () => {
    const draft = noGoDraft();
    draft.waypoints = [{ id: 'point-server-id', number: '1', descriptionVhf: 'Entrée du chenal', latitude: '49 N', longitude: '001 W', ukc: '2 m', eta: '2026-10-16T12:00', denseTraffic: false }];
    const record = recordFixture(captainAccount, { draft });
    const { client } = renderAccount(captainAccount, record);
    let stored = record;
    vi.mocked(fetchSeaOperationDetail).mockImplementation(async () => stored);
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, edited) => (stored = { ...record, version: 4, draft: structuredClone(edited) }));
    await openRecord(record);
    await userEvent.click(stepButton(2));
    expectEta('2026-10-16', '12:00');
    applyEta('2026-10-17', '14:45');
    await saveDraft();
    expect(await formQueries().findByText('Brouillon enregistré.')).toBeInTheDocument();
    expect(saveSeaOperation).toHaveBeenCalledWith(client, expect.objectContaining({ waypoints: [expect.objectContaining({ eta: '2026-10-17T14:45' })] }), record);
    expectEta('2026-10-17', '14:45');
    fireEvent.click(footerQueries().getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await openRecord(stored);
    fireEvent.click(stepButton(2));
    expectEta('2026-10-17', '14:45');
    expect(capturingWeatherPanel().waypoints[0].eta).toBe('2026-10-17T14:45');
  });

  it('provides the complete signed print document from the Armement step', async () => {
    const draft = noGoDraft();
    draft.charts = 'SHOM 7120';
    draft.waypoints = [{ id: 'print-point', number: '1', descriptionVhf: 'Contact Cherbourg VHF 12', latitude: '49°39 N', longitude: '001°37 W', ukc: '2 m', eta: '12:00', denseTraffic: true }];
    const record = recordFixture(captainAccount, {
      draft, status: 'signed', version: 8, signedBy: captainAccount.id,
      signedByName: 'Identité serveur Camille MARTIN', captainName: 'Camille MARTIN',
      signedAt: '2026-10-16T10:00:00Z', canEdit: false, canSign: false,
    });
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    renderAccount(captainAccount, record);
    await openRecord(record);
    expect(stepButton(0)).toHaveAttribute('aria-current', 'step');
    await userEvent.click(screen.getByRole('button', { name: 'Imprimer la fiche' }));
    expect(print).toHaveBeenCalledTimes(1);
    const document = within(window.document.querySelector('.so-page > .so-print')!);
    expect(document.getByText('Identité serveur Camille MARTIN')).toBeInTheDocument();
    expect(document.getByText('16/10/2026 12:00')).toBeInTheDocument();
    expect(document.getByText('Signée et figée')).toBeInTheDocument();
    expect(document.getByText(`${record.id} · Version 8`)).toBeInTheDocument();
    expect(document.getByText('SHOM 7120')).toBeInTheDocument();
    expect(document.getByText('Contact Cherbourg VHF 12')).toBeInTheDocument();
    expect(document.getByText('12:00')).toBeInTheDocument();
    expect(document.getByText(draft.risks)).toBeInTheDocument();
    expect(document.getByRole('heading', { name: /Décision du Capitaine/, hidden: true })).toBeInTheDocument();
  });

  it('recovers an unsaved preparation after unmount with its original revision and clears it after a successful save', async () => {
    const original = recordFixture(captainAccount);
    const first = renderAccount(captainAccount, original);
    await openRecord(original);
    await userEvent.clear(formQueries().getByLabelText('Description de l’opération'));
    await userEvent.type(formQueries().getByLabelText('Description de l’opération'), 'Préparation non enregistrée');
    await userEvent.click(stepButton(2));
    vi.mocked(saveSeaOperation).mockRejectedValueOnce({ message: 'Erreur serveur inconnue conservée.' });
    await saveDraft();
    expect(await formQueries().findByRole('alert')).toHaveTextContent('Erreur serveur inconnue conservée.');
    first.unmount();

    const newer = { ...original, version: 9 };
    const recovered = renderAccount(captainAccount, newer);
    expect(await screen.findByText(/Votre préparation non enregistrée a été récupérée/)).toBeInTheDocument();
    expect(formQueries().getByLabelText('Description de l’opération')).toHaveValue('Préparation non enregistrée');
    expect(stepButton(2)).toHaveAttribute('aria-current', 'step');
    vi.mocked(saveSeaOperation).mockRejectedValueOnce(new Error('L’opération a été modifiée. Rechargez-la avant de continuer.'));
    await saveDraft();
    expect(await formQueries().findByRole('alert')).toHaveTextContent('L’opération a été modifiée.');
    expect(saveSeaOperation).toHaveBeenLastCalledWith(recovered.client, expect.objectContaining({ description: 'Préparation non enregistrée' }), expect.objectContaining({ id: original.id, version: 3 }));
    expect(formQueries().getByLabelText('Description de l’opération')).toHaveValue('Préparation non enregistrée');
    let saved = newer;
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, draft) => (saved = { ...newer, version: 10, draft: structuredClone(draft) }));
    await saveDraft();
    expect(await formQueries().findByText('Brouillon enregistré.')).toBeInTheDocument();
    recovered.unmount();
    renderAccount(captainAccount, saved);
    expect(await screen.findByRole('button', { name: /Inspection de la bouée/ })).toBeInTheDocument();
    expect(screen.queryByText(/Votre préparation non enregistrée a été récupérée/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Projet')).not.toBeInTheDocument();
  });

  it('isolates local recovery by authenticated actor and company and discards it after an approved quit', async () => {
    const first = renderAccount(captainAccount);
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await userEvent.type(formQueries().getByLabelText('Description de l’opération'), 'Privé au compte et à la société');
    first.unmount();
    const otherActor = renderAccount(sailorAccount);
    expect(await screen.findByText('Préparez votre première opération en mer')).toBeInTheDocument();
    expect(screen.queryByLabelText('Projet')).not.toBeInTheDocument();
    otherActor.unmount();
    const otherCompany = renderAccount(captainAccount, undefined, 2);
    expect(await screen.findByText('Préparez votre première opération en mer')).toBeInTheDocument();
    expect(screen.queryByLabelText('Projet')).not.toBeInTheDocument();
    otherCompany.unmount();
    const recovered = renderAccount(captainAccount);
    expect(await screen.findByLabelText('Description de l’opération')).toHaveValue('Privé au compte et à la société');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await userEvent.click(screen.getByRole('link', { name: 'Navires' }));
    expect(await screen.findByRole('heading', { name: 'Flotte destination' })).toBeInTheDocument();
    recovered.unmount();
    renderAccount(captainAccount);
    expect(await screen.findByText('Préparez votre première opération en mer')).toBeInTheDocument();
    expect(screen.queryByText(/Votre préparation non enregistrée a été récupérée/)).not.toBeInTheDocument();
  });
  it('compares the saved weather independently of unsaved waypoint edits and updates it only after saving', async () => {
    const draft = waypointCaptureDraft(); draft.waypoints[0].weather = waypointWeather();
    const record = recordFixture(captainAccount, { draft });
    renderAccount(captainAccount, record);
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, edited) => ({ ...record, version: 4, draft: structuredClone(edited) }));
    await openRecord(record); fireEvent.click(stepButton(2));
    const comparison = () => within(formQueries().getByRole('region', { name: 'Météo enregistrée aux waypoints' }));
    expect(comparison().getByRole('region', { name: 'Prévisions du brouillon' })).toHaveTextContent('1,20');
    expect(comparison().queryByRole('button', { name: 'Actualiser les mesures enregistrées' })).not.toBeInTheDocument();
    fireEvent.change(formQueries().getByLabelText('Description · point 1'), { target: { value: 'Description modifiée' } });
    expect(comparison().getByRole('status')).toHaveTextContent('dernière version enregistrée');
    expect(comparison().queryByRole('heading', { name: /Description modifiée/ })).not.toBeInTheDocument();
    expect(comparison().getByRole('heading', { name: /Entrée de Cherbourg/ })).toBeVisible();
    await saveDraft();
    expect(await formQueries().findByText('Brouillon enregistré.')).toBeInTheDocument();
    expect(comparison().getByRole('heading', { name: /Description modifiée/ })).toBeVisible();
    expect(comparison().queryByText(/dernière version enregistrée/)).not.toBeInTheDocument();
    expect(comparison().getByRole('region', { name: 'Prévisions du brouillon' })).toHaveTextContent('1,20');
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

});
