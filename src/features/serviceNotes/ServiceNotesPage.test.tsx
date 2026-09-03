import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { previewSupabaseClient } from '../preview/previewSupabaseClient';
import type { AppShellOutletContext } from '../shell/AppShell';
import { buildServiceNoteLinkGroups, ServiceNotesPage } from './ServiceNotesPage';
import type { ServiceNoteLinkOption } from './serviceNoteQueries';

function renderPage() {
  const context: AppShellOutletContext = {
    roles: ['admin'], client: previewSupabaseClient, previewMode: true,
    currentPerson: { id: 9301, firstName: 'Arthur', lastName: 'DEMO', functionLabel: 'Capitaine', gradeLabel: 'Capitaine 500' },
  };
  render(<MemoryRouter initialEntries={['/modules/serviceNotes']}><Routes><Route element={<Outlet context={context} />}><Route path="modules/serviceNotes" element={<ServiceNotesPage />} /></Route></Routes></MemoryRouter>);
}

describe('ServiceNotesPage', () => {
  it('shows the QHSE library and one common signing document', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Notes de Service' })).toBeInTheDocument();
    expect(screen.getByText('Couverture signatures')).toBeInTheDocument();
    fireEvent.click(screen.getByText('NS 08-26'));
    expect(await screen.findByText('Registre de signatures')).toBeInTheDocument();
    expect(screen.getByText('Signer après lecture')).toBeInTheDocument();
    const signingButton = screen.getByRole('button', { name: 'Signer la note' });
    expect(signingButton).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(signingButton).toBeEnabled();
    expect(await screen.findByAltText('Signature de Camille DURAND')).toBeInTheDocument();
  });

  it('keeps drafts in a dedicated manager-only view', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Notes de Service' });
    fireEvent.click(screen.getByRole('button', { name: /Brouillons/ }));
    expect(await screen.findByText('NS 09-26')).toBeInTheDocument();
    expect(screen.getByText('NS 07-26-KROKDUR')).toBeInTheDocument();
    expect(screen.queryByText('NS 08-26')).not.toBeInTheDocument();
  });

  it('groups internal references by their requested business hierarchy', () => {
    const options: ServiceNoteLinkOption[] = [
      { id: 1, kind: 'procedure', label: 'GEN 01-A - Manuel QHSE', description: 'Procédure QHSE', href: '/procedures/1', groupPath: ['01 - Généralités'] },
      { id: 2, kind: 'action_item', label: 'Contrôler le garde-corps', description: 'Plan d’action', href: '/actions/2', groupPath: ['GOURY', 'Non Conformité Majeure'] },
      { id: 3, kind: 'fleet_certificate', label: 'Radeau bâbord', description: 'Certificat flotte', href: '/certificates/3', groupPath: ['GOURY', '07 - LSA', '07.1 - Radeaux / HRU'] },
    ];
    const groups = buildServiceNoteLinkGroups(options);
    expect(groups.map((group) => group.label)).toEqual(['01 - Généralités', 'GOURY']);
    expect(groups[1].children.map((group) => group.label)).toEqual(['07 - LSA', 'Non Conformité Majeure']);
    expect(groups[1].children[0].children[0].options[0].label).toBe('Radeau bâbord');
  });

  it('offers an explicit draft save and full vessel or location names', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Notes de Service' });
    fireEvent.click(screen.getByRole('button', { name: /Brouillons/ }));
    fireEvent.click(screen.getByText('NS 09-26'));
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }));
    expect(await screen.findByRole('button', { name: 'Enregistrer le brouillon' })).toBeInTheDocument();
    expect(screen.getByText('Attribué lors de la diffusion')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Armement - Cherbourg' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'YARD - Le Havre' })).toBeInTheDocument();
  });

  it('shows manager-only recall, re-publication and draft deletion actions', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Notes de Service' });

    fireEvent.click(screen.getByText('NS 08-26'));
    expect(await screen.findByRole('button', { name: 'Rappeler' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Rappelées/ }));
    fireEvent.click(screen.getByText('Politique d’accès aux zones techniques'));
    expect(await screen.findByRole('heading', { name: 'Numéro supprimé' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Diffuser à nouveau' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Brouillons/ }));
    fireEvent.click(screen.getByText('NS 09-26'));
    expect(await screen.findByRole('button', { name: 'Supprimer le brouillon' })).toBeInTheDocument();
  });
});
