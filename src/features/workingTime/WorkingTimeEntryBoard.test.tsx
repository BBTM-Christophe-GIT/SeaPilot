import { deferred } from './workingTimeTestHelpers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWorkingTimePhasesRecommendation, type WorkingTimePhaseInput } from './workingTimeQueries';
import { WorkingTimeEntryBoard } from './WorkingTimeEntryBoard';
import type { WorkingTimeInterval } from './workingTimeModel';

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
const fixtureClient = {} as SupabaseClient;
const originalElementFromPoint = document.elementFromPoint;

function pointerEvent(type: string, pointerId = 71): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, clientX: 120, clientY: 40, button: 0 });
  Object.defineProperties(event, { pointerId: { value: pointerId }, pointerType: { value: 'touch' }, isPrimary: { value: true } });
  return event;
}

function recordedInterval(id: number, startsAt: string, endsAt: string): WorkingTimeInterval {
  return {
    id, registerId: 5, companyId: 1, personId: 42, localWorkDate: startsAt.slice(0, 10),
    startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(),
    timezoneName: 'Europe/Paris', utcOffsetMinutes: 120, vesselId: 7, watchGroup: 'Bordée 1',
    comment: null, authorUserId: 'user', authorPersonId: 42, sourceType: 'manual',
    sourceReference: null, sourceRecordKey: null,
  };
}

