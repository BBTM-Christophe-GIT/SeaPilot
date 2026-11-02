import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ProcessPerformancePanel, ProcessPerformanceRadar } from './ProcessPerformanceRadar';
import type { ProcessPerformance } from './processPerformance';
import { fetchProcessPerformanceDashboard } from './processPerformanceQueries';

vi.mock('./processPerformanceQueries', () => ({ fetchProcessPerformanceDashboard: vi.fn() }));

function process(overrides: Partial<ProcessPerformance> = {}): ProcessPerformance {
  return { key: 'humanResources', label: 'Ressources humaines', shortLabel: 'RH', to: '/modules/humanResources', score: 60,
    summary: '1 entretien réalisé · 2 planifiés', unavailableSources: [],
    criteria: [{ id: 'medical', label: 'Conformité médicale', score: 100, weight: 30, detail: 'Visite valide.' }],
    tasks: [{ id: '1', title: 'Certificat sécurité', context: 'ADAM DEBORDEAUX', state: 'unplanned', dueOn: '2026-11-20', scheduledOn: '', location: '', to: '/modules/humanResources?person=32&document=1&actions=1' }], ...overrides };
}

describe('interactive process radar', () => {
  it('removes previously privileged data immediately when the real profile or permissions change', async () => {
    const client = {} as SupabaseClient;
    const oldProcess = process({ summary: 'SECRET compagnie', tasks: [{ ...process().tasks[0], title: 'SECRET collaborateur' }] });
    vi.mocked(fetchProcessPerformanceDashboard).mockResolvedValueOnce({ processes: [oldProcess], scopeLabel: 'Périmètre compagnie', entities: [{ id: 9, name: 'SECRET navire', assetKind: 'vessel', processes: [oldProcess] }] }).mockImplementationOnce(() => new Promise(() => {}));
    const { rerender } = render(<MemoryRouter><ProcessPerformanceRadar client={client} roles={['admin']} personId={1} moduleKeys={['humanResources']} /></MemoryRouter>);
    expect(await screen.findByRole('link', { name: /SECRET collaborateur/ })).toBeVisible();
    rerender(<MemoryRouter><ProcessPerformanceRadar client={client} roles={['marin']} personId={2} moduleKeys={['humanResources']} /></MemoryRouter>);
    expect(screen.queryByRole('link', { name: /SECRET collaborateur/ })).toBeNull();
    expect(screen.queryByText('SECRET compagnie')).toBeNull();
    expect(screen.queryByText('SECRET navire')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Lecture des processus');
  });

  it('selects the priority process then opens a keyboard-accessible breakdown and precise task links', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><ProcessPerformancePanel today="2026-11-01" processes={[process(), process({ key: 'internalAudits', label: 'Audits ISM internes', shortLabel: 'Audits ISM', score: 0, summary: 'Aucun audit planifié', to: '/modules/internalAudits', tasks: [] })]} /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Audits ISM internes');
    await user.click(within(screen.getByRole('group', { name: 'Sélectionner un processus' })).getByRole('button', { name: /Ressources humaines/ }));
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Ressources humaines');
    expect(within(screen.getByRole('group', { name: 'Sélectionner un processus' })).getByRole('button', { name: /Ressources humaines/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('progressbar', { name: 'Conformité médicale' })).toHaveAttribute('value', '100');
    expect(screen.getByRole('link', { name: /Certificat sécurité/ })).toHaveAttribute('href', '/modules/humanResources?person=32&document=1&actions=1');
    expect(screen.getByRole('img')).toHaveAccessibleName(/Composantes du score Ressources humaines sur 100/);
    await user.click(within(screen.getByRole('group', { name: 'Sélectionner un processus' })).getByRole('button', { name: /Ressources humaines/ }));
    expect(within(screen.getByRole('group', { name: 'Sélectionner un processus' })).getByRole('button', { name: /Ressources humaines/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('img')).toHaveAccessibleName(/Performance des processus sur 100/);
  });

  it('shows explicit unknown state and never draws unavailable axes as zero compliance', () => {
    render(<MemoryRouter><ProcessPerformancePanel today="2026-11-01" processes={[process({ score: null, unavailableSources: ['Planification RH'], tasks: [] })]} /></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent('Sources indisponibles : Planification RH');
    expect(screen.getByRole('img')).toHaveAccessibleName(/Ressources humaines : indisponible/);
    expect(screen.getByRole('img')).toHaveAccessibleName(/indisponible/);
  });

  it('reveals more tasks without losing the selected process', async () => {
    const user = userEvent.setup();
    const base = process();
    const tasks = Array.from({ length: 12 }, (_, index) => ({ ...base.tasks[0], id: String(index), title: `Certificat ${index}` }));
    render(<MemoryRouter><ProcessPerformancePanel today="2026-11-01" processes={[process({ tasks })]} /></MemoryRouter>);
    expect(screen.getAllByRole('link', { name: /Certificat/ })).toHaveLength(5);
    await user.click(screen.getByRole('button', { name: /Voir 7 actions de plus/ }));
    expect(screen.getAllByRole('link', { name: /Certificat/ })).toHaveLength(12);
    const details = screen.getByText('Comment lire ces scores ?').closest('details')!;
    await user.click(within(details).getByText('Comment lire ces scores ?'));
    expect(details).toHaveAttribute('open');
  });

  it('filters scores and actions by unit then restores the complete company scope', async () => {
    const user = userEvent.setup();
    const vessel = process({ score: 20, summary: 'Brevet GOURY à traiter', tasks: [{ ...process().tasks[0], title: 'Action GOURY' }] });
    render(<MemoryRouter><ProcessPerformancePanel today="2026-11-01" processes={[process()]} entities={[
      { id: 1, name: 'GOURY', assetKind: 'vessel', processes: [vessel] },
      { id: 2, name: 'Bureau Cherbourg', assetKind: 'office', processes: [process({ score: null, tasks: [] })] },
    ]} /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: /Périmètre compagnie/ }));
    await user.click(screen.getByRole('menuitem', { name: /GOURY/ }));
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('20 %');
    expect(screen.getByRole('link', { name: /Action GOURY/ })).toBeVisible();
    expect(screen.queryByRole('link', { name: /Certificat sécurité/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Périmètre du radar : GOURY' }));
    await user.click(screen.getByRole('menuitem', { name: /Périmètre compagnie/ }));
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('60 %');
    expect(screen.getByRole('link', { name: /Certificat sécurité/ })).toBeVisible();
  });

  it('compares accessible units on common process axes and then on criterion axes', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><ProcessPerformancePanel today="2026-11-01" processes={[process()]} scopeLabel="Votre périmètre" entities={[
      { id: 1, name: 'GOURY', assetKind: 'vessel', processes: [process({ score: 20, criteria: [{ id: 'medical', label: 'Conformité médicale', weight: 30, score: 40, detail: 'À traiter' }] })] },
      { id: 2, name: 'Quai Le Havre', assetKind: 'quay', processes: [process({ score: 80 })] },
    ]} /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Comparer les unités' }));
    expect(screen.getByRole('group', { name: /Navires, bureaux et quais/ })).toBeVisible();
    expect(screen.getByRole('img')).toHaveAccessibleName(/GOURY/);
    expect(screen.getByRole('img')).toHaveAccessibleName(/Quai Le Havre/);
    await user.click(within(screen.getByRole('group', { name: 'Sélectionner un processus' })).getByRole('button', { name: /Ressources humaines/ }));
    expect(screen.getByRole('img')).toHaveAccessibleName(/Composantes du score Ressources humaines/);
    expect(screen.getByRole('img')).toHaveAccessibleName(/40/);
    await user.click(screen.getByRole('button', { name: 'Vue globale' }));
    expect(screen.getByRole('img')).toHaveAccessibleName(/Performance des processus/);
    await user.click(screen.getByRole('checkbox', { name: 'GOURY' }));
    await user.click(screen.getByRole('checkbox', { name: 'Quai Le Havre' }));
    expect(screen.getByRole('status')).toHaveTextContent('Sélectionnez au moins une unité');
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByText('Périmètre compagnie')).toBeNull();
  });
});
