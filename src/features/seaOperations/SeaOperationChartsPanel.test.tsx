import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SeaOperationChartsPanel } from './SeaOperationChartsPanel';
import { fetchSeaOperationPointCharts, type SeaOperationPointCharts } from './seaOperationChartQueries';
import { emptySeaOperationWaypoint } from './seaOperationModel';
import { addShomChartReferences } from './seaOperationHydroModel';

vi.mock('./seaOperationChartQueries', () => ({ fetchSeaOperationPointCharts: vi.fn() }));
const client = {} as SupabaseClient;
const point = { ...emptySeaOperationWaypoint('p1'), number: '1', latitude: '48°21.6 N', longitude: '4°31.8 W', eta: '' };
const lookup: SeaOperationPointCharts = { projectId: '12', pointId: 'p1', latitude: 48.36, longitude: -4.53,
  fetchedAt: '2026-10-23T00:00:00Z', sourceUrl: 'https://services.data.shom.fr/INSPIRE/wfs', truncated: false,
  charts: [{ id: '7399', number: '7399', title: 'Port de Brest', scale: 7500, catalogueUrl: 'https://diffusion.shom.fr/catalogsearch/result/?q=7399' }] };
const load = () => act(() => new Promise((resolve) => setTimeout(resolve, 750)));
beforeEach(() => vi.resetAllMocks());

