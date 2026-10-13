import type { SupabaseClient } from '@supabase/supabase-js';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWorkingTimePhasesRecommendation, type WorkingTimeEntryRecommendation, type WorkingTimePhaseInput } from './workingTimeQueries';
import { WorkingTimeEntryBoard, type WorkingTimeEntryGraphPreview } from './WorkingTimeEntryBoard';
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

const previewGraph: WorkingTimeEntryGraphPreview = {
  workLimitMarkerMinute: null,
  excessRanges: [],
  windowLabel: '3 août, de 00 h à 24 h',
  workTotalLabel: 'Projection de la saisie',
  excessLabel: null,
  isProjected: true,
};

function measureTimelineCells(cells: HTMLElement[]) {
  cells.forEach((cell, slot) => {
    vi.spyOn(cell, 'getBoundingClientRect').mockReturnValue({
      x: 100 + slot * 20, y: 100, left: 100 + slot * 20, right: 100 + (slot + 1) * 20,
      width: 20, height: 94, top: 100, bottom: 194, toJSON: () => ({}),
    });
  });
}

function capturedPointer(cell: HTMLElement) {
  let captured = false;
  const set = vi.fn(() => { captured = true; });
  const release = vi.fn(() => { captured = false; });
  Object.defineProperties(cell, {
    setPointerCapture: { configurable: true, value: set },
    hasPointerCapture: { configurable: true, value: () => captured },
    releasePointerCapture: { configurable: true, value: release },
  });
  return { set, release };
}

function touchPointer(cell: HTMLElement, type: string, clientX: number) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY: 150, button: 0 });
  Object.defineProperties(event, { pointerId: { value: 17 }, pointerType: { value: 'touch' }, isPrimary: { value: true } });
  fireEvent(cell, event);
}

