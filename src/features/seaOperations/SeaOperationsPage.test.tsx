import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptySeaOperation, DIVING_MEDICAL_KIT, SEA_OPERATION_CHECKS, validateSeaOperation, type SeaOperationPayload } from './seaOperationModel';
import { fetchSeaOperationData, fetchSeaOperationDetail, saveSeaOperation, signSeaOperation, type SeaOperationData, type SeaOperationRecord } from './seaOperationQueries';
import { SeaOperationsPage } from './SeaOperationsPage';

vi.mock('./seaOperationQueries', () => ({
  fetchSeaOperationData: vi.fn(), fetchSeaOperationDetail: vi.fn(), saveSeaOperation: vi.fn(), signSeaOperation: vi.fn(),
}));

const captainAccount = { id: 'captain-server-account', name: 'Camille MARTIN', canSign: true };
const sailorAccount = { id: 'sailor-server-account', name: 'Alex DUPONT', canSign: false };
type Account = typeof captainAccount;

function noGoDraft(): SeaOperationPayload {
  const draft = emptySeaOperation();
  draft.project = 'Inspection de la bouée';
  draft.vessel = { ...draft.vessel, id: '12', name: 'GOURY', captainName: captainAccount.name };
  draft.decision = 'NO_GO';
  draft.risks = 'Limite météo dépassée, appareillage suspendu.';
  draft.signature = { captainName: captainAccount.name, date: '2026-10-16', place: 'Cherbourg', acknowledged: true };
  return draft;
}

function recordFixture(account: Account, overrides: Partial<SeaOperationRecord> = {}): SeaOperationRecord {
  return {
    id: 'sea-operation-server-record', companyId: 1, version: 3, status: 'draft', draft: noGoDraft(),
    createdBy: 'armament-server-account', createdByName: 'Armement', createdAt: '2026-10-16T08:00:00Z',
    updatedBy: account.id, updatedByName: account.name, updatedAt: '2026-10-16T09:00:00Z',
    signedBy: null, signedByName: null, signedAt: null, captainName: null, canEdit: true, canSign: account.canSign,
    ...overrides,
  };
}

function renderAccount(account: Account = captainAccount, record?: SeaOperationRecord, companyId = 1) {
  const client = { fixtureAccountId: account.id };
  const data: SeaOperationData = {
    companyId, actorId: account.id, actorName: account.name,
    records: record ? [record] : [],
    vessels: [{ id: 12, name: 'GOURY', registrationImo: 'IMO-1234567', lengthOverall: '36', canSign: account.canSign }],
  };
  vi.mocked(fetchSeaOperationData).mockResolvedValue(data);
  if (record) vi.mocked(fetchSeaOperationDetail).mockResolvedValue(record);
  const view = render(<MemoryRouter initialEntries={['/modules/seaOperations']}><Routes>
    <Route element={<><nav aria-label="Navigation principale"><Link to="/modules/fleet">Navires</Link></nav><Outlet context={{ client }} /></>}>
      <Route path="modules/seaOperations" element={<SeaOperationsPage />} />
      <Route path="modules/fleet" element={<h1>Flotte destination</h1>} />
    </Route>
  </Routes></MemoryRouter>);
  return { client, data, unmount: view.unmount };
}

async function openRecord(record: SeaOperationRecord) {
  await userEvent.click(await screen.findByRole('button', { name: new RegExp(record.draft.project) }));
  await screen.findByLabelText('Projet');
}

async function saveDraft() {
  await userEvent.click(screen.getAllByRole('button', { name: 'Enregistrer le brouillon' })[0]);
}

async function decisionStep() {
  await userEvent.click(screen.getByRole('button', { name: /4Décision du Capitaine|4 Décision du Capitaine/ }));
}

beforeEach(() => { vi.resetAllMocks(); sessionStorage.clear(); });
afterEach(() => vi.restoreAllMocks());

