import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceCatalogDialog } from './ProjectCatalogDialogs';
import { BILLING_SERVICE_QUANTITY_MODE_LABELS } from './BillingServiceQuantityFields';
import type { BillingServiceQuantityMode } from './projectBilling';
import type { ProjectServiceCatalogDraft, ProjectServiceCatalogEntry } from './projectBilling';

const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), archive: vi.fn() }));
vi.mock('./projectBilling', async original => ({
  ...await original<typeof import('./projectBilling')>(),
  fetchProjectServiceCatalog: mocks.load,
  saveProjectServiceCatalogEntry: mocks.save,
  archiveProjectServiceCatalogEntry: mocks.archive,
}));

const client = {} as never;
function entry(overrides: Partial<ProjectServiceCatalogEntry> = {}): ProjectServiceCatalogEntry {
  return { id: 91, companyId: 1, category: 'Assistance', unitAmountHt: 30, descriptionHtml: '', active: true,
    vesselId: null, vesselName: '', createdAt: '', updatedAt: '', ...overrides };
}
async function mount({ canManage = true, initialMode = 'view' }: { canManage?: boolean; initialMode?: 'view' | 'create' } = {}) {
  await act(async () => {
    render(<ServiceCatalogDialog canManage={canManage} client={client} initialMode={initialMode} onClose={vi.fn()} />);
  });
  await waitFor(() => expect(screen.getByRole('dialog', { name: 'Liste des prestations' })).not.toHaveAttribute('aria-busy', 'true'));
}
async function click(button: HTMLElement) {
  await act(async () => { fireEvent.click(button); });
}
async function save() {
  await click(screen.getByRole('button', { name: 'Enregistrer' }));
}
function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
async function chooseMode(mode: BillingServiceQuantityMode) {
  await click(screen.getByRole('button', { name: 'Calcul quantité' }));
  await click(screen.getByRole('menuitem', { name: new RegExp(`^${BILLING_SERVICE_QUANTITY_MODE_LABELS[mode]}`) }));
}
async function finishTypes() { await click(screen.getByRole('menuitem', { name: 'Terminer' })); }

beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset());
  mocks.load.mockResolvedValue([]);
  mocks.save.mockImplementation(async (_client: unknown, draft: ProjectServiceCatalogDraft) => entry({ ...draft, id: draft.id ?? 91 }));
});

