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

function Harness({
  onSubmit = vi.fn(),
  requestSignature = false,
}: {
  onSubmit?: (phases: WorkingTimePhaseInput[], intent: 'save' | 'request-signature' | 'validate') => void;
  requestSignature?: boolean;
}) {
  const [startsAt, setStartsAt] = useState('2026-08-03T08:00');
  const [endsAt, setEndsAt] = useState('2026-08-03T12:00');
  const [pendingPhases, setPendingPhases] = useState<WorkingTimePhaseInput[]>([]);
  const [captainPersonId, setCaptainPersonId] = useState<number | null>(null);
  return (
    <WorkingTimeEntryBoard
      captainCandidates={requestSignature ? [{ personId: 10, firstName: 'Camille', lastName: 'CAPITAINE', name: 'Camille CAPITAINE' }] : []}
      canEdit
      client={{} as SupabaseClient}
      comment=""
      editingIntervalId={null}
      endsAt={endsAt}
      intervals={[]}
      isSaving={false}
      onCancelEdit={vi.fn()}
      onCaptainPersonIdChange={setCaptainPersonId}
      onCommentChange={vi.fn()}
      onEndsAtChange={setEndsAt}
      onPendingPhasesChange={setPendingPhases}
      onStartsAtChange={setStartsAt}
      onSubmit={onSubmit}
      periodEnd="2026-08-09"
      periodStart="2026-08-03"
      personId={42}
      pendingPhases={pendingPhases}
      planningVesselId={7}
      selectedCaptainPersonId={captainPersonId}
      showRequestSignature={requestSignature}
      planningWatchGroup="Bordée 1"
      startsAt={startsAt}
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
    expect(screen.getByText('00h')).toBeInTheDocument();
    expect(screen.getByText('23h')).toBeInTheDocument();
    await waitFor(() => expect(fetchWorkingTimePhasesRecommendation).toHaveBeenCalled());
    expect(await screen.findByText('4 h 00', { selector: '.working-time-analysis-bar dd' })).toBeInTheDocument();
    expect(screen.getByText('Conformité repos')).toBeInTheDocument();
    expect(screen.getByText('Conforme', { selector: '.working-time-analysis-bar dd' })).toBeInTheDocument();
  });

  it('supports day navigation and keyboard slot selection', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const dayTabs = screen.getAllByRole('tab');
    await user.click(dayTabs[1]);
    expect(dayTabs[1]).toHaveAttribute('aria-selected', 'true');

    const cells = screen.getAllByRole('gridcell');
    cells[12].focus();
    await user.keyboard('{Enter}');
    expect(screen.getByText('06:00–06:30')).toBeInTheDocument();
  });

  it('selects a continuous interval by pointer drag', () => {
    render(<Harness />);
    const cells = screen.getAllByRole('gridcell');

    fireEvent.pointerDown(cells[16]);
    fireEvent.pointerEnter(cells[19]);
    fireEvent.pointerUp(cells[19]);

    expect(screen.getByText('08:00–10:00')).toBeInTheDocument();
  });

  it('removes manual planning fields and keeps draft submission available', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    expect(screen.queryByLabelText('Début du travail')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Filtrer et affecter le navire')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Filtrer et affecter la bordée')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
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

    expect(screen.getByText('Période 1')).toBeInTheDocument();
    expect(screen.getByText('Période 2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));

    expect(onSubmit).toHaveBeenCalledWith([
      { startsAt: '2026-08-03T08:00', endsAt: '2026-08-03T12:00' },
      { startsAt: '2026-08-03T14:00', endsAt: '2026-08-03T16:00' },
    ], 'save');
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

    expect(screen.getByText('Période 1')).toBeInTheDocument();
    expect(screen.getByText('08:00–12:00')).toBeInTheDocument();
  });

  it('lets a Marin select a same-watch Capitaine and request their signature', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} requestSignature />);
    const cells = screen.getAllByRole('gridcell');

    fireEvent.pointerDown(cells[16]);
    fireEvent.pointerEnter(cells[17]);
    fireEvent.pointerUp(cells[17]);
    await user.selectOptions(screen.getByRole('combobox'), '10');
    await user.click(screen.getByRole('button', { name: /Demander la signature/ }));

    expect(onSubmit).toHaveBeenCalledWith(
      [{ startsAt: '2026-08-03T08:00', endsAt: '2026-08-03T09:00' }],
      'request-signature',
    );
  });

  it('makes the comment mandatory when the server detects an alert', async () => {
    vi.mocked(fetchWorkingTimePhasesRecommendation).mockResolvedValue({
      ...recommendation,
      status: 'alerte',
      violationCodes: ['work_24h'],
    });
    render(<Harness />);
    const cells = screen.getAllByRole('gridcell');

    fireEvent.pointerDown(cells[16]);
    fireEvent.pointerUp(cells[16]);

    await waitFor(() => expect(screen.getByRole('textbox')).toBeRequired());
  });

  it('clears all pending periods without keeping the last active range', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const cells = screen.getAllByRole('gridcell');

    fireEvent.pointerDown(cells[12]);
    fireEvent.pointerUp(cells[12]);
    await user.click(screen.getByRole('button', { name: 'Retirer la période 1' }));

    expect(screen.queryByText('Période 1')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer le brouillon' })).toBeDisabled();
  });
});
