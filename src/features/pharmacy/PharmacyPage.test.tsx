import type { SupabaseClient } from '@supabase/supabase-js';
import { configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PharmacyPage } from './PharmacyPage';
import { blankPharmacyItem, type PharmacyControl, type PharmacyItem, type PharmacyVessel } from './pharmacyModel';
import { downloadPharmacyControl, fetchPharmacyRegister, fetchPharmacyVesselExpiryCounts, fetchPharmacyVessels, savePharmacyItem, uploadPharmacyControl } from './pharmacyQueries';

vi.mock('./pharmacyQueries', async (importOriginal) => ({ ...await importOriginal<typeof import('./pharmacyQueries')>(), fetchPharmacyVessels: vi.fn(), fetchPharmacyVesselExpiryCounts: vi.fn(), fetchPharmacyRegister: vi.fn(), savePharmacyItem: vi.fn(), uploadPharmacyControl: vi.fn(), downloadPharmacyControl: vi.fn() }));
const client = {} as SupabaseClient;
const vessels: PharmacyVessel[] = [{ id: 1, company_id: 1, name: 'GOURY', acronym: 'GRY', can_manage: true }, { id: 2, company_id: 1, name: 'SUROIT', acronym: 'SUR', can_manage: true }, { id: 3, company_id: 1, name: 'HIRONDELLE DE LA MANCHE', acronym: 'HIR', can_manage: true }];
const vesselExpiryCounts = { 1: { due: 2, expired: 1 }, 2: { due: 7, expired: 0 }, 3: { due: 0, expired: 5 } };
const item: PharmacyItem = { ...blankPharmacyItem(), id: 1, company_id: 1, vessel_id: 1, section: 'DOTATION B', category: '1. CARDIOLOGIE', brand: 'MARQUE SOURCE', designation: 'ARTICLE SOURCE', lot_number: 'N2069', quantity: '4', required_quantity: '4', expires_on: '2099-10-01', expiry_precision: 'month', notes: 'Observation du fichier', revision: 2, source_file: 'Inventaire Pharmacie - GOURY.xlsx', source_sheet: 'DOTATION MEDICALE', source_row: 4, updated_at: '2026-10-20T00:00:00Z' };
const expired: PharmacyItem = { ...item, id: 2, category: '2. SOINS', designation: 'ARTICLE PÉRIMÉ', quantity: '2 boîtes', expires_on: '2000-10-01', notes: 'OK' };
const missing: PharmacyItem = { ...item, id: 3, designation: 'ARTICLE SANS DATE', quantity: '', expires_on: null, expiry_precision: 'unknown' };
const control: PharmacyControl = { id: 20, company_id: 1, vessel_id: 1, issued_on: '2026-01-01', expires_on: '2099-01-01', storage_path: '1/1/control.pdf', file_name: 'Contrôle.pdf', file_size: 100, mime_type: 'application/pdf', created_at: '2026-01-01T00:00:00Z', is_current: true, revision: 1 };
function page(roles: ('admin' | 'capitaine' | 'marin')[] = ['admin'], initial = '/modules/pharmacy') { return render(<MemoryRouter initialEntries={[initial]}><PharmacyPage client={client} roles={roles} /></MemoryRouter>); }

