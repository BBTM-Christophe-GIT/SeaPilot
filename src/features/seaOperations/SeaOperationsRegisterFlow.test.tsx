import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SeaOperationRegisterMap } from './SeaOperationRegisterMap';
import { SeaOperationsPage } from './SeaOperationsPage';
import { emptySeaOperation } from './seaOperationModel';
import { fetchSeaOperationData, fetchSeaOperationDetail, saveSeaOperation, type SeaOperationData, type SeaOperationRecord } from './seaOperationQueries';
import { captureSeaOperationValidationWeather } from './seaOperationValidationWeather';
import { captureSeaOperationValidationUkc } from './seaOperationValidationUkc';

type MapProps = ComponentProps<typeof SeaOperationRegisterMap>;
const mapSpy = vi.hoisted(() => vi.fn());
vi.mock('./seaOperationQueries', () => ({ fetchSeaOperationData: vi.fn(), fetchSeaOperationDetail: vi.fn(), saveSeaOperation: vi.fn() }));
vi.mock('./seaOperationValidationWeather', () => ({ captureSeaOperationValidationWeather: vi.fn() }));
vi.mock('./seaOperationValidationUkc', async original => ({ ...await original<typeof import('./seaOperationValidationUkc')>(), captureSeaOperationValidationUkc: vi.fn() }));
vi.mock('./SeaOperationRegisterMap', () => ({ SeaOperationRegisterMap: (props: MapProps) => {
  mapSpy(props);
  return <section aria-label="Carte de test"><p>{props.record?.draft.project || 'Aucune sélection'}</p></section>;
} }));

function fixture(id: string, canEdit = true): SeaOperationRecord {
  return { id, companyId: 1, version: 3, status: 'draft', draft: { ...emptySeaOperation(), project: `Projet ${id}`, vessel: { ...emptySeaOperation().vessel, id: '12', name: 'GOURY' } },
    createdBy: 'captain', createdByName: 'Capitaine', createdAt: '2026-10-28T08:00:00Z', updatedBy: 'captain', updatedByName: 'Capitaine', updatedAt: '2026-10-28T08:00:00Z',
    signedBy: null, signedByName: null, signedAt: null, captainName: null, canEdit, canSign: false };
}
const first = fixture('A'), second = fixture('B');
const props = () => mapSpy.mock.lastCall![0] as MapProps;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(accept => { resolve = accept; }); return { promise, resolve }; }
function mount() {
  const client = { fixture: 'real-captain' } as unknown as SupabaseClient;
  const data: SeaOperationData = { companyId: 1, actorId: 'captain', actorName: 'Capitaine', records: [first, second], vessels: [{ id: 12, name: 'GOURY', lengthOverall: '36', registrationImo: '', maxSpeedKnots: 12, canSign: false }] };
  vi.mocked(fetchSeaOperationData).mockResolvedValue(data);
  vi.mocked(fetchSeaOperationDetail).mockImplementation(async (_client, id) => id === first.id ? structuredClone(first) : structuredClone(second));
  const app = (value: SupabaseClient) => <MemoryRouter><Routes><Route element={<Outlet context={{ client: value }} />}><Route path="/" element={<SeaOperationsPage />} /></Route></Routes></MemoryRouter>;
  const result = render(app(client));
  return { client, data, changeClient: (next: SupabaseClient) => result.rerender(app(next)) };
}
async function select(id = 'A') { fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^Projet ${id}`) })); }

beforeEach(() => {
  vi.resetAllMocks(); sessionStorage.clear();
  vi.mocked(captureSeaOperationValidationWeather).mockImplementation(async (_client, draft) => draft);
  vi.mocked(captureSeaOperationValidationUkc).mockImplementation(async (_client, draft) => draft);
});
afterEach(() => vi.restoreAllMocks());

describe('Operation register map integration', () => {
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