describe('catalogue service quantity rules', () => {
  it('saves a manual zero and client reference, then lets the saved service be edited again', async () => {
    await mount({ initialMode: 'create' });
    expect(screen.getByRole('button', { name: 'Calcul quantité' })).toHaveAccessibleDescription('Manuel');
    expect(screen.getByLabelText('Quantité par défaut')).toHaveValue(0);
    expect(screen.getByLabelText('Référence client de la prestation')).toHaveAttribute('maxlength', '200');
    change('Catégorie *', 'Assistance configurée');
    change('Montant unitaire (€ HT) *', '30');
    change('Référence client de la prestation', 'CLIENT-27');
    await save();
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith(client, expect.objectContaining({
      category: 'Assistance configurée', unitAmountHt: 30, quantityMode: 'manual', defaultQuantity: 0, clientReference: 'CLIENT-27',
    }));
    expect(screen.getByText('Référence client de la prestation').parentElement).toHaveTextContent('CLIENT-27');
    expect(screen.getByText('Quantité par défaut').parentElement).toHaveTextContent('0');
    await click(screen.getByRole('button', { name: 'Modifier' }));
    expect(screen.getByLabelText('Quantité par défaut')).toHaveValue(0);
    change('Quantité par défaut', '3.5');
    change('Référence client de la prestation', 'CLIENT-28');
    await save();
    expect(mocks.save).toHaveBeenLastCalledWith(client, expect.objectContaining({ id: 91, quantityMode: 'manual', defaultQuantity: 3.5, clientReference: 'CLIENT-28' }));
    expect(screen.getByRole('button', { name: 'Modifier' })).toBeEnabled();
    expect(screen.getByText('Quantité par défaut').parentElement).toHaveTextContent('3,5');
  });

  it.each(['period', 'month'] as const)('persists the %s day rule without changing the stored manual default or reference', async (quantityMode) => {
    mocks.load.mockResolvedValue([entry({ quantityMode: 'manual', defaultQuantity: 4, clientReference: 'REF-CONSERVEE' })]);
    await mount();
    await click(screen.getByRole('button', { name: 'Modifier' }));
    await chooseMode(quantityMode);
    expect(screen.queryByLabelText('Quantité par défaut')).not.toBeInTheDocument();
    await save();
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith(client, expect.objectContaining({ id: 91, quantityMode, defaultQuantity: 4, unitAmountHt: 30, clientReference: 'REF-CONSERVEE' }));
    expect(screen.getByRole('button', { name: 'Modifier' })).toBeEnabled();
  });

  it('requires a selected operation and saves multiple operation types together', async () => {
    mocks.load.mockResolvedValue([entry({ quantityMode: 'manual', defaultQuantity: 2 })]);
    await mount();
    await click(screen.getByRole('button', { name: 'Modifier' }));
    await chooseMode('operations');
    await finishTypes();
    await save();
    expect(screen.getByRole('alert')).toHaveTextContent('Choisissez au moins un type d’opération.');
    expect(mocks.save).not.toHaveBeenCalled();
    await click(screen.getByRole('button', { name: 'Calcul quantité' }));
    await click(screen.getByRole('menuitem', { name: '24/24 Crew Change' }));
    await click(screen.getByRole('menuitem', { name: '24/24 Weather Stand-by' }));
    await finishTypes();
    await save();
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith(client, expect.objectContaining({
      id: 91, quantityMode: 'operations', quantityOperationTypes: ['24/24 Crew Change', '24/24 Weather Stand-by'], defaultQuantity: 2,
    }));
    expect(screen.getByText('Types d’opérations à compter').parentElement).toHaveTextContent('24/24 Crew Change · 24/24 Weather Stand-by');
    await click(screen.getByRole('button', { name: 'Modifier' }));
    await click(screen.getByRole('button', { name: 'Calcul quantité' }));
    expect(screen.getByRole('menuitem', { name: '24/24 Crew Change, sélectionné' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: '24/24 Weather Stand-by, sélectionné' })).toBeVisible();
  });

  it('preserves undefined legacy settings when another catalogue field is edited', async () => {
    mocks.load.mockResolvedValue([entry({ quantityOperationTypes: ['Type importé'], clientReference: 'LEGACY-REF' })]);
    await mount();
    await click(screen.getByRole('button', { name: 'Modifier' }));
    expect(screen.getByRole('button', { name: 'Calcul quantité' })).toHaveAccessibleDescription('Réglage actuel');
    expect(screen.queryByLabelText('Quantité par défaut')).not.toBeInTheDocument();
    change('Montant unitaire (€ HT) *', '35');
    await save();
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith(client, expect.objectContaining({
      id: 91, unitAmountHt: 35, quantityMode: undefined, defaultQuantity: undefined, quantityOperationTypes: ['Type importé'], clientReference: 'LEGACY-REF',
    }));
    await click(screen.getByRole('button', { name: 'Modifier' }));
    await chooseMode('operations');
    expect(screen.getByRole('menuitem', { name: 'Type importé, sélectionné' })).toBeVisible();
  });

  it('disables quantity, reference and description changes while the catalogue save is pending', async () => {
    mocks.load.mockResolvedValue([entry({ quantityMode: 'manual', defaultQuantity: 2, clientReference: 'REF-EN-COURS' })]);
    let resolveSave!: (saved: ProjectServiceCatalogEntry) => void;
    mocks.save.mockImplementationOnce(() => new Promise<ProjectServiceCatalogEntry>((resolve) => { resolveSave = resolve; }));
    await mount();
    await click(screen.getByRole('button', { name: 'Modifier' }));
    await save();
    expect(screen.getByRole('group', { name: 'Paramètres de la prestation' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Calcul quantité' })).toBeDisabled();
    expect(screen.getByLabelText('Quantité par défaut')).toBeDisabled();
    expect(screen.getByLabelText('Référence client de la prestation')).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Description de la prestation' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('option', { name: /Assistance/ })).toBeDisabled();
    await act(async () => resolveSave(entry({ quantityMode: 'manual', defaultQuantity: 2, clientReference: 'REF-EN-COURS' })));
    expect(screen.getByRole('button', { name: 'Modifier' })).toBeEnabled();
  });

  it('shows configured operation types and reference without management controls to a reader', async () => {
    mocks.load.mockResolvedValue([entry({ quantityMode: 'operations', quantityOperationTypes: ['24/24 Operation', 'Type importé'], clientReference: 'CLIENT-LECTURE' })]);
    await mount({ canManage: false });
    const detail = within(screen.getByRole('region', { name: 'Données de la prestation' }));
    expect(detail.getByText('Référence client de la prestation').parentElement).toHaveTextContent('CLIENT-LECTURE');
    expect(detail.getByText('Types d’opérations à compter').parentElement).toHaveTextContent('24/24 Operation · Type importé');
    expect(screen.queryByRole('button', { name: 'Ajouter' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Calcul quantité' })).not.toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.archive).not.toHaveBeenCalled();
  });
});
