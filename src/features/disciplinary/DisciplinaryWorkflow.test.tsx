import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes, Link } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DisciplinaryPage } from './DisciplinaryPage';
import { DisciplinaryReviewPanel } from './DisciplinaryReviewPanel';
import { fetchDisciplinaryData, fetchDisciplinaryDocuments, saveDisciplinaryCase } from './disciplinaryQueries';
import { EMPTY_COLLABORATION, fetchCollaboration, mutateDisciplinaryCase, type Collaboration } from './disciplinaryWorkflow';
import { initialForm, generateLetter, todayParis, type DisciplinaryCase } from './disciplinaryModel';

vi.mock('./disciplinaryQueries', () => ({ fetchDisciplinaryData: vi.fn(), fetchDisciplinaryDocuments: vi.fn(), saveDisciplinaryCase: vi.fn(), registerDisciplinaryDocument: vi.fn() }));
vi.mock('./disciplinaryWorkflow', async (original) => ({ ...await original<typeof import('./disciplinaryWorkflow')>(), fetchCollaboration: vi.fn(), mutateDisciplinaryCase: vi.fn() }));
const employee = { id: 1, companyId: 1, firstName: 'Luc', lastName: 'MARTIN', functionLabel: 'Matelot', postalAddress: '1 rue du Port', hiredOn: '2024-01-01', departedOn: '', contractType: 'CDI' };
const people = [employee, { ...employee, id: 2, firstName: 'Emma', lastName: 'DURAND' }, { ...employee, id: 3, firstName: 'Ancien', lastName: 'SALARIÉ', departedOn: '2025-01-01' }];
const reviewers = [{ id: 'issuer', name: 'Marie DIRECTION', function: 'Direction', personId: null }, { id: 'reviewer', name: 'Camille ADMINISTRATION', function: 'Administration', personId: null }, { id: 'third', name: 'Jean DIRECTION', function: 'Direction', personId: null }];
const form = { ...initialForm(employee), facts: '<p>Faits observés</p>', evidence: 'Témoin', rules: 'Consigne', factsOn: todayParis(), knownOn: todayParis() };
const base: DisciplinaryCase = { id: 'case-1', company_id: 1, person_id: 1, case_date: todayParis(), updated_at: '2026-09-15T10:00:00Z', data: form, issuer_id: 'issuer', workflow_status: 'draft', letter: { ...generateLetter(form, 'notification', { name: 'Marie DIRECTION', function: 'Direction', signature: 'data:image/png;base64,AA==' }), body: '<p>Courrier relu.</p>' } };
const proposals: Collaboration = { ...EMPTY_COLLABORATION, reviews: [{ id: 'review-1', case_id: base.id, author_id: 'reviewer', author_name: 'Camille ADMINISTRATION', kind: 'change', target: 'letter', field: 'body', before_value: '<p>Ancien texte</p>', after_value: '<p><b>Nouveau texte</b><img src=x onerror=alert(1)></p>', comment: '', status: 'pending', created_at: base.updated_at, decided_at: null }] };
function page(actorId = 'issuer', rows = [base], route = '/') {
  vi.mocked(fetchDisciplinaryData).mockResolvedValue({ actorId, people, reviewers, cases: rows });
  return render(<MemoryRouter initialEntries={[route]}><Routes><Route element={<><Link to="/?case=case-1&tab=review">Ouvrir la notification de test</Link><Outlet context={{ roles: [actorId === 'reviewer' ? 'admin' : 'direction'], client: {}, previewMode: false, currentPerson: null }} /></>}><Route path="*" element={<DisciplinaryPage />} /></Route></Routes></MemoryRouter>);
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.mocked(fetchDisciplinaryDocuments).mockResolvedValue([]);
  vi.mocked(fetchCollaboration).mockResolvedValue(EMPTY_COLLABORATION);
  vi.mocked(saveDisciplinaryCase).mockImplementation(async (_client, record) => ({ ...record, updated_at: '2026-09-15T11:00:00Z' }));
  vi.mocked(mutateDisciplinaryCase).mockImplementation(async (_client, record, action, payload) => {
    const issuer = action === 'issuer' ? reviewers.find((person) => person.id === payload?.issuer_id) : undefined;
    return { ...record, issuer_id: issuer?.id || record.issuer_id, letter: action === 'new_letter' ? null : issuer && record.letter ? { ...record.letter, emitterName: issuer.name, emitterFunction: issuer.function, signatureDataUrl: '' } : record.letter, workflow_status: action === 'new_letter' ? 'draft' : action === 'validate' ? 'validated' : record.workflow_status, validated_at: '2026-09-15T11:00:00Z', updated_at: '2026-09-15T11:00:00Z' };
  });
});
describe('disciplinary cases and workflow', () => {
  it('lists only people with cases and offers active employees in New case', async () => {
    const user = userEvent.setup(); page();
    await screen.findByRole('button', { name: /Luc MARTIN/ });
    expect(screen.queryByRole('button', { name: /Emma DURAND/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Nouveau dossier' }));
    const picker = screen.getByRole('dialog');
    expect(within(picker).getByRole('button', { name: /Emma DURAND/ })).toBeInTheDocument();
    expect(within(picker).queryByRole('button', { name: /Ancien SALARIÉ/ })).not.toBeInTheDocument();
    await user.click(within(picker).getByRole('button', { name: /Emma DURAND/ }));
    expect(screen.getByLabelText('Prénom et NOM du collaborateur')).toHaveValue('Emma DURAND');
  });
  it('opens each case with only its own attachments', async () => {
    vi.mocked(fetchDisciplinaryDocuments).mockResolvedValue([{ id: 'doc-1', case_id: base.id, file_name: 'Courrier du dossier.docx', drive_path: 'Luc MARTIN - c1-p1/2026-09-15/test.docx', drive_url: '', document_date: todayParis(), kind: 'attachment', created_at: base.updated_at, letter_snapshot: null }, { id: 'doc-2', case_id: 'case-2', file_name: 'Autre dossier.pdf', drive_path: 'Luc MARTIN - c1-p1/2026-09-15/autre.pdf', drive_url: '', document_date: todayParis(), kind: 'attachment', created_at: base.updated_at, letter_snapshot: null }]);
    const user = userEvent.setup(); page('issuer', [base, { ...base, id: 'case-2', case_date: '2026-09-14' }]);
    await user.click(await screen.findByRole('button', { name: /Luc MARTIN/ }));
    expect(screen.getByRole('tab', { name: 'Dossier et pièces' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Courrier du dossier.docx')).toBeInTheDocument();
    expect(screen.queryByText('Autre dossier.pdf')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /14\/09\/2026/ }));
    expect(screen.getByText('Autre dossier.pdf')).toBeInTheDocument();
    expect(screen.queryByText('Courrier du dossier.docx')).not.toBeInTheDocument();
  });
  it('lets a reviewer edit and propose while protecting the emitter identity and validation', async () => {
    const user = userEvent.setup(); page('reviewer');
    await user.click(await screen.findByRole('button', { name: /Luc MARTIN/ }));
    await user.click(screen.getByRole('tab', { name: 'Courrier modifiable' }));
    await user.clear(screen.getByLabelText('Objet')); await user.type(screen.getByLabelText('Objet'), 'Nouvel objet');
    expect(screen.getByRole('combobox', { name: 'Prénom et NOM de l’émetteur' })).toBeEnabled();
    expect(screen.getByLabelText('Fonction de l’émetteur')).toBeDisabled();
    expect(screen.getByLabelText('Signature de l’émetteur')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Valider le courrier' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Proposer les modifications' }));
    await waitFor(() => expect(saveDisciplinaryCase).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ letter: expect.objectContaining({ subject: 'Nouvel objet' }) })));
  });
  it('locks fields after emitter validation and keeps procedure follow-up available', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup(); page();
    await user.click(await screen.findByRole('button', { name: /Luc MARTIN/ }));
    await user.click(screen.getByRole('tab', { name: 'Courrier modifiable' }));
    await user.click(screen.getByRole('button', { name: 'Valider le courrier' }));
    await waitFor(() => expect(mutateDisciplinaryCase).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: base.id }), 'validate', {}));
    expect(await screen.findByText(/La préparation et le courrier sont verrouillés/)).toBeInTheDocument();
    expect(screen.getByLabelText('Objet')).toBeDisabled();
    expect(screen.getByLabelText('Prénom et NOM de l’émetteur')).toBeDisabled();
    expect(screen.queryByRole('combobox', { name: 'Prénom et NOM de l’émetteur' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Corps du courrier modifiable' })).toHaveAttribute('contenteditable', 'false');
    await user.click(screen.getByRole('tab', { name: 'Préparation' }));
    expect(screen.getByLabelText('Adresse postale')).toBeDisabled();
    await user.click(screen.getByRole('tab', { name: 'Suivi' }));
    expect(screen.getByRole('button', { name: 'Ajouter au suivi' })).toBeEnabled();
  });
  it('starts the following letter without making an earlier validated letter editable', async () => {
    vi.mocked(fetchCollaboration).mockResolvedValue({ ...EMPTY_COLLABORATION, letters: [{ id: 'letter-1', letter: base.letter!, validated_at: base.updated_at }] });
    const user = userEvent.setup(); page('issuer', [{ ...base, workflow_status: 'validated', validated_at: base.updated_at }]);
    await user.click(await screen.findByRole('button', { name: /Luc MARTIN/ }));
    expect(await screen.findByRole('heading', { name: 'Courriers validés' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Préparer un autre courrier dans ce dossier' }));
    await waitFor(() => expect(mutateDisciplinaryCase).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: base.id }), 'new_letter', {}));
    expect(screen.getByLabelText('Adresse postale')).toBeEnabled();
    await user.click(screen.getByRole('tab', { name: 'Dossier et pièces' }));
    expect(await screen.findByRole('heading', { name: 'Courriers validés' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Télécharger ce courrier', hidden: true })).toBeInTheDocument();
  });
  it('opens the notification target directly in review', async () => {
    page('issuer', [base], '/?case=case-1&tab=review');
    expect(await screen.findByRole('heading', { name: 'Émetteur du courrier' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Relecture et partage' })).toHaveAttribute('aria-selected', 'true');
  });
  it('reloads the current case when opening the same bell link twice', async () => {
    const user = userEvent.setup(); page();
    await user.click(await screen.findByRole('button', { name: /Luc MARTIN/ }));
    for (const subject of ['Objet actualisé une fois', 'Objet actualisé deux fois']) {
      vi.mocked(fetchDisciplinaryData).mockResolvedValue({ actorId: 'issuer', people, reviewers, cases: [{ ...base, letter: { ...base.letter!, subject } }] });
      await user.click(screen.getByRole('link', { name: 'Ouvrir la notification de test' }));
      await screen.findByRole('heading', { name: 'Émetteur du courrier' });
      await user.click(screen.getByRole('tab', { name: 'Courrier modifiable' }));
      await waitFor(() => expect(screen.getByLabelText('Objet')).toHaveValue(subject));
    }
  });
  it('opens a notification for a case created after the collaborator list was loaded', async () => {
    const user = userEvent.setup(); page('issuer', []);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Nouveau dossier' })).toBeEnabled());
    vi.mocked(fetchDisciplinaryData).mockResolvedValue({ actorId: 'issuer', people, reviewers, cases: [base] });
    await user.click(screen.getByRole('link', { name: 'Ouvrir la notification de test' }));
    expect(await screen.findByRole('heading', { name: 'Émetteur du courrier' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('requires decisions on pending corrections before validation', async () => {
    vi.mocked(fetchCollaboration).mockResolvedValue(proposals);
    const user = userEvent.setup(); page();
    await user.click(await screen.findByRole('button', { name: /Luc MARTIN/ }));
    await user.click(screen.getByRole('tab', { name: 'Courrier modifiable' }));
    expect(await screen.findByRole('button', { name: 'Valider le courrier' })).toBeDisabled();
  });
});
describe('emitter picker in the letter', () => {
  async function openLetter(actorId = 'issuer', rows = [base]) {
    const user = userEvent.setup(); page(actorId, rows);
    await user.click(await screen.findByRole('button', { name: /Luc MARTIN/ }));
    await user.click(screen.getByRole('tab', { name: 'Courrier modifiable' }));
    return user;
  }
  it.each(['issuer', 'reviewer'])('lets %s select an eligible emitter and removes the previous signature', async (actorId) => {
    const user = await openLetter(actorId);
    const picker = screen.getByRole('combobox', { name: 'Prénom et NOM de l’émetteur' });
    expect(within(picker).getAllByRole('option').map((option) => option.textContent)).toEqual(reviewers.map((person) => person.name));
    await user.selectOptions(picker, 'reviewer');
    await user.click(screen.getByRole('button', { name: 'Confirmer le changement' }));
    await waitFor(() => expect(picker).toHaveDisplayValue('Camille ADMINISTRATION'));
    expect(mutateDisciplinaryCase).toHaveBeenCalledWith(expect.anything(), base, 'issuer', { issuer_id: 'reviewer' });
    expect(screen.getByLabelText('Fonction de l’émetteur')).toHaveValue('Administration');
    expect(screen.queryByRole('img', { name: 'Signature de l’émetteur' })).not.toBeInTheDocument();
    expect(saveDisciplinaryCase).not.toHaveBeenCalled();
  });
  it('saves the edited draft before transferring with the returned version', async () => {
    const user = await openLetter();
    await user.clear(screen.getByLabelText('Objet')); await user.type(screen.getByLabelText('Objet'), 'Objet à conserver');
    await user.selectOptions(screen.getByLabelText('Prénom et NOM de l’émetteur'), 'reviewer');
    await user.click(screen.getByRole('button', { name: 'Confirmer le changement' }));
    await waitFor(() => expect(mutateDisciplinaryCase).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ issuer_id: 'issuer', updated_at: '2026-09-15T11:00:00Z', letter: expect.objectContaining({ subject: 'Objet à conserver' }) }), 'issuer', { issuer_id: 'reviewer' }));
    expect(screen.getByLabelText('Objet')).toHaveValue('Objet à conserver');
  });
  it('creates a new draft under its original emitter before transferring it', async () => {
    const user = userEvent.setup(); page('issuer', []);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Nouveau dossier' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Nouveau dossier' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Luc MARTIN/ }));
    await user.click(screen.getByRole('button', { name: 'Générer le courrier' }));
    await user.selectOptions(screen.getByLabelText('Prénom et NOM de l’émetteur'), 'reviewer');
    await user.click(screen.getByRole('button', { name: 'Confirmer le changement' }));
    await waitFor(() => expect(mutateDisciplinaryCase).toHaveBeenCalled());
    expect(saveDisciplinaryCase).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ updated_at: '', issuer_id: 'issuer', letter: expect.objectContaining({ emitterName: 'Marie DIRECTION' }) }));
    expect(screen.getByLabelText('Prénom et NOM de l’émetteur')).toHaveDisplayValue('Camille ADMINISTRATION');
  });
  it('preserves administrator corrections as proposals before transferring', async () => {
    vi.mocked(saveDisciplinaryCase).mockResolvedValue({ ...base, updated_at: '2026-09-15T12:00:00Z' });
    const user = await openLetter('reviewer');
    await user.clear(screen.getByLabelText('Objet')); await user.type(screen.getByLabelText('Objet'), 'Correction proposée');
    await user.selectOptions(screen.getByLabelText('Prénom et NOM de l’émetteur'), 'third');
    await user.click(screen.getByRole('button', { name: 'Confirmer le changement' }));
    expect(await screen.findByText(/Vos corrections ont été proposées pour relecture/)).toBeInTheDocument();
    expect(saveDisciplinaryCase).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ letter: expect.objectContaining({ subject: 'Correction proposée' }) }));
    expect(mutateDisciplinaryCase).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ updated_at: '2026-09-15T12:00:00Z', letter: base.letter }), 'issuer', { issuer_id: 'third' });
  });
  it('keeps the old emitter and draft when a transfer fails', async () => {
    vi.mocked(mutateDisciplinaryCase).mockRejectedValueOnce(new Error('Version modifiée ailleurs'));
    const user = await openLetter();
    await user.selectOptions(screen.getByLabelText('Prénom et NOM de l’émetteur'), 'reviewer');
    await user.click(screen.getByRole('button', { name: 'Confirmer le changement' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Version modifiée ailleurs');
    expect(screen.getByLabelText('Prénom et NOM de l’émetteur')).toHaveDisplayValue('Marie DIRECTION');
    expect(screen.getByRole('img', { name: 'Signature de l’émetteur' })).toBeInTheDocument();
  });
  it('does not transfer if saving the current edits fails', async () => {
    vi.mocked(saveDisciplinaryCase).mockRejectedValueOnce(new Error('Enregistrement impossible'));
    const user = await openLetter();
    await user.clear(screen.getByLabelText('Objet')); await user.type(screen.getByLabelText('Objet'), 'Brouillon local');
    await user.selectOptions(screen.getByLabelText('Prénom et NOM de l’émetteur'), 'reviewer');
    await user.click(screen.getByRole('button', { name: 'Confirmer le changement' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enregistrement impossible');
    expect(mutateDisciplinaryCase).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Objet')).toHaveValue('Brouillon local');
  });
  it('allows canceling without saving or changing the signature', async () => {
    // The application confirmation can be canceled without touching the draft.
    const user = await openLetter();
    await user.selectOptions(screen.getByLabelText('Prénom et NOM de l’émetteur'), 'reviewer');
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(mutateDisciplinaryCase).not.toHaveBeenCalled();
    expect(saveDisciplinaryCase).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Prénom et NOM de l’émetteur')).toHaveDisplayValue('Marie DIRECTION');
    expect(screen.getByRole('img', { name: 'Signature de l’émetteur' })).toBeInTheDocument();
  });
  it('prevents a non-emitter Direction profile from transferring the letter', async () => {
    await openLetter('third');
    expect(screen.getByLabelText('Prénom et NOM de l’émetteur')).toBeDisabled();
    expect(screen.getByLabelText('Objet')).toBeEnabled();
    expect(mutateDisciplinaryCase).not.toHaveBeenCalled();
  });
});

describe('review and sharing panel', () => {
  it('shares with multiple recipients and displays sanitized formatting for each decision', async () => {
    const user = userEvent.setup(); const onAction = vi.fn().mockResolvedValue(true);
    render(<DisciplinaryReviewPanel record={base} reviewers={reviewers} collaboration={proposals} actorId="issuer" isAdmin={false} busy={false} onAction={onAction} />);
    await user.click(screen.getByRole('checkbox', { name: /Camille/ })); await user.click(screen.getByRole('checkbox', { name: /Jean/ }));
    await user.click(screen.getByRole('button', { name: 'Partager et notifier' }));
    expect(onAction).toHaveBeenCalledWith('share', { recipients: ['reviewer', 'third'] });
    expect(screen.getByText('Nouveau texte').tagName).toMatch(/B|STRONG/);
    expect(document.querySelector('[onerror]')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Accepter' }));
    expect(onAction).toHaveBeenCalledWith('resolve', { review_id: 'review-1', decision: 'accepted' });
    await user.click(screen.getByRole('button', { name: 'Rejeter' }));
    expect(onAction).toHaveBeenCalledWith('resolve', { review_id: 'review-1', decision: 'rejected' });
  });
  it('keeps a comment when saving fails and gives reviewers no decision buttons', async () => {
    const user = userEvent.setup(); const onAction = vi.fn().mockResolvedValue(false);
    render(<DisciplinaryReviewPanel record={base} reviewers={reviewers} collaboration={proposals} actorId="reviewer" isAdmin busy={false} onAction={onAction} />);
    expect(screen.queryByRole('button', { name: 'Accepter' })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Votre commentaire'), 'À conserver');
    await user.click(screen.getByRole('button', { name: 'Ajouter le commentaire' }));
    expect(screen.getByLabelText('Votre commentaire')).toHaveValue('À conserver');
  });
});
