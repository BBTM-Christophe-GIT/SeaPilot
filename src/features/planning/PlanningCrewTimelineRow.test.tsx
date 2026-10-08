import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildPlanningTimeline, type PlanningCrewEvent } from './planningModel';
import { PlanningCrewTimelineRow } from './PlanningTimeline';

const days = buildPlanningTimeline('2026-09-01', 'month');
const event: PlanningCrewEvent = {
  id: 'assignment-545', assignmentId: 545, kind: 'assignment',
  personId: 15, person: 'Christophe MINASSIAN', vesselId: 13, vessel: 'Armement - Cherbourg',
  board: '', functionLabel: 'Équipage', status: 'Arrêt de travail', confirmationStatus: 'confirmed',
  startsOn: '2026-09-03', endsOn: '2026-09-11', startsAt: '', endsAt: '',
  responsible: '', rhythm: '', comments: '', sourceLabel: 'seapilot',
  dailyStatuses: Object.fromEntries(days.filter((day) => day.date >= '2026-09-03' && day.date <= '2026-09-11')
    .map((day) => [day.date, 'Arrêt Maladie'])),
};

function renderRow(item = event, conflicts = new Map<string, Set<string>>()) {
  return render(<PlanningCrewTimelineRow
    lane={{ key: 'person-15', label: item.person, detail: '', personId: 15, vesselId: 13,
      vessel: item.vessel, watchGroup: '', events: [item] }}
    days={days} dayWidth={52} editable pendingId={null} selectedId={null}
    conflictDatesByEvent={conflicts} balances={new Map()}
    onCreate={vi.fn()} onMove={vi.fn()} onOpen={vi.fn()} onResize={vi.fn()} onSelect={vi.fn()}
  />);
}

describe('crew daily status rendering', () => {
  it('keeps the Fleet daily sickness decision across the period, including both resize caps', () => {
    const { container } = renderRow();
    const bar = container.querySelector<HTMLElement>('.planning-crew-bar')!;
    expect(bar).toHaveClass('is-sick-leave');
    expect(bar).not.toHaveClass('is-sick', 'has-conflict');
    expect(bar).toHaveAccessibleName(/Christophe MINASSIAN, Arrêt Maladie/);
    expect(bar.style.backgroundImage).toBe('linear-gradient(to right, var(--crew-state-sick-leave) 50%, var(--crew-state-sick-leave) 50%)');
    expect(container.querySelectorAll('.planning-assignment-note-cell.is-sick-leave')).toHaveLength(9);
    expect(screen.getAllByText('Arrêt Maladie')).toHaveLength(1);
    expect(screen.queryByText('Arrêt de travail')).not.toBeInTheDocument();
    expect(bar.querySelectorAll('.planning-resize-handle')).toHaveLength(2);
  });

  it('keeps different statuses within one period and gives each cap its own day status', () => {
    const { container } = renderRow({ ...event, dailyStatuses: { ...event.dailyStatuses, '2026-09-03': 'A Terre' } });
    const bar = container.querySelector<HTMLElement>('.planning-crew-bar')!;
    expect(bar.style.backgroundImage).toBe('linear-gradient(to right, var(--crew-state-shore) 50%, var(--crew-state-sick-leave) 50%)');
    expect(bar).not.toHaveClass('has-conflict');
    expect(container.querySelector('.planning-assignment-note-cell.is-first')).toHaveClass('is-shore');
    expect(container.querySelector('.planning-assignment-note-cell.is-last')).toHaveClass('is-sick-leave');
    expect(screen.queryByText('Arrêt de travail')).not.toBeInTheDocument();
  });

  it('still marks an actual unresolved conflict on its affected day', () => {
    const { container } = renderRow(event, new Map([[event.id, new Set(['2026-09-03'])]]));
    expect(container.querySelector('.planning-crew-bar')).toHaveClass('has-conflict');
    expect(container.querySelectorAll('.planning-assignment-note-cell.has-conflict')).toHaveLength(1);
    expect(container.querySelector<HTMLElement>('.planning-crew-bar')!.style.backgroundImage).toBe('');
  });
});
