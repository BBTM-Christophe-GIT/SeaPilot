import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SeaOperationRegisterMap } from './SeaOperationRegisterMap';
import { SeaOperationsPage } from './SeaOperationsPage';
import { emptySeaOperation, seaOperationToday } from './seaOperationModel';
import { fetchSeaOperationData, fetchSeaOperationDetail, saveSeaOperation, type SeaOperationData, type SeaOperationRecord } from './seaOperationQueries';
import { captureSeaOperationValidationWeather } from './seaOperationValidationWeather';
import { captureSeaOperationValidationUkc } from './seaOperationValidationUkc';
import { fetchSeaOperationProjectDocuments } from './seaOperationDocumentQueries';
import { exportSeaOperationPdf } from './seaOperationPdf';
import { renderSeaOperationVoyageFuelDetails } from './SeaOperationVoyageFuelMetrics';
import type { SeaOperationConsumption } from './seaOperationConsumption';
import type { SeaOperationFleetFuelLevel } from './seaOperationFleetFuelQuery';
import type { RoleKey } from '../permissions/roles';

type MapProps = ComponentProps<typeof SeaOperationRegisterMap>;
const { mapSpy, buildWorkbook } = vi.hoisted(() => ({ mapSpy: vi.fn(), buildWorkbook: vi.fn() }));
vi.mock('./seaOperationQueries', () => ({ fetchSeaOperationData: vi.fn(), fetchSeaOperationDetail: vi.fn(), saveSeaOperation: vi.fn() }));
vi.mock('./seaOperationPdf', () => ({ exportSeaOperationPdf: vi.fn() }));
vi.mock('./seaOperationConsumptionWorkbook', () => ({ buildSeaOperationConsumptionWorkbook: buildWorkbook }));
vi.mock('./seaOperationDocumentQueries', () => ({ fetchSeaOperationProjectDocuments: vi.fn(), createSeaOperationProjectDocumentUrl: vi.fn(), loadSeaOperationProjectDocumentBlob: vi.fn() }));
vi.mock('../projects/ProjectDocumentThumbnail', () => ({ ProjectDocumentThumbnail: () => <span aria-hidden="true">Miniature</span> }));
vi.mock('./seaOperationValidationWeather', () => ({ captureSeaOperationValidationWeather: vi.fn() }));
vi.mock('./seaOperationValidationUkc', async original => ({ ...await original<typeof import('./seaOperationValidationUkc')>(), captureSeaOperationValidationUkc: vi.fn() }));
vi.mock('./SeaOperationRegisterMap', () => ({ SeaOperationRegisterMap: (props: MapProps) => {
  mapSpy(props);
  return <section aria-label="Carte de test"><p>{props.record?.draft.project || 'Aucune sélection'}</p>
    {props.record && renderSeaOperationVoyageFuelDetails(props.consumption, props.record.draft, 71)}
  </section>;
} }));

const today = seaOperationToday();
const emptyRegisterConsumption = { recordedOperationIds: [], vesselAverages: [] };
const emptyFuelMonths = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, liters: null, costEuros: null, unpricedLiters: 0 }));

