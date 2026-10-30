import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectBillingPanel } from './ProjectBillingPanel';
import type { ProjectRecord } from './projectQueries';
import type {
  BillingExpenseDraft,
  BillingPeriodDraft,
  ProjectBillingData,
  ProjectBillingDocument,
  ProjectBillingPeriod,
  ProjectChargeableExpense,
} from './projectBilling';

const mocks = vi.hoisted(() => ({
  data: vi.fn(), catalog: vi.fn(), dprs: vi.fn(), providers: vi.fn(), references: vi.fn(),
  ensurePeriod: vi.fn(), savePeriod: vi.fn(), saveExpense: vi.fn(), upload: vi.fn(), export: vi.fn(),
}));

vi.mock('./projectBilling', async original => ({
  ...await original<typeof import('./projectBilling')>(),
  fetchProjectBillingData: mocks.data,
  fetchProjectServiceCatalog: mocks.catalog,
  fetchProjectBillingDprs: mocks.dprs,
  ensureProjectBillingPeriod: mocks.ensurePeriod,
  saveProjectBillingPeriod: mocks.savePeriod,
  saveProjectChargeableExpense: mocks.saveExpense,
  uploadProjectBillingDocument: mocks.upload,
  generateBillingExportPackage: mocks.export,
}));
vi.mock('./projectBillingReferences', async original => ({
  ...await original<typeof import('./projectBillingReferences')>(),
  fetchBillingReferences: mocks.references,
}));
vi.mock('../serviceProviders/serviceProviders', async original => ({
  ...await original<typeof import('../serviceProviders/serviceProviders')>(),
  fetchServiceProviders: mocks.providers,
}));
vi.mock('./ProjectPdfPreview', () => ({ ProjectPdfPreview: () => <div>PDF de recette du mois de refacturation</div> }));

const client = {} as never;
const project = { id: 145, projectCode: 'P145', title: 'REFACTURATION DE RECETTE', primaryVesselName: 'GOURY' } as ProjectRecord;

function period(overrides: Partial<ProjectBillingPeriod> = {}): ProjectBillingPeriod {
  return {
    id: 10, projectId: project.id, companyId: 1, periodMonth: '2026-08-01',
    clientReference: '', invoiceNumber: 'FACTURE-AOUT', invoiceIssuedOn: '', invoiceSentOn: '',
    paymentDueOn: '', paidOn: '', amountHt: 0, comments: '', includeOperationsInPdf: false,
    includeExpensesInPdf: true, includeBbtmInPdf: false, includeRawInPdf: false,
    excludedOperationKeys: [], ...overrides,
  };
}

const october = period({ id: 20, periodMonth: '2026-10-01', invoiceNumber: 'FACTURE-OCTOBRE' });

function expense(overrides: Partial<ProjectChargeableExpense> = {}): ProjectChargeableExpense {
  return {
    id: 30, billingPeriodId: 10, category: 'other', nature: '', supplier: 'FOURNISSEUR RECETTE',
    supplierSpecialties: [], invoiceDate: '2026-08-19', invoiceNumber: 'FOURNISSEUR-AOUT',
    amountHt: 150, amountTtc: 180, currency: 'EUR', quantity: null, unit: '', comments: '',
    dprReportId: null, includeInPdf: true, ...overrides,
  };
}

function attachment(overrides: Partial<ProjectBillingDocument> = {}): ProjectBillingDocument {
  return {
    id: 40, billingPeriodId: 10, chargeableExpenseId: 30, documentKind: 'chargeable_expense',
    bucketName: 'project-files', objectPath: 'projects/145/billing/10/expenses/30/facture.pdf',
    fileName: 'facture-aout.pdf', mimeType: 'application/pdf', fileSizeBytes: 7, ...overrides,
  };
}

function billingData(overrides: Partial<ProjectBillingData> = {}): ProjectBillingData {
  return { periods: [period(), october], expenses: [], services: [], documents: [], rawLines: [], ...overrides };
}

