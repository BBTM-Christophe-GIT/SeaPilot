import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { buildPlanningTimeline } from './planningModel';
import { PlanningCrewTimelineRow, PlanningFleetTimelineRow } from './PlanningTimeline';
import type { PlanningServiceProvider, PlanningVesselVisit } from './planningVisitQueries';

const provider: PlanningServiceProvider = {
  id: 28,
  name: 'APAVE',
  category: 'Prestataire de Service',
  serviceType: 'Visite Grue / Bossoir',
  activity: '',
  address: '235 Route du Mesnil',
  city: 'Montivilliers',
  phone: '02 32 79 56 46',
  companyEmail: '',
  contactName: 'Clément NOEL',
  contactRole: '',
  contactPhone: '',
  contactEmail: 'clement.noel@apave.com',
};

const visits: PlanningVesselVisit[] = [
  {
    id: 1,
    vesselId: 2,
    visitType: 'crane_visit',
    providerId: provider.id,
    provider,
    comments: '',
    occurrences: [
      { id: 1, scheduledAt: '2026-08-11T07:00:00Z', scheduledOn: '2026-08-11' },
      { id: 2, scheduledAt: '2026-08-11T12:00:00Z', scheduledOn: '2026-08-11' },
      { id: 3, scheduledAt: '2026-08-11T15:00:00Z', scheduledOn: '2026-08-11' },
    ],
    attachments: [],
    createdAt: '',
    updatedAt: '',
  },
];

describe('Planning timeline visit and leave rendering', () => {
  it('stacks multiple visits on the vessel row and opens provider details', async () => {
    const user = userEvent.setup();
    const onOpenVisit = vi.fn();
    const { container } = render(<PlanningFleetTimelineRow
      crewCount={4}
      dayWidth={110}
      days={buildPlanningTimeline('2026-08-11', 'week')}
      editable
      expanded
      hasBoards
      lane={{ key: 'vessel-2', vesselId: 2, label: 'GOURY', detail: 'GRY', vessel: 'GOURY', projects: [], assignments: [], locations: [] }}
      onAddBoard={vi.fn()}
      onAssignPerson={vi.fn()}
      onCreateVisit={vi.fn()}
      onMove={vi.fn()}
      onOpen={vi.fn()}
      onOpenVessel={vi.fn()}
      onOpenVisit={onOpenVisit}
      onResize={vi.fn()}
      onSelect={vi.fn()}
      onToggle={vi.fn()}
      pendingId={null}
      selectedId={null}
      touchDropTarget={null}
      visits={visits}
    />);

    const visitButtons = screen.getAllByRole('button', { name: 'Visite Grue avec APAVE, 11/08/2026' });
    expect(visitButtons).toHaveLength(3);
    await user.click(visitButtons[1]);
    expect(onOpenVisit).toHaveBeenCalledWith(visits[0]);
    expect(screen.getByRole('button', { name: 'Ajouter une visite ou un audit à GOURY' })).toBeInTheDocument();
    const vesselActions = screen.getByRole('group', { name: 'Actions pour GOURY' });
    expect(vesselActions).toHaveClass('planning-vessel-actions');
    expect(vesselActions.querySelectorAll('button')).toHaveLength(3);
    expect(vesselActions.parentElement).toBe(container.querySelector('.planning-tree-row.is-vessel'));
  });

  it('renders approved leave as a black Vacances bar and lets an administrator move it', () => {
    const onMoveAbsence = vi.fn();
    const { container } = render(<PlanningCrewTimelineRow
      absences={[{
        id: 7,
        personId: 10,
        absenceType: 'leave',
        startsAt: '2026-08-11T06:00:00Z',
        endsAt: '2026-08-12T18:00:00Z',
        startsOn: '2026-08-11',
        endsOn: '2026-08-12',
        reason: '',
        status: 'approved',
        requestedBy: 'user',
        reviewedBy: 'admin',
        reviewedAt: '2026-07-23T10:00:00Z',
        reviewComment: '',
        createdAt: '',
        updatedAt: '',
      }]}
      conflictDatesByEvent={new Map()}
      canMoveApprovedAbsences
      dayWidth={110}
      days={buildPlanningTimeline('2026-08-11', 'week')}
      editable
      lane={{ key: 'person-10', label: 'Anne MARTIN', detail: '', personId: 10, vesselId: 2, vessel: 'GOURY', watchGroup: 'Bordée 1', events: [] }}
      onCreate={vi.fn()}
      onMove={vi.fn()}
      onMoveAbsence={onMoveAbsence}
      onOpen={vi.fn()}
      onResize={vi.fn()}
      onSelect={vi.fn()}
      pendingId={null}
      selectedId={null}
    />);

    expect(screen.getByText('Vacances')).toBeInTheDocument();
    const vacation = container.querySelector<HTMLButtonElement>('.planning-absence-bar.is-approved.is-leave')!;
    expect(vacation).toHaveAttribute('draggable', 'true');

    const values = new Map<string, string>();
    const dataTransfer = {
      dropEffect: 'move',
      effectAllowed: 'move',
      types: [] as string[],
      getData: (type: string) => values.get(type) || '',
      setData: (type: string, value: string) => {
        values.set(type, value);
        dataTransfer.types = [...values.keys()];
      },
    };
    fireEvent.dragStart(vacation, { dataTransfer });
    const target = container.querySelector<HTMLElement>('[data-planning-drop-date="2026-08-13"]')!;
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });
    expect(onMoveAbsence).toHaveBeenCalledWith(expect.objectContaining({ id: 7, status: 'approved' }), '2026-08-13');
  });
});
