import type { SupabaseClient } from '@supabase/supabase-js';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanningP13Panel } from '../planning/PlanningP13Panel';
import { EMPTY_PLANNING_OVERVIEW, usePlanningOverview } from '../planning/usePlanningOverview';
import { WorkingTimePage } from './WorkingTimePage';
import { WorkingTimeWorkflowPanel } from './WorkingTimeWorkflowPanel';

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

  it('renders the dedicated route surface with the existing P1.3 work/rest controls', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Suivi du Temps de Travail' })).toBeInTheDocument();
    expect(screen.getByText(/planning_work_rest_policies/)).toBeInTheDocument();
    expect(screen.getByTestId('work-rest-surface')).toBeInTheDocument();
    expect(screen.getByTestId('workflow-surface')).toBeInTheDocument();
    expect(WorkingTimeWorkflowPanel).toHaveBeenCalledWith(expect.objectContaining({
      client,
      currentPerson: expect.objectContaining({ id: 42 }),
      range: { start: '2026-08-01', end: '2026-08-31' },
      roles: ['admin'],
    }), undefined);
    expect(PlanningP13Panel).toHaveBeenCalledWith(expect.objectContaining({
      client,
      presentation: 'page',
      initialTab: 'rest',
      visibleTabs: ['rest'],
      canManageWorkRestPolicies: true,
      canViewWorkRest: true,
      range: { start: '2026-08-01', end: '2026-08-31' },
    }), undefined);
  });

  it('keeps policy administration restricted to administrators', () => {
    renderPage(['marin']);

    expect(PlanningP13Panel).toHaveBeenCalledWith(expect.objectContaining({
      canManageWorkRestPolicies: false,
      canViewWorkRest: true,
    }), undefined);
  });

  it('validates the selected period and refreshes the shared planning overview', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Actualiser le suivi' }));
    expect(reload).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('Au'), { target: { value: '2026-07-31' } });
    expect(screen.getByRole('alert')).toHaveTextContent('La date de fin doit être postérieure ou égale à la date de début.');
    expect(screen.queryByTestId('work-rest-surface')).not.toBeInTheDocument();
  });
});