function Harness({
  onSubmit = vi.fn(),
  saveDraft = false,
  submitToCaptain = true,
  intervals = [],
  onEditInterval = vi.fn(),
  onRequestVoid = vi.fn(),
  planningContextLoading = false,
  planningVesselId = 7,
  approverName = 'Camille CAPITAINE',
  unrestrictedEditing = false,
  previewGraph,
  analysisStatus,
}: {
  onSubmit?: (phases: WorkingTimePhaseInput[], intent: 'save-correction' | 'save-draft' | 'submit-day' | 'validate-day') => void;
  saveDraft?: boolean;
  submitToCaptain?: boolean;
  intervals?: WorkingTimeInterval[];
  onEditInterval?: (interval: WorkingTimeInterval) => void;
  onRequestVoid?: (interval: WorkingTimeInterval) => void;
  planningContextLoading?: boolean;
  planningVesselId?: number | null;
  approverName?: string | null;
  unrestrictedEditing?: boolean;
  previewGraph?: WorkingTimeEntryGraphPreview;
  analysisStatus?: WorkingTimeEntryRecommendation['status'];
}) {
  const [startsAt, setStartsAt] = useState('2026-08-03T08:00');
  const [endsAt, setEndsAt] = useState('2026-08-03T12:00');
  const [pendingPhases, setPendingPhases] = useState<WorkingTimePhaseInput[]>([]);
  return (
    <WorkingTimeEntryBoard
      approverName={approverName}
      canEdit
      unrestrictedEditing={unrestrictedEditing}
      client={{} as SupabaseClient}
      comment=""
      editingIntervalId={null}
      endsAt={endsAt}
      intervals={intervals}
      isSaving={false}
      onCancelEdit={vi.fn()}
      onCommentChange={vi.fn()}
      onEndsAtChange={setEndsAt}
      onEditInterval={onEditInterval}
      onPendingPhasesChange={setPendingPhases}
      onRequestVoid={onRequestVoid}
      onStartsAtChange={setStartsAt}
      onSubmit={onSubmit}
      periodEnd="2026-08-09"
      periodStart="2026-08-03"
      personId={42}
      previewGraph={previewGraph}
      analysisStatus={analysisStatus}
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

  it('shows authoritative quota guidance and all 48 half-hour cells', async () => {
    render(<Harness />);

    expect(screen.getAllByRole('gridcell')).toHaveLength(48);
    expect(screen.getByText('00h')).toBeInTheDocument();
    expect(screen.getByText('23h')).toBeInTheDocument();
    await waitFor(() => expect(fetchWorkingTimePhasesRecommendation).toHaveBeenCalled());
    expect(await screen.findByText('4 h 00', { selector: '.working-time-analysis-bar dd' })).toBeInTheDocument();
    expect(screen.getByText('Conformité repos')).toBeInTheDocument();
    expect(screen.getByText('Conforme', { selector: '.working-time-analysis-bar dd' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /Projection en cours de saisie/ })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Journée de travail' })).not.toHaveClass('is-visual-preview');
    expect(screen.getByRole('grid').querySelector('.working-time-preview-phase-labels')).not.toBeInTheDocument();
  });

  it('places optional phase labels over the grid without intercepting input', () => {
    const { container } = render(<Harness previewGraph={{ ...previewGraph, phaseLabels: [
      { startMinute: 360, endMinute: 720, label: '06:00–12:00', isPending: false },
      { startMinute: 780, endMinute: 1200, label: '13:00–20:00', isPending: true },
    ] }} />);

    const labels = container.querySelector('.working-time-preview-phase-labels');
    expect(labels).toHaveAttribute('aria-hidden', 'true');
    expect(labels).toHaveStyle({ pointerEvents: 'none' });
    expect(screen.getByText('06:00–12:00')).toHaveStyle({ left: '25%', width: '25%' });
    expect(screen.getByText('13:00–20:00')).toHaveClass('is-pending');
    expect(screen.getAllByRole('gridcell')).toHaveLength(48);
  });

  it('shows other rule alerts beside the graph and includes them in its accessible description', () => {
    render(<Harness previewGraph={{ ...previewGraph, ruleAlerts: ['Repos sur 24 h : manque 2 h', 'Amplitude : dépassement de 1 h'] }} />);

    expect(screen.getByText('Repos sur 24 h : manque 2 h')).toHaveClass('working-time-preview-rule-alert');
    expect(screen.getByText('Amplitude : dépassement de 1 h')).toHaveClass('working-time-preview-rule-alert');
    expect(screen.getByRole('img', { name: /Repos sur 24 h : manque 2 h.*Amplitude : dépassement de 1 h/ })).toBeInTheDocument();
  });

  it('shows the opt-in excess rail with its analysis window and threshold position', () => {
    const previewGraph: WorkingTimeEntryGraphPreview = {
      workLimitMarkerMinute: 19 * 60,
      excessRanges: [{ startMinute: 19 * 60, endMinute: 20 * 60 }],
      windowLabel: '13 octobre, de 00 h à 24 h',
      workTotalLabel: '13 h de travail / seuil 12 h',
      excessLabel: 'Dépassement de 1 h',
      isProjected: true,
    };
    const { container } = render(<Harness previewGraph={previewGraph} />);

    expect(screen.getByRole('region', { name: 'Journée de travail' })).toHaveClass('is-visual-preview');
    expect(screen.getByRole('img', { name: /Projection en cours de saisie.*13 octobre.*Dépassement de 1 h.*Seuil atteint à 19 h 00/ })).toBeInTheDocument();
    expect(screen.getByText('Seuil atteint à 19 h 00')).toBeInTheDocument();
    expect(container.querySelector('.working-time-preview-excess-range')).toHaveStyle({ left: `${19 / 24 * 100}%`, width: `${1 / 24 * 100}%` });
    expect(screen.getAllByRole('gridcell')).toHaveLength(48);
  });

  it('updates graph feedback from projected props without retaining a previous excess', () => {
    const initial: WorkingTimeEntryGraphPreview = {
      workLimitMarkerMinute: 19 * 60,
      excessRanges: [{ startMinute: 19 * 60, endMinute: 20 * 60 }],
      windowLabel: '13 octobre, de 00 h à 24 h',
      workTotalLabel: '13 h de travail / seuil 12 h',
      excessLabel: 'Dépassement de 1 h',
      isProjected: true,
    };
    const { container, rerender } = render(<Harness previewGraph={initial} />);

    rerender(<Harness previewGraph={{ ...initial, workLimitMarkerMinute: null, excessRanges: [], workTotalLabel: '11 h de travail / seuil 12 h', excessLabel: null }} />);

    expect(screen.getByRole('img', { name: /11 h de travail.*Aucun dépassement/ })).toBeInTheDocument();
    expect(container.querySelector('.working-time-preview-excess-range')).not.toBeInTheDocument();
    expect(screen.queryByText(/Seuil atteint à/)).not.toBeInTheDocument();
  });

  it('keeps server comment requirements when the preview overrides the visual status', async () => {
    vi.mocked(fetchWorkingTimePhasesRecommendation).mockResolvedValue({
      ...recommendation, status: 'non_conforme', violationCodes: ['work_24h'],
    });
    render(<Harness analysisStatus="conforme" />);

    await waitFor(() => expect(screen.getByRole('textbox')).toBeRequired());
    expect(screen.getByText('Conforme', { selector: '.working-time-compliance-badge' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Valider' })).toBeInTheDocument();
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

  it('extends a captured touch selection across cells in the visual preview', () => {
    render(<Harness previewGraph={previewGraph} />);
    const cells = screen.getAllByRole('gridcell');
    measureTimelineCells(cells);
    const capture = capturedPointer(cells[12]);

    touchPointer(cells[12], 'pointerdown', 350);
    touchPointer(cells[12], 'pointermove', 570);
    touchPointer(cells[12], 'pointerup', 570);

    expect(capture.set).toHaveBeenCalledWith(17);
    expect(capture.release).toHaveBeenCalledWith(17);
    expect(screen.getByText('06:00–12:00')).toBeInTheDocument();
    expect(screen.getAllByText(/Période \d/)).toHaveLength(1);
  });

  it('commits the last tracked slot on release outside and leaves no armed preview drag', () => {
    render(<Harness previewGraph={previewGraph} />);
    const cells = screen.getAllByRole('gridcell');
    measureTimelineCells(cells);
    capturedPointer(cells[12]);

    touchPointer(cells[12], 'pointerdown', 350);
    touchPointer(cells[12], 'pointermove', 490);
    touchPointer(cells[12], 'pointerup', 2000);
    fireEvent.pointerEnter(cells[32]);

    expect(screen.getByText('06:00–10:00')).toBeInTheDocument();
    expect(cells[19]).toHaveAttribute('aria-selected', 'true');
    expect(cells[32]).toHaveAttribute('aria-selected', 'false');
  });

  it('restores the previous selection on preview pointer cancellation without adding a period', () => {
    render(<Harness previewGraph={previewGraph} />);
    const cells = screen.getAllByRole('gridcell');
    measureTimelineCells(cells);
    const capture = capturedPointer(cells[12]);

    touchPointer(cells[12], 'pointerdown', 350);
    touchPointer(cells[12], 'pointermove', 570);
    touchPointer(cells[12], 'pointercancel', 570);
    fireEvent.pointerEnter(cells[32]);

    expect(capture.release).toHaveBeenCalledWith(17);
    expect(screen.queryByText('Période 1')).not.toBeInTheDocument();
    expect(cells[12]).toHaveAttribute('aria-selected', 'false');
    expect(cells[16]).toHaveAttribute('aria-selected', 'true');
    expect(cells[32]).toHaveAttribute('aria-selected', 'false');

    capturedPointer(cells[28]);
    touchPointer(cells[28], 'pointerdown', 670);
    touchPointer(cells[28], 'pointerup', 670);
    expect(screen.getByText('14:00–14:30')).toBeInTheDocument();
  });

  it('removes manual planning fields and keeps the draft action permission-gated', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    expect(screen.queryByLabelText('Début du travail')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Filtrer et affecter le navire')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Filtrer et affecter la bordée')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enregistrer le brouillon' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Valider' }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('saves the selected periods as a draft without submitting the day', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} saveDraft />);

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

  it('allows an unrestricted save without a comment when the server detects a violation', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    vi.mocked(fetchWorkingTimePhasesRecommendation).mockResolvedValue({
      ...recommendation, status: 'non_conforme', violationCodes: ['work_24h'],
    });
    render(<Harness unrestrictedEditing onSubmit={onSubmit} />);

    await waitFor(() => expect(screen.getByText('Non conforme', { selector: '.working-time-analysis-bar dd' })).toBeInTheDocument());
    expect(screen.getByRole('textbox')).not.toBeRequired();
    await user.click(screen.getByRole('button', { name: 'Enregistrer les périodes' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.any(Array), 'save-draft');
  });

  it('does not block an unrestricted save when recommendation or planning context is unavailable', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    vi.mocked(fetchWorkingTimePhasesRecommendation).mockRejectedValue(new Error('Recommendation unavailable'));
    render(<Harness unrestrictedEditing planningContextLoading onSubmit={onSubmit} />);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Recommendation unavailable'));
    await user.click(screen.getByRole('button', { name: 'Enregistrer les périodes' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.any(Array), 'save-draft');
  });

  it('still rejects a phase overlapping a saved interval during unrestricted editing', () => {
    const interval: WorkingTimeInterval = {
      id: 88, registerId: 5, companyId: 1, personId: 42, localWorkDate: '2026-08-03',
      startsAt: new Date('2026-08-03T08:00').toISOString(), endsAt: new Date('2026-08-03T12:00').toISOString(),
      timezoneName: 'Europe/Paris', utcOffsetMinutes: 120, vesselId: 7, watchGroup: 'Bordée 1',
      comment: null, authorUserId: 'user', authorPersonId: 42, sourceType: 'manual',
      sourceReference: null, sourceRecordKey: null,
    };
    render(<Harness unrestrictedEditing intervals={[interval]} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Une phase recouvre un créneau déjà enregistré.');
    expect(screen.getByRole('button', { name: 'Enregistrer les périodes' })).toBeDisabled();
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

  it('opens correction and removal actions only after clicking a recorded timeline segment', async () => {
    const user = userEvent.setup();
    const onEditInterval = vi.fn();
    const interval: WorkingTimeInterval = {
      id: 88, registerId: 5, companyId: 1, personId: 42, localWorkDate: '2026-08-03',
      startsAt: '2026-08-03T08:00:00+02:00', endsAt: '2026-08-03T12:00:00+02:00',
      timezoneName: 'Europe/Paris', utcOffsetMinutes: 120, vesselId: 7, watchGroup: 'Bordée 1',
      comment: null, authorUserId: 'user', authorPersonId: 42, sourceType: 'manual',
      sourceReference: null, sourceRecordKey: null,
    };
    render(<Harness intervals={[interval]} onEditInterval={onEditInterval} />);

    expect(screen.queryByRole('button', { name: 'Corriger' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('gridcell', { name: /08:00, travail enregistré/ }));
    await user.click(screen.getByRole('button', { name: 'Corriger' }));
    expect(onEditInterval).toHaveBeenCalledWith(interval);
  });
});
