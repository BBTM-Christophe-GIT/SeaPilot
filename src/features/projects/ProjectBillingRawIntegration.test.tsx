import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectBillingPanel } from './ProjectBillingPanel';
import type { ProjectRecord } from './projectQueries';
import type { BillingPeriodDraft, BillingRawLineDraft, ProjectBillingData, ProjectBillingPeriod, ProjectBillingRawLine } from './projectBilling';

const mocks = vi.hoisted(() => ({
  data: vi.fn(), catalog: vi.fn(), dprs: vi.fn(), ensurePeriod: vi.fn(), savePeriod: vi.fn(),
  saveSelection: vi.fn(), saveRaw: vi.fn(), deleteRaw: vi.fn(), export: vi.fn(), upload: vi.fn(),
  references: vi.fn(), saveReference: vi.fn(), providers: vi.fn(), createCatalog: vi.fn(),
}));

vi.mock('./projectBilling', async original => ({
  ...await original<typeof import('./projectBilling')>(),
  fetchProjectBillingData: mocks.data,
  fetchProjectServiceCatalog: mocks.catalog,
  saveProjectServiceCatalogEntry: mocks.createCatalog,
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
const vessels = [{ id: 1, name: 'GOURY', active: true, acronym: '', fleetExitOn: '', sharePointItemId: '', lengthOverall: '30' }];

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
  return <ProjectBillingPanel client={client} project={record} operations={[]} vessels={vessels} isManager={isManager} initialMonth="2026-09" workspace />;
}

async function ready() {
  await screen.findByLabelText('Catégorie de la prestation 1');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Prévisualiser le PDF' })).toBeEnabled());
}

async function openRaw(user: ReturnType<typeof userEvent.setup>) {
  const toggle = screen.getByRole('button', { name: 'Saisie brute' });
  if (toggle.getAttribute('aria-expanded') === 'false') await user.click(toggle);
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
  mocks.createCatalog.mockImplementation(async (_client: unknown, draft: import('./projectBilling').ProjectServiceCatalogDraft) => ({ ...catalog[0], ...draft, id: 9 }));
  mocks.export.mockResolvedValue({ blob: new Blob(['PDF fixture'], { type: 'application/pdf' }), extension: 'pdf' });
  mocks.upload.mockResolvedValue({ id: 60, billingPeriodId: 10, chargeableExpenseId: null, documentKind: 'export', fileName: 'export.pdf' });
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:raw-billing-test') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());

describe('raw billing workspace integration', () => {
  it('shows every billing category expanded with its record count and keeps manual collapse available', async () => {
    mocks.data.mockResolvedValue({
      ...emptyData,
      periods: [period()],
      services: [{ id: 2, billingPeriodId: 10, serviceCatalogId: 7, category: catalog[0].category, descriptionHtml: '', unitAmountHt: 100, quantity: 1 }],
      expenses: [{ id: 3, billingPeriodId: 10, category: 'port', nature: '', supplier: 'PORT DE RECETTE', supplierSpecialties: [], invoiceDate: '2026-09-15', invoiceNumber: 'PORT-1', amountHt: 25, amountTtc: null, currency: 'EUR', quantity: null, unit: '', comments: '', dprReportId: null }],
      documents: [{ id: 4, billingPeriodId: 10, chargeableExpenseId: null, documentKind: 'client_invoice', bucketName: 'project-files', objectPath: 'invoice.pdf', fileName: 'Facture du mois.pdf', mimeType: 'application/pdf', fileSizeBytes: 10 }],
      rawLines: [rawLine(), rawLine({ id: 51, serviceDate: '2026-09-30' }), rawLine({ id: 52, serviceDate: '2026-10-01' })],
    });
    const user = userEvent.setup();
    render(panel());
    await ready();
    for (const [label, count] of [
      ['Loyers d’affrètement', 0], ['Services refacturables', 1], ['Prestations BBTM', 1],
      ['Saisie brute', 2], ['Suivi de la facture et pièces', 1],
    ] as const) {
      const toggle = screen.getByRole('button', { name: label });
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      const badge = within(toggle).getByLabelText(`${count} enregistrement${count === 1 ? '' : 's'}`);
      expect(badge).toHaveTextContent(String(count));
      expect(badge).toBeVisible();
    }
    expect(screen.getByLabelText('Désignation, ligne 1')).toBeVisible();
    expect(screen.getByLabelText('Désignation, ligne 2')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Facture du mois.pdf' })).toBeVisible();
    expect(screen.getByText('PORT DE RECETTE')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Saisie brute' }));
    expect(screen.getByLabelText('Désignation, ligne 1')).not.toBeVisible();
    expect(screen.getByRole('button', { name: 'Saisie brute' })).toHaveAttribute('aria-expanded', 'false');
    await openRaw(user);
    expect(screen.getByLabelText('Désignation, ligne 1')).toBeVisible();
  });

  it.each([true, false])('groups and exports raw lines by service date across September and October (October period exists: %s)', async hasOctoberPeriod => {
    const september = period({ clientReference: 'REFERENCE-SEPTEMBRE' });
    const october = period({ id: 20, periodMonth: '2026-10-01', clientReference: 'REFERENCE-OCTOBRE' });
    const septemberLines = [
      rawLine({ serviceDate: '2026-09-01', designation: 'Premier septembre' }),
      rawLine({ id: 51, billingPeriodId: hasOctoberPeriod ? 20 : 10, serviceDate: '2026-09-30', designation: 'Dernier septembre', unitAmountHt: 150 }),
    ];
    const octoberLines = [
      rawLine({ id: 52, serviceDate: '2026-10-01', designation: 'Premier octobre', unitAmountHt: 200 }),
      rawLine({ id: 53, serviceDate: '2026-10-31', designation: 'Dernier octobre', unitAmountHt: 250 }),
    ];
    mocks.data.mockResolvedValue({ ...emptyData, periods: hasOctoberPeriod ? [september, october] : [september], rawLines: [...septemberLines, ...octoberLines, rawLine({ id: 54, serviceDate: '2026-11-01', designation: 'Premier novembre' })] });
    mocks.ensurePeriod.mockResolvedValue(october);
    const user = userEvent.setup();
    render(panel());
    await ready();
    expect(screen.getByLabelText('Désignation, ligne 1')).toHaveValue('Premier septembre');
    expect(screen.getByLabelText('Désignation, ligne 2')).toHaveValue('Dernier septembre');
    expect(screen.queryByLabelText('Désignation, ligne 3')).not.toBeInTheDocument();
    expect(within(selectedTotal()).getByText(/500,00\s*€/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Prévisualiser le PDF' }));
    await waitFor(() => expect(mocks.export).toHaveBeenCalledTimes(1));
    expect(mocks.export.mock.calls[0][1]).toMatchObject({ rawLines: septemberLines, startDate: '2026-09-01', endDate: '2026-09-30' });
    fireEvent.change(screen.getByLabelText('Mois', { exact: true }), { target: { value: '2026-10' } });
    await ready();
    expect(screen.getByLabelText('Désignation, ligne 1')).toHaveValue('Premier octobre');
    expect(screen.getByLabelText('Désignation, ligne 2')).toHaveValue('Dernier octobre');
    expect(screen.queryByLabelText('Désignation, ligne 3')).not.toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: 'Saisie brute' })).getByLabelText('2 enregistrements')).toHaveTextContent('2');
    expect(within(selectedTotal()).getByText(/900,00\s*€/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Prévisualiser le PDF' }));
    await waitFor(() => expect(mocks.export).toHaveBeenCalledTimes(2));
    expect(mocks.export.mock.calls[1][1]).toMatchObject({ period: { id: 20 }, rawLines: octoberLines, startDate: '2026-10-01', endDate: '2026-10-31' });
    expect(mocks.ensurePeriod).toHaveBeenCalledTimes(hasOctoberPeriod ? 0 : 1);
    expect(mocks.saveRaw).not.toHaveBeenCalled();
    expect(mocks.savePeriod).not.toHaveBeenCalled();
  });

  it('keeps the September legacy reference when its only linked raw line belongs to October', async () => {
    mocks.data.mockResolvedValue({ ...emptyData, periods: [period({ clientReference: 'REFERENCE-HISTORIQUE-SEPTEMBRE' })], rawLines: [rawLine({ serviceDate: '2026-10-01' })] });
    const user = userEvent.setup();
    render(panel());
    await ready();
    expect(screen.getByLabelText('Référence client')).toHaveValue('REFERENCE-HISTORIQUE-SEPTEMBRE');
    expect(within(selectedTotal()).getByText(/0,00\s*€/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Prévisualiser le PDF' }));
    await waitFor(() => expect(mocks.export).toHaveBeenCalled());
    expect(mocks.export.mock.calls[0][1]).toMatchObject({ period: { clientReference: 'REFERENCE-HISTORIQUE-SEPTEMBRE' }, rawLines: [] });
  });

  it('shows, counts and exports every raw line in a custom range crossing the month boundary', async () => {
    const selected = [
      rawLine({ serviceDate: '2026-09-30', designation: 'Fin septembre' }),
      rawLine({ id: 51, billingPeriodId: 20, serviceDate: '2026-10-01', designation: 'Début octobre', unitAmountHt: 150 }),
    ];
    mocks.data.mockResolvedValue({ ...emptyData, periods: [period(), period({ id: 20, periodMonth: '2026-10-01' })], rawLines: [rawLine({ id: 52, serviceDate: '2026-09-29', designation: 'Avant la plage' }), ...selected, rawLine({ id: 53, serviceDate: '2026-10-02', designation: 'Après la plage' })] });
    const user = userEvent.setup();
    render(panel());
    await ready();
    const calendar = screen.getByRole('region', { name: 'Calendrier de facturation' });
    await user.click(within(calendar).getByRole('button', { name: 'mercredi 30 septembre 2026' }));
    await ready();
    await user.click(within(calendar).getByRole('button', { name: 'jeudi 1 octobre 2026' }));
    await ready();
    expect(screen.getByLabelText('Désignation, ligne 1')).toHaveValue('Fin septembre');
    expect(screen.getByLabelText('Désignation, ligne 2')).toHaveValue('Début octobre');
    expect(screen.queryByLabelText('Désignation, ligne 3')).not.toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: 'Saisie brute' })).getByLabelText('2 enregistrements')).toHaveTextContent('2');
    expect(within(selectedTotal()).getByText(/500,00\s*€/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Prévisualiser le PDF' }));
    await waitFor(() => expect(mocks.export).toHaveBeenCalled());
    expect(mocks.export.mock.calls[0][1]).toMatchObject({ rawLines: selected, startDate: '2026-09-30', endDate: '2026-10-01' });
  });

  it('moves a saved raw line into its new service month immediately without replacing the current invoice', async () => {
    const september = period({ invoiceNumber: 'FACTURE-SEPTEMBRE' });
    const october = period({ id: 20, periodMonth: '2026-10-01', invoiceNumber: 'FACTURE-OCTOBRE' });
    mocks.data.mockResolvedValue({ ...emptyData, periods: [september, october], rawLines: [rawLine()] });
    const user = userEvent.setup();
    render(panel());
    await ready();
    fireEvent.change(screen.getByLabelText('Date, ligne 1'), { target: { value: '2026-10-15' } });
    await user.click(screen.getByRole('button', { name: 'Enregistrer la ligne 1' }));
    await waitFor(() => expect(mocks.saveRaw).toHaveBeenCalledWith(client, project.id, 20, expect.objectContaining({ serviceDate: '2026-10-15' }), 50));
    await ready();
    await waitFor(() => expect(screen.queryByDisplayValue('Ligne conservée')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Mois', { exact: true })).toHaveValue('2026-09');
    expect(screen.getByLabelText('Numéro de facture')).toHaveValue('FACTURE-SEPTEMBRE');
    expect(within(selectedTotal()).getByText(/0,00\s*€/)).toBeVisible();
    expect(within(screen.getByRole('button', { name: 'Saisie brute' })).getByLabelText('0 enregistrements')).toHaveTextContent('0');
    fireEvent.change(screen.getByLabelText('Mois', { exact: true }), { target: { value: '2026-10' } });
    await ready();
    expect(screen.getByLabelText('Désignation, ligne 1')).toHaveValue('Ligne conservée');
    expect(screen.getByLabelText('Date, ligne 1')).toHaveValue('2026-10-15');
    expect(screen.getByLabelText('Numéro de facture')).toHaveValue('FACTURE-OCTOBRE');
    expect(within(selectedTotal()).getByText(/200,00\s*€/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Prévisualiser le PDF' }));
    await waitFor(() => expect(mocks.export).toHaveBeenCalled());
    expect(mocks.export.mock.calls[0][1].rawLines).toEqual([expect.objectContaining({ id: 50, billingPeriodId: 20, serviceDate: '2026-10-15' })]);
    expect(mocks.ensurePeriod).not.toHaveBeenCalled();
  });

  it('creates the service month for a new out-of-month line while preserving the selected month and invoice draft', async () => {
    const september = period({ invoiceNumber: 'FACTURE-SEPTEMBRE', comments: 'Facture existante' });
    const october = period({ id: 20, periodMonth: '2026-10-01' });
    mocks.data.mockResolvedValue({ ...emptyData, periods: [september] });
    mocks.ensurePeriod.mockResolvedValue(october);
    const user = userEvent.setup();
    render(panel());
    await ready();
    fireEvent.change(screen.getByLabelText('Numéro de facture'), { target: { value: 'BROUILLON-SEPTEMBRE' } });
    fillManual('Prestation octobre', '125', '2');
    fireEvent.change(screen.getByLabelText('Date, ligne 1'), { target: { value: '2026-10-06' } });
    await user.click(screen.getByRole('button', { name: 'Enregistrer la ligne 1' }));
    await waitFor(() => expect(mocks.ensurePeriod).toHaveBeenCalledWith(client, project.id, expect.objectContaining({ periodMonth: '2026-10', invoiceNumber: '', comments: '' })));
    await waitFor(() => expect(mocks.saveRaw).toHaveBeenCalledWith(client, project.id, 20, expect.objectContaining({ serviceDate: '2026-10-06', designation: 'Prestation octobre' }), undefined));
    await ready();
    expect(screen.getByLabelText('Mois', { exact: true })).toHaveValue('2026-09');
    expect(screen.getByLabelText('Numéro de facture')).toHaveValue('BROUILLON-SEPTEMBRE');
    expect(screen.queryByDisplayValue('Prestation octobre')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Mois', { exact: true }), { target: { value: '2026-10' } });
    await ready();
    expect(screen.getByLabelText('Désignation, ligne 1')).toHaveValue('Prestation octobre');
    expect(within(selectedTotal()).getByText(/250,00\s*€/)).toBeVisible();
    expect(mocks.savePeriod).not.toHaveBeenCalled();
  });

  it('opens directly on one blank row without persisting it, then adds another row only on request', async () => {
    const user = userEvent.setup();
    render(panel());
    await ready();
    expect(screen.getByLabelText('Désignation, ligne 1')).toBeVisible();
    expect(within(screen.getByRole('button', { name: 'Saisie brute' })).getByLabelText('0 enregistrements')).toHaveTextContent('0');
    await openRaw(user);
    expect(screen.getByLabelText('Désignation, ligne 1')).toHaveValue('');
    expect(screen.queryByLabelText('Désignation, ligne 2')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Saisie brute/ }));
    await openRaw(user);
    expect(screen.queryByLabelText('Désignation, ligne 2')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ajouter une ligne' }));
    expect(screen.getByLabelText('Désignation, ligne 2')).toHaveValue('');
    expect(mocks.ensurePeriod).not.toHaveBeenCalled();
    expect(mocks.saveRaw).not.toHaveBeenCalled();
  });
  it('distinguishes vessel-specific catalogue categories in the BBTM selector', async () => {
    mocks.catalog.mockResolvedValue([{ ...catalog[0], vesselId: 1, vesselName: 'GOURY' }, { ...catalog[0], id: 9, vesselId: 2, vesselName: 'SUROIT', unitAmountHt: 125 }]);
    const user = userEvent.setup();
    render(panel());
    await ready();
    expect(screen.getByRole('button', { name: 'Prestations BBTM' })).toHaveAttribute('aria-expanded', 'true');
    const categorySelect = screen.getByLabelText('Catégorie de la prestation 1');
    expect(within(categorySelect).getAllByRole('option').map((option) => option.textContent)).toEqual(['Spread Antipollution — GOURY', 'Spread Antipollution — SUROIT']);
    await user.selectOptions(categorySelect, '9');
    expect(screen.getByLabelText('Montant unitaire HT', { exact: true })).toHaveValue(125);
  });

  it('creates a vessel-specific catalogue entry and selects it without saving the raw line', async () => {
    const user = userEvent.setup();
    render(panel());
    await ready();
    await openRaw(user);
    fireEvent.change(screen.getByLabelText('Date, ligne 1'), { target: { value: '2026-09-12' } });
    fireEvent.change(screen.getByLabelText('Quantité, ligne 1'), { target: { value: '2.5' } });
    await user.click(screen.getByRole('button', { name: 'Choisir dans le catalogue, ligne 1' }));
    await user.click(screen.getByRole('button', { name: 'Nouvelle prestation' }));
    await user.type(screen.getByLabelText('Désignation de la nouvelle prestation'), 'Prestation créée');
    await user.clear(screen.getByLabelText('Prix unitaire HT de la nouvelle prestation'));
    await user.type(screen.getByLabelText('Prix unitaire HT de la nouvelle prestation'), '42.50');
    await user.selectOptions(screen.getByLabelText('Navire de la nouvelle prestation'), '1');
    await user.click(screen.getByRole('button', { name: 'Créer la prestation' }));
    await waitFor(() => expect(mocks.createCatalog).toHaveBeenCalledWith(client, expect.objectContaining({ category: 'Prestation créée', unitAmountHt: 42.5, vesselId: 1, vesselName: 'GOURY', active: true })));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nouvelle prestation' })).not.toBeInTheDocument());
    expect(screen.getByLabelText('Désignation, ligne 1')).toHaveValue('Prestation créée');
    expect(screen.getByLabelText('Navire, ligne 1')).toHaveValue('1');
    expect(screen.getByLabelText('Date, ligne 1')).toHaveValue('2026-09-12');
    expect(screen.getByLabelText('Quantité, ligne 1')).toHaveValue(2.5);
    expect(mocks.saveRaw).not.toHaveBeenCalled();
    expect(mocks.ensurePeriod).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Choisir dans le catalogue, ligne 1' }));
    expect(screen.getByRole('button', { name: 'Choisir Prestation créée — GOURY' })).toBeVisible();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Enregistrer la ligne 1' }));
    await ready();
    expect(mocks.saveRaw).toHaveBeenCalledWith(client, project.id, 10, expect.objectContaining({ serviceCatalogId: 9, vesselId: 1, vesselName: 'GOURY', designation: 'Prestation créée', unitAmountHt: 42.5, quantity: 2.5 }), undefined);
  });

  it('preserves a failed creation and handles an active duplicate without changing the raw line', async () => {
    mocks.createCatalog.mockRejectedValueOnce({ code: '23505', message: 'duplicate key' });
    const user = userEvent.setup();
    render(panel());
    await ready();
    await openRaw(user);
    await user.click(screen.getByRole('button', { name: 'Choisir dans le catalogue, ligne 1' }));
    await user.click(screen.getByRole('button', { name: 'Nouvelle prestation' }));
    await user.type(screen.getByLabelText('Désignation de la nouvelle prestation'), 'Assistance');
    await user.type(screen.getByLabelText('Prix unitaire HT de la nouvelle prestation'), '100');
    await user.click(screen.getByRole('button', { name: 'Créer la prestation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Une prestation de même désignation existe déjà pour ce navire');
    expect(screen.getByLabelText('Désignation de la nouvelle prestation')).toHaveValue('Assistance');
    expect(screen.getByLabelText('Désignation, ligne 1')).toHaveValue('');
    expect(mocks.saveRaw).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.getByRole('dialog', { name: 'Choisir une prestation' })).toBeVisible();
  });

  it('preserves unsaved raw values and export protection while its section is hidden', async () => {
    const user = userEvent.setup();
    const view = render(panel());
    await ready();
    await openRaw(user);
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
    expect(screen.getByLabelText('Date, ligne 1')).toHaveValue('2026-09-01');
    expect(screen.getByLabelText('Quantité, ligne 1')).toHaveValue(1);
    fillManual('Spread Antipollution', '32.50', '2.125');
    expect(screen.queryByRole('combobox', { name: 'Prestation du catalogue, ligne 1' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choisir dans le catalogue, ligne 1' })).toBeEnabled();
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
    await user.click(screen.getByRole('button', { name: 'Choisir dans le catalogue, ligne 1' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Choisir une prestation' })).getByRole('button', { name: 'Choisir Assistance' }));
    expect(screen.getByLabelText('Désignation, ligne 1')).toHaveValue('Assistance');
    expect(screen.getByLabelText('Prix unitaire HT, ligne 1')).toHaveValue(100);
    expect(screen.getByLabelText('Quantité, ligne 1')).toHaveValue(1);
    expect(screen.getByRole('button', { name: 'Prévisualiser le PDF' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Exporter le PDF' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Quantité, ligne 1'), { target: { value: '1.5' } });
    await user.click(screen.getByRole('button', { name: 'Choisir dans le catalogue, ligne 1' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Choisir une prestation' })).getByRole('button', { name: 'Choisir Spread Antipollution' }));
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

  it('includes a legacy excluded line with the global selection and can delete the saved raw line', async () => {
    mocks.data.mockResolvedValue({ ...emptyData, periods: [period()], rawLines: [rawLine({ includeInPdf: false })] });
    mocks.references.mockResolvedValue([{ id: 1, scope: 7, reference: 'REFERENCE-7' }, { id: 2, scope: 15, reference: 'REFERENCE-15' }]);
    const user = userEvent.setup();
    render(panel());
    await ready();
    await openRaw(user);
    expect(within(selectedTotal()).getByText(/200,00\s*€/)).toBeVisible();
    expect(screen.queryByRole('checkbox', { name: 'Inclure dans le PDF la ligne 1' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Inclure la saisie brute' })).toBeChecked();
    expect(screen.getByLabelText('Référence client')).toHaveValue('REFERENCE-15');
    await user.click(screen.getByRole('button', { name: 'Prévisualiser le PDF' }));
    expect(await screen.findByText('PDF brut de recette')).toBeVisible();
    expect(mocks.export.mock.calls[0][1].rawLines).toEqual([expect.objectContaining({ includeInPdf: false })]);
    await user.click(screen.getByRole('button', { name: 'Supprimer la ligne 1' }));
    await waitFor(() => expect(mocks.deleteRaw).toHaveBeenCalledWith(client, 50));
    await waitFor(() => expect(screen.queryByLabelText('Désignation, ligne 1')).not.toBeInTheDocument());
    expect(screen.getByText('Aucune ligne de saisie brute pour cette période.')).toBeVisible();
    expect(within(selectedTotal()).getByText(/0,00\s*€/)).toBeVisible();
    expect(screen.getByLabelText('Référence client')).toHaveValue('REFERENCE-7');
    expect(mocks.saveRaw).not.toHaveBeenCalled();
    expect(mocks.savePeriod).not.toHaveBeenCalled();
  });

  it('preserves a refused save as a dirty row that can be corrected and retried', async () => {
    mocks.saveRaw.mockRejectedValueOnce(new Error('Enregistrement brut refusé.'));
    const user = userEvent.setup();
    render(panel());
    await ready();
    await openRaw(user);
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
    for (const name of ['Date, ligne 1', 'Désignation, ligne 1', 'Prix unitaire HT, ligne 1', 'Quantité, ligne 1', 'Choisir dans le catalogue, ligne 1']) {
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
    fillManual('Réponse septembre tardive');
    await user.click(screen.getByRole('button', { name: 'Enregistrer la ligne 1' }));
    await waitFor(() => expect(phase === 'creation' ? mocks.ensurePeriod : mocks.saveRaw).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Mois', { exact: true }), { target: { value: '2026-10' } });
    await waitFor(() => expect(screen.getByLabelText('Désignation, ligne 1')).toHaveValue('Ligne octobre'));
    await act(async () => {
      if (phase === 'creation') pendingPeriod.resolve(canonicalSeptember);
      else pendingLine.resolve(rawLine({ designation: 'Réponse septembre tardive' }));
    });
    await ready();
    expect(screen.getByLabelText('Mois', { exact: true })).toHaveValue('2026-10');
    expect(screen.getByLabelText('Désignation, ligne 1')).toHaveValue('Ligne octobre');
    expect(screen.queryByLabelText('Désignation, ligne 2')).not.toBeInTheDocument();
    expect(within(selectedTotal()).getByText(/300,00\s*€/)).toBeVisible();
    if (phase === 'creation') expect(mocks.saveRaw).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Prévisualiser le PDF' }));
    expect(await screen.findByText('PDF brut de recette')).toBeVisible();
    expect(mocks.export.mock.calls[0][1].period).toMatchObject({ id: 20, invoiceNumber: 'FACTURE-OCTOBRE', periodMonth: '2026-10-01' });
    expect(mocks.export.mock.calls[0][1].rawLines).toEqual([octoberLine]);
    if (phase === 'write') {
      fireEvent.change(screen.getByLabelText('Mois', { exact: true }), { target: { value: '2026-09' } });
      await waitFor(() => expect(screen.getByLabelText('Désignation, ligne 1')).toHaveValue('Réponse septembre tardive'));
      await ready();
      await user.click(screen.getByRole('button', { name: 'Prévisualiser le PDF' }));
      await waitFor(() => expect(mocks.export).toHaveBeenCalledTimes(2));
      expect(mocks.export.mock.calls[1][1].rawLines).toEqual([expect.objectContaining({ designation: 'Réponse septembre tardive', billingPeriodId: 10 })]);
    }
  });
});
