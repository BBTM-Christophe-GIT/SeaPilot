import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { DisciplinaryPage } from './DisciplinaryPage';
import type { RoleKey } from '../permissions/roles';
import { getVisibleModulesForPermissions } from '../permissions/navigationPermissions';
import { canAccessModule } from '../permissions/moduleAccess';
import * as queries from './disciplinaryQueries';
import * as workflow from './disciplinaryWorkflow';
import * as launcher from '../documents/localDriveLauncher';
import { initialForm, type DisciplinaryCase } from './disciplinaryModel';

function renderPage(role: RoleKey, client = { rpc: vi.fn(), from: vi.fn() }, previewMode = false) {
  render(<MemoryRouter><Routes><Route element={<Outlet context={{ roles: [role], client, previewMode, currentPerson: { id: 9, firstName: 'Marie', lastName: 'DIRECTION', functionLabel: 'Directrice' } }} />}><Route index element={<DisciplinaryPage />} /></Route></Routes></MemoryRouter>);
  return client;
}
describe('disciplinary role and UI workflows', () => {
  it('uploads and opens a confidential attachment in SeaPilot without connecting to Windows', async () => {
    const person = { id: 9, companyId: 1, firstName: 'Luc', lastName: 'MARTIN', functionLabel: 'Matelot', postalAddress: '', hiredOn: '2024-01-01', departedOn: '', contractType: 'CDI' };
    const record = { id: '00000000-0000-4000-8000-000000000001', person_id: 9, company_id: 1, case_date: '2026-09-15',
      data: initialForm(person), letter: null, updated_at: '2026-09-15T12:00:00Z', issuer_id: 'fixture-user', workflow_status: 'draft' } as DisciplinaryCase;
    const load = vi.spyOn(queries, 'fetchDisciplinaryData').mockResolvedValue({ people: [person], cases: [record], reviewers: [], actorId: 'fixture-user' });
    const docs = vi.spyOn(queries, 'fetchDisciplinaryDocuments').mockResolvedValue([]);
    const review = vi.spyOn(workflow, 'fetchCollaboration').mockResolvedValue(workflow.EMPTY_COLLABORATION);
    const register = vi.spyOn(queries, 'registerDisciplinaryDocument').mockImplementation(async (_client, metadata) => ({ ...metadata, created_at: '2026-09-15T12:00:00Z' }));
    const connect = vi.spyOn(launcher, 'connectLocalDrive');
    const upload = vi.fn().mockResolvedValue({ error: null });
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://example/fresh' }, error: null });
    const client = { from: vi.fn(), rpc: vi.fn().mockResolvedValue({ data: { blob_pathname: 'documents/fixture', bytes: 3,
      sha256: 'a'.repeat(64), file_name: 'piece.pdf', mime_type: 'application/pdf' }, error: null }), storage: { from: () => ({ upload, createSignedUrl }) } };
    const popup = { opener: {}, location: { replace: vi.fn() }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    try {
      renderPage('direction', client);
      fireEvent.click(await screen.findByRole('button', { name: /Luc MARTIN/ }));
      fireEvent.click(screen.getByRole('tab', { name: 'Dossier et pièces' }));
      fireEvent.change(screen.getByLabelText('Ajouter des pièces jointes'), { target: { files: [new File(['PDF'], 'piece.pdf', { type: 'application/pdf' })] } });
      await screen.findByText(/pièce\(s\) enregistrée\(s\) dans SeaPilot/);
      expect(upload).toHaveBeenCalledWith(expect.any(String), expect.any(File), expect.objectContaining({ metadata: expect.objectContaining({ case_id: record.id }) }));
      expect(register).toHaveBeenCalledOnce();
      expect(upload.mock.invocationCallOrder[0]).toBeLessThan(register.mock.invocationCallOrder[0]);
      expect(connect).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le fichier' }));
      expect(open).toHaveBeenCalledWith('', '_blank');
      await waitFor(() => expect(popup.location.replace).toHaveBeenCalledWith('https://example/fresh'));
      expect(createSignedUrl).toHaveBeenCalledWith(expect.any(String), 120);
    } finally { [load, docs, review, register, connect, open].forEach(spy => spy.mockRestore()); }
  });
  it.each(['armement', 'capitaine', 'marin'] as const)('blocks the real %s profile before loading any data', (role) => {
    const client = renderPage(role);
    expect(screen.getByRole('alert')).toHaveTextContent('Accès réservé'); expect(client.rpc).not.toHaveBeenCalled(); expect(client.from).not.toHaveBeenCalled();
    expect(canAccessModule([role], 'disciplinary')).toBe(false);
    expect(getVisibleModulesForPermissions([role], [{ roleKey: role, moduleKey: 'disciplinary', isVisible: true }])).toEqual([]);
  });
  it('selects a named active collaborator, explains choices and preserves editable letter text', async () => {
    const user = userEvent.setup();
    renderPage('direction', undefined, true);
    expect(screen.queryByRole('button', { name: /Luc MARTIN/ })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Nouveau dossier' }));
    await user.click(await screen.findByRole('button', { name: /Luc MARTIN/ }));
    await user.selectOptions(screen.getByLabelText(/^Motif/), 'comportement_evocateur');
    for (const label of ['Faits observés', 'Éléments justificatifs', 'Obligations et consignes applicables', 'Modalités de la sanction']) {
      expect(screen.getByRole('textbox', { name: label })).toHaveAttribute('contenteditable', 'true');
      expect(screen.getByRole('toolbar', { name: `Mise en forme — ${label}` })).toBeInTheDocument();
    }
    const facts = screen.getByRole('textbox', { name: 'Faits observés' });
    facts.innerHTML = '<p><strong>Constat factuel de test.</strong></p><ul><li>Observation datée</li></ul>';
    fireEvent.input(facts);
    await user.click(screen.getByRole('button', { name: 'Générer le courrier' }));
    const body = screen.getByRole('textbox', { name: 'Corps du courrier modifiable' });
    expect(body.querySelector('strong')).toHaveTextContent('Constat factuel de test.');
    expect(body.querySelector('li')).toHaveTextContent('Observation datée');
    expect(body).toHaveTextContent('ne constitue pas un fondement de dépistage des stupéfiants');
    expect(screen.getByLabelText('Prénom et NOM de l’émetteur')).toHaveDisplayValue('Marie DIRECTION');
    expect(screen.getByText(`Cherbourg-en-Cotentin, le ${new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris' }).format(new Date())}`)).toBeInTheDocument();
    await user.clear(body); await user.type(body, 'Texte modifié par la direction.');
    await user.click(screen.getByRole('tab', { name: 'Dossier et pièces' }));
    expect(screen.queryByText('Google Drive synchronisé')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Choisir le dossier Google Drive' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /installer le lanceur/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Classement automatique : SeaPilot/)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Courrier modifiable' }));
    expect(screen.getByLabelText('Corps du courrier modifiable')).toHaveTextContent('Texte modifié par la direction.');
  });
});
