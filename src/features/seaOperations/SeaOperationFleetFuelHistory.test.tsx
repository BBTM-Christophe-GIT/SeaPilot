import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SeaOperationFleetFuelHistory, type SeaOperationFleetFuelHistoryMonth } from './SeaOperationFleetFuelHistory';
import { buildSeaOperationFleetFuelHistoryPng } from './seaOperationFleetFuelHistoryImage';

vi.mock('./seaOperationFleetFuelHistoryImage', () => ({ buildSeaOperationFleetFuelHistoryPng: vi.fn() }));

const months: SeaOperationFleetFuelHistoryMonth[] = [
  { month: 1, liters: 100, costEuros: 125, unpricedLiters: 0 },
  { month: 2, liters: 40, costEuros: null, unpricedLiters: 40 },
  { month: 3, liters: 80, costEuros: 100, unpricedLiters: 0 },
  { month: 5, liters: 0, costEuros: 0, unpricedLiters: 0 },
];
const props = { vesselName: 'LE ROZEL', year: 2025, years: [2025, 2024], months, loading: false, onRetry: vi.fn(), onYearChange: vi.fn() };

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('annual vessel fuel chart', () => {
  it('shows independently scaled volume and cumulative partial cost with monthly detail', () => {
    render(<SeaOperationFleetFuelHistory {...props} />);
    const chart = screen.getByRole('img', { name: 'Consommation cumulée et coût cumulé estimé' });
    expect(chart).toHaveTextContent('Consommation cumulée (L)');
    expect(chart).toHaveTextContent('Coût cumulé estimé (€ HT)');
    expect(chart.querySelector('line[stroke-dasharray]')).not.toBeNull();
    expect(screen.getByText(/40 L sans prix applicable/)).toBeVisible();
    fireEvent.change(screen.getByRole('combobox', { name: 'Mois' }), { target: { value: '3' } });
    const month = within(screen.getByRole('group', { name: 'Lecture du mois' }));
    expect(month.getByText('220 L')).toBeVisible();
    expect(month.getByText('225,00 € HT', { exact: false })).toBeVisible();
    fireEvent.click(screen.getByText('Données mensuelles'));
    const table = screen.getByRole('table');
    expect(within(table).getByRole('row', { name: /^février/i })).toHaveTextContent(/40 L.*125,00 € HT.*partiel/i);
    expect(within(table).getByRole('row', { name: /^avril/i })).toHaveTextContent(/—.*220 L.*—.*225,00 € HT.*partiel/i);
    expect(within(table).getByRole('row', { name: /^mai/i })).toHaveTextContent(/0 L.*225,00 € HT.*partiel/i);
  });

  it('keeps fully unpriced consumption visible without claiming a zero cumulative cost', () => {
    render(<SeaOperationFleetFuelHistory {...props} months={[
      { month: 1, liters: 100, costEuros: null, unpricedLiters: 100 },
      { month: 2, liters: 0, costEuros: 0, unpricedLiters: 0 },
    ]} />);
    expect(screen.getByText(/100 L sans prix applicable/)).toBeVisible();
    expect(screen.getByRole('img')).toHaveTextContent('Coût indisponible');
    fireEvent.click(screen.getByText('Données mensuelles'));
    expect(within(screen.getByRole('table')).getByRole('row', { name: /^février/i })).toHaveTextContent(/0 L.*0,00 € HT.*—/);
  });

  it('marks the current month to date and leaves future months out of the detail table', () => {
    vi.setSystemTime(new Date('2026-11-07T15:00:00Z'));
    render(<SeaOperationFleetFuelHistory {...props} year={2026} />);
    expect(screen.getByText(/Mois en cours au 07\/11\/2026/)).toBeVisible();
    fireEvent.click(screen.getByText('Données mensuelles'));
    const table = screen.getByRole('table');
    expect(within(table).getByRole('row', { name: /^novembre/i })).toHaveTextContent('En cours');
    expect(within(table).queryByRole('row', { name: /^décembre/i })).toBeNull();
  });

  it('selects the year and exports the current vessel chart as PNG', async () => {
    const blob = new Blob(['png'], { type: 'image/png' });
    vi.mocked(buildSeaOperationFleetFuelHistoryPng).mockResolvedValue(blob);
    const url = vi.fn(() => 'blob:fuel-history');
    vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: url, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<SeaOperationFleetFuelHistory {...props} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Année' }), { target: { value: '2024' } });
    expect(props.onYearChange).toHaveBeenCalledWith(2024);
    fireEvent.click(screen.getByRole('button', { name: 'Exporter le graphique en PNG' }));
    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(buildSeaOperationFleetFuelHistoryPng).toHaveBeenCalledWith(screen.getByRole('img'), expect.objectContaining({
      vesselName: 'LE ROZEL', year: 2025,
    }));
    expect(url).toHaveBeenCalledWith(blob);
    expect(click.mock.contexts[0]).toHaveAttribute('download', 'Carburant - LE ROZEL - 2025.png');
  });

  it('shows the empty, loading and error states without exporting a stale chart', () => {
    const { rerender } = render(<SeaOperationFleetFuelHistory {...props} months={[]} />);
    const download = () => screen.getByRole('button', { name: 'Exporter le graphique en PNG' });
    expect(screen.getByText('Aucune consommation renseignée pour cette année.')).toBeVisible();
    expect(download()).toBeDisabled();
    rerender(<SeaOperationFleetFuelHistory {...props} loading />);
    expect(screen.getByRole('status')).toHaveTextContent('Chargement de l’historique…');
    expect(download()).toBeDisabled();
    rerender(<SeaOperationFleetFuelHistory {...props} error />);
    expect(screen.getByRole('alert')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(props.onRetry).toHaveBeenCalledOnce();
    expect(download()).toBeDisabled();
  });
});
