import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { OrgDiagramCanvas } from './OrgDiagramCanvas';
import { layoutOrganigramme, organigrammeSvg } from './organigrammeDiagram';
import { ORG_DEMO } from './organigrammeFixtures';
import { buildOrganigramme, orgLocalDate, type OrgData, type OrgOptions } from './organigrammeModel';

const options: OrgOptions = { view: 'vessels', vesselIds: null, includeOffice: true, includeExternal: true, includeUnassigned: true, showVessels: true };
const chart: OrgData = {
  ...ORG_DEMO, chartId: 12, asOf: orgLocalDate(),
  vessels: [...ORG_DEMO.vessels, { id: 9, name: 'NOUVEAU NAVIRE', lengthOverall: 14 }],
};

function setup(view: Partial<OrgOptions> = {}, data = chart, rpc = vi.fn().mockResolvedValue({ error: null })) {
  const diagram = layoutOrganigramme(buildOrganigramme(data, { ...options, ...view }));
  const client = { rpc } as unknown as SupabaseClient;
  const onSaved = vi.fn();
  const { container } = render(<OrgDiagramCanvas
    canvasRef={null} client={client} data={data} diagram={diagram} imageSrc="data:image/svg+xml,chart"
    imageAlt="Organigramme" zoom={90} disabled={false} onSaved={onSaved}
  />);
  return { container, diagram, onSaved, rpc };
}

function drag(source: HTMLElement, target: HTMLElement) {
  const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' };
  fireEvent.dragStart(source, { dataTransfer });
  fireEvent.dragOver(target, { dataTransfer });
  expect(target).toHaveAttribute('data-drop-active', 'true');
  fireEvent.drop(target, { dataTransfer });
}

describe('OrgDiagramCanvas', () => {
  it('moves a chart card directly into an empty watch even if watch names are hidden', async () => {
    const { container, diagram, rpc, onSaved } = setup({ showWatches: false });
    const target = container.querySelector<HTMLElement>('[data-org-watch-id="4"]')!;
    const exported = organigrammeSvg(diagram);
    expect(exported).not.toMatch(/drop|Déplacer|NOUVEAU NAVIRE|Bordée 2/);
    expect(parseFloat(target.style.height)).toBeGreaterThan(0);

    drag(screen.getByRole('button', { name: 'Déplacer Élodie MARTIN' }), target);

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(rpc).toHaveBeenCalledExactlyOnceWith('move_organigramme_watch_member', {
      p_chart_id: 12, p_person_id: 2, p_from_watch_id: 1, p_to_vessel_id: 2, p_to_watch_id: 4,
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('offers a choice of watches inline when the card is dropped on a vessel heading', async () => {
    const { container, onSaved, rpc } = setup();
    drag(screen.getByRole('button', { name: 'Déplacer Élodie MARTIN' }), container.querySelector<HTMLElement>('[data-org-vessel-id="2"]')!);

    const select = screen.getByRole('combobox', { name: 'Bordée de destination' });
    expect(select).toHaveFocus();
    expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Choisir une bordée', 'LE ROZEL · Bordée 1', 'LE ROZEL · Bordée 2',
    ]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
    fireEvent.change(select, { target: { value: 'watch:3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Déplacer' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(screen.getByRole('status')).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Élodie MARTIN rejoint LE ROZEL · Bordée 1.');
  });

  it('shows a drop zone for a vessel without a watch even in the function view', async () => {
    const { container, rpc, onSaved } = setup({ view: 'functions' });
    const dataTransfer = { setData: vi.fn() };
    fireEvent.dragStart(screen.getByRole('button', { name: 'Déplacer Élodie MARTIN' }), { dataTransfer });
    const target = container.querySelector<HTMLElement>('[data-org-destination="vessel:9"]')!;
    expect(target).toHaveTextContent('NOUVEAU NAVIRE · Bordée 1 (à créer)');
    fireEvent.drop(target, { dataTransfer });

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(rpc).toHaveBeenCalledExactlyOnceWith('move_organigramme_watch_member', {
      p_chart_id: 12, p_person_id: 2, p_from_watch_id: 1, p_to_vessel_id: 9, p_to_watch_id: null,
    });
  });

  it('opens and cancels the inline keyboard and touch alternative directly from the card', async () => {
    setup({ vesselIds: [1] });
    const source = screen.getByRole('button', { name: 'Déplacer Élodie MARTIN' });
    fireEvent.click(source);
    const select = screen.getByRole('combobox', { name: 'Bordée de destination' });
    expect(within(select).queryByRole('option', { name: 'GOURY · Bordée 1' })).not.toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'LE ROZEL · Bordée 1' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'NOUVEAU NAVIRE · Bordée 1 (à créer)' })).toBeInTheDocument();
    fireEvent.keyDown(select, { key: 'Escape' });
    expect(screen.queryByRole('combobox', { name: 'Bordée de destination' })).not.toBeInTheDocument();
    expect(source).toHaveFocus();
  });

  it('keeps historical views and function cards spanning several watches read-only', () => {
    const historical = setup({}, { ...chart, asOf: '2000-01-01' });
    expect(within(historical.container).queryByRole('button', { name: 'Déplacer Élodie MARTIN' })).not.toBeInTheDocument();
    const ambiguous = setup({ view: 'functions' }, { ...chart, memberships: [...chart.memberships, {
      personId: 2, vesselId: 2, watchGroup: 'Bordée 2', source: 'manual', functionLabel: 'Capitaine',
    }] });
    expect(within(ambiguous.container).queryByRole('button', { name: 'Déplacer Élodie MARTIN' })).not.toBeInTheDocument();
  });
});
