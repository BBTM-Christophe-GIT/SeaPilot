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
  expect(target).not.toHaveAttribute('data-drop-active');
}

describe('OrgDiagramCanvas', () => {
  it('pans the scrollable diagram with the left mouse button held on the background', async () => {
    setup();
    const canvas = screen.getByLabelText('Diagramme défilant');
    const setPointerCapture = vi.fn();
    Object.defineProperties(canvas, {
      clientWidth: { value: 200 },
      clientHeight: { value: 120 },
      scrollWidth: { value: 400 },
      scrollHeight: { value: 300 },
      setPointerCapture: { value: setPointerCapture },
    });
    const start = { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 80, clientY: 60 };
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Déplacer Élodie MARTIN' }), start);
    expect(setPointerCapture).not.toHaveBeenCalled();

    fireEvent.pointerDown(screen.getByRole('img', { name: 'Organigramme' }), start);
    expect(setPointerCapture).toHaveBeenCalledWith(1);
    expect(canvas).toHaveAttribute('data-panning', 'true');
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 30, clientY: 20 });
    await waitFor(() => {
      expect(canvas.scrollLeft).toBe(50);
      expect(canvas.scrollTop).toBe(40);
    });
    fireEvent.pointerUp(canvas, { pointerId: 1 });
    expect(canvas).toHaveAttribute('data-panning', 'false');
  });

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

  it('assigns a card from Sans affectation to an existing watch on the diagram', async () => {
    const { container, onSaved, rpc } = setup();
    const target = container.querySelector<HTMLElement>('[data-org-watch-id="4"]')!;
    drag(screen.getByRole('button', { name: 'Déplacer Chloé GARCIA' }), target);

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(rpc).toHaveBeenCalledExactlyOnceWith('move_organigramme_watch_member', {
      p_chart_id: 12, p_person_id: 10, p_from_watch_id: null, p_to_vessel_id: 2, p_to_watch_id: 4,
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Déplacer Camille DUMONT' })).not.toBeInTheDocument();
  });

  it('offers the sole vessel without a saved watch to an unassigned card through the inline chooser', async () => {
    const { onSaved, rpc } = setup({ view: 'functions' }, { ...chart, vessels: chart.vessels.slice(-1), watches: [], memberships: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Déplacer Chloé GARCIA' }));
    const select = screen.getByRole('combobox', { name: 'Bordée de destination' });
    expect(within(select).getByRole('option', { name: 'NOUVEAU NAVIRE · Bordée 1 (à créer)' })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'vessel:9' } });
    fireEvent.click(screen.getByRole('button', { name: /^Déplacer$/ }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(rpc).toHaveBeenCalledExactlyOnceWith('move_organigramme_watch_member', {
      p_chart_id: 12, p_person_id: 10, p_from_watch_id: null, p_to_vessel_id: 9, p_to_watch_id: null,
    });
  });

  it('keeps historical views and function cards spanning several watches read-only', () => {
    const historical = setup({}, { ...chart, asOf: '2000-01-01' });
    expect(within(historical.container).queryByRole('button', { name: 'Déplacer Élodie MARTIN' })).not.toBeInTheDocument();
    expect(within(historical.container).queryByRole('button', { name: 'Déplacer Chloé GARCIA' })).not.toBeInTheDocument();
    const ambiguous = setup({ view: 'functions' }, { ...chart, memberships: [...chart.memberships, {
      personId: 2, vesselId: 2, watchGroup: 'Bordée 2', source: 'manual', functionLabel: 'Capitaine',
    }] });
    expect(within(ambiguous.container).queryByRole('button', { name: 'Déplacer Élodie MARTIN' })).not.toBeInTheDocument();
  });

  it('colors an office card from its right-click menu on the selected chart', async () => {
    const { onSaved, rpc } = setup();
    const card = screen.getByRole('button', { name: 'Couleur et fonction de Camille DUMONT' });
    fireEvent.contextMenu(card, { clientX: 200, clientY: 130 });
    const menu = screen.getByRole('menu', { name: 'Couleur et fonction de Camille DUMONT' });
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Bleu pâle' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(rpc).toHaveBeenCalledExactlyOnceWith('save_organigramme_card_setting', {
      p_chart_id: 12, p_person_id: 1, p_field: 'color', p_value: 'blue',
    });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens the menu from a crew card using Shift+F10 and returns focus on Escape', async () => {
    const { rpc } = setup();
    const card = screen.getByRole('button', { name: 'Déplacer Élodie MARTIN' });
    card.focus();
    fireEvent.keyDown(card, { key: 'F10', shiftKey: true });
    const firstAction = screen.getByRole('menuitem', { name: 'Fonction temporaire…' });
    await waitFor(() => expect(firstAction).toHaveFocus());
    fireEvent.keyDown(firstAction, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(card).toHaveFocus();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('provides a touch path to the menu and resets a custom color', async () => {
    const { onSaved, rpc } = setup({}, { ...chart, cardColors: { 2: 'green' } });
    fireEvent.click(screen.getByRole('button', { name: 'Déplacer Élodie MARTIN' }));
    fireEvent.click(screen.getByRole('button', { name: 'Actions de la carte' }));
    const menu = screen.getByRole('menu', { name: 'Couleur et fonction de Élodie MARTIN' });
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Couleur par défaut' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(rpc).toHaveBeenCalledExactlyOnceWith('save_organigramme_card_setting', {
      p_chart_id: 12, p_person_id: 2, p_field: 'color', p_value: null,
    });
  });

  it('edits a chart-local temporary function and keeps the draft when saving fails', async () => {
    const save = vi.fn().mockResolvedValueOnce({ error: { message: 'Indisponible' } }).mockResolvedValue({ error: null });
    const { onSaved, rpc } = setup({}, { ...chart, temporaryFunctions: { 2: 'Rôle précédent' } }, save);
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Déplacer Élodie MARTIN' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Fonction temporaire…' }));
    const dialog = screen.getByRole('dialog', { name: 'Fonction temporaire de Élodie MARTIN' });
    const field = within(dialog).getByRole('textbox', { name: 'Fonction temporaire' });
    expect(field).toHaveValue('Rôle précédent');
    expect(field).toHaveFocus();
    fireEvent.change(field, { target: { value: '  Responsable de quart  ' } });
    const submit = within(dialog).getByRole('button', { name: 'Enregistrer' });
    fireEvent.click(submit);

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Impossible de personnaliser cette carte.');
    expect(field).toHaveValue('  Responsable de quart  ');
    expect(onSaved).not.toHaveBeenCalled();
    fireEvent.click(submit);

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(rpc).toHaveBeenLastCalledWith('save_organigramme_card_setting', {
      p_chart_id: 12, p_person_id: 2, p_field: 'temporary_function', p_value: 'Responsable de quart',
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('removes the temporary function using the same selected chart', async () => {
    const { onSaved, rpc } = setup({}, { ...chart, temporaryFunctions: { 2: 'Rôle précédent' } });
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Déplacer Élodie MARTIN' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Fonction temporaire…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retirer la fonction temporaire' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(rpc).toHaveBeenCalledExactlyOnceWith('save_organigramme_card_setting', {
      p_chart_id: 12, p_person_id: 2, p_field: 'temporary_function', p_value: null,
    });
  });

  it('returns a crew card to Sans affectation even when this is the only watch', async () => {
    const { onSaved, rpc } = setup({}, {
      ...chart, vessels: chart.vessels.slice(0, 1), watches: chart.watches?.filter((watch) => watch.id === 1),
      memberships: chart.memberships.filter((row) => row.vesselId === 1 && row.watchGroup === 'Bordée 1'),
    });
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Couleur et fonction de Élodie MARTIN' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remettre sans affectation' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(rpc).toHaveBeenCalledExactlyOnceWith('remove_organigramme_watch_member', { p_chart_id: 12, p_person_id: 2, p_watch_id: 1 });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Élodie MARTIN quitte GOURY · Bordée 1.');
    expect(screen.getByRole('status')).toHaveFocus();
  });

  it('removes only the exact watch chosen through the touch menu and keeps other assignments', async () => {
    const duplicate = { ...chart.memberships.find((row) => row.personId === 2)!, vesselId: 2, watchGroup: 'Bordée 2' };
    const save = vi.fn().mockResolvedValueOnce({ error: { message: 'Indisponible' } }).mockResolvedValue({ error: null });
    const { onSaved, rpc } = setup({ vesselIds: [1] }, { ...chart, memberships: [...chart.memberships, duplicate] }, save);
    fireEvent.click(screen.getByRole('button', { name: 'Déplacer Élodie MARTIN' }));
    const touchMenu = screen.getByRole('button', { name: 'Actions de la carte' });
    fireEvent.click(touchMenu);
    expect(screen.queryByRole('menuitem', { name: 'Remettre sans affectation' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Retirer de cette bordée' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de retirer ce collaborateur de sa bordée.');
    expect(onSaved).not.toHaveBeenCalled();
    fireEvent.click(touchMenu);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Retirer de cette bordée' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(rpc).toHaveBeenLastCalledWith('remove_organigramme_watch_member', { p_chart_id: 12, p_person_id: 2, p_watch_id: 1 });
    expect(screen.queryByRole('combobox', { name: 'Bordée de destination' })).not.toBeInTheDocument();
  });

  it('labels removal from a sedentary collaborator’s watch without promising a Sans affectation card', () => {
    setup({}, { ...chart, people: chart.people.map((person) => person.id === 2 ? { ...person, population: 'sedentary' } : person) });
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Déplacer Élodie MARTIN' }));
    expect(screen.getByRole('menuitem', { name: 'Retirer de cette bordée' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Remettre sans affectation' })).not.toBeInTheDocument();
  });

  it('omits assignment removal for unassigned, aggregate and historical cards', () => {
    const duplicate = { ...chart.memberships.find((row) => row.personId === 2)!, vesselId: 2, watchGroup: 'Bordée 2' };
    const { container, rpc } = setup({ view: 'functions' }, { ...chart, memberships: [...chart.memberships, duplicate] });
    for (const card of ['Déplacer Chloé GARCIA', 'Couleur et fonction de Élodie MARTIN']) {
      fireEvent.contextMenu(within(container).getByRole('button', { name: card }));
      const menu = screen.getByRole('menu');
      expect(within(menu).queryByRole('menuitem', { name: /Remettre sans affectation|Retirer de cette bordée/ })).not.toBeInTheDocument();
      fireEvent.keyDown(menu, { key: 'Escape' });
    }
    expect(rpc).not.toHaveBeenCalled();
    const historical = setup({}, { ...chart, asOf: '2000-01-01' });
    expect(within(historical.container).queryByRole('button', { name: /Élodie MARTIN/ })).not.toBeInTheDocument();
  });
});
