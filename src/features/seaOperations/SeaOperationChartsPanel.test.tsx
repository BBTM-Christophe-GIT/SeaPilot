import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SeaOperationChartsPanel } from './SeaOperationChartsPanel';
import { fetchSeaOperationPointCharts, type SeaOperationPointCharts } from './seaOperationChartQueries';
import { emptySeaOperationWaypoint } from './seaOperationModel';
import { addShomChartReference } from './seaOperationHydroModel';

vi.mock('./seaOperationChartQueries', () => ({ fetchSeaOperationPointCharts: vi.fn() }));
const client = {} as SupabaseClient;
const point = { ...emptySeaOperationWaypoint('p1'), number: '1', latitude: '48°21.6 N', longitude: '4°31.8 W', eta: '' };
const lookup: SeaOperationPointCharts = { projectId: '12', pointId: 'p1', latitude: 48.36, longitude: -4.53,
  fetchedAt: '2026-10-23T00:00:00Z', sourceUrl: 'https://services.data.shom.fr/INSPIRE/wfs', truncated: false,
  charts: [{ id: '7399', number: '7399', title: 'Port de Brest', scale: 7500, catalogueUrl: 'https://diffusion.shom.fr/catalogsearch/result/?q=7399' }] };
const load = () => act(() => new Promise((resolve) => setTimeout(resolve, 750)));
beforeEach(() => vi.clearAllMocks());

describe('SHOM charts in Passage Plan', () => {
  it('finds charts from parsed WGS84 coordinates without requiring an ETA and explicitly adds a number', async () => {
    vi.mocked(fetchSeaOperationPointCharts).mockResolvedValue(lookup);
    const onChartsChange = vi.fn();
    render(<SeaOperationChartsPanel client={client} projectId="12" waypoints={[point]} charts="7148" onChartsChange={onChartsChange} />);
    await load();
    expect(fetchSeaOperationPointCharts).toHaveBeenCalledWith(client, { projectId: '12', pointId: 'p1', latitude: 48.36, longitude: -4.53 }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(screen.getByRole('link', { name: '7399 · Port de Brest' })).toHaveAttribute('href', lookup.charts[0].catalogueUrl);
    expect(screen.getByText(/Échelle 1:7/)).toBeVisible();
    expect(onChartsChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la carte 7399 à la fiche' }));
    expect(onChartsChange).toHaveBeenCalledWith('7148; 7399');
  });
  it('keeps signed records read-only and does not duplicate retained numbers', async () => {
    vi.mocked(fetchSeaOperationPointCharts).mockResolvedValue(lookup);
    const view = render(<SeaOperationChartsPanel client={client} projectId="12" waypoints={[point]} charts="7399" onChartsChange={vi.fn()} />);
    await load();
    expect(screen.getByRole('button', { name: 'Ajouter la carte 7399 à la fiche' })).toBeDisabled();
    view.rerender(<SeaOperationChartsPanel client={client} projectId="12" waypoints={[point]} charts="7399" onChartsChange={vi.fn()} canEdit={false} />);
    expect(screen.queryByRole('button', { name: /Ajouter la carte/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actualiser les cartes' })).toBeEnabled();
    expect(addShomChartReference('17399; 7399', '7399')).toBe('17399; 7399');
    expect(addShomChartReference('17399', '7399')).toBe('17399; 7399');
    expect(addShomChartReference('', '0101')).toBe('0101');
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
  it('cancels old project/coordinate requests and suppresses their late results', async () => {
    let resolveOld!: (value: SeaOperationPointCharts) => void;
    vi.mocked(fetchSeaOperationPointCharts).mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; })).mockResolvedValueOnce({ ...lookup, projectId: '13', charts: [] });
    const view = render(<SeaOperationChartsPanel client={client} projectId="12" waypoints={[point]} charts="" onChartsChange={vi.fn()} />);
    await load();
    const signal = vi.mocked(fetchSeaOperationPointCharts).mock.calls[0][2]?.signal;
    view.rerender(<SeaOperationChartsPanel client={client} projectId="13" waypoints={[point]} charts="" onChartsChange={vi.fn()} />);
    expect(signal?.aborted).toBe(true);
    await load();
    await act(async () => resolveOld(lookup));
    expect(screen.queryByRole('link', { name: /Port de Brest/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Aucune carte papier SHOM trouvée/)).toBeVisible();
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
