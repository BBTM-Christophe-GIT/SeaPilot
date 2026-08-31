import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingElementsPage } from './BillingElementsPage';

const mocks = vi.hoisted(() => ({
  fetchProjectsData: vi.fn(),
}));

vi.mock('./projectQueries', async (importOriginal) => ({
  ...await importOriginal<typeof import('./projectQueries')>(),
  fetchProjectsData: mocks.fetchProjectsData,
}));

vi.mock('./ProjectBillingPanel', () => ({
  ProjectBillingPanel: ({ initialMonth, project, visibleSections }: {
    initialMonth: string;
    project: { projectCode: string };
    visibleSections: Record<string, boolean>;
  }) => (
    <div data-testid="billing-panel">
      {project.projectCode} · {initialMonth} · {JSON.stringify(visibleSections)}
    </div>
  ),
}));

const projectsData = {
  projects: [
    { id: 2, projectCode: 'P102', title: 'Projet archivé', archivedAt: '2026-08-01T00:00:00Z' },
    { id: 1, projectCode: 'P101', title: 'Mission Atlantique', archivedAt: '' },
  ],
  projectContracts: [{ id: 10, projectId: 1, archivedAt: '' }],
  planningOccurrences: [{ id: 20, projectId: 1 }],
  contractHirePeriods: [],
  projectDocuments: [],
  contractDocuments: [],
  operationDocuments: [],
  clients: [],
  towedAssets: [],
  vessels: [],
  warnings: [],
};

describe('BillingElementsPage', () => {
  beforeEach(() => {
    mocks.fetchProjectsData.mockReset();
    mocks.fetchProjectsData.mockResolvedValue(projectsData);
  });

  it('selects a project, a month and the displayed billing categories', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/modules/billingElements']}>
        <BillingElementsPage client={{} as never} roles={['direction']} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('dialog', { name: 'Éléments de facturation' })).toBeInTheDocument();
    const projectSelector = await screen.findByRole('combobox', { name: 'Projet' });
    expect(screen.getByRole('option', { name: 'P101 — Mission Atlantique' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Projet archivé/ })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Services refacturables/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Prestation BBTM/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Éléments de facturation/ })).toBeChecked();

    await user.selectOptions(projectSelector, '1');
    expect(await screen.findByTestId('billing-panel')).toHaveTextContent('P101');

    fireEvent.change(screen.getByLabelText('Mois de facturation'), { target: { value: '2026-07' } });
    await waitFor(() => expect(screen.getByTestId('billing-panel')).toHaveTextContent('2026-07'));

    await user.click(screen.getByRole('checkbox', { name: /Services refacturables/ }));
    expect(screen.getByTestId('billing-panel')).toHaveTextContent('"services":false');
  });
});
