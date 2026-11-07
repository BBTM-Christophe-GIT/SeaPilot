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
    const slider = screen.getByRole('slider', { name: 'Mois du graphique' });
    expect(slider).toHaveAttribute('aria-valuenow', '12');
    expect(chart.querySelector('[data-fuel-history-label="volume"]')).toHaveTextContent('Décembre 2025');
    expect(screen.queryByRole('combobox', { name: 'Mois' })).toBeNull();
    fireEvent.keyDown(slider, { key: 'Home' });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(slider).toHaveAttribute('aria-valuenow', '3');
    expect(slider).toHaveAttribute('aria-valuetext', expect.stringMatching(/Mars 2025.*220\sL.*225,00\s€ HT.*partiel/));
    expect(chart.querySelector('[data-fuel-history-label="volume"]')).toHaveTextContent(/Mars 2025\s*220 L/);
    expect(chart.querySelector('[data-fuel-history-label="cost"]')).toHaveTextContent(/Mars 2025\s*225,00 € HT · partiel/);
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
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', expect.stringContaining('Coût cumulé indisponible'));
    fireEvent.click(screen.getByText('Données mensuelles'));
    expect(within(screen.getByRole('table')).getByRole('row', { name: /^février/i })).toHaveTextContent(/0 L.*0,00 € HT.*—/);
  });

  it('converts the volume scale, selected value, coverage and table to cubic metres', () => {
    render(<SeaOperationFleetFuelHistory {...props} volumeUnit="m³" />);
    const chart = screen.getByRole('img');
    expect(chart).toHaveTextContent('Consommation cumulée (m³)');
    expect(chart).toHaveTextContent('0,1');
    expect(chart.querySelector('[data-fuel-history-label="volume"]')).toHaveTextContent('0,22 m³');
    expect(screen.getByText(/0,04 m³ sans prix applicable/)).toBeVisible();
    fireEvent.click(screen.getByText('Données mensuelles'));
    expect(within(screen.getByRole('table')).getByRole('row', { name: /^mars/i })).toHaveTextContent(/0,08 m³.*0,22 m³/);
  });

  it('shows invoice-only history and identifies billed costs in the plot, table and PNG', async () => {
    const blob = new Blob(['png'], { type: 'image/png' });
    vi.mocked(buildSeaOperationFleetFuelHistoryPng).mockResolvedValue(blob);
    vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: () => 'blob:fuel-history', revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<SeaOperationFleetFuelHistory {...props} vesselName="GOURY" costSource="billing" months={[
      { month: 2, liters: null, costEuros: 0, unpricedLiters: 0 },
      { month: 4, liters: null, costEuros: 1000, unpricedLiters: 0 },
    ]} />);
    const chart = screen.getByRole('img', { name: 'Consommation cumulée et coût cumulé facturé' });
    expect(chart).toHaveTextContent('Consommation indisponible');
    expect(chart.querySelector('[data-fuel-history-label="cost"]')).toHaveTextContent(/Décembre 2025\s*1\s000,00 € HT/);
    expect(screen.getByText('Coût HT · Projet → Facturation · Fuel')).toBeVisible();
    expect(screen.queryByText(/sans prix applicable/)).toBeNull();
    fireEvent.click(screen.getByText('Données mensuelles'));
    const table = within(screen.getByRole('table'));
    expect(table.getByRole('columnheader', { name: 'Coût facturé du mois' })).toBeVisible();
    expect(table.getByRole('row', { name: /^février/i })).toHaveTextContent(/—.*0,00 € HT/);
    expect(table.getByRole('row', { name: /^mai/i })).toHaveTextContent(/—.*1\s000,00 € HT/);
    fireEvent.click(screen.getByRole('button', { name: 'Exporter le graphique en PNG' }));
    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(buildSeaOperationFleetFuelHistoryPng).toHaveBeenCalledWith(chart, expect.objectContaining({
      vesselName: 'GOURY', costSourceLabel: 'Coût HT · Projet → Facturation · Fuel',
    }));
  });

  it('marks the current month to date and leaves future months out of the detail table', () => {
    vi.setSystemTime(new Date('2026-11-06T23:30:00Z'));
    render(<SeaOperationFleetFuelHistory {...props} year={2026} />);
    expect(screen.getByText(/Mois en cours au 07\/11\/2026/)).toBeVisible();
    const slider = screen.getByRole('slider', { name: 'Mois du graphique' });
    expect(slider).toHaveAttribute('aria-valuenow', '11');
    expect(slider).toHaveAttribute('aria-valuemax', '11');
    expect(screen.getByRole('img').querySelector('[data-fuel-history-label="volume"]')).toHaveTextContent('7 nov. 2026');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(slider).toHaveAttribute('aria-valuenow', '11');
    vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 0, 760, 350));
    fireEvent.click(slider, { clientX: 100 + 54 + (760 - 21 - 54) * 2 / 11 });
    expect(slider).toHaveAttribute('aria-valuenow', '3');
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
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Mois du graphique' }), { key: 'Home' });
    fireEvent.click(screen.getByRole('button', { name: 'Exporter le graphique en PNG' }));
    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    const chart = screen.getByRole('img');
    expect(buildSeaOperationFleetFuelHistoryPng).toHaveBeenCalledWith(chart, expect.objectContaining({
      vesselName: 'LE ROZEL', year: 2025,
    }));
    expect(chart.querySelector('[data-fuel-history-label="volume"]')).toHaveTextContent(/Janvier 2025\s*100 L/);
    expect(chart.querySelector('[data-fuel-history-label="cost"]')).toHaveTextContent(/Janvier 2025\s*125,00 € HT/);
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
