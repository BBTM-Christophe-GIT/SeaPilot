import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectBillingPanel } from './ProjectBillingPanel';
import type { BillingAttachmentCheck } from './projectBillingAttachments';
import type { ProjectBillingData, ProjectBillingDocument, ProjectChargeableExpense } from './projectBilling';
import type { ProjectRecord } from './projectQueries';

const mocks = vi.hoisted(() => ({
  data: vi.fn(), catalog: vi.fn(), dprs: vi.fn(), export: vi.fn(), check: vi.fn(), upload: vi.fn(), sign: vi.fn(),
}));
vi.mock('./projectBilling', async original => ({
  ...await original<typeof import('./projectBilling')>(),
  fetchProjectBillingData: mocks.data, fetchProjectServiceCatalog: mocks.catalog, fetchProjectBillingDprs: mocks.dprs,
  generateBillingExportPackage: mocks.export, uploadProjectBillingDocument: mocks.upload,
  signedProjectBillingDocumentUrl: mocks.sign,
}));
vi.mock('./projectBillingAttachments', async original => ({
  ...await original<typeof import('./projectBillingAttachments')>(), checkBillingAttachments: mocks.check,
}));
vi.mock('./projectBillingReferences', async original => ({
  ...await original<typeof import('./projectBillingReferences')>(),
  fetchBillingReferences: vi.fn().mockResolvedValue([]), saveBillingReference: vi.fn().mockResolvedValue({}),
}));
vi.mock('../serviceProviders/serviceProviders', async original => ({
  ...await original<typeof import('../serviceProviders/serviceProviders')>(), fetchServiceProviders: vi.fn().mockResolvedValue([]),
}));
vi.mock('./ProjectPdfPreview', () => ({ ProjectPdfPreview: () => <div>Aperçu PDF de recette</div> }));

const client = {} as never;
const project = { id: 144, projectCode: 'P144', title: 'GUARD VESSEL EMDT', primaryVesselName: 'GOURY' } as ProjectRecord;

function expense(id: number, periodId = 10): ProjectChargeableExpense {
  return {
    id, billingPeriodId: periodId, category: 'port', nature: '', supplier: `Fournisseur ${id}`, supplierSpecialties: [],
    invoiceDate: '2026-10-09', invoiceNumber: `FACTURE-${id}`, amountHt: 100, amountTtc: 120,
    currency: 'EUR', quantity: null, unit: '', comments: '', dprReportId: null, includeInPdf: true,
  };
}
function attachment(id: number, fileName = `facture-${id}.pdf`, periodId = 10): ProjectBillingDocument {
  return {
    id, billingPeriodId: periodId, chargeableExpenseId: id, documentKind: 'chargeable_expense',
    bucketName: 'project-files', objectPath: `projects/144/${periodId}/expense/${id}/${fileName}`,
    fileName, mimeType: 'application/pdf', fileSizeBytes: 100,
  };
}
function fixture(documents = [attachment(1)], expenses = documents.map(document => expense(document.id))): ProjectBillingData {
  return {
    periods: [10, 11].map((id) => ({
      id, projectId: project.id, companyId: 1, periodMonth: id === 10 ? '2026-10-01' : '2026-11-01',
      clientReference: '', invoiceNumber: '', invoiceIssuedOn: '', invoiceSentOn: '', paymentDueOn: '', paidOn: '',
      amountHt: 0, comments: '', includeOperationsInPdf: false, includeExpensesInPdf: true,
      includeBbtmInPdf: false, includeRawInPdf: false, excludedOperationKeys: [],
    })),
    expenses, documents, services: [], rawLines: [],
  };
}
function check(document: ProjectBillingDocument, status: BillingAttachmentCheck['status']): BillingAttachmentCheck {
  return { documentId: document.id, fileName: document.fileName, status, message: `Diagnostic ${status}` };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function panel(overrides: { client?: typeof client; project?: ProjectRecord; initialMonth?: string } = {}) {
  return <ProjectBillingPanel client={overrides.client ?? client} project={overrides.project ?? project} operations={[]} isManager initialMonth={overrides.initialMonth ?? '2026-10'} workspace />;
}
async function renderPanel() {
  let result!: ReturnType<typeof render>;
  await act(async () => { result = render(panel()); });
  return result;
}
function attachmentStatus(name: string, label: string) {
  return screen.getByLabelText(`${label} : ${name}`);
}
async function ready() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Exporter le PDF' })).toBeEnabled());
}

beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset());
  mocks.data.mockResolvedValue(fixture());
  mocks.catalog.mockResolvedValue([]);
  mocks.dprs.mockResolvedValue([]);
  mocks.check.mockImplementation(async (_client, documents: ProjectBillingDocument[]) => documents.map(document => check(document, 'available')));
  mocks.export.mockResolvedValue({ blob: new Blob(['PDF'], { type: 'application/pdf' }), extension: 'pdf' });
  mocks.upload.mockResolvedValue({ ...attachment(99, 'releve.pdf'), chargeableExpenseId: null, documentKind: 'export' });
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:attachment-status-test') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('billing attachment availability in Services refacturables', () => {
  it('shows all distinct statuses beside each original filename and preserves billed fees', async () => {
    const documents = [1, 2, 3, 4, 5].map(id => attachment(id));
    const statuses: BillingAttachmentCheck['status'][] = ['available', 'missing', 'invalid', 'unavailable', 'unverified'];
    mocks.data.mockResolvedValue(fixture(documents, [1, 2, 3, 4, 5, 6].map(id => expense(id))));
    mocks.check.mockResolvedValue(documents.map((document, index) => check(document, statuses[index])));
    await renderPanel();

    await screen.findByLabelText('Fichier manquant : facture-2.pdf');
    for (const [index, label] of ['Disponible', 'Fichier manquant', 'Fichier invalide', 'Accès impossible', 'Non vérifié'].entries()) {
      expect(attachmentStatus(documents[index].fileName, label)).toBeInTheDocument();
      const button = screen.getByRole('button', { name: documents[index].fileName });
      expect(button).toBeEnabled();
      expect(button).toHaveAccessibleDescription(expect.stringContaining(label));
      if (statuses[index] !== 'available') {
        expect(button).toHaveAccessibleDescription(expect.stringContaining(check(documents[index], statuses[index]).message));
      }
    }
    expect(screen.getByText('Aucun justificatif')).toBeVisible();
    const missingRow = screen.getByRole('button', { name: 'facture-2.pdf' }).closest('tr')!;
    expect(missingRow).toHaveAttribute('data-attachment-issue', 'true');
    expect(within(missingRow).getByRole('checkbox')).toBeChecked();
    expect(within(missingRow).getByText('100,00 €')).toBeVisible();
    expect(screen.getByLabelText('Totaux sélectionnés pour l’export')).toHaveTextContent(/600,00/);
    expect(mocks.check).toHaveBeenCalledWith(client, documents, { allowLocalDrive: true, signal: expect.any(AbortSignal) });
  });

  it('generates a standard PDF while an automatic check is pending', async () => {
    const pending = deferred<BillingAttachmentCheck[]>();
    mocks.check.mockReturnValue(pending.promise);
    await renderPanel();
    await screen.findByText('Vérification des justificatifs…');
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Exporter le PDF' }));
    await waitFor(() => expect(mocks.export).toHaveBeenCalledWith(client, expect.objectContaining({ expenses: [expect.objectContaining({ amountHt: 100, includeInPdf: true })] }), expect.any(Array), 'pdf'));
    await screen.findByText('Export généré.');
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(mocks.check).toHaveBeenCalledOnce();
  });

  it('checks local sources on opening and allows an optional recheck after the file changes', async () => {
    const document = attachment(1);
    mocks.check.mockResolvedValueOnce([check(document, 'missing')]).mockResolvedValueOnce([check(document, 'available')]);
    await renderPanel();
    await screen.findByLabelText('Fichier manquant : facture-1.pdf');
    expect(mocks.check).toHaveBeenCalledOnce();
    expect(mocks.check).toHaveBeenCalledWith(client, [document], { allowLocalDrive: true, signal: expect.any(AbortSignal) });
    await userEvent.click(screen.getByRole('button', { name: 'Revérifier les justificatifs' }));
    await screen.findByLabelText('Disponible : facture-1.pdf');
    expect(mocks.check).toHaveBeenLastCalledWith(client, [document], { allowLocalDrive: true, signal: expect.any(AbortSignal) });
    expect(screen.getByRole('button', { name: 'facture-1.pdf' })).toBeEnabled();
  });

  it('keeps merged PDF omission warnings and row statuses after the generated export has been stored', async () => {
    const document = attachment(1);
    const issue = { ...check(document, 'missing'), status: 'missing' as const };
    mocks.check.mockResolvedValue([check(document, 'unverified')]);
    mocks.export.mockResolvedValue({ blob: new Blob(['PDF']), extension: 'pdf', attachmentIssues: [issue], checkedDocumentIds: [1] });
    await renderPanel();
    await screen.findByLabelText('Non vérifié : facture-1.pdf');
    await ready();
    await userEvent.selectOptions(screen.getByLabelText('Fichier', { exact: true }), 'merged-pdf');
    await userEvent.click(screen.getByRole('button', { name: 'Exporter le PDF' }));
    await screen.findByText('Fichiers non intégrés au PDF :');
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledOnce());
    expect(attachmentStatus('facture-1.pdf', 'Fichier manquant')).toBeVisible();
    expect(mocks.check).toHaveBeenCalledOnce();
    const warning = screen.getByText('Fichiers non intégrés au PDF :').closest('[role="status"]')!;
    expect(within(warning as HTMLElement).getAllByRole('listitem').map(item => item.textContent)).toEqual(['facture-1.pdf']);
    expect(screen.getByLabelText('Totaux sélectionnés pour l’export')).toHaveTextContent(/100,00/);
    expect(screen.getByRole('checkbox', { name: 'Inclure le frais FACTURE-1 dans le PDF' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'facture-1.pdf' }).closest('tr')).toHaveAttribute('data-attachment-issue', 'true');
  });

  it('does not let a late automatic result overwrite the completed merged export checks', async () => {
    const document = attachment(1);
    const pending = deferred<BillingAttachmentCheck[]>();
    const issue = { ...check(document, 'missing'), status: 'missing' as const };
    mocks.check.mockReturnValue(pending.promise);
    mocks.export.mockResolvedValue({ blob: new Blob(['PDF']), extension: 'pdf', attachmentIssues: [issue], checkedDocumentIds: [1] });
    await renderPanel();
    await screen.findByText('Vérification des justificatifs…');
    await ready();
    const automaticSignal = mocks.check.mock.calls[0][2].signal as AbortSignal;
    await userEvent.selectOptions(screen.getByLabelText('Fichier', { exact: true }), 'merged-pdf');
    await userEvent.click(screen.getByRole('button', { name: 'Exporter le PDF' }));
    await screen.findByText('Fichiers non intégrés au PDF :');
    expect(automaticSignal.aborted).toBe(true);
    await act(async () => pending.resolve([check(document, 'unverified')]));
    expect(attachmentStatus('facture-1.pdf', 'Fichier manquant')).toBeVisible();
    expect(screen.queryByLabelText('Non vérifié : facture-1.pdf')).not.toBeInTheDocument();
    expect(screen.getByText('Fichiers non intégrés au PDF :')).toBeVisible();
  });

  it('downloads a partial ZIP and lists only omitted filenames while preserving the PDF option', async () => {
    const document = attachment(1);
    const issue = { ...check(document, 'missing'), status: 'missing' as const };
    mocks.export.mockResolvedValueOnce({ blob: new Blob(['ZIP']), extension: 'zip', attachmentIssues: [issue] });
    await renderPanel();
    await ready();
    await userEvent.selectOptions(screen.getByLabelText('Fichier', { exact: true }), 'zip');
    await userEvent.click(screen.getByRole('button', { name: 'Exporter le PDF' }));
    await screen.findByLabelText('Fichier manquant : facture-1.pdf');
    const warning = (await screen.findByText('Fichiers non intégrés au ZIP :')).closest('[role="status"]')!;
    expect(within(warning as HTMLElement).getAllByRole('listitem').map(item => item.textContent)).toEqual(['facture-1.pdf']);
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Fichier', { exact: true }), 'pdf');
    await userEvent.click(screen.getByRole('button', { name: 'Exporter le PDF' }));
    await screen.findByText('Export généré.');
    await waitFor(() => expect(mocks.export).toHaveBeenLastCalledWith(client, expect.any(Object), expect.any(Array), 'pdf'));
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('Fichiers non intégrés au ZIP :')).not.toBeInTheDocument();
  });

  it('aborts automatic reads and ignores a late result after selecting another billing month', async () => {
    const document = attachment(1);
    const nextDocument = attachment(2, 'facture-novembre.pdf', 11);
    const pending = deferred<BillingAttachmentCheck[]>();
    mocks.data.mockResolvedValue(fixture([document, nextDocument], [expense(1), expense(2, 11)]));
    mocks.check.mockReturnValueOnce(pending.promise).mockResolvedValueOnce([check(nextDocument, 'available')]);
    await renderPanel();
    await ready();
    const oldSignal = mocks.check.mock.calls[0][2].signal as AbortSignal;
    fireEvent.change(screen.getByLabelText('Mois', { exact: true }), { target: { value: '2026-11' } });
    await screen.findByLabelText('Disponible : facture-novembre.pdf');
    expect(oldSignal.aborted).toBe(true);
    await act(async () => pending.resolve([check(document, 'missing')]));
    expect(screen.queryByLabelText('Fichier manquant : facture-1.pdf')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'facture-1.pdf' })).not.toBeInTheDocument();
    expect(attachmentStatus('facture-novembre.pdf', 'Disponible')).toBeInTheDocument();
  });

  it.each(['project', 'client'] as const)('clears prior issues and ignores late checks when the %s changes', async (context) => {
    const oldDocument = attachment(1);
    const nextDocument = attachment(1, 'nouveau-dossier.pdf');
    const pending = deferred<BillingAttachmentCheck[]>();
    mocks.check.mockReturnValueOnce(pending.promise).mockResolvedValueOnce([check(nextDocument, 'available')]);
    mocks.data.mockResolvedValueOnce(fixture([oldDocument])).mockResolvedValueOnce(fixture([nextDocument]));
    const view = await renderPanel();
    await ready();
    const oldSignal = mocks.check.mock.calls[0][2].signal as AbortSignal;
    const nextClient = context === 'client' ? { marker: 'new-client' } as never : client;
    const nextProject = context === 'project' ? { ...project, id: 145, projectCode: 'P145' } : project;
    await act(async () => { view.rerender(panel({ client: nextClient, project: nextProject })); });
    await screen.findByLabelText('Disponible : nouveau-dossier.pdf');
    expect(oldSignal.aborted).toBe(true);
    await act(async () => pending.resolve([check(oldDocument, 'missing')]));
    expect(screen.queryByLabelText('Fichier manquant : facture-1.pdf')).not.toBeInTheDocument();
    expect(attachmentStatus('nouveau-dossier.pdf', 'Disponible')).toBeInTheDocument();
    expect(mocks.check).toHaveBeenCalledTimes(2);
    expect(mocks.check.mock.calls[1][0]).toBe(nextClient);
    expect(mocks.check.mock.calls[1][1]).toEqual([nextDocument]);
  });

  it('ignores an export finishing after changing projects', async () => {
    const pending = deferred<{ blob: Blob; extension: 'pdf'; attachmentIssues: ReturnType<typeof check>[]; checkedDocumentIds: number[] }>();
    mocks.export.mockReturnValue(pending.promise);
    const view = await renderPanel();
    await ready();
    await userEvent.selectOptions(screen.getByLabelText('Fichier', { exact: true }), 'merged-pdf');
    await userEvent.click(screen.getByRole('button', { name: 'Exporter le PDF' }));
    await waitFor(() => expect(mocks.export).toHaveBeenCalledOnce());
    mocks.data.mockResolvedValue(fixture([], []));
    await act(async () => { view.rerender(panel({ project: { ...project, id: 145, projectCode: 'P145' } })); });
    await ready();
    await act(async () => pending.resolve({ blob: new Blob(['old PDF']), extension: 'pdf', attachmentIssues: [check(attachment(1), 'missing')], checkedDocumentIds: [1] }));
    expect(screen.queryByText(/Fichiers non intégrés au/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Fichier manquant : facture-1.pdf')).not.toBeInTheDocument();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('rechecks identical document metadata after the authenticated client changes', async () => {
    const document = attachment(1);
    mocks.data.mockResolvedValue(fixture([document]));
    const view = await renderPanel();
    await screen.findByLabelText('Disponible : facture-1.pdf');
    const nextClient = { marker: 'replacement-session' } as never;
    mocks.check.mockResolvedValue([check(document, 'unavailable')]);
    await act(async () => { view.rerender(panel({ client: nextClient })); });
    await screen.findByLabelText('Accès impossible : facture-1.pdf');
    expect(mocks.check).toHaveBeenLastCalledWith(nextClient, [document], { allowLocalDrive: true, signal: expect.any(AbortSignal) });
  });
});
