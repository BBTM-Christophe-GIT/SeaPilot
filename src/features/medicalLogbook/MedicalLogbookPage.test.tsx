import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RoleKey } from '../permissions/roles';
import type { MedicalDraft, MedicalEntry, MedicalHistory, MedicalSignatureSnapshot, MedicalVessel } from './medicalLogbookModel';
import { MedicalLogbookPage } from './MedicalLogbookPage';

const mocks = vi.hoisted(() => ({ vessels: vi.fn(), entries: vi.fn(), signer: vi.fn(), signatureUrl: vi.fn(), images: vi.fn(), save: vi.fn(), archive: vi.fn(), history: vi.fn(), pdf: vi.fn(), download: vi.fn() }));
vi.mock('./medicalLogbookQueries', () => ({
  fetchMedicalVessels: mocks.vessels, fetchMedicalEntries: mocks.entries, fetchMedicalSigner: mocks.signer,
  createMedicalSignatureUrl: mocks.signatureUrl, fetchMedicalSignatureImages: mocks.images,
  saveMedicalEntry: mocks.save, setMedicalEntryArchived: mocks.archive, fetchMedicalHistory: mocks.history,
}));
vi.mock('./medicalLogbookPdf', () => ({ createMedicalLogbookPdf: mocks.pdf, downloadMedicalLogbookPdf: mocks.download }));

const client = { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } as unknown as SupabaseClient;
const signature: MedicalSignatureSnapshot = {
  signature_id: 401, version_number: 2, signer_person_id: 20, signer_user_id: '11111111-1111-4111-8111-111111111111', signer_name: 'Alice Martin',
  storage_bucket: 'working-time-signatures', storage_path: '1/20/signature-v2.png', mime_type: 'image/png', file_size_bytes: 1000,
  sha256: 'a'.repeat(64), valid_from: '2026-10-01T09:00:00Z',
};
const currentSignature = { ...signature, signature_id: 402, version_number: 3, signer_name: 'Capitaine Test', storage_path: '1/20/signature-v3.png' };
const vessel: MedicalVessel = { id: 1, company_id: 1, name: 'ILE DE FRANCE', acronym: 'IDF', registration_number: '1234', registration_port: 'Dunkerque', call_sign: 'FABC', length_overall: '28', can_write: true };
const secondVessel = { ...vessel, id: 2, name: 'SURFEUR', acronym: 'SUR', length_overall: '22' };
const entry: MedicalEntry = {
  id: 11, company_id: 1, vessel_id: 1, occurred_on: '2026-10-13', occurred_time: '14:30', patient_name: 'Jean Exemple',
  injury_illness: 'Observation de démonstration', treatment_medicines: 'Soins de démonstration', first_aider_name: 'Alice Martin',
  signature_name: 'Alice Martin', signature_version_id: signature.signature_id, signature_snapshot: signature,
  revision: 1, archived: false, created_at: '2026-10-13T14:30:00Z', updated_at: '2026-10-13T14:30:00Z',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

function renderPage(props: { roles?: RoleKey[]; previewMode?: boolean; initialVesselId?: number } = {}) {
  const { initialVesselId = 0, ...pageProps } = props;
  return render(<MemoryRouter><Routes><Route element={<Outlet context={{ liftingVesselId: initialVesselId }} />}><Route index element={<MedicalLogbookPage client={client} roles={['admin']} {...pageProps} />} /></Route></Routes></MemoryRouter>);
}

async function openNew() {
  await screen.findByText('Jean Exemple');
  return screen.findByRole('row', { name: 'Nouvelle entrée médicale' });
}

function rowActions(row: HTMLElement) {
  return within(row.getAttribute('aria-label') === 'Nouvelle entrée médicale' ? row.nextElementSibling as HTMLElement : row);
}

function saveButton(row: HTMLElement) {
  return rowActions(row).getByRole('button', { name: row.getAttribute('aria-label') === 'Nouvelle entrée médicale' ? 'Ajouter une ligne' : 'Enregistrer l’entrée' });
}

function cancelButton(row: HTMLElement) {
  return rowActions(row).getByRole('button', { name: row.getAttribute('aria-label') === 'Nouvelle entrée médicale' ? 'Effacer la ligne' : 'Annuler' });
}

async function fillEntry(dialog: HTMLElement) {
  fireEvent.change(within(dialog).getByLabelText('Date'), { target: { value: '2026-10-14' } });
  fireEvent.change(within(dialog).getByLabelText('Heure'), { target: { value: '09:10' } });
  await userEvent.type(within(dialog).getByLabelText('Nom du patient'), 'Nouveau Patient');
  await userEvent.type(within(dialog).getByLabelText('Blessure / Maladie'), 'Incident de démonstration');
  await userEvent.type(within(dialog).getByLabelText('Traitement / Médicaments administrés'), 'Intervention de démonstration');
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.vessels.mockResolvedValue([secondVessel, vessel]);
  mocks.entries.mockImplementation(async (_client: SupabaseClient, vesselId: number) => vesselId === 1 ? [entry] : []);
  mocks.signer.mockResolvedValue({ person_id: 20, signer_name: 'Capitaine Test', signature: currentSignature });
  mocks.signatureUrl.mockImplementation(async (_client: SupabaseClient, snapshot: MedicalSignatureSnapshot) => `https://private.example.test/signature-${snapshot.signature_id}.png`);
  mocks.images.mockResolvedValue(new Map([[entry.id, new Uint8Array([1, 2, 3])]]));
  mocks.save.mockImplementation(async (_client: SupabaseClient, vesselId: number, draft: MedicalDraft, previous?: MedicalEntry) => ({
    ...entry, ...draft, id: previous?.id || 12, vessel_id: vesselId, revision: (previous?.revision || 0) + 1,
    signature_name: currentSignature.signer_name, signature_version_id: currentSignature.signature_id, signature_snapshot: currentSignature,
  }));
  mocks.archive.mockImplementation(async (_client: SupabaseClient, previous: MedicalEntry, archived: boolean) => ({ ...previous, archived, revision: previous.revision + 1 }));
  mocks.history.mockResolvedValue([{ id: 100, revision: 1, action: 'created', actor_name: 'Alice Martin', changed_at: entry.created_at, entry }] satisfies MedicalHistory[]);
  mocks.pdf.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }));
});

