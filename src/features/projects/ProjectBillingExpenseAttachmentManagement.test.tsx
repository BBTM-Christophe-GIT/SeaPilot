import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectBillingPanel } from './ProjectBillingPanel';
import type { BillingAttachmentCheck } from './projectBillingAttachments';
import type {
  BillingExpenseDraft,
  BillingPeriodDraft,
  ProjectBillingData,
  ProjectBillingDocument,
  ProjectBillingPeriod,
  ProjectChargeableExpense,
  deleteProjectBillingDocument,
  replaceProjectBillingDocument,
  uploadProjectBillingDocument,
} from './projectBilling';
import type { ProjectRecord } from './projectQueries';

const mocks = vi.hoisted(() => ({
  data: vi.fn(), catalog: vi.fn(), dprs: vi.fn(), check: vi.fn(), providers: vi.fn(), references: vi.fn(),
  ensurePeriod: vi.fn(), savePeriod: vi.fn(), saveExpense: vi.fn(), replace: vi.fn(), remove: vi.fn(), upload: vi.fn(),
}));
vi.mock('./projectBilling', async original => ({
  ...await original<typeof import('./projectBilling')>(),
  fetchProjectBillingData: mocks.data,
  fetchProjectServiceCatalog: mocks.catalog,
  fetchProjectBillingDprs: mocks.dprs,
  ensureProjectBillingPeriod: mocks.ensurePeriod,
  saveProjectBillingPeriod: mocks.savePeriod,
  saveProjectChargeableExpense: mocks.saveExpense,
  replaceProjectBillingDocument: mocks.replace,
  deleteProjectBillingDocument: mocks.remove,
  uploadProjectBillingDocument: mocks.upload,
}));
vi.mock('./projectBillingAttachments', async original => ({
  ...await original<typeof import('./projectBillingAttachments')>(), checkBillingAttachments: mocks.check,
}));
vi.mock('./projectBillingReferences', async original => ({
  ...await original<typeof import('./projectBillingReferences')>(), fetchBillingReferences: mocks.references,
}));
vi.mock('../serviceProviders/serviceProviders', async original => ({
  ...await original<typeof import('../serviceProviders/serviceProviders')>(), fetchServiceProviders: mocks.providers,
}));
vi.mock('./ProjectPdfPreview', () => ({ ProjectPdfPreview: () => <div>Aperçu de recette des pièces jointes</div> }));

type ReplacementInput = Parameters<typeof replaceProjectBillingDocument>[1];
type DeleteInput = Parameters<typeof deleteProjectBillingDocument>[1];
type UploadInput = Parameters<typeof uploadProjectBillingDocument>[1];
const client = {} as never;
const project = { id: 144, projectCode: 'P144', title: 'GUARD VESSEL EMDT', primaryVesselName: 'GOURY' } as ProjectRecord;
const originalName = 'facture.pdf';

