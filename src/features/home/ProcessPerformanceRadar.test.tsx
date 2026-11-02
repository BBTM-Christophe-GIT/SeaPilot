import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ProcessPerformancePanel, ProcessPerformanceRadar } from './ProcessPerformanceRadar';
import type { ProcessPerformance } from './processPerformance';
import { fetchProcessPerformance } from './processPerformanceQueries';

vi.mock('./processPerformanceQueries', () => ({ fetchProcessPerformance: vi.fn() }));

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
    vi.mocked(fetchProcessPerformance).mockResolvedValueOnce([oldProcess]).mockImplementationOnce(() => new Promise(() => {}));
    const { rerender } = render(<MemoryRouter><ProcessPerformanceRadar client={client} roles={['admin']} personId={1} moduleKeys={['humanResources']} /></MemoryRouter>);
    expect(await screen.findByRole('link', { name: /SECRET collaborateur/ })).toBeVisible();
    rerender(<MemoryRouter><ProcessPerformanceRadar client={client} roles={['marin']} personId={2} moduleKeys={['humanResources']} /></MemoryRouter>);
    expect(screen.queryByRole('link', { name: /SECRET collaborateur/ })).toBeNull();
    expect(screen.queryByText('SECRET compagnie')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Lecture des processus');
  });

  it('selects the priority process then opens a keyboard-accessible breakdown and precise task links', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><ProcessPerformancePanel today="2026-11-01" processes={[process(), process({ key: 'internalAudits', label: 'Audits ISM internes', shortLabel: 'Audits ISM', score: 0, summary: 'Aucun audit planifié', to: '/modules/internalAudits', tasks: [] })]} /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Audits ISM internes');
    await user.click(screen.getByRole('button', { name: /Ressources humaines/ }));
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Ressources humaines');
    expect(screen.getByRole('button', { name: /Ressources humaines/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('progressbar', { name: 'Conformité médicale' })).toHaveAttribute('value', '100');
    expect(screen.getByRole('link', { name: /Certificat sécurité/ })).toHaveAttribute('href', '/modules/humanResources?person=32&document=1&actions=1');
    expect(screen.getByRole('img')).toHaveAccessibleName(/Performance des processus sur 100/);
  });

  it('shows explicit unknown state and never draws unavailable axes as zero compliance', () => {
    render(<MemoryRouter><ProcessPerformancePanel today="2026-11-01" processes={[process({ score: null, unavailableSources: ['Planification RH'], tasks: [] })]} /></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent('Sources indisponibles : Planification RH');
    expect(screen.getByRole('img')).toHaveAccessibleName(/Ressources humaines : indisponible/);
    expect(screen.getByText(/1 processus non noté/)).toBeVisible();
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
});
