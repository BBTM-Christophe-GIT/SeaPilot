import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectBillingPanel } from './ProjectBillingPanel';
import type { ProjectRecord } from './projectQueries';
import type { BillingPeriodDraft, BillingRawLineDraft, ProjectBillingData, ProjectBillingPeriod, ProjectBillingRawLine } from './projectBilling';

const mocks = vi.hoisted(() => ({
  data: vi.fn(), catalog: vi.fn(), dprs: vi.fn(), ensurePeriod: vi.fn(), savePeriod: vi.fn(),
  saveSelection: vi.fn(), saveRaw: vi.fn(), deleteRaw: vi.fn(), export: vi.fn(), upload: vi.fn(),
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
  saveProjectBillingRawLine: mocks.saveRaw,
  deleteProjectBillingRawLine: mocks.deleteRaw,
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
vi.mock('./ProjectPdfPreview', () => ({ ProjectPdfPreview: () => <div>PDF brut de recette</div> }));

const client = {} as never;
const project = { id: 145, projectCode: 'P145', title: 'SAISIE BRUTE DE RECETTE', primaryVesselName: 'GOURY' } as ProjectRecord;
const catalog = [
  { id: 7, companyId: 1, category: 'Spread Antipollution', descriptionHtml: '<p>Prestation catalogue</p>', unitAmountHt: 92.58, active: true, createdAt: '', updatedAt: '' },
  { id: 8, companyId: 1, category: 'Assistance', descriptionHtml: '', unitAmountHt: 100, active: true, createdAt: '', updatedAt: '' },
];
const emptyData: ProjectBillingData = { periods: [], services: [], expenses: [], documents: [], rawLines: [] };

function period(overrides: Partial<ProjectBillingPeriod> = {}): ProjectBillingPeriod {
  return {
    id: 10, projectId: project.id, companyId: 1, periodMonth: '2026-09-01', clientReference: '',
    invoiceNumber: '', invoiceIssuedOn: '', invoiceSentOn: '', paymentDueOn: '', paidOn: '', amountHt: 0,
    comments: '', includeOperationsInPdf: true, includeExpensesInPdf: true, includeBbtmInPdf: true, includeRawInPdf: true,
    excludedOperationKeys: [], ...overrides,
  };
}

function rawLine(overrides: Partial<ProjectBillingRawLine> = {}): ProjectBillingRawLine {
  return { id: 50, billingPeriodId: 10, serviceCatalogId: null, serviceDate: '2026-09-01', designation: 'Ligne conservée', unitAmountHt: 100, quantity: 2, includeInPdf: true, ...overrides };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

function panel(record = project, isManager = true) {
  return <ProjectBillingPanel client={client} project={record} operations={[]} isManager={isManager} initialMonth="2026-09" workspace />;
}

async function ready() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Prévisualiser le PDF' })).toBeEnabled());
}

async function openRaw(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^Saisie brute/ }));
  await waitFor(() => expect(screen.getByRole('region', { name: 'Tableau de saisie brute' })).toBeVisible());
}

function fillManual(designation = 'Ligne libre', unitAmount = '100', quantity = '2') {
  fireEvent.change(screen.getByLabelText('Désignation, ligne 1'), { target: { value: designation } });
  fireEvent.change(screen.getByLabelText('Prix unitaire HT, ligne 1'), { target: { value: unitAmount } });
  fireEvent.change(screen.getByLabelText('Quantité, ligne 1'), { target: { value: quantity } });
}

function selectedTotal() {
  return screen.getByText('Total sélectionné HT').parentElement!;
}

beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset());
  mocks.data.mockResolvedValue(emptyData);
  mocks.catalog.mockResolvedValue(catalog);
  mocks.dprs.mockResolvedValue([]);
  mocks.references.mockResolvedValue([]);
  mocks.providers.mockResolvedValue([]);
  mocks.ensurePeriod.mockImplementation(async (_client: unknown, projectId: number, draft: BillingPeriodDraft) => period({ ...draft, projectId, periodMonth: `${draft.periodMonth.slice(0, 7)}-01` }));
  mocks.saveSelection.mockResolvedValue(undefined);
  mocks.saveReference.mockResolvedValue(undefined);
  mocks.saveRaw.mockImplementation(async (_client: unknown, _project: number, billingPeriodId: number, draft: BillingRawLineDraft, id?: number) => ({ id: id ?? 50, billingPeriodId, ...draft }));
  mocks.deleteRaw.mockResolvedValue(undefined);
  mocks.export.mockResolvedValue({ blob: new Blob(['PDF fixture'], { type: 'application/pdf' }), extension: 'pdf' });
  mocks.upload.mockResolvedValue({ id: 60, billingPeriodId: 10, chargeableExpenseId: null, documentKind: 'export', fileName: 'export.pdf' });
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:raw-billing-test') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());