async function mount(data = billingData(), month = '2026-08', isManager = true) {
  let resolveLoad!: (value: ProjectBillingData) => void;
  const load = new Promise<ProjectBillingData>(resolve => { resolveLoad = resolve; });
  mocks.data.mockReturnValueOnce(load);
  render(<ProjectBillingPanel client={client} project={project} operations={[]} isManager={isManager} initialMonth={month} workspace />);
  expect(mocks.data).toHaveBeenCalledWith(client, project.id);
  await act(async () => {
    resolveLoad(data);
    await load;
  });
  expect(screen.getByRole('button', { name: 'Prévisualiser le PDF' })).toBeEnabled();
}

function expenseSection() {
  return within(screen.getByRole('button', { name: 'Services refacturables' }).closest('article')!);
}

function expectExpenseCount(count: number) {
  expect(within(screen.getByRole('button', { name: 'Services refacturables' })).getByLabelText(`${count} enregistrement${count === 1 ? '' : 's'}`)).toHaveTextContent(String(count));
}

function expectSelectedTotal(amount: string) {
  expect(screen.getByText('Total sélectionné HT').parentElement).toHaveTextContent(amount);
}

async function selectMonth(month: string) {
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Mois', { exact: true }), { target: { value: month } });
  });
}

async function addExpense(user: ReturnType<typeof userEvent.setup>) {
  await user.click(expenseSection().getByRole('button', { name: 'Ajouter' }));
  return screen.getByRole('dialog', { name: 'Ajouter un frais imputable' });
}

async function fillExpense(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
  await user.click(within(dialog).getByRole('combobox', { name: 'Fournisseur' }));
  await user.click(within(dialog).getByRole('option', { name: /FOURNISSEUR RECETTE/ }));
  fireEvent.change(within(dialog).getByLabelText('Date facture'), { target: { value: '2026-08-19' } });
  fireEvent.change(within(dialog).getByLabelText('N° facture'), { target: { value: 'FOURNISSEUR-AOUT' } });
  fireEvent.change(within(dialog).getByLabelText('Montant HT'), { target: { value: '150' } });
}

async function submitExpense(dialog: HTMLElement) {
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer le frais' }));
  });
}

async function preview(user: ReturnType<typeof userEvent.setup>) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Prévisualiser le PDF' }));
  });
  expect(screen.getByRole('dialog', { name: 'Aperçu du relevé PDF' })).toBeVisible();
  await user.keyboard('{Escape}');
}

beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset());
  mocks.catalog.mockResolvedValue([]);
  mocks.dprs.mockResolvedValue([]);
  mocks.references.mockResolvedValue([]);
  mocks.providers.mockResolvedValue([{ id: 1, name: 'FOURNISSEUR RECETTE', active: true, category: 'Port', specialties: [], contacts: [] }]);
  mocks.ensurePeriod.mockImplementation(async (_client: unknown, _project: number, draft: BillingPeriodDraft) => period({ ...draft, id: draft.periodMonth.startsWith('2026-10') ? 20 : 10, periodMonth: `${draft.periodMonth.slice(0, 7)}-01` }));
  mocks.saveExpense.mockImplementation(async (_client: unknown, _project: number, billingPeriodId: number, draft: BillingExpenseDraft, id?: number) => expense({ ...draft, id: id ?? 30, billingPeriodId }));
  mocks.upload.mockImplementation(async (_client: unknown, input: { billingPeriodId: number; expenseId?: number; file: File }) => attachment({ id: 41, billingPeriodId: input.billingPeriodId, chargeableExpenseId: input.expenseId ?? null, fileName: input.file.name }));
  mocks.export.mockResolvedValue({ blob: new Blob(['PDF de recette'], { type: 'application/pdf' }), extension: 'pdf' });
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:expense-month-test') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});
afterEach(() => vi.restoreAllMocks());

