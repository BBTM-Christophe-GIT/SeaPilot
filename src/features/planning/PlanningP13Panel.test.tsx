import type { SupabaseClient } from '@supabase/supabase-js';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanningP13Panel } from './PlanningP13Panel';
import type { PlanningP13Data } from './planningP13';
import type { PlanningOverview } from './planningQueries';
import {
  deletePlanningDependency,
  fetchPlanningP13Data,
  markPlanningNotificationRead,
  refreshPlanningNotifications,
  savePlanningDependency,
  savePlanningWorkRestPolicy,
} from './planningP13Queries';
import { generatePlanningExport } from './planningP13Exports';
import { EMPTY_PLANNING_OVERVIEW } from './usePlanningOverview';

vi.mock('./planningP13Queries', () => ({
  deletePlanningDependency: vi.fn(), fetchPlanningP13Data: vi.fn(), markPlanningNotificationRead: vi.fn(),
  refreshPlanningNotifications: vi.fn(), savePlanningDependency: vi.fn(), savePlanningWorkRestPolicy: vi.fn(),
}));
vi.mock('./planningP13Exports', () => ({ generatePlanningExport: vi.fn() }));

const client = {} as SupabaseClient;
const overview: PlanningOverview = {
  ...EMPTY_PLANNING_OVERVIEW,
  vessels: [{ id: 1, name: 'COTENTIN', acronym: 'CTN', active: true }],
  people: [{ id: 10, firstName: 'Anne', lastName: 'MARTIN', functionLabel: 'Capitaine', gradeLabel: '', roleLabel: '', contractType: 'CDI', hiredOn: '', departedOn: '', active: true }],
  projects: [
    { id: 30, title: 'Maintenance', startsOn: '2026-08-01', endsOn: '2026-08-03', description: '', clientName: '', primaryVesselId: 1, primaryVesselName: 'COTENTIN', secondaryVesselId: null, secondaryVesselName: '', eventType: 'maintenance', responsibleName: '', status: 'Confirmé', sourceLabel: 'test' },
    { id: 31, title: 'Opération', startsOn: '2026-08-04', endsOn: '2026-08-10', description: '', clientName: '', primaryVesselId: 1, primaryVesselName: 'COTENTIN', secondaryVesselId: null, secondaryVesselName: '', eventType: 'operation', responsibleName: '', status: 'Confirmé', sourceLabel: 'test' },
  ],
  days: [{ id: 1, personId: 10, vesselId: 1, crewName: 'Anne MARTIN', captainName: '', vesselName: 'COTENTIN', workDate: '2026-08-04', disembarkOn: '', yearNumber: 2026, monthNumber: 8, monthLabel: 'Août', dayNumber: 4, functionLabel: 'Capitaine', sailorStatus: 'En mer', dayStatus: 'Travail', rhythmLabel: '', watchGroup: 'A', slot365: '', departureOn: '', workedHours: 14, rest24h: 10, cumulative7d: 80, consecutiveRestHours: 5, restPeriodCount: 3, nightWorkHours: 9, comments: '', sourceLabel: 'test' }],
};

const data: PlanningP13Data = {
  policies: [{ id: 1, name: 'Politique test', scope: 'company', vesselId: null, effectiveFrom: '2026-01-01', effectiveTo: '', maxWork24h: 12, minRest24h: 11, maxWork7d: 72, minRest7d: 96, minConsecutiveRestHours: 6, maxRestPeriods24h: 2, nightStartsAt: '22:00', nightEndsAt: '06:00', maxNightWork24h: 8, includeHandover: true, active: true, notes: '', updatedAt: '' }],
  notifications: [{ id: 5, notificationType: 'vacant_position', severity: 'critical', title: 'Poste vacant', body: 'Capitaine manquant', entityKind: 'conflict_case', entityId: 6, personId: null, vesselId: 1, dueOn: '2026-08-05', createdAt: '2026-08-01T08:00:00Z', readAt: '' }],
  dependencies: [],
  p12: { absences: [], conflictCases: [], conflictHistory: [], matrices: [] },
};

function renderPanel(overrides: Partial<React.ComponentProps<typeof PlanningP13Panel>> = {}) {
  const props: React.ComponentProps<typeof PlanningP13Panel> = {
    client, overview, range: { start: '2026-08-01', end: '2026-08-31' },
    canManageWorkRestPolicies: true, canViewDashboard: true, canViewWorkRest: true, canViewNotifications: true,
    canRefreshNotifications: false, canManageDependencies: true, canExport: true,
    onClose: vi.fn(), onAuditChange: vi.fn().mockResolvedValue(undefined), ...overrides,
  };
  render(<PlanningP13Panel {...props} />);
  return props;
}