describe('SHOM charts in Passage Plan', () => {
  it('searches Transit charts without a commercial project and guards changed vessel context', async () => {
    const transit = { date: '2026-10-27', vesselId: '1' }, onChartsChange = vi.fn();
    let resolveOld!: (value: SeaOperationPointCharts) => void;
    vi.mocked(fetchSeaOperationPointCharts).mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; })).mockResolvedValue({ ...lookup, projectId: '', transit: { ...transit, vesselId: '2' } });
    const view = render(<SeaOperationChartsPanel client={client} projectId="" transit={transit} waypoints={[point]} charts="" onChartsChange={onChartsChange} />);
    await load();
    expect(fetchSeaOperationPointCharts).toHaveBeenCalledWith(client, expect.objectContaining({ projectId: '', transit }), expect.anything());
    view.rerender(<SeaOperationChartsPanel client={client} projectId="" transit={{ ...transit, vesselId: '2' }} waypoints={[point]} charts="" onChartsChange={onChartsChange} />);
    await act(async () => resolveOld({ ...lookup, projectId: '', transit }));
    expect(onChartsChange).not.toHaveBeenCalled();
    await load();
    expect(onChartsChange).toHaveBeenCalledExactlyOnceWith('7399');
  });
  it('automatically adds identified numbers with dashes without requiring an ETA or a click', async () => {
    vi.mocked(fetchSeaOperationPointCharts).mockResolvedValue(lookup);
    const onChartsChange = vi.fn();
    render(<SeaOperationChartsPanel client={client} projectId="12" waypoints={[point]} charts="7148" onChartsChange={onChartsChange} />);
    await load();
    expect(fetchSeaOperationPointCharts).toHaveBeenCalledWith(client, { projectId: '12', pointId: 'p1', latitude: 48.36, longitude: -4.53 }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(screen.getByText('48° 21.600′ N — 004° 31.800′ W')).toBeVisible();
    expect(screen.getByRole('link', { name: '7399 · Port de Brest' })).toHaveAttribute('href', lookup.charts[0].catalogueUrl);
    expect(screen.getByText(/Échelle 1:7/)).toBeVisible();
    expect(onChartsChange).toHaveBeenCalledExactlyOnceWith('7148 - 7399');
    expect(screen.queryByRole('button', { name: /Ajouter la carte/ })).not.toBeInTheDocument();
  });
  it('keeps signed records read-only and does not duplicate retained numbers', async () => {
    vi.mocked(fetchSeaOperationPointCharts).mockResolvedValue(lookup);
    const onChartsChange = vi.fn();
    const view = render(<SeaOperationChartsPanel client={client} projectId="12" waypoints={[point]} charts="7399" onChartsChange={onChartsChange} />);
    await load();
    expect(onChartsChange).not.toHaveBeenCalled();
    view.rerender(<SeaOperationChartsPanel client={client} projectId="12" waypoints={[point]} charts="17399; 7148" onChartsChange={onChartsChange} canEdit={false} />);
    expect(screen.queryByRole('button', { name: /Ajouter la carte/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actualiser les cartes' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Actualiser les cartes' }));
    await load();
    expect(screen.getByRole('link', { name: /Port de Brest/ })).toBeVisible();
    expect(onChartsChange).not.toHaveBeenCalled();
    expect(addShomChartReferences('17399; 7399', ['7399', '0101', '7399'])).toBe('17399 - 7399 - 0101');
    expect(addShomChartReferences('Référence manuelle 17399', ['7399'])).toBe('Référence manuelle 17399 - 7399');
    expect(addShomChartReferences('', ['0101', '0101', 'wrong'])).toBe('0101');
  });
  it('merges every chart from concurrent points in waypoint order and keeps manual edits made while loading', async () => {
    let resolveFirst!: (value: SeaOperationPointCharts) => void;
    let resolveSecond!: (value: SeaOperationPointCharts) => void;
    vi.mocked(fetchSeaOperationPointCharts)
      .mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveSecond = resolve; }));
    const firstChange = vi.fn(), latestChange = vi.fn();
    const points = [point, { ...point, id: 'p2', number: '2', latitude: '48.4' }];
    const view = render(<SeaOperationChartsPanel client={client} projectId="12" waypoints={points} charts="7148" onChartsChange={firstChange} />);
    await load();
    const extraCharts = Array.from({ length: 6 }, (_, index) => ({ ...lookup.charts[0], id: String(7001 + index), number: String(7001 + index) }));
    await act(async () => resolveSecond({ ...lookup, pointId: 'p2', charts: [lookup.charts[0], ...extraCharts] }));
    expect(firstChange).not.toHaveBeenCalled();
    view.rerender(<SeaOperationChartsPanel client={client} projectId="12" waypoints={points} charts="Note manuelle; 0101; 7148" onChartsChange={latestChange} />);
    await act(async () => resolveFirst(lookup));
    expect(firstChange).not.toHaveBeenCalled();
    expect(latestChange).toHaveBeenCalledExactlyOnceWith('Note manuelle - 0101 - 7148 - 7399 - 7001 - 7002 - 7003 - 7004 - 7005 - 7006');
    expect(screen.getByText('Autres cartes à plus petite échelle (2)')).toBeInTheDocument();
    view.rerender(<SeaOperationChartsPanel client={client} projectId="12" waypoints={points} charts="Référence corrigée manuellement" onChartsChange={latestChange} />);
    expect(latestChange).toHaveBeenCalledTimes(1);
    expect(fetchSeaOperationPointCharts).toHaveBeenCalledTimes(2);
  });
  it.each(['read-only', 'inactive'] as const)('does not auto-add when a pending lookup becomes %s', async (mode) => {
    let resolveLookup!: (value: SeaOperationPointCharts) => void;
    vi.mocked(fetchSeaOperationPointCharts).mockReturnValue(new Promise((resolve) => { resolveLookup = resolve; }));
    const onChartsChange = vi.fn();
    const view = render(<SeaOperationChartsPanel client={client} projectId="12" waypoints={[point]} charts="" onChartsChange={onChartsChange} />);
    await load();
    view.rerender(<SeaOperationChartsPanel client={client} projectId="12" waypoints={[point]} charts="" onChartsChange={onChartsChange} canEdit={mode !== 'read-only'} active={mode !== 'inactive'} />);
    await act(async () => resolveLookup(lookup));
    expect(onChartsChange).not.toHaveBeenCalled();
  });
  it('does not repeat an automatic addition on refresh once the controlled field has been updated', async () => {
    vi.mocked(fetchSeaOperationPointCharts).mockResolvedValue(lookup);
    const onChartsChange = vi.fn();
    const view = render(<SeaOperationChartsPanel client={client} projectId="12" waypoints={[point]} charts="7148" onChartsChange={onChartsChange} />);
    await load();
    expect(onChartsChange).toHaveBeenCalledExactlyOnceWith('7148 - 7399');
    view.rerender(<SeaOperationChartsPanel client={client} projectId="12" waypoints={[point]} charts="7148 - 7399" onChartsChange={onChartsChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Actualiser les cartes' }));
    await load();
    expect(fetchSeaOperationPointCharts).toHaveBeenCalledTimes(2);
    expect(onChartsChange).toHaveBeenCalledTimes(1);
  });
  it('does not request missing coordinates/project or inactive Passage Plan', async () => {
    const view = render(<SeaOperationChartsPanel client={client} projectId="12" waypoints={[{ ...point, longitude: '' }]} charts="" onChartsChange={vi.fn()} />);
    await load();
    expect(fetchSeaOperationPointCharts).not.toHaveBeenCalled();
    expect(screen.getByText(/Renseignez la latitude et la longitude/)).toBeVisible();
    view.rerender(<SeaOperationChartsPanel client={client} projectId="12" waypoints={[point]} charts="" onChartsChange={vi.fn()} active={false} />);
    await load();
    expect(fetchSeaOperationPointCharts).not.toHaveBeenCalled();
    view.rerender(<SeaOperationChartsPanel client={client} projectId="" waypoints={[point]} charts="" onChartsChange={vi.fn()} />);
    expect(screen.getByText(/Sélectionnez le projet du planning/)).toBeVisible();
  });
  it.each(['project', 'coordinates', 'client'] as const)('cancels obsolete %s requests and prevents late automatic additions', async (change) => {
    let resolveOld!: (value: SeaOperationPointCharts) => void;
    vi.mocked(fetchSeaOperationPointCharts).mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; })).mockResolvedValueOnce({ ...lookup, projectId: '13', charts: [] });
    const onChartsChange = vi.fn();
    const view = render(<SeaOperationChartsPanel client={client} projectId="12" waypoints={[point]} charts="" onChartsChange={onChartsChange} />);
    await load();
    const signal = vi.mocked(fetchSeaOperationPointCharts).mock.calls[0][2]?.signal;
    view.rerender(<SeaOperationChartsPanel client={change === 'client' ? {} as SupabaseClient : client} projectId={change === 'project' ? '13' : '12'} waypoints={[change === 'coordinates' ? { ...point, longitude: '-4.6' } : point]} charts="" onChartsChange={onChartsChange} />);
    expect(signal?.aborted).toBe(true);
    await load();
    await act(async () => resolveOld(lookup));
    expect(screen.queryByRole('link', { name: /Port de Brest/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Aucune carte papier SHOM trouvée/)).toBeVisible();
    expect(onChartsChange).not.toHaveBeenCalled();
  });
  it('reports service failure distinctly from no coverage and can retry', async () => {
    vi.mocked(fetchSeaOperationPointCharts).mockRejectedValueOnce(new Error('Catalogue indisponible.')).mockResolvedValueOnce(lookup);
    render(<SeaOperationChartsPanel client={client} projectId="12" waypoints={[point]} charts="" onChartsChange={vi.fn()} />);
    await load();
    expect(screen.getByText('Catalogue indisponible.')).toBeVisible();
    expect(screen.queryByText(/Aucune carte papier/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Actualiser les cartes' }));
    await waitFor(() => expect(screen.getByRole('link', { name: /Port de Brest/ })).toBeVisible(), { timeout: 2000 });
  });
});
