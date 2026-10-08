import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectBillingPanel } from './ProjectBillingPanel';
import type { ProjectRecord } from './projectQueries';
import type { BillingPeriodDraft, ProjectBillingData, ProjectBillingPeriod } from './projectBilling';

const mocks = vi.hoisted(() => ({
  data: vi.fn(), catalog: vi.fn(), dprs: vi.fn(), ensurePeriod: vi.fn(), savePeriod: vi.fn(),
  saveSelection: vi.fn(), saveService: vi.fn(), saveExpense: vi.fn(), export: vi.fn(), upload: vi.fn(),
  references: vi.fn(), saveReference: vi.fn(), providers: vi.fn(),
}));

vi.mock('./projectBilling', async original => ({
  ...await original<typeof import('./projectBilling')>(),
  fetchProjectBillingData: mocks.data,
  fetchProjectServiceCatalog: mocks.catalog,
  fetchProjectBillingDprs: mocks.dprs,
  ensureProjectBillingPeriod: mocks.ensurePeriod,
  saveProjectBillingPeriod: mocks.savePeriod,
  saveProjectBillingPdfSelection: mocks.saveSelection,
  saveProjectBillingService: mocks.saveService,
  saveProjectChargeableExpense: mocks.saveExpense,
  generateBillingExportPackage: mocks.export,
  uploadProjectBillingDocument: mocks.upload,
}));
vi.mock('./projectBillingReferences', async original => ({
  ...await original<typeof import('./projectBillingReferences')>(),
  fetchBillingReferences: mocks.references,
  saveBillingReference: mocks.saveReference,
}));
vi.mock('../serviceProviders/serviceProviders', async original => ({
  ...await original<typeof import('../serviceProviders/serviceProviders')>(),
  fetchServiceProviders: mocks.providers,
}));
vi.mock('./ProjectPdfPreview', () => ({ ProjectPdfPreview: () => <div>PDF de recette</div> }));

const client = {} as never;
const project = { id: 145, projectCode: 'P145', title: 'FACTURATION DE RECETTE', primaryVesselName: 'GOURY' } as ProjectRecord;
const catalog = [
  { id: 7, companyId: 1, category: 'Assistance', descriptionHtml: '', unitAmountHt: 100, active: true, createdAt: '', updatedAt: '' },
  { id: 8, companyId: 1, category: 'Mobilisation', descriptionHtml: '', unitAmountHt: 250, active: true, createdAt: '', updatedAt: '' },
];
const emptyData: ProjectBillingData = { periods: [], services: [], expenses: [], documents: [] };

