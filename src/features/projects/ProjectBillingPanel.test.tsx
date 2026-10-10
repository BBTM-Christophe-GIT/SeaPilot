import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectBillingPanel } from './ProjectBillingPanel';
import type { ProjectRecord } from './projectQueries';
import type { ProjectBillingData, ProjectBillingDpr } from './projectBilling';

const mocks = vi.hoisted(() => ({ data: vi.fn(), catalog: vi.fn(), dprs: vi.fn(), export: vi.fn(), saveService: vi.fn() }));
vi.mock('./projectBilling', async original => ({
  ...await original<typeof import('./projectBilling')>(),
  fetchProjectBillingData: mocks.data, fetchProjectServiceCatalog: mocks.catalog, fetchProjectBillingDprs: mocks.dprs,
  generateBillingExportPackage: mocks.export, saveProjectBillingService: mocks.saveService,
}));
vi.mock('./projectBillingReferences', async original => ({ ...await original<typeof import('./projectBillingReferences')>(), fetchBillingReferences: vi.fn().mockResolvedValue([]) }));
vi.mock('../serviceProviders/serviceProviders', async original => ({ ...await original<typeof import('../serviceProviders/serviceProviders')>(), fetchServiceProviders: vi.fn().mockResolvedValue([]) }));
vi.mock('./ProjectPdfPreview', () => ({ ProjectPdfPreview: () => <div>PDF de recette</div> }));

const project = { id: 144, projectCode: 'P144', title: 'GUARD VESSEL EMDT', primaryVesselName: 'GOURY' } as ProjectRecord;
const service = { id: 2, billingPeriodId: 1, serviceCatalogId: 7, category: 'Spread Antipollution', descriptionHtml: '', unitAmountHt: 92.58, quantity: 28 };
const dprs: ProjectBillingDpr[] = Array.from({ length: 29 }, (_, index) => ({
  id: index + 1, reportDate: `2026-09-${String(index + 1).padStart(2, '0')}`, vesselId: 1, vesselName: 'GOURY',
  operation: index === 0 ? '24/24 Weather Stand-by' : index === 7 || index === 21 ? '24/24 Crew Change' : '24/24 Operation',
  amountHt: 0, vesselStatus: '', arrivalAt: '', departureAt: '', fuelLiters: null,
}));
const data: ProjectBillingData = {
  periods: [{ id: 1, projectId: 144, companyId: 1, periodMonth: '2026-09-01', clientReference: '', invoiceNumber: '', invoiceIssuedOn: '', invoiceSentOn: '', paymentDueOn: '', paidOn: '', amountHt: 0, comments: '', includeOperationsInPdf: false, includeExpensesInPdf: false, includeBbtmInPdf: true, excludedOperationKeys: ['dpr:1'] }],
  services: [service], expenses: [], documents: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.data.mockResolvedValue(data);
  mocks.catalog.mockResolvedValue([{ ...service, active: true }]);
  mocks.dprs.mockResolvedValue(dprs);
  mocks.export.mockResolvedValue({ blob: new Blob(['fixture'], { type: 'application/pdf' }), extension: 'pdf' });
  mocks.saveService.mockResolvedValue({ ...service, quantity: 29 });
});
function renderPanel(projectRecord = project, workspace = false) {
  render(<ProjectBillingPanel client={{} as never} project={projectRecord} operations={[]} isManager initialMonth="2026-09" workspace={workspace} />);
}

