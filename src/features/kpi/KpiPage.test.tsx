import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KpiPage } from './KpiPage';
import * as reportData from './qhseReportData';
import * as actionData from '../actionPlan/actionPlanQueries';
vi.mock('./QhseReportComposer', () => ({ QhseReportComposer: ({ disabled, scopeKey }: { disabled: boolean; scopeKey: string }) => <button disabled={disabled} data-scope={scopeKey}>Atelier PDF</button> }));
function snapshot(scope: reportData.QhseReportScope): reportData.QhseReportSnapshot {
  return { scope, actions: [], actionTypes: [], hseDashboard: null, reports: [], metrics: [], hseActions: [], exercises: [], portCalls: [], supplies: [], waste: [], incidents: [], certificates: [], visits: [], people: [], hrDocuments: [], safetyEvents: [], exposureRecords: [], procedures: { procedures: [], publications: [] }, warnings: [] };
}
describe('KPI executive workspace', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(actionData, 'fetchActionPlanData').mockResolvedValue({ actions: [], actionTypes: [], vessels: [{ id: 1, name: 'GOURY' }], hseDashboard: null } as never);
    vi.spyOn(reportData, 'fetchQhseReportProjectOptions').mockResolvedValue([{ id: 144, label: 'P144 · EMDT' }]);
    vi.spyOn(reportData, 'fetchQhseReportSnapshot').mockImplementation(async (_, scope) => snapshot(scope));
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.open = true; }); HTMLDialogElement.prototype.close = vi.fn();
  });
  it('shares multi-select filters with the synthesis and PDF without substituting missing rates', async () => {
    const user = userEvent.setup(); render(<MemoryRouter><KpiPage client={{} as never} /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Pilotage QHSE' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Atelier PDF' })).toBeEnabled());
    expect(screen.getByRole('article', { name: 'TF / LTIFR' })).toHaveTextContent('—');
    await user.click(screen.getByText('Projets', { exact: true }));
    await user.click(screen.getByLabelText('P144 · EMDT'));
    expect(screen.getByRole('button', { name: 'Atelier PDF' })).toBeDisabled();
    await waitFor(() => expect(reportData.fetchQhseReportSnapshot).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ projectIds: [144] }), expect.anything()));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Atelier PDF' })).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Atelier PDF' }).getAttribute('data-scope')).toContain('144');
    await user.click(screen.getByText('Années', { exact: true }));
    const years = within(screen.getByRole('group', { name: 'Années des indicateurs et rapports QHSE' }));
    await user.click(years.getByLabelText('2024'));
    await waitFor(() => expect(reportData.fetchQhseReportSnapshot).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ years: expect.arrayContaining([2024, new Date().getFullYear()]) }), expect.anything()));
    await user.click(screen.getByRole('button', { name: 'Définitions' }));
    expect(screen.getByRole('dialog', { name: 'Définitions et formules' })).toHaveTextContent('les taux annuels ne sont jamais moyennés');
  });
  it('allows retry on connection failure and never leaves export enabled', async () => {
    const user = userEvent.setup(); vi.mocked(actionData.fetchActionPlanData).mockRejectedValueOnce(new Error('offline'));
    render(<MemoryRouter><KpiPage client={{} as never} /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger');
    expect(screen.getByRole('button', { name: 'Atelier PDF' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Atelier PDF' })).toBeEnabled());
  });
});
