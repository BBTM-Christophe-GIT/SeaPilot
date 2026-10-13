import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkingTimePreview } from './WorkingTimePreview';
import type { WorkingTimePreviewPdfInput } from './workingTimePreviewPdf';

const { buildPdf, savePdf } = vi.hoisted(() => ({ buildPdf: vi.fn(), savePdf: vi.fn() }));
vi.mock('./workingTimePreviewPdf', () => ({ buildWorkingTimePreviewPdf: buildPdf }));

function graph() {
  return screen.getByRole('img', { name: /(?:Projection en cours de saisie|Analyse des périodes enregistrées)/ });
}

function grid() {
  return screen.getByRole('grid', { name: /Grille horaire du/ });
}

function selectClockRange(start: string, endSlot: string) {
  const cells = within(grid());
  cells.getAllByRole('gridcell').forEach((cell, index) => {
    vi.spyOn(cell, 'getBoundingClientRect').mockReturnValue({
      x: 100 + index * 20, y: 100, left: 100 + index * 20, right: 100 + (index + 1) * 20,
      width: 20, height: 90, top: 100, bottom: 190, toJSON: () => ({}),
    });
  });
  const first = cells.getByRole('gridcell', { name: new RegExp(`^${start},`) });
  const last = cells.getByRole('gridcell', { name: new RegExp(`^${endSlot},`) });
  const dispatchPointer = (type: string, clientX: number) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY: 140, button: 0 });
    Object.defineProperties(event, { pointerId: { value: 17 }, pointerType: { value: 'touch' }, isPrimary: { value: true } });
    fireEvent(first, event);
  };
  dispatchPointer('pointerdown', first.getBoundingClientRect().left + 10);
  dispatchPointer('pointermove', last.getBoundingClientRect().left + 10);
  dispatchPointer('pointerup', last.getBoundingClientRect().left + 10);
}

