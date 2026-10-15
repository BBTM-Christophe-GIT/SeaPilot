import type { SupabaseClient } from '@supabase/supabase-js';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkingTimeEntryBoard, type WorkingTimeEntryGraphPreview } from './WorkingTimeEntryBoard';
import type { WorkingTimeInterval } from './workingTimeModel';
import { fetchWorkingTimePhasesRecommendation, type WorkingTimePhaseInput } from './workingTimeQueries';

vi.mock('./workingTimeQueries', async (importOriginal) => ({
  ...await importOriginal<typeof import('./workingTimeQueries')>(),
  fetchWorkingTimePhasesRecommendation: vi.fn(),
}));

const phases = [
  { startsAt: '2026-10-13T04:00', endsAt: '2026-10-13T08:00' },
  { startsAt: '2026-10-13T18:00', endsAt: '2026-10-13T22:00' },
];
const recommendation = {
  status: 'conforme' as const, policyId: 5, policyName: 'Politique compagnie', alreadyNonCompliant: false,
  available24hSeconds: 14400, available7dSeconds: 180000, work24hSeconds: 28800,
  work7dSeconds: 79200, rest24hSeconds: 57600, longestRest24hSeconds: 36000,
  restImpactSeconds: 0, consecutiveRestImpactSeconds: 0, maxAdditionalSeconds: 14400,
  latestEndAt: '2026-10-13T22:00:00Z', nextResumeAt: null, violationCodes: [],
};
const graph: WorkingTimeEntryGraphPreview = {
  workLimitMarkerMinute: 1260, excessRanges: [{ startMinute: 1260, endMinute: 1320 }],
  windowLabel: 'Journée de calcul : 13 oct. 04:00 → 22:00', workTotalLabel: 'Cumul : 13 h 00',
  excessLabel: 'Dépassement +1 h 00', isProjected: true,
  phaseLabels: [{ startMinute: 240, endMinute: 480, label: '04:00–08:00', isPending: true }],
};
const client = {} as SupabaseClient;

function Harness({ canEdit = true, isSaving = false, intervals = [], onSubmit = vi.fn(), initialPhases = phases }: {
  canEdit?: boolean; isSaving?: boolean; intervals?: WorkingTimeInterval[];
  initialPhases?: WorkingTimePhaseInput[];
  onSubmit?: (phases: WorkingTimePhaseInput[], intent: string) => void;
}) {
  const [startsAt, setStartsAt] = useState(initialPhases[0].startsAt);
  const [endsAt, setEndsAt] = useState(initialPhases[0].endsAt);
  const [pending, setPending] = useState(initialPhases);
  return <WorkingTimeEntryBoard allowPhaseResize previewGraph={graph}
    client={client} personId={42} periodStart="2026-10-01" periodEnd="2026-10-31"
    selectedDay="2026-10-13" intervals={intervals} canEdit={canEdit} isSaving={isSaving}
    startsAt={startsAt} endsAt={endsAt} planningVesselId={7} planningWatchGroup="Bordée 2"
    comment="" editingIntervalId={null} pendingPhases={pending} showSaveDraft
    onStartsAtChange={setStartsAt} onEndsAtChange={setEndsAt} onPendingPhasesChange={setPending}
    onCommentChange={vi.fn()} onCancelEdit={vi.fn()} onSubmit={onSubmit} />;
}

function pointer(type: string, clientX: number) {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX, clientY: 10 });
  Object.defineProperty(event, 'pointerId', { value: 19 });
  return event;
}

describe('restored graphical working-time entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchWorkingTimePhasesRecommendation).mockResolvedValue(recommendation);
  });

  it('shows each hour, labelled periods and an accessible excess band while retaining 48 half-hour cells', () => {
    render(<Harness />);
    expect(screen.getAllByRole('gridcell')).toHaveLength(48);
    for (let hour = 0; hour <= 24; hour++) expect(screen.getByText(`${String(hour).padStart(2, '0')}h`)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Projection en cours de saisie.*Dépassement \+1 h 00.*Seuil atteint à 21 h 00/ })).toBeInTheDocument();
    expect(screen.getByText('04:00–08:00', { selector: '.working-time-preview-phase-labels span' })).toHaveClass('is-pending');
  });

  it('submits the resized phases while preserving the other period and the server calculation', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Ajuster la fin de la période 1, 08:00' }), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Ajuster le début de la période 2, 18:00' }), { key: 'ArrowLeft' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer le brouillon' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
    expect(onSubmit).toHaveBeenCalledWith([
      { startsAt: '2026-10-13T04:00', endsAt: '2026-10-13T08:30' },
      { startsAt: '2026-10-13T17:30', endsAt: '2026-10-13T22:00' },
    ], 'save-draft');
    expect(fetchWorkingTimePhasesRecommendation).toHaveBeenLastCalledWith(client, expect.objectContaining({
      phases: [
        { startsAt: new Date('2026-10-13T04:00').toISOString(), endsAt: new Date('2026-10-13T08:30').toISOString() },
        { startsAt: new Date('2026-10-13T17:30').toISOString(), endsAt: new Date('2026-10-13T22:00').toISOString() },
      ],
    }));
  });

  it('stops a resizing edge at a neighbouring period and preserves a minimum half hour', () => {
    render(<Harness />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Ajuster la fin de la période 1, 08:00' }), { key: 'End' });
    expect(screen.getByRole('button', { name: 'Ajuster la fin de la période 1, 18:00' })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Ajuster le début de la période 1, 04:00' }), { key: 'End' });
    expect(screen.getByRole('button', { name: 'Ajuster le début de la période 1, 17:30' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ajuster le début de la période 2, 18:00' })).toBeInTheDocument();
  });

  it.each(['pointercancel', 'lostpointercapture', 'Escape'])('restores a cancelled resize on %s without creating another period', (cancel) => {
    render(<Harness />);
    const grid = screen.getByRole('grid');
    vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 480, width: 480 } as DOMRect);
    const edge = screen.getByRole('button', { name: 'Ajuster la fin de la période 1, 08:00' });
    fireEvent(edge, pointer('pointerdown', 160));
    fireEvent(edge, pointer('pointermove', 180));
    expect(screen.getByRole('button', { name: 'Ajuster la fin de la période 1, 09:00' })).toBeInTheDocument();
    if (cancel === 'Escape') fireEvent.keyDown(edge, { key: 'Escape' });
    else fireEvent(edge, pointer(cancel, 180));
    expect(screen.getByRole('button', { name: 'Ajuster la fin de la période 1, 08:00' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Ajuster (le début|la fin) de la période/ })).toHaveLength(4);
  });

  it('locks resize handles and the grid while saving and removes handles for a read-only day', () => {
    const { rerender } = render(<Harness isSaving />);
    for (const handle of screen.getAllByRole('button', { name: /Ajuster (le début|la fin) de la période/ })) expect(handle).toBeDisabled();
    for (const cell of screen.getAllByRole('gridcell')) expect(cell).toBeDisabled();
    rerender(<Harness canEdit={false} />);
    expect(screen.queryByRole('group', { name: 'Ajuster les périodes à enregistrer' })).not.toBeInTheDocument();
  });
});
