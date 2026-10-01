import type { SupabaseClient } from '@supabase/supabase-js';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import { RequireAuth } from '../auth/RequireAuth';
import { APP_MODULES, type AppModule } from '../permissions/moduleAccess';
import type { RoleKey } from '../permissions/roles';
import { fetchCurrentUserRoles } from '../profiles/profileQueries';
import type { AppShellOutletContext } from '../shell/AppShell';
import { RegulatoryLibraryPage } from './RegulatoryLibraryPage';
import { REGULATORY_REFERENCE_TEXTS, RegulatorySourceChangedError, type RegulatoryCategory, type RegulatoryReview, type RegulatoryText } from './regulatoryModel';
import { fetchRegulatoryLibrary, recordRegulatoryReview, saveRegulatoryText } from './regulatoryQueries';

vi.mock('./regulatoryQueries', () => ({
  fetchRegulatoryLibrary: vi.fn(),
  recordRegulatoryReview: vi.fn(),
  saveRegulatoryText: vi.fn(),
}));

const NOW = '2026-10-01T10:00:00.000Z';
const division160 = REGULATORY_REFERENCE_TEXTS.find((text) => text.sort_order === 160)!;
const division213 = REGULATORY_REFERENCE_TEXTS.find((text) => text.sort_order === 213)!;
const regulatoryModules = APP_MODULES.filter((module) => module.family === 'Bibliothèque Réglementaire');

function reviewFor(text: RegulatoryText, overrides: Partial<RegulatoryReview> = {}): RegulatoryReview {
  return {
    id: `review-${text.id}`, text_id: text.id, reviewed_at: '2026-09-15T10:00:00.000Z',
    reviewer_name: 'Équipe Armement', has_updates: false, updates: '', title_snapshot: text.title, url_snapshot: text.url, ...overrides,
  };
}

// Load roles from each authenticated account's user_roles fixture, like AppShell.
// No session role simulation or rolesOverride is used for the crew profiles.
function ProfileOutlet({ client, visibleModules, previewMode }: { client: SupabaseClient; visibleModules: AppModule[]; previewMode: boolean }) {
  const [roles, setRoles] = useState<RoleKey[] | null>(null);
  useEffect(() => { void fetchCurrentUserRoles(client).then(setRoles); }, [client]);
  return roles ? <Outlet context={{ roles, client, visibleModules, previewMode, currentPerson: null } satisfies AppShellOutletContext} /> : <p>Chargement du profil…</p>;
}

function renderProfile(role: RoleKey = 'armement', category?: RegulatoryCategory, visibleModules = regulatoryModules, previewMode = false) {
  const user = { id: `${role}-regulatory-page-fixture`, email: `${role}@example.test` };
  const client = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user } }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: vi.fn((table: string) => {
      if (table === 'user_roles') return { select: vi.fn().mockResolvedValue({ data: [{ role_key: role }], error: null }) };
      throw new Error(`Unexpected profile fixture table: ${table}`);
    }),
  };
  render(<AuthProvider client={client as never}><MemoryRouter initialEntries={['/library']}><Routes>
    <Route element={<RequireAuth />}><Route element={<ProfileOutlet client={client as never} visibleModules={visibleModules} previewMode={previewMode} />}>
      <Route path="library" element={<RegulatoryLibraryPage category={category} />} />
    </Route></Route>
  </Routes></MemoryRouter></AuthProvider>);
  return client;
}

async function watchTable() { return screen.findByRole('table', { name: 'Suivi des revues des textes réglementaires' }); }
function rowFor(text: RegulatoryText) {
  return within(screen.getByRole('table', { name: 'Suivi des revues des textes réglementaires' })).getByRole('link', { name: `${text.title} (nouvel onglet)` }).closest('tr')!;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
  vi.mocked(fetchRegulatoryLibrary).mockResolvedValue({ texts: REGULATORY_REFERENCE_TEXTS, reviews: [] });
});
afterEach(() => { vi.useRealTimers(); });