describe('PharmacyPage', () => {
  beforeEach(() => {
    configure({ asyncUtilTimeout: 5000 });
    vi.clearAllMocks();
    vi.mocked(fetchPharmacyVessels).mockResolvedValue(vessels);
    vi.mocked(fetchPharmacyVesselExpiryCounts).mockResolvedValue(vesselExpiryCounts);
    vi.mocked(fetchPharmacyRegister).mockResolvedValue({ items: [item, expired, missing], controls: [] });
    vi.mocked(savePharmacyItem).mockResolvedValue(1);
    vi.mocked(uploadPharmacyControl).mockResolvedValue(20);
  });
  it('shows source quantities, month precision and missing control without inventing a date', async () => {
    page();
    expect(await screen.findByRole('button', { name: 'ARTICLE SOURCE' })).toBeInTheDocument();
    expect(screen.getByText('10/2099')).toBeInTheDocument();
    expect(screen.getByText('2 boîtes')).toBeInTheDocument();
    expect(screen.getByText('Aucun document déposé pour ce navire.')).toBeInTheDocument();
    expect(screen.getByText('Non renseignée')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Périmés.*1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Stock insuffisant.*0/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'ARTICLE SOURCE' }));
    expect(screen.getByText(/DOTATION MEDICALE · ligne 4/)).toBeInTheDocument();
    expect(screen.getByText('Observation du fichier')).toBeInTheDocument();
  });
  it('filters the inventory from a metric, category and search', async () => {
    const user = userEvent.setup(); page();
    await screen.findByRole('button', { name: 'ARTICLE SOURCE' });
    await user.click(screen.getByRole('button', { name: /Périmés.*1/ }));
    expect(screen.queryByRole('button', { name: 'ARTICLE SOURCE' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ARTICLE PÉRIMÉ' })).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'État des articles' }), 'all');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Catégorie' }), '1. CARDIOLOGIE');
    await user.type(screen.getByRole('textbox', { name: 'Rechercher un article' }), 'SANS DATE');
    expect(screen.getByRole('button', { name: 'ARTICLE SANS DATE' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ARTICLE SOURCE' })).not.toBeInTheDocument();
  });
  it('keeps a real Marin fixture read only even if a mocked vessel is incorrectly marked manageable', async () => {
    page(['marin']); await screen.findByRole('button', { name: 'ARTICLE SOURCE' });
    expect(screen.getByText(/Consultation/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajouter un article' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Déposer le document' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Modifier ARTICLE SOURCE' })).not.toBeInTheDocument();
  });
  it('requires vessel authorization for a captain and respects the vessel deep link', async () => {
    vi.mocked(fetchPharmacyVessels).mockResolvedValue([{ ...vessels[1], can_manage: false }]);
    page(['capitaine'], '/modules/pharmacy?vessel=2');
    await screen.findByRole('button', { name: 'ARTICLE SOURCE' });
    expect(fetchPharmacyRegister).toHaveBeenCalledWith(client, 2);
    expect(screen.getByRole('button', { name: 'SUROIT' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Ajouter un article' })).not.toBeInTheDocument();
  });
  it('saves an article with the original revision and keeps failed edits open', async () => {
    const user = userEvent.setup();
    vi.mocked(savePharmacyItem).mockRejectedValueOnce(new Error('Cet article a été modifié depuis un autre appareil.'));
    page(); await screen.findByRole('button', { name: 'ARTICLE SOURCE' });
    await user.click(screen.getByRole('button', { name: 'Modifier ARTICLE SOURCE' }));
    const dialog = screen.getByRole('dialog', { name: 'Modifier l’article' });
    await user.clear(within(dialog).getByLabelText('Quantité à bord'));
    await user.type(within(dialog).getByLabelText('Quantité à bord'), '30 × 300 mg');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Cet article a été modifié');
    expect(savePharmacyItem).toHaveBeenCalledWith(client, 1, expect.objectContaining({ quantity: '30 × 300 mg', expires_on: '2099-10-01' }), item);
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Article enregistré.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('clears an old expiry when a manager marks it unknown', async () => {
    const user = userEvent.setup(); page(); await screen.findByRole('button', { name: 'ARTICLE SOURCE' });
    await user.click(screen.getByRole('button', { name: 'Modifier ARTICLE SOURCE' }));
    const dialog = screen.getByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Précision de la péremption'), 'unknown');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(savePharmacyItem).toHaveBeenCalledWith(client, 1, expect.objectContaining({ expires_on: null, expiry_precision: 'unknown' }), item));
  });
  it('uploads a control and its expiry, retaining the current control id for concurrency', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchPharmacyRegister).mockResolvedValue({ items: [item], controls: [control] });
    page(); await screen.findByRole('button', { name: 'ARTICLE SOURCE' });
    await user.click(screen.getByRole('button', { name: 'Nouveau contrôle' }));
    const dialog = screen.getByRole('dialog');
    const file = new File(['pdf'], 'Controle-2026.pdf', { type: 'application/pdf' });
    await user.upload(within(dialog).getByLabelText('Document Contrôle Pharmacie'), file);
    await user.type(within(dialog).getByLabelText('Date du contrôle'), '2026-10-20');
    await user.type(within(dialog).getByLabelText('Date d’échéance'), '2027-10-20');
    expect((within(dialog).getByLabelText('Document Contrôle Pharmacie') as HTMLInputElement).files).toHaveLength(1);
    expect(within(dialog).getByLabelText('Date d’échéance')).toHaveValue('2027-10-20');
    // jsdom does not include the uploaded FileList in native required-file validation.
    // Native form submission is separately exercised in the real browser QA flow.
    fireEvent.submit(dialog);
    await waitFor(() => expect(uploadPharmacyControl).toHaveBeenCalledWith(client, vessels[0], file, '2027-10-20', '2026-10-20', 20));
    expect(await screen.findByText(/Contrôle pharmacie enregistré/)).toBeInTheDocument();
  });
  it('opens the expiry filter from a notification deep link without resetting it', async () => {
    page(['admin'], '/modules/pharmacy?vessel=1&filter=expiry');
    expect(await screen.findByRole('button', { name: 'ARTICLE PÉRIMÉ' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'État des articles' })).toHaveValue('expiry');
    expect(screen.queryByRole('button', { name: 'ARTICLE SOURCE' })).not.toBeInTheDocument();
  });
  it('displays a document error and preserves the upload form for retry', async () => {
    const user = userEvent.setup();
    vi.mocked(uploadPharmacyControl).mockRejectedValue(new Error('Téléversement indisponible.'));
    page(); await screen.findByRole('button', { name: 'ARTICLE SOURCE' });
    await user.click(screen.getByRole('button', { name: 'Déposer le document' }));
    const dialog = screen.getByRole('dialog');
    await user.upload(within(dialog).getByLabelText('Document Contrôle Pharmacie'), new File(['x'], 'Controle.pdf', { type: 'application/pdf' }));
    await user.type(within(dialog).getByLabelText('Date d’échéance'), '2027-10-20');
    fireEvent.submit(dialog);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Téléversement indisponible.');
    expect(within(dialog).getByRole('button', { name: 'Enregistrer le contrôle' })).toBeEnabled();
  });
  it('does not display an earlier vessel response after switching vessel', async () => {
    let resolveFirst: (value: { items: PharmacyItem[]; controls: PharmacyControl[] }) => void = () => undefined;
    vi.mocked(fetchPharmacyRegister).mockImplementation((_db, id) => id === 1 ? new Promise((resolve) => { resolveFirst = resolve; }) : Promise.resolve({ items: [{ ...item, id: 40, vessel_id: 2, designation: 'ARTICLE SUROIT' }], controls: [] }));
    const user = userEvent.setup(); page();
    await waitFor(() => expect(fetchPharmacyRegister).toHaveBeenCalledWith(client, 1));
    await user.click(screen.getByRole('button', { name: 'SUROIT' }));
    expect(await screen.findByRole('button', { name: 'ARTICLE SUROIT' })).toBeInTheDocument();
    resolveFirst({ items: [item], controls: [] });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'ARTICLE SOURCE' })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'ARTICLE SUROIT' })).toBeInTheDocument();
  });
  it('reports download failures without hiding the register', async () => {
    vi.mocked(fetchPharmacyRegister).mockResolvedValue({ items: [item], controls: [control] });
    vi.mocked(downloadPharmacyControl).mockRejectedValue(new Error('Document inaccessible.'));
    page(); await screen.findByRole('button', { name: 'ARTICLE SOURCE' });
    await userEvent.click(screen.getByRole('button', { name: 'Télécharger le document' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Document inaccessible.');
    expect(screen.getByRole('button', { name: 'ARTICLE SOURCE' })).toBeInTheDocument();
  });
  it('groups visible articles under their numbered categories in natural order', async () => {
    const user = userEvent.setup();
    const dermatology = { ...item, id: 10, category: '10. DERMATOLOGIE', designation: 'ARTICLE DERMATOLOGIE' };
    vi.mocked(fetchPharmacyRegister).mockResolvedValue({ items: [dermatology, expired, missing, item], controls: [] });
    page();
    await screen.findByRole('button', { name: 'ARTICLE SOURCE' });
    const table = screen.getByRole('table');
    const headers = within(table).getAllByRole('rowheader').filter((header) => header.getAttribute('scope') === 'rowgroup');
    expect(headers).toHaveLength(3);
    expect(headers[0]).toHaveTextContent(/^1\. CARDIOLOGIE/);
    expect(headers[1]).toHaveTextContent(/^2\. SOINS/);
    expect(headers[2]).toHaveTextContent(/^10\. DERMATOLOGIE/);
    await user.type(screen.getByRole('textbox', { name: 'Rechercher un article' }), 'PÉRIMÉ');
    expect(within(table).getByRole('rowheader', { name: /^2\. SOINS/ })).toBeInTheDocument();
    expect(within(table).queryByRole('rowheader', { name: /^1\. CARDIOLOGIE/ })).not.toBeInTheDocument();
    expect(within(table).queryByRole('rowheader', { name: /^10\. DERMATOLOGIE/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ARTICLE PÉRIMÉ' })).toBeInTheDocument();
  });
  it('shows independent expiry badges for every vessel without loading their inventory', async () => {
    page();
    await screen.findByRole('button', { name: 'ARTICLE SOURCE' });
    const goury = screen.getByRole('button', { name: 'GOURY' });
    const suroit = screen.getByRole('button', { name: 'SUROIT' });
    const hirondelle = screen.getByRole('button', { name: 'HIRONDELLE DE LA MANCHE' });
    expect(goury).toHaveAttribute('aria-pressed', 'true');
    expect(suroit).toHaveAttribute('aria-pressed', 'false');
    expect(hirondelle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('combobox', { name: 'Navire' })).not.toBeInTheDocument();
    expect(within(goury).getByRole('img', { name: '2 articles à échéance sous 30 jours' })).toBeInTheDocument();
    expect(within(goury).getByRole('img', { name: '1 article périmé' })).toBeInTheDocument();
    expect(within(suroit).getByRole('img', { name: '7 articles à échéance sous 30 jours' })).toBeInTheDocument();
    expect(within(suroit).queryByRole('img', { name: /périmé/ })).not.toBeInTheDocument();
    expect(within(hirondelle).getByRole('img', { name: '5 articles périmés' })).toBeInTheDocument();
    expect(within(hirondelle).queryByRole('img', { name: /échéance/ })).not.toBeInTheDocument();
    expect(fetchPharmacyVesselExpiryCounts).toHaveBeenCalledWith(client);
    expect(fetchPharmacyRegister).not.toHaveBeenCalledWith(client, 2);
    expect(fetchPharmacyRegister).not.toHaveBeenCalledWith(client, 3);
  });
  it('refreshes all vessel counts when reloading and saving the selected inventory', async () => {
    const user = userEvent.setup(); page();
    await screen.findByRole('button', { name: 'ARTICLE SOURCE' });
    vi.mocked(fetchPharmacyVesselExpiryCounts).mockResolvedValue({ ...vesselExpiryCounts, 2: { due: 3, expired: 0 } });
    const initialCalls = vi.mocked(fetchPharmacyVesselExpiryCounts).mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Actualiser l’inventaire' }));
    await waitFor(() => expect(vi.mocked(fetchPharmacyVesselExpiryCounts).mock.calls.length).toBeGreaterThan(initialCalls));
    expect(await within(screen.getByRole('button', { name: 'SUROIT' })).findByRole('img', { name: '3 articles à échéance sous 30 jours' })).toBeInTheDocument();
    await screen.findByRole('button', { name: 'ARTICLE SOURCE' });
    await user.click(screen.getByRole('button', { name: 'Modifier ARTICLE SOURCE' }));
    const dialog = screen.getByRole('dialog');
    vi.mocked(fetchPharmacyVesselExpiryCounts).mockResolvedValue({ ...vesselExpiryCounts, 3: { due: 0, expired: 4 } });
    const beforeSaveCalls = vi.mocked(fetchPharmacyVesselExpiryCounts).mock.calls.length;
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await screen.findByText('Article enregistré.');
    await waitFor(() => expect(vi.mocked(fetchPharmacyVesselExpiryCounts).mock.calls.length).toBeGreaterThan(beforeSaveCalls));
    expect(within(screen.getByRole('button', { name: 'HIRONDELLE DE LA MANCHE' })).getByRole('img', { name: '4 articles périmés' })).toBeInTheDocument();
  });
  it('treats an empty successful alarm result as zero for all accessible vessels', async () => {
    vi.mocked(fetchPharmacyVesselExpiryCounts).mockResolvedValue({});
    page(); await screen.findByRole('button', { name: 'ARTICLE SOURCE' });
    for (const vessel of vessels) {
      const button = screen.getByRole('button', { name: vessel.name });
      expect(within(button).queryByRole('img', { name: /échéance|périmé/ })).not.toBeInTheDocument();
    }
    expect(screen.queryAllByText('Comptages indisponibles')).toHaveLength(0);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('refreshes vessel badges after focus and a pharmacy change event', async () => {
    page(); await screen.findByRole('button', { name: 'ARTICLE SOURCE' });
    vi.mocked(fetchPharmacyVesselExpiryCounts).mockResolvedValue({ ...vesselExpiryCounts, 2: { due: 6, expired: 0 } });
    fireEvent(window, new Event('focus'));
    expect(await within(screen.getByRole('button', { name: 'SUROIT' })).findByRole('img', { name: '6 articles à échéance sous 30 jours' })).toBeInTheDocument();
    vi.mocked(fetchPharmacyVesselExpiryCounts).mockResolvedValue({ ...vesselExpiryCounts, 2: { due: 4, expired: 0 } });
    fireEvent(window, new Event('pharmacy:changed'));
    expect(await within(screen.getByRole('button', { name: 'SUROIT' })).findByRole('img', { name: '4 articles à échéance sous 30 jours' })).toBeInTheDocument();
  });
  it('shows a count failure separately from the inventory and retries with refresh', async () => {
    vi.mocked(fetchPharmacyVesselExpiryCounts).mockRejectedValue(new Error('Comptages pharmacie indisponibles.'));
    const user = userEvent.setup(); page();
    await screen.findByRole('button', { name: 'ARTICLE SOURCE' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Comptages pharmacie indisponibles.');
    expect(screen.getByRole('button', { name: 'ARTICLE PÉRIMÉ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actualiser l’inventaire' })).toBeEnabled();
    expect(within(screen.getByRole('button', { name: 'SUROIT' })).queryByRole('img', { name: /échéance|périmé/ })).not.toBeInTheDocument();
    vi.mocked(fetchPharmacyVesselExpiryCounts).mockResolvedValue(vesselExpiryCounts);
    await user.click(screen.getByRole('button', { name: 'Actualiser l’inventaire' }));
    expect(await within(screen.getByRole('button', { name: 'SUROIT' })).findByRole('img', { name: '7 articles à échéance sous 30 jours' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'ARTICLE SOURCE' })).toBeInTheDocument();
  });
});