function fixture(id: string, canEdit = true): SeaOperationRecord {
  return { id, companyId: 1, version: 3, status: 'draft', draft: { ...emptySeaOperation(), project: `Projet ${id}`, vessel: { ...emptySeaOperation().vessel, id: '12', name: 'GOURY' } },
    createdBy: 'captain', createdByName: 'Capitaine', createdAt: today + 'T08:00:00Z', updatedBy: 'captain', updatedByName: 'Capitaine', updatedAt: today + 'T08:00:00Z',
    signedBy: null, signedByName: null, signedAt: null, captainName: null, canEdit, canSign: false };
}
const first = fixture('A'), second = fixture('B');
const props = () => mapSpy.mock.lastCall![0] as MapProps;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(accept => { resolve = accept; }); return { promise, resolve }; }
function mount(roles?: RoleKey[], records = [first, second], rpc?: (name: string, args: Record<string, unknown>) => Promise<unknown>,
  vesselNames = ['GOURY'], readFuel: () => SeaOperationFleetFuelLevel[] = () => [],
  readHistory: (id: number, year: number, includeBilling: boolean) => unknown = () => ({ years: [], months: emptyFuelMonths })) {
  const actor = roles?.[0] || 'captain';
  const registerRpc = rpc ?? (async (name: string) => ({
    data: name === 'sea_operation_register_consumption' ? emptyRegisterConsumption : null, error: null,
  }));
  const client = { fixture: `authenticated-${actor}`, rpc: async (...args: [string, Record<string, unknown>]) =>
    args[0] === 'sea_operation_fleet_fuel' ? { data: readFuel(), error: null }
      : args[0] === 'sea_operation_fleet_fuel_history'
        ? { data: await readHistory(Number(args[1].p_vessel_id), Number(args[1].p_year), args[1].p_include_billing === true), error: null }
        : registerRpc(...args) } as unknown as SupabaseClient;
  const data: SeaOperationData = { companyId: 1, actorId: actor, actorName: actor, records, vessels: vesselNames.map((name, index) => ({ id: 12 + index, name, lengthOverall: '36', registrationImo: '', maxSpeedKnots: 12, canSign: false })) };
  vi.mocked(fetchSeaOperationData).mockResolvedValue(data);
  vi.mocked(fetchSeaOperationDetail).mockImplementation(async (_client, id) => structuredClone(records.find(record => record.id === id)!));
  const app = (value: SupabaseClient) => <MemoryRouter><Routes><Route element={<Outlet context={{ client: value, roles }} />}><Route path="/" element={<SeaOperationsPage />} /></Route></Routes></MemoryRouter>;
  const result = render(app(client));
  return { client, data, changeClient: (next: SupabaseClient) => result.rerender(app(next)) };
}
async function select(id = 'A') { fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^Projet ${id}`) })); }

beforeEach(() => {
  vi.resetAllMocks(); sessionStorage.clear();
  vi.mocked(fetchSeaOperationProjectDocuments).mockResolvedValue([]);
  vi.mocked(captureSeaOperationValidationWeather).mockImplementation(async (_client, draft) => draft);
  vi.mocked(captureSeaOperationValidationUkc).mockImplementation(async (_client, draft) => draft);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Operation register map integration', () => {
  it.each(['capitaine', 'marin', 'armement', 'admin', 'direction'] as const)('uses the authenticated %s role for document actions independently of map edit rights', async role => {
    const { client } = mount([role]);
    const operation = { ...structuredClone(first), draft: { ...structuredClone(first.draft), planning: { projectId: '501', operationId: '401:12', date: '2026-10-30', captainPersonId: '' } } };
    vi.mocked(fetchSeaOperationDetail).mockResolvedValue(operation);
    vi.mocked(fetchSeaOperationProjectDocuments).mockResolvedValue([{ id: 'project:41', projectId: '501', title: 'Plan de prévention', fileName: 'plan.pdf', mimeType: 'application/pdf', categoryLabel: 'HSE', subcategoryLabel: '', createdAt: '', expiresOn: null }]);
    await select();
    await waitFor(() => expect(screen.getByRole('tab', { name: /^Documents/ })).toHaveTextContent('Documents1'));
    fireEvent.click(screen.getByRole('tab', { name: /^Documents/ }));
    const panel = within(screen.getByRole('tabpanel', { name: /^Documents/ }));
    expect(fetchSeaOperationProjectDocuments).toHaveBeenCalledWith(client, '501');
    expect(panel.getByRole('button', { name: 'Ouvrir : Plan de prévention' })).toBeEnabled();
    expect(panel.getByRole('button', { name: 'Télécharger plan.pdf' })).toBeEnabled();
    expect(panel.queryByRole('button', { name: /Modifier|Classer/ })).not.toBeInTheDocument();
    if (role === 'admin' || role === 'direction') expect(panel.getByRole('button', { name: 'Supprimer plan.pdf' })).toBeEnabled();
    else expect(panel.queryByRole('button', { name: /^Supprimer/ })).not.toBeInTheDocument();
    expect(operation.canEdit).toBe(true);
  });

  it('selects the fresh authorized operation without opening the form or saving on selection', async () => {
    const { client } = mount(); await select();
    await waitFor(() => expect(props().record?.id).toBe(first.id));
    expect(fetchSeaOperationDetail).toHaveBeenCalledWith(client, first.id);
    expect(props().maxSpeedKnots).toBe(12);
    expect(screen.getByRole('button', { name: /^Projet A/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(saveSeaOperation).not.toHaveBeenCalled();
  });
  it('ignores a slow previous selection and allows selecting another row during loading', async () => {
    mount(); const slow = deferred<SeaOperationRecord>();
    vi.mocked(fetchSeaOperationDetail).mockImplementation(async (_client, id) => id === first.id ? slow.promise : second);
    await select(); await select('B');
    await waitFor(() => expect(props().record?.id).toBe(second.id));
    await act(async () => slow.resolve(first));
    expect(props().record?.id).toBe(second.id);
  });
  it('shows a retry after a selection failure and rejects mismatched detail records', async () => {
    mount(); vi.mocked(fetchSeaOperationDetail).mockResolvedValueOnce(second);
    await select(); expect(await screen.findByRole('alert')).toHaveTextContent('ne correspond pas');
    expect(props().record).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => expect(props().record?.id).toBe(first.id));
  });
  it('asks before discarding map edits and keeps selection when declined', async () => {
    mount(); await select(); await waitFor(() => expect(props().record).not.toBeNull());
    act(() => props().onDirtyChange!(true));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await select('B'); expect(confirm).toHaveBeenCalledOnce(); expect(props().record?.id).toBe(first.id);
    const unload = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true);
    confirm.mockReturnValue(true); await select('B'); await waitFor(() => expect(props().record?.id).toBe(second.id));
  });
  it('persists an edited draft with its expected version and replaces the map with the saved snapshot', async () => {
    const { client } = mount(); await select(); await waitFor(() => expect(props().record).not.toBeNull());
    const source = props().record!, changed = { ...source.draft, charts: '7000' };
    const saved = { ...source, version: 4, draft: changed };
    vi.mocked(saveSeaOperation).mockResolvedValue(saved);
    await act(async () => props().onSave(changed, source));
    expect(saveSeaOperation).toHaveBeenCalledWith(client, expect.objectContaining({ charts: '7000' }), { id: first.id, version: 3 });
    expect(props().record?.version).toBe(4);
    expect(screen.getByRole('status')).toHaveTextContent('points de l’opération ont été enregistrés');
  });
  it('keeps the source and rejects a concurrent server save error', async () => {
    mount(); await select(); await waitFor(() => expect(props().record).not.toBeNull());
    vi.mocked(saveSeaOperation).mockRejectedValue(new Error('Rechargez la fiche.'));
    let failure: unknown; await act(async () => { try { await props().onSave(props().record!.draft, props().record!); } catch (reason) { failure = reason; } });
    expect(failure).toEqual(new Error('Rechargez la fiche.')); expect(props().record?.version).toBe(3); expect(props().disabled).toBe(false);
  });
  it('reloads the same selected operation after a version conflict and saves the fresh version', async () => {
    mount(); await select(); await waitFor(() => expect(props().record?.version).toBe(3));
    vi.mocked(saveSeaOperation).mockRejectedValueOnce(new Error('Rechargez la fiche.'));
    await act(async () => { try { await props().onSave(first.draft, first); } catch { /* surfaced by map */ } });
    act(() => props().onDirtyChange!(true)); vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fresh = { ...first, version: 7 }; vi.mocked(fetchSeaOperationDetail).mockResolvedValue(fresh);
    await select(); await waitFor(() => expect(props().record?.version).toBe(7));
    vi.mocked(saveSeaOperation).mockResolvedValue({ ...fresh, version: 8 });
    await act(async () => props().onSave(fresh.draft, fresh));
    expect(vi.mocked(saveSeaOperation).mock.lastCall?.[2]).toEqual({ id: first.id, version: 7 });
    expect(props().record?.version).toBe(8);
  });
  it.each([{ status: 'signed' as const, canEdit: true }, { status: 'draft' as const, canEdit: false }])('does not save $status records with canEdit=$canEdit', async (rights) => {
    mount(); const source = { ...first, ...rights }; vi.mocked(fetchSeaOperationDetail).mockResolvedValue(source);
    await select(); await waitFor(() => expect(props().record).not.toBeNull());
    await expect(props().onSave(source.draft, source)).rejects.toThrow('Rechargez'); expect(saveSeaOperation).not.toHaveBeenCalled();
  });
  it('prevents a stale save callback from modifying another selected record', async () => {
    mount(); await select(); await waitFor(() => expect(props().record?.id).toBe(first.id)); const stale = props();
    await select('B'); await waitFor(() => expect(props().record?.id).toBe(second.id));
    await expect(stale.onSave(first.draft, first)).rejects.toThrow('Rechargez'); expect(saveSeaOperation).not.toHaveBeenCalled();
  });
  it('does not issue a business write if the account changes during weather preparation', async () => {
    const view = mount(); await select(); await waitFor(() => expect(props().record).not.toBeNull());
    const pending = deferred<typeof first.draft>(); vi.mocked(captureSeaOperationValidationWeather).mockReturnValue(pending.promise);
    let result!: Promise<void>; act(() => { result = props().onSave(first.draft, first); });
    const newClient = { fixture: 'other-account' } as unknown as SupabaseClient;
    vi.mocked(fetchSeaOperationData).mockResolvedValue({ ...view.data, actorId: 'other', records: [] }); view.changeClient(newClient);
    let failure: unknown; await act(async () => { pending.resolve(first.draft); try { await result; } catch (reason) { failure = reason; } });
    expect(failure).toBeInstanceOf(Error); expect(saveSeaOperation).not.toHaveBeenCalled(); expect(props().record).toBeNull();
  });
});

function signedGo(id: string, project = `Projet ${id}`): SeaOperationRecord {
  const operation = fixture(id, false);
  return { ...operation, status: 'signed', signedBy: 'captain', signedByName: 'Capitaine', signedAt: today + 'T10:00:00Z',
    captainName: 'Capitaine', draft: { ...operation.draft, project, decision: 'GO' } };
}

function initialConsumption(operationId: string): SeaOperationConsumption {
  return {
    operationId, canEdit: true, record: null,
    calibration: { kind: 'nominal', defaultGaugeUnit: 'percent', nominalCapacityLiters: 10_000 },
    reference: { vesselId: 12, transitLitersPerNm: 8.4, towageLitersPerNm: null, pricePerLiter: 1.254, priceDate: '2026-11-05' },
  };
}

const savedReading = {
  durationMinutes: 120, averageSpeedKnots: 10, gaugeUnit: 'percent', departureGauge: 80, arrivalGauge: 70,
  refuelLiters: null, pricePerLiter: 1.2, actualArrival: null, completed: true, distanceNm: 20, departureLiters: 8000, arrivalLiters: 7000,
  consumedLiters: 1000, litersPerHour: 500, litersPerNm: 50, costEuros: 1200, version: 1, includedInReference: false,
  updatedAt: '2026-11-06T10:00:00Z',
} satisfies NonNullable<SeaOperationConsumption['record']>;

function exportButton() {
  return within(screen.getByRole('navigation', { name: 'Commandes Opération en Mer' }))
    .getByRole('button', { name: 'Export Excel' });
}

describe('Operation consumption from the register', () => {
  const stock: SeaOperationFleetFuelLevel = { vesselId: 12, vesselName: 'GOURY', lengthOverall: '36', maxSpeedKnots: 20,
    capacityLiters: 10_000, fuelLiters: null, measuredAt: null, source: null, canSetBaseline: true,
    baselineDate: null, baselineFuelLiters: null, deductedFuelLiters: null, refuelLiters: null,
    rateLitersPerHour: null, rateSampleCount: 0 };
  const fleetFuel = () => within(screen.getByRole('region', { name: 'Carburant de la flotte' }));

  it('uses the exact gauge thresholds and changes volume units at 3000 liters of capacity', async () => {
    const levels = [
      { name: 'GOURY', capacityLiters: 10_000, fuelLiters: 2400, level: 'critical', text: '2,4 m³' },
      { name: 'LANDEMER', capacityLiters: 3000, fuelLiters: 750, level: 'warning', text: '0,75 m³' },
      { name: 'LE ROZEL', capacityLiters: 2000, fuelLiters: 700, level: 'warning', text: '700 L' },
      { name: 'SUROÎT', capacityLiters: 2999, fuelLiters: 1050, level: 'normal', text: /1\s050 L/ },
      { name: 'HOLENN EUSA', capacityLiters: null, fuelLiters: 100, level: 'unknown', text: '100 L' },
    ];
    mount(['marin'], [], undefined, levels.map(vessel => vessel.name), () => levels.map((vessel, index) => ({
      ...stock, vesselId: 12 + index, vesselName: vessel.name, capacityLiters: vessel.capacityLiters, fuelLiters: vessel.fuelLiters, canSetBaseline: false,
    })));
    for (const vessel of levels) {
      const title = await screen.findByRole('heading', { name: vessel.name });
      const card = title.closest('li')!;
      expect(card.querySelector('.so-fuel-card-tank')).toHaveAttribute('data-level', vessel.level);
      expect(within(card).getByText(vessel.text)).toBeVisible();
      const alert = within(card).queryByRole('img', { name: /carburant critique/i });
      if (vessel.level === 'critical') {
        expect(alert).toBeVisible();
        expect(title.parentElement).toContainElement(alert);
      } else expect(alert).not.toBeInTheDocument();
    }
  });

  it('shows both measured autonomy regimes and labels the stock gauge', async () => {
    mount(['capitaine'], [], undefined, ['LE ROZEL', 'GOURY'], () => [
      { ...stock, vesselName: 'LE ROZEL', maxSpeedKnots: 11, fuelLiters: 11432.6, capacityLiters: 16569,
        navigationProfiles: { normal: { speedKnots: 5.5, litersPerNm: 7.4, sampleCount: 87 },
          towing: { speedKnots: 4.2, litersPerNm: 13.4, sampleCount: 25 } } },
      { ...stock, vesselId: 13, fuelLiters: 1000, capacityLiters: 3000 },
    ]);
    fireEvent.click(await screen.findByRole('button', { name: 'Détails carburant · LE ROZEL' }));

    const autonomy = within(screen.getByRole('region', { name: 'Autonomie estimée' }));
    const normal = within(autonomy.getByRole('region', { name: 'Vitesse moyenne' }));
    expect(normal.getByText('5,5 nd')).toBeVisible();
    expect(normal.getByText('11 nd')).toBeVisible();
    expect(normal.getByText('7,4 L/NM')).toBeVisible();
    expect(normal.getByText('87 relevés')).toBeVisible();
    expect(normal.getByText(/280,9 h · 1\s544,9 NM/)).toBeVisible();
    const towing = within(autonomy.getByRole('region', { name: 'Vitesse moyenne en remorque' }));
    expect(towing.getByText('4,2 nd')).toBeVisible();
    expect(towing.getByText('13,4 L/NM')).toBeVisible();
    expect(towing.getByText('203,1 h · 853,2 NM')).toBeVisible();

    const meter = screen.getByRole('meter', { name: 'Stock de carburant' });
    expect(meter).toHaveAttribute('data-level', 'normal');
    expect(within(meter).getByText(/69\s%/)).toBeVisible();
    expect(within(meter).getByText('11,433 m³')).toBeVisible();
    expect(within(meter).getByText('16,569 m³')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Détails carburant · GOURY' }));
    const lowMeter = screen.getByRole('meter', { name: 'Stock de carburant' });
    expect(lowMeter).toHaveAttribute('data-level', 'warning');
    expect(within(lowMeter).getByText(/1\s000 L/)).toBeVisible();
    expect(within(lowMeter).getByText('3 m³')).toBeVisible();
  });

  it('opens annual history for GOURY and shows the cost source of the selected year', async () => {
    const currentYear = Number(today.slice(0, 4));
    const readHistory = vi.fn((_id: number, year: number) => ({ years: [currentYear, currentYear - 1],
      costSource: year === currentYear ? 'billing' : 'dpr', months: [
        { month: 1, liters: year === currentYear ? 2100 : 800, costEuros: year === currentYear ? 2500 : 960, unpricedLiters: 0 },
        ...emptyFuelMonths.slice(1),
      ] }));
    mount(['marin'], [], undefined, ['GOURY', 'LE ROZEL'], () => [stock, { ...stock, vesselId: 13, vesselName: 'LE ROZEL' }], readHistory);
    const toggle = await screen.findByRole('button', { name: 'Détails carburant · GOURY' });
    expect(readHistory).not.toHaveBeenCalled();
    fireEvent.click(toggle);
    const panel = within(screen.getByRole('region', { name: 'Indicateurs carburant · GOURY' }));
    const yearSelect = await panel.findByRole('combobox', { name: /année/i });
    expect(yearSelect).toHaveValue(String(currentYear));
    await panel.findByRole('option', { name: String(currentYear - 1) });
    expect(readHistory).toHaveBeenCalledWith(12, currentYear, true);
    expect(await panel.findByText(/Projet.*Facturation.*Fuel/)).toBeVisible();
    fireEvent.change(yearSelect, { target: { value: String(currentYear - 1) } });
    await waitFor(() => expect(readHistory).toHaveBeenCalledWith(12, currentYear - 1, true));
    expect(await panel.findByRole('img', { name: /coût cumulé estimé/i })).toBeVisible();
    expect(panel.queryByText(/Projet.*Facturation.*Fuel/)).not.toBeInTheDocument();
    expect(panel.getByRole('combobox', { name: /année/i })).toHaveValue(String(currentYear - 1));
    expect(panel.getByText('Autonomie estimée')).toBeVisible();
    expect(panel.getByText('Moyennes')).toBeVisible();
    fireEvent.click(toggle);
    expect(screen.queryByRole('region', { name: 'Indicateurs carburant · GOURY' })).not.toBeInTheDocument();
  });

  it('preselects the assigned vessel and shows its saved tank reading alongside the current stock', async () => {
    let fuel = { ...stock, assignedToday: true };
    const baselineDate = seaOperationToday(new Date(Date.now() - 7 * 86_400_000));
    const tanks = [{ key: 'main-1', name: 'Cuve', capacityLiters: 10000 }];
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === 'sea_operation_fuel_tanks') return { data: {
        vesselId: 12, date: args.p_date, time: args.p_time, times: [], canSetBaseline: true, tanks, reading: null,
      }, error: null };
      if (name === 'sea_operation_save_fuel_tanks') {
        fuel = { ...fuel, fuelLiters: 5600, measuredAt: `${baselineDate}T00:00:00Z`, source: 'baseline',
          baselineDate, baselineFuelLiters: 6050, deductedFuelLiters: 450,
          latestTankReading: { date: baselineDate, time: '14:30', superseded: false, tanks: [{ ...tanks[0], liters: 6050 }] } };
        return { data: fuel, error: null };
      }
      return { data: emptyRegisterConsumption, error: null };
    });
    mount(['capitaine'], [], rpc, ['GOURY', 'LANDEMER'], () => [fuel, { ...stock, vesselId: 13, vesselName: 'LANDEMER', lengthOverall: '42' }]);
    const fuelRibbon = within(screen.getByRole('group', { name: 'Fuel' }));
    expect(fuelRibbon.getByRole('button', { name: 'Export Excel' }).querySelector('img')).toHaveAttribute('src', '/icons/microsoft-excel.svg');
    expect(fuelRibbon.queryByRole('button', { name: 'Paramètres carburant' })).not.toBeInTheDocument();
    fireEvent.click(await fuelRibbon.findByRole('button', { name: 'Soutes' }));
    const form = within(screen.getByRole('dialog', { name: 'Soutes' }));
    expect(form.getByLabelText('Navire')).toHaveValue('12');
    expect(form.getByLabelText('Date de référence')).toHaveValue(today);
    fireEvent.change(form.getByLabelText('Date de référence'), { target: { value: baselineDate } });
    const time = form.getByLabelText('Heure du relevé');
    expect(time).toHaveValue('00:00');
    fireEvent.change(time, { target: { value: '14:30' } });
    const save = form.getByRole('button', { name: 'Enregistrer les niveaux' });
    expect(save).toBeDisabled();
    const tank = within(await form.findByRole('group', { name: 'Cuve' }));
    fireEvent.change(tank.getByLabelText('Unité'), { target: { value: 'percent' } });
    const value = tank.getByLabelText('Niveau');
    fireEvent.change(value, { target: { value: '101' } });
    expect(save).toBeDisabled();
    fireEvent.change(value, { target: { value: '60.5' } });
    fireEvent.click(save);
    await waitFor(() => expect(fleetFuel().getByText('5,6 m³')).toBeVisible());
    expect(fleetFuel().getByText(/56\s%/)).toBeVisible();
    expect(fleetFuel().queryByText(/déduits via DPR/)).not.toBeInTheDocument();
    fireEvent.click(fleetFuel().getByRole('button', { name: 'Détails carburant · GOURY' }));
    expect(fleetFuel().getByText('0,45 m³ déduits via DPR')).toBeVisible();
    expect(within(fleetFuel().getByRole('region', { name: 'Vitesse moyenne' })).getByText('Aucun relevé de vitesse')).toBeVisible();
    const latest = fleetFuel().getByRole('region', { name: 'Dernier relevé Soutes' });
    expect(latest.querySelector('time')).toHaveAttribute('datetime', `${baselineDate}T14:30`);
    expect(latest.querySelector('time')).toHaveTextContent('14:30');
    expect(within(latest).getByText('Cuve')).toBeVisible();
    expect(within(latest).getByText('6,05 m³')).toBeVisible();
    expect(rpc).toHaveBeenCalledWith('sea_operation_save_fuel_tanks', { p_vessel_id: 12, p_date: baselineDate, p_time: '14:30',
      p_expected_version: null, p_readings: [{ key: 'main-1', unit: 'percent', value: 60.5 }] });
  });

  it('selects the operation being edited and shows the saved fuel KPIs even if the refresh fails', async () => {
    const operations = [signedGo('A'), signedGo('B')];
    const saved: SeaOperationConsumption = { ...initialConsumption('B'), record: savedReading,
      reference: { ...initialConsumption('B').reference, pricePerLiter: 1.2 } };
    const reload = deferred<{ data: null; error: { message: string } }>();
    const afterSaveRead = vi.fn(() => reload.promise);
    let didSave = false;
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === 'sea_operation_register_consumption') return { data: emptyRegisterConsumption, error: null };
      if (name === 'sea_operation_save_consumption') {
        didSave = true;
        return { data: saved, error: null };
      }
      if (didSave) return afterSaveRead();
      return { data: initialConsumption(String(args.p_id)), error: null };
    });
    mount(['capitaine'], operations, rpc, ['GOURY'], () => [didSave
      ? { ...stock, fuelLiters: 6800, measuredAt: '2026-11-06T09:00:00Z', source: 'operation', baselineDate: '2026-11-06',
        baselineFuelLiters: 7000, deductedFuelLiters: 200, refuelLiters: 1800,
        navigationProfiles: { normal: { speedKnots: 10, litersPerNm: 50, sampleCount: 1 }, towing: null } }
      : stock]);
    await select('A');
    expect(await screen.findByRole('region', { name: 'Estimation du carburant' })).toHaveTextContent('596 L');

    fireEvent.click(within(screen.getByRole('group', { name: 'Actions pour Projet B' })).getByRole('button', { name: 'Conso' }));
    await screen.findByLabelText('Heures');
    const form = within(screen.getByRole('dialog', { name: 'Consommation de carburant' }));
    for (const [label, value] of [
      ['Heures', '2'], ['Vitesse moyenne (nœuds)', '10'], ['Jauge au départ après avitaillement (%)', '80'],
      ['Jauge à l’arrivée (%)', '70'], ['Prix du fuel HT en €/L', '1.2'], ['Avitaillement avant départ (L, facultatif)', '1800'],
    ]) {
      fireEvent.change(form.getByLabelText(label), { target: { value } });
    }
    fireEvent.click(form.getByRole('button', { name: 'Enregistrer la consommation' }));

    const dashboard = within(await screen.findByRole('dialog', { name: 'Bilan de consommation' }));
    expect(dashboard.getByRole('region', { name: 'Soutes au départ et à l’arrivée' })).toBeVisible();
    fireEvent.click(dashboard.getByRole('button', { name: 'Fermer le bilan' }));
    const metrics = await screen.findByRole('region', { name: 'Carburant du relevé Conso' });
    expect(screen.getByRole('button', { name: /^Projet B/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^Projet B/ })).toHaveTextContent('Conso renseignée');
    expect(within(metrics).getByText('1 m³')).toBeVisible();
    expect(within(metrics).getByText(/1\s200 € HT/)).toBeVisible();
    expect(within(metrics).getByText('2,73 t')).toBeVisible();
    expect(within(metrics).getByText('50 L/NM')).toBeVisible();
    expect(await fleetFuel().findByText('6,8 m³')).toBeVisible();
    fireEvent.click(fleetFuel().getByRole('button', { name: 'Détails carburant · GOURY' }));
    expect(fleetFuel().getByText('13,6 h · 136 NM')).toBeVisible();
    expect(fleetFuel().getByText(/Avitaillement Conso/)).toBeVisible();
    expect(fleetFuel().getByText('0,2 m³ déduits via DPR')).toBeVisible();
    expect(rpc).toHaveBeenCalledWith('sea_operation_save_consumption', { p_id: 'B', p_expected_version: null,
      p_inputs: expect.objectContaining({ durationMinutes: 120, pricePerLiter: 1.2, refuelLiters: 1800, completed: true }) });
    await waitFor(() => expect(afterSaveRead).toHaveBeenCalled());
    await act(async () => reload.resolve({ data: null, error: { message: 'Lecture momentanément indisponible' } }));
    expect(metrics).toBeVisible();
    expect(screen.queryByText('Lecture momentanément indisponible')).not.toBeInTheDocument();
  });

  it('exports only saved readings from the filtered GO operations, even without a selected map', async () => {
    const selected = signedGo('A', 'Mission exportable');
    const withoutReading = signedGo('C', 'Mission sans relevé');
    const noGo = signedGo('D', 'Mission refusée');
    noGo.draft.decision = 'NO_GO';
    const history = { rozel: [], suroit: [], rozelGauge: [] };
    const trace = { startedAt: '2026-11-05T03:15:00.000Z', endedAt: '2026-11-05T05:15:00.000Z',
      durationMinutes: 120, distanceNm: 20, averageSpeedKnots: 10, pointCount: 4,
      segmentCount: 1, gapCount: 0, reorderedPointCount: 0, excludedPointCount: 0 };
    const reading = { ...savedReading, trace };
    const rpc = vi.fn().mockImplementation(async name => ({
      data: name === 'sea_operation_register_consumption' ? emptyRegisterConsumption
        : name === 'sea_operation_consumption_history' ? history : [{ operationId: 'A', record: reading }], error: null,
    }));
    const blob = new Blob(['xlsx']);
    buildWorkbook.mockResolvedValue(blob);
    const createObjectURL = vi.fn(() => 'blob:conso-test'), revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL }));
    const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const { data } = mount(['marin'], [selected, signedGo('B', 'Transit hors filtre'), withoutReading, noGo], rpc);
    fireEvent.change(await screen.findByLabelText('Rechercher une opération'), { target: { value: 'Mission' } });
    fireEvent.click(exportButton());

    await waitFor(() => expect(download).toHaveBeenCalledOnce());
    expect(rpc).toHaveBeenCalledWith('sea_operation_consumption_export', { p_ids: ['A', 'C'] });
    expect(rpc).toHaveBeenCalledWith('sea_operation_consumption_history');
    expect(buildWorkbook).toHaveBeenCalledExactlyOnceWith([{ operation: selected, consumption: reading }], history, data.vessels);
    expect(createObjectURL).toHaveBeenCalledExactlyOnceWith(blob);
    expect(download.mock.contexts[0]).toHaveAttribute('download', expect.stringMatching(/^SeaPilot - Consommations - \d{4}-\d{2}-\d{2}\.xlsx$/));
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:conso-test'), { timeout: 1500 });
  });

  it('downloads historical readings when the register has no current operation', async () => {
    const history = { rozel: [], suroit: [], rozelGauge: [{ sourceRow: 2, cells: [0.1, 459.75] }] };
    const rpc = vi.fn().mockImplementation(async name => ({
      data: name === 'sea_operation_register_consumption' ? emptyRegisterConsumption : history, error: null,
    }));
    const blob = new Blob(['xlsx']);
    buildWorkbook.mockResolvedValue(blob);
    vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: vi.fn(() => 'blob:history'), revokeObjectURL: vi.fn() }));
    const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const { data } = mount(['capitaine'], [], rpc);
    expect(await screen.findByText('Préparez votre première opération en mer')).toBeVisible();
    expect(exportButton()).toBeEnabled();
    fireEvent.click(exportButton());
    await waitFor(() => expect(download).toHaveBeenCalledOnce());
    expect(rpc).toHaveBeenCalledWith('sea_operation_consumption_history');
    expect(buildWorkbook).toHaveBeenCalledExactlyOnceWith([], history, data.vessels);
  });

  it('exports the registered vessel even when it has no reading', async () => {
    const history = { rozel: [], suroit: [], rozelGauge: [] };
    const rpc = vi.fn().mockImplementation(async name => ({ data: name === 'sea_operation_register_consumption'
      ? emptyRegisterConsumption : name === 'sea_operation_consumption_history' ? history : [], error: null }));
    const { data } = mount(['capitaine'], [signedGo('A')], rpc);
    buildWorkbook.mockResolvedValue(new Blob(['xlsx']));
    vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: vi.fn(() => 'blob:empty-fleet'), revokeObjectURL: vi.fn() }));
    const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await screen.findByRole('button', { name: /^Projet A/ });
    fireEvent.click(exportButton());
    await waitFor(() => expect(download).toHaveBeenCalledOnce());
    expect(buildWorkbook).toHaveBeenCalledExactlyOnceWith([], history, data.vessels);
  });

  it('shows weighted fuel and cost per mile and limits towage to the three towage vessels', async () => {
    const rpc = vi.fn(async () => ({ error: null, data: {
      recordedOperationIds: ['A'],
      vesselAverages: [
        { vesselId: 12, towageLitersPerNm: 99, otherLitersPerNm: 0, pricePerLiter: 1.2 },
        { vesselId: 13, towageLitersPerNm: 11.5, otherLitersPerNm: 8, pricePerLiter: 1.2, monthly: {
          currentMonth: '2026-11', previousMonth: '2026-10',
          towage: { current: { litersPerNm: 12, costPerNm: 14 }, previous: { litersPerNm: 10, costPerNm: 15 } },
          other: { current: { litersPerNm: 8, costPerNm: null }, previous: { litersPerNm: 8, costPerNm: 10 } },
        } },
        { vesselId: 14, towageLitersPerNm: 9, otherLitersPerNm: 7, pricePerLiter: null },
        { vesselId: 15, towageLitersPerNm: 10, otherLitersPerNm: 6, pricePerLiter: 1.4 },
      ],
    } }));
    const names = ['GOURY', 'LE ROZEL', 'LANDEMER', 'SUROÎT', 'BR 71'];
    mount(['marin'], [signedGo('A'), signedGo('B')], rpc, names, () => names.map((vesselName, index) => ({
      ...stock, vesselId: 12 + index, vesselName, canSetBaseline: false,
    })));
    const chart = within(await screen.findByRole('region', { name: 'Carburant de la flotte' }));
    await chart.findByRole('heading', { name: 'GOURY' });
    expect(chart.queryByRole('heading', { name: 'BR 71' })).not.toBeInTheDocument();
    const fuelRibbon = within(screen.getByRole('group', { name: 'Fuel' }));
    expect(fuelRibbon.queryByRole('button', { name: 'Paramètres carburant' })).not.toBeInTheDocument();
    expect(fuelRibbon.queryByRole('button', { name: 'Soutes' })).not.toBeInTheDocument();
    expect(fuelRibbon.getByRole('button', { name: 'Export Excel' })).toBeEnabled();
    expect(chart.queryByText('Remorquage')).not.toBeInTheDocument();
    const vessel = async (name: string) => {
      fireEvent.click(chart.getByRole('button', { name: `Détails carburant · ${name}` }));
      return within(await chart.findByRole('region', { name: `Indicateurs carburant · ${name}` }));
    };
    const goury = await vessel('GOURY');
    expect(goury.getByText('0 L/NM')).toBeVisible();
    expect(goury.getByText(/0,00\s€\/NM/)).toBeVisible();
    expect(goury.queryByText('Remorquage')).not.toBeInTheDocument();
    expect(goury.queryByText('99 L/NM')).not.toBeInTheDocument();
    const rozel = await vessel('LE ROZEL');
    expect(rozel.getByText('Remorquage')).toBeVisible();
    expect(rozel.getByText('11,5 L/NM')).toBeVisible();
    expect(rozel.getByText(/13,80\s€\/NM/)).toBeVisible();
    expect(rozel.getByRole('img', { name: /Consommation en hausse.*novembre 2026.*octobre 2026/ })).toBeVisible();
    expect(rozel.getByRole('img', { name: /Coût HT en baisse/ })).toBeVisible();
    expect(rozel.getByRole('img', { name: /Consommation stable/ })).toBeVisible();
    expect(rozel.getByRole('img', { name: /Coût HT.*Comparaison.*indisponible/ })).toBeVisible();
    expect((await vessel('LANDEMER')).getByText('Remorquage')).toBeVisible();
    expect((await vessel('SUROÎT')).getByText('Remorquage')).toBeVisible();
    expect(screen.getByRole('button', { name: /^Projet A/ })).toHaveTextContent('Conso renseignée');
    expect(screen.getByRole('button', { name: /^Projet B/ })).toHaveTextContent('Conso non renseignée');
  });

  it('offers the fiche and only the selected PDF sections to a read-only Marin', async () => {
    const operation = fixture('A', false);
    mount(['marin'], [operation]);
    await select();
    await waitFor(() => expect(props().record?.id).toBe('A'));
    fireEvent.click(screen.getByRole('tab', { name: 'Fiche' }));
    const fiche = within(screen.getByRole('tabpanel', { name: 'Fiche' }));
    expect(fiche.getByRole('article', { name: 'Fiche imprimable Opération en Mer' })).toBeVisible();
    expect(fiche.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument();
    const options = fiche.getByRole('button', { name: /Sections PDF/ });
    expect(options).toHaveAttribute('aria-expanded', 'false');
    expect(fiche.queryByRole('checkbox', { name: 'Armement' })).not.toBeInTheDocument();
    fireEvent.click(options);
    expect(options).toHaveAttribute('aria-expanded', 'true');
    for (const name of ['Armement', 'Documents', 'Passage Plan', 'Décision du Capitaine']) {
      fireEvent.click(fiche.getByRole('checkbox', { name }));
    }
    fireEvent.click(fiche.getByRole('button', { name: 'Télécharger la fiche' }));
    await waitFor(() => expect(exportSeaOperationPdf).toHaveBeenCalledWith(operation, {
      sections: ['checks'], documents: [], signatureImage: null,
    }, expect.any(Function)));
    expect(fetchSeaOperationProjectDocuments).not.toHaveBeenCalled();
  });
});
