import type { SupabaseClient } from '@supabase/supabase-js';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWorkingTimePhasesRecommendation, type WorkingTimePhaseInput } from './workingTimeQueries';
import { WorkingTimeEntryBoard } from './WorkingTimeEntryBoard';

vi.mock('./workingTimeQueries', async (importOriginal) => {
  const original = await importOriginal<typeof import('./workingTimeQueries')>();
  return { ...original, fetchWorkingTimePhasesRecommendation: vi.fn() };
});

const recommendation = {
  status: 'conforme' as const,
  policyId: 5,
  policyName: 'Politique datée',
  alreadyNonCompliant: false,
  available24hSeconds: 14400,
  available7dSeconds: 180000,
  work24hSeconds: 28800,
  work7dSeconds: 79200,
  rest24hSeconds: 57600,
  longestRest24hSeconds: 43200,
  restImpactSeconds: -14400,
  consecutiveRestImpactSeconds: -3600,
  maxAdditionalSeconds: 14400,
  latestEndAt: '2026-08-03T16:00:00Z',
  nextResumeAt: '2026-08-03T22:00:00Z',
  violationCodes: [],
};

function Harness({ onSubmit = vi.fn() }: { onSubmit?: (phases: WorkingTimePhaseInput[]) => void }) {
  const [startsAt, setStartsAt] = useState('2026-08-03T08:00');
  const [endsAt, setEndsAt] = useState('2026-08-03T12:00');
  const [pendingPhases, setPendingPhases] = useState<WorkingTimePhaseInput[]>([]);
  return (
    <WorkingTimeEntryBoard
      canEdit
      client={{} as SupabaseClient}
      comment=""
      editingIntervalId={null}
      endsAt={endsAt}
      intervals={[]}
      isSaving={false}
      onCancelEdit={vi.fn()}
      onCommentChange={vi.fn()}
      onEndsAtChange={setEndsAt}
      onPendingPhasesChange={setPendingPhases}
      onStartsAtChange={setStartsAt}
      onSubmit={onSubmit}
      onVesselIdChange={vi.fn()}
      onWatchGroupChange={vi.fn()}
      periodEnd="2026-08-09"
      periodStart="2026-08-03"
      personId={42}
      pendingPhases={pendingPhases}
      startsAt={startsAt}
      vesselId="7"
      vessels={[{ id: 7, name: 'Navire Test', acronym: 'NT' }]}
      watchGroup="Bordée 1"
    />
  );
}

describe('WorkingTimeEntryBoard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchWorkingTimePhasesRecommendation).mockResolvedValue(recommendation);
  });

  it('shows authoritative quota guidance and all 48 half-hour cells', async () => {
    render(<Harness />);

    expect(screen.getAllByRole('gridcell')).toHaveLength(48);
    await waitFor(() => expect(fetchWorkingTimePhasesRecommendation).toHaveBeenCalled());
    expect(await screen.findByText('4 h 00', { selector: '.working-time-guidance-summary > strong' })).toBeInTheDocument();
    expect(screen.getByText('Politique datée')).toBeInTheDocument();
    expect(screen.getByText('Aucun écart détecté')).toBeInTheDocument();
  });

  it('supports day navigation and keyboard slot selection', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const dayTabs = screen.getAllByRole('tab');
    await user.click(dayTabs[1]);
    expect(screen.getByLabelText('Début du travail')).toHaveValue('2026-08-04T08:00');

    const cells = screen.getAllByRole('gridcell');
    cells[12].focus();
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('Début du travail')).toHaveValue('2026-08-04T06:00');
    expect(screen.getByLabelText('Fin du travail')).toHaveValue('2026-08-04T06:30');
  });

  it('selects a continuous interval by pointer drag', () => {
    render(<Harness />);
    const cells = screen.getAllByRole('gridcell');

    fireEvent.pointerDown(cells[16]);
    fireEvent.pointerEnter(cells[19]);
    fireEvent.pointerUp(cells[19]);

    expect(screen.getByLabelText('Début du travail')).toHaveValue('2026-08-03T08:00');
    expect(screen.getByLabelText('Fin du travail')).toHaveValue('2026-08-03T10:00');
    expect(screen.getByText('1 période prête')).toBeInTheDocument();
  });

  it('keeps manual start/end entry and draft submission available', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    await user.clear(screen.getByLabelText('Début du travail'));
    await user.type(screen.getByLabelText('Début du travail'), '2026-08-03T09:00');
    await user.click(screen.getByRole('button', { name: 'Enregistrer la sélection · 1 période' }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('adds multiple disjoint pointer selections and submits them in one action', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const cells = screen.getAllByRole('gridcell');

    fireEvent.pointerDown(cells[16]);
    fireEvent.pointerEnter(cells[23]);
    fireEvent.pointerUp(cells[23]);
    fireEvent.pointerDown(cells[28]);
    fireEvent.pointerEnter(cells[31]);
    fireEvent.pointerUp(cells[31]);

    expect(screen.queryByRole('button', { name: 'Conserver cette phase' })).not.toBeInTheDocument();
    expect(screen.getByText('2 périodes prêtes')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enregistrer la sélection · 2 périodes' }));

    expect(onSubmit).toHaveBeenCalledWith([
      { startsAt: '2026-08-03T08:00', endsAt: '2026-08-03T12:00' },
      { startsAt: '2026-08-03T14:00', endsAt: '2026-08-03T16:00' },
    ]);
  });

  it('merges adjacent pointer selections into one continuous period', () => {
    render(<Harness />);
    const cells = screen.getAllByRole('gridcell');

    fireEvent.pointerDown(cells[16]);
    fireEvent.pointerEnter(cells[19]);
    fireEvent.pointerUp(cells[19]);
    fireEvent.pointerDown(cells[20]);
    fireEvent.pointerEnter(cells[23]);
    fireEvent.pointerUp(cells[23]);

    expect(screen.getByText('1 période prête')).toBeInTheDocument();
    expect(screen.getByText('08:00–12:00')).toBeInTheDocument();
  });

  it('clears all pending periods without keeping the last active range', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const cells = screen.getAllByRole('gridcell');

    fireEvent.pointerDown(cells[12]);
    fireEvent.pointerUp(cells[12]);
    await user.click(screen.getByRole('button', { name: 'Effacer la sélection' }));

    expect(screen.queryByText('1 période prête')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer la sélection · 0 période' })).toBeDisabled();
  });
});