function Harness({
  onSubmit = vi.fn(),
  saveDraft = false,
  submitToCaptain = true,
  intervals = [],
  onEditInterval = vi.fn(),
  onRequestVoid = vi.fn(),
  onCancelEdit = vi.fn(),
  isSaving = false,
  editingIntervalId = null,
  planningContextLoading = false,
  planningVesselId = 7,
  approverName = 'Camille CAPITAINE',
  canEdit = true,
  initialEnd = '12:00',
  onTimelineGestureChange,
}: {
  onSubmit?: (phases: WorkingTimePhaseInput[], intent: 'save-correction' | 'save-draft' | 'submit-day' | 'validate-day') => void;
  saveDraft?: boolean;
  submitToCaptain?: boolean;
  intervals?: WorkingTimeInterval[];
  onEditInterval?: (interval: WorkingTimeInterval) => void;
  onRequestVoid?: (interval: WorkingTimeInterval) => void;
  onCancelEdit?: () => void;
  isSaving?: boolean;
  editingIntervalId?: number | null;
  planningContextLoading?: boolean;
  planningVesselId?: number | null;
  approverName?: string | null;
  canEdit?: boolean;
  initialEnd?: string;
  onTimelineGestureChange?: (active: boolean) => void;
}) {
  const [startsAt, setStartsAt] = useState('2026-08-03T08:00');
  const [endsAt, setEndsAt] = useState(`2026-08-03T${initialEnd}`);
  const [comment, setComment] = useState('');
  const [pendingPhases, setPendingPhases] = useState<WorkingTimePhaseInput[]>([]);
  return (
    <WorkingTimeEntryBoard
      approverName={approverName}
      canEdit={canEdit}
      client={fixtureClient}
      comment={comment}
      editingIntervalId={editingIntervalId}
      endsAt={endsAt}
      intervals={intervals}
      isSaving={isSaving}
      onCancelEdit={onCancelEdit}
      onCommentChange={setComment}
      onEndsAtChange={setEndsAt}
      onEditInterval={onEditInterval}
      onPendingPhasesChange={setPendingPhases}
      onRequestVoid={onRequestVoid}
      onStartsAtChange={setStartsAt}
      onSubmit={onSubmit}
      onTimelineGestureChange={onTimelineGestureChange}
      periodEnd="2026-08-09"
      periodStart="2026-08-03"
      personId={42}
      pendingPhases={pendingPhases}
      planningVesselId={planningVesselId}
      planningContextLoading={planningContextLoading}
      showSaveDraft={saveDraft}
      showSubmitToCaptain={submitToCaptain}
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
  afterEach(() => {
    if (originalElementFromPoint) document.elementFromPoint = originalElementFromPoint;
    else Reflect.deleteProperty(document, 'elementFromPoint');
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

  it.each([
    ['20:00', '12 h 00', false, false],
    ['20:01', '12 h 01', true, false],
    ['22:00', '14 h 00', true, false],
    ['22:01', '14 h 01', true, true],
  ] as const)('displays the projected amplitude for a phase ending at %s', (initialEnd, label, required, exceeded) => {
    render(<Harness initialEnd={initialEnd} />);

    expect(screen.getByRole('group', { name: 'Amplitude de travail' })).toHaveTextContent('Amplitude normale 12h00');
    expect(screen.getByRole('group', { name: 'Amplitude de travail' })).toHaveTextContent('Amplitude maximale 14h00');
    expect(screen.getByRole('meter', { name: 'Amplitude prévue' })).toHaveAttribute('aria-valuetext', label);
    expect(screen.getByRole('textbox', { name: required ? 'Commentaire obligatoire' : 'Commentaire' }))
      .toHaveAttribute('aria-required', String(required));
    expect(Boolean(screen.queryByText(/Amplitude maximale de 14h00 dépassée/))).toBe(exceeded);
  });

  it('anchors the recorded amplitude and both thresholds to the workday ruler, including on a locked day', () => {
    const intervals = [
      recordedInterval(1, '2026-08-03T07:00', '2026-08-03T12:00'),
      recordedInterval(2, '2026-08-03T16:00', '2026-08-03T22:30'),
    ];
    const { rerender } = render(<Harness initialEnd="08:00" intervals={intervals} />);
    expect(screen.getByRole('meter', { name: 'Amplitude enregistrée' })).toHaveAttribute('aria-valuetext', '15 h 30');

    rerender(<Harness canEdit={false} initialEnd="08:00" intervals={intervals} />);
    const group = screen.getByRole('group', { name: 'Amplitude de travail' });
    const meter = screen.getByRole('meter', { name: 'Amplitude enregistrée' });
    const track = screen.getByRole('grid').closest('.working-time-timeline-track');
    expect(track).toContainElement(group);
    expect(screen.getByRole('status', { name: 'Amplitude enregistrée' })).toHaveTextContent('Amplitude enregistrée 15 h 30');
    expect(meter).toHaveClass('is-exceeded');
    const band = meter.querySelector<HTMLElement>('.working-time-amplitude-band')!;
    expect(parseFloat(band.style.left)).toBeCloseTo(7 / 24 * 100);
    expect(parseFloat(band.style.width)).toBeCloseTo(15.5 / 24 * 100);
    const normalMarker = meter.querySelector<HTMLElement>('.working-time-amplitude-marker.is-normal')!;
    const maximumMarker = meter.querySelector<HTMLElement>('.working-time-amplitude-marker.is-maximum')!;
    expect(parseFloat(normalMarker.style.left)).toBeCloseTo(19 / 24 * 100);
    expect(parseFloat(maximumMarker.style.left)).toBeCloseTo(21 / 24 * 100);
    expect(screen.queryByText('Renseignez un commentaire', { exact: false })).not.toBeInTheDocument();
  });

  it.each([
    ['2026-08-02T18:00', '2026-08-03T08:00', 0, 8, 2],
    ['2026-08-03T18:00', '2026-08-04T08:00', 18, 6, 0],
  ] as const)('clips a recorded amplitude across midnight (%s to %s)', (startsAt, endsAt, visibleStart, visibleHours, markers) => {
    render(<Harness canEdit={false} intervals={[recordedInterval(1, startsAt, endsAt)]} />);

    const meter = screen.getByRole('meter', { name: 'Amplitude enregistrée' });
    const band = meter.querySelector<HTMLElement>('.working-time-amplitude-band')!;
    expect(meter).toHaveAttribute('aria-valuetext', '14 h 00');
    expect(parseFloat(band.style.left)).toBeCloseTo(visibleStart / 24 * 100);
    expect(parseFloat(band.style.width)).toBeCloseTo(visibleHours / 24 * 100);
    expect(meter.querySelectorAll('.working-time-amplitude-marker')).toHaveLength(markers);
  });

  it('requires a nonblank amplitude comment before saving a draft even with a conforming server result', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness initialEnd="20:01" onSubmit={onSubmit} saveDraft />);
    const save = screen.getByRole('button', { name: 'Enregistrer le brouillon' });
    const comment = screen.getByRole('textbox', { name: 'Commentaire obligatoire' });
    await waitFor(() => expect(save).toBeEnabled());

    await user.type(comment, '   ');
    await user.click(save);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(comment).toHaveFocus();

    await user.type(comment, 'Intervention de sécurité');
    await user.click(save);
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('blocks saving and submitting before the current recommendation is available', async () => {
    const pending = deferred<typeof recommendation>();
    vi.mocked(fetchWorkingTimePhasesRecommendation).mockReturnValue(pending.promise);
    render(<Harness saveDraft />);
    expect(screen.getByRole('button', { name: 'Enregistrer le brouillon' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Valider' })).toBeDisabled();
    await waitFor(() => expect(fetchWorkingTimePhasesRecommendation).toHaveBeenCalled());
    pending.resolve(recommendation);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Valider' })).toBeEnabled());
  });
  it('invalidates the previous recommendation as soon as the selected periods change', async () => {
    render(<Harness saveDraft />);
    await screen.findByText('Conforme', { selector: '.working-time-analysis-bar dd' });
    const pending = deferred<typeof recommendation>();
    vi.mocked(fetchWorkingTimePhasesRecommendation).mockReturnValue(pending.promise);
    const cells = screen.getAllByRole('gridcell');
    fireEvent.pointerDown(cells[32]); fireEvent.pointerUp(cells[33]);
    expect(screen.getByRole('button', { name: 'Valider' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Enregistrer le brouillon' })).toBeDisabled();
    pending.resolve(recommendation);
  });
  it('distinguishes a recommendation timeout from a missing policy and permits a read-only recalculation', async () => {
    vi.mocked(fetchWorkingTimePhasesRecommendation).mockRejectedValueOnce(new Error('canceling statement due to statement timeout'));
    render(<Harness saveDraft />);
    await screen.findByText('Analyse indisponible', { selector: '.working-time-compliance-badge' });
    expect(screen.queryByText('Politique requise')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer le brouillon' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Relancer le calcul' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer le brouillon' })).toBeEnabled());
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
    const onTimelineGestureChange = vi.fn();
    render(<Harness onTimelineGestureChange={onTimelineGestureChange} />);
    const cells = screen.getAllByRole('gridcell');

    fireEvent.pointerDown(cells[16]);
    expect(onTimelineGestureChange).toHaveBeenLastCalledWith(true);
    fireEvent.pointerEnter(cells[19]);
    const meter = screen.getByRole('meter', { name: 'Amplitude prévue' });
    expect(meter).toHaveAttribute('aria-valuetext', '2 h 00');
    const band = meter.querySelector<HTMLElement>('.working-time-amplitude-band')!;
    expect(parseFloat(band.style.left)).toBeCloseTo(8 / 24 * 100);
    expect(parseFloat(band.style.width)).toBeCloseTo(2 / 24 * 100);
    fireEvent.pointerUp(cells[19]);
    expect(onTimelineGestureChange).toHaveBeenLastCalledWith(false);

    expect(screen.getByText('08:00–10:00')).toBeInTheDocument();
  });
  it('uses finger coordinates when captured touch move and release keep targeting the first cell', async () => {
    const user = userEvent.setup(); const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} saveDraft />);
    const cells = screen.getAllByRole('gridcell');
    const capture = vi.fn(); cells[16].setPointerCapture = capture;
    document.elementFromPoint = vi.fn().mockReturnValue(cells[23].querySelector('span'));
    fireEvent(cells[16], pointerEvent('pointerdown'));
    fireEvent(cells[16], pointerEvent('pointermove', 99));
    expect(cells[23]).toHaveAttribute('aria-selected', 'false');
    fireEvent(cells[16], pointerEvent('pointermove'));
    expect(cells[23]).toHaveAttribute('aria-selected', 'true');
    fireEvent(cells[16], pointerEvent('pointerup'));
    expect(capture).toHaveBeenCalledWith(71);
    expect(screen.getByText('08:00–12:00')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer le brouillon' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
    expect(onSubmit).toHaveBeenCalledWith([{ startsAt: '2026-08-03T08:00', endsAt: '2026-08-03T12:00' }], 'save-draft');
  });
  it('ends an outside release so a later unpressed hover cannot extend the selected range', async () => {
    const user = userEvent.setup(); const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} saveDraft />);
    const cells = screen.getAllByRole('gridcell');
    document.elementFromPoint = vi.fn().mockReturnValue(cells[23]);
    fireEvent(cells[16], pointerEvent('pointerdown'));
    fireEvent(cells[16], pointerEvent('pointermove'));
    fireEvent(window, pointerEvent('pointerup'));
    fireEvent(cells[31], pointerEvent('pointerover'));
    expect(cells[23]).toHaveAttribute('aria-selected', 'true');
    expect(cells[31]).toHaveAttribute('aria-selected', 'false');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer le brouillon' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
    expect(onSubmit).toHaveBeenCalledWith([{ startsAt: '2026-08-03T08:00', endsAt: '2026-08-03T12:00' }], 'save-draft');
  });
  it('restores the previous range when a touch gesture is cancelled', () => {
    render(<Harness />);
    const cells = screen.getAllByRole('gridcell');
    document.elementFromPoint = vi.fn().mockReturnValue(cells[35]);
    fireEvent(cells[32], pointerEvent('pointerdown'));
    fireEvent(cells[32], pointerEvent('pointermove'));
    expect(cells[35]).toHaveAttribute('aria-selected', 'true');
    fireEvent(cells[32], pointerEvent('pointercancel'));
    expect(cells[16]).toHaveAttribute('aria-selected', 'true');
    expect(cells[35]).toHaveAttribute('aria-selected', 'false');
    expect(screen.queryByText('Période 1')).not.toBeInTheDocument();
  });

  it('removes manual planning fields and keeps the draft action permission-gated', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    expect(screen.queryByLabelText('Début du travail')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Filtrer et affecter le navire')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Filtrer et affecter la bordée')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enregistrer le brouillon' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Valider' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Valider' }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('saves the selected periods as a draft without submitting the day', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} saveDraft />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer le brouillon' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));

    expect(onSubmit).toHaveBeenCalledWith([
      { startsAt: '2026-08-03T08:00', endsAt: '2026-08-03T12:00' },
    ], 'save-draft');
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
    await waitFor(() => expect(screen.getByRole('button', { name: 'Valider' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Valider' }));

    expect(onSubmit).toHaveBeenCalledWith([
      { startsAt: '2026-08-03T08:00', endsAt: '2026-08-03T12:00' },
      { startsAt: '2026-08-03T14:00', endsAt: '2026-08-03T16:00' },
    ], 'submit-day');
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

  it('uses the Planning Capitaine and submits without a manual selector', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const cells = screen.getAllByRole('gridcell');

    fireEvent.pointerDown(cells[16]);
    fireEvent.pointerEnter(cells[17]);
    fireEvent.pointerUp(cells[17]);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText(/Approbateur : Camille CAPITAINE/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Valider' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Valider' }));

    expect(onSubmit).toHaveBeenCalledWith(
      [{ startsAt: '2026-08-03T08:00', endsAt: '2026-08-03T09:00' }],
      'submit-day',
    );
  });

  it('does not report a missing Planning assignment while its context is loading', () => {
    render(<Harness planningContextLoading />);

    expect(screen.getByRole('status')).toHaveTextContent('Chargement de l’affectation Planning');
    expect(screen.queryByText(/Aucune affectation Planning/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Valider' })).toBeDisabled();
  });

  it.each([7, null])('allows draft entry and submission without a captain (vessel %s)', async (vesselId) => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness saveDraft planningVesselId={vesselId} approverName={null} onSubmit={onSubmit} />);

    expect(screen.getByText(/Approbation : Administrateur, Direction ou Armement/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer le brouillon' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
    await user.click(screen.getByRole('button', { name: 'Valider' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.any(Array), 'save-draft');
    expect(onSubmit).toHaveBeenCalledWith(expect.any(Array), 'submit-day');
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
    expect(screen.getByRole('button', { name: 'Valider' })).toBeDisabled();
  });

  it('selects a recorded period with a left click and withdraws the selected period with its badge', async () => {
    const user = userEvent.setup();
    const onEditInterval = vi.fn();
    const onRequestVoid = vi.fn();
    const interval = recordedInterval(88, '2026-08-03T08:00', '2026-08-03T12:00');
    const { rerender } = render(<Harness intervals={[interval]} onEditInterval={onEditInterval} onRequestVoid={onRequestVoid} />);

    await user.click(screen.getByRole('gridcell', { name: /08:00, travail enregistré/ }));
    expect(onEditInterval).toHaveBeenCalledWith(interval);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    rerender(<Harness editingIntervalId={88} intervals={[interval]} onEditInterval={onEditInterval} onRequestVoid={onRequestVoid} />);
    const grid = screen.getByRole('grid');
    const remove = screen.getByRole('button', { name: 'Retirer la période sélectionnée' });
    expect(grid.parentElement).toContainElement(remove);
    expect(grid).not.toContainElement(remove);
    const cells = screen.getAllByRole('gridcell');
    await user.click(cells[17]);
    expect(screen.getByRole('meter', { name: 'Amplitude prévue' })).toHaveAttribute('aria-valuetext', '4 h 00');
    expect(onEditInterval).toHaveBeenCalledOnce();
    fireEvent.pointerDown(cells[17]);
    fireEvent.pointerEnter(cells[19]);
    fireEvent.pointerUp(cells[19]);
    expect(screen.getByRole('meter', { name: 'Amplitude prévue' })).toHaveAttribute('aria-valuetext', '1 h 30');
    await user.click(remove);
    expect(onRequestVoid).toHaveBeenCalledWith(interval);
  });

  it('uses the shared period menu for a right click or Shift+F10', async () => {
    const user = userEvent.setup();
    const interval = recordedInterval(88, '2026-08-03T08:00', '2026-08-03T12:00');
    const onEditInterval = vi.fn();
    const onRequestVoid = vi.fn();
    render(<Harness intervals={[interval]} onEditInterval={onEditInterval} onRequestVoid={onRequestVoid} />);

    const cell = screen.getByRole('gridcell', { name: /08:00, travail enregistré/ });
    expect(fireEvent.contextMenu(cell, { clientX: 120, clientY: 80 })).toBe(false);
    const menu = screen.getByRole('menu', { name: 'Actions de la plage enregistrée' });
    expect(cell).toHaveAttribute('aria-expanded', 'true');
    expect(menu).toHaveStyle({ left: '120px', top: '80px' });
    await user.click(screen.getByRole('menuitem', { name: 'Retirer' }));
    expect(onRequestVoid).toHaveBeenCalledWith(interval);
    expect(onEditInterval).not.toHaveBeenCalled();
    expect(menu).not.toBeInTheDocument();

    cell.focus();
    await user.keyboard('{Shift>}{F10}{/Shift}');
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(cell).toHaveFocus();
    await user.keyboard('{Shift>}{F10}{/Shift}');
    await user.click(screen.getByRole('menuitem', { name: 'Corriger' }));
    expect(onEditInterval).toHaveBeenCalledWith(interval);
  });

  it('keeps the correction comment optional even above the amplitude limit with a non-compliant recommendation', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchWorkingTimePhasesRecommendation).mockResolvedValue({ ...recommendation, status: 'non_conforme' });
    const onSubmit = vi.fn();
    render(<Harness editingIntervalId={88} initialEnd="22:01" onSubmit={onSubmit} />);

    expect(screen.getByRole('textbox', { name: 'Commentaire' })).not.toBeRequired();
    expect(screen.getByText('Amplitude maximale de 14h00 dépassée.')).toBeInTheDocument();
    const correction = screen.getByRole('button', { name: 'Enregistrer la correction' });
    await waitFor(() => expect(correction).toBeEnabled());
    await user.click(correction);
    expect(onSubmit).toHaveBeenCalledWith([{ startsAt: '2026-08-03T08:00', endsAt: '2026-08-03T22:01' }], 'save-correction');
  });

  it('locks the pending phases and recorded-period actions until a save settles', async () => {
    const user = userEvent.setup(); const pending = deferred<void>();
    const onSubmit = vi.fn(); const onEditInterval = vi.fn(); const onRequestVoid = vi.fn();
    const interval: WorkingTimeInterval = {
      id: 88, registerId: 5, companyId: 1, personId: 42, localWorkDate: '2026-08-03',
      startsAt: '2026-08-03T08:00:00+02:00', endsAt: '2026-08-03T12:00:00+02:00',
      timezoneName: 'Europe/Paris', utcOffsetMinutes: 120, vesselId: 7, watchGroup: 'Bordée 1',
      comment: null, authorUserId: 'user', authorPersonId: 42, sourceType: 'manual', sourceReference: null, sourceRecordKey: null,
    };
    function SavingHarness() {
      const [saving, setSaving] = useState(false);
      return <Harness intervals={[interval]} isSaving={saving} onEditInterval={onEditInterval} onRequestVoid={onRequestVoid} onSubmit={(...args) => {
        onSubmit(...args); setSaving(true); void pending.promise.then(() => setSaving(false));
      }} saveDraft />;
    }
    render(<SavingHarness />);
    const cells = screen.getAllByRole('gridcell');
    fireEvent.pointerDown(cells[32]); fireEvent.pointerUp(cells[33]);
    const recordedCell = screen.getByRole('gridcell', { name: /08:00, travail enregistré/ });
    fireEvent.contextMenu(recordedCell);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer le brouillon' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
    const period = screen.getByRole('button', { name: /Période 1/ });
    const remove = screen.getByRole('button', { name: 'Retirer la période 1' });
    for (const button of [period, remove, recordedCell]) {
      expect(button).toBeDisabled(); await user.click(button);
    }
    fireEvent.contextMenu(recordedCell);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByText('Période 1')).toBeInTheDocument();
    expect(onEditInterval).not.toHaveBeenCalled(); expect(onRequestVoid).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith([{ startsAt: '2026-08-03T16:00', endsAt: '2026-08-03T17:00' }], 'save-draft');
    await act(async () => { pending.resolve(); await pending.promise; });
    expect(period).toBeEnabled(); expect(remove).toBeEnabled();
  });
  it('does not allow cancelling a correction while its save is in flight', async () => {
    const user = userEvent.setup(); const pending = deferred<void>(); const onCancelEdit = vi.fn();
    function SavingHarness() {
      const [saving, setSaving] = useState(false);
      return <Harness editingIntervalId={88} isSaving={saving} onCancelEdit={onCancelEdit} onSubmit={() => {
        setSaving(true); void pending.promise.then(() => setSaving(false));
      }} />;
    }
    render(<SavingHarness />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer la correction' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Enregistrer la correction' }));
    const cancel = screen.getByRole('button', { name: 'Annuler' });
    expect(cancel).toBeDisabled(); await user.click(cancel); expect(onCancelEdit).not.toHaveBeenCalled();
    await act(async () => { pending.resolve(); await pending.promise; });
    expect(cancel).toBeEnabled(); await user.click(cancel); expect(onCancelEdit).toHaveBeenCalledOnce();
  });
});