afterEach(cleanup);

describe('MedicalLogbookPage', () => {
  it.each<RoleKey>(['marin', 'direction', 'armement'])('refuses the %s profile before any medical or signature query', async (role) => {
    renderPage({ roles: [role] });
    expect(screen.getByRole('heading', { name: 'Accès réservé' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Nouvelle entrée' })).not.toBeInTheDocument();
    expect(screen.queryByRole('row', { name: 'Nouvelle entrée médicale' })).not.toBeInTheDocument();
    for (const query of [mocks.vessels, mocks.entries, mocks.signer, mocks.signatureUrl, mocks.save, mocks.history]) expect(query).not.toHaveBeenCalled();
  });

  it('uses authorized vessel capabilities and shows the seven medical columns in French', async () => {
    mocks.vessels.mockResolvedValue([{ ...vessel, can_write: false }]);
    renderPage({ roles: ['capitaine'] });
    await screen.findByText('Jean Exemple');
    expect(screen.getByRole('heading', { name: 'Registre médical', level: 1 })).toBeVisible();
    for (const name of ['Date', 'Heure', 'Nom du patient', 'Blessure / Maladie', 'Traitement / Médicaments administrés', 'Secouriste', 'Signature']) expect(screen.getByRole('columnheader', { name })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Nouvelle entrée' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Modifier l’entrée/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Archiver l’entrée/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Historique de l’entrée/ })).toBeEnabled();
    expect(await screen.findByRole('img', { name: 'Signature de Alice Martin' })).toHaveAttribute('src', 'https://private.example.test/signature-401.png');
  });

  it('defaults to the longest accessible vessel and rejects an unauthorized remembered selection before entry calls', async () => {
    renderPage({ initialVesselId: 999 });
    await screen.findByText('Jean Exemple');
    expect(screen.getByRole('button', { name: 'ILE DE FRANCE' })).toHaveAttribute('aria-pressed', 'true');
    expect(mocks.entries).toHaveBeenCalledExactlyOnceWith(client, 1);
    expect(mocks.entries).not.toHaveBeenCalledWith(client, 999);
  });

  it('keeps the empty register table visible and inserts the first entry directly beneath its headers', async () => {
    mocks.entries.mockResolvedValue([]);
    renderPage();
    await screen.findByRole('row', { name: 'Nouvelle entrée médicale' });
    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Nom du patient' })).toBeVisible();
    const row = within(table).getByRole('row', { name: 'Nouvelle entrée médicale' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(table.querySelector('tbody')?.firstElementChild).toBe(row);
    expect(within(row).getByLabelText('Nom du patient')).not.toHaveFocus();
    await fillEntry(row);
    await userEvent.click(saveButton(row));
    await within(table).findByText('Nouveau Patient');
    const freshRow = screen.getByRole('row', { name: 'Nouvelle entrée médicale' });
    expect(within(freshRow).getByLabelText('Nom du patient')).toHaveValue('');
    expect(within(freshRow).getByLabelText('Blessure / Maladie')).toHaveValue('');
    expect(within(freshRow).getByLabelText('Traitement / Médicaments administrés')).toHaveValue('');
    expect(within(freshRow).getByLabelText('Nom du patient')).toHaveFocus();
  });

  it('replaces only the edited row in place and locks other actions and filters until cancellation', async () => {
    const other = { ...entry, id: 15, patient_name: 'Autre Patient', occurred_on: '2026-10-12' };
    mocks.entries.mockResolvedValue([entry, other]);
    renderPage();
    await screen.findByText('Autre Patient');
    const previousRow = screen.getByText('Autre Patient').closest('tr')!;
    const position = Array.from(previousRow.parentElement!.children).indexOf(previousRow);
    await userEvent.click(screen.getByRole('button', { name: 'Modifier l’entrée de Autre Patient' }));
    const row = screen.getByRole('row', { name: 'Modifier une entrée médicale' });
    expect(Array.from(row.parentElement!.children).indexOf(row)).toBe(position);
    expect(screen.queryByText('Autre Patient')).not.toBeInTheDocument();
    expect(within(row).getByLabelText('Nom du patient')).toHaveValue('Autre Patient');
    expect(screen.getAllByText('Jean Exemple')).toHaveLength(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Modifier l’entrée de Jean Exemple' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Historique de l’entrée de Jean Exemple' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Archiver l’entrée de Jean Exemple' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ajouter une ligne' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'SURFEUR' })).toBeDisabled();
    expect(screen.getByLabelText('Rechercher')).toBeDisabled();
    expect(screen.getByLabelText('Année')).toBeDisabled();
    expect(screen.getByLabelText('Inclure les archives')).toBeDisabled();
    expect(within(row).getByRole('button', { name: 'Actualiser ma signature' })).toBeEnabled();
    await userEvent.clear(within(row).getByLabelText('Nom du patient'));
    await userEvent.type(within(row).getByLabelText('Nom du patient'), 'Correction annulée');
    await userEvent.click(cancelButton(row));
    expect(screen.getByText('Autre Patient')).toBeVisible();
    expect(screen.queryByText('Correction annulée')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Modifier l’entrée de Jean Exemple' })).toBeEnabled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('validates an incomplete entry beside the editable row without opening a dialog or writing', async () => {
    renderPage();
    const row = await openNew();
    await userEvent.click(saveButton(row));
    expect(await screen.findByRole('alert')).toHaveTextContent('Le nom du patient est requis.');
    expect(screen.getByRole('alert').closest('tr')).toBe(row.nextElementSibling);
    expect(within(row).getByLabelText('Nom du patient')).toHaveFocus();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
    await userEvent.click(cancelButton(row));
    expect(within(screen.getByRole('row', { name: 'Nouvelle entrée médicale' })).getByLabelText('Nom du patient')).toHaveValue('');
    expect(screen.getByText('Jean Exemple')).toBeVisible();
  });

  it('creates directly in the table only on explicit save and applies the connected profile signature', async () => {
    renderPage({ roles: ['capitaine'] });
    const dialog = await openNew();
    expect(dialog.closest('table')).toBe(screen.getByRole('table'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Ajouter une ligne' })).not.toBeInTheDocument();
    expect(saveButton(dialog).closest('tr')).toBe(dialog.nextElementSibling);
    await fillEntry(dialog);
    expect(within(dialog).getByLabelText('Secouriste')).toHaveValue('Capitaine Test');
    expect(within(dialog).getByLabelText('Secouriste')).toHaveAttribute('readonly');
    expect(within(dialog).queryByLabelText('Nom du signataire')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('img', { name: 'Zone de dessin de la signature' })).not.toBeInTheDocument();
    expect(await within(dialog).findByRole('img', { name: 'Signature de Capitaine Test' })).toHaveAttribute('src', 'https://private.example.test/signature-402.png');
    expect(mocks.save).not.toHaveBeenCalled();
    await userEvent.click(saveButton(dialog));
    await screen.findByText('Entrée médicale enregistrée.');
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith(client, 1, {
      occurred_on: '2026-10-14', occurred_time: '09:10', patient_name: 'Nouveau Patient', injury_illness: 'Incident de démonstration', treatment_medicines: 'Intervention de démonstration', first_aider_name: 'Capitaine Test',
    }, undefined);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Nouveau Patient')).toBeVisible();
  });

  it('keeps navigation and saved-row actions available until meaningful draft input, then restores them on clear', async () => {
    renderPage();
    const row = await openNew();
    const actions = ['SURFEUR', 'Actualiser', 'Exporter PDF', 'Registre vierge PDF', 'Modifier l’entrée de Jean Exemple', 'Historique de l’entrée de Jean Exemple', 'Archiver l’entrée de Jean Exemple'];
    for (const name of actions) expect(screen.getByRole('button', { name })).toBeEnabled();
    for (const name of ['Rechercher', 'Année', 'Inclure les archives']) expect(screen.getByLabelText(name)).toBeEnabled();
    expect(within(row).getByLabelText('Nom du patient')).not.toHaveFocus();
    expect(mocks.save).not.toHaveBeenCalled();
    await userEvent.type(within(row).getByLabelText('Nom du patient'), 'Brouillon médical');
    for (const name of actions) expect(screen.getByRole('button', { name })).toBeDisabled();
    for (const name of ['Rechercher', 'Année', 'Inclure les archives']) expect(screen.getByLabelText(name)).toBeDisabled();
    expect(within(row).getByRole('button', { name: 'Actualiser ma signature' })).toBeEnabled();
    await userEvent.click(cancelButton(row));
    for (const name of actions) expect(screen.getByRole('button', { name })).toBeEnabled();
    expect(within(screen.getByRole('row', { name: 'Nouvelle entrée médicale' })).getByLabelText('Nom du patient')).toHaveValue('');
    await userEvent.click(screen.getByRole('button', { name: 'SURFEUR' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'SURFEUR' })).toHaveAttribute('aria-pressed', 'true'));
    await screen.findByRole('row', { name: 'Nouvelle entrée médicale' });
    expect(mocks.entries).toHaveBeenCalledWith(client, 2);
    expect(screen.queryByText('Jean Exemple')).not.toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('keeps entered values when the connected signature arrives after the ready row was shown', async () => {
    const pending = deferred<{ person_id: number; signer_name: string; signature: MedicalSignatureSnapshot }>();
    mocks.signer.mockReturnValueOnce(pending.promise);
    renderPage();
    const row = await openNew();
    await fillEntry(row);
    expect(saveButton(row)).toBeDisabled();
    await act(async () => pending.resolve({ person_id: 20, signer_name: 'Capitaine Test', signature: currentSignature }));
    expect(screen.getByRole('row', { name: 'Nouvelle entrée médicale' })).toBe(row);
    expect(within(row).getByLabelText('Nom du patient')).toHaveValue('Nouveau Patient');
    expect(within(row).getByLabelText('Heure')).toHaveValue('09:10');
    expect(within(row).getByLabelText('Secouriste')).toHaveValue('Capitaine Test');
    expect(saveButton(row)).toBeEnabled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('preserves a failed new entry for explicit retry and resets only after successful addition', async () => {
    mocks.save.mockRejectedValueOnce(new Error('Enregistrement indisponible.'));
    renderPage();
    const row = await openNew();
    await fillEntry(row);
    await userEvent.click(saveButton(row));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enregistrement indisponible.');
    expect(screen.getByRole('row', { name: 'Nouvelle entrée médicale' })).toBe(row);
    expect(within(row).getByLabelText('Nom du patient')).toHaveValue('Nouveau Patient');
    expect(within(row).getByLabelText('Traitement / Médicaments administrés')).toHaveValue('Intervention de démonstration');
    expect(screen.getByRole('button', { name: 'SURFEUR' })).toBeDisabled();
    await userEvent.click(saveButton(row));
    await screen.findByText('Entrée médicale enregistrée.');
    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(within(screen.getByRole('row', { name: 'Nouvelle entrée médicale' })).getByLabelText('Nom du patient')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'SURFEUR' })).toBeEnabled();
  });

  it('shows the filtered empty state with a ready row and clears filters after adding an entry', async () => {
    mocks.entries.mockResolvedValue([{ ...entry, occurred_on: '2025-10-13' }]);
    renderPage();
    const row = await openNew();
    await userEvent.selectOptions(screen.getByLabelText('Année'), '2025');
    await userEvent.type(screen.getByLabelText('Rechercher'), 'Recherche sans résultat');
    expect(await screen.findByRole('heading', { name: 'Aucune entrée ne correspond aux filtres.' })).toBeVisible();
    expect(screen.getByRole('row', { name: 'Nouvelle entrée médicale' })).toBe(row);
    await fillEntry(row);
    await userEvent.click(saveButton(row));
    await screen.findByText('Entrée médicale enregistrée.');
    expect(screen.getByLabelText('Année')).toHaveValue('');
    expect(screen.getByLabelText('Rechercher')).toHaveValue('');
    expect(screen.getByText('Nouveau Patient')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Aucune entrée ne correspond aux filtres.' })).not.toBeInTheDocument();
  });

  it('blocks signing without a profile signature, links to its module and can retry after the user adds one', async () => {
    mocks.signer.mockResolvedValueOnce({ person_id: 20, signer_name: 'Capitaine Test', signature: null });
    renderPage();
    const dialog = await openNew();
    await fillEntry(dialog);
    expect(saveButton(dialog)).toBeDisabled();
    expect(within(dialog).getByRole('link', { name: 'Ouvrir mon module Signature' })).toHaveAttribute('href', '/modules/humanResources?person=20&section=signature');
    fireEvent.submit(rowActions(dialog).getByRole('form'));
    expect(mocks.save).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Actualiser ma signature' }));
    await waitFor(() => expect(saveButton(dialog)).toBeEnabled());
    expect(within(dialog).getByLabelText('Nom du patient')).toHaveValue('Nouveau Patient');
  });

  it.each(['change', 'input'] as const)('retains the local date and time after a native %s event when saving', async (eventType) => {
    renderPage();
    const dialog = await openNew();
    await fillEntry(dialog);
    const date = within(dialog).getByLabelText('Date');
    const time = within(dialog).getByLabelText('Heure');
    fireEvent[eventType](date, { target: { value: '2026-10-12' } });
    fireEvent[eventType](time, { target: { value: '09:45' } });
    expect(date).toHaveValue('2026-10-12');
    expect(time).toHaveValue('09:45');
    await userEvent.click(saveButton(dialog));
    await screen.findByText('Entrée médicale enregistrée.');
    expect(mocks.save).toHaveBeenCalledWith(client, 1, expect.objectContaining({ occurred_on: '2026-10-12', occurred_time: '09:45' }), undefined);
    const row = screen.getByText('Nouveau Patient').closest('tr');
    expect(row).not.toBeNull();
    expect(within(row!).getByText('12/10/2026')).toBeVisible();
    expect(within(row!).getByText('09:45')).toBeVisible();
  });

  it('preserves the edited draft after a revision conflict and submits the original entry revision', async () => {
    mocks.save.mockRejectedValueOnce(new Error('Cette entrée a été modifiée depuis un autre écran. Actualisez le registre avant de réessayer.'));
    renderPage();
    await screen.findByText('Jean Exemple');
    await userEvent.click(screen.getByRole('button', { name: 'Modifier l’entrée de Jean Exemple' }));
    const dialog = screen.getByRole('row', { name: 'Modifier une entrée médicale' });
    const input = within(dialog).getByLabelText('Traitement / Médicaments administrés');
    await userEvent.clear(input);
    await userEvent.type(input, 'Correction de démonstration');
    await userEvent.click(saveButton(dialog));
    expect(await screen.findByRole('alert')).toHaveTextContent('autre écran');
    expect(input).toHaveValue('Correction de démonstration');
    expect(mocks.save).toHaveBeenCalledWith(client, 1, expect.objectContaining({ treatment_medicines: 'Correction de démonstration', first_aider_name: 'Capitaine Test' }), entry);
    expect(saveButton(dialog)).toBeEnabled();
    await userEvent.click(cancelButton(dialog));
    expect(screen.getByText('Soins de démonstration')).toBeVisible();
  });

  it('locks the form and vessel selection during a write and ignores completion after unmount', async () => {
    const pending = deferred<MedicalEntry>();
    mocks.save.mockReturnValueOnce(pending.promise);
    const { unmount } = renderPage();
    const dialog = await openNew();
    await fillEntry(dialog);
    await userEvent.click(saveButton(dialog));
    expect(within(dialog).getByLabelText('Nom du patient')).toBeDisabled();
    expect(rowActions(dialog).getByRole('button', { name: 'Enregistrement…' })).toBeDisabled();
    expect(cancelButton(dialog)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'SURFEUR' })).toBeDisabled();
    fireEvent.submit(rowActions(dialog).getByRole('form'));
    expect(mocks.save).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => pending.resolve({ ...entry, id: 12, patient_name: 'Nouveau Patient' }));
    expect(screen.queryByText('Entrée médicale enregistrée.')).not.toBeInTheDocument();
    expect(mocks.entries).toHaveBeenCalledTimes(1);
  });

  it('preserves the signer and version when a private signature thumbnail is unavailable', async () => {
    mocks.signatureUrl.mockRejectedValue(new Error('Private storage unavailable'));
    renderPage();
    await screen.findByText('Jean Exemple');
    await within(screen.getByText('Jean Exemple').closest('tr')!).findByText('Aperçu de la signature indisponible.');
    expect(screen.getAllByText('Alice Martin')).toHaveLength(2);
    expect(screen.getByText('Signature du profil · version 2')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Exporter PDF' })).toBeEnabled();
  });

  it('confirms archiving and can restore the same entry without losing its prior version', async () => {
    renderPage();
    await screen.findByText('Jean Exemple');
    await userEvent.click(screen.getByRole('button', { name: 'Archiver l’entrée de Jean Exemple' }));
    const confirmation = screen.getByRole('dialog', { name: 'Archiver cette entrée ?' });
    expect(mocks.archive).not.toHaveBeenCalled();
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Archiver l’entrée' }));
    await screen.findByText('Entrée archivée. Elle reste disponible avec son historique.');
    expect(screen.queryByText('Jean Exemple')).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Inclure les archives'));
    await screen.findByText('Jean Exemple');
    expect(screen.getByText('Archivée')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Modifier l’entrée de Jean Exemple' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Restaurer l’entrée de Jean Exemple' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Restaurer cette entrée ?' })).getByRole('button', { name: 'Restaurer l’entrée' }));
    await screen.findByText('Entrée restaurée dans le registre.');
    expect(mocks.archive).toHaveBeenLastCalledWith(client, { ...entry, archived: true, revision: 2 }, false);
    expect(screen.queryByText('Archivée')).not.toBeInTheDocument();
  });

  it('shows history snapshots including the signature version and safely renders patient-provided strings', async () => {
    mocks.history.mockResolvedValue([{ id: 100, revision: 1, action: 'created', actor_name: 'Alice Martin', changed_at: entry.created_at, entry: { ...entry, injury_illness: '<script>window.evil = true</script>' } }] satisfies MedicalHistory[]);
    renderPage();
    await screen.findByText('Jean Exemple');
    await userEvent.click(screen.getByRole('button', { name: 'Historique de l’entrée de Jean Exemple' }));
    const dialog = screen.getByRole('dialog', { name: 'Historique de l’entrée médicale' });
    expect(await within(dialog).findByText('Création · Version 1')).toBeVisible();
    expect(within(dialog).getByText('<script>window.evil = true</script>')).toBeVisible();
    expect(within(dialog).getByText('Signature du profil · version 2')).toBeVisible();
    expect(dialog.querySelector('script')).toBeNull();
    expect(mocks.history).toHaveBeenCalledExactlyOnceWith(client, entry.id);
  });

  it('loads another vessel without displaying a late response from the first vessel', async () => {
    const slow = deferred<MedicalEntry[]>();
    mocks.entries.mockReturnValueOnce(slow.promise).mockResolvedValueOnce([{ ...entry, id: 22, vessel_id: 2, patient_name: 'Autre Navire' }]);
    renderPage();
    await waitFor(() => expect(mocks.entries).toHaveBeenCalledWith(client, 1));
    await userEvent.click(screen.getByRole('button', { name: 'SURFEUR' }));
    await screen.findByText('Autre Navire');
    await act(async () => slow.resolve([entry]));
    expect(screen.queryByText('Jean Exemple')).not.toBeInTheDocument();
    expect(screen.getByText('Autre Navire')).toBeVisible();
  });

  it('clears private records, open editing and cached signer when another admin account has no person record', async () => {
    const nextEntries = deferred<MedicalEntry[]>();
    const nextSigner = deferred<{ person_id: number; signer_name: string; signature: MedicalSignatureSnapshot }>();
    const secondSignature = { ...currentSignature, signature_id: 403, signer_name: 'Second Administrateur' };
    mocks.entries.mockResolvedValueOnce([entry]).mockReturnValueOnce(nextEntries.promise);
    mocks.signer.mockResolvedValueOnce({ person_id: 20, signer_name: 'Capitaine Test', signature: currentSignature }).mockReturnValueOnce(nextSigner.promise);
    function account(userId: string) {
      return <MemoryRouter><Routes><Route element={<Outlet context={{ userId, currentPerson: null, liftingVesselId: 1 }} />}><Route index element={<MedicalLogbookPage client={client} roles={['admin']} />} /></Route></Routes></MemoryRouter>;
    }
    const { rerender } = render(account('admin-account-a'));
    await screen.findByText('Jean Exemple');
    await userEvent.click(screen.getByRole('button', { name: 'Modifier l’entrée de Jean Exemple' }));
    const editingRow = screen.getByRole('row', { name: 'Modifier une entrée médicale' });
    expect(within(editingRow).getByLabelText('Nom du patient')).toHaveValue('Jean Exemple');
    expect(within(editingRow).getByLabelText('Secouriste')).toHaveValue('Capitaine Test');
    rerender(account('admin-account-b'));
    await waitFor(() => expect(mocks.signer).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('row', { name: 'Modifier une entrée médicale' })).not.toBeInTheDocument();
    expect(screen.queryByText('Jean Exemple')).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Signature de Capitaine Test' })).not.toBeInTheDocument();
    await act(async () => nextEntries.resolve([{ ...entry, id: 16, patient_name: 'Patient du second compte', first_aider_name: secondSignature.signer_name, signature_name: secondSignature.signer_name, signature_version_id: 403, signature_snapshot: secondSignature }]));
    await screen.findByText('Patient du second compte');
    const row = screen.getByRole('row', { name: 'Nouvelle entrée médicale' });
    expect(within(row).getByLabelText('Secouriste')).toHaveValue('');
    expect(saveButton(row)).toBeDisabled();
    await act(async () => nextSigner.resolve({ person_id: 21, signer_name: 'Second Administrateur', signature: secondSignature }));
    expect(within(row).getByLabelText('Secouriste')).toHaveValue('Second Administrateur');
    expect(saveButton(row)).toBeEnabled();
    expect(screen.queryByText('Jean Exemple')).not.toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('offers a retry after a read failure and avoids showing stale medical rows', async () => {
    mocks.entries.mockRejectedValueOnce(new Error('Registre indisponible.'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Registre indisponible');
    expect(screen.queryByText('Jean Exemple')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exporter PDF' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    await screen.findByText('Jean Exemple');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('exports the filtered register with private signature images and downloads a blank French register separately', async () => {
    const hidden = { ...entry, id: 12, occurred_on: '2025-10-10', patient_name: 'Autre Année' };
    mocks.entries.mockResolvedValue([entry, hidden]);
    renderPage();
    await screen.findByText('Jean Exemple');
    await userEvent.selectOptions(screen.getByLabelText('Année'), '2026');
    await userEvent.click(screen.getByRole('button', { name: 'Exporter PDF' }));
    await screen.findByText('Registre médical téléchargé.');
    expect(mocks.images).toHaveBeenCalledExactlyOnceWith(client, [entry]);
    expect(mocks.pdf).toHaveBeenCalledWith(vessel, [entry], expect.objectContaining({ blank: false, year: '2026', signatureImages: expect.any(Map) }));
    expect(mocks.download).toHaveBeenCalledWith(expect.any(Blob), 'registre-medical-IDF-2026.pdf');
    await userEvent.click(screen.getByRole('button', { name: 'Registre vierge PDF' }));
    await screen.findByText('Registre vierge téléchargé.');
    expect(mocks.images).toHaveBeenCalledTimes(1);
    expect(mocks.pdf).toHaveBeenLastCalledWith(vessel, [], expect.objectContaining({ blank: true, year: '2026' }));
    expect(mocks.download).toHaveBeenLastCalledWith(expect.any(Blob), 'registre-medical-IDF-2026-vierge.pdf');
  });

  it('uses an isolated preview client instead of the authenticated client in demonstration mode', async () => {
    renderPage({ previewMode: true });
    await screen.findByText('Jean Exemple');
    expect(screen.getByText(/Démonstration/)).toHaveTextContent('restent dans cette prévisualisation');
    expect(mocks.vessels.mock.calls[0][0]).not.toBe(client);
    expect(mocks.entries.mock.calls[0][0]).not.toBe(client);
    expect(mocks.signer.mock.calls[0][0]).not.toBe(client);
    expect(client.rpc).not.toHaveBeenCalled();
    expect(client.storage.from).not.toHaveBeenCalled();
  });
});