describe('WorkingTimePreview real entry workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildPdf.mockReturnValue({ document: { save: savePdf }, filename: 'preversion.pdf' });
  });

  it('updates the actual entry graph when the pending phase is removed without removing recorded work', async () => {
    const user = userEvent.setup();
    render(<WorkingTimePreview />);

    expect(graph()).toHaveAccessibleName(/Cumul : 13 h 00.*Dépassement \+1 h 00.*Seuil atteint à 19 h 00/);
    expect(screen.getAllByRole('gridcell')).toHaveLength(48);

    await user.click(screen.getByRole('button', { name: 'Retirer la période 1' }));

    expect(graph()).toHaveAccessibleName(/Analyse des périodes enregistrées.*Cumul : 11 h 00.*Aucun dépassement/);
    // The rolling window also contains five hours of J-1; today's six hours stay recorded.
    expect(within(grid()).getAllByRole('gridcell', { name: /travail enregistré/ })).toHaveLength(12);
    expect(screen.queryByText(/Seuil atteint à/)).not.toBeInTheDocument();
    expect(within(grid()).getByRole('gridcell', { name: /^06:00, travail enregistré/ })).toBeInTheDocument();
    expect(within(grid()).getByRole('gridcell', { name: /^13:00, repos/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retirer la période 1' })).not.toBeInTheDocument();
  });

  it('records a draft, clears the selection and leaves the day unsigned and unapproved', async () => {
    const user = userEvent.setup();
    render(<WorkingTimePreview />);
    await user.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));

    expect(await screen.findByText('Brouillon enregistré dans la préversion.')).toBeInTheDocument();
    expect(graph()).toHaveAccessibleName(/Analyse des périodes enregistrées.*Cumul : 13 h 00/);
    expect(within(grid()).getByRole('gridcell', { name: /^13:00, travail enregistré/ })).not.toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('button', { name: 'Retirer la période 1' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer le brouillon' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /^Approbation$/ }));
    expect(screen.getByText('Signature en attente')).toBeInTheDocument();
    expect(screen.getByText('Approbation en attente')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Valider la journée' })).not.toBeInTheDocument();
  });

  it('requires all five explanations before submission and preserves the deviation after captain approval', async () => {
    const user = userEvent.setup();
    render(<WorkingTimePreview />);
    await user.click(screen.getByRole('button', { name: 'Valider' }));
    const dialog = await screen.findByRole('dialog', { name: 'Justifier la journée' });
    const fields = within(dialog).getAllByRole('textbox');
    expect(fields).toHaveLength(5);
    for (const field of fields) expect(field).toBeRequired();

    await user.click(within(dialog).getByRole('button', { name: 'Valider la saisie des heures et la justification' }));
    expect(dialog).toBeInTheDocument();
    expect(screen.queryByText('Journée signée et soumise dans la préversion.')).not.toBeInTheDocument();
    await user.type(within(dialog).getByRole('textbox', { name: 'Catégorie de cause' }), 'Opération imprévue');
    await user.type(within(dialog).getByRole('textbox', { name: 'Contexte opérationnel' }), 'Manoeuvre portuaire prolongée');
    await user.type(within(dialog).getByRole('textbox', { name: 'Action immédiate' }), 'Relève organisée');
    await user.type(within(dialog).getByRole('textbox', { name: 'Repos compensateur prévu' }), 'Repos prévu le lendemain');
    await user.click(within(dialog).getByRole('button', { name: 'Valider la saisie des heures et la justification' }));

    expect(await screen.findByText('Journée signée et soumise dans la préversion.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Valider la journée' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Valider la journée' }));
    expect(await screen.findByText('Journée approuvée dans la préversion.')).toBeInTheDocument();
    expect(graph()).toHaveAccessibleName(/Cumul : 13 h 00.*Dépassement \+1 h 00/);
    expect(within(grid()).getByRole('gridcell', { name: /^13:00, travail enregistré/ })).toBeDisabled();
    await user.click(screen.getByText('Historique des actions'));
    expect(screen.getByText(/Justification : Opération imprévue · Manoeuvre portuaire prolongée · Relève organisée · Repos prévu le lendemain/)).toBeVisible();
  });

  it('corrects a recorded phase and requires a recorded reason before withdrawing it', async () => {
    const user = userEvent.setup();
    render(<WorkingTimePreview />);
    await user.click(screen.getByRole('button', { name: 'Retirer la période 1' }));
    await user.click(within(grid()).getByRole('gridcell', { name: /^06:00, travail enregistré/ }));
    await user.click(screen.getByRole('button', { name: 'Corriger' }));
    selectClockRange('06:00', '09:30');
    await user.click(screen.getByRole('button', { name: 'Enregistrer la correction' }));

    expect(await screen.findByText('Brouillon enregistré dans la préversion.')).toBeInTheDocument();
    expect(graph()).toHaveAccessibleName(/Cumul : 11 h 00/);
    expect(within(grid()).getAllByRole('gridcell', { name: /travail enregistré/ })).toHaveLength(8);
    expect(within(grid()).getByRole('gridcell', { name: /^10:00, repos/ })).toBeInTheDocument();
    await user.click(within(grid()).getByRole('gridcell', { name: /^06:00, travail enregistré/ }));
    await user.click(screen.getByRole('button', { name: 'Retirer' }));
    const dialog = await screen.findByRole('dialog', { name: 'Motif du retrait' });
    expect(within(dialog).getByRole('textbox', { name: 'Motif' })).toBeRequired();
    await user.click(within(dialog).getByRole('button', { name: 'Confirmer' }));
    expect(dialog).toBeInTheDocument();
    await user.type(within(dialog).getByRole('textbox', { name: 'Motif' }), 'Doublon de saisie confirmé');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmer' }));

    expect(await screen.findByText(/Période retirée ; motif conservé/)).toBeInTheDocument();
    expect(graph()).toHaveAccessibleName(/Cumul : 0 h 00/);
    expect(within(grid()).getByRole('gridcell', { name: /^06:00, repos/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Approbation$/ }));
    await user.click(screen.getByText('Historique des actions'));
    expect(screen.getByText(/Retrait historisé : Doublon de saisie confirmé/)).toBeVisible();
  });

  it('restores an unrelated pending phase when a recorded-phase correction is cancelled', async () => {
    const user = userEvent.setup();
    render(<WorkingTimePreview />);
    await user.click(within(grid()).getByRole('gridcell', { name: /^06:00, travail enregistré/ }));
    await user.click(screen.getByRole('button', { name: 'Corriger' }));
    selectClockRange('06:00', '09:30');
    expect(screen.queryByRole('button', { name: 'Retirer la période 1' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(graph()).toHaveAccessibleName(/Cumul : 13 h 00.*Dépassement \+1 h 00/);
    expect(screen.getByRole('button', { name: /Période 1 13:00–20:00/ })).toBeInTheDocument();
    expect(within(grid()).getByRole('gridcell', { name: /^11:30, travail enregistré/ })).toBeInTheDocument();
  });

  it('resets the example during correction without restoring the previous custom draft or its comment', async () => {
    const user = userEvent.setup();
    render(<WorkingTimePreview />);
    await user.click(screen.getByRole('button', { name: 'Retirer la période 1' }));
    selectClockRange('20:00', '21:30');
    const comment = screen.getByRole('textbox', { name: /^Commentaire/ });
    await user.clear(comment);
    await user.type(comment, 'Brouillon personnalisé à effacer');
    await user.click(within(grid()).getByRole('gridcell', { name: /^06:00, travail enregistré/ }));
    await user.click(screen.getByRole('button', { name: 'Corriger' }));
    selectClockRange('06:00', '09:30');
    await user.click(screen.getByRole('button', { name: 'Réinitialiser l’exemple' }));

    expect(await screen.findByText('Exemple réinitialisé.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Période 1 13:00–20:00/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Période 1 20:00–22:00/ })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /^Commentaire/ })).toHaveValue('Opération prolongée — retour à quai.');
    expect(screen.queryByRole('button', { name: 'Enregistrer la correction' })).not.toBeInTheDocument();
    expect(graph()).toHaveAccessibleName(/Cumul : 13 h 00.*Dépassement \+1 h 00/);
    expect(within(grid()).getAllByRole('gridcell', { name: /travail enregistré/ })).toHaveLength(12);
  });

  it('keeps both withdrawal records distinct when the same clock range is recorded and removed twice', async () => {
    const user = userEvent.setup();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      render(<WorkingTimePreview />);
      await user.click(screen.getByRole('button', { name: 'Retirer la période 1' }));
      for (const reason of ['Première période retirée', 'Deuxième période retirée']) {
        selectClockRange('13:00', '13:30');
        await user.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
        await user.click(within(grid()).getByRole('gridcell', { name: /^13:00, travail enregistré/ }));
        await user.click(screen.getByRole('button', { name: 'Retirer' }));
        const dialog = screen.getByRole('dialog', { name: 'Motif du retrait' });
        await user.type(within(dialog).getByRole('textbox', { name: 'Motif' }), reason);
        await user.click(within(dialog).getByRole('button', { name: 'Confirmer' }));
      }
      await user.click(screen.getByRole('button', { name: /^Approbation$/ }));
      await user.click(screen.getByText('Historique des actions'));
      const archived = screen.getAllByText(/^Période retirée : 13:00–14:00/);
      expect(archived).toHaveLength(2);
      expect(archived[0]).toHaveTextContent('Première période retirée');
      expect(archived[1]).toHaveTextContent('Deuxième période retirée');
      for (const record of archived) expect(record).toBeVisible();
      expect(errors.mock.calls.flat().join(' ')).not.toMatch(/same key|duplicate key/i);
    } finally { errors.mockRestore(); }
  });

  it('keeps a pending phase on its own day when navigating away and back', async () => {
    const user = userEvent.setup();
    render(<WorkingTimePreview />);
    await user.click(screen.getByRole('tab', { name: / 14 oct/ }));

    expect(grid()).toHaveAccessibleName('Grille horaire du 2026-10-14');
    expect(graph()).toHaveAccessibleName(/Analyse des périodes enregistrées.*Cumul : 0 h 00/);
    expect(screen.queryByRole('button', { name: 'Retirer la période 1' })).not.toBeInTheDocument();
    expect(within(grid()).getByRole('gridcell', { name: /^13:00, repos/ })).not.toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('tab', { name: / 13 oct/ }));
    expect(grid()).toHaveAccessibleName('Grille horaire du 2026-10-13');
    expect(graph()).toHaveAccessibleName(/Cumul : 13 h 00.*Dépassement \+1 h 00/);
    expect(screen.getByRole('button', { name: 'Retirer la période 1' })).toBeInTheDocument();
  });

  it('recalculates the graph from edited thresholds while preserving actual hours and separate weekly controls', async () => {
    const user = userEvent.setup();
    render(<WorkingTimePreview />);
    await user.click(screen.getByRole('button', { name: 'Modifier les seuils' }));
    let dialog = screen.getByRole('dialog');
    const dailyMaximum = within(dialog).getByRole('spinbutton', { name: /^Travail.*24 h/ });
    expect(dailyMaximum).toHaveValue(12);
    expect(within(dialog).getByRole('spinbutton', { name: /^Repos.*24 h/ })).toHaveValue(10);
    expect(within(dialog).getByRole('spinbutton', { name: /^Travail.*7 jours/ })).toHaveValue(84);
    await user.clear(dailyMaximum);
    await user.type(dailyMaximum, '14');
    await user.click(within(dialog).getByRole('button', { name: 'Appliquer les seuils' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(graph()).toHaveAccessibleName(/Cumul : 13 h 00.*Aucun dépassement/);
    expect(screen.queryByText(/Seuil atteint à/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Modifier les seuils' }));
    dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('spinbutton', { name: /^Travail.*24 h/ })).toHaveValue(14);
    expect(within(dialog).getByRole('spinbutton', { name: /^Repos.*24 h/ })).toHaveValue(10);
    expect(within(dialog).getByRole('spinbutton', { name: /^Repos continu/ })).toHaveValue(6);
    const weeklyMaximum = within(dialog).getByRole('spinbutton', { name: /^Travail.*7 jours/ });
    await user.clear(weeklyMaximum);
    await user.type(weeklyMaximum, '60');
    await user.click(within(dialog).getByRole('button', { name: 'Appliquer les seuils' }));

    expect(graph()).toHaveAccessibleName(/Cumul : 13 h 00.*Aucun dépassement/);
    const weeklyWarning = screen.getByRole('heading', { name: 'Travail sur 7 jours' }).closest('article')!;
    expect(within(weeklyWarning).getByText('61 h 00')).toBeInTheDocument();
    expect(within(weeklyWarning).getByText('maximum 60 h')).toBeInTheDocument();
    expect(within(weeklyWarning).getByText('+1 h 00')).toBeInTheDocument();
  });

  it('exports only saved periods through both PDF actions and includes a pending phase only after draft save', async () => {
    const user = userEvent.setup();
    render(<WorkingTimePreview />);
    await user.click(screen.getByRole('button', { name: 'Export PDF' }));
    await waitFor(() => expect(buildPdf).toHaveBeenCalledTimes(1));
    const first = buildPdf.mock.calls[0][0] as WorkingTimePreviewPdfInput;
    const firstDay = first.days.find((day) => day.date === '2026-10-13')!;
    expect(first.kind).toBe('register');
    expect(firstDay.phases).toHaveLength(1);
    expect(firstDay.phases[0]).toMatchObject({ startsAt: '2026-10-13T06:00', endsAt: '2026-10-13T12:00' });
    expect(firstDay.comment).not.toContain('Opération prolongée');
    expect(first).not.toHaveProperty('diagnostics');
    expect(firstDay).not.toHaveProperty('rules');
    expect(savePdf).toHaveBeenCalledWith('preversion.pdf');

    await user.click(screen.getByRole('button', { name: 'Rapport de conformité' }));
    const reportDialog = await screen.findByRole('dialog', { name: 'Rapport de conformité' });
    await user.click(within(reportDialog).getByRole('button', { name: 'Exporter les données factuelles en PDF' }));
    await waitFor(() => expect(buildPdf).toHaveBeenCalledTimes(2));
    expect((buildPdf.mock.calls[1][0] as WorkingTimePreviewPdfInput).kind).toBe('report');
    expect((buildPdf.mock.calls[1][0] as WorkingTimePreviewPdfInput).days.find((day) => day.date === '2026-10-13')!.phases).toHaveLength(1);
    await user.click(within(reportDialog).getByRole('button', { name: 'Fermer' }));

    await user.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
    await user.click(screen.getByRole('button', { name: 'Export PDF' }));
    await waitFor(() => expect(buildPdf).toHaveBeenCalledTimes(3));
    const saved = (buildPdf.mock.calls[2][0] as WorkingTimePreviewPdfInput).days.find((day) => day.date === '2026-10-13')!;
    expect(saved.phases).toHaveLength(2);
    expect(saved.phases.some((phase) => phase.startsAt === '2026-10-13T13:00' && phase.endsAt === '2026-10-13T20:00')).toBe(true);
    expect(saved.approval?.status).toBe('draft');
  });

  it('shows the longest amplitude bounds and recalculates sequences from the continuous-rest threshold', async () => {
    const user = userEvent.setup();
    render(<WorkingTimePreview />);
    await user.click(screen.getByRole('tab', { name: /mer 14 oct/ }));
    selectClockRange('04:00', '07:30');
    selectClockRange('12:00', '15:30');
    selectClockRange('22:00', '23:30');

    const analysis = screen.getByLabelText('Analyse de la saisie');
    const amplitude = within(analysis).getByText('Amplitude entre repos').closest<HTMLElement>('.wtp-rule')!;
    expect(within(amplitude).getByText('12 h 00')).toBeInTheDocument();
    expect(within(amplitude).getByText('04:00–16:00')).toBeInTheDocument();
    expect(graph()).toHaveAccessibleName(/Cumul : 10 h 00.*Aucun dépassement/);
    expect(within(analysis).getByText('Historique incomplet — analyse à confirmer')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Modifier les seuils' }));
    const dialog = screen.getByRole('dialog');
    const continuousRest = within(dialog).getByRole('spinbutton', { name: /^Repos continu/ });
    await user.clear(continuousRest);
    await user.type(continuousRest, '7');
    await user.click(within(dialog).getByRole('button', { name: 'Appliquer les seuils' }));
    const warning = within(analysis).getByRole('heading', { name: 'Amplitude entre repos' }).closest('article')!;
    expect(within(warning).getByText('20 h 00')).toBeInTheDocument();
    expect(within(warning).getByText('+6 h 00')).toBeInTheDocument();
    expect(graph()).toHaveAccessibleName(/Cumul : 10 h 00.*Aucun dépassement/);
  });

  it('separates the period since the last long rest from rolling alerts without changing saved work', async () => {
    const user = userEvent.setup();
    render(<WorkingTimePreview />);
    await user.click(screen.getByRole('button', { name: 'Retirer la période 1' }));
    selectClockRange('13:00', '18:00');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
    await user.click(screen.getByRole('tab', { name: /mer 14 oct/ }));
    selectClockRange('02:00', '06:30');
    selectClockRange('08:00', '11:30');
    expect(graph()).toHaveAccessibleName(/Cumul : 14 h 30.*Dépassement \+2 h 30/);

    await user.click(screen.getByRole('button', { name: 'Depuis le dernier repos long' }));
    expect(graph()).toHaveAccessibleName(/Période observée : 13 oct., 18:30 → 14 oct., 12:00.*Cumul depuis le repos long : 9 h 00/);
    expect(graph()).toHaveAccessibleName(/Repos calculé : 8 h 30.*Repère de 24 h : 14 oct., 18:30.*bilan en cours/);
    expect(graph()).not.toHaveAccessibleName(/Aucun dépassement|Seuil atteint|Dépassement \+/);
    expect(screen.queryByText(/Seuil atteint à/)).not.toBeInTheDocument();
    const analysis = screen.getByLabelText('Analyse de la saisie');
    expect(within(analysis).getByText('Période en cours')).toBeInTheDocument();
    expect(within(analysis).getByText(/17 h 30 observées/)).toBeInTheDocument();
    expect(within(analysis).getByText('9 h 00')).toBeInTheDocument();
    expect(within(analysis).getByText('8 h 30')).toBeInTheDocument();
    expect(within(analysis).getByText('7 h 30')).toBeInTheDocument();
    expect(within(analysis).queryByText(/Aucun écart|Conforme/)).not.toBeInTheDocument();
    expect(within(analysis).getByRole('button', { name: 'Voir les 2 écarts sur 24 h / 7 jours' })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Commentaire'), 'Travail effectué — repos à examiner.');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
    expect(await screen.findByText('Brouillon enregistré dans la préversion.')).toBeInTheDocument();
    expect(graph()).toHaveAccessibleName(/Analyse des périodes enregistrées.*Cumul depuis le repos long : 9 h 00/);
    await user.click(within(analysis).getByRole('button', { name: 'Voir les 2 écarts sur 24 h / 7 jours' }));
    expect(graph()).toHaveAccessibleName(/Cumul : 14 h 30.*Dépassement \+2 h 30/);
    expect(within(analysis).getByRole('heading', { name: 'Repos sur 24 h' })).toBeInTheDocument();
    expect(within(grid()).getAllByRole('gridcell', { name: /travail enregistré/ })).toHaveLength(18);

    await user.click(screen.getByRole('button', { name: 'Modifier les seuils' }));
    const dialog = screen.getByRole('dialog');
    const continuousRest = within(dialog).getByRole('spinbutton', { name: /^Repos continu/ });
    await user.clear(continuousRest);
    await user.type(continuousRest, '8');
    await user.click(within(dialog).getByRole('button', { name: 'Appliquer les seuils' }));
    await user.click(screen.getByRole('button', { name: 'Depuis le dernier repos long' }));
    const sequence = within(analysis).getByText('Amplitude de la séquence').closest('div')!;
    expect(sequence).toHaveTextContent('30 h 00');
    expect(within(sequence).getByText('13 oct., 06:00 → 14 oct., 12:00')).toBeInTheDocument();
  });

  it('does not invent a long-rest period for a day without work', async () => {
    const user = userEvent.setup();
    render(<WorkingTimePreview />);
    await user.click(screen.getByRole('tab', { name: /mer 14 oct/ }));
    await user.click(screen.getByRole('button', { name: 'Depuis le dernier repos long' }));
    expect(screen.getByText('Début de période à confirmer')).toBeInTheDocument();
    expect(graph()).toHaveAccessibleName(/Période non identifiée/);
    expect(graph()).not.toHaveAccessibleName(/Aucun dépassement/);
  });
});