describe('Opération en Mer with authenticated server permission fixtures', () => {
  it('shows the empty register and saves an incomplete new preparation as a draft', async () => {
    const { client } = renderAccount(sailorAccount);
    expect(await screen.findByText('Préparez votre première opération en mer')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Créer une opération' }));
    await userEvent.type(screen.getByLabelText('Projet'), 'Préparation du balisage');
    await userEvent.selectOptions(screen.getByLabelText('Navire'), '12');
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, draft) => recordFixture(sailorAccount, { draft: structuredClone(draft), version: 1 }));
    await saveDraft();
    expect(await screen.findByText('Brouillon enregistré.')).toBeInTheDocument();
    expect(saveSeaOperation).toHaveBeenCalledWith(client, expect.objectContaining({ project: 'Préparation du balisage', decision: '', vessel: expect.objectContaining({ id: '12', name: 'GOURY' }) }), undefined);
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

  it('keeps the entered preparation after a failed save and retries without creating a second local draft', async () => {
    renderAccount();
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await userEvent.type(screen.getByLabelText('Projet'), 'Mission conservée');
    vi.mocked(saveSeaOperation).mockRejectedValueOnce(new Error('Connexion interrompue.'));
    await saveDraft();
    expect(await screen.findByRole('alert')).toHaveTextContent('Connexion interrompue.');
    expect(screen.getByLabelText('Projet')).toHaveValue('Mission conservée');
    expect(screen.getByText('Modifications non enregistrées')).toBeInTheDocument();
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, draft) => recordFixture(captainAccount, { draft: structuredClone(draft), version: 1 }));
    await saveDraft();
    expect(await screen.findByText('Brouillon enregistré.')).toBeInTheDocument();
    expect(saveSeaOperation).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ project: 'Mission conservée' }), undefined);
  });

  it('reveals applicable towing, cargo, diving and supply controls and preserves answers when a section is hidden', async () => {
    renderAccount();
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await userEvent.click(screen.getByRole('button', { name: /2Contrôles avant appareillage|2 Contrôles avant appareillage/ }));
    const cases = [
      ['Remorquage applicable', 'towingPlan'], ['Chargement de marchandise applicable', 'cargoLashing'],
      ['Navire de support de plongeur applicable', 'divingMedicalKit'],
    ] as const;
    for (const [label, checkId] of cases) {
      const check = SEA_OPERATION_CHECKS.find((item) => item.id === checkId)!;
      expect(screen.queryByLabelText(check.label)).not.toBeInTheDocument();
      await userEvent.selectOptions(screen.getByLabelText(label), 'yes');
      await userEvent.selectOptions(screen.getByLabelText(check.label), 'no');
      if (checkId === 'divingMedicalKit') {
        await userEvent.click(screen.getByText('Kit médical plongée prévu par le formulaire'));
        for (const item of DIVING_MEDICAL_KIT) expect(screen.getByText((text) => text.includes(item.article) && text.startsWith(`${item.quantity} ×`))).toBeInTheDocument();
      }
      await userEvent.selectOptions(screen.getByLabelText(label), 'no');
      expect(screen.queryByLabelText(check.label)).not.toBeInTheDocument();
      if (checkId === 'divingMedicalKit') expect(screen.queryByText('Kit médical plongée prévu par le formulaire')).not.toBeInTheDocument();
      await userEvent.selectOptions(screen.getByLabelText(label), 'yes');
      expect(screen.getByLabelText(check.label)).toHaveValue('no');
    }
    await userEvent.selectOptions(screen.getByLabelText('Approvisionnement / Avitaillement applicable'), 'yes');
    expect(screen.getByLabelText('Shipchandler')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Approvisionnement / Avitaillement applicable'), 'no');
    expect(screen.queryByLabelText('Shipchandler')).not.toBeInTheDocument();
  });

  it('blocks GO when a red control is negative and sends no save or signature request', async () => {
    const draft = noGoDraft();
    draft.decision = 'GO';
    draft.checks.weather = 'no';
    const record = recordFixture(captainAccount, { draft });
    renderAccount(captainAccount, record);
    await openRecord(record);
    await decisionStep();
    expect(screen.getByText('NO GO imposé · 1 contrôle(s) bloquant(s)')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'GO · la mission peut être réalisée' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Signer la décision GO' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('NO GO automatique');
    expect(saveSeaOperation).not.toHaveBeenCalled();
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

  it('lets the server-authorized captain finalize NO GO using the newly saved revision', async () => {
    const record = recordFixture(captainAccount);
    expect(validateSeaOperation(record.draft, 'NO_GO')).toEqual([]);
    const saved = { ...record, version: 4 };
    const signed: SeaOperationRecord = { ...saved, version: 5, status: 'signed', signedBy: captainAccount.id, signedByName: captainAccount.name, signedAt: '2026-10-16T10:00:00Z', canEdit: false, canSign: false };
    const { client } = renderAccount(captainAccount, record);
    vi.mocked(saveSeaOperation).mockResolvedValue(saved);
    vi.mocked(signSeaOperation).mockResolvedValue(signed);
    await openRecord(record);
    await decisionStep();
    await userEvent.click(screen.getByRole('button', { name: 'Signer la décision NO GO' }));
    expect(await screen.findByText('Décision du Capitaine signée et enregistrée. La fiche est figée.')).toBeInTheDocument();
    expect(saveSeaOperation).toHaveBeenCalledWith(client, record.draft, record);
    expect(signSeaOperation).toHaveBeenCalledWith(client, saved, captainAccount.name, true);
    expect(screen.getByLabelText('Décision')).toBeDisabled();
    expect(screen.getByLabelText('Projet')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Signer la décision/ })).not.toBeInTheDocument();
  });

  it('keeps a sailor preparation editable while the server denies captain signing rights', async () => {
    const record = recordFixture(sailorAccount);
    renderAccount(sailorAccount, record);
    await openRecord(record);
    await decisionStep();
    expect(screen.getByLabelText('Projet')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Signer la décision NO GO' })).toBeDisabled();
    expect(screen.getByText(/La signature est réservée au compte réel du Capitaine affecté au navire/)).toBeInTheDocument();
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

  it('retains the persisted new revision when signature fails and retries from that revision', async () => {
    const record = recordFixture(captainAccount);
    const saved = { ...record, version: 4 };
    const { client } = renderAccount(captainAccount, record);
    vi.mocked(saveSeaOperation).mockResolvedValueOnce(saved).mockResolvedValueOnce({ ...saved, version: 5 });
    vi.mocked(signSeaOperation).mockRejectedValue(new Error('La signature a été refusée par le serveur.'));
    await openRecord(record);
    await decisionStep();
    await userEvent.click(screen.getByRole('button', { name: 'Signer la décision NO GO' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('La signature a été refusée par le serveur.');
    expect(screen.getByLabelText('Projet')).toHaveValue(record.draft.project);
    expect(screen.getByLabelText('Risques identifiés / informations à transmettre à l’Armement')).toHaveValue(record.draft.risks);
    expect(within(document.querySelector('.so-screen')!).getByText(/Version 4/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Signer la décision NO GO' }));
    await waitFor(() => expect(saveSeaOperation).toHaveBeenCalledTimes(2));
    expect(saveSeaOperation).toHaveBeenLastCalledWith(client, saved.draft, saved);
    expect(signSeaOperation).toHaveBeenLastCalledWith(client, expect.objectContaining({ version: 5 }), captainAccount.name, true);
  });

  it('opens an existing signed decision read-only regardless of stale editing permissions', async () => {
    const record = recordFixture(captainAccount, { status: 'signed', signedBy: captainAccount.id, signedByName: captainAccount.name, signedAt: '2026-10-16T10:00:00Z', canEdit: true, canSign: true });
    renderAccount(captainAccount, record);
    await openRecord(record);
    expect(screen.getByLabelText('Projet')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Enregistrer le brouillon' })).not.toBeInTheDocument();
    await decisionStep();
    expect(screen.getByLabelText('Décision')).toBeDisabled();
    expect(screen.getByText(/Décision signée par Camille MARTIN/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Signer la décision/ })).not.toBeInTheDocument();
  });

  it('keeps unsaved inputs when sidebar navigation is refused and leaves only after acceptance', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderAccount(sailorAccount);
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await userEvent.type(screen.getByLabelText('Projet'), 'Préparation à conserver');
    await userEvent.click(screen.getByRole('link', { name: 'Navires' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith('Quitter cette fiche sans enregistrer les modifications ?');
    expect(screen.getByLabelText('Projet')).toHaveValue('Préparation à conserver');
    expect(screen.queryByRole('heading', { name: 'Flotte destination' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Navires' }));
    expect(await screen.findByRole('heading', { name: 'Flotte destination' })).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(screen.queryByLabelText('Projet')).not.toBeInTheDocument();
    expect(saveSeaOperation).not.toHaveBeenCalled();
  });

  it.each(['13:45', '2026-10-16T14:45'])('loads a saved time-only ETA and saves its edit to %s', async (eta) => {
    const draft = noGoDraft();
    draft.waypoints = [{ id: 'point-server-id', number: '1', descriptionVhf: 'VHF 16', latitude: '49 N', longitude: '001 W', ukc: '2 m', eta: '12:00', denseTraffic: false }];
    const record = recordFixture(captainAccount, { draft });
    const { client } = renderAccount(captainAccount, record);
    await openRecord(record);
    await userEvent.click(screen.getByRole('button', { name: /3Plan de passage|3 Plan de passage/ }));
    const input = screen.getByLabelText('ETA · date et heure · point 1');
    expect(input).toHaveValue('12:00');
    await userEvent.clear(input);
    await userEvent.type(input, eta);
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, edited) => ({ ...record, version: 4, draft: structuredClone(edited) }));
    await saveDraft();
    expect(await screen.findByText('Brouillon enregistré.')).toBeInTheDocument();
    expect(saveSeaOperation).toHaveBeenCalledWith(client, expect.objectContaining({ waypoints: [expect.objectContaining({ eta })] }), record);
    expect(input).toHaveValue(eta);
  });

  it('provides the complete signed print document from the Armement step', async () => {
    const draft = noGoDraft();
    draft.charts = 'SHOM 7120';
    draft.waypoints = [{ id: 'print-point', number: '1', descriptionVhf: 'Contact Cherbourg VHF 12', latitude: '49°39 N', longitude: '001°37 W', ukc: '2 m', eta: '12:00', denseTraffic: true }];
    const record = recordFixture(captainAccount, {
      draft, status: 'signed', version: 8, signedBy: captainAccount.id,
      signedByName: 'Identité serveur Camille MARTIN', captainName: 'Camille MARTIN',
      signedAt: '2026-10-16T10:00:00Z', canEdit: false, canSign: false,
    });
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    renderAccount(captainAccount, record);
    await openRecord(record);
    expect(screen.getByRole('button', { name: /1Armement|1 Armement/ })).toHaveAttribute('aria-current', 'step');
    await userEvent.click(screen.getByRole('button', { name: 'Imprimer la fiche' }));
    expect(print).toHaveBeenCalledTimes(1);
    const document = within(screen.getByRole('article', { name: 'Fiche imprimable Opération en Mer', hidden: true }));
    expect(document.getByText('Identité serveur Camille MARTIN')).toBeInTheDocument();
    expect(document.getByText('16/10/2026 12:00')).toBeInTheDocument();
    expect(document.getByText('Signée et figée')).toBeInTheDocument();
    expect(document.getByText(`${record.id} · Version 8`)).toBeInTheDocument();
    expect(document.getByText('SHOM 7120')).toBeInTheDocument();
    expect(document.getByText('Contact Cherbourg VHF 12')).toBeInTheDocument();
    expect(document.getByText('12:00')).toBeInTheDocument();
    expect(document.getByText(draft.risks)).toBeInTheDocument();
    expect(document.getByRole('heading', { name: 'Décision du Capitaine', hidden: true })).toBeInTheDocument();
  });

  it('recovers an unsaved preparation after unmount with its original revision and clears it after a successful save', async () => {
    const original = recordFixture(captainAccount);
    const first = renderAccount(captainAccount, original);
    await openRecord(original);
    await userEvent.clear(screen.getByLabelText('Projet'));
    await userEvent.type(screen.getByLabelText('Projet'), 'Préparation non enregistrée');
    await userEvent.click(screen.getByRole('button', { name: /3Plan de passage|3 Plan de passage/ }));
    vi.mocked(saveSeaOperation).mockRejectedValueOnce({ message: 'Erreur serveur inconnue conservée.' });
    await saveDraft();
    expect(await screen.findByRole('alert')).toHaveTextContent('Erreur serveur inconnue conservée.');
    first.unmount();

    const newer = { ...original, version: 9 };
    const recovered = renderAccount(captainAccount, newer);
    expect(await screen.findByText(/Votre préparation non enregistrée a été récupérée/)).toBeInTheDocument();
    expect(screen.getByLabelText('Projet')).toHaveValue('Préparation non enregistrée');
    expect(screen.getByRole('button', { name: /3Plan de passage|3 Plan de passage/ })).toHaveAttribute('aria-current', 'step');
    vi.mocked(saveSeaOperation).mockRejectedValueOnce(new Error('L’opération a été modifiée. Rechargez-la avant de continuer.'));
    await saveDraft();
    expect(await screen.findByRole('alert')).toHaveTextContent('L’opération a été modifiée.');
    expect(saveSeaOperation).toHaveBeenLastCalledWith(recovered.client, expect.objectContaining({ project: 'Préparation non enregistrée' }), expect.objectContaining({ id: original.id, version: 3 }));
    expect(screen.getByLabelText('Projet')).toHaveValue('Préparation non enregistrée');
    let saved = newer;
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, draft) => (saved = { ...newer, version: 10, draft: structuredClone(draft) }));
    await saveDraft();
    expect(await screen.findByText('Brouillon enregistré.')).toBeInTheDocument();
    recovered.unmount();
    renderAccount(captainAccount, saved);
    expect(await screen.findByRole('button', { name: /Préparation non enregistrée/ })).toBeInTheDocument();
    expect(screen.queryByText(/Votre préparation non enregistrée a été récupérée/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Projet')).not.toBeInTheDocument();
  });

  it('isolates local recovery by authenticated actor and company and discards it after an approved quit', async () => {
    const first = renderAccount(captainAccount);
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await userEvent.type(screen.getByLabelText('Projet'), 'Privé au compte et à la société');
    first.unmount();
    const otherActor = renderAccount(sailorAccount);
    expect(await screen.findByText('Préparez votre première opération en mer')).toBeInTheDocument();
    expect(screen.queryByLabelText('Projet')).not.toBeInTheDocument();
    otherActor.unmount();
    const otherCompany = renderAccount(captainAccount, undefined, 2);
    expect(await screen.findByText('Préparez votre première opération en mer')).toBeInTheDocument();
    expect(screen.queryByLabelText('Projet')).not.toBeInTheDocument();
    otherCompany.unmount();
    const recovered = renderAccount(captainAccount);
    expect(await screen.findByLabelText('Projet')).toHaveValue('Privé au compte et à la société');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await userEvent.click(screen.getByRole('link', { name: 'Navires' }));
    expect(await screen.findByRole('heading', { name: 'Flotte destination' })).toBeInTheDocument();
    recovered.unmount();
    renderAccount(captainAccount);
    expect(await screen.findByText('Préparez votre première opération en mer')).toBeInTheDocument();
    expect(screen.queryByText(/Votre préparation non enregistrée a été récupérée/)).not.toBeInTheDocument();
  });
});
