import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptySeaOperation, DIVING_MEDICAL_KIT, SEA_OPERATION_CHECKS, seaOperationToday, validateSeaOperation, type SeaOperationPayload } from './seaOperationModel';
import { fetchSeaOperationCaptainSignature, fetchSeaOperationData, fetchSeaOperationDetail, fetchSeaOperationPlanning, loadSeaOperationSignature, saveSeaOperation, signSeaOperation, type SeaOperationData, type SeaOperationPlanningContext, type SeaOperationPlanningChoice, type SeaOperationRecord } from './seaOperationQueries';
import { exportSeaOperationPdf } from './seaOperationPdf';
import { SeaOperationsPage } from './SeaOperationsPage';
import { fetchSeaOperationProjectDocuments } from './seaOperationDocumentQueries';

const weatherPanelMock = vi.hoisted(() => vi.fn());
const chartsPanelMock = vi.hoisted(() => vi.fn());

vi.mock('./seaOperationQueries', () => ({
  fetchSeaOperationData: vi.fn(), fetchSeaOperationDetail: vi.fn(), saveSeaOperation: vi.fn(), signSeaOperation: vi.fn(),
  fetchSeaOperationPlanning: vi.fn(), fetchSeaOperationCaptainSignature: vi.fn(), loadSeaOperationSignature: vi.fn().mockResolvedValue(null),
}));
vi.mock('./seaOperationPdf', () => ({ exportSeaOperationPdf: vi.fn() }));
vi.mock('./seaOperationDocumentQueries', () => ({ fetchSeaOperationProjectDocuments: vi.fn(), createSeaOperationProjectDocumentUrl: vi.fn() }));
vi.mock('./SeaOperationWeatherPanel', () => ({ SeaOperationWeatherPanel: (props: Record<string, unknown>) => { weatherPanelMock(props); return null; } }));
vi.mock('./SeaOperationChartsPanel', () => ({ SeaOperationChartsPanel: (props: Record<string, unknown>) => { chartsPanelMock(props); return <div data-testid="sea-charts-panel" />; } }));

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

