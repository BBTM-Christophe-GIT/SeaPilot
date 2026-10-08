import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PlanningFleetTimelineRow } from './PlanningTimeline';
import { buildPlanningTimeline } from './planningModel';
import { PLANNING_AUDIT_LABELS, type PlanningAudit } from './planningAudits';
import type { PlanningVesselVisit } from './planningVisitQueries';

const audit: PlanningAudit = { id: 'internal', kind: 'internal_ism', siteId: '2', siteName: 'GOURY', vesselId: 2,
  plannedOn: '2026-08-11', performedOn: null, title: 'Grille GOURY', status: 'planned', canOpen: true };
const props = {
  crewCount: 0, dayWidth: 110, days: buildPlanningTimeline('2026-08-11', 'week'), editable: false, expanded: true, hasBoards: false,
  lane: { key: 'vessel-2', vesselId: 2, label: 'GOURY', detail: '', vessel: 'GOURY', projects: [], assignments: [], locations: [] },
  onAddBoard: vi.fn(), onAssignPerson: vi.fn(), onCreateVisit: vi.fn(), onMove: vi.fn(), onOpen: vi.fn(), onOpenCell: vi.fn(),
  onOpenVessel: vi.fn(), onOpenVisit: vi.fn(), onMoveVisit: vi.fn(), onResize: vi.fn(), onResizeVisit: vi.fn(),
  onSelect: vi.fn(), onToggle: vi.fn(), pendingId: null, selectedId: null, touchDropTarget: null, visits: [],
};
const provider = { id: 28, name: 'APAVE', category: '', serviceType: '', activity: '', address: '', city: '', phone: '',
  companyEmail: '', supplies: '', specialties: [], contactName: '', contactRole: '', contactPhone: '', contactEmail: '' };
const visit: PlanningVesselVisit = { id: 1, vesselId: 2, visitType: 'crane_visit', providerId: 28, provider, comments: '',
  occurrences: [{ id: 1, scheduledAt: '2026-08-11T07:00:00Z', scheduledOn: '2026-08-11' }], attachments: [], createdAt: '', updatedAt: '' };

describe('Audit bars use the visit presentation', () => {
  it('stacks all five audit kinds with visits on the same date and opens the right audit', async () => {
    const user = userEvent.setup(); const onOpenAudit = vi.fn();
    const audits = (Object.keys(PLANNING_AUDIT_LABELS) as PlanningAudit['kind'][]).map((kind) => ({ ...audit, kind, id: kind }));
    const { container } = render(<PlanningFleetTimelineRow {...props} visits={[visit]} audits={audits} onOpenAudit={onOpenAudit} />);
    const bars = container.querySelectorAll<HTMLElement>('.planning-visit-bar');
    expect(bars).toHaveLength(6);
    expect(new Set(Array.from(bars).map((bar) => bar.style.marginTop)).size).toBe(6);
    for (const item of audits) {
      const button = screen.getByRole('button', { name: `${PLANNING_AUDIT_LABELS[item.kind]} · GOURY, 11/08/2026` });
      expect(button).toHaveClass('planning-visit-bar'); expect(button).not.toHaveAttribute('draggable', 'true');
      await user.click(button); expect(onOpenAudit).toHaveBeenLastCalledWith(item);
    }
  });
  it('keeps the audit on its planned day even when its actual date differs and excludes other periods', () => {
    render(<PlanningFleetTimelineRow {...props} audits={[{ ...audit, performedOn: '2026-08-15', status: 'completed' },
      { ...audit, id: 'later', kind: 'ovid', plannedOn: '2026-09-01' }]} />);
    expect(screen.getByRole('button', { name: 'Audit ISM Interne · GOURY, 11/08/2026' })).toHaveAttribute('title', expect.stringContaining('Réalisé'));
    expect(screen.queryByRole('button', { name: /OVID · GOURY/ })).not.toBeInTheDocument();
  });
  it('shows a shore audit without offering vessel edits', async () => {
    const onOpenAudit = vi.fn(); const shore = { ...audit, vesselId: null, siteName: 'Yard - LE HAVRE' };
    render(<PlanningFleetTimelineRow {...props} lane={{ ...props.lane, vesselId: null, vessel: shore.siteName, label: shore.siteName }}
      audits={[shore]} onOpenAudit={onOpenAudit} />);
    await userEvent.click(screen.getByRole('button', { name: 'Audit ISM Interne · Yard - LE HAVRE, 11/08/2026' }));
    expect(onOpenAudit).toHaveBeenCalledWith(shore);
    expect(screen.queryByRole('button', { name: /Ajouter une visite/ })).not.toBeInTheDocument();
  });
  it('keeps the Projects view dedicated to operations', () => {
    render(<PlanningFleetTimelineRow {...props} projectsOnly audits={[audit]} />);
    expect(screen.queryByRole('button', { name: /Audit ISM Interne · GOURY/ })).not.toBeInTheDocument();
  });
});