describe('raw billing workspace integration', () => {
  it('preserves unsaved raw values and export protection while its section is hidden', async () => {
    const user = userEvent.setup();
    const view = render(panel());
    await ready();
    await openRaw(user);
    await user.click(screen.getByRole('button', { name: 'Ajouter une ligne' }));
    fillManual('Brouillon conservé', '12.5', '3');
    const props = { client, project, operations: [], isManager: true, initialMonth: '2026-09', workspace: true };
    view.rerender(<ProjectBillingPanel {...props} visibleSections={{ services: true, bbtm: true, billingElements: true, raw: false }} />);
    expect(screen.getByLabelText('Désignation, ligne 1')).not.toBeVisible();
    expect(screen.getByRole('button', { name: 'Prévisualiser le PDF' })).toBeDisabled();
    view.rerender(<ProjectBillingPanel {...props} visibleSections={{ services: true, bbtm: true, billingElements: true, raw: true }} />);
    expect(screen.getByLabelText('Désignation, ligne 1')).toBeVisible();
    expect(screen.getByLabelText('Désignation, ligne 1')).toHaveValue('Brouillon conservé');
    expect(screen.getByLabelText('Quantité, ligne 1')).toHaveValue(3);
    await user.click(screen.getByRole('button', { name: 'Enregistrer la ligne 1' }));
    await ready();
    expect(mocks.saveRaw).toHaveBeenCalledWith(client, project.id, 10, expect.objectContaining({ designation: 'Brouillon conservé', quantity: 3 }), undefined);
  });

  it('opens the new tab and saves an identical catalogue name as a manual P144 line without the DPR quantity rule', async () => {
    const user = userEvent.setup();
    const p144 = { ...project, id: 144, projectCode: 'P144' };
    render(panel(p144));
    await ready();
    await openRaw(user);
    await user.click(screen.getByRole('button', { name: 'Ajouter une ligne' }));
    expect(screen.getByLabelText('Date, ligne 1')).toHaveValue('2026-09-01');
    expect(screen.getByLabelText('Quantité, ligne 1')).toHaveValue(1);
    fillManual('Spread Antipollution', '32.50', '2.125');
    expect(screen.getByRole('combobox', { name: 'Prestation du catalogue, ligne 1' })).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Enregistrer la ligne 1' }));
    await waitFor(() => expect(mocks.saveRaw).toHaveBeenCalledWith(client, 144, 10, expect.objectContaining({
      serviceCatalogId: null, designation: 'Spread Antipollution', unitAmountHt: 32.5, quantity: 2.125,
      serviceDate: '2026-09-01', includeInPdf: true,
    }), undefined));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer la ligne 1' })).toBeDisabled());
    expect(screen.getByLabelText('Quantité, ligne 1')).toHaveValue(2.125);
    expect(screen.getByLabelText('Prix Total HT, ligne 1')).toHaveTextContent(/69,06\s*€/);
    expect(mocks.ensurePeriod).toHaveBeenCalledTimes(1);
    expect(mocks.savePeriod).not.toHaveBeenCalled();
  });

  it('prefills only designation and price when choosing a catalogue entry and blocks export until the row is saved', async () => {
    const user = userEvent.setup();
    render(panel());
    await ready();
    await openRaw(user);
    await user.click(screen.getByRole('button', { name: 'Ajouter une ligne' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Prestation du catalogue, ligne 1' }), '8');
    expect(screen.getByLabelText('Désignation, ligne 1')).toHaveValue('Assistance');
    expect(screen.getByLabelText('Prix unitaire HT, ligne 1')).toHaveValue(100);
    expect(screen.getByLabelText('Quantité, ligne 1')).toHaveValue(1);
    expect(screen.getByRole('button', { name: 'Prévisualiser le PDF' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Exporter le PDF' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Quantité, ligne 1'), { target: { value: '1.5' } });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Prestation du catalogue, ligne 1' }), '7');
    expect(screen.getByLabelText('Quantité, ligne 1')).toHaveValue(1.5);
    await user.click(screen.getByRole('button', { name: 'Enregistrer la ligne 1' }));
    await ready();
    await user.click(screen.getByRole('button', { name: 'Prévisualiser le PDF' }));
    expect(await screen.findByText('PDF brut de recette')).toBeVisible();
    expect(mocks.export.mock.calls[0][1].rawLines).toEqual([expect.objectContaining({
      id: 50, billingPeriodId: 10, serviceCatalogId: 7, designation: 'Spread Antipollution', unitAmountHt: 92.58, quantity: 1.5,
    })]);
    expect(mocks.ensurePeriod).toHaveBeenCalledTimes(1);
  });

  it('uses the canonical invoice returned on the first raw save without upserting its existing payment fields', async () => {
    const canonical = period({ invoiceNumber: 'FACTURE-CANONIQUE', invoiceIssuedOn: '2026-09-30', invoiceSentOn: '2026-10-01', paymentDueOn: '2026-10-30', paidOn: '2026-10-05', amountHt: 8500, comments: 'Réglée' });
    mocks.ensurePeriod.mockResolvedValue(canonical);
    const user = userEvent.setup();
    render(panel());
    await ready();
    await openRaw(user);
    await user.click(screen.getByRole('button', { name: 'Ajouter une ligne' }));
    fillManual();
    await user.click(screen.getByRole('button', { name: 'Enregistrer la ligne 1' }));
    await ready();
    await user.click(screen.getByRole('button', { name: 'Prévisualiser le PDF' }));
    expect(await screen.findByText('PDF brut de recette')).toBeVisible();
    expect(mocks.export.mock.calls[0][1].period).toMatchObject({
      invoiceNumber: canonical.invoiceNumber, invoiceIssuedOn: canonical.invoiceIssuedOn, invoiceSentOn: canonical.invoiceSentOn,
      paymentDueOn: canonical.paymentDueOn, paidOn: canonical.paidOn, amountHt: canonical.amountHt, comments: canonical.comments,
    });
    expect(mocks.ensurePeriod).toHaveBeenCalledTimes(1);
    expect(mocks.savePeriod).not.toHaveBeenCalled();
  });

  it('keeps reference scope 7 for an empty raw table and uses scope 15 only for an included raw line', async () => {
    mocks.data.mockResolvedValue({ ...emptyData, periods: [period()] });
    mocks.references.mockResolvedValue([{ id: 1, scope: 7, reference: 'REFERENCE-7' }, { id: 2, scope: 15, reference: 'REFERENCE-15' }]);
    const user = userEvent.setup();
    render(panel());
    await ready();
    expect(screen.getByRole('checkbox', { name: 'Inclure la saisie brute' })).toBeChecked();
    expect(screen.getByLabelText('Référence client')).toHaveValue('REFERENCE-7');
    await openRaw(user);
    await user.click(screen.getByRole('button', { name: 'Ajouter une ligne' }));
    fillManual();
    expect(screen.getByLabelText('Référence client')).toHaveValue('REFERENCE-7');
    await user.click(screen.getByRole('button', { name: 'Enregistrer la ligne 1' }));
    await ready();
    expect(screen.getByLabelText('Référence client')).toHaveValue('REFERENCE-15');
    expect(within(selectedTotal()).getByText(/200,00\s*€/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Prévisualiser le PDF' }));
    expect(await screen.findByText('PDF brut de recette')).toBeVisible();
    expect(mocks.export.mock.calls[0][1].period.clientReference).toBe('REFERENCE-15');
    await user.click(screen.getByRole('checkbox', { name: 'Inclure la saisie brute' }));
    await ready();
    expect(mocks.saveSelection).toHaveBeenCalledWith(client, 10, expect.objectContaining({ includeRawInPdf: false }));
    expect(screen.getByLabelText('Référence client')).toHaveValue('REFERENCE-7');
    expect(within(selectedTotal()).getByText(/0,00\s*€/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Prévisualiser le PDF' }));
    await waitFor(() => expect(mocks.export).toHaveBeenCalledTimes(2));
    expect(mocks.export.mock.calls[1][1].period).toMatchObject({ includeRawInPdf: false, clientReference: 'REFERENCE-7' });
    expect(mocks.export.mock.calls[1][1].rawLines).toHaveLength(1);
    expect(mocks.ensurePeriod).not.toHaveBeenCalled();
    expect(mocks.savePeriod).not.toHaveBeenCalled();
  });

  it('saves per-line exclusion, updates the selected total and can delete the saved raw line', async () => {
    mocks.data.mockResolvedValue({ ...emptyData, periods: [period()], rawLines: [rawLine()] });
    mocks.references.mockResolvedValue([{ id: 1, scope: 7, reference: 'REFERENCE-7' }, { id: 2, scope: 15, reference: 'REFERENCE-15' }]);
    const user = userEvent.setup();
    render(panel());
    await ready();
    await openRaw(user);
    expect(within(selectedTotal()).getByText(/200,00\s*€/)).toBeVisible();
    await user.click(screen.getByRole('checkbox', { name: 'Inclure dans le PDF la ligne 1' }));
    expect(screen.getByRole('button', { name: 'Exporter le PDF' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Enregistrer la ligne 1' }));
    await ready();
    expect(mocks.saveRaw).toHaveBeenCalledWith(client, 145, 10, expect.objectContaining({ includeInPdf: false }), 50);
    expect(within(selectedTotal()).getByText(/0,00\s*€/)).toBeVisible();
    expect(screen.getByLabelText('Référence client')).toHaveValue('REFERENCE-7');
    await user.click(screen.getByRole('button', { name: 'Prévisualiser le PDF' }));
    expect(await screen.findByText('PDF brut de recette')).toBeVisible();
    expect(mocks.export.mock.calls[0][1].rawLines).toEqual([expect.objectContaining({ includeInPdf: false })]);
    await user.click(screen.getByRole('button', { name: 'Supprimer la ligne 1' }));
    await waitFor(() => expect(mocks.deleteRaw).toHaveBeenCalledWith(client, 50));
    await waitFor(() => expect(screen.queryByLabelText('Désignation, ligne 1')).not.toBeInTheDocument());
    expect(screen.getByText('Aucune ligne de saisie brute pour cette période.')).toBeVisible();
    expect(mocks.savePeriod).not.toHaveBeenCalled();
  });

  it('preserves a refused save as a dirty row that can be corrected and retried', async () => {
    mocks.saveRaw.mockRejectedValueOnce(new Error('Enregistrement brut refusé.'));
    const user = userEvent.setup();
    render(panel());
    await ready();
    await openRaw(user);
    await user.click(screen.getByRole('button', { name: 'Ajouter une ligne' }));
    fillManual('Ligne à reprendre');
    await user.click(screen.getByRole('button', { name: 'Enregistrer la ligne 1' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enregistrement brut refusé.');
    expect(screen.getByLabelText('Désignation, ligne 1')).toHaveValue('Ligne à reprendre');
    expect(screen.getByRole('button', { name: 'Exporter le PDF' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Enregistrer la ligne 1' }));
    await ready();
    expect(mocks.saveRaw).toHaveBeenCalledTimes(2);
    expect(mocks.ensurePeriod).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders saved raw lines for a reader while denying edit, save, delete and inclusion changes', async () => {
    mocks.data.mockResolvedValue({ ...emptyData, periods: [period()], rawLines: [rawLine()] });
    const user = userEvent.setup();
    render(panel(project, false));
    await ready();
    await openRaw(user);
    expect(screen.getByLabelText('Désignation, ligne 1')).toHaveValue('Ligne conservée');
    for (const name of ['Date, ligne 1', 'Désignation, ligne 1', 'Prix unitaire HT, ligne 1', 'Quantité, ligne 1', 'Prestation du catalogue, ligne 1', 'Inclure dans le PDF la ligne 1']) {
      expect(screen.getByLabelText(name)).toBeDisabled();
    }
    expect(screen.getByRole('checkbox', { name: 'Inclure la saisie brute' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Ajouter une ligne' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enregistrer la ligne 1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer la ligne 1' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Prévisualiser le PDF' }));
    expect(await screen.findByText('PDF brut de recette')).toBeVisible();
    expect(mocks.export.mock.calls[0][1].rawLines).toHaveLength(1);
    expect(mocks.ensurePeriod).not.toHaveBeenCalled();
    expect(mocks.savePeriod).not.toHaveBeenCalled();
    expect(mocks.saveSelection).not.toHaveBeenCalled();
    expect(mocks.saveRaw).not.toHaveBeenCalled();
    expect(mocks.deleteRaw).not.toHaveBeenCalled();
  });

  it.each(['creation', 'write'] as const)('keeps the newly selected month intact when an old raw %s promise finishes', async phase => {
    const canonicalSeptember = period({ invoiceNumber: 'FACTURE-SEPTEMBRE' });
    const october = period({ id: 20, periodMonth: '2026-10-01', invoiceNumber: 'FACTURE-OCTOBRE' });
    const octoberLine = rawLine({ id: 70, billingPeriodId: 20, serviceDate: '2026-10-01', designation: 'Ligne octobre', unitAmountHt: 300, quantity: 1 });
    const pendingPeriod = deferred<ProjectBillingPeriod>();
    const pendingLine = deferred<ProjectBillingRawLine>();
    mocks.data.mockResolvedValue({ ...emptyData, periods: phase === 'creation' ? [october] : [canonicalSeptember, october], rawLines: [octoberLine] });
    if (phase === 'creation') mocks.ensurePeriod.mockImplementationOnce(() => pendingPeriod.promise);
    else mocks.saveRaw.mockImplementationOnce(() => pendingLine.promise);
    const user = userEvent.setup();
    render(panel());
    await ready();
    await openRaw(user);
    await user.click(screen.getByRole('button', { name: 'Ajouter une ligne' }));
    fillManual('Réponse septembre tardive');
    await user.click(screen.getByRole('button', { name: 'Enregistrer la ligne 1' }));
    await waitFor(() => expect(phase === 'creation' ? mocks.ensurePeriod : mocks.saveRaw).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Mois de facturation', { exact: true }), { target: { value: '2026-10' } });
    await waitFor(() => expect(screen.getByLabelText('Désignation, ligne 1')).toHaveValue('Ligne octobre'));
    await act(async () => {
      if (phase === 'creation') pendingPeriod.resolve(canonicalSeptember);
      else pendingLine.resolve(rawLine({ designation: 'Réponse septembre tardive' }));
    });
    await ready();
    expect(screen.getByLabelText('Mois de facturation', { exact: true })).toHaveValue('2026-10');
    expect(screen.getByLabelText('Désignation, ligne 1')).toHaveValue('Ligne octobre');
    expect(screen.queryByLabelText('Désignation, ligne 2')).not.toBeInTheDocument();
    expect(within(selectedTotal()).getByText(/300,00\s*€/)).toBeVisible();
    if (phase === 'creation') expect(mocks.saveRaw).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Prévisualiser le PDF' }));
    expect(await screen.findByText('PDF brut de recette')).toBeVisible();
    expect(mocks.export.mock.calls[0][1].period).toMatchObject({ id: 20, invoiceNumber: 'FACTURE-OCTOBRE', periodMonth: '2026-10-01' });
    expect(mocks.export.mock.calls[0][1].rawLines).toEqual([octoberLine]);
    if (phase === 'write') {
      fireEvent.change(screen.getByLabelText('Mois de facturation', { exact: true }), { target: { value: '2026-09' } });
      await waitFor(() => expect(screen.getByLabelText('Désignation, ligne 1')).toHaveValue('Réponse septembre tardive'));
      await ready();
      await user.click(screen.getByRole('button', { name: 'Prévisualiser le PDF' }));
      await waitFor(() => expect(mocks.export).toHaveBeenCalledTimes(2));
      expect(mocks.export.mock.calls[1][1].rawLines).toEqual([expect.objectContaining({ designation: 'Réponse septembre tardive', billingPeriodId: 10 })]);
    }
  });
});
