import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppDialog } from '../../components/AppDialog';
import { SeaOperationEtaPicker } from './SeaOperationEtaPicker';

const label = 'ETA · date et heure · point 1';
const picker = (value = '', onChange = vi.fn(), disabled = false) => <SeaOperationEtaPicker label={label} value={value} onChange={onChange} disabled={disabled} />;
const openPicker = () => { fireEvent.click(screen.getByRole('button', { name: label })); return screen.getByRole('dialog', { name: 'Choisir l’ETA' }); };
afterEach(() => { vi.useRealTimers(); });

describe('SeaOperationEtaPicker', () => {
  it('opens the current Paris month immediately with Monday first and no selected date or implicit hour', () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-31T23:30:00Z'));
    const change = vi.fn(); render(picker('', change));
    fireEvent.keyDown(screen.getByRole('button', { name: label }), { key: 'Enter' });
    const calendar = screen.getByRole('grid', { name: 'Calendrier · novembre 2026' });
    expect(within(calendar).getAllByRole('columnheader').map((column) => column.getAttribute('aria-label'))).toEqual(['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']);
    expect(calendar.querySelector('[aria-selected="true"]')).toBeNull();
    expect(within(calendar).getByRole('button', { name: 'dimanche 1 novembre 2026' })).toHaveFocus();
    expect(screen.getByLabelText('Heure de l’ETA (Paris)')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Appliquer' })).toBeDisabled();
    expect(change).not.toHaveBeenCalled();
  });

  it('keeps date and explicit time local until one atomic application', () => {
    const change = vi.fn(); render(picker('', change));
    const dialog = openPicker();
    const day = within(dialog).getAllByRole('gridcell').find((cell) => cell.querySelector('button'))!.querySelector('button')!;
    fireEvent.click(day);
    expect(change).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('button', { name: 'Appliquer' })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Heure de l’ETA (Paris)'), { target: { value: '14:25' } });
    expect(change).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Appliquer' }));
    expect(change).toHaveBeenCalledOnce();
    expect(change.mock.calls[0][0]).toMatch(/^\d{4}-\d{2}-01T14:25$/);
    expect(screen.queryByRole('dialog', { name: 'Choisir l’ETA' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: label })).toHaveFocus();
  });

  it.each([[2028, 29], [2000, 29], [2100, 28]])('shows February %i with %i days and no rollover days', (year, count) => {
    render(picker(`${year}-02-12T10:00`)); openPicker();
    const grid = screen.getByRole('grid', { name: `Calendrier · février ${year}` });
    expect(within(grid).getAllByRole('button')).toHaveLength(count);
    expect(within(grid).getByRole('button', { name: new RegExp(`${count} février ${year}`) })).toBeInTheDocument();
  });

  it('keeps month navigation and keyboard focus correct across leap days and December/January', () => {
    const { rerender } = render(picker('2028-02-29T10:00')); openPicker();
    fireEvent.keyDown(screen.getByRole('button', { name: 'mardi 29 février 2028' }), { key: 'ArrowRight' });
    expect(screen.getByRole('grid', { name: 'Calendrier · mars 2028' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'mercredi 1 mars 2028' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    rerender(picker('2026-12-31T10:00')); openPicker();
    fireEvent.click(screen.getByRole('button', { name: 'Mois suivant' }));
    expect(screen.getByRole('grid', { name: 'Calendrier · janvier 2027' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'dimanche 31 janvier 2027' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Mois précédent' }));
    expect(screen.getByRole('button', { name: 'jeudi 31 décembre 2026' })).toHaveFocus();
  });

  it('preserves exact stored seconds and existing captures when Apply makes no visible change', () => {
    const change = vi.fn(); render(picker('2026-10-23T12:34:56', change)); openPicker();
    expect(screen.getByRole('grid', { name: 'Calendrier · octobre 2026' })).toBeVisible();
    expect(screen.getByLabelText('Heure de l’ETA (Paris)')).toHaveValue('12:34');
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: label })).toHaveTextContent('23/10/2026 · 12:34');
  });

  it('publishes a modified existing ETA only as minutes without UTC conversion', () => {
    const change = vi.fn(); render(picker('2026-10-23T12:34:56', change)); openPicker();
    fireEvent.change(screen.getByLabelText('Heure de l’ETA (Paris)'), { target: { value: '15:45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));
    expect(change).toHaveBeenCalledExactlyOnceWith('2026-10-23T15:45');
  });

  it.each(['2026-03-29', '2026-10-25'])('rejects nonexistent or ambiguous Paris times on %s until corrected', (date) => {
    const change = vi.fn(); render(picker(`${date}T12:00`, change)); openPicker();
    fireEvent.change(screen.getByLabelText('Heure de l’ETA (Paris)'), { target: { value: '02:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));
    expect(screen.getByRole('alert')).toHaveTextContent('inexistante ou ambiguë');
    expect(change).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Heure de l’ETA (Paris)'), { target: { value: '03:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));
    expect(change).toHaveBeenCalledExactlyOnceWith(`${date}T03:30`);
  });

  it('cancels draft edits and consumes Escape before its AppDialog without closing the operation', () => {
    const change = vi.fn(), close = vi.fn(), submit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(<AppDialog title="Opération en mer" onClose={close} onSubmit={submit}>{picker('2026-10-23T12:00', change)}</AppDialog>);
    openPicker();
    const hour = screen.getByLabelText('Heure de l’ETA (Paris)');
    fireEvent.change(hour, { target: { value: '15:00' } });
    fireEvent.keyDown(hour, { key: 'Enter' });
    expect(submit).not.toHaveBeenCalled();
    fireEvent.keyDown(hour, { key: 'Escape' });
    expect(close).not.toHaveBeenCalled(); expect(change).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Choisir l’ETA' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: label })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('button', { name: label }), { key: 'Escape', repeat: true });
    expect(close).not.toHaveBeenCalled();
    openPicker();
    expect(screen.getByLabelText('Heure de l’ETA (Paris)')).toHaveValue('12:00');
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(change).not.toHaveBeenCalled();
  });

  it('closes outside without stealing focus and opens only the newly clicked waypoint calendar', async () => {
    const user = userEvent.setup();
    render(<>{picker()}<SeaOperationEtaPicker label="ETA point 2" value="" onChange={vi.fn()} /><button type="button">Autre champ</button></>);
    openPicker();
    const outside = screen.getByRole('button', { name: 'Autre champ' });
    outside.focus(); fireEvent.pointerDown(outside);
    expect(outside).toHaveFocus();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: label }));
    await user.click(screen.getByRole('button', { name: 'ETA point 2' }));
    expect(screen.getAllByRole('dialog', { name: 'Choisir l’ETA' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'ETA point 2' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('allows Tab from the roving calendar day to the visible hour and actions', async () => {
    const user = userEvent.setup(); render(picker('2026-10-23T12:00')); openPicker();
    expect(screen.getByRole('button', { name: 'vendredi 23 octobre 2026' })).toHaveFocus();
    await user.tab(); expect(screen.getByLabelText('Heure de l’ETA (Paris)')).toHaveFocus();
    await user.tab(); expect(screen.getByRole('button', { name: 'Effacer' })).toHaveFocus();
    await user.tab(); expect(screen.getByRole('button', { name: 'Annuler' })).toHaveFocus();
    await user.tab(); expect(screen.getByRole('button', { name: 'Appliquer' })).toHaveFocus();
  });

  it('can clear a legacy time explicitly without preselecting a guessed calendar date', () => {
    const change = vi.fn(); render(picker('12:00', change));
    const dialog = openPicker();
    expect(dialog.querySelector('[aria-selected="true"]')).toBeNull();
    expect(screen.getByLabelText('Heure de l’ETA (Paris)')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Effacer' }));
    expect(change).toHaveBeenCalledExactlyOnceWith('');
  });

  it('blocks both explicit disabled editing and editing inherited from a disabled fieldset', () => {
    const change = vi.fn(); const { rerender } = render(picker('2026-10-23T12:00', change, true));
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    rerender(<fieldset disabled>{picker('2026-10-23T12:00', change)}</fieldset>);
    fireEvent.click(screen.getByRole('button', { name: label }));
    fireEvent.keyDown(screen.getByRole('button', { name: label }), { key: 'Enter' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(change).not.toHaveBeenCalled();
  });

  it('discards an open draft when its source value or disabled state changes', () => {
    const change = vi.fn(); const { rerender } = render(picker('2026-10-23T12:00', change)); openPicker();
    fireEvent.change(screen.getByLabelText('Heure de l’ETA (Paris)'), { target: { value: '14:00' } });
    rerender(picker('2026-11-12T09:00', change));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    openPicker();
    expect(screen.getByLabelText('Heure de l’ETA (Paris)')).toHaveValue('09:00');
    rerender(picker('2026-11-12T09:00', change, true));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(change).not.toHaveBeenCalled();
  });
});