function period(overrides: Partial<ProjectBillingPeriod> = {}): ProjectBillingPeriod {
  return {
    id: 10, projectId: project.id, companyId: 1, periodMonth: '2026-10-01',
    clientReference: '', invoiceNumber: '', invoiceIssuedOn: '', invoiceSentOn: '', paymentDueOn: '', paidOn: '',
    amountHt: 0, comments: '', includeOperationsInPdf: false, includeExpensesInPdf: true,
    includeBbtmInPdf: false, includeRawInPdf: false, excludedOperationKeys: [], ...overrides,
  };
}
function expense(overrides: Partial<ProjectChargeableExpense> = {}): ProjectChargeableExpense {
  return {
    id: 19, billingPeriodId: 10, category: 'other', nature: '', supplier: 'FOURNISSEUR RECETTE', supplierSpecialties: [],
    invoiceDate: '2026-10-09', invoiceNumber: 'FACTURE-1', amountHt: 150, amountTtc: 180, currency: 'EUR',
    quantity: null, unit: '', comments: '', dprReportId: null, includeInPdf: true, ...overrides,
  };
}
function attachment(id: number, overrides: Partial<ProjectBillingDocument> = {}): ProjectBillingDocument {
  return {
    id, billingPeriodId: 10, chargeableExpenseId: 19, documentKind: 'chargeable_expense', bucketName: 'project-files',
    objectPath: `projects/144/10/expenses/19/original-${id}.pdf`, fileName: originalName,
    mimeType: 'application/pdf', fileSizeBytes: 3, ...overrides,
  };
}
function billingData(documents = [attachment(23), attachment(24)]): ProjectBillingData {
  return { periods: [period()], expenses: [expense()], documents, services: [], rawLines: [] };
}
function replacedDocument(input: ReplacementInput): ProjectBillingDocument {
  return {
    ...input.document, billingPeriodId: input.billingPeriodId, bucketName: 'project-files',
    objectPath: `projects/144/10/expenses/19/replacement-${input.document.id}.pdf`,
    fileName: input.file.name, mimeType: input.file.type, fileSizeBytes: input.file.size,
  };
}
function uploadedDocument(input: UploadInput): ProjectBillingDocument {
  return attachment(90, {
    billingPeriodId: input.billingPeriodId, chargeableExpenseId: input.expenseId ?? null,
    objectPath: 'projects/144/10/expenses/19/additional.pdf', fileName: input.file.name,
    mimeType: input.file.type, fileSizeBytes: input.file.size,
  });
}
async function mount(isManager = true) {
  await act(async () => {
    render(<ProjectBillingPanel client={client} project={project} operations={[]} isManager={isManager} initialMonth="2026-10" workspace />);
  });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Exporter le PDF' })).toBeEnabled());
}
async function click(button: HTMLElement) {
  await act(async () => { fireEvent.click(button); });
}
async function openEditor() {
  await click(screen.getByRole('button', { name: 'Modifier FACTURE-1' }));
  return screen.getByRole('dialog', { name: 'Modifier le frais imputable' });
}
function storedList(dialog: HTMLElement) {
  return within(dialog).getByRole('list', { name: 'Pièces jointes enregistrées' });
}
function documentRow(dialog: HTMLElement, id: number): HTMLElement {
  const row = storedList(dialog).querySelector<HTMLElement>(`li[data-document-id="${id}"]`);
  if (!row) throw new Error(`La pièce jointe ${id} n’est pas affichée.`);
  return row;
}
async function stageReplacement(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement, id = 23) {
  const file = new File(['replacement bytes'], 'facture-corrigee.pdf', { type: 'application/pdf' });
  await user.upload(within(documentRow(dialog, id)).getByLabelText(`Remplacer le fichier ${originalName}`, { exact: true }), file);
  return file;
}
async function stageDeletion(dialog: HTMLElement, id = 24) {
  await click(within(documentRow(dialog, id)).getByRole('button', { name: `Supprimer le fichier ${originalName}` }));
}
async function stageAddition(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
  const file = new File(['additional bytes'], 'nouvelle-preuve.pdf', { type: 'application/pdf' });
  await user.upload(within(dialog).getByLabelText('Pièces jointes du service refacturable'), file);
  return file;
}
async function save(dialog: HTMLElement) {
  await click(within(dialog).getByRole('button', { name: 'Enregistrer le frais' }));
}
function expectNoWrites() {
  for (const mutation of [mocks.ensurePeriod, mocks.savePeriod, mocks.saveExpense, mocks.replace, mocks.remove, mocks.upload]) {
    expect(mutation).not.toHaveBeenCalled();
  }
}
function expectTotalPreserved() {
  expect(screen.getByLabelText('Totaux sélectionnés pour l’export')).toHaveTextContent(/150,00/);
  expect(screen.getByRole('checkbox', { name: 'Inclure le frais FACTURE-1 dans le PDF' })).toBeChecked();
}

beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset());
  mocks.data.mockResolvedValue(billingData());
  mocks.catalog.mockResolvedValue([]);
  mocks.dprs.mockResolvedValue([]);
  mocks.references.mockResolvedValue([]);
  mocks.providers.mockResolvedValue([]);
  mocks.check.mockImplementation(async (_client, documents: ProjectBillingDocument[]): Promise<BillingAttachmentCheck[]> => documents.map(document => ({
    documentId: document.id, fileName: document.fileName, status: 'available', message: 'Fichier vérifié.',
  })));
  mocks.ensurePeriod.mockImplementation(async (_client: unknown, _project: number, draft: BillingPeriodDraft) => period({ ...draft }));
  mocks.saveExpense.mockImplementation(async (_client: unknown, _project: number, billingPeriodId: number, draft: BillingExpenseDraft, id?: number) => expense({ ...draft, id: id ?? 19, billingPeriodId }));
  mocks.replace.mockImplementation(async (_client: unknown, input: ReplacementInput) => replacedDocument(input));
  mocks.remove.mockResolvedValue(undefined);
  mocks.upload.mockImplementation(async (_client: unknown, input: UploadInput) => uploadedDocument(input));
});
afterEach(() => vi.restoreAllMocks());

