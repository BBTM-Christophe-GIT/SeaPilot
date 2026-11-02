import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ExerciseCrewPresence } from './ExerciseCrewPresence';
import { ProcessPerformancePanel } from './ProcessPerformanceRadar';
import type { ExerciseCrewPresenceData, ProcessPerformance } from './processPerformance';

function presence(overrides: Partial<ExerciseCrewPresenceData> = {}): ExerciseCrewPresenceData {
  return { year: 2026, asOf: '2026-11-02', vessels: [{ id: 1, name: 'GOURY' }],
    days: [{ vesselId: 1, on: '2026-11-02', count: 4 }, { vesselId: 1, on: '2026-10-31', count: 2 }, { vesselId: 1, on: '2026-11-03', count: 4 }],
    months: [{ vesselId: 1, month: 11, people: 8, presenceDays: 120 }, { vesselId: 1, month: 10, people: 6, presenceDays: 93 }],
    bonusTbt: 17, ...overrides };
}

function vesselRow(name: string): HTMLElement {
  return within(screen.getByRole('list', { name: 'Présence par navire' })).getAllByRole('listitem').find((row) => within(row).queryByText(name))!;
}

describe('exercise crew planning presence', () => {
  it('distinguishes eight distinct monthly assignments from four people present on one day', () => {
    render(<ExerciseCrewPresence data={presence()} />);
    const row = vesselRow('GOURY');
    expect(screen.getByLabelText('Date de présence')).toHaveValue('2026-11-02');
    expect(within(row).getByText('Présents le 2 nov.')).toBeVisible();
    expect(within(row).getByText('4')).toBeVisible();
    expect(within(row).getByText('8')).toBeVisible();
    expect(within(row).getByText('120')).toBeVisible();
    expect(within(row).getByText('personnes distinctes')).toBeVisible();
    expect(screen.getByText(/Les bordées se relaient/)).toBeVisible();
  });

  it('updates daily presence and monthly totals when the selected date changes month', () => {
    render(<ExerciseCrewPresence data={presence()} />);
    fireEvent.change(screen.getByLabelText('Date de présence'), { target: { value: '2026-10-31' } });
    const row = vesselRow('GOURY');
    expect(within(row).getByText('Présents le 31 oct.')).toBeVisible();
    expect(within(row).getByText('Affectés en octobre')).toBeVisible();
    for (const value of ['2', '6', '93']) expect(within(row).getByText(value)).toBeVisible();
    expect(within(row).queryByText('8')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows an explicit measured zero and keeps an absent day or month as unknown', () => {
    render(<ExerciseCrewPresence data={presence({ vessels: [{ id: 1, name: 'GOURY' }, { id: 2, name: 'LANDEMER' }],
      days: [{ vesselId: 1, on: '2026-11-02', count: 0 }], months: [{ vesselId: 1, month: 11, people: 0, presenceDays: 0 }] })} />);
    expect(within(vesselRow('GOURY')).getAllByText('0')).toHaveLength(3);
    expect(within(vesselRow('LANDEMER')).getAllByText('Non renseigné')).toHaveLength(3);
    expect(within(vesselRow('LANDEMER')).queryByText('0')).toBeNull();
  });

  it('labels TBT as individual bonus participations outside the mandatory score', () => {
    render(<ExerciseCrewPresence data={presence()} />);
    expect(screen.getByText('17 participations TBT')).toBeVisible();
    expect(screen.getByText(/en 2026 · en complément, hors score obligatoire/)).toBeVisible();
    expect(screen.queryByText('17 exercices TBT')).toBeNull();
  });

  it('marks future planning as a forecast and limits selection to the current month end', () => {
    render(<ExerciseCrewPresence data={presence()} />);
    const input = screen.getByLabelText('Date de présence');
    expect(input).toHaveAttribute('min', '2026-01-01');
    expect(input).toHaveAttribute('max', '2026-11-30');
    fireEvent.change(input, { target: { value: '2026-11-03' } });
    expect(screen.getByRole('status')).toHaveTextContent('Prévision du planning au 3 nov.');
    expect(screen.getByRole('status')).toHaveTextContent('données arrêtées au 2 nov.');
    fireEvent.change(input, { target: { value: '2026-12-01' } });
    expect(input).toHaveValue('2026-11-02');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('starts a historical campaign on December 31 and permits the full historical year', () => {
    render(<ExerciseCrewPresence data={presence({ year: 2025 })} />);
    expect(screen.getByLabelText('Date de présence')).toHaveValue('2025-12-31');
    expect(screen.getByLabelText('Date de présence')).toHaveAttribute('min', '2025-01-01');
    expect(screen.getByLabelText('Date de présence')).toHaveAttribute('max', '2025-12-31');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('uses fleet length ordering and keeps yards and offices after vessels', () => {
    render(<ExerciseCrewPresence data={presence({ vessels: [
      { id: 3, name: 'Bureau - Cherbourg' }, { id: 2, name: 'LANDEMER' },
      { id: 4, name: 'YARD - Le Havre' }, { id: 1, name: 'GOURY' }, { id: 5, name: 'Bateau inconnu' },
    ] })} />);
    const names = within(screen.getByRole('list', { name: 'Présence par navire' })).getAllByRole('listitem').map((row) => row.querySelector('.exercise-crew-presence-name')?.textContent);
    expect(names).toEqual(['GOURY', 'LANDEMER', 'Bateau inconnu', 'YARD - Le Havre', 'Bureau - Cherbourg']);
  });

  it('keeps the planning explanation in the score detail and hides it during unit comparison', async () => {
    const user = userEvent.setup();
    const process: ProcessPerformance = { key: 'emergencyExercises', label: 'Exercices d’urgence', shortLabel: 'Exercices', to: '/modules/emergencyExercises',
      score: 0, summary: 'Objectifs incendie et abandon', criteria: [], tasks: [], unavailableSources: [], exercisePresence: presence() };
    render(<MemoryRouter><ProcessPerformancePanel processes={[process]} today="2026-11-02"
      entities={[{ id: 1, name: 'GOURY', assetKind: 'vessel', processes: [process] }]} /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Présence au planning' })).toBeVisible();
    await user.click(within(screen.getByRole('group', { name: 'Sélectionner un processus' })).getByRole('button', { name: /Exercices d’urgence/ }));
    expect(screen.getByRole('heading', { name: 'Présence au planning' })).toBeVisible();
    expect(screen.getByRole('group', { name: 'Composition du score Exercices d’urgence' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Comparer les unités' }));
    expect(screen.queryByRole('heading', { name: 'Présence au planning' })).toBeNull();
  });
});
