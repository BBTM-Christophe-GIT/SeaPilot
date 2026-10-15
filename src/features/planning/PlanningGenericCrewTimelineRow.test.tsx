import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PlanningGenericCrewTimelineRow } from './PlanningGenericCrewTimelineRow';
import { buildPlanningTimeline } from './planningModel';
import type { GenericCrewRow } from './planningGenericCrew';

describe('generic crew paternity status editing', () => {
  it('opens legacy paternity leave with the canonical selection and writes it only after explicit save', async () => {
    const row: GenericCrewRow = {
      id: 1, revision: 3, vesselId: 10, watchGroup: 'Bordée 2', functionLabel: 'Capitaine',
      periods: [{ id: 'legacy', startsOn: '2026-10-15', endsOn: '2026-10-16', status: 'Congés Paternités', comments: 'Période héritée' }],
    };
    const rpc = vi.fn().mockResolvedValue({ data: {
      id: row.id, revision: 4, vessel_id: row.vesselId, watch_group: row.watchGroup, function_label: row.functionLabel,
      periods: [{ ...row.periods[0], status: 'Congés Paternité' }],
    }, error: null });
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<PlanningGenericCrewTimelineRow client={{ rpc } as never} row={row} vessel="GOURY"
      days={buildPlanningTimeline('2026-10-15', 'month')} dayWidth={52} onChange={onChange} onReplace={vi.fn()} />);

    fireEvent.doubleClick(container.querySelector('.planning-crew-bar')!);
    let dialog = await screen.findByRole('dialog', { name: 'Préparer le planning · Capitaine' });
    expect(within(dialog).getByLabelText('Statut')).toHaveValue('Congés Paternité');
    expect(rpc).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    expect(rpc).not.toHaveBeenCalled();
    expect(row.periods[0].status).toBe('Congés Paternités');

    fireEvent.doubleClick(container.querySelector('.planning-crew-bar')!);
    dialog = await screen.findByRole('dialog', { name: 'Préparer le planning · Capitaine' });
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(rpc).toHaveBeenCalledExactlyOnceWith('planning_save_generic_crew_row', expect.objectContaining({
      p_periods: [{ ...row.periods[0], status: 'Congés Paternité' }], p_row_id: 1, p_expected_revision: 3,
    }));
    expect(onChange).toHaveBeenCalledOnce();
  });
});
