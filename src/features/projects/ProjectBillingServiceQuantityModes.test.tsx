import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectBillingPanel } from './ProjectBillingPanel';
import type { ProjectBillingData, ProjectBillingDpr, ProjectBillingPeriod, ProjectBillingService, ProjectServiceCatalogEntry } from './projectBilling';
import type { ProjectRecord } from './projectQueries';

const mocks = vi.hoisted(() => ({ data: vi.fn(), catalog: vi.fn(), dprs: vi.fn(), save: vi.fn(), export: vi.fn() }));
vi.mock('./projectBilling', async original => ({
  ...await original<typeof import('./projectBilling')>(),
  fetchProjectBillingData: mocks.data,
  fetchProjectServiceCatalog: mocks.catalog,
  fetchProjectBillingDprs: mocks.dprs,
  saveProjectBillingService: mocks.save,
  generateBillingExportPackage: mocks.export,
}));
vi.mock('./projectBillingReferences', async original => ({
  ...await original<typeof import('./projectBillingReferences')>(), fetchBillingReferences: vi.fn().mockResolvedValue([]),
}));
vi.mock('../serviceProviders/serviceProviders', async original => ({
  ...await original<typeof import('../serviceProviders/serviceProviders')>(), fetchServiceProviders: vi.fn().mockResolvedValue([]),
}));
vi.mock('./ProjectPdfPreview', () => ({ ProjectPdfPreview: () => <div>Aperçu de recette</div> }));

const client = {} as never;
const project = { id: 144, projectCode: 'P144', title: 'GUARD VESSEL EMDT', primaryVesselName: 'GOURY' } as ProjectRecord;
function period(id = 10, month = '2026-09'): ProjectBillingPeriod {
  return {
    id, projectId: project.id, companyId: 1, periodMonth: `${month}-01`, clientReference: 'REF-GLOBALE',
    invoiceNumber: '', invoiceIssuedOn: '', invoiceSentOn: '', paymentDueOn: '', paidOn: '', amountHt: 0, comments: '',
    includeOperationsInPdf: false, includeExpensesInPdf: false, includeBbtmInPdf: true, includeRawInPdf: false,
    excludedOperationKeys: ['dpr:6'],
  };
}
function service(overrides: Partial<ProjectBillingService> = {}): ProjectBillingService {
  return {
    id: 21, billingPeriodId: 10, serviceCatalogId: 7, category: 'Assistance', descriptionHtml: '', unitAmountHt: 100,
    quantity: 2, quantityMode: 'manual', quantityOperationTypes: [], clientReference: 'REF-PRESTATION', ...overrides,
  };
}
function dpr(id: number, day: number, operation: string, vesselName = 'GOURY'): ProjectBillingDpr {
  return { id, reportDate: `2026-09-${String(day).padStart(2, '0')}`, vesselId: vesselName === 'GOURY' ? 1 : 2,
    vesselName, operation, amountHt: 0, vesselStatus: '', arrivalAt: '', departureAt: '', fuelLiters: null };
}
let stored: ProjectBillingData;
let catalog: ProjectServiceCatalogEntry[];
function line() { return screen.getByRole('group', { name: 'Prestation 1 : Assistance' }); }
function field(label: string) { return within(line()).getByLabelText(label, { exact: true }); }
async function mount(isManager = true) {
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(<ProjectBillingPanel client={client} project={project} operations={[]} isManager={isManager} initialMonth="2026-09" visibleSections={{ services: false, bbtm: true, billingElements: true, raw: false }} />); });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Actualiser l’aperçu' })).toBeEnabled(), { timeout: 5000 });
  return view;
}
async function saveLine() {
  const previous = mocks.save.mock.calls.length;
  await userEvent.click(within(line()).getByRole('button', { name: 'Enregistrer' }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(previous + 1));
  await waitFor(() => expect(within(line()).getByRole('button', { name: 'Enregistrer' })).toBeEnabled());
}
async function customRange(start: string, end: string) {
  await userEvent.selectOptions(screen.getByLabelText('Période', { exact: true }), 'custom');
  fireEvent.change(screen.getByLabelText('Début', { exact: true }), { target: { value: start } });
  fireEvent.change(screen.getByLabelText('Fin', { exact: true }), { target: { value: end } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Actualiser l’aperçu' })).toBeEnabled());
}

beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset());
  stored = { periods: [period(), period(11, '2026-10')], services: [service()], expenses: [], documents: [], rawLines: [] };
  catalog = [{ id: 7, companyId: 1, category: 'Assistance', descriptionHtml: '', unitAmountHt: 100,
    active: true, createdAt: '', updatedAt: '', quantityMode: 'manual', quantityOperationTypes: [],
    defaultQuantity: 0, clientReference: 'REF-CATALOGUE' }];
  mocks.data.mockImplementation(async () => structuredClone(stored));
  mocks.catalog.mockImplementation(async () => structuredClone(catalog));
  mocks.dprs.mockResolvedValue([]);
  mocks.save.mockImplementation(async (_client, _projectId, billingPeriodId, draft, id) => {
    const saved = { ...draft, billingPeriodId, id: id ?? 99 };
    stored.services = [saved, ...stored.services.filter(item => item.id !== saved.id)];
    return structuredClone(saved);
  });
  mocks.export.mockResolvedValue({ blob: new Blob(['PDF'], { type: 'application/pdf' }), extension: 'pdf' });
});