describe('independent expense rebilling month', () => {
  it('defaults to the selected month and bills an August invoice in an existing October period', async () => {
    const user = userEvent.setup();
    await mount();
    const dialog = await addExpense(user);
    const month = within(dialog).getByLabelText('À refacturer sur le mois');
    expect(month).toHaveAttribute('type', 'month');
    expect(month).toBeRequired();
    expect(month).toHaveValue('2026-08');
    await fillExpense(user, dialog);
    fireEvent.change(month, { target: { value: '2026-10' } });
    expect(within(dialog).getByLabelText('Date facture')).toHaveValue('2026-08-19');
    await submitExpense(dialog);
    expect(mocks.saveExpense).toHaveBeenCalledWith(client, project.id, 20, expect.objectContaining({ invoiceDate: '2026-08-19', amountHt: 150 }), undefined);
    expect(mocks.ensurePeriod).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Ajouter un frais imputable' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Mois', { exact: true })).toHaveValue('2026-08');
    expectExpenseCount(0);
    expectSelectedTotal('0,00');
    await selectMonth('2026-10');
    expectExpenseCount(1);
    expect(expenseSection().getByText('2026-08-19')).toBeVisible();
    expectSelectedTotal('150,00');
    await preview(user);
    expect(mocks.export.mock.calls[0][1]).toMatchObject({ period: { id: 20, periodMonth: '2026-10-01' }, expenses: [expect.objectContaining({ invoiceDate: '2026-08-19', billingPeriodId: 20 })] });
  });

  it('creates only the target month without copying or replacing the current invoice draft', async () => {
    const user = userEvent.setup();
    await mount(billingData({ periods: [period({ comments: 'Commentaire août', paidOn: '2026-09-01' })] }));
    fireEvent.change(screen.getByLabelText('Numéro de facture'), { target: { value: 'BROUILLON-AOUT' } });
    const dialog = await addExpense(user);
    await fillExpense(user, dialog);
    fireEvent.change(within(dialog).getByLabelText('À refacturer sur le mois'), { target: { value: '2026-10' } });
    await submitExpense(dialog);
    expect(mocks.ensurePeriod).toHaveBeenCalledExactlyOnceWith(client, project.id, expect.objectContaining({ periodMonth: '2026-10', invoiceNumber: '', comments: '', paidOn: '' }));
    expect(mocks.saveExpense).toHaveBeenCalledWith(client, project.id, 20, expect.objectContaining({ invoiceDate: '2026-08-19' }), undefined);
    expect(screen.getByLabelText('Mois', { exact: true })).toHaveValue('2026-08');
    expect(screen.getByLabelText('Numéro de facture')).toHaveValue('BROUILLON-AOUT');
    expect(screen.getByLabelText('Commentaires', { exact: true })).toHaveValue('Commentaire août');
    expectExpenseCount(0);
    await selectMonth('2026-10');
    expectExpenseCount(1);
    expect(screen.getByLabelText('Numéro de facture')).toHaveValue('');
    expect(mocks.savePeriod).not.toHaveBeenCalled();
  });

  it('moves an existing expense and its stored attachment into October totals and export while keeping the August invoice date', async () => {
    const originalAttachment = attachment();
    const user = userEvent.setup();
    await mount(billingData({ expenses: [expense()], documents: [originalAttachment] }));
    expectExpenseCount(1);
    expectSelectedTotal('150,00');
    await user.click(expenseSection().getByRole('button', { name: 'Modifier FOURNISSEUR-AOUT' }));
    const dialog = screen.getByRole('dialog', { name: 'Modifier le frais imputable' });
    expect(within(dialog).getByLabelText('À refacturer sur le mois')).toHaveValue('2026-08');
    expect(within(dialog).getByRole('button', { name: 'facture-aout.pdf' })).toBeVisible();
    fireEvent.change(within(dialog).getByLabelText('À refacturer sur le mois'), { target: { value: '2026-10' } });
    await submitExpense(dialog);
    expect(mocks.saveExpense).toHaveBeenCalledWith(client, project.id, 20, expect.objectContaining({ invoiceDate: '2026-08-19' }), 30);
    expectExpenseCount(0);
    expectSelectedTotal('0,00');
    expect(expenseSection().queryByText('FOURNISSEUR RECETTE')).not.toBeInTheDocument();
    await preview(user);
    expect(mocks.export.mock.calls[0][1].expenses).toEqual([]);
    expect(mocks.export.mock.calls[0][2]).toEqual([]);
    await selectMonth('2026-10');
    expectExpenseCount(1);
    expectSelectedTotal('150,00');
    expect(expenseSection().getByText('2026-08-19')).toBeVisible();
    expect(expenseSection().getByRole('button', { name: 'facture-aout.pdf' })).toBeVisible();
    await user.click(expenseSection().getByRole('button', { name: 'Modifier FOURNISSEUR-AOUT' }));
    const reopened = screen.getByRole('dialog', { name: 'Modifier le frais imputable' });
    expect(within(reopened).getByLabelText('À refacturer sur le mois')).toHaveValue('2026-10');
    expect(within(reopened).getByRole('button', { name: 'facture-aout.pdf' })).toBeVisible();
    await user.click(within(reopened).getByRole('button', { name: 'Annuler' }));
    await preview(user);
    expect(mocks.export.mock.calls[1][1]).toMatchObject({ period: { id: 20 }, expenses: [expect.objectContaining({ id: 30, invoiceDate: '2026-08-19', billingPeriodId: 20 })] });
    expect(mocks.export.mock.calls[1][2]).toEqual([originalAttachment]);
    expect(mocks.ensurePeriod).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('defaults an existing October expense to October independently of its August invoice date', async () => {
    const user = userEvent.setup();
    await mount(billingData({ expenses: [expense({ billingPeriodId: 20 })], documents: [attachment()] }), '2026-10');
    await user.click(expenseSection().getByRole('button', { name: 'Modifier FOURNISSEUR-AOUT' }));
    const dialog = screen.getByRole('dialog', { name: 'Modifier le frais imputable' });
    expect(within(dialog).getByLabelText('À refacturer sur le mois')).toHaveValue('2026-10');
    expect(within(dialog).getByLabelText('Date facture')).toHaveValue('2026-08-19');
    expect(within(dialog).getByRole('button', { name: 'facture-aout.pdf' })).toBeVisible();
    fireEvent.change(within(dialog).getByLabelText('Date facture'), { target: { value: '2026-09-07' } });
    expect(within(dialog).getByLabelText('À refacturer sur le mois')).toHaveValue('2026-10');
    await submitExpense(dialog);
    expect(mocks.saveExpense).toHaveBeenCalledWith(client, project.id, 20, expect.objectContaining({ invoiceDate: '2026-09-07' }), 30);
    expect(mocks.ensurePeriod).not.toHaveBeenCalled();
  });

  it('uploads new supporting files against the selected rebilling month and includes them in that month export', async () => {
    const user = userEvent.setup();
    await mount();
    const dialog = await addExpense(user);
    await fillExpense(user, dialog);
    fireEvent.change(within(dialog).getByLabelText('À refacturer sur le mois'), { target: { value: '2026-10' } });
    await user.upload(within(dialog).getByLabelText('Pièces jointes du service refacturable'), new File(['invoice'], 'facture-aout.pdf', { type: 'application/pdf' }));
    await submitExpense(dialog);
    expect(mocks.upload).toHaveBeenCalledExactlyOnceWith(client, expect.objectContaining({ projectId: project.id, billingPeriodId: 20, expenseId: 30, kind: 'chargeable_expense', file: expect.any(File) }));
    await selectMonth('2026-10');
    await preview(user);
    expect(mocks.export.mock.calls[0][2]).toEqual([expect.objectContaining({ billingPeriodId: 20, chargeableExpenseId: 30 })]);
  });

  it('adds a HALBOURG document from the October expense row with a gateway-compatible filename', async () => {
    const user = userEvent.setup();
    const p144 = { ...project, id: 144, projectCode: 'P144', title: 'GUARD VESSEL EMDT' };
    const halbourg = expense({
      billingPeriodId: october.id, supplier: 'SARL HALBOURG ET FILS',
      nature: 'Pompage Eaux / Hydrocarbures', supplierSpecialties: ['Pompage Eaux / Hydrocarbures'],
      invoiceDate: '2026-09-30', invoiceNumber: '152450', amountHt: 1330,
    });
    mocks.data.mockResolvedValueOnce(billingData({
      periods: [{ ...october, projectId: p144.id }], expenses: [halbourg],
    }));
    mocks.upload.mockImplementation(async (_client: unknown, input: { billingPeriodId: number; expenseId: number; file: File }) => {
      // eslint-disable-next-line no-control-regex -- Mirror the document gateway's filename validation.
      if (/[/\\\u0000-\u001f\u007f]/.test(input.file.name)) throw new Error('INVALID_DOCUMENT_UPLOAD');
      return attachment({
        id: 41, billingPeriodId: input.billingPeriodId, chargeableExpenseId: input.expenseId,
        fileName: input.file.name, objectPath: 'projects/144/20/expenses/30/halbourg.pdf',
      });
    });
    render(<ProjectBillingPanel client={client} project={p144} operations={[]} isManager initialMonth="2026-10" workspace />);
    const row = (await screen.findByText('SARL HALBOURG ET FILS')).closest('tr')!;
    expect(within(row).getByText('Pompage Eaux / Hydrocarbures')).toBeVisible();
    await user.upload(within(row).getByLabelText('Ajouter'), new File(['facture HALBOURG'], 'facture.pdf', { type: 'application/pdf' }));
    const expectedName = '2026-09-30 - 152450 - Pompage Eaux - Hydrocarbures.pdf';
    expect(await within(row).findByRole('button', { name: expectedName })).toBeVisible();
    expect(mocks.upload).toHaveBeenCalledExactlyOnceWith(client, {
      projectId: p144.id, billingPeriodId: october.id, expenseId: halbourg.id,
      kind: 'chargeable_expense', file: expect.any(File),
    });
    expect(mocks.upload.mock.calls[0][1].file.name).toBe(expectedName);
    expect(screen.getByText('Documents stockés dans l’espace privé du projet.')).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mocks.saveExpense).not.toHaveBeenCalled();
    expect(mocks.ensurePeriod).not.toHaveBeenCalled();
  });

  it('requires a rebilling month before any period, expense or attachment write', async () => {
    const user = userEvent.setup();
    await mount(billingData({ periods: [period()] }));
    const dialog = await addExpense(user);
    await fillExpense(user, dialog);
    fireEvent.change(within(dialog).getByLabelText('À refacturer sur le mois'), { target: { value: '' } });
    await submitExpense(dialog);
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/mois/i);
    expect(within(dialog).getByLabelText('Date facture')).toHaveValue('2026-08-19');
    expect(mocks.ensurePeriod).not.toHaveBeenCalled();
    expect(mocks.saveExpense).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('keeps the billed expense readable without add or edit access for a reader', async () => {
    await mount(billingData({ expenses: [expense({ billingPeriodId: 20 })], documents: [attachment()] }), '2026-10', false);
    expectExpenseCount(1);
    expect(expenseSection().getByText('2026-08-19')).toBeVisible();
    expectSelectedTotal('150,00');
    expect(expenseSection().queryByRole('button', { name: 'Ajouter' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Modifier FOURNISSEUR-AOUT' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('À refacturer sur le mois')).not.toBeInTheDocument();
    expect(expenseSection().getByRole('checkbox', { name: 'Inclure le frais FOURNISSEUR-AOUT dans le PDF' })).toBeDisabled();
    expect(mocks.ensurePeriod).not.toHaveBeenCalled();
    expect(mocks.saveExpense).not.toHaveBeenCalled();
  });
});