function renderAccount(account: Account = captainAccount, record?: SeaOperationRecord, companyId = 1, choices: SeaOperationPlanningChoice[] = [], previewMode = false) {
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
  vi.mocked(fetchSeaOperationProjectDocuments).mockResolvedValue([]);
  if (record) vi.mocked(fetchSeaOperationDetail).mockResolvedValue(record);
  const view = render(<MemoryRouter initialEntries={['/modules/seaOperations']}><Routes>
    <Route element={<><nav aria-label="Navigation principale"><Link to="/modules/fleet">Navires</Link></nav><Outlet context={{ client, previewMode }} /></>}>
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
const choiceQueries = (label: string) => within(formQueries().getByRole('group', { name: label }));
const optionLabels: Record<string, string> = { yes: 'Oui', no: 'Non', nomade: 'NOMADE', email: 'Mail à la Capitainerie', armament: 'Armement', captain: 'Capitaine', agent: 'Agent consignataire', sms: 'Pas de mesures autres que le SMS', specific: 'Mesures spécifiques prises', GO: 'GO · la mission peut être réalisée', NO_GO: 'NO GO · la mission ne peut être réalisée' };
const choiceInput = (label: string, value: string) => choiceQueries(label).getByRole('checkbox', { name: optionLabels[value] });
const answerInput = (label: string) => formQueries().getByRole('switch', { name: label });
async function selectChoice(label: string, value: string) {
  if (value === 'yes' || value === 'no') {
    if (value === 'no' && answerInput(label).textContent === 'À vérifier') await userEvent.click(answerInput(label));
    if (answerInput(label).getAttribute('aria-checked') !== String(value === 'yes')) await userEvent.click(answerInput(label));
    return;
  }
  const input = choiceInput(label, value);
  if (!(input as HTMLInputElement).checked) await userEvent.click(input);
}
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
  it('prefills new binary controls with Oui while leaving the decision and final attestation explicit', async () => {
    renderAccount();
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await userEvent.click(stepButton(1));
    expect(formQueries().getAllByRole('switch')).toHaveLength(SEA_OPERATION_CHECKS.length + 6);
    for (const control of formQueries().getAllByRole('switch')) {
      expect(control).toBeChecked();
      expect(control).toHaveTextContent('Oui');
    }
    expect(formQueries().getByText(/Réponses préremplies : à vérifier avant signature/)).toBeVisible();
    await decisionStep();
    expect(choiceInput('Décision', 'GO')).not.toBeChecked();
    expect(choiceInput('Décision', 'NO_GO')).not.toBeChecked();
    expect(formQueries().getByRole('checkbox', { name: /En qualité de Capitaine/ })).not.toBeChecked();
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

  it('passes the selected project and live route to the weather panel and displays only the vessel reference draught', async () => {
    const [mission] = plannedMissions();
    const draft = noGoDraft();
    draft.project = mission.project;
    draft.planning = { date: seaOperationToday(), operationId: mission.operationId, projectId: mission.projectId, captainPersonId: mission.captains[0].personId };
    draft.waypoints = [{ id: 'weather-point', number: '1', descriptionVhf: '', latitude: '', longitude: '', ukc: '', eta: '', denseTraffic: false }];
    const record = recordFixture(captainAccount, { draft });
    const { client, data } = renderAccount(captainAccount, record, 1, [mission], true);
    data.vessels[0].draftMeters = 2.65;
    await openRecord(record);
    expect(weatherPanelMock).toHaveBeenLastCalledWith(expect.objectContaining({ client, projectId: mission.projectId, preview: true, active: false, waypoints: draft.waypoints }));
    await userEvent.click(stepButton(2));
    expect(formQueries().getByLabelText('Tirant d’eau de référence (m)')).toHaveValue(2.65);
    expect(formQueries().getByLabelText('Tirant d’eau de référence (m)')).toHaveAttribute('readonly');
    expect(formQueries().queryByText(/Renseignez le tirant d’eau/)).not.toBeInTheDocument();
    fireEvent.change(formQueries().getByLabelText('Latitude · point 1'), { target: { value: '49.65' } });
    fireEvent.change(formQueries().getByLabelText('Longitude · point 1'), { target: { value: '-1.62' } });
    fireEvent.change(formQueries().getByLabelText('ETA · date et heure · point 1'), { target: { value: '2026-10-22T14:30' } });
    expect(weatherPanelMock).toHaveBeenLastCalledWith(expect.objectContaining({ client, projectId: mission.projectId, preview: true, active: true, waypoints: [expect.objectContaining({ latitude: '49.65', longitude: '-1.62', eta: '2026-10-22T14:30' })] }));
    expect(chartsPanelMock).toHaveBeenLastCalledWith(expect.objectContaining({ client, projectId: mission.projectId, preview: true, active: true, canEdit: true, charts: draft.charts, waypoints: [expect.objectContaining({ latitude: '49.65', longitude: '-1.62' })] }));
    expect(saveSeaOperation).not.toHaveBeenCalled();
  });

  it('leaves a missing vessel draught blank and directs the user to the vessel record', async () => {
    renderAccount();
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await userEvent.selectOptions(formQueries().getByLabelText('Navire'), '12');
    await userEvent.click(stepButton(2));
    expect(formQueries().getByLabelText('Tirant d’eau de référence (m)')).toHaveValue(null);
    expect(formQueries().getByText('Renseignez le tirant d’eau du navire dans le module Navires.')).toBeVisible();
  });

  it('keeps the SHOM consultation outside disabled signed fields and forbids adding references', async () => {
    const record = recordFixture(captainAccount, { status: 'signed', canEdit: false, canSign: false, signedBy: captainAccount.id, signedByName: captainAccount.name, signedAt: '2026-10-16T09:15:00Z' });
    renderAccount(captainAccount, record);
    await openRecord(record);
    await userEvent.click(stepButton(2));
    expect(chartsPanelMock).toHaveBeenLastCalledWith(expect.objectContaining({ canEdit: false }));
    expect(formQueries().getByTestId('sea-charts-panel').closest('fieldset')).toBeNull();
    expect(formQueries().getByLabelText('Numéro de la ou des cartes marines')).toBeDisabled();
    expect(saveSeaOperation).not.toHaveBeenCalled();
  });

  it('repairs an incomplete draft captain identity from Planning and requires its attestation again', async () => {
    const mission = plannedMissions()[0];
    const draft = noGoDraft();
    draft.project = mission.project;
    draft.planning = { date: seaOperationToday(), operationId: mission.operationId, projectId: mission.projectId, captainPersonId: mission.captains[0].personId };
    draft.vessel.captainName = '';
    draft.signature.captainName = '';
    const record = recordFixture(captainAccount, { draft });
    const { client } = renderAccount(captainAccount, record, 1, [mission]);
    await openRecord(record);
    await waitFor(() => expect(formQueries().getByLabelText('Prénom NOM du Capitaine')).toHaveValue(mission.captains[0].name));
    await decisionStep();
    expect(formQueries().getByLabelText('Prénom NOM du Capitaine signataire')).toHaveValue(mission.captains[0].name);
    expect(formQueries().getByLabelText('Prénom NOM du Capitaine signataire')).toHaveAttribute('readonly');
    expect(formQueries().getByRole('checkbox', { name: /En qualité de Capitaine/ })).not.toBeChecked();
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, edited) => ({ ...record, draft: edited, version: 4 }));
    await saveDraft();
    expect(await formQueries().findByText('Brouillon enregistré.')).toBeInTheDocument();
    expect(saveSeaOperation).toHaveBeenCalledWith(client, expect.objectContaining({ signature: expect.objectContaining({ captainName: mission.captains[0].name, acknowledged: false }) }), record);
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

  it('preserves signed historical identity, answers and time-only ETA when today’s Planning has another captain', async () => {
    const mission = plannedMissions()[0];
    const draft = noGoDraft();
    draft.project = mission.project;
    draft.planning = { date: seaOperationToday(), operationId: mission.operationId, projectId: mission.projectId, captainPersonId: mission.captains[0].personId };
    draft.signature.captainName = 'Capitaine historique signé';
    draft.checks.weather = 'no';
    draft.waypoints = [{ id: 'historic-point', number: '1', descriptionVhf: 'Ancien descriptif VHF conservé', latitude: '49 N', longitude: '001 W', ukc: '2 m', eta: '12:00', denseTraffic: false }];
    const record = recordFixture(captainAccount, { draft, status: 'signed', canEdit: false, canSign: false });
    renderAccount(captainAccount, record, 1, [mission]);
    await openRecord(record);
    await userEvent.click(stepButton(1));
    expect(answerInput('Les conditions météo sont conformes aux limites opérationnelles définies')).not.toBeChecked();
    expect(answerInput('Les conditions météo sont conformes aux limites opérationnelles définies')).toBeDisabled();
    await userEvent.click(stepButton(2));
    expect(formQueries().getByText(/Ancienne ETA : 12:00/)).toBeVisible();
    expect(formQueries().getByRole('button', { name: 'Appliquer la date de l’opération à l’ETA du point 1' })).toBeDisabled();
    expect(formQueries().getByLabelText('Description · point 1')).toHaveValue('Ancien descriptif VHF conservé');
    await decisionStep();
    expect(formQueries().getByLabelText('Prénom NOM du Capitaine signataire')).toHaveValue('Capitaine historique signé');
    expect(fetchSeaOperationPlanning).not.toHaveBeenCalled();
    expect(saveSeaOperation).not.toHaveBeenCalled();
    expect(signSeaOperation).not.toHaveBeenCalled();
  });

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
    await selectChoice('Décision', 'NO_GO');
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
    await selectChoice('Décision', 'NO_GO');
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
    fireEvent.change(formQueries().getByLabelText('Description de l’opération'), { target: { value: 'Saisie conservée pendant le chargement' } });
    await userEvent.click(stepButton(1));
    await selectChoice('Les conditions météo sont conformes aux limites opérationnelles définies', 'no');
    await act(async () => context.resolve({ date: seaOperationToday(), choices: [choice] }));
    await userEvent.click(stepButton(0));
    expect(formQueries().getByLabelText('Projet')).toHaveValue('');
    expect(formQueries().getByLabelText('Description de l’opération')).toHaveValue('Saisie conservée pendant le chargement');
    await userEvent.click(stepButton(1));
    expect(answerInput('Les conditions météo sont conformes aux limites opérationnelles définies')).not.toBeChecked();
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
    await userEvent.click(stepButton(1));
    expect(answerInput('Les conditions météo sont conformes aux limites opérationnelles définies')).not.toBeChecked();
    await userEvent.click(stepButton(2));
    expect(formQueries().getByLabelText('Numéro de la ou des cartes marines')).toHaveValue('Carte historique');
    await decisionStep();
    expect(choiceInput('Décision', 'NO_GO')).toBeChecked();
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, saved) => ({ ...record, draft: structuredClone(saved), version: 4 }));
    await saveDraft();
    expect(await formQueries().findByText('Brouillon enregistré.')).toBeInTheDocument();
    expect(saveSeaOperation).toHaveBeenCalledWith(client, draft, record);
  });

  it('resets safety approvals, passage points and signature acknowledgment when the mission changes', async () => {
    const choices = plannedMissions();
    const draft = noGoDraft();
    draft.project = choices[0].project;
    draft.planning = { date: seaOperationToday(), operationId: choices[0].operationId, projectId: choices[0].projectId, captainPersonId: choices[0].captains[0].personId };
    draft.dapaq = { method: 'nomade', preparedBy: 'captain', agentName: '', agentContact: '' };
    draft.specialPersonnel = [{ name: 'Personne de la première mission', phone: '0100000000' }];
    draft.applicability = { towing: 'no', cargo: 'no', divingSupport: 'no', supplies: 'no' };
    draft.checks.weather = 'no';
    draft.checks.cargoLashing = 'no';
    draft.charts = 'SHOM 7120';
    draft.waypoints = [{ id: 'old-point', number: '1', descriptionVhf: 'Ancien point', latitude: '49 N', longitude: '001 W', ukc: '2 m', eta: '2026-10-22T12:00', denseTraffic: false }];
    draft.portServices = ['towing'];
    draft.supplies = { ...draft.supplies, delegated: 'no', suppliers: 'Ancien fournisseur', items: ['provisions'] };
    const record = recordFixture(captainAccount, { draft });
    const { client } = renderAccount(captainAccount, record, 1, choices);
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, edited) => ({ ...record, draft: structuredClone(edited), version: 4 }));
    await openRecord(record);
    await chooseMission(choices[1]);
    await saveDraft();
    expect(await formQueries().findByText('Brouillon enregistré.')).toBeInTheDocument();
    expect(saveSeaOperation).toHaveBeenCalledWith(client, expect.objectContaining({
      project: choices[1].project, charts: '', waypoints: [], specialPersonnel: [], decision: '', risks: '', portServices: [],
      checks: expect.objectContaining({ weather: 'yes', cargoLashing: 'yes' }),
      applicability: { towing: 'yes', cargo: 'yes', divingSupport: 'yes', supplies: 'yes' },
      dapaq: { method: '', preparedBy: '', agentName: '', agentContact: '' },
      supplies: expect.objectContaining({ delegated: 'yes', suppliers: '', items: [] }),
      signature: { captainName: choices[1].captains[0].name, date: seaOperationToday(), place: 'Caen', acknowledged: false },
    }), record);
  });

  it('uses one accessible binary switch per question and an editable responsive Passage Plan', async () => {
    renderAccount();
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await userEvent.click(stepButton(1));
    const question = 'Les conditions météo sont conformes aux limites opérationnelles définies';
    expect(formQueries().getAllByRole('switch', { name: question })).toHaveLength(1);
    expect(answerInput(question)).toBeChecked();
    expect(answerInput(question)).toHaveTextContent('Oui');
    await userEvent.click(answerInput(question));
    expect(answerInput(question)).not.toBeChecked();
    expect(answerInput(question)).toHaveTextContent('Non');
    expect(formQueries().getByLabelText('Justification — Les conditions météo sont conformes aux limites opérationnelles définies')).toBeInTheDocument();
    await userEvent.keyboard('[Space]');
    expect(answerInput(question)).toBeChecked();
    expect(formQueries().queryByLabelText(`Justification — ${question}`)).not.toBeInTheDocument();
    const yesOnly = 'Vivres en quantité suffisante';
    expect(answerInput(yesOnly)).toBeChecked();
    await userEvent.click(answerInput(yesOnly));
    expect(answerInput(yesOnly)).not.toBeChecked();
    expect(answerInput(yesOnly)).toHaveTextContent('Non');
    await userEvent.click(stepButton(2));
    const table = formQueries().getByRole('table', { name: 'Points de passage' });
    expect(within(table).getByText('Ajoutez le premier point de passage.')).toBeInTheDocument();
    await userEvent.click(formQueries().getByRole('button', { name: 'Ajouter un point de passage' }));
    expect(within(table).getAllByRole('row')).toHaveLength(1);
    expect(table).toHaveClass('so-passage-grid');
    expect(formQueries().queryByLabelText(/Description.*VHF/)).not.toBeInTheDocument();
    await userEvent.type(formQueries().getByLabelText('Description · point 1'), 'Entrée du chenal');
    await userEvent.click(formQueries().getByRole('checkbox', { name: 'Zone maritime à trafic dense · point 1' }));
    expect(formQueries().getByLabelText('Description · point 1')).toHaveValue('Entrée du chenal');
    expect(formQueries().getByLabelText('ETA · date et heure · point 1')).toHaveAttribute('type', 'datetime-local');
    expect(formQueries().getByRole('checkbox', { name: 'Zone maritime à trafic dense · point 1' })).toBeChecked();
    await userEvent.click(formQueries().getByRole('button', { name: 'Supprimer le point 1' }));
    expect(within(table).getByText('Ajoutez le premier point de passage.')).toBeInTheDocument();
  });

  it('keeps explicit DAPAQ and safety choices clearable while binary boarding and shipchandler switches stay Oui or Non', async () => {
    const { client } = renderAccount();
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, draft) => recordFixture(captainAccount, { draft, version: 1 }));
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await selectChoice('Mode de déclaration', 'email');
    await selectChoice('Préparée par', 'agent');
    expect(formQueries().getByLabelText('Nom de l’agent consignataire')).toBeVisible();
    await selectChoice('Mode de déclaration', 'nomade');
    expect(choiceInput('Mode de déclaration', 'email')).not.toBeChecked();
    expect(choiceQueries('Préparée par').queryByRole('checkbox', { name: 'Agent consignataire' })).not.toBeInTheDocument();
    expect(formQueries().queryByLabelText('Nom de l’agent consignataire')).not.toBeInTheDocument();
    await selectChoice('Préparée par', 'armament');
    await selectChoice('Préparée par', 'captain');
    expect(choiceInput('Préparée par', 'armament')).not.toBeChecked();
    await userEvent.click(choiceInput('Préparée par', 'captain'));
    await userEvent.click(choiceInput('Mode de déclaration', 'nomade'));
    await userEvent.click(stepButton(1));
    await selectChoice('Remorquage applicable', 'yes');
    await selectChoice('Embarquement sur le remorqué', 'yes');
    await selectChoice('Mesures de sécurité sur le remorqué', 'specific');
    expect(formQueries().getByLabelText('Ronde de sécurité, zones dangereuses et mesures prises')).toBeVisible();
    await selectChoice('Mesures de sécurité sur le remorqué', 'sms');
    expect(choiceInput('Mesures de sécurité sur le remorqué', 'specific')).not.toBeChecked();
    expect(formQueries().queryByLabelText('Ronde de sécurité, zones dangereuses et mesures prises')).not.toBeInTheDocument();
    await userEvent.click(choiceInput('Mesures de sécurité sur le remorqué', 'sms'));
    await selectChoice('Embarquement sur le remorqué', 'no');
    expect(answerInput('Embarquement sur le remorqué')).not.toBeChecked();
    await userEvent.click(answerInput('Embarquement sur le remorqué'));
    await selectChoice('Approvisionnement / Avitaillement applicable', 'yes');
    await selectChoice('Shipchandler', 'yes');
    expect(formQueries().getByLabelText('Nom du shipchandler')).toBeVisible();
    await selectChoice('Shipchandler', 'no');
    expect(answerInput('Shipchandler')).not.toBeChecked();
    expect(formQueries().queryByLabelText('Nom du shipchandler')).not.toBeInTheDocument();
    await userEvent.click(answerInput('Shipchandler'));
    await decisionStep();
    await selectChoice('Décision', 'NO_GO');
    await userEvent.click(choiceInput('Décision', 'NO_GO'));
    await saveDraft();
    expect(await formQueries().findByText('Brouillon enregistré.')).toBeInTheDocument();
    expect(saveSeaOperation).toHaveBeenCalledWith(client, expect.objectContaining({
      dapaq: expect.objectContaining({ method: '', preparedBy: '' }), decision: '',
      towedVesselBoarding: expect.objectContaining({ required: 'yes', measures: '' }), supplies: expect.objectContaining({ delegated: 'yes' }),
    }), undefined);
  });

  it('shows every full safety question and its explanatory text alongside its switch', async () => {
    renderAccount();
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une opération' }));
    await userEvent.click(stepButton(1));
    for (const label of ['Remorquage applicable', 'Chargement de marchandise applicable', 'Navire de support de plongeur applicable', 'Approvisionnement / Avitaillement applicable']) await selectChoice(label, 'yes');
    for (const check of SEA_OPERATION_CHECKS) {
      expect(answerInput(check.label)).toBeVisible();
      expect(formQueries().getByText(check.label, { selector: 'span' })).toBeVisible();
      expect(answerInput(check.label)).toBeChecked();
      if (check.help) expect(formQueries().getByText(check.help)).toBeVisible();
      if (check.yesLabel) expect(formQueries().getByText(check.yesLabel)).toBeVisible();
    }
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
    expect(formQueries().getByRole('region', { name: 'Passage Plan' })).toBeVisible();
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
    expect(formQueries().getByRole('region', { name: 'Passage Plan' })).toBeVisible();
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
    const heading = formQueries().getByRole('heading', { name: 'Passage Plan' });
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
    expect(choiceInput('Décision', 'NO_GO')).toBeDisabled();
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
      await selectChoice(label, 'no');
      expect(formQueries().queryByRole('switch', { name: check.label })).not.toBeInTheDocument();
      await selectChoice(label, 'yes');
      await selectChoice(check.label, 'no');
      if (checkId === 'divingMedicalKit') {
        await userEvent.click(screen.getByText('Kit médical plongée prévu par le formulaire'));
        for (const item of DIVING_MEDICAL_KIT) expect(screen.getByText((text) => text.includes(item.article) && text.startsWith(`${item.quantity} ×`))).toBeInTheDocument();
      }
      await selectChoice(label, 'no');
      expect(formQueries().queryByRole('switch', { name: check.label })).not.toBeInTheDocument();
      if (checkId === 'divingMedicalKit') expect(screen.queryByText('Kit médical plongée prévu par le formulaire')).not.toBeInTheDocument();
      await selectChoice(label, 'yes');
      expect(answerInput(check.label)).not.toBeChecked();
    }
    await selectChoice('Approvisionnement / Avitaillement applicable', 'yes');
    expect(answerInput('Shipchandler')).toBeInTheDocument();
    await selectChoice('Approvisionnement / Avitaillement applicable', 'no');
    expect(formQueries().queryByRole('switch', { name: 'Shipchandler' })).not.toBeInTheDocument();
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
    expect(choiceInput('Décision', 'GO')).toBeDisabled();
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
    expect(choiceInput('Décision', 'NO_GO')).toBeDisabled();
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
    const draft = noGoDraft();
    draft.applicability = { towing: 'yes', cargo: 'yes', divingSupport: 'yes', supplies: 'yes' };
    draft.towedVesselBoarding.required = 'yes';
    const record = recordFixture(captainAccount, { draft, status: 'signed', signedBy: captainAccount.id, signedByName: captainAccount.name, signedAt: '2026-10-16T10:00:00Z', canEdit: true, canSign: true });
    renderAccount(captainAccount, record);
    await openRecord(record);
    expect(formQueries().getByLabelText('Projet')).toBeDisabled();
    for (const input of [...choiceQueries('Mode de déclaration').getAllByRole('checkbox'), ...choiceQueries('Préparée par').getAllByRole('checkbox')]) expect(input).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Enregistrer le brouillon' })).not.toBeInTheDocument();
    await userEvent.click(stepButton(1));
    for (const input of formQueries().getAllByRole('checkbox')) expect(input).toBeDisabled();
    for (const input of formQueries().getAllByRole('switch')) expect(input).toBeDisabled();
    await decisionStep();
    expect(choiceInput('Décision', 'NO_GO')).toBeDisabled();
    expect(screen.getByText(/Décision signée par Camille MARTIN/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Signer la décision/ })).not.toBeInTheDocument();
  });

  it('loads only the selected project documents and leaves them consultable on a signed operation', async () => {
    const mission = plannedMissions()[0];
    const draft = noGoDraft();
    draft.project = mission.project;
    draft.planning = { date: seaOperationToday(), projectId: mission.projectId, operationId: mission.operationId, captainPersonId: mission.captains[0].personId };
    const record = recordFixture(captainAccount, { draft, status: 'signed', canEdit: false, canSign: false });
    const { client } = renderAccount(captainAccount, record, 1, plannedMissions());
    vi.mocked(fetchSeaOperationProjectDocuments).mockResolvedValue([{ id: 'project:101', projectId: mission.projectId, title: 'Plan de prévention autorisé', fileName: 'prevention.pdf', mimeType: 'application/pdf', categoryLabel: 'Sécurité', subcategoryLabel: '', createdAt: '2026-10-22T08:00:00Z', expiresOn: null }]);
    await openRecord(record);
    await userEvent.click(formQueries().getByText('Documents du projet'));
    expect(await formQueries().findByRole('button', { name: 'Ouvrir : Plan de prévention autorisé' })).toBeEnabled();
    expect(fetchSeaOperationProjectDocuments).toHaveBeenCalledWith(client, mission.projectId);
    expect(formQueries().getByLabelText('Projet')).toBeDisabled();
    expect(formQueries().queryByText(/Offre commerciale|Facturation/)).not.toBeInTheDocument();
    await userEvent.click(stepButton(1));
    expect(formQueries().queryByText('Documents du projet')).not.toBeInTheDocument();
    expect(saveSeaOperation).not.toHaveBeenCalled();
    expect(signSeaOperation).not.toHaveBeenCalled();
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

  it('preserves a legacy time-only ETA until its operation date is explicitly applied', async () => {
    const draft = noGoDraft();
    draft.planning = { date: '2026-10-16', operationId: '', projectId: '', captainPersonId: '' };
    draft.waypoints = [{ id: 'point-server-id', number: '1', descriptionVhf: 'Entrée du chenal', latitude: '49 N', longitude: '001 W', ukc: '2 m', eta: '12:00', denseTraffic: false }];
    const record = recordFixture(captainAccount, { draft });
    const { client } = renderAccount(captainAccount, record);
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, edited) => ({ ...record, version: 4, draft: structuredClone(edited) }));
    await openRecord(record);
    await userEvent.click(stepButton(2));
    const input = formQueries().getByLabelText('ETA · date et heure · point 1');
    expect(input).toHaveAttribute('type', 'datetime-local');
    expect(input).toHaveValue('');
    expect(formQueries().getByText(/Ancienne ETA : 12:00/)).toBeVisible();
    await saveDraft();
    expect(await formQueries().findByText('Brouillon enregistré.')).toBeInTheDocument();
    expect(saveSeaOperation).toHaveBeenLastCalledWith(client, expect.objectContaining({ waypoints: [expect.objectContaining({ eta: '12:00' })] }), record);
    await userEvent.click(formQueries().getByRole('button', { name: 'Appliquer la date de l’opération à l’ETA du point 1' }));
    expect(input).toHaveValue('2026-10-16T12:00');
    expect(formQueries().queryByText(/Ancienne ETA/)).not.toBeInTheDocument();
    await saveDraft();
    expect(await formQueries().findByText('Brouillon enregistré.')).toBeInTheDocument();
    expect(saveSeaOperation).toHaveBeenLastCalledWith(client, expect.objectContaining({ waypoints: [expect.objectContaining({ eta: '2026-10-16T12:00' })] }), expect.objectContaining({ version: 4 }));
  });

  it('loads and saves a waypoint ETA containing a full date and time', async () => {
    const draft = noGoDraft();
    draft.waypoints = [{ id: 'point-server-id', number: '1', descriptionVhf: 'Entrée du chenal', latitude: '49 N', longitude: '001 W', ukc: '2 m', eta: '2026-10-16T12:00', denseTraffic: false }];
    const record = recordFixture(captainAccount, { draft });
    const { client } = renderAccount(captainAccount, record);
    await openRecord(record);
    await userEvent.click(stepButton(2));
    const input = formQueries().getByLabelText('ETA · date et heure · point 1');
    expect(input).toHaveValue('2026-10-16T12:00');
    fireEvent.change(input, { target: { value: '2026-10-17T14:45' } });
    vi.mocked(saveSeaOperation).mockImplementation(async (_client, edited) => ({ ...record, version: 4, draft: structuredClone(edited) }));
    await saveDraft();
    expect(await formQueries().findByText('Brouillon enregistré.')).toBeInTheDocument();
    expect(saveSeaOperation).toHaveBeenCalledWith(client, expect.objectContaining({ waypoints: [expect.objectContaining({ eta: '2026-10-17T14:45' })] }), record);
    expect(input).toHaveValue('2026-10-17T14:45');
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