describe('editable billing service quantities and client references', () => {
  it('saves, edits and reloads the same manual service including a valid zero quantity', async () => {
    let view = await mount();
    expect(field('Mode de quantité')).toHaveValue('manual');
    expect(field('Nombre d’unités')).not.toHaveAttribute('readonly');
    fireEvent.change(field('Nombre d’unités'), { target: { value: '7' } });
    fireEvent.change(field('Référence client de la prestation'), { target: { value: 'REF-MODIFIEE' } });
    await saveLine();
    expect(mocks.save).toHaveBeenLastCalledWith(client, 144, 10, expect.objectContaining({ quantityMode: 'manual', quantity: 7, clientReference: 'REF-MODIFIEE' }), 21);
    fireEvent.change(field('Nombre d’unités'), { target: { value: '0' } });
    await saveLine();
    expect(mocks.save).toHaveBeenLastCalledWith(client, 144, 10, expect.objectContaining({ quantityMode: 'manual', quantity: 0, clientReference: 'REF-MODIFIEE' }), 21);
    expect(stored.services).toHaveLength(1);
    view.unmount();
    view = await mount();
    expect(field('Nombre d’unités')).toHaveValue(0);
    expect(field('Mode de quantité')).toHaveValue('manual');
    expect(field('Référence client de la prestation')).toHaveValue('REF-MODIFIEE');
    expect(field('Nombre d’unités')).not.toHaveAttribute('readonly');
    view.unmount();
  });

  it('recomputes period and calendar-month modes when the selected range or month changes', async () => {
    stored.services = [service({ quantityMode: 'period' }), service({ id: 22, billingPeriodId: 11, quantityMode: 'period' })];
    await mount();
    expect(field('Nombre d’unités')).toHaveValue(30);
    expect(field('Nombre d’unités')).toHaveAttribute('readonly');
    await customRange('2026-09-15', '2026-09-20');
    await waitFor(() => expect(field('Nombre d’unités')).toHaveValue(6));
    await saveLine();
    expect(mocks.save).toHaveBeenLastCalledWith(client, 144, 10, expect.objectContaining({ quantityMode: 'period', quantity: 6 }), 21);
    await userEvent.selectOptions(field('Mode de quantité'), 'month');
    expect(field('Nombre d’unités')).toHaveValue(30);
    await saveLine();
    expect(mocks.save).toHaveBeenLastCalledWith(client, 144, 10, expect.objectContaining({ quantityMode: 'month', quantity: 30 }), 21);
    fireEvent.change(screen.getByLabelText('Mois', { exact: true }), { target: { value: '2026-10' } });
    await waitFor(() => expect(field('Mode de quantité')).toHaveValue('period'));
    expect(field('Nombre d’unités')).toHaveValue(31);
    await saveLine();
    expect(mocks.save).toHaveBeenLastCalledWith(client, 144, 11, expect.objectContaining({ quantityMode: 'period', quantity: 31 }), 22);
    expect(stored.services).toHaveLength(2);
  });

  it('counts a union of chosen operation types once per vessel/day and exports the persisted rule and reference', async () => {
    stored.services = [service({ quantityMode: 'operations', quantityOperationTypes: ['24/24 Operation'] })];
    mocks.dprs.mockResolvedValue([
      dpr(1, 1, '24/24 Operation'), dpr(2, 1, '24/24 Crew Change'),
      dpr(3, 2, '24/24 Weather Stand-by'), dpr(8, 2, '24/24 Crew Change'),
      dpr(4, 3, ' 24/24   Crew Change '), dpr(5, 3, '24/24 Operation', 'AUTRE NAVIRE'),
      dpr(6, 4, '24/24 Operation'), dpr(0, 4, '24/24 Crew Change'), dpr(7, 12, '24/24 Operation'),
    ]);
    let view = await mount();
    await userEvent.click(within(line()).getByRole('checkbox', { name: '24/24 Crew Change' }));
    await customRange('2026-09-01', '2026-09-04');
    await waitFor(() => expect(field('Nombre d’unités')).toHaveValue(4));
    expect(within(line()).getByRole('checkbox', { name: '24/24 Operation' })).toBeChecked();
    expect(within(line()).getByRole('checkbox', { name: '24/24 Crew Change' })).toBeChecked();
    await saveLine();
    expect(mocks.save).toHaveBeenLastCalledWith(client, 144, 10, expect.objectContaining({ quantityMode: 'operations', quantity: 4,
      quantityOperationTypes: expect.arrayContaining(['24/24 Operation', '24/24 Crew Change']), clientReference: 'REF-PRESTATION' }), 21);
    await userEvent.click(screen.getByRole('button', { name: 'Actualiser l’aperçu' }));
    await waitFor(() => expect(mocks.export).toHaveBeenCalledWith(client, expect.objectContaining({
      startDate: '2026-09-01', endDate: '2026-09-04', period: expect.objectContaining({ clientReference: 'REF-GLOBALE' }),
      services: [expect.objectContaining({ id: 21, quantity: 4, quantityMode: 'operations', clientReference: 'REF-PRESTATION' })],
    }), [], 'pdf'));
    view.unmount();
    view = await mount();
    expect(field('Mode de quantité')).toHaveValue('operations');
    expect(within(line()).getByRole('checkbox', { name: '24/24 Operation' })).toBeChecked();
    expect(within(line()).getByRole('checkbox', { name: '24/24 Crew Change' })).toBeChecked();
    expect(field('Nombre d’unités')).toHaveValue(5);
    view.unmount();
  });

  it('requires at least one operation type while allowing a zero preview', async () => {
    stored.services = [service({ quantityMode: 'operations', quantityOperationTypes: [] })];
    await mount();
    expect(field('Nombre d’unités')).toHaveValue(0);
    await userEvent.click(within(line()).getByRole('button', { name: 'Enregistrer' }));
    await screen.findByText(/au moins un type d’opération/i);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('copies catalogue defaults into a new service and keeps its overridden reference independent of the global reference', async () => {
    stored.services = [];
    await mount();
    expect(field('Mode de quantité')).toHaveValue('manual');
    expect(field('Nombre d’unités')).toHaveValue(0);
    expect(field('Référence client de la prestation')).toHaveValue('REF-CATALOGUE');
    fireEvent.change(field('Référence client de la prestation'), { target: { value: 'REF-LIGNE' } });
    await saveLine();
    expect(mocks.save).toHaveBeenLastCalledWith(client, 144, 10, expect.objectContaining({ clientReference: 'REF-LIGNE', quantity: 0, quantityMode: 'manual' }), undefined);
    await userEvent.click(screen.getByRole('button', { name: 'Actualiser l’aperçu' }));
    await waitFor(() => expect(mocks.export).toHaveBeenCalledWith(client, expect.objectContaining({
      period: expect.objectContaining({ clientReference: 'REF-GLOBALE' }), services: [expect.objectContaining({ clientReference: 'REF-LIGNE' })],
    }), [], 'pdf'));
  });

  it('offers manual editing for an explicitly configured P144 Spread line and keeps read-only profiles unable to mutate', async () => {
    stored.services = [service({ category: 'Spread Antipollution', quantityMode: 'manual', quantity: 0 })];
    catalog = [{ ...catalog[0], category: 'Spread Antipollution' }];
    const view = await mount(false);
    const group = screen.getByRole('group', { name: 'Prestation 1 : Spread Antipollution' });
    expect(within(group).getByLabelText('Nombre d’unités')).toHaveValue(0);
    expect(within(group).getByLabelText('Mode de quantité')).toBeDisabled();
    expect(within(group).getByLabelText('Référence client de la prestation')).toBeDisabled();
    expect(within(group).getByLabelText('Nombre d’unités')).toBeDisabled();
    expect(within(group).queryByRole('button', { name: 'Enregistrer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Modifier la prestation/ })).not.toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
    view.unmount();
    await mount();
    const editable = screen.getByRole('group', { name: 'Prestation 1 : Spread Antipollution' });
    expect(within(editable).getByLabelText('Nombre d’unités')).toBeEnabled();
    expect(within(editable).getByLabelText('Nombre d’unités')).not.toHaveAttribute('readonly');
    expect(within(editable).getByLabelText('Nombre d’unités')).toHaveValue(0);
  });
});