function period(overrides: Partial<ProjectBillingPeriod> = {}): ProjectBillingPeriod {
  return {
    id: 10, projectId: project.id, companyId: 1, periodMonth: '2026-09-01', clientReference: '',
    invoiceNumber: '', invoiceIssuedOn: '', invoiceSentOn: '', paymentDueOn: '', paidOn: '', amountHt: 0,
    comments: '', includeOperationsInPdf: true, includeExpensesInPdf: true, includeBbtmInPdf: true,
    excludedOperationKeys: [], ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

function panel(record = project, isManager = true) {
  return <ProjectBillingPanel client={client} project={record} operations={[]} isManager={isManager} initialMonth="2026-09" />;
}

async function ready() {
  await waitFor(() => expect(screen.getByLabelText('Nombre d’unités')).toHaveValue(0));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Actualiser l’aperçu' })).toBeEnabled());
}

beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset());
  mocks.data.mockResolvedValue(emptyData);
  mocks.catalog.mockResolvedValue(catalog);
  mocks.dprs.mockResolvedValue([]);
  mocks.references.mockResolvedValue([]);
  mocks.providers.mockResolvedValue([{ id: 1, name: 'FOURNISSEUR RECETTE', active: true, category: 'Port', specialties: [], contacts: [] }]);
  mocks.ensurePeriod.mockImplementation(async (_client: unknown, projectId: number, draft: BillingPeriodDraft) => period({ ...draft, projectId, periodMonth: `${draft.periodMonth.slice(0, 7)}-01` }));
  mocks.saveSelection.mockResolvedValue(undefined);
  mocks.saveReference.mockResolvedValue(undefined);
  mocks.saveService.mockImplementation(async (_client: unknown, _project: number, billingPeriodId: number, draft: object) => ({ id: 20, billingPeriodId, ...draft }));
  mocks.saveExpense.mockImplementation(async (_client: unknown, _project: number, billingPeriodId: number, draft: object) => ({ id: 30, billingPeriodId, ...draft }));
  mocks.export.mockResolvedValue({ blob: new Blob(['PDF fixture'], { type: 'application/pdf' }), extension: 'pdf' });
  mocks.upload.mockResolvedValue({ id: 40, billingPeriodId: 10, chargeableExpenseId: null, documentKind: 'export', fileName: 'export.pdf' });
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:billing-test') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('automatic monthly billing creation', () => {
  it('creates a missing month on the first preview and reuses it on the next preview', async () => {
    const user = userEvent.setup();
    render(panel());
    await ready();
    expect(screen.queryByRole('button', { name: 'Enregistrer les paramètres' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer la fiche du mois' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Actualiser l’aperçu' }));
    expect(await screen.findByText('PDF de recette')).toBeVisible();
    expect(mocks.ensurePeriod).toHaveBeenCalledWith(client, 145, expect.objectContaining({ periodMonth: '2026-09' }));
    expect(mocks.export).toHaveBeenCalledWith(client, expect.objectContaining({ period: expect.objectContaining({ id: 10, periodMonth: '2026-09-01' }) }), [], 'pdf');
    await user.click(screen.getByRole('button', { name: 'Actualiser l’aperçu' }));
    await waitFor(() => expect(mocks.export).toHaveBeenCalledTimes(2));
    expect(mocks.ensurePeriod).toHaveBeenCalledTimes(1);
    expect(mocks.savePeriod).not.toHaveBeenCalled();
  });

  it('creates a missing month for export and stores the generated document against that month', async () => {
    const user = userEvent.setup();
    render(panel());
    await ready();
    await user.click(screen.getByRole('button', { name: 'Exporter le PDF' }));
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledWith(client, expect.objectContaining({ projectId: 145, billingPeriodId: 10, kind: 'export', file: expect.any(File) })));
    expect(mocks.ensurePeriod).toHaveBeenCalledTimes(1);
    expect(mocks.savePeriod).not.toHaveBeenCalled();
  });

  it('previews an existing period without rewriting invoice or payment fields', async () => {
    const stored = period({ invoiceNumber: 'FAC-2026-09', invoiceIssuedOn: '2026-09-30', invoiceSentOn: '2026-10-01', paymentDueOn: '2026-10-30', paidOn: '2026-10-05', amountHt: 8500, comments: 'Déjà réglée' });
    mocks.data.mockResolvedValue({ ...emptyData, periods: [stored] });
    const user = userEvent.setup();
    render(panel());
    await ready();
    await waitFor(() => expect(screen.getByLabelText('Numéro de facture')).toHaveValue('FAC-2026-09'));
    fireEvent.change(screen.getByLabelText('Numéro de facture'), { target: { value: 'BROUILLON LOCAL' } });
    await user.click(screen.getByRole('button', { name: 'Actualiser l’aperçu' }));
    expect(await screen.findByText('PDF de recette')).toBeVisible();
    expect(mocks.export.mock.calls[0][1].period).toEqual(expect.objectContaining({
      invoiceNumber: stored.invoiceNumber, invoiceIssuedOn: stored.invoiceIssuedOn,
      invoiceSentOn: stored.invoiceSentOn, paymentDueOn: stored.paymentDueOn, paidOn: stored.paidOn,
      amountHt: stored.amountHt, comments: stored.comments,
    }));
    expect(screen.getByLabelText('Numéro de facture')).toHaveValue('BROUILLON LOCAL');
    expect(mocks.ensurePeriod).not.toHaveBeenCalled();
    expect(mocks.savePeriod).not.toHaveBeenCalled();
  });

  it.each([true, false])('uses the canonical period contents when another session created the month (scoped reference present: %s)', async hasScopedReference => {
    mocks.references.mockResolvedValue([
      { id: 1, scope: 7, reference: 'REF-ALL' },
      ...(hasScopedReference ? [{ id: 2, scope: 5, reference: 'REF-SANS-FRAIS' }] : []),
    ]);
    const canonicalPeriod = period({ includeExpensesInPdf: false, clientReference: 'REF-CANONIQUE', invoiceNumber: 'F77', amountHt: 7700 });
    mocks.ensurePeriod.mockResolvedValue(canonicalPeriod);
    mocks.savePeriod.mockResolvedValue(canonicalPeriod);
    const user = userEvent.setup();
    render(panel());
    await ready();
    await waitFor(() => expect(screen.getByLabelText('Référence client')).toHaveValue('REF-ALL'));
    await user.click(screen.getByRole('button', { name: 'Actualiser l’aperçu' }));
    expect(await screen.findByText('PDF de recette')).toBeVisible();
    expect(mocks.export.mock.calls[0][1].period).toEqual(expect.objectContaining({
      id: 10, includeOperationsInPdf: true, includeExpensesInPdf: false, includeBbtmInPdf: true,
      clientReference: hasScopedReference ? 'REF-SANS-FRAIS' : 'REF-CANONIQUE', invoiceNumber: 'F77', amountHt: 7700,
    }));
    expect(screen.getByLabelText('Numéro de facture')).toHaveValue('F77');
    expect(screen.getByLabelText('Montant facturé HT')).toHaveValue(7700);
    await user.click(screen.getByRole('button', { name: 'Actualiser l’aperçu' }));
    await waitFor(() => expect(mocks.export).toHaveBeenCalledTimes(2));
    expect(mocks.export.mock.calls[1][1].period).toEqual(expect.objectContaining({
      clientReference: hasScopedReference ? 'REF-SANS-FRAIS' : 'REF-CANONIQUE', invoiceNumber: 'F77', amountHt: 7700,
    }));
    expect(mocks.ensurePeriod).toHaveBeenCalledTimes(1);
    expect(mocks.savePeriod).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer la fiche du mois' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Enregistrer la fiche du mois' }));
    await waitFor(() => expect(mocks.savePeriod).toHaveBeenCalledWith(client, 145, expect.objectContaining({
      periodMonth: '2026-09', invoiceNumber: 'F77', amountHt: 7700,
      includeOperationsInPdf: true, includeExpensesInPdf: false, includeBbtmInPdf: true,
    })));
  });

  it('uses a canonical legacy reference for the same PDF contents on the first and second preview', async () => {
    mocks.ensurePeriod.mockResolvedValue(period({ clientReference: 'REF-CANONIQUE' }));
    const user = userEvent.setup();
    render(panel());
    await ready();
    expect(screen.getByLabelText('Référence client')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Actualiser l’aperçu' }));
    expect(await screen.findByText('PDF de recette')).toBeVisible();
    expect(mocks.export.mock.calls[0][1].period.clientReference).toBe('REF-CANONIQUE');
    expect(screen.getByLabelText('Référence client')).toHaveValue('REF-CANONIQUE');
    await user.click(screen.getByRole('button', { name: 'Actualiser l’aperçu' }));
    await waitFor(() => expect(mocks.export).toHaveBeenCalledTimes(2));
    expect(mocks.export.mock.calls[1][1].period.clientReference).toBe('REF-CANONIQUE');
    expect(mocks.ensurePeriod).toHaveBeenCalledTimes(1);
    expect(mocks.savePeriod).not.toHaveBeenCalled();
  });

  it('keeps edited invoice fields and an explicitly cleared comment while hydrating untouched dates from another session', async () => {
    const canonicalPeriod = period({
      invoiceNumber: 'F77', amountHt: 7700, comments: 'Commentaire canonique',
      invoiceIssuedOn: '2026-09-30', invoiceSentOn: '2026-10-01', paymentDueOn: '2026-10-30', paidOn: '2026-10-05',
    });
    mocks.ensurePeriod.mockResolvedValue(canonicalPeriod);
    const user = userEvent.setup();
    render(panel());
    await ready();
    fireEvent.change(screen.getByLabelText('Numéro de facture'), { target: { value: 'LOCAL-F1' } });
    fireEvent.change(screen.getByLabelText('Montant facturé HT'), { target: { value: '123' } });
    fireEvent.change(screen.getByLabelText('Commentaires'), { target: { value: 'Commentaire local' } });
    fireEvent.change(screen.getByLabelText('Commentaires'), { target: { value: '' } });
    await user.click(screen.getByRole('button', { name: 'Actualiser l’aperçu' }));
    expect(await screen.findByText('PDF de recette')).toBeVisible();
    expect(screen.getByLabelText('Numéro de facture')).toHaveValue('LOCAL-F1');
    expect(screen.getByLabelText('Montant facturé HT')).toHaveValue(123);
    expect(screen.getByLabelText('Commentaires')).toHaveValue('');
    expect(screen.getByLabelText('Date d’émission')).toHaveValue('2026-09-30');
    expect(screen.getByLabelText('Envoyée le')).toHaveValue('2026-10-01');
    expect(screen.getByLabelText('Échéance')).toHaveValue('2026-10-30');
    expect(screen.getByLabelText('Réglée le')).toHaveValue('2026-10-05');
    expect(mocks.export.mock.calls[0][1].period).toEqual(expect.objectContaining({
      invoiceNumber: 'F77', amountHt: 7700, comments: 'Commentaire canonique',
    }));
    expect(mocks.savePeriod).not.toHaveBeenCalled();
  });

  it('creates a missing period when changing PDF contents using only the selection API', async () => {
    const user = userEvent.setup();
    render(panel());
    await ready();
    await user.click(screen.getByRole('checkbox', { name: 'Inclure les prestations BBTM' }));
    await waitFor(() => expect(mocks.saveSelection).toHaveBeenCalledWith(client, 10, expect.objectContaining({ includeBbtmInPdf: false })));
    expect(screen.getByRole('checkbox', { name: 'Inclure les prestations BBTM' })).not.toBeChecked();
    expect(mocks.ensurePeriod).toHaveBeenCalledTimes(1);
    expect(mocks.savePeriod).not.toHaveBeenCalled();
  });

  it.each(['creation', 'selection'] as const)('keeps a refused PDF %s visible after a successful reload', async operation => {
    if (operation === 'creation') {
      mocks.ensurePeriod.mockRejectedValueOnce(new Error('Création PDF refusée.'));
    } else {
      mocks.data.mockResolvedValue({ ...emptyData, periods: [period()] });
      mocks.saveSelection.mockRejectedValueOnce(new Error('Sélection PDF refusée.'));
    }
    const user = userEvent.setup();
    render(panel());
    await ready();
    await user.click(screen.getByRole('checkbox', { name: 'Inclure les prestations BBTM' }));
    await waitFor(() => expect(mocks.data).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Actualiser l’aperçu' })).toBeEnabled());
    expect(screen.getByRole('alert')).toHaveTextContent(operation === 'creation' ? 'Création PDF refusée.' : 'Sélection PDF refusée.');
    if (operation === 'selection') expect(screen.getByRole('checkbox', { name: 'Inclure les prestations BBTM' })).toBeChecked();
    expect(mocks.savePeriod).not.toHaveBeenCalled();
  });

  it('preserves the invoice draft entered while the first monthly creation is pending', async () => {
    const pending = deferred<ProjectBillingPeriod>();
    mocks.ensurePeriod.mockImplementationOnce(() => pending.promise);
    const user = userEvent.setup();
    render(panel());
    await ready();
    const invoice = screen.getByLabelText('Numéro de facture') as HTMLInputElement;
    fireEvent.change(invoice, { target: { value: 'FACTURE-1' } });
    await user.click(screen.getByRole('button', { name: 'Actualiser l’aperçu' }));
    await waitFor(() => expect(mocks.ensurePeriod).toHaveBeenCalledTimes(1));
    const editableWhilePending = !invoice.disabled;
    if (editableWhilePending) fireEvent.change(invoice, { target: { value: 'FACTURE-2' } });
    await act(async () => pending.resolve(period({ invoiceNumber: 'FACTURE-1' })));
    expect(await screen.findByText('PDF de recette')).toBeVisible();
    expect(invoice).toHaveValue(editableWhilePending ? 'FACTURE-2' : 'FACTURE-1');
    expect(mocks.savePeriod).not.toHaveBeenCalled();
  });

  it('keeps all edited BBTM drafts when the first preview creates the monthly period', async () => {
    const user = userEvent.setup();
    render(panel());
    await ready();
    fireEvent.change(screen.getByLabelText('Nombre d’unités'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Montant unitaire HT'), { target: { value: '125' } });
    await user.click(screen.getByRole('button', { name: 'Ajouter une prestation' }));
    fireEvent.change(screen.getAllByLabelText('Nombre d’unités')[1], { target: { value: '3' } });
    await user.click(screen.getByRole('button', { name: 'Actualiser l’aperçu' }));
    expect(await screen.findByText('PDF de recette')).toBeVisible();
    expect(screen.getAllByLabelText('Nombre d’unités').map(input => (input as HTMLInputElement).value)).toEqual(['7', '3']);
    expect(screen.getAllByLabelText('Montant unitaire HT')[0]).toHaveValue(125);
    expect(mocks.export.mock.calls[0][1].services).toEqual([
      expect.objectContaining({ category: 'Assistance', quantity: 7, unitAmountHt: 125 }),
      expect.objectContaining({ category: 'Mobilisation', quantity: 3, unitAmountHt: 250 }),
    ]);
    expect(mocks.saveService).not.toHaveBeenCalled();
  });

  it('creates the month when saving a BBTM service without losing a second unsaved draft', async () => {
    const user = userEvent.setup();
    render(panel());
    await ready();
    fireEvent.change(screen.getByLabelText('Nombre d’unités'), { target: { value: '5' } });
    await user.click(screen.getByRole('button', { name: 'Ajouter une prestation' }));
    fireEvent.change(screen.getAllByLabelText('Nombre d’unités')[1], { target: { value: '9' } });
    await user.click(screen.getAllByRole('button', { name: /^Enregistrer$/ })[0]);
    await waitFor(() => expect(mocks.saveService).toHaveBeenCalledWith(client, 145, 10, expect.objectContaining({ category: 'Assistance', quantity: 5 }), undefined));
    await waitFor(() => expect(screen.getAllByLabelText('Nombre d’unités').map(input => (input as HTMLInputElement).value)).toEqual(['5', '9']));
    expect(mocks.ensurePeriod).toHaveBeenCalledTimes(1);
    expect(mocks.savePeriod).not.toHaveBeenCalled();
  });

  it('allows adding a valid expense before a monthly period exists', async () => {
    const user = userEvent.setup();
    render(panel());
    await ready();
    await user.click(screen.getByRole('button', { name: 'Ajouter un frais' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ajouter un frais imputable' });
    await user.click(within(dialog).getByRole('combobox', { name: 'Fournisseur' }));
    await user.click(within(dialog).getByRole('option', { name: /FOURNISSEUR RECETTE/ }));
    fireEvent.change(within(dialog).getByLabelText('Montant HT'), { target: { value: '150' } });
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer le frais' }));
    await waitFor(() => expect(mocks.saveExpense).toHaveBeenCalledWith(client, 145, 10, expect.objectContaining({ supplier: 'FOURNISSEUR RECETTE', amountHt: 150, invoiceDate: '2026-09-01' }), undefined));
    expect(mocks.ensurePeriod).toHaveBeenCalledTimes(1);
    expect(mocks.savePeriod).not.toHaveBeenCalled();
  });

  it('reports a refused creation, keeps the draft and allows retry', async () => {
    mocks.ensurePeriod.mockRejectedValueOnce(new Error('Création de la fiche refusée.'));
    const user = userEvent.setup();
    render(panel());
    await ready();
    fireEvent.change(screen.getByLabelText('Nombre d’unités'), { target: { value: '6' } });
    await user.click(screen.getByRole('button', { name: 'Actualiser l’aperçu' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Création de la fiche refusée.');
    expect(mocks.export).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Nombre d’unités')).toHaveValue(6);
    await user.click(screen.getByRole('button', { name: 'Actualiser l’aperçu' }));
    expect(await screen.findByText('PDF de recette')).toBeVisible();
    expect(mocks.ensurePeriod).toHaveBeenCalledTimes(2);
    expect(mocks.export.mock.calls[0][1].services[0].quantity).toBe(6);
  });

  it('discards a pending preview from a month that was left and can preview the new month', async () => {
    const pending = deferred<ProjectBillingPeriod>();
    mocks.ensurePeriod.mockImplementationOnce(() => pending.promise);
    const user = userEvent.setup();
    render(panel());
    await ready();
    await user.click(screen.getByRole('button', { name: 'Actualiser l’aperçu' }));
    await waitFor(() => expect(mocks.ensurePeriod).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Mois', { exact: true }), { target: { value: '2026-10' } });
    await act(async () => pending.resolve(period()));
    expect(screen.getByLabelText('Mois', { exact: true })).toHaveValue('2026-10');
    expect(screen.queryByText('PDF de recette')).not.toBeInTheDocument();
    expect(mocks.export).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Actualiser l’aperçu' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Actualiser l’aperçu' }));
    expect(await screen.findByText('PDF de recette')).toBeVisible();
    expect(mocks.ensurePeriod).toHaveBeenLastCalledWith(client, 145, expect.objectContaining({ periodMonth: '2026-10' }));
    expect(mocks.export.mock.calls[0][1].period.periodMonth).toBe('2026-10-01');
  });

  it('does not offer creation to a reader when the month is missing', async () => {
    render(panel(project, false));
    await waitFor(() => expect(mocks.data).toHaveBeenCalledWith(client, 145));
    expect(screen.getByRole('button', { name: 'Actualiser l’aperçu' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Exporter le PDF' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Ajouter un frais' })).not.toBeInTheDocument();
    expect(mocks.ensurePeriod).not.toHaveBeenCalled();
    expect(mocks.savePeriod).not.toHaveBeenCalled();
  });

  it('allows a reader to preview an existing month without a write', async () => {
    mocks.data.mockResolvedValue({ ...emptyData, periods: [period()] });
    const user = userEvent.setup();
    render(panel(project, false));
    await ready();
    await user.click(screen.getByRole('button', { name: 'Actualiser l’aperçu' }));
    expect(await screen.findByText('PDF de recette')).toBeVisible();
    expect(mocks.ensurePeriod).not.toHaveBeenCalled();
    expect(mocks.savePeriod).not.toHaveBeenCalled();
    expect(mocks.saveReference).not.toHaveBeenCalled();
  });
});

describe('client reference autosave', () => {
  it('shares a saved reference with the new month while keeping its selected month', async () => {
    const pending = deferred<void>();
    let canonicalReference = 'REFERENCE-0';
    mocks.saveReference.mockImplementationOnce(() => pending.promise.then(() => { canonicalReference = 'REFERENCE-1'; }));
    mocks.references.mockImplementation(async () => [{ id: 1, scope: 7, reference: canonicalReference }]);
    mocks.data.mockResolvedValue({ ...emptyData, periods: [period(), period({ id: 11, periodMonth: '2026-10-01' })] });
    const user = userEvent.setup();
    render(panel());
    await ready();
    await waitFor(() => expect(screen.getByLabelText('Référence client')).toHaveValue('REFERENCE-0'));
    fireEvent.change(screen.getByLabelText('Référence client'), { target: { value: 'REFERENCE-1' } });
    fireEvent.blur(screen.getByLabelText('Référence client'));
    await waitFor(() => expect(mocks.saveReference).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Mois', { exact: true }), { target: { value: '2026-10' } });
    await act(async () => pending.resolve());
    await waitFor(() => expect(screen.getByLabelText('Référence client')).toHaveValue('REFERENCE-1'));
    expect(screen.getByLabelText('Mois', { exact: true })).toHaveValue('2026-10');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Actualiser l’aperçu' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Actualiser l’aperçu' }));
    expect(await screen.findByText('PDF de recette')).toBeVisible();
    expect(mocks.export.mock.calls[0][1].period).toEqual(expect.objectContaining({ id: 11, periodMonth: '2026-10-01', clientReference: 'REFERENCE-1' }));
    expect(mocks.savePeriod).not.toHaveBeenCalled();
  });

  it('saves on blur for the selected project and PDF contents without a monthly upsert', async () => {
    mocks.data.mockResolvedValue({ ...emptyData, periods: [period()] });
    mocks.references.mockResolvedValue([{ id: 1, scope: 7, reference: 'TOUT' }, { id: 2, scope: 5, reference: 'LOYERS-BBTM' }]);
    const user = userEvent.setup();
    render(panel());
    await ready();
    await waitFor(() => expect(screen.getByLabelText('Référence client')).toHaveValue('TOUT'));
    await user.click(screen.getByRole('checkbox', { name: 'Inclure les frais et leurs pièces dans l’export' }));
    await waitFor(() => expect(screen.getByLabelText('Référence client')).toHaveValue('LOYERS-BBTM'));
    const input = screen.getByLabelText('Référence client');
    fireEvent.change(input, { target: { value: 'NOUVELLE-REF' } });
    expect(mocks.saveReference).not.toHaveBeenCalled();
    fireEvent.blur(input);
    await waitFor(() => expect(mocks.saveReference).toHaveBeenCalledWith(client, 145, 5, 'NOUVELLE-REF'));
    expect(mocks.savePeriod).not.toHaveBeenCalled();
    expect(mocks.ensurePeriod).not.toHaveBeenCalled();
  });

  it('serializes two quick blur saves and retains the latest entered value', async () => {
    const first = deferred<void>();
    mocks.saveReference.mockImplementationOnce(() => first.promise);
    mocks.data.mockResolvedValue({ ...emptyData, periods: [period()] });
    render(panel());
    await ready();
    const input = screen.getByLabelText('Référence client');
    fireEvent.change(input, { target: { value: 'REF-1' } });
    fireEvent.blur(input);
    await waitFor(() => expect(mocks.saveReference).toHaveBeenCalledTimes(1));
    fireEvent.change(input, { target: { value: 'REF-2' } });
    fireEvent.blur(input);
    expect(input).toHaveValue('REF-2');
    expect(mocks.saveReference).toHaveBeenCalledTimes(1);
    await act(async () => first.resolve());
    await waitFor(() => expect(mocks.saveReference).toHaveBeenCalledTimes(2));
    expect(mocks.saveReference.mock.calls.map(call => call.slice(1))).toEqual([[145, 7, 'REF-1'], [145, 7, 'REF-2']]);
    expect(input).toHaveValue('REF-2');
    expect(mocks.savePeriod).not.toHaveBeenCalled();
  });

  it('does not restore an old month or its invoice when a reference save finishes after navigation', async () => {
    const pending = deferred<void>();
    mocks.saveReference.mockImplementationOnce(() => pending.promise);
    mocks.data.mockResolvedValue({ ...emptyData, periods: [period({ invoiceNumber: 'SEPTEMBRE' }), period({ id: 11, periodMonth: '2026-10-01', invoiceNumber: 'OCTOBRE' })] });
    render(panel());
    await ready();
    fireEvent.change(screen.getByLabelText('Référence client'), { target: { value: 'REF-SEPTEMBRE' } });
    fireEvent.blur(screen.getByLabelText('Référence client'));
    await waitFor(() => expect(mocks.saveReference).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Mois', { exact: true }), { target: { value: '2026-10' } });
    await waitFor(() => expect(screen.getByLabelText('Numéro de facture')).toHaveValue('OCTOBRE'));
    fireEvent.change(screen.getByLabelText('Référence client'), { target: { value: 'REF-OCTOBRE-EN-COURS' } });
    await act(async () => pending.resolve());
    expect(screen.getByLabelText('Mois', { exact: true })).toHaveValue('2026-10');
    expect(screen.getByLabelText('Numéro de facture')).toHaveValue('OCTOBRE');
    expect(screen.getByLabelText('Référence client')).toHaveValue('REF-OCTOBRE-EN-COURS');
    expect(mocks.savePeriod).not.toHaveBeenCalled();
  });

  it('ignores an old project response after the panel switches projects', async () => {
    const pending = deferred<void>();
    mocks.saveReference.mockImplementationOnce(() => pending.promise);
    const otherProject = { ...project, id: 146, projectCode: 'P146' };
    mocks.data.mockImplementation(async (_client: unknown, projectId: number) => ({ ...emptyData, periods: [period({ projectId, id: projectId === 145 ? 10 : 11 })] }));
    mocks.references.mockImplementation(async (_client: unknown, projectId: number) => [{ id: projectId, scope: 7, reference: projectId === 145 ? 'PROJET-145' : 'PROJET-146' }]);
    const view = render(panel());
    await ready();
    fireEvent.change(screen.getByLabelText('Référence client'), { target: { value: 'ANCIEN-PROJET' } });
    fireEvent.blur(screen.getByLabelText('Référence client'));
    await waitFor(() => expect(mocks.saveReference).toHaveBeenCalledTimes(1));
    view.rerender(panel(otherProject));
    await waitFor(() => expect(screen.getByLabelText('Référence client')).toHaveValue('PROJET-146'));
    await act(async () => pending.resolve());
    expect(screen.getByLabelText('Référence client')).toHaveValue('PROJET-146');
    expect(screen.getByLabelText('Projet')).toHaveValue('P146 - FACTURATION DE RECETTE');
    expect(mocks.saveReference).toHaveBeenCalledWith(client, 145, 7, 'ANCIEN-PROJET');
    expect(mocks.savePeriod).not.toHaveBeenCalled();
  });

  it('keeps a refused reference available for retry', async () => {
    mocks.data.mockResolvedValue({ ...emptyData, periods: [period()] });
    mocks.saveReference.mockRejectedValueOnce(new Error('Référence refusée.'));
    const user = userEvent.setup();
    render(panel());
    await ready();
    fireEvent.change(screen.getByLabelText('Référence client'), { target: { value: 'REF-RETRY' } });
    fireEvent.blur(screen.getByLabelText('Référence client'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Référence refusée.');
    expect(screen.getByLabelText('Référence client')).toHaveValue('REF-RETRY');
    await user.click(screen.getByRole('button', { name: 'Enregistrer cette référence pour ce contenu' }));
    await waitFor(() => expect(mocks.saveReference).toHaveBeenCalledTimes(2));
    expect(mocks.saveReference).toHaveBeenLastCalledWith(client, 145, 7, 'REF-RETRY');
    expect(mocks.savePeriod).not.toHaveBeenCalled();
  });
});
