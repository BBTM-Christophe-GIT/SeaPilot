import type { SupabaseClient } from '@supabase/supabase-js';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanningP13Panel } from '../planning/PlanningP13Panel';
import { EMPTY_PLANNING_OVERVIEW, usePlanningOverview } from '../planning/usePlanningOverview';
import { WorkingTimePage } from './WorkingTimePage';
import { WorkingTimeComplianceReport } from './WorkingTimeComplianceReport';
import { WorkingTimeHseKpiPanel } from './WorkingTimeHseKpiPanel';
import { WorkingTimeWorkflowPanel } from './WorkingTimeWorkflowPanel';
import { WorkingTimeImportWizard } from './WorkingTimeImportWizard';

vi.mock('../planning/PlanningP13Panel', () => ({
  PlanningP13Panel: vi.fn(() => <section data-testid="work-rest-surface">Surface P1.3</section>),
}));

vi.mock('../planning/usePlanningOverview', async (importOriginal) => {
  const original = await importOriginal<typeof import('../planning/usePlanningOverview')>();
  return { ...original, usePlanningOverview: vi.fn() };
});

vi.mock('./WorkingTimeWorkflowPanel', () => ({
  WorkingTimeWorkflowPanel: vi.fn(() => <section data-testid="workflow-surface">Workflow</section>),
}));

vi.mock('./WorkingTimeHseKpiPanel', () => ({
  WorkingTimeHseKpiPanel: vi.fn(() => <section data-testid="hse-kpi-surface">KPI HSE</section>),
}));

vi.mock('./WorkingTimeImportWizard', () => ({
  WorkingTimeImportWizard: vi.fn(() => <section data-testid="xlsm-import-surface">Import XLSM</section>),
}));

vi.mock('./WorkingTimeComplianceReport', () => ({
  WorkingTimeComplianceReport: vi.fn(() => <section data-testid="compliance-report-surface">Rapport de conformité</section>),
}));

const client = {} as SupabaseClient;
const reload = vi.fn().mockResolvedValue(true);

function renderPage(roles: Array<'admin' | 'marin'> = ['admin']) {
  return render(
    <MemoryRouter>
      <WorkingTimePage
        client={client}
        currentPerson={{ id: 42, firstName: 'Alex', lastName: 'Marin', functionLabel: 'Matelot', gradeLabel: '' }}
        initialRange={{ start: '2026-08-01', end: '2026-08-31' }}
        roles={roles}
      />
    </MemoryRouter>,
  );
}

