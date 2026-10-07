import type { SupabaseClient } from '@supabase/supabase-js';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ManagerHomeDashboard } from './ManagerHomeDashboard';
import { fetchManagerHomeDashboard, type ManagerHomeItem } from './managerHomeData';

vi.mock('./managerHomeData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./managerHomeData')>();
  return { ...actual, fetchManagerHomeDashboard: vi.fn() };
});

const TODAY = '2026-10-07';
const CLIENT = {} as SupabaseClient;
const GOURY = { key: 'vessel:10', name: 'GOURY' };
const KROKDUR = { key: 'vessel:11', name: 'KROKDUR' };

function item(overrides: Partial<ManagerHomeItem>): ManagerHomeItem {
  return {
    id: 'purchase-1', group: 'purchases', tags: ['purchases'],
    title: 'Commande de pièces', context: 'Achats · GOURY',
    deadline: 'Aujourd’hui', action: 'Suivre la commande', to: '/modules/purchaseRequests',
    dueDate: TODAY, visibleDates: [TODAY], queueVisibleDates: [TODAY],
    tone: 'danger', queueTone: 'danger', urgent: true, thisWeek: true, vessels: [GOURY],
    ...overrides,
  };
}

const ITEMS = [
  item({}),
  item({
    id: 'fleet-2', group: 'fleetDocuments', tags: ['documents', 'fleet'],
    title: 'Visite annuelle du navire', context: 'Flotte · KROKDUR', vessels: [KROKDUR],
    deadline: 'Visite le 9 oct', action: 'Ouvrir le certificat', to: '/modules/certificates',
    dueDate: '2026-10-09', visibleDates: [TODAY, '2026-10-09'],
    queueVisibleDates: [TODAY, '2026-10-09'], tone: 'warning', queueTone: 'warning', urgent: false,
  }),
  item({
    id: 'working-time-3', group: 'workingTime', tags: ['workingTime'],
    title: 'Vérifier le repos de la bordée', context: 'Temps de travail · GOURY',
    to: '/modules/workingTime', dueDate: '2026-10-08',
    visibleDates: ['2026-10-08'], queueVisibleDates: ['2026-10-08'],
  }),
  item({
    id: 'hr-document-4', group: 'humanResources', tags: ['documents', 'humanResources'],
    title: 'Brevet passerelle', context: 'Ressources humaines · Arthur',
    deadline: 'Expire le 12 nov', action: 'Ouvrir le document', to: '/modules/humanResources',
    dueDate: '2026-11-12', visibleDates: ['2026-11-12'], queueVisibleDates: ['2026-11-12'],
    tone: 'success', queueTone: 'warning', urgent: false, thisWeek: false,
  }),
];

async function renderDashboard() {
  render(<MemoryRouter><ManagerHomeDashboard client={CLIENT} firstName="Arthur" personId={42} roles={['direction']} /></MemoryRouter>);
  await screen.findByRole('link', { name: /Commande de pièces/ });
  return userEvent.setup();
}

function filters() {
  return within(screen.getByRole('group', { name: 'Filtres de la file' }));
}

function calendar() {
  return within(screen.getByRole('complementary', { name: 'Calendrier des échéances' }));
}

