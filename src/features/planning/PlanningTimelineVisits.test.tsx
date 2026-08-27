import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { buildPlanningTimeline } from './planningModel';
import { buildPlanningProjectStack, PlanningCrewTimelineRow, PlanningFleetTimelineRow } from './PlanningTimeline';
import type { PlanningProjectRecord } from './planningQueries';
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
  supplies: '',
  specialties: [],
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
  it('stacks overlapping vessel projects and reuses a free sub-row', () => {
    const days = buildPlanningTimeline('2026-08-11', 'week');
    const projects = [
      { id: 1, startsOn: '2026-08-11', endsOn: '2026-08-13' },
      { id: 2, startsOn: '2026-08-12', endsOn: '2026-08-14' },
      { id: 3, startsOn: '2026-08-15', endsOn: '2026-08-16' },
    ];

    const stack = buildPlanningProjectStack(projects, days);

    expect(stack.count).toBe(2);
    expect(stack.stackById.get(1)).toBe(0);
    expect(stack.stackById.get(2)).toBe(1);
    expect(stack.stackById.get(3)).toBe(0);
  });

  it('renders overlapping vessel projects on separate visual sub-rows', () => {
    const project = (id: number, title: string, startsOn: string, endsOn: string): PlanningProjectRecord => ({
      id,
      title,
      startsOn,
      endsOn,
      description: '',
      clientName: '',
      primaryVesselId: 2,
      primaryVesselName: 'GOURY',
      secondaryVesselId: null,
      secondaryVesselName: '',
      eventType: 'operation',
      responsibleName: '',
      status: 'A planifier',
      sourceLabel: 'test',
    });
    const { container } = render(<PlanningFleetTimelineRow
      crewCount={4}
      dayWidth={110}
      days={buildPlanningTimeline('2026-08-11', 'week')}
      editable
      expanded
      hasBoards
      lane={{
        key: 'vessel-2',
        vesselId: 2,
        label: 'GOURY',
        detail: 'GRY',
        vessel: 'GOURY',
        projects: [
          project(1, 'Campagne Atlantique', '2026-08-11', '2026-08-13'),
          project(2, 'Inspection côtière', '2026-08-12', '2026-08-14'),
        ],
        assignments: [],
        locations: [],
      }}
      onAddBoard={vi.fn()}
      onAssignPerson={vi.fn()}
      onCreateVisit={vi.fn()}
      onMove={vi.fn()}
      onOpen={vi.fn()}
      onOpenCell={vi.fn()}
      onOpenVessel={vi.fn()}
      onOpenVisit={vi.fn()}
      onMoveVisit={vi.fn()}
      onResize={vi.fn()}
      onResizeVisit={vi.fn()}
      onSelect={vi.fn()}
      onToggle={vi.fn()}
      pendingId={null}
      selectedId={null}
      touchDropTarget={null}
      visits={[]}
    />);

    const row = container.querySelector<HTMLElement>('.planning-timeline-row.is-fleet')!;
    const bars = Array.from(container.querySelectorAll<HTMLElement>('.planning-project-bar'));
    expect(row).toHaveClass('has-project-stacks');
    expect(row).toHaveAttribute('data-project-stack-count', '2');
    expect(row.style.minHeight).toBe('101px');
    expect(bars.map((bar) => bar.dataset.projectStack)).toEqual(['0', '1']);
    expect(bars.map((bar) => bar.style.marginTop)).toEqual(['7px', '34px']);
  });

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
      onOpenCell={vi.fn()}
      onOpenVessel={vi.fn()}
      onOpenVisit={onOpenVisit}
      onMoveVisit={vi.fn()}
      onResize={vi.fn()}
      onResizeVisit={vi.fn()}
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

  it('renders one multi-day technical-stop bar and lets an editor move or resize it', () => {
    const technicalStop: PlanningVesselVisit = {
      ...visits[0],
      id: 9,
      visitType: 'technical_stop',
      occurrences: [
        { id: 91, scheduledAt: '2026-08-10T22:00:00Z', scheduledOn: '2026-08-11' },
        { id: 92, scheduledAt: '2026-08-13T21:59:00Z', scheduledOn: '2026-08-13' },
      ],
    };
    const onMoveVisit = vi.fn();
    const onResizeVisit = vi.fn();
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
      onMoveVisit={onMoveVisit}
      onOpen={vi.fn()}
      onOpenCell={vi.fn()}
      onOpenVessel={vi.fn()}
      onOpenVisit={vi.fn()}
      onResize={vi.fn()}
      onResizeVisit={onResizeVisit}
      onSelect={vi.fn()}
      onToggle={vi.fn()}
      pendingId={null}
      selectedId={null}
      touchDropTarget={null}
      visits={[technicalStop]}
    />);

    const bar = container.querySelector<HTMLButtonElement>('.planning-visit-bar.is-technical-stop')!;
    expect(bar).toHaveAttribute('draggable', 'true');
    expect(bar.style.gridColumn).toContain('span 3');
    expect(bar.querySelectorAll('.planning-resize-handle')).toHaveLength(2);

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
    fireEvent.dragStart(bar, { dataTransfer });
    const target = container.querySelector<HTMLElement>('[data-planning-drop-date="2026-08-14"]')!;
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });
    expect(onMoveVisit).toHaveBeenCalledWith(9, expect.objectContaining({ vesselId: 2 }), '2026-08-14');

    const endHandle = bar.querySelector<HTMLElement>('.planning-resize-handle.is-end')!;
    fireEvent.pointerDown(endHandle, { clientX: 100 });
    fireEvent.pointerMove(window, { clientX: 210 });
    fireEvent.pointerUp(window, { clientX: 210 });
    expect(onResizeVisit).toHaveBeenCalledWith(technicalStop, 'end', 1);
  });

  it('keeps technical-stop drag and resize controls hidden in read-only role views', () => {
    const technicalStop: PlanningVesselVisit = {
      ...visits[0],
      id: 10,
      visitType: 'technical_stop',
      occurrences: [
        { id: 101, scheduledAt: '2026-08-10T22:00:00Z', scheduledOn: '2026-08-11' },
        { id: 102, scheduledAt: '2026-08-12T21:59:00Z', scheduledOn: '2026-08-12' },
      ],
    };
    const { container } = render(<PlanningFleetTimelineRow
      crewCount={4}
      dayWidth={110}
      days={buildPlanningTimeline('2026-08-11', 'week')}
      editable={false}
      expanded
      hasBoards
      lane={{ key: 'vessel-2', vesselId: 2, label: 'GOURY', detail: 'GRY', vessel: 'GOURY', projects: [], assignments: [], locations: [] }}
      onAddBoard={vi.fn()}
      onAssignPerson={vi.fn()}
      onCreateVisit={vi.fn()}
      onMove={vi.fn()}
      onMoveVisit={vi.fn()}
      onOpen={vi.fn()}
      onOpenCell={vi.fn()}
      onOpenVessel={vi.fn()}
      onOpenVisit={vi.fn()}
      onResize={vi.fn()}
      onResizeVisit={vi.fn()}
      onSelect={vi.fn()}
      onToggle={vi.fn()}
      pendingId={null}
      selectedId={null}
      touchDropTarget={null}
      visits={[technicalStop]}
    />);

    const bar = container.querySelector<HTMLButtonElement>('.planning-visit-bar.is-technical-stop')!;
    expect(bar).toHaveAttribute('draggable', 'false');
    expect(bar.querySelector('.planning-resize-handle')).not.toBeInTheDocument();
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