describe('WorkingTimePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePlanningOverview).mockReturnValue({
      overview: EMPTY_PLANNING_OVERVIEW,
      updateOverview: vi.fn(),
      reload,
      hasLoaded: true,
      isInitialLoading: false,
      isRefreshing: false,
      loadErrorMessage: null,
    });
  });

  it('opens the import, HSE, report and work/rest cards in dedicated modal windows', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Suivi du Temps de Travail' })).toBeInTheDocument();
    expect(screen.getByTestId('workflow-surface')).toBeInTheDocument();
    expect(screen.queryByTestId('work-rest-surface')).not.toBeInTheDocument();
    expect(screen.queryByTestId('hse-kpi-surface')).not.toBeInTheDocument();
    expect(screen.queryByTestId('xlsm-import-surface')).not.toBeInTheDocument();
    expect(screen.queryByTestId('compliance-report-surface')).not.toBeInTheDocument();
    expect(WorkingTimeWorkflowPanel).toHaveBeenCalledWith(expect.objectContaining({
      client,
      currentPerson: expect.objectContaining({ id: 42 }),
      range: { start: '2026-08-01', end: '2026-08-31' },
      roles: ['admin'],
    }), undefined);

    let commandProps = vi.mocked(WorkingTimeWorkflowPanel).mock.calls.at(-1)?.[0];
    act(() => commandProps?.onOpenWorkRest?.());
    expect(screen.getByRole('dialog', { name: 'Contrôles travail et repos' })).toBeInTheDocument();
    expect(PlanningP13Panel).toHaveBeenCalledWith(expect.objectContaining({
      client,
      presentation: 'page',
      initialTab: 'rest',
      visibleTabs: ['notifications', 'rest'],
      canViewNotifications: true,
      canRefreshNotifications: true,
      canManageWorkRestPolicies: true,
      canViewWorkRest: true,
      range: { start: '2026-08-01', end: '2026-08-31' },
    }), undefined);

    act(() => commandProps?.onOpenHse?.());
    expect(screen.getByRole('dialog', { name: 'Exposition HSE / IMCA' })).toBeInTheDocument();
    expect(WorkingTimeHseKpiPanel).toHaveBeenCalledWith(expect.objectContaining({ client, roles: ['admin'] }), undefined);

    commandProps = vi.mocked(WorkingTimeWorkflowPanel).mock.calls.at(-1)?.[0];
    act(() => commandProps?.onOpenReport?.());
    expect(screen.getByRole('dialog', { name: 'Rapport de conformité' })).toBeInTheDocument();
    expect(WorkingTimeComplianceReport).toHaveBeenCalledWith(expect.objectContaining({ client, initialYear: 2026 }), undefined);

    commandProps = vi.mocked(WorkingTimeWorkflowPanel).mock.calls.at(-1)?.[0];
    act(() => commandProps?.onOpenImport?.());
    expect(screen.getByRole('dialog', { name: 'Import annuel XLSM' })).toBeInTheDocument();
    expect(WorkingTimeImportWizard).toHaveBeenCalledWith(expect.objectContaining({ client, roles: ['admin'] }), undefined);
  });

  it('keeps policy administration restricted to administrators', () => {
    renderPage(['marin']);

    const commandProps = vi.mocked(WorkingTimeWorkflowPanel).mock.calls.at(-1)?.[0];
    expect(commandProps?.onOpenImport).toBeUndefined();
    expect(commandProps?.onOpenHse).toBeUndefined();
    expect(commandProps?.onOpenReport).toBeUndefined();
    act(() => commandProps?.onOpenWorkRest?.());
    expect(PlanningP13Panel).toHaveBeenCalledWith(expect.objectContaining({
      canManageWorkRestPolicies: false,
      canViewWorkRest: true,
      canViewNotifications: false,
      visibleTabs: ['rest'],
    }), undefined);
    expect(screen.queryByTestId('xlsm-import-surface')).not.toBeInTheDocument();
  });

  it('switches complete calendar months and refreshes both workspaces from the command bar callbacks', async () => {
    renderPage();
    const commandProps = vi.mocked(WorkingTimeWorkflowPanel).mock.calls.at(-1)?.[0];
    await act(async () => { await commandProps?.onRefresh?.(); });
    expect(reload).toHaveBeenCalledTimes(1);
    act(() => commandProps?.onMonthChange?.(1));
    expect(WorkingTimeWorkflowPanel).toHaveBeenLastCalledWith(expect.objectContaining({
      range: { start: '2026-09-01', end: '2026-09-30' },
    }), undefined);
  });

  it('refreshes the working-time workspace immediately after an XLSM import', async () => {
    renderPage();
    expect(WorkingTimeWorkflowPanel).toHaveBeenLastCalledWith(expect.objectContaining({ refreshToken: 0 }), undefined);
    const commandProps = vi.mocked(WorkingTimeWorkflowPanel).mock.calls.at(-1)?.[0];
    act(() => commandProps?.onOpenImport?.());
    const importProps = vi.mocked(WorkingTimeImportWizard).mock.calls.at(-1)?.[0];

    await act(async () => { await importProps?.onImported?.(); });

    expect(reload).toHaveBeenCalledTimes(1);
    expect(WorkingTimeWorkflowPanel).toHaveBeenLastCalledWith(expect.objectContaining({ refreshToken: 1 }), undefined);
  });
});