describe('home calendar and task interactions', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 7, 12));
    vi.mocked(fetchManagerHomeDashboard).mockResolvedValue({
      items: ITEMS, vessels: [GOURY, KROKDUR], unavailableSources: [], scopeLabel: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('updates the task list and filter counts for the selected date', async () => {
    const user = await renderDashboard();

    expect(filters().getByRole('button', { name: /^Tous\s*2$/ })).toHaveAttribute('aria-pressed', 'true');
    expect(filters().getByRole('button', { name: /^Urgents\s*1$/ })).toBeInTheDocument();
    expect(filters().getByRole('button', { name: /^Cette semaine\s*2$/ })).toBeInTheDocument();
    await user.click(calendar().getByRole('button', { name: '9 Octobre 2026, 1 échéance' }));

    expect(screen.getByText('Vendredi 9 octobre · 1 élément')).toBeInTheDocument();
    expect(filters().getByRole('button', { name: /^Tous\s*1$/ })).toBeInTheDocument();
    expect(filters().getByRole('button', { name: /^Urgents\s*0$/ })).toBeInTheDocument();
    expect(filters().getByRole('button', { name: /^Cette semaine\s*1$/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Commande de pièces/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Visite annuelle du navire/ })).toHaveAttribute('href', '/modules/certificates');
    expect(calendar().getByRole('button', { name: '9 Octobre 2026, 1 échéance' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(filters().getByRole('button', { name: /^Urgents\s*0$/ }));
    expect(screen.getByText('Aucun élément ne correspond à cette date et à ce filtre.')).toBeInTheDocument();
    expect(filters().getByRole('button', { name: /^Tous\s*1$/ })).toBeInTheDocument();
  });

  it('filters tasks by category, retains their links and recovers from an empty category', async () => {
    const user = await renderDashboard();

    expect(screen.getByRole('heading', { name: 'Achats' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Flotte & documents' })).toBeInTheDocument();
    await user.click(filters().getByRole('button', { name: /^Achats\s*1$/ }));
    expect(screen.getByRole('link', { name: /Commande de pièces/ })).toHaveAttribute('href', '/modules/purchaseRequests');
    expect(screen.queryByRole('heading', { name: 'Flotte & documents' })).not.toBeInTheDocument();

    await user.click(filters().getByRole('button', { name: /^Temps de travail\s*0$/ }));
    expect(screen.getByText('Aucun élément ne correspond à cette date et à ce filtre.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Vérifier le repos de la bordée/ })).not.toBeInTheDocument();
    await user.click(filters().getByRole('button', { name: /^Documents\s*1$/ }));
    expect(screen.getByRole('heading', { name: 'Flotte & documents' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Achats' })).not.toBeInTheDocument();
    await user.click(filters().getByRole('button', { name: /^Tous\s*2$/ }));
    expect(screen.getByRole('heading', { name: 'Achats' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Flotte & documents' })).toBeInTheDocument();
    expect(screen.queryByText('Aucun élément ne correspond à cette date et à ce filtre.')).not.toBeInTheDocument();
  });

  it('opens the third future key date in its month and returns to today with its date marker', async () => {
    const user = await renderDashboard();
    const today = calendar().getByRole('button', { name: '7 Octobre 2026, 2 échéances' });
    expect(today).toHaveAttribute('aria-current', 'date');
    expect(today).toHaveAttribute('aria-pressed', 'true');

    const keyDates = within(screen.getByRole('region', { name: 'Prochaines dates clés' }));
    expect(keyDates.getAllByRole('button')).toHaveLength(3);
    await user.click(keyDates.getByRole('button', { name: /Brevet passerelle/ }));

    expect(calendar().getByRole('heading', { name: 'Novembre 2026' })).toBeInTheDocument();
    expect(screen.getByText('Jeudi 12 novembre · 1 élément')).toBeInTheDocument();
    expect(calendar().getByRole('button', { name: '12 Novembre 2026, 1 échéance' })).toHaveAttribute('aria-pressed', 'true');
    expect(calendar().getByRole('button', { name: '12 Novembre 2026, 1 échéance' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: /Brevet passerelle/ })).toHaveAttribute('href', '/modules/humanResources');
    expect(filters().getByRole('button', { name: /^Cette semaine\s*0$/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Aujourd’hui' }));

    expect(calendar().getByRole('heading', { name: 'Octobre 2026' })).toBeInTheDocument();
    expect(screen.getByText('Mercredi 7 octobre · 2 éléments')).toBeInTheDocument();
    expect(calendar().getByRole('button', { name: '7 Octobre 2026, 2 échéances' })).toHaveAttribute('aria-pressed', 'true');
    expect(calendar().getByRole('button', { name: '7 Octobre 2026, 2 échéances' })).toHaveAttribute('aria-current', 'date');
  });

  it('navigates adjacent months without changing the selected task date', async () => {
    const user = await renderDashboard();

    await user.click(calendar().getByRole('button', { name: 'Mois suivant' }));
    expect(calendar().getByRole('heading', { name: 'Novembre 2026' })).toBeInTheDocument();
    expect(screen.getByText('Mercredi 7 octobre · 2 éléments')).toBeInTheDocument();
    await user.click(calendar().getByRole('button', { name: 'Mois précédent' }));
    expect(calendar().getByRole('heading', { name: 'Octobre 2026' })).toBeInTheDocument();
    await user.click(calendar().getByRole('button', { name: 'Mois précédent' }));
    expect(calendar().getByRole('heading', { name: 'Septembre 2026' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Aujourd’hui' }));
    expect(calendar().getByRole('heading', { name: 'Octobre 2026' })).toBeInTheDocument();
  });

  it('collapses only the chosen category and expands it with the keyboard', async () => {
    const user = await renderDashboard();
    const collapse = screen.getByRole('button', { name: 'Replier la catégorie Achats' });
    const itemsId = collapse.getAttribute('aria-controls');

    expect(collapse).toHaveAttribute('aria-expanded', 'true');
    expect(itemsId).toBeTruthy();
    expect(document.getElementById(itemsId!)).toContainElement(screen.getByRole('link', { name: /Commande de pièces/ }));
    await user.click(collapse);

    const expand = screen.getByRole('button', { name: 'Déplier la catégorie Achats' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    expect(expand).toHaveAttribute('aria-controls', itemsId);
    expect(screen.queryByRole('link', { name: /Commande de pièces/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Visite annuelle du navire/ })).toBeVisible();
    expect(filters().getByRole('button', { name: /^Tous\s*2$/ })).toBeInTheDocument();

    expect(expand).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Replier la catégorie Flotte & documents' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(expand).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Replier la catégorie Achats' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Replier la catégorie Achats' })).toHaveAttribute('aria-controls', itemsId);
    expect(document.getElementById(itemsId!)).toContainElement(screen.getByRole('link', { name: /Commande de pièces/ }));
    expect(screen.getByRole('link', { name: /Commande de pièces/ })).toHaveAttribute('href', '/modules/purchaseRequests');
  });

  it('retains task data and date counts when a category is collapsed during filter and month changes', async () => {
    const user = await renderDashboard();
    await user.click(screen.getByRole('button', { name: 'Replier la catégorie Achats' }));
    await user.click(calendar().getByRole('button', { name: 'Mois suivant' }));

    expect(screen.getByText('Mercredi 7 octobre · 2 éléments')).toBeInTheDocument();
    expect(filters().getByRole('button', { name: /^Achats\s*1$/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Commande de pièces/ })).not.toBeInTheDocument();
    await user.click(filters().getByRole('button', { name: /^Documents\s*1$/ }));
    expect(screen.getByRole('link', { name: /Visite annuelle du navire/ })).toHaveAttribute('href', '/modules/certificates');
    await user.click(filters().getByRole('button', { name: /^Tous\s*2$/ }));
    await user.click(calendar().getByRole('button', { name: 'Mois précédent' }));
    await user.click(calendar().getByRole('button', { name: '9 Octobre 2026, 1 échéance' }));

    expect(screen.getByText('Vendredi 9 octobre · 1 élément')).toBeInTheDocument();
    expect(filters().getByRole('button', { name: /^Achats\s*0$/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Visite annuelle du navire/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Aujourd’hui' }));

    await user.click(screen.getByRole('button', { name: 'Déplier la catégorie Achats' }));
    expect(screen.getByText('Mercredi 7 octobre · 2 éléments')).toBeInTheDocument();
    expect(filters().getByRole('button', { name: /^Achats\s*1$/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Commande de pièces/ })).toHaveAttribute('href', '/modules/purchaseRequests');
    expect(screen.getByRole('link', { name: /Visite annuelle du navire/ })).toHaveAttribute('href', '/modules/certificates');
    expect(fetchManagerHomeDashboard).toHaveBeenCalledTimes(1);
  });

  it('presents each deadline as task information without an interactive completion checkbox', async () => {
    await renderDashboard();
    const purchase = screen.getByRole('link', { name: /Commande de pièces/ });
    const fleet = screen.getByRole('link', { name: /Visite annuelle du navire/ });

    expect(within(purchase).getByText('Aujourd’hui')).toBeVisible();
    expect(within(purchase).getByText('Achats · GOURY · Aujourd’hui')).toBeVisible();
    expect(within(fleet).getByTitle('Visite le 9 oct')).toHaveTextContent('9 oct. 2026');
    expect(within(fleet).getByText('Flotte · KROKDUR · Visite le 9 oct')).toBeVisible();
    expect(purchase).toHaveAccessibleName('Commande de pièces. Achats · GOURY. Aujourd’hui. Suivre la commande');
    expect(fleet).toHaveAccessibleName('Visite annuelle du navire. Flotte · KROKDUR. Visite le 9 oct. Ouvrir le certificat');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(within(purchase).queryByRole('button')).not.toBeInTheDocument();
    expect(within(fleet).queryByRole('button')).not.toBeInTheDocument();
  });

  it('distinguishes expired and working-time alerts from deadlines due today', async () => {
    vi.mocked(fetchManagerHomeDashboard).mockResolvedValue({
      items: [
        ...ITEMS,
        item({
          id: 'expired-certificate', group: 'fleetDocuments', tags: ['documents', 'fleet'],
          title: 'Certificat de sécurité expiré', context: 'Flotte · GOURY',
          deadline: 'Expiré depuis 12 j', action: 'Renouveler le certificat', to: '/modules/certificates',
          dueDate: TODAY,
        }),
        item({
          id: 'working-time-alert', group: 'workingTime', tags: ['workingTime'],
          title: 'Repos continu insuffisant', context: 'Temps de travail · Arthur',
          deadline: 'Repos continu limité à 5 h', action: 'Vérifier le repos', to: '/modules/workingTime',
          dueDate: TODAY,
        }),
      ],
      vessels: [GOURY, KROKDUR], unavailableSources: [], scopeLabel: null,
    });
    await renderDashboard();

    const certificate = screen.getByRole('link', { name: /Certificat de sécurité expiré/ });
    const workingTime = screen.getByRole('link', { name: /Repos continu insuffisant/ });
    expect(within(certificate).getByText('En retard')).toHaveClass('is-danger');
    expect(within(certificate).queryByText('Aujourd’hui')).not.toBeInTheDocument();
    expect(certificate).toHaveAccessibleName(/Expiré depuis 12 j/);
    expect(within(workingTime).getByText('Alerte')).toHaveClass('is-danger');
    expect(within(workingTime).queryByText('Aujourd’hui')).not.toBeInTheDocument();
    expect(workingTime).toHaveAccessibleName(/Repos continu limité à 5 h/);
    expect(workingTime).toHaveAccessibleName(/GOURY/);
  });
});
