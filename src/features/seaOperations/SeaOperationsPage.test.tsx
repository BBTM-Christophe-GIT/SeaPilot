import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptySeaOperation, DIVING_MEDICAL_KIT, SEA_OPERATION_CHECKS, seaOperationToday, validateSeaOperation, type SeaOperationPayload } from './seaOperationModel';
import { fetchSeaOperationCaptainSignature, fetchSeaOperationData, fetchSeaOperationDetail, fetchSeaOperationPlanning, loadSeaOperationSignature, saveSeaOperation, signSeaOperation, type SeaOperationData, type SeaOperationPlanningContext, type SeaOperationPlanningChoice, type SeaOperationRecord } from './seaOperationQueries';
import { exportSeaOperationPdf } from './seaOperationPdf';
import { SeaOperationsPage } from './SeaOperationsPage';

vi.mock('./seaOperationQueries', () => ({
  fetchSeaOperationData: vi.fn(), fetchSeaOperationDetail: vi.fn(), saveSeaOperation: vi.fn(), signSeaOperation: vi.fn(),
  fetchSeaOperationPlanning: vi.fn(), fetchSeaOperationCaptainSignature: vi.fn(), loadSeaOperationSignature: vi.fn().mockResolvedValue(null),
}));
vi.mock('./seaOperationPdf', () => ({ exportSeaOperationPdf: vi.fn() }));

const captainAccount = { id: 'captain-server-account', name: 'Camille MARTIN', canSign: true };
const sailorAccount = { id: 'sailor-server-account', name: 'Alex DUPONT', canSign: false };
type Account = typeof captainAccount;

function plannedMissions(date = seaOperationToday()): SeaOperationPlanningChoice[] {
  return [
    {
      operationId: '401:12', projectId: '501', project: 'BAL-26 - Inspection des balises',
      client: 'Port de Cherbourg', clientContact: 'Léa CLIENT · lea@example.test · +33 2 10 20 30 40', description: 'Inspection des balises du chenal de Cherbourg.',
      vessel: { id: '12', name: 'GOURY', registrationImo: 'CH-100 / IMO 1234567', departurePort: 'Cherbourg', arrivalPort: 'Le Havre', etd: `${date}T08:00`, eta: `${date}T16:00` },
      captains: [{ personId: '101', name: 'MARTIN Camille', functionLabel: 'Capitaine', hasSignature: true, canSign: false }], canSign: false,
    },
    {
      operationId: '402:13', projectId: '502', project: 'BATH-26 - Mesures bathymétriques',
      client: 'Chantier de Caen', clientContact: 'Hugo CLIENT · hugo@example.test · +33 2 50 60 70 80', description: 'Mesures bathymétriques avant travaux sur le chenal.',
      vessel: { id: '13', name: 'LE ROZEL', registrationImo: 'CH-200 / IMO 7654321', departurePort: 'Caen', arrivalPort: 'Dieppe', etd: `${date}T09:30`, eta: `${date}T18:00` },
      captains: [{ personId: '102', name: 'DUPONT Alex', functionLabel: 'Capitaine temporaire', hasSignature: true, canSign: true }], canSign: true,
    },
  ];
}

function profileSignature(personId = '102') {
  return {
    url: `https://signature.example.test/${personId}.png`,
    snapshot: { signature_id: 10, signer_person_id: Number(personId), signer_name: 'Capitaine du Planning', storage_bucket: 'working-time-signatures', storage_path: `fixture/${personId}.png`, mime_type: 'image/png', sha256: 'a'.repeat(64), version_number: 1 },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise, resolve };
}

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

function renderAccount(account: Account = captainAccount, record?: SeaOperationRecord, companyId = 1, choices: SeaOperationPlanningChoice[] = []) {
  const client = { fixtureAccountId: account.id };
  const data: SeaOperationData = {
    companyId, actorId: account.id, actorName: account.name,
    records: record ? [record] : [],
    vessels: [
      { id: 12, name: 'GOURY', registrationImo: 'IMO-1234567', lengthOverall: '36', canSign: account.canSign },
      { id: 13, name: 'LE ROZEL', registrationImo: 'IMO-7654321', lengthOverall: '19.2', canSign: account.canSign },
    ],
  };
  vi.mocked(fetchSeaOperationData).mockResolvedValue(data);
  vi.mocked(fetchSeaOperationPlanning).mockImplementation(async (_client, date) => ({ date, choices }));
  vi.mocked(fetchSeaOperationCaptainSignature).mockResolvedValue(null);
  vi.mocked(loadSeaOperationSignature).mockResolvedValue(null);
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
  await screen.findByRole('dialog', { name: 'Fiche Opération en Mer' });
}

const formQueries = () => within(document.querySelector('.so-editor-form-pane')!);
const footerQueries = () => within(screen.getByRole('dialog').querySelector('.app-dialog__footer')!);
const stepButton = (index: number) => within(screen.getByRole('navigation', { name: 'Étapes de la préparation' })).getAllByRole('button')[index];
async function chooseMission(choice: SeaOperationPlanningChoice) {
  await screen.findByRole('option', { name: `${choice.project} · ${choice.vessel.name}` });
  await userEvent.selectOptions(formQueries().getByLabelText('Projet'), choice.operationId);
}

async function saveDraft() {
  await userEvent.click(footerQueries().getByRole('button', { name: 'Enregistrer le brouillon' }));
}

async function decisionStep() {
  await userEvent.click(stepButton(3));
}

function viewport(width: number) {
  vi.stubGlobal('innerWidth', width);
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: width <= 1100, media: query, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  })));
}

beforeEach(() => { vi.resetAllMocks(); sessionStorage.clear(); viewport(1440); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); document.body.style.overflow = ''; });