describe('editing saved expense attachments', () => {
  it('stages changes by document ID, supports undo and cancels without changing stored documents or amounts', async () => {
    const user = userEvent.setup();
    await mount();
    const dialog = await openEditor();
    expect(within(storedList(dialog)).getAllByRole('button', { name: originalName })).toHaveLength(2);
    const replacement = await stageReplacement(user, dialog);
    await stageDeletion(dialog);
    expect(documentRow(dialog, 23)).toHaveAttribute('data-pending-action', 'replace');
    expect(within(documentRow(dialog, 23)).getByText(`Nouveau fichier : ${replacement.name}`)).toBeVisible();
    expect(documentRow(dialog, 24)).toHaveAttribute('data-pending-action', 'delete');
    expectNoWrites();

    await click(within(documentRow(dialog, 23)).getByRole('button', { name: `Annuler la modification de ${originalName}` }));
    expect(documentRow(dialog, 23)).not.toHaveAttribute('data-pending-action');
    expect(within(documentRow(dialog, 23)).queryByText(/Nouveau fichier :/)).not.toBeInTheDocument();
    expect(documentRow(dialog, 24)).toHaveAttribute('data-pending-action', 'delete');
    await stageReplacement(user, dialog);
    await click(within(dialog).getByRole('button', { name: 'Annuler' }));
    expectNoWrites();
    expectTotalPreserved();

    const reopened = await openEditor();
    expect(within(storedList(reopened)).getAllByRole('button', { name: originalName })).toHaveLength(2);
    expect(documentRow(reopened, 23)).not.toHaveAttribute('data-pending-action');
    expect(documentRow(reopened, 24)).not.toHaveAttribute('data-pending-action');
  });

  it('replaces before adding and deleting, targeting only the chosen document among identical filenames', async () => {
    const order: string[] = [];
    mocks.replace.mockImplementation(async (_client: unknown, input: ReplacementInput) => { order.push(`replace:${input.document.id}`); return replacedDocument(input); });
    mocks.upload.mockImplementation(async (_client: unknown, input: UploadInput) => { order.push('upload'); return uploadedDocument(input); });
    mocks.remove.mockImplementation(async (_client: unknown, input: DeleteInput) => { order.push(`delete:${input.document.id}`); });
    const user = userEvent.setup();
    await mount();
    const dialog = await openEditor();
    await stageDeletion(dialog);
    const replacement = await stageReplacement(user, dialog);
    const addition = await stageAddition(user, dialog);
    expectNoWrites();
    await save(dialog);

    expect(order).toEqual(['replace:23', 'upload', 'delete:24']);
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(client, {
      projectId: project.id, billingPeriodId: 10, expenseId: 19, document: attachment(23), file: expect.any(File),
    });
    expect(mocks.replace.mock.calls[0][1].file.size).toBe(replacement.size);
    expect(mocks.upload).toHaveBeenCalledExactlyOnceWith(client, expect.objectContaining({
      projectId: project.id, billingPeriodId: 10, expenseId: 19, kind: 'chargeable_expense', file: expect.any(File),
    }));
    expect(mocks.upload.mock.calls[0][1].file.size).toBe(addition.size);
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(client, { projectId: project.id, expenseId: 19, document: attachment(24) });
    expect(screen.queryByRole('dialog', { name: 'Modifier le frais imputable' })).not.toBeInTheDocument();
    expectTotalPreserved();
    const reopened = await openEditor();
    expect(storedList(reopened).querySelector('[data-document-id="24"]')).not.toBeInTheDocument();
    expect(within(documentRow(reopened, 23)).getByRole('button', { name: '2026-10-09 - FACTURE-1 - Autre.pdf' })).toBeVisible();
    expect(documentRow(reopened, 90)).toBeVisible();
    expect(mocks.ensurePeriod).not.toHaveBeenCalled();
  });

  it('preserves the original and all staged operations when replacement fails, then retries the same expense', async () => {
    mocks.replace.mockRejectedValueOnce(new Error('Envoi du remplacement refusé.'));
    const user = userEvent.setup();
    await mount();
    const dialog = await openEditor();
    await stageReplacement(user, dialog);
    await stageAddition(user, dialog);
    await stageDeletion(dialog);
    await save(dialog);
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Envoi du remplacement refusé.');
    expect(documentRow(dialog, 23)).toHaveAttribute('data-pending-action', 'replace');
    expect(within(documentRow(dialog, 23)).getByRole('button', { name: originalName })).toBeVisible();
    expect(documentRow(dialog, 24)).toHaveAttribute('data-pending-action', 'delete');
    expect(within(dialog).getByRole('list', { name: 'Fichiers à ajouter' })).toBeVisible();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
    expectTotalPreserved();

    await save(dialog);
    expect(screen.queryByRole('dialog', { name: 'Modifier le frais imputable' })).not.toBeInTheDocument();
    expect(mocks.replace).toHaveBeenCalledTimes(2);
    expect(mocks.replace.mock.calls.every((call) => {
      const input = call[1] as ReplacementInput;
      return input.document.id === 23 && input.document.objectPath === attachment(23).objectPath;
    })).toBe(true);
    expect(mocks.saveExpense.mock.calls.map(call => call[4])).toEqual([19, 19]);
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(mocks.remove).toHaveBeenCalledOnce();
  });

  it.each(['upload', 'delete'] as const)('retries a failed %s without repeating previously successful document mutations', async (failureStage) => {
    const failed = failureStage === 'upload' ? mocks.upload : mocks.remove;
    failed.mockRejectedValueOnce(new Error(`Échec ${failureStage}.`));
    const user = userEvent.setup();
    await mount();
    const dialog = await openEditor();
    await stageReplacement(user, dialog);
    await stageAddition(user, dialog);
    await stageDeletion(dialog);
    await save(dialog);
    expect(within(dialog).getByRole('alert')).toHaveTextContent(`Échec ${failureStage}.`);
    expect(documentRow(dialog, 23)).not.toHaveAttribute('data-pending-action');
    expect(within(documentRow(dialog, 23)).getByRole('button', { name: '2026-10-09 - FACTURE-1 - Autre.pdf' })).toBeVisible();
    expect(documentRow(dialog, 24)).toHaveAttribute('data-pending-action', 'delete');
    if (failureStage === 'upload') {
      expect(within(dialog).getByRole('list', { name: 'Fichiers à ajouter' })).toBeVisible();
      expect(mocks.remove).not.toHaveBeenCalled();
    } else {
      expect(within(dialog).queryByRole('list', { name: 'Fichiers à ajouter' })).not.toBeInTheDocument();
      expect(documentRow(dialog, 90)).toBeVisible();
    }
    await save(dialog);
    expect(screen.queryByRole('dialog', { name: 'Modifier le frais imputable' })).not.toBeInTheDocument();
    expect(mocks.replace).toHaveBeenCalledOnce();
    expect(mocks.upload).toHaveBeenCalledTimes(failureStage === 'upload' ? 2 : 1);
    expect(mocks.remove).toHaveBeenCalledTimes(failureStage === 'delete' ? 2 : 1);
    expect(mocks.saveExpense.mock.calls.map(call => call[4])).toEqual([19, 19]);
    expectTotalPreserved();
  });

  it('lets a manager replace and remove files queued for addition without writing anything', async () => {
    const user = userEvent.setup();
    await mount();
    const dialog = await openEditor();
    const addition = await stageAddition(user, dialog);
    const replacement = new File(['new pending contents'], 'nouvelle-preuve-corrigee.pdf', { type: 'application/pdf' });
    await user.upload(within(dialog).getByLabelText(`Remplacer le fichier à ajouter ${addition.name}`), replacement);
    const queued = within(dialog).getByRole('list', { name: 'Fichiers à ajouter' });
    expect(within(queued).queryByText(addition.name)).not.toBeInTheDocument();
    expect(within(queued).getByText(replacement.name)).toBeVisible();
    await click(within(queued).getByRole('button', { name: `Retirer la pièce ${replacement.name}` }));
    expect(within(dialog).queryByRole('list', { name: 'Fichiers à ajouter' })).not.toBeInTheDocument();
    expectNoWrites();
  });

  it('keeps saved documents readable without showing management controls to a reader', async () => {
    await mount(false);
    expect(screen.getAllByRole('button', { name: originalName })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Modifier FACTURE-1' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(`Remplacer le fichier ${originalName}`, { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `Supprimer le fichier ${originalName}` })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Modifier le frais imputable' })).not.toBeInTheDocument();
    expectTotalPreserved();
    expectNoWrites();
  });
});
