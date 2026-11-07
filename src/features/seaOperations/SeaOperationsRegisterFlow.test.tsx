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

function fixture(id: string, canEdit = true): SeaOperationRecord {
  return { id, companyId: 1, version: 3, status: 'draft', draft: { ...emptySeaOperation(), project: `Projet ${id}`, vessel: { ...emptySeaOperation().vessel, id: '12', name: 'GOURY' } },
    createdBy: 'captain', createdByName: 'Capitaine', createdAt: today + 'T08:00:00Z', updatedBy: 'captain', updatedByName: 'Capitaine', updatedAt: today + 'T08:00:00Z',
    signedBy: null, signedByName: null, signedAt: null, captainName: null, canEdit, canSign: false };
}
const first = fixture('A'), second = fixture('B');
const props = () => mapSpy.mock.lastCall![0] as MapProps;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(accept => { resolve = accept; }); return { promise, resolve }; }
function mount(roles?: RoleKey[], records = [first, second], rpc?: (name: string, args: Record<string, unknown>) => Promise<unknown>, vesselNames = ['GOURY']) {
  const actor = roles?.[0] || 'captain';
  const client = { fixture: `authenticated-${actor}`, rpc: rpc ?? (async (name: string) => ({
    data: name === 'sea_operation_register_consumption' ? emptyRegisterConsumption : null, error: null,
  })) } as unknown as SupabaseClient;
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
    .getByRole('button', { name: 'Exporter les consommations en Excel' });
}

describe('Operation consumption from the register', () => {
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
    mount(['capitaine'], operations, rpc);
    await select('A');
    expect(await screen.findByRole('region', { name: 'Estimation du carburant' })).toHaveTextContent('596 L');

    fireEvent.click(within(screen.getByRole('group', { name: 'Actions pour Projet B' })).getByRole('button', { name: 'Conso' }));
    await screen.findByLabelText('Heures');
    const form = within(screen.getByRole('dialog', { name: 'Consommation de carburant' }));
    for (const [label, value] of [
      ['Heures', '2'], ['Vitesse moyenne (nœuds)', '10'], ['Jauge au départ après avitaillement (%)', '80'],
      ['Jauge à l’arrivée (%)', '70'], ['Prix du fuel HT en €/L', '1.2'],
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
    expect(rpc).toHaveBeenCalledWith('sea_operation_save_consumption', { p_id: 'B', p_expected_version: null,
      p_inputs: expect.objectContaining({ durationMinutes: 120, pricePerLiter: 1.2, completed: true }) });
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
    mount(['marin'], [signedGo('A'), signedGo('B')], rpc, ['GOURY', 'LE ROZEL', 'LANDEMER', 'SUROÎT']);
    const chart = within(await screen.findByRole('region', { name: 'Consommation moyenne par navire' }));
    const vessel = async (name: string) => within((await chart.findByRole('heading', { name })).closest('li')!);
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