describe('regulatory library page', () => {
  it('opens the two categories from the overview and shows the review date, updates and monthly alarm', async () => {
    vi.mocked(fetchRegulatoryLibrary).mockResolvedValue({ texts: REGULATORY_REFERENCE_TEXTS, reviews: [
      reviewFor(division160, { reviewed_at: '2026-08-30T10:00:00.000Z', has_updates: true, updates: 'Article 3 : nouvelle procédure de sécurité.' }),
      reviewFor(division213),
    ] });
    renderProfile();
    await watchTable();
    const categories = within(screen.getByRole('navigation', { name: 'Rubriques réglementaires' }));
    expect(categories.getByRole('link', { name: /Sécurité Maritime/ })).toHaveAttribute('href', '/modules/regulatorySafety');
    expect(categories.getByRole('link', { name: /Code des Transports/ })).toHaveAttribute('href', '/modules/regulatoryTransport');
    expect(within(rowFor(division160)).getByText('30/08/2026')).toBeVisible();
    expect(within(rowFor(division160)).getByText('Article 3 : nouvelle procédure de sécurité.')).toBeVisible();
    expect(within(rowFor(division160)).getByText('En retard')).toBeVisible();
    expect(within(rowFor(division213)).getByText('À jour')).toBeVisible();
    expect(screen.getByText('5 revues à réaliser')).toBeVisible();
  });

  it('keeps every official maritime source href and opens the Division 214 PDF reader', async () => {
    renderProfile('armement', 'safety');
    await watchTable();
    const sources = within(screen.getByRole('region', { name: 'Sources réglementaires' }));
    const primary = REGULATORY_REFERENCE_TEXTS.find((text) => text.category === 'safety' && text.is_primary)!;
    expect(sources.getByRole('link', { name: 'Ouvrir le site officiel' })).toHaveAttribute('href', primary.url);
    for (const text of REGULATORY_REFERENCE_TEXTS.filter((text) => text.category === 'safety' && !text.is_primary)) {
      const anchor = sources.getByRole('link', { name: `${text.title} (nouvel onglet)` });
      expect(anchor).toHaveAttribute('href', text.url);
      expect(anchor).toHaveAttribute('target', '_blank');
      expect(anchor).toHaveAttribute('rel', 'noopener noreferrer');
    }
    const division214 = REGULATORY_REFERENCE_TEXTS.find((text) => text.sort_order === 214)!;
    const directLink = sources.getByRole('link', { name: `${division214.title} (nouvel onglet)` });
    await userEvent.setup().click(within(directLink.closest('article')!).getByRole('button', { name: 'Lire le PDF dans SeaPilot' }));
    expect(screen.getByTitle(`Lecture : ${division214.title}`)).toHaveAttribute('src', division214.url);
    expect(sources.getByRole('link', { name: 'Ouvrir le PDF' })).toHaveAttribute('href', division214.url);
    expect(screen.queryByRole('link', { name: /^Code des Transports \(nouvel onglet\)$/ })).not.toBeInTheDocument();
  });

  it('uses the supplied Legifrance href on the transport page', async () => {
    renderProfile('armement', 'transport');
    await watchTable();
    const sources = within(screen.getByRole('region', { name: 'Sources réglementaires' }));
    expect(sources.getByRole('link', { name: 'Ouvrir le site officiel' })).toHaveAttribute('href', 'https://www.legifrance.gouv.fr/loda/id/LEGISCTA000043341020');
    expect(screen.queryByRole('button', { name: 'Lire le PDF dans SeaPilot' })).not.toBeInTheDocument();
  });

  it('persists a custom link in its category and edits the saved record without duplicating it', async () => {
    const client = renderProfile();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Ajouter un lien' }));
    await user.type(screen.getByLabelText('Titre du texte'), '  Nouvelle référence  ');
    await user.type(screen.getByLabelText('Adresse du lien'), 'https://example.org/nouvelle-reference');
    await user.selectOptions(screen.getByLabelText('Rubrique'), 'transport');
    const custom: RegulatoryText = { id: 'custom-text', title: 'Nouvelle référence', url: 'https://example.org/nouvelle-reference', category: 'transport', is_primary: false, sort_order: 100 };
    vi.mocked(saveRegulatoryText).mockResolvedValue(custom);
    await user.click(screen.getByRole('button', { name: 'Enregistrer le lien' }));
    expect(await screen.findByText('Lien enregistré dans la bibliothèque partagée.')).toBeVisible();
    expect(saveRegulatoryText).toHaveBeenCalledWith(client, { title: custom.title, url: custom.url, category: 'transport' }, undefined);
    expect(within(rowFor(custom)).getByText('À revoir')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: `Modifier le lien ${custom.title}` }));
    await user.clear(screen.getByLabelText('Titre du texte'));
    await user.type(screen.getByLabelText('Titre du texte'), 'Référence actualisée');
    vi.mocked(saveRegulatoryText).mockResolvedValue({ ...custom, title: 'Référence actualisée' });
    await user.click(screen.getByRole('button', { name: 'Enregistrer le lien' }));
    await screen.findByRole('link', { name: 'Référence actualisée (nouvel onglet)' });
    expect(saveRegulatoryText).toHaveBeenLastCalledWith(client, { title: 'Référence actualisée', url: custom.url, category: 'transport', is_primary: false, sort_order: 100 }, custom.id);
    expect(screen.queryByRole('link', { name: 'Nouvelle référence (nouvel onglet)' })).not.toBeInTheDocument();
  });

  it('preserves entered link values when the server rejects the save', async () => {
    renderProfile();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Ajouter un lien' }));
    await user.type(screen.getByLabelText('Titre du texte'), 'Référence à conserver');
    await user.type(screen.getByLabelText('Adresse du lien'), 'https://example.org/reference');
    await user.selectOptions(screen.getByLabelText('Rubrique'), 'transport');
    vi.mocked(saveRegulatoryText).mockRejectedValue(new Error('Accès révoqué'));
    await user.click(screen.getByRole('button', { name: 'Enregistrer le lien' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Accès révoqué');
    expect(screen.getByRole('dialog', { name: 'Ajouter un lien' })).toBeVisible();
    expect(screen.getByLabelText('Titre du texte')).toHaveValue('Référence à conserver');
    expect(screen.getByLabelText('Adresse du lien')).toHaveValue('https://example.org/reference');
    expect(screen.getByLabelText('Rubrique')).toHaveValue('transport');
    expect(screen.queryByRole('link', { name: 'Référence à conserver (nouvel onglet)' })).not.toBeInTheDocument();
  });

  it('requires a new review after a source URL changes and keeps the original source in history', async () => {
    vi.mocked(fetchRegulatoryLibrary).mockResolvedValue({ texts: [division160], reviews: [reviewFor(division160, { has_updates: true, updates: 'Modification de la source précédente.' })] });
    renderProfile();
    await watchTable();
    expect(within(rowFor(division160)).getByText('À jour')).toBeVisible();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: `Modifier le lien ${division160.title}` }));
    await user.clear(screen.getByLabelText('Adresse du lien'));
    const changed = { ...division160, url: 'https://example.org/division-160-nouvelle-version.pdf' };
    await user.type(screen.getByLabelText('Adresse du lien'), changed.url);
    vi.mocked(saveRegulatoryText).mockResolvedValue(changed);
    await user.click(screen.getByRole('button', { name: 'Enregistrer le lien' }));
    await screen.findByText('Lien enregistré dans la bibliothèque partagée.');
    const row = within(rowFor(changed));
    expect(row.getByRole('link', { name: `${changed.title} (nouvel onglet)` })).toHaveAttribute('href', changed.url);
    expect(row.getByText('À revoir')).toBeVisible();
    expect(row.getByText('Aucune revue enregistrée')).toBeVisible();
    expect(screen.getByText('1 revue à réaliser')).toBeVisible();
    await user.click(row.getByRole('button', { name: 'Historique (1)' }));
    const history = within(screen.getByRole('dialog', { name: 'Historique des revues' }));
    expect(history.getByRole('link', { name: division160.title })).toHaveAttribute('href', division160.url);
    expect(history.getByText('Modification de la source précédente.')).toBeVisible();
  });

  it('keeps the reviewed title and URL in preview history and requires a new review after editing its source', async () => {
    renderProfile('armement', undefined, regulatoryModules, true);
    await watchTable();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: `Faire la revue de ${division160.title}` }));
    await user.click(screen.getByRole('button', { name: 'Valider la revue' }));
    expect(await screen.findByText('Revue ajoutée à cette démonstration. Elle ne sera pas enregistrée en production.')).toBeVisible();
    expect(within(rowFor(division160)).getByText('À jour')).toBeVisible();
    await user.click(screen.getByRole('button', { name: `Modifier le lien ${division160.title}` }));
    const changed = { ...division160, title: 'Division 160 - Nouvelle référence', url: 'https://example.org/division-160-nouvelle-version.pdf' };
    await user.clear(screen.getByLabelText('Titre du texte'));
    await user.type(screen.getByLabelText('Titre du texte'), changed.title);
    await user.clear(screen.getByLabelText('Adresse du lien'));
    await user.type(screen.getByLabelText('Adresse du lien'), changed.url);
    await user.click(screen.getByRole('button', { name: 'Enregistrer le lien' }));
    expect(await screen.findByText('Lien ajouté à cette démonstration. Il ne sera pas enregistré en production.')).toBeVisible();
    const row = within(rowFor(changed));
    expect(row.getByText('À revoir')).toBeVisible();
    expect(row.getByText('Aucune revue enregistrée')).toBeVisible();
    expect(screen.getByText('6 revues à réaliser')).toBeVisible();
    await user.click(row.getByRole('button', { name: 'Historique (1)' }));
    const history = within(screen.getByRole('dialog', { name: 'Historique des revues' }));
    expect(history.getByRole('link', { name: division160.title })).toHaveAttribute('href', division160.url);
    expect(history.getByText('Aucune mise à jour constatée')).toBeVisible();
    expect(history.queryByRole('link', { name: changed.title })).not.toBeInTheDocument();
    expect(fetchRegulatoryLibrary).not.toHaveBeenCalled();
    expect(recordRegulatoryReview).not.toHaveBeenCalled();
    expect(saveRegulatoryText).not.toHaveBeenCalled();
  });

  it('records changed text updates, clears its alarm and preserves the previous review in history', async () => {
    const previous = reviewFor(division160, { id: 'previous-review', reviewed_at: '2026-08-30T10:00:00.000Z', has_updates: true, updates: 'Ancienne modification.' });
    vi.mocked(fetchRegulatoryLibrary).mockResolvedValue({ texts: [division160], reviews: [previous] });
    const client = renderProfile();
    await watchTable();
    expect(within(rowFor(division160)).getByText('En retard')).toBeVisible();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: `Faire la revue de ${division160.title}` }));
    expect(screen.getByRole('link', { name: 'Consulter la source avant la revue' })).toHaveAttribute('href', division160.url);
    await user.click(screen.getByRole('radio', { name: 'Des mises à jour ont été constatées' }));
    await user.type(screen.getByLabelText('Mises à jour constatées'), '  Article 5 : nouvelle fréquence de contrôle.  ');
    vi.mocked(recordRegulatoryReview).mockResolvedValue(reviewFor(division160, { id: 'current-review', reviewed_at: NOW, reviewer_name: 'Claire Armement', has_updates: true, updates: 'Article 5 : nouvelle fréquence de contrôle.' }));
    await user.click(screen.getByRole('button', { name: 'Valider la revue' }));
    expect(await screen.findByText('Revue enregistrée. La prochaine revue est prévue dans un mois.')).toBeVisible();
    expect(recordRegulatoryReview).toHaveBeenCalledWith(client, division160.id, { has_updates: true, updates: 'Article 5 : nouvelle fréquence de contrôle.' }, division160.url);
    expect(within(rowFor(division160)).getByText('À jour')).toBeVisible();
    expect(within(rowFor(division160)).getByText('01/10/2026')).toBeVisible();
    expect(within(rowFor(division160)).getByText('À renouveler le 01/11/2026')).toBeVisible();
    expect(screen.getByText('Les revues sont à jour')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Historique (2)' }));
    const history = within(screen.getByRole('dialog', { name: 'Historique des revues' }));
    expect(history.getByText('Article 5 : nouvelle fréquence de contrôle.')).toBeVisible();
    expect(history.getByText('Ancienne modification.')).toBeVisible();
    expect(history.getAllByRole('listitem')).toHaveLength(2);
    expect(within(history.getAllByRole('listitem')[0]).getByText('Claire Armement')).toBeVisible();
  });

  it('records an unchanged review distinctly from a list of changes', async () => {
    vi.mocked(fetchRegulatoryLibrary).mockResolvedValue({ texts: [division160], reviews: [] });
    const client = renderProfile('direction');
    await watchTable();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: `Faire la revue de ${division160.title}` }));
    expect(screen.getByRole('radio', { name: 'Aucune mise à jour constatée' })).toBeChecked();
    expect(screen.queryByLabelText('Mises à jour constatées')).not.toBeInTheDocument();
    vi.mocked(recordRegulatoryReview).mockResolvedValue(reviewFor(division160, { reviewed_at: NOW }));
    await user.click(screen.getByRole('button', { name: 'Valider la revue' }));
    await screen.findByText('Revue enregistrée. La prochaine revue est prévue dans un mois.');
    expect(recordRegulatoryReview).toHaveBeenCalledWith(client, division160.id, { has_updates: false, updates: '' }, division160.url);
    expect(within(rowFor(division160)).getByText('Aucune mise à jour constatée')).toBeVisible();
    expect(within(rowFor(division160)).getByText('À jour')).toBeVisible();
  });

  it('keeps a failed review open with its updates and retains the prior alarm', async () => {
    vi.mocked(fetchRegulatoryLibrary).mockResolvedValue({ texts: [division160], reviews: [] });
    renderProfile();
    await watchTable();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: `Faire la revue de ${division160.title}` }));
    await user.click(screen.getByRole('radio', { name: 'Des mises à jour ont été constatées' }));
    await user.type(screen.getByLabelText('Mises à jour constatées'), 'Modification à conserver.');
    vi.mocked(recordRegulatoryReview).mockRejectedValue(new Error('Connexion indisponible'));
    await user.click(screen.getByRole('button', { name: 'Valider la revue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Connexion indisponible');
    expect(screen.getByRole('dialog', { name: 'Faire la revue' })).toBeVisible();
    expect(screen.getByLabelText('Mises à jour constatées')).toHaveValue('Modification à conserver.');
    expect(within(rowFor(division160)).getByText('À revoir')).toBeVisible();
    expect(screen.getByText('1 revue à réaliser')).toBeVisible();
  });

  it('reloads a changed source after a rejected stale review and validates only its new URL', async () => {
    const changed = { ...division160, url: 'https://example.org/division-160-mise-a-jour.pdf' };
    const previous = reviewFor(division160);
    vi.mocked(fetchRegulatoryLibrary)
      .mockResolvedValueOnce({ texts: [division160], reviews: [previous] })
      .mockResolvedValueOnce({ texts: [changed], reviews: [previous] });
    const client = renderProfile();
    await watchTable();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: `Faire la revue de ${division160.title}` }));
    expect(screen.getByRole('link', { name: 'Consulter la source avant la revue' })).toHaveAttribute('href', division160.url);
    await user.click(screen.getByRole('radio', { name: 'Des mises à jour ont été constatées' }));
    await user.type(screen.getByLabelText('Mises à jour constatées'), 'Observation de la source précédente.');
    const changedError = new RegulatorySourceChangedError();
    vi.mocked(recordRegulatoryReview).mockRejectedValueOnce(changedError);
    await user.click(screen.getByRole('button', { name: 'Valider la revue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(changedError.message);
    expect(recordRegulatoryReview).toHaveBeenCalledWith(client, division160.id, { has_updates: true, updates: 'Observation de la source précédente.' }, division160.url);
    expect(screen.getByRole('dialog', { name: 'Faire la revue' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Valider la revue' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Recharger la bibliothèque' }));
    await waitFor(() => expect(within(rowFor(changed)).getByRole('link', { name: `${changed.title} (nouvel onglet)` })).toHaveAttribute('href', changed.url));
    expect(fetchRegulatoryLibrary).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(rowFor(changed)).getByText('À revoir')).toBeVisible();
    expect(screen.getByText('1 revue à réaliser')).toBeVisible();
    await user.click(screen.getByRole('button', { name: `Faire la revue de ${changed.title}` }));
    expect(screen.getByRole('link', { name: 'Consulter la source avant la revue' })).toHaveAttribute('href', changed.url);
    expect(screen.getByRole('radio', { name: 'Aucune mise à jour constatée' })).toBeChecked();
    vi.mocked(recordRegulatoryReview).mockResolvedValueOnce(reviewFor(changed, { id: 'new-source-review', reviewed_at: NOW }));
    await user.click(screen.getByRole('button', { name: 'Valider la revue' }));
    await screen.findByText('Revue enregistrée. La prochaine revue est prévue dans un mois.');
    expect(recordRegulatoryReview).toHaveBeenLastCalledWith(client, changed.id, { has_updates: false, updates: '' }, changed.url);
    expect(within(rowFor(changed)).getByText('À jour')).toBeVisible();
  });

  it('filters by accent-insensitive search and due status, with a no-results message', async () => {
    vi.mocked(fetchRegulatoryLibrary).mockResolvedValue({ texts: [division160, division213], reviews: [reviewFor(division213)] });
    renderProfile();
    await watchTable();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrer les revues' }), 'due');
    expect(within(rowFor(division160)).getByText('À revoir')).toBeVisible();
    expect(screen.queryByRole('link', { name: `${division213.title} (nouvel onglet)` })).not.toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Rechercher un texte' }), 'securite');
    expect(rowFor(division160)).toBeVisible();
    await user.clear(screen.getByRole('textbox', { name: 'Rechercher un texte' }));
    await user.type(screen.getByRole('textbox', { name: 'Rechercher un texte' }), 'référence absente');
    expect(screen.getByText('Aucun texte ne correspond à votre recherche.')).toBeVisible();
  });

  it('shows a retry after a loading error and renders the empty library after recovery', async () => {
    vi.mocked(fetchRegulatoryLibrary).mockRejectedValueOnce(new Error('Bibliothèque indisponible')).mockResolvedValueOnce({ texts: [], reviews: [] });
    renderProfile();
    expect(await screen.findByRole('alert')).toHaveTextContent('Bibliothèque indisponible');
    expect(screen.queryByRole('button', { name: 'Ajouter un lien' })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Aucun texte disponible dans cette rubrique.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Ajouter un lien' })).toBeVisible();
    expect(fetchRegulatoryLibrary).toHaveBeenCalledTimes(2);
  });

  it.each(['marin', 'capitaine'] as const)('lets a real authenticated %s fixture consult sources and history without editing or reviewing', async (role) => {
    vi.mocked(fetchRegulatoryLibrary).mockResolvedValue({ texts: [division160], reviews: [reviewFor(division160)] });
    const client = renderProfile(role);
    await watchTable();
    expect(client.auth.getSession).toHaveBeenCalled();
    expect(client.from).toHaveBeenCalledWith('user_roles');
    expect(fetchRegulatoryLibrary).toHaveBeenCalledWith(client);
    expect(screen.queryByRole('button', { name: 'Ajouter un lien' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Faire la revue/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Modifier le lien/ })).not.toBeInTheDocument();
    expect(within(rowFor(division160)).getByRole('link', { name: 'Consulter' })).toHaveAttribute('href', division160.url);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Historique (1)' }));
    expect(screen.getByRole('dialog', { name: 'Historique des revues' })).toBeVisible();
    expect(saveRegulatoryText).not.toHaveBeenCalled();
    expect(recordRegulatoryReview).not.toHaveBeenCalled();
  });

  it('omits a denied category from the overview and its review table', async () => {
    renderProfile('armement', undefined, regulatoryModules.filter((module) => module.key !== 'regulatoryTransport'));
    await watchTable();
    expect(screen.queryByRole('link', { name: /Code des Transports/ })).not.toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Rubriques réglementaires' })).getAllByRole('link')).toHaveLength(1);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Ajouter un lien' }));
    expect(screen.getByLabelText('Rubrique')).toHaveValue('safety');
    expect(within(screen.getByLabelText('Rubrique')).getAllByRole('option')).toHaveLength(1);
    await waitFor(() => expect(screen.getByText('5 revues à réaliser')).toBeVisible());
  });
});
