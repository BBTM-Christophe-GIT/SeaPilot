import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { DisciplinaryPage } from './DisciplinaryPage';
import type { RoleKey } from '../permissions/roles';
import { getVisibleModulesForPermissions } from '../permissions/navigationPermissions';
import { canAccessModule } from '../permissions/moduleAccess';

function renderPage(role: RoleKey, client = { rpc: vi.fn(), from: vi.fn() }, previewMode = false) {
  render(<MemoryRouter><Routes><Route element={<Outlet context={{ roles: [role], client, previewMode, currentPerson: { id: 9, firstName: 'Marie', lastName: 'DIRECTION', functionLabel: 'Directrice' } }} />}><Route index element={<DisciplinaryPage />} /></Route></Routes></MemoryRouter>);
  return client;
}
describe('disciplinary role and UI workflows', () => {
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
    expect(screen.getByLabelText('Prénom et NOM de l’émetteur')).toHaveValue('Marie DIRECTION');
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
