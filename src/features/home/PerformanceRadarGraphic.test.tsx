import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PerformanceRadarGraphic, type RadarAxis } from './PerformanceRadarGraphic';

const axes: RadarAxis[] = [
  { key: 'medical', label: 'Conformité médicale', shortLabel: 'Médical', score: 100 },
  { key: 'certificates', label: 'Brevets et certificats', shortLabel: 'Certificats', score: 75 },
  { key: 'planning', label: 'Réservations de formation et de visites médicales', shortLabel: 'Planification', score: 50 },
  { key: 'interviews', label: 'Entretiens accessibles', shortLabel: 'Entretiens', score: 25 },
];

describe('generic performance radar graphic', () => {
  it('draws actual criteria as a polygon, exposes exact text values and supports accessible axis selection', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<PerformanceRadarGraphic axes={axes} onSelect={onSelect} selectedKey="medical" title="Détail RH" />);
    expect(screen.getByRole('img')).toHaveAccessibleName(/Détail RH.*Conformité médicale : 100 %/);
    expect(container.querySelector('.performance-radar-area')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Détailler Conformité médicale' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Détailler Réservations de formation et de visites médicales' }));
    expect(onSelect).toHaveBeenCalledWith('planning');
    await user.click(screen.getByText('Consulter les valeurs du graphique'));
    expect(screen.getByRole('table')).toBeVisible();
    expect(screen.getByRole('row', { name: 'Brevets et certificats 75 %' })).toBeVisible();
  });

  it('keeps unknown values as gaps and distinguishes them from a measured zero', () => {
    const { container } = render(<PerformanceRadarGraphic axes={[...axes.slice(0, 2), { ...axes[2], score: null }, { ...axes[3], score: 0 }]} />);
    expect(screen.getByText(/1 valeur non notée/)).toBeVisible();
    expect(container.querySelector('[data-axis-key="planning"]')).toBeNull();
    expect(container.querySelector('[data-axis-key="interviews"]')).not.toBeNull();
    expect(container.querySelector('.performance-radar-area')).toBeNull();
    expect(screen.getByRole('img')).toHaveAccessibleName(/indisponible \(non noté\).*Entretiens accessibles : 0 %/);
  });

  it('aligns distinct comparison series on the same axes and ignores the axes’ default scores', async () => {
    const user = userEvent.setup();
    const { container } = render(<PerformanceRadarGraphic axes={axes} series={[
      { key: 'vessel-a', label: 'Navire A', values: { medical: 40, certificates: 80, planning: null, interviews: 20 } },
      { key: 'vessel-b', label: 'Navire B', values: { medical: 90, certificates: 60, planning: 30, interviews: 70 } },
    ]} />);
    const series = container.querySelectorAll('.performance-radar-series');
    expect(series).toHaveLength(2);
    expect(series[0].getAttribute('style')).not.toBe(series[1].getAttribute('style'));
    expect(series[0].querySelector('[data-axis-key="planning"]')).toBeNull();
    expect(series[1].querySelector('[data-axis-key="planning"]')).not.toBeNull();
    await user.click(screen.getByText('Consulter les valeurs du graphique'));
    expect(screen.getByRole('row', { name: 'Conformité médicale 40 % 90 %' })).toBeVisible();
    expect(screen.getByRole('row', { name: 'Réservations de formation et de visites médicales Non noté 30 %' })).toBeVisible();
    expect(screen.getByRole('list', { name: 'Légende du radar' })).toHaveTextContent('Navire A');
    expect(screen.getByRole('list', { name: 'Légende du radar' })).toHaveTextContent('Navire B');
  });

  it('renders one criterion on a real 0–100 scale without adding dummy axes or a polygon', () => {
    const { container } = render(<PerformanceRadarGraphic axes={[axes[0]]} />);
    expect(container.querySelectorAll('.performance-radar-point')).toHaveLength(1);
    expect(container.querySelector('.performance-radar-line')).toBeNull();
    expect(container.querySelector('.performance-radar-area')).toBeNull();
    expect(screen.getByText(/Un critère : chaque échelle va de 0 à 100/)).toBeVisible();
  });

  it('connects two known criteria per entity and leaves a missing second value disconnected', () => {
    const { container } = render(<PerformanceRadarGraphic axes={axes.slice(0, 2)} series={[
      { key: 'a', label: 'Équipe A', values: { medical: 90, certificates: 20 } },
      { key: 'b', label: 'Équipe B', values: { medical: 40, certificates: null } },
    ]} />);
    const series = container.querySelectorAll('.performance-radar-series');
    expect(series[0].querySelectorAll('.performance-radar-line')).toHaveLength(1);
    expect(series[1].querySelectorAll('.performance-radar-line')).toHaveLength(0);
    expect(container.querySelectorAll('.performance-radar-point')).toHaveLength(3);
    expect(container.querySelector('.performance-radar-area')).toBeNull();
    expect(screen.getByText(/Deux critères : chaque échelle/)).toBeVisible();
  });

  it('shows an explicit empty comparison without falling back to a global score', () => {
    const { container } = render(<PerformanceRadarGraphic axes={axes} series={[]} />);
    expect(screen.getByText('Sélectionnez au moins une entité à comparer.')).toBeVisible();
    expect(container.querySelector('.performance-radar-series')).toBeNull();
  });

  it('handles an empty authorized axis set and invalid numeric evidence without inventing compliance', () => {
    const { rerender, container } = render(<PerformanceRadarGraphic axes={[]} />);
    expect(screen.getByText('Aucun indicateur accessible pour ce périmètre.')).toBeVisible();
    rerender(<PerformanceRadarGraphic axes={[{ ...axes[0], score: Number.NaN }]} />);
    expect(container.querySelector('.performance-radar-point')).toBeNull();
    expect(screen.getByText(/1 valeur non notée/)).toBeVisible();
  });
});