describe('P144 Spread Antipollution monthly rule', () => {
  it('selects a custom range in the permanent calendar while retaining the whole-month P144 quantity', async () => {
    const user = userEvent.setup();
    renderPanel(project, true);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Prévisualiser le PDF' })).toBeEnabled());
    const calendar = screen.getByRole('region', { name: 'Calendrier de facturation' });
    expect(within(calendar).getAllByRole('button', { pressed: true })).toHaveLength(30);
    expect(within(calendar).getByRole('heading', { name: 'août 2026' })).toBeVisible();
    expect(within(calendar).getByRole('heading', { name: 'octobre 2026' })).toBeVisible();
    expect(screen.queryByLabelText('Période')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Début')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Fin')).not.toBeInTheDocument();
    await user.click(within(calendar).getByRole('button', { name: 'mardi 15 septembre 2026' }));
    await waitFor(() => expect(within(calendar).getByRole('button', { name: 'dimanche 20 septembre 2026' })).toBeEnabled());
    await user.click(within(calendar).getByRole('button', { name: 'dimanche 20 septembre 2026' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Prévisualiser le PDF' })).toBeEnabled());
    expect(within(calendar).getAllByRole('button', { pressed: true })).toHaveLength(6);
    await user.click(screen.getByRole('button', { name: 'Prévisualiser le PDF' }));
    await waitFor(() => expect(mocks.export).toHaveBeenCalledWith({}, expect.objectContaining({
      startDate: '2026-09-15', endDate: '2026-09-20',
      services: [expect.objectContaining({ quantity: 29, unitAmountHt: 92.58 })], monthlyDprs: dprs,
    }), [], 'pdf'));
    expect(mocks.export.mock.calls[0][1].dprs).toHaveLength(6);
  });
  it('recalculates an existing 28-unit line to 29, including a missing DPR day and excluded weather rent', async () => {
    renderPanel(project, true);
    await waitFor(() => expect(screen.getByLabelText('Nombre d’unités')).toHaveValue(29));
    fireEvent.click(screen.getByRole('button', { name: /^Prestations BBTM/ }));
    expect(screen.getByLabelText('Nombre d’unités')).toHaveAttribute('readonly');
    expect((screen.getByLabelText('Montant total HT') as HTMLInputElement).value).toMatch(/2\s?684,82/);
    expect(screen.getByLabelText('Totaux sélectionnés pour l’export')).toHaveTextContent(/2\s?684,82/);
    expect(screen.getByText(/jours du mois − jours 24\/24 Weather Stand-by/)).toBeVisible();
  });
  it('saves and exports the calculated quantity using the existing unit price', async () => {
    const user = userEvent.setup();
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText('Nombre d’unités')).toHaveValue(29));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(mocks.saveService).toHaveBeenCalledWith({}, 144, 1, expect.objectContaining({ category: 'Spread Antipollution', quantity: 29, unitAmountHt: 92.58 }), 2));
    await user.click(screen.getByRole('button', { name: 'Actualiser l’aperçu' }));
    await waitFor(() => expect(mocks.export).toHaveBeenCalledWith({}, expect.objectContaining({ services: [expect.objectContaining({ quantity: 29, unitAmountHt: 92.58 })], monthlyDprs: dprs }), [], 'pdf'));
  });
  it('loads all monthly weather days for a partial export while retaining only the chosen operations', async () => {
    const user = userEvent.setup();
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText('Nombre d’unités')).toHaveValue(29));
    await user.selectOptions(screen.getByLabelText('Période'), 'custom');
    fireEvent.change(screen.getByLabelText('Début'), { target: { value: '2026-09-15' } });
    await waitFor(() => expect(mocks.dprs).toHaveBeenLastCalledWith({}, 144, '2026-09-01', '2026-09-30', ''));
    await user.click(screen.getByRole('button', { name: 'Actualiser l’aperçu' }));
    await waitFor(() => expect(mocks.export).toHaveBeenCalled());
    const exported = mocks.export.mock.calls.at(-1)![1];
    expect(exported.services[0].quantity).toBe(29);
    expect(exported.monthlyDprs[0].reportDate).toBe('2026-09-01');
    expect(exported.dprs.every((dpr: ProjectBillingDpr) => dpr.reportDate >= '2026-09-15')).toBe(true);
  });
  it('preserves editable quantities on other projects', async () => {
    renderPanel({ ...project, projectCode: 'P145' });
    await waitFor(() => expect(screen.getByLabelText('Nombre d’unités')).toHaveValue(28));
    expect(screen.getByLabelText('Nombre d’unités')).not.toHaveAttribute('readonly');
    fireEvent.change(screen.getByLabelText('Nombre d’unités'), { target: { value: '7' } });
    expect(screen.getByLabelText('Nombre d’unités')).toHaveValue(7);
  });
});