describe('Opération en Mer with authenticated server permission fixtures', () => {
  it('distinguishes two projects on the same day and replaces all linked fields and the temporary captain signature', async () => {
    const choices = plannedMissions();
    const [first, second] = choices;
    const { client } = renderAccount({ id: 'temporary-captain-server-account', name: second.captains[0].name, canSign: true }, undefined, 1, choices);
    vi.mocked(fetchSeaOperationCaptainSignature).mockImplementation(async (_client, _date, _operationId, personId) => profileSignature(personId));
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await chooseMission(first);
    expect(formQueries().getByLabelText('Client')).toHaveValue(first.client);
    expect(formQueries().getByLabelText('Coordonnées du client')).toHaveValue(first.clientContact);
    expect(formQueries().getByLabelText('Description de l’opération')).toHaveValue(first.description);
    expect(formQueries().getByLabelText('Navire')).toHaveValue('12');
    expect(formQueries().getByLabelText('Immatriculation / IMO')).toHaveValue(first.vessel.registrationImo);
    expect(formQueries().getByLabelText('Prénom NOM du Capitaine')).toHaveValue(first.captains[0].name);
    await decisionStep();
    expect(await formQueries().findByRole('img', { name: `Signature de ${first.captains[0].name}` })).toHaveAttribute('src', 'https://signature.example.test/101.png');
    await userEvent.click(stepButton(0));
    await chooseMission(second);
    expect(formQueries().getByLabelText('Client')).toHaveValue(second.client);
    expect(formQueries().getByLabelText('Coordonnées du client')).toHaveValue(second.clientContact);
    expect(formQueries().getByLabelText('Description de l’opération')).toHaveValue(second.description);
    expect(formQueries().getByLabelText('Navire')).toHaveValue('13');
    expect(formQueries().getByLabelText('Immatriculation / IMO')).toHaveValue(second.vessel.registrationImo);
    expect(formQueries().getByLabelText('Port de départ')).toHaveValue('Caen');
    expect(formQueries().getByLabelText('Port d’arrivée')).toHaveValue('Dieppe');
    expect(formQueries().getByLabelText('Prénom NOM du Capitaine')).toHaveValue(second.captains[0].name);
    expect(formQueries().getByLabelText('Client')).toHaveAttribute('readonly');
    await decisionStep();
    expect(formQueries().getByLabelText('Prénom NOM du Capitaine signataire')).toHaveValue(second.captains[0].name);
    expect(await formQueries().findByRole('img', { name: `Signature de ${second.captains[0].name}` })).toHaveAttribute('src', 'https://signature.example.test/102.png');
    expect(formQueries().queryByRole('img', { name: `Signature de ${first.captains[0].name}` })).not.toBeInTheDocument();
    expect(fetchSeaOperationCaptainSignature).toHaveBeenLastCalledWith(client, seaOperationToday(), second.operationId, second.captains[0].personId);
    await userEvent.selectOptions(formQueries().getByLabelText('Décision'), 'NO_GO');
    expect(footerQueries().getByRole('button', { name: 'Signer la décision NO GO' })).toBeEnabled();
  });

  it('defaults the signature to today in Paris even when the selected operation occurs later', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-16T22:30:00Z'));
    const choices = plannedMissions('2026-10-20');
    renderAccount(captainAccount, undefined, 1, choices);
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    fireEvent.change(formQueries().getByLabelText('Date de l’opération'), { target: { value: '2026-10-20' } });
    await chooseMission(choices[0]);
    await decisionStep();
    expect(formQueries().getByLabelText('Prénom NOM du Capitaine signataire')).toHaveValue('MARTIN Camille');
    expect(formQueries().getByLabelText('Date de la décision')).toHaveValue('2026-10-17');
    expect(formQueries().getByLabelText('Lieu de la décision')).toHaveValue('Cherbourg');
  });

  it('reports a completed null signature response as unavailable instead of leaving it loading', async () => {
    const choices = plannedMissions();
    renderAccount(captainAccount, undefined, 1, choices);
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await chooseMission(choices[0]);
    await decisionStep();
    expect(await formQueries().findByText('La signature RH est indisponible. Rechargez la fiche avant de signer.')).toBeInTheDocument();
    expect(formQueries().queryByText('Chargement de la signature…')).not.toBeInTheDocument();
  });

  it('exports the saved record with its authorized signature snapshot without resaving the declaration', async () => {
    const record = recordFixture(captainAccount, { status: 'signed', signedBy: captainAccount.id, signedByName: captainAccount.name, signedAt: '2026-10-16T10:00:00Z', signatureSnapshot: profileSignature().snapshot, canEdit: false, canSign: false });
    const { client } = renderAccount(captainAccount, record);
    const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
    vi.mocked(loadSeaOperationSignature).mockResolvedValue(image);
    vi.mocked(exportSeaOperationPdf).mockResolvedValue({ bytes: new Uint8Array(), filename: 'operation.pdf', pageCount: 1 });
    await openRecord(record);
    await userEvent.click(footerQueries().getByRole('button', { name: 'Exporter le PDF' }));
    await waitFor(() => expect(exportSeaOperationPdf).toHaveBeenCalledWith(record, { signatureImage: image }));
    expect(loadSeaOperationSignature).toHaveBeenCalledWith(client, record);
    expect(saveSeaOperation).not.toHaveBeenCalled();
    expect(signSeaOperation).not.toHaveBeenCalled();
    expect(formQueries().getByLabelText('Projet')).toHaveDisplayValue(record.draft.project);
    await waitFor(() => expect(footerQueries().getByRole('button', { name: 'Exporter le PDF' })).toBeEnabled());
  });

  it('blocks PDF generation if the saved signature cannot be verified and preserves the signed record', async () => {
    const record = recordFixture(captainAccount, { status: 'signed', version: 8, signedBy: captainAccount.id, signedByName: captainAccount.name, signedAt: '2026-10-16T10:00:00Z', signatureSnapshot: profileSignature().snapshot, canEdit: false, canSign: false });
    renderAccount(captainAccount, record);
    vi.mocked(loadSeaOperationSignature).mockRejectedValue(new Error('La signature RH enregistrée est indisponible.'));
    await openRecord(record);
    await userEvent.click(footerQueries().getByRole('button', { name: 'Exporter le PDF' }));
    expect(await formQueries().findByRole('alert')).toHaveTextContent('La signature RH enregistrée est indisponible.');
    expect(exportSeaOperationPdf).not.toHaveBeenCalled();
    expect(saveSeaOperation).not.toHaveBeenCalled();
    expect(formQueries().getByLabelText('Projet')).toHaveDisplayValue(record.draft.project);
    expect(formQueries().getByLabelText('Projet')).toBeDisabled();
    expect(screen.getByRole('dialog')).toHaveTextContent('Version 8');
    expect(footerQueries().getByRole('button', { name: 'Exporter le PDF' })).toBeEnabled();
  });

  it('requires a captain choice when Planning returns several and uses the selected account capability', async () => {
    const [choice] = plannedMissions();
    const selected = { ...choice.captains[0], personId: '103', name: 'BERNARD Robin', canSign: true };
    const multiple = { ...choice, captains: [choice.captains[0], selected] };
    renderAccount(captainAccount, undefined, 1, [multiple, plannedMissions()[1]]);
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await chooseMission(multiple);
    expect(formQueries().getByLabelText('Prénom NOM du Capitaine')).toHaveValue('');
    await decisionStep();
    expect(formQueries().getByLabelText('Prénom NOM du Capitaine signataire')).toHaveValue('');
    await userEvent.selectOptions(formQueries().getByLabelText('Décision'), 'NO_GO');
    expect(footerQueries().getByRole('button', { name: 'Signer la décision NO GO' })).toBeDisabled();
    await userEvent.click(stepButton(0));
    await userEvent.selectOptions(formQueries().getByLabelText('Prénom NOM du Capitaine'), selected.personId);
    await decisionStep();
    expect(formQueries().getByLabelText('Prénom NOM du Capitaine signataire')).toHaveValue(selected.name);
    expect(footerQueries().getByRole('button', { name: 'Signer la décision NO GO' })).toBeEnabled();
  });

  it('ignores a late signature response from the previous mission after another captain is selected', async () => {
    const choices = plannedMissions();
    const staleSignature = deferred<Awaited<ReturnType<typeof fetchSeaOperationCaptainSignature>>>();
    renderAccount(captainAccount, undefined, 1, choices);
    vi.mocked(fetchSeaOperationCaptainSignature).mockImplementation(async (_client, _date, _operation, personId) => personId === '101' ? staleSignature.promise : profileSignature(personId));
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await chooseMission(choices[0]);
    await chooseMission(choices[1]);
    await decisionStep();
    expect(await formQueries().findByRole('img', { name: 'Signature de DUPONT Alex' })).toHaveAttribute('src', profileSignature('102').url);
    await act(async () => staleSignature.resolve(profileSignature('101')));
    expect(formQueries().getByRole('img', { name: 'Signature de DUPONT Alex' })).toHaveAttribute('src', profileSignature('102').url);
    expect(formQueries().queryByRole('img', { name: 'Signature de MARTIN Camille' })).not.toBeInTheDocument();
    expect(formQueries().getByLabelText('Prénom NOM du Capitaine signataire')).toHaveValue('DUPONT Alex');
  });

  it('ignores an older Planning date response after the next date has loaded and been selected', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-16T10:00:00Z'));
    const oldContext = deferred<SeaOperationPlanningContext>();
    const newContext = deferred<SeaOperationPlanningContext>();
    const oldChoices = plannedMissions('2026-10-16').map((choice) => ({ ...choice, project: `${choice.project} - ancien jour` }));
    const newChoices = plannedMissions('2026-10-17').map((choice) => ({ ...choice, project: `${choice.project} - nouveau jour` }));
    const { client } = renderAccount();
    vi.mocked(fetchSeaOperationPlanning).mockImplementation((_client, date) => date === '2026-10-16' ? oldContext.promise : newContext.promise);
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    fireEvent.change(formQueries().getByLabelText('Date de l’opération'), { target: { value: '2026-10-17' } });
    await act(async () => newContext.resolve({ date: '2026-10-17', choices: newChoices }));
    await chooseMission(newChoices[1]);
    await act(async () => oldContext.resolve({ date: '2026-10-16', choices: oldChoices }));
    expect(formQueries().getByLabelText('Date de l’opération')).toHaveValue('2026-10-17');
    expect(formQueries().getByLabelText('Projet')).toHaveDisplayValue(`${newChoices[1].project} · LE ROZEL`);
    expect(formQueries().getByLabelText('Description de l’opération')).toHaveValue(newChoices[1].description);
    expect(screen.queryByRole('option', { name: `${oldChoices[1].project} · LE ROZEL` })).not.toBeInTheDocument();
    expect(fetchSeaOperationPlanning).toHaveBeenLastCalledWith(client, '2026-10-17');
  });

  it('preserves user input entered while a unique Planning mission is still loading', async () => {
    const context = deferred<SeaOperationPlanningContext>();
    const [choice] = plannedMissions();
    renderAccount();
    vi.mocked(fetchSeaOperationPlanning).mockReturnValue(context.promise);
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    expect(formQueries().getByLabelText('Projet')).toBeDisabled();
    await userEvent.type(formQueries().getByLabelText('Description de l’opération'), 'Saisie conservée pendant le chargement');
    await userEvent.click(stepButton(1));
    await userEvent.selectOptions(formQueries().getByLabelText('Les conditions météo sont conformes aux limites opérationnelles définies'), 'yes');
    await act(async () => context.resolve({ date: seaOperationToday(), choices: [choice] }));
    await userEvent.click(stepButton(0));
    expect(formQueries().getByLabelText('Projet')).toHaveValue('');
    expect(formQueries().getByLabelText('Description de l’opération')).toHaveValue('Saisie conservée pendant le chargement');
    expect(formQueries().getByLabelText('Les conditions météo sont conformes aux limites opérationnelles définies')).toHaveValue('yes');
    expect(footerQueries().getByText('Modifications non enregistrées')).toBeInTheDocument();
    expect(saveSeaOperation).not.toHaveBeenCalled();
  });

  it('does not replace a saved incomplete legacy draft when Planning offers only one mission', async () => {
    const draft = noGoDraft();
    draft.project = '';
    draft.description = 'Préparation historique déjà enregistrée';
    draft.checks.weather = 'no';
    draft.charts = 'Carte historique';
    const record = recordFixture(captainAccount, { draft });
    const [choice] = plannedMissions();
    const { client } = renderAccount(captainAccount, record, 1, [choice]);
    await userEvent.click(await screen.findByRole('button', { name: /Opération sans titre/ }));
    await screen.findByRole('dialog', { name: 'Fiche Opération en Mer' });
    await screen.findByRole('option', { name: `${choice.project} · ${choice.vessel.name}` });
    expect(formQueries().getByLabelText('Projet')).toHaveValue('');
    expect(formQueries().getByLabelText('Description de l’opération')).toHaveValue(draft.description);
    expect(formQueries().getByLabelText('Les conditions météo sont conformes aux limites opérationnelles définies')).toHaveValue('no');
    expect(formQueries().getByLabelText('Numéro de la ou des cartes marines')).toHaveValue('Carte historique');
    expect(formQueries().getByLabelText('Décision')).toHaveValue('NO_GO');
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, saved) => ({ ...record, draft: structuredClone(saved), version: 4 }));
    await saveDraft();
    expect(await formQueries().findByText('Brouillon enregistré.')).toBeInTheDocument();
    expect(saveSeaOperation).toHaveBeenCalledWith(client, draft, record);
  });

  it('resets safety approvals, passage points and signature acknowledgment when the mission changes', async () => {
    const choices = plannedMissions();
    const { client } = renderAccount(captainAccount, undefined, 1, choices);
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await chooseMission(choices[0]);
    await userEvent.selectOptions(formQueries().getByLabelText('Mode de déclaration'), 'nomade');
    await userEvent.click(formQueries().getByRole('button', { name: 'Ajouter une personne' }));
    await userEvent.type(formQueries().getByLabelText('Prénom NOM 1'), 'Personne de la première mission');
    await userEvent.click(stepButton(1));
    await userEvent.selectOptions(formQueries().getByLabelText('Chargement de marchandise applicable'), 'yes');
    await userEvent.selectOptions(formQueries().getByLabelText('Les conditions météo sont conformes aux limites opérationnelles définies'), 'yes');
    await userEvent.click(stepButton(2));
    await userEvent.type(formQueries().getByLabelText('Numéro de la ou des cartes marines'), 'SHOM 7120');
    await userEvent.click(formQueries().getByRole('button', { name: 'Ajouter un point de passage' }));
    await userEvent.type(formQueries().getByLabelText('Description / Contact VHF · point 1'), 'Ancien point');
    await decisionStep();
    await userEvent.selectOptions(formQueries().getByLabelText('Décision'), 'GO');
    await userEvent.type(formQueries().getByLabelText('Risques identifiés / informations à transmettre à l’Armement'), 'Ancienne analyse');
    await userEvent.click(formQueries().getByRole('checkbox', { name: /En qualité de Capitaine/ }));
    await userEvent.click(stepButton(0));
    await chooseMission(choices[1]);
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, draft) => recordFixture(captainAccount, { draft: structuredClone(draft), version: 1 }));
    await saveDraft();
    expect(await formQueries().findByText('Brouillon enregistré.')).toBeInTheDocument();
    expect(saveSeaOperation).toHaveBeenCalledWith(client, expect.objectContaining({
      project: choices[1].project, charts: '', waypoints: [], specialPersonnel: [], decision: '', risks: '', portServices: [],
      checks: expect.objectContaining({ weather: '', cargoLashing: '' }),
      applicability: { towing: '', cargo: '', divingSupport: '', supplies: '' },
      dapaq: { method: '', preparedBy: '', agentName: '', agentContact: '' },
      signature: { captainName: choices[1].captains[0].name, date: seaOperationToday(), place: 'Caen', acknowledged: false },
    }), undefined);
  });

  it('keeps one compact answer per question and an editable passage table with add and remove controls', async () => {
    renderAccount();
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await userEvent.click(stepButton(1));
    const weather = formQueries().getByLabelText('Les conditions météo sont conformes aux limites opérationnelles définies');
    expect(within(weather).getAllByRole('option').map((option) => option.textContent)).toEqual(['—', 'Oui', 'Non']);
    await userEvent.selectOptions(weather, 'no');
    expect(formQueries().getByLabelText('Justification — Les conditions météo sont conformes aux limites opérationnelles définies')).toBeInTheDocument();
    await userEvent.click(stepButton(2));
    const table = formQueries().getByRole('table', { name: 'Points de passage' });
    expect(within(table).getByText('Ajoutez le premier point de passage.')).toBeInTheDocument();
    await userEvent.click(formQueries().getByRole('button', { name: 'Ajouter un point de passage' }));
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    await userEvent.type(formQueries().getByLabelText('Description / Contact VHF · point 1'), 'VHF 16');
    await userEvent.click(formQueries().getByRole('checkbox', { name: 'Zone maritime à trafic dense · point 1' }));
    expect(formQueries().getByLabelText('Description / Contact VHF · point 1')).toHaveValue('VHF 16');
    expect(formQueries().getByRole('checkbox', { name: 'Zone maritime à trafic dense · point 1' })).toBeChecked();
    await userEvent.click(formQueries().getByRole('button', { name: 'Supprimer le point 1' }));
    expect(within(table).getByText('Ajoutez le premier point de passage.')).toBeInTheDocument();
  });

  it('opens a fullscreen modal with four preparation steps, form, live document, completion and footer actions', async () => {
    renderAccount();
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    const dialog = screen.getByRole('dialog', { name: 'Nouvelle opération en mer' });
    const modal = within(dialog);
    expect(dialog).toHaveClass('app-dialog--fullscreen');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(modal.getByRole('complementary', { name: 'Parcours de l’opération' })).toBeInTheDocument();
    expect(within(modal.getByRole('navigation', { name: 'Étapes de la préparation' })).getAllByRole('button')).toHaveLength(4);
    expect(formQueries().getByRole('region', { name: 'Préparation de l’Armement' })).toBeVisible();
    expect(modal.getByRole('region', { name: 'Aperçu de la fiche' })).toBeInTheDocument();
    expect(modal.getByRole('complementary', { name: 'Complétude de la fiche' })).toBeInTheDocument();
    expect(dialog.querySelector('.so-mobile-switch')).toHaveAttribute('hidden');
    expect(footerQueries().getByRole('button', { name: 'Enregistrer le brouillon' })).toBeEnabled();
    expect(footerQueries().getByRole('button', { name: 'Suivant' })).toBeEnabled();
    expect(footerQueries().getByRole('button', { name: 'Annuler' })).toBeEnabled();
    expect(footerQueries().queryByRole('button', { name: 'Précédent' })).not.toBeInTheDocument();
  });

  it('closes a clean modal with Escape and restores the opener focus and page scrolling', async () => {
    document.body.style.overflow = 'scroll';
    renderAccount();
    const opener = await screen.findByRole('button', { name: 'Créer une opération' });
    await userEvent.click(opener);
    const dialog = screen.getByRole('dialog');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    expect(document.body.style.overflow).toBe('hidden');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(opener).toHaveFocus());
    expect(document.body.style.overflow).toBe('scroll');
    expect(saveSeaOperation).not.toHaveBeenCalled();
  });

  it('retains a dirty modal on refused Escape and closes it only after explicit acceptance', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderAccount();
    const opener = await screen.findByRole('button', { name: 'Créer une opération' });
    await userEvent.click(opener);
    await userEvent.type(formQueries().getByLabelText('Description de l’opération'), 'Mission à conserver');
    await userEvent.keyboard('{Escape}');
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(formQueries().getByLabelText('Description de l’opération')).toHaveValue('Mission à conserver');
    await userEvent.keyboard('{Escape}');
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(opener).toHaveFocus());
    expect(sessionStorage.length).toBe(0);
  });

  it('wraps keyboard focus inside the modal between its close control and fixed footer', async () => {
    renderAccount();
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    const close = within(screen.getByRole('dialog')).getByRole('button', { name: 'Fermer' });
    const next = footerQueries().getByRole('button', { name: 'Suivant' });
    close.focus();
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
    expect(next).toHaveFocus();
    await userEvent.keyboard('{Tab}');
    expect(close).toHaveFocus();
  });

  it('updates the live preview and completion while retaining values across footer and sidebar steps', async () => {
    renderAccount();
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    const preview = screen.getByRole('region', { name: 'Aperçu de la fiche' });
    const progress = screen.getByRole('progressbar', { name: 'Champs de préparation renseignés' });
    const before = Number(progress.getAttribute('aria-valuenow'));
    await userEvent.type(formQueries().getByLabelText('Description de l’opération'), 'Mission aperçue en direct');
    await userEvent.type(formQueries().getByLabelText('Client'), 'Client du port');
    expect(preview).toHaveTextContent('Mission aperçue en direct');
    expect(preview).toHaveTextContent('Client du port');
    expect(Number(progress.getAttribute('aria-valuenow'))).toBeGreaterThan(before);
    await userEvent.click(footerQueries().getByRole('button', { name: 'Suivant' }));
    expect(stepButton(1)).toHaveAttribute('aria-current', 'step');
    expect(formQueries().getByRole('region', { name: 'Contrôles du Capitaine' })).toBeVisible();
    await userEvent.click(footerQueries().getByRole('button', { name: 'Précédent' }));
    expect(formQueries().getByLabelText('Description de l’opération')).toHaveValue('Mission aperçue en direct');
    const completionSteps = within(screen.getByRole('navigation', { name: 'Complétude par étape' })).getAllByRole('button');
    await userEvent.click(completionSteps[2]);
    expect(stepButton(2)).toHaveAttribute('aria-current', 'step');
    expect(formQueries().getByRole('region', { name: 'Plan de passage' })).toBeVisible();
    await userEvent.click(stepButton(0));
    expect(formQueries().getByLabelText('Client')).toHaveValue('Client du port');
  });

  it('switches compact 390px panes without losing fields and keeps footer actions available', async () => {
    viewport(390);
    renderAccount();
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    const dialog = screen.getByRole('dialog');
    const switcher = within(screen.getByRole('group', { name: 'Affichage de la fiche' }));
    const form = dialog.querySelector('.so-editor-form-pane')!;
    const documentPane = dialog.querySelector('.so-editor-document-pane')!;
    expect(switcher.getByRole('button', { name: 'Saisie' })).toHaveAttribute('aria-pressed', 'true');
    expect(documentPane).toHaveAttribute('hidden');
    await userEvent.type(formQueries().getByLabelText('Description de l’opération'), 'Mission mobile conservée');
    await userEvent.click(switcher.getByRole('button', { name: 'Aperçu et complétude' }));
    expect(form).toHaveAttribute('hidden');
    expect(documentPane).not.toHaveAttribute('hidden');
    expect(switcher.getByRole('button', { name: 'Aperçu et complétude' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('textbox', { name: 'Description de l’opération' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Aperçu de la fiche' })).toHaveTextContent('Mission mobile conservée');
    expect(footerQueries().getByRole('button', { name: 'Enregistrer le brouillon' })).toBeEnabled();
    await userEvent.click(stepButton(2));
    expect(switcher.getByRole('button', { name: 'Saisie' })).toHaveAttribute('aria-pressed', 'true');
    expect(form).not.toHaveAttribute('hidden');
    expect(formQueries().getByRole('region', { name: 'Plan de passage' })).toBeVisible();
    await userEvent.click(stepButton(0));
    expect(formQueries().getByLabelText('Description de l’opération')).toHaveValue('Mission mobile conservée');
  });

  it('reveals and focuses compact-pane server errors and focuses the form heading after completion navigation', async () => {
    viewport(390);
    renderAccount();
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await userEvent.type(formQueries().getByLabelText('Description de l’opération'), 'Mission mobile à enregistrer');
    const switcher = within(screen.getByRole('group', { name: 'Affichage de la fiche' }));
    await userEvent.click(switcher.getByRole('button', { name: 'Aperçu et complétude' }));
    vi.mocked(saveSeaOperation).mockRejectedValueOnce(new Error('Le serveur demande de réessayer.'));
    await saveDraft();
    const alert = await formQueries().findByRole('alert');
    expect(alert).toHaveTextContent('Le serveur demande de réessayer.');
    expect(document.querySelector('.so-editor-form-pane')).not.toHaveAttribute('hidden');
    await waitFor(() => expect(alert).toHaveFocus());
    expect(formQueries().getByLabelText('Description de l’opération')).toHaveValue('Mission mobile à enregistrer');
    await userEvent.click(switcher.getByRole('button', { name: 'Aperçu et complétude' }));
    const completion = within(screen.getByRole('navigation', { name: 'Complétude par étape' }));
    await userEvent.click(completion.getAllByRole('button')[2]);
    const heading = formQueries().getByRole('heading', { name: 'Plan de passage' });
    expect(switcher.getByRole('button', { name: 'Saisie' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it('disables modal dismissal and footer submission while the server save is pending', async () => {
    renderAccount();
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await userEvent.type(formQueries().getByLabelText('Description de l’opération'), 'Mission en cours de sauvegarde');
    let resolveSave!: (record: SeaOperationRecord) => void;
    vi.mocked(saveSeaOperation).mockImplementation(() => new Promise((resolve) => { resolveSave = resolve; }));
    await saveDraft();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-busy', 'true');
    expect(within(dialog).getByRole('button', { name: 'Fermer' })).toBeDisabled();
    expect(footerQueries().getByRole('button', { name: 'Annuler' })).toBeDisabled();
    expect(footerQueries().getByRole('button', { name: 'Enregistrer le brouillon' })).toBeDisabled();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(dialog).toBeInTheDocument();
    const draft = emptySeaOperation(); draft.description = 'Mission en cours de sauvegarde';
    await act(async () => resolveSave(recordFixture(captainAccount, { draft, version: 1 })));
    expect(await formQueries().findByText('Brouillon enregistré.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-busy');
  });

  it('preserves server read-only rights inside the new fullscreen workflow', async () => {
    const record = recordFixture(sailorAccount, { canEdit: false, canSign: false });
    renderAccount(sailorAccount, record);
    await openRecord(record);
    expect(formQueries().getByLabelText('Projet')).toBeDisabled();
    expect(footerQueries().queryByRole('button', { name: 'Enregistrer le brouillon' })).not.toBeInTheDocument();
    await decisionStep();
    expect(formQueries().getByLabelText('Décision')).toBeDisabled();
    expect(footerQueries().getByRole('button', { name: 'Signer la décision NO GO' })).toBeDisabled();
    expect(saveSeaOperation).not.toHaveBeenCalled();
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

  it('shows the empty register and saves an incomplete new preparation as a draft', async () => {
    const { client } = renderAccount(sailorAccount);
    expect(await screen.findByText('Préparez votre première opération en mer')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Créer une opération' }));
    await userEvent.type(formQueries().getByLabelText('Description de l’opération'), 'Préparation du balisage');
    await userEvent.selectOptions(formQueries().getByLabelText('Navire'), '12');
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, draft) => recordFixture(sailorAccount, { draft: structuredClone(draft), version: 1 }));
    await saveDraft();
    expect(await formQueries().findByText('Brouillon enregistré.')).toBeInTheDocument();
    expect(saveSeaOperation).toHaveBeenCalledWith(client, expect.objectContaining({ description: 'Préparation du balisage', decision: '', vessel: expect.objectContaining({ id: '12', name: 'GOURY' }) }), undefined);
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

  it('keeps the entered preparation after a failed save and retries without creating a second local draft', async () => {
    renderAccount();
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await userEvent.type(formQueries().getByLabelText('Description de l’opération'), 'Mission conservée');
    vi.mocked(saveSeaOperation).mockRejectedValueOnce(new Error('Connexion interrompue.'));
    await saveDraft();
    expect(await formQueries().findByRole('alert')).toHaveTextContent('Connexion interrompue.');
    expect(formQueries().getByLabelText('Description de l’opération')).toHaveValue('Mission conservée');
    expect(screen.getByText('Modifications non enregistrées')).toBeInTheDocument();
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, draft) => recordFixture(captainAccount, { draft: structuredClone(draft), version: 1 }));
    await saveDraft();
    expect(await formQueries().findByText('Brouillon enregistré.')).toBeInTheDocument();
    expect(saveSeaOperation).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ description: 'Mission conservée' }), undefined);
  });

  it('reveals applicable towing, cargo, diving and supply controls and preserves answers when a section is hidden', async () => {
    renderAccount();
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await userEvent.click(stepButton(1));
    const cases = [
      ['Remorquage applicable', 'towingPlan'], ['Chargement de marchandise applicable', 'cargoLashing'],
      ['Navire de support de plongeur applicable', 'divingMedicalKit'],
    ] as const;
    for (const [label, checkId] of cases) {
      const check = SEA_OPERATION_CHECKS.find((item) => item.id === checkId)!;
      expect(screen.queryByLabelText(check.label)).not.toBeInTheDocument();
      await userEvent.selectOptions(formQueries().getByLabelText(label), 'yes');
      await userEvent.selectOptions(formQueries().getByLabelText(check.label), 'no');
      if (checkId === 'divingMedicalKit') {
        await userEvent.click(screen.getByText('Kit médical plongée prévu par le formulaire'));
        for (const item of DIVING_MEDICAL_KIT) expect(screen.getByText((text) => text.includes(item.article) && text.startsWith(`${item.quantity} ×`))).toBeInTheDocument();
      }
      await userEvent.selectOptions(formQueries().getByLabelText(label), 'no');
      expect(screen.queryByLabelText(check.label)).not.toBeInTheDocument();
      if (checkId === 'divingMedicalKit') expect(screen.queryByText('Kit médical plongée prévu par le formulaire')).not.toBeInTheDocument();
      await userEvent.selectOptions(formQueries().getByLabelText(label), 'yes');
      expect(formQueries().getByLabelText(check.label)).toHaveValue('no');
    }
    await userEvent.selectOptions(formQueries().getByLabelText('Approvisionnement / Avitaillement applicable'), 'yes');
    expect(formQueries().getByLabelText('Shipchandler')).toBeInTheDocument();
    await userEvent.selectOptions(formQueries().getByLabelText('Approvisionnement / Avitaillement applicable'), 'no');
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
    expect(await formQueries().findByRole('alert')).toHaveTextContent('NO GO automatique');
    expect(saveSeaOperation).not.toHaveBeenCalled();
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

  it('lets the server-authorized captain finalize NO GO using the newly saved revision', async () => {
    const record = recordFixture(captainAccount);
    expect(validateSeaOperation(record.draft, 'NO_GO')).toEqual([]);
    const canonicalName = 'MARTIN Camille';
    const saved = { ...record, version: 4, draft: { ...record.draft, signature: { ...record.draft.signature, captainName: canonicalName } } };
    const signed: SeaOperationRecord = { ...saved, version: 5, status: 'signed', signedBy: captainAccount.id, signedByName: captainAccount.name, signedAt: '2026-10-16T10:00:00Z', canEdit: false, canSign: false };
    const { client } = renderAccount(captainAccount, record);
    vi.mocked(saveSeaOperation).mockResolvedValue(saved);
    vi.mocked(signSeaOperation).mockResolvedValue(signed);
    await openRecord(record);
    await decisionStep();
    await userEvent.click(screen.getByRole('button', { name: 'Signer la décision NO GO' }));
    expect(await formQueries().findByText('Décision du Capitaine signée et enregistrée. La fiche est figée.')).toBeInTheDocument();
    expect(saveSeaOperation).toHaveBeenCalledWith(client, record.draft, record);
    expect(signSeaOperation).toHaveBeenCalledWith(client, saved, canonicalName, saved.draft.signature.acknowledged);
    expect(formQueries().getByLabelText('Décision')).toBeDisabled();
    expect(formQueries().getByLabelText('Projet')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Signer la décision/ })).not.toBeInTheDocument();
  });

  it('keeps a sailor preparation editable while the server denies captain signing rights', async () => {
    const record = recordFixture(sailorAccount);
    renderAccount(sailorAccount, record);
    await openRecord(record);
    await decisionStep();
    expect(formQueries().getByLabelText('Projet')).toBeEnabled();
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
    expect(await formQueries().findByRole('alert')).toHaveTextContent('La signature a été refusée par le serveur.');
    expect(formQueries().getByLabelText('Projet')).toHaveDisplayValue(record.draft.project);
    expect(formQueries().getByLabelText('Risques identifiés / informations à transmettre à l’Armement')).toHaveValue(record.draft.risks);
    expect(screen.getByRole('dialog')).toHaveTextContent(/Version 4/);
    await userEvent.click(screen.getByRole('button', { name: 'Signer la décision NO GO' }));
    await waitFor(() => expect(saveSeaOperation).toHaveBeenCalledTimes(2));
    expect(saveSeaOperation).toHaveBeenLastCalledWith(client, saved.draft, saved);
    expect(signSeaOperation).toHaveBeenLastCalledWith(client, expect.objectContaining({ version: 5 }), captainAccount.name, true);
  });

  it('opens an existing signed decision read-only regardless of stale editing permissions', async () => {
    const record = recordFixture(captainAccount, { status: 'signed', signedBy: captainAccount.id, signedByName: captainAccount.name, signedAt: '2026-10-16T10:00:00Z', canEdit: true, canSign: true });
    renderAccount(captainAccount, record);
    await openRecord(record);
    expect(formQueries().getByLabelText('Projet')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Enregistrer le brouillon' })).not.toBeInTheDocument();
    await decisionStep();
    expect(formQueries().getByLabelText('Décision')).toBeDisabled();
    expect(screen.getByText(/Décision signée par Camille MARTIN/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Signer la décision/ })).not.toBeInTheDocument();
  });

  it('keeps unsaved inputs when sidebar navigation is refused and leaves only after acceptance', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderAccount(sailorAccount);
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await userEvent.type(formQueries().getByLabelText('Description de l’opération'), 'Préparation à conserver');
    await userEvent.click(screen.getByRole('link', { name: 'Navires' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith('Quitter cette fiche sans enregistrer les modifications ?');
    expect(formQueries().getByLabelText('Description de l’opération')).toHaveValue('Préparation à conserver');
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
    await userEvent.click(stepButton(2));
    const input = formQueries().getByLabelText('ETA · date et heure · point 1');
    expect(input).toHaveValue('12:00');
    await userEvent.clear(input);
    await userEvent.type(input, eta);
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, edited) => ({ ...record, version: 4, draft: structuredClone(edited) }));
    await saveDraft();
    expect(await formQueries().findByText('Brouillon enregistré.')).toBeInTheDocument();
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
    expect(stepButton(0)).toHaveAttribute('aria-current', 'step');
    await userEvent.click(screen.getByRole('button', { name: 'Imprimer la fiche' }));
    expect(print).toHaveBeenCalledTimes(1);
    const document = within(window.document.querySelector('.so-page > .so-print')!);
    expect(document.getByText('Identité serveur Camille MARTIN')).toBeInTheDocument();
    expect(document.getByText('16/10/2026 12:00')).toBeInTheDocument();
    expect(document.getByText('Signée et figée')).toBeInTheDocument();
    expect(document.getByText(`${record.id} · Version 8`)).toBeInTheDocument();
    expect(document.getByText('SHOM 7120')).toBeInTheDocument();
    expect(document.getByText('Contact Cherbourg VHF 12')).toBeInTheDocument();
    expect(document.getByText('12:00')).toBeInTheDocument();
    expect(document.getByText(draft.risks)).toBeInTheDocument();
    expect(document.getByRole('heading', { name: /Décision du Capitaine/, hidden: true })).toBeInTheDocument();
  });

  it('recovers an unsaved preparation after unmount with its original revision and clears it after a successful save', async () => {
    const original = recordFixture(captainAccount);
    const first = renderAccount(captainAccount, original);
    await openRecord(original);
    await userEvent.clear(formQueries().getByLabelText('Description de l’opération'));
    await userEvent.type(formQueries().getByLabelText('Description de l’opération'), 'Préparation non enregistrée');
    await userEvent.click(stepButton(2));
    vi.mocked(saveSeaOperation).mockRejectedValueOnce({ message: 'Erreur serveur inconnue conservée.' });
    await saveDraft();
    expect(await formQueries().findByRole('alert')).toHaveTextContent('Erreur serveur inconnue conservée.');
    first.unmount();

    const newer = { ...original, version: 9 };
    const recovered = renderAccount(captainAccount, newer);
    expect(await screen.findByText(/Votre préparation non enregistrée a été récupérée/)).toBeInTheDocument();
    expect(formQueries().getByLabelText('Description de l’opération')).toHaveValue('Préparation non enregistrée');
    expect(stepButton(2)).toHaveAttribute('aria-current', 'step');
    vi.mocked(saveSeaOperation).mockRejectedValueOnce(new Error('L’opération a été modifiée. Rechargez-la avant de continuer.'));
    await saveDraft();
    expect(await formQueries().findByRole('alert')).toHaveTextContent('L’opération a été modifiée.');
    expect(saveSeaOperation).toHaveBeenLastCalledWith(recovered.client, expect.objectContaining({ description: 'Préparation non enregistrée' }), expect.objectContaining({ id: original.id, version: 3 }));
    expect(formQueries().getByLabelText('Description de l’opération')).toHaveValue('Préparation non enregistrée');
    let saved = newer;
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, draft) => (saved = { ...newer, version: 10, draft: structuredClone(draft) }));
    await saveDraft();
    expect(await formQueries().findByText('Brouillon enregistré.')).toBeInTheDocument();
    recovered.unmount();
    renderAccount(captainAccount, saved);
    expect(await screen.findByRole('button', { name: /Inspection de la bouée/ })).toBeInTheDocument();
    expect(screen.queryByText(/Votre préparation non enregistrée a été récupérée/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Projet')).not.toBeInTheDocument();
  });

  it('isolates local recovery by authenticated actor and company and discards it after an approved quit', async () => {
    const first = renderAccount(captainAccount);
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await userEvent.type(formQueries().getByLabelText('Description de l’opération'), 'Privé au compte et à la société');
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
    expect(await screen.findByLabelText('Description de l’opération')).toHaveValue('Privé au compte et à la société');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await userEvent.click(screen.getByRole('link', { name: 'Navires' }));
    expect(await screen.findByRole('heading', { name: 'Flotte destination' })).toBeInTheDocument();
    recovered.unmount();
    renderAccount(captainAccount);
    expect(await screen.findByText('Préparez votre première opération en mer')).toBeInTheDocument();
    expect(screen.queryByText(/Votre préparation non enregistrée a été récupérée/)).not.toBeInTheDocument();
  });
});