describe('Planning P1.3 cockpit', () => {
  beforeEach(() => {
    vi.mocked(fetchPlanningP13Data).mockResolvedValue(data);
    vi.mocked(refreshPlanningNotifications).mockResolvedValue(0);
    vi.mocked(savePlanningWorkRestPolicy).mockResolvedValue(2);
    vi.mocked(savePlanningDependency).mockResolvedValue(3);
    vi.mocked(deletePlanningDependency).mockResolvedValue(3);
    vi.mocked(markPlanningNotificationRead).mockResolvedValue(5);
    vi.mocked(generatePlanningExport).mockResolvedValue({ blob: new Blob(['test']), fileName: 'planning.xlsx' });
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  it('renders the business dashboard and recipient notification count', async () => {
    renderPanel();
    expect(await screen.findByRole('heading', { name: 'Cockpit Planning P1.3' })).toBeInTheDocument();
    expect(screen.getByText('Navires en opération').closest('article')).toHaveTextContent('0');
    expect(screen.getByText('Taux de conformité').closest('article')).toHaveTextContent('0 %');
    expect(screen.getByRole('tab', { name: /Notifications/ })).toHaveTextContent('1');
  });

  it('limits a sailor cockpit to personal work/rest and notifications', async () => {
    renderPanel({ canManageWorkRestPolicies: false, canViewDashboard: false, canManageDependencies: false, canExport: false });
    expect(await screen.findByRole('tab', { name: 'Travail & repos' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: 'Tableau de bord' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Dépendances' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Exports' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nouvelle politique' })).not.toBeInTheDocument();
  });

  it('starts policy creation with blank administrator-owned thresholds and persists entered values', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText('Navires en opération');
    await user.click(screen.getByRole('tab', { name: 'Travail & repos' }));
    await user.click(screen.getByRole('button', { name: 'Nouvelle politique' }));
    const form = screen.getByRole('heading', { name: 'Nouvelle politique' }).closest('form')!;
    expect(within(form).getByLabelText('Travail max / 24 h')).toHaveValue(null);
    fireEvent.change(within(form).getByLabelText('Nom'), { target: { value: 'Politique direction' } });
    for (const [label, value] of [
      ['Travail max / 24 h', '12'], ['Repos min / 24 h', '11'], ['Travail max / 7 j', '72'],
      ['Repos min / 7 j', '96'], ['Repos consécutif min', '6'], ['Périodes de repos max', '2'], ['Travail de nuit max', '8'],
    ]) fireEvent.change(within(form).getByLabelText(label), { target: { value } });
    fireEvent.change(within(form).getByLabelText('Début de nuit'), { target: { value: '22:00' } });
    fireEvent.change(within(form).getByLabelText('Fin de nuit'), { target: { value: '06:00' } });
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(savePlanningWorkRestPolicy).toHaveBeenCalledWith(client, expect.objectContaining({ name: 'Politique direction', maxWork24h: 12, minRest7d: 96 })));
  });

  it('marks notifications read, creates a manual dependency and generates an Excel export', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText('Navires en opération');
    await user.click(screen.getByRole('tab', { name: /Notifications/ }));
    await user.click(screen.getByRole('button', { name: 'Marquer lue' }));
    expect(markPlanningNotificationRead).toHaveBeenCalledWith(client, 5, true);

    await user.click(screen.getByRole('tab', { name: 'Dépendances' }));
    await user.click(screen.getByRole('button', { name: 'Nouvelle dépendance' }));
    const dependencyEditor = screen.getByRole('heading', { name: 'Nouvelle dépendance' }).closest('form')!;
    await user.selectOptions(within(dependencyEditor).getByLabelText('Type'), 'maintenance_recommission');
    await user.click(within(dependencyEditor).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(savePlanningDependency).toHaveBeenCalledWith(client, expect.objectContaining({ predecessorId: 30, successorId: 31, dependencyType: 'maintenance_recommission' })));

    await user.click(screen.getByRole('tab', { name: 'Exports' }));
    await user.click(screen.getByRole('button', { name: 'Générer l’export' }));
    await waitFor(() => expect(generatePlanningExport).toHaveBeenCalledWith('schedule', 'xlsx', expect.objectContaining({ startsOn: '2026-08-01', endsOn: '2026-08-31' })));
  });
});
