import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { previewSupabaseClient } from '../preview/previewSupabaseClient';
import type { AppShellOutletContext } from '../shell/AppShell';
import { buildServiceNoteLinkGroups, groupServiceNotesByYear, groupServiceNotesByYearAndVessel, resolveServiceNoteAudiencePeople, ServiceNotesPage } from './ServiceNotesPage';
import type { ServiceNote, ServiceNoteLinkOption } from './serviceNoteQueries';

function renderPage(roles: AppShellOutletContext['roles'] = ['admin']) {
  const context: AppShellOutletContext = {
    roles, client: previewSupabaseClient, previewMode: true,
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
    expect(screen.getByText('1 signature manquante')).toBeInTheDocument();
    expect(screen.getAllByText(/Luc MARTIN/).length).toBeGreaterThan(0);
    expect(screen.queryByText('Signer après lecture')).not.toBeInTheDocument();
    expect(await screen.findByAltText('Signature de Camille DURAND')).toBeInTheDocument();
    expect(screen.getByText('Signé le : 01/09/2026')).toBeInTheDocument();
    expect(screen.queryByText(/Signé le\s*Non renseignée/)).not.toBeInTheDocument();
    expect(screen.queryByText('Lecture et signature obligatoires')).not.toBeInTheDocument();
    expect(screen.queryByText(/Document généré par SeaPilot/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Télécharger le PDF' })).toBeInTheDocument();
  });

  it('keeps drafts in a dedicated manager-only view', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Notes de Service' });
    fireEvent.click(screen.getByRole('button', { name: /Brouillons/ }));
    expect(await screen.findByText('Organisation des exercices trimestriels')).toBeInTheDocument();
    expect(screen.getByText('Mise à jour du DUP de KROKDUR')).toBeInTheDocument();
    expect(screen.getAllByText('Numéro à la diffusion')).toHaveLength(2);
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
    fireEvent.click(screen.getByText('Organisation des exercices trimestriels'));
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }));
    expect(await screen.findByRole('button', { name: 'Enregistrer le brouillon' })).toBeInTheDocument();
    expect(screen.getAllByText('Attribué lors de la diffusion')).toHaveLength(2);
    expect(screen.getByRole('toolbar', { name: 'Mise en forme du message' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Police' })).toHaveValue('Aptos');
    expect(screen.getByRole('button', { name: 'Gras' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Liste à puces' })).toBeInTheDocument();
    expect(await screen.findByRole('radio', { name: /Un ou plusieurs navires/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Un ou plusieurs navires/ }));
    expect(await screen.findByText('Armement - Cherbourg')).toBeInTheDocument();
    expect(screen.getByText('YARD - Le Havre')).toBeInTheDocument();
    expect(screen.getByText('Personne(s) ajoutée(s)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /GOURY/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Camille DURAND/ }));
    expect(screen.getByText('3 destinataires')).toBeInTheDocument();
    expect(screen.getByText('GOURY + 1 personne ajoutée')).toBeInTheDocument();
  });

  it('unites vessel planning recipients with explicitly selected people', () => {
    const people = [
      { id: 1, firstName: 'Luc', lastName: 'MARTIN', functionLabel: 'Marin', hiredOn: '2022-01-01', departedOn: '', vesselIds: [10], hasAccount: true, isAuthor: false },
      { id: 2, firstName: 'Hugo', lastName: 'BERNARD', functionLabel: 'Marin', hiredOn: '2022-01-01', departedOn: '', vesselIds: [10], hasAccount: true, isAuthor: false },
      { id: 3, firstName: 'Camille', lastName: 'DURAND', functionLabel: 'Direction', hiredOn: '2020-01-01', departedOn: '', vesselIds: [20], hasAccount: true, isAuthor: false },
      { id: 4, firstName: 'Clément', lastName: 'DEROBERT', functionLabel: 'Marin', hiredOn: '2024-01-01', departedOn: '', vesselIds: [10], hasAccount: false, isAuthor: false },
      { id: 5, firstName: 'Arthur', lastName: 'DEMO', functionLabel: 'Capitaine', hiredOn: '2020-01-01', departedOn: '', vesselIds: [10], hasAccount: true, isAuthor: true },
    ];
    expect(resolveServiceNoteAudiencePeople('vessels', people, [10], [1, 3]).map((person) => person.id)).toEqual([1, 2, 3]);
  });

  it('shows only active account holders in the nominative selector', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Notes de Service' });
    fireEvent.click(screen.getByRole('button', { name: /Brouillons/ }));
    fireEvent.click(screen.getByText('Organisation des exercices trimestriels'));
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }));
    expect(await screen.findByText('4 comptes éligibles')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Liste de personnes/ }));
    expect(screen.getByText('Camille DURAND')).toBeInTheDocument();
    expect(screen.getByText('Sophie HAMEL')).toBeInTheDocument();
    expect(screen.queryByText('Clément DEROBERT')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Arthur DEMO/ })).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByText('Organisation des exercices trimestriels'));
    expect(await screen.findByRole('button', { name: 'Diffuser' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Modifier' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Supprimer le brouillon' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Télécharger le PDF' })).toBeInTheDocument();
  });

  it('groups by chronology year and sorts each year from the newest code to the oldest', () => {
    const note = (chronologyCode: string, authoredOn: string): ServiceNote => ({
      id: Number(chronologyCode.match(/\d+/u)?.[0] || 1), companyId: 1, chronologyCode, subject: chronologyCode,
      body: '', vesselId: null, vesselName: '', scope: 'all_accounts', targetVessels: [], targetPersonIds: [],
      status: 'archived', authorPersonId: null, authorIdentitySnapshot: {}, authorSignatureSnapshot: null,
      authoredOn, publishedAt: `${authoredOn}T00:00:00Z`, sourceKind: 'sharepoint', sourceFileName: '', sourceWebUrl: '',
      sourceModifiedAt: '', createdBy: '', createdAt: `${authoredOn}T00:00:00Z`, updatedAt: `${authoredOn}T00:00:00Z`,
      lastRecalledChronologyCode: '', attachments: [], recipients: [], signatures: [],
    });
    const groups = groupServiceNotesByYear([note('NS 02-26', '2026-01-02'), note('NS 08-25', '2026-01-01'), note('NS 09-26', '2026-01-03')]);
    expect(groups.map((group) => group.year)).toEqual([2026, 2025]);
    expect(groups[0].notes.map((item) => item.chronologyCode)).toEqual(['NS 09-26', 'NS 02-26']);
  });

  it('groups vessel notes under each vessel and keeps people-only notes directly under the year', () => {
    const note = (id: number, chronologyCode: string, scope: ServiceNote['scope'], vesselNames: string[]): ServiceNote => ({
      id, companyId: 1, chronologyCode, subject: chronologyCode, body: '', vesselId: null, vesselName: '', scope,
      targetVessels: vesselNames.map((name, index) => ({ id: id * 10 + index, name })), targetPersonIds: scope === 'people' ? [9302] : [],
      status: 'archived', authorPersonId: null, authorIdentitySnapshot: {}, authorSignatureSnapshot: null,
      authoredOn: '2026-01-01', publishedAt: '2026-01-01T00:00:00Z', sourceKind: 'sharepoint', sourceFileName: '', sourceWebUrl: '',
      sourceModifiedAt: '', createdBy: '', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
      lastRecalledChronologyCode: '', attachments: [], recipients: [], signatures: [],
    });
    const peopleNote = note(1, 'NS 01-26', 'people', []);
    const gouryNote = note(2, 'NS 02-26', 'vessels', ['GOURY']);
    const multiVesselNote = { ...note(3, 'NS 03-26', 'vessels', ['KROKDUR', 'GOURY']), targetPersonIds: [9302] };
    const [year] = groupServiceNotesByYearAndVessel([peopleNote, gouryNote, multiVesselNote]);

    expect(year.notesWithoutVessel.map((item) => item.id)).toEqual([peopleNote.id]);
    expect(year.vesselGroups.map((group) => group.vesselName)).toEqual(['GOURY', 'KROKDUR']);
    expect(year.vesselGroups[0].notes.map((item) => item.id)).toEqual([multiVesselNote.id, gouryNote.id]);
    expect(year.vesselGroups[1].notes.map((item) => item.id)).toEqual([multiVesselNote.id]);
  });

  it('keeps management controls and private drafts out of a non-manager view', async () => {
    renderPage(['marin']);
    await screen.findByRole('heading', { name: 'Notes de Service' });

    expect(screen.queryByRole('button', { name: 'Nouvelle note' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Brouillons/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Toutes' }));
    expect(screen.queryByText('Organisation des exercices trimestriels')).not.toBeInTheDocument();
    expect(screen.queryByText('Mise à jour du DUP de KROKDUR')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('NS 08-26'));
    expect(await screen.findByRole('button', { name: 'Télécharger le PDF' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rappeler' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer le brouillon' })).not.toBeInTheDocument();
  });
});
