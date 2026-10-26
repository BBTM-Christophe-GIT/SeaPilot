import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
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

describe('SeaOperationEtaPicker inline', () => {
  const inlinePicker = (value = '', onChange: (value: string) => void = vi.fn(), disabled = false) => <SeaOperationEtaPicker inline label={label} value={value} onChange={onChange} disabled={disabled} />;
  const inlineQueries = (name = label) => within(screen.getByRole('group', { name }));
  function changeTime(picker: ReturnType<typeof inlineQueries>, time: string) {
    const [hour, minute] = time.split(':');
    fireEvent.change(picker.getByRole('combobox', { name: 'Heures de l’ETA (Paris)' }), { target: { value: hour } });
    fireEvent.change(picker.getByRole('combobox', { name: 'Minutes de l’ETA (Paris)' }), { target: { value: minute } });
  }
  function expectTime(picker: ReturnType<typeof inlineQueries>, time: string) {
    const [hour = '', minute = ''] = time.split(':');
    expect(picker.getByRole('combobox', { name: 'Heures de l’ETA (Paris)' })).toHaveValue(hour);
    expect(picker.getByRole('combobox', { name: 'Minutes de l’ETA (Paris)' })).toHaveValue(minute);
  }

  it('shows the current Paris calendar and hour immediately without a trigger, implicit ETA or stolen focus', () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-31T23:30:00Z'));
    const change = vi.fn();
    const { rerender } = render(<><button type="button">Autre champ</button></>);
    const outside = screen.getByRole('button', { name: 'Autre champ' }); outside.focus();
    rerender(<><button type="button">Autre champ</button>{inlinePicker('', change)}</>);
    const picker = inlineQueries();
    const calendar = picker.getByRole('grid', { name: 'Calendrier · novembre 2026' });
    expect(calendar).toBeVisible();
    expect(within(calendar).getAllByRole('columnheader').map((column) => column.getAttribute('aria-label'))).toEqual(['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']);
    expect(calendar.querySelector('[aria-selected="true"]')).toBeNull();
    expectTime(picker, '');
    expect(picker.getByRole('button', { name: 'Appliquer' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(outside).toHaveFocus();
    expect(change).not.toHaveBeenCalled();
  });

  it('applies a complete date and hour once and keeps its calendar visible', () => {
    const change = vi.fn();
    function ControlledPicker() {
      const [value, setValue] = useState('2026-10-23T12:00');
      return inlinePicker(value, (next) => { change(next); setValue(next); });
    }
    render(<ControlledPicker />);
    const picker = inlineQueries();
    fireEvent.click(picker.getByRole('button', { name: 'samedi 24 octobre 2026' }));
    changeTime(picker, '15:30');
    expect(change).not.toHaveBeenCalled();
    fireEvent.click(picker.getByRole('button', { name: 'Appliquer' }));
    expect(change).toHaveBeenCalledExactlyOnceWith('2026-10-24T15:30');
    expect(picker.getByRole('grid', { name: 'Calendrier · octobre 2026' })).toBeVisible();
    expect(picker.getByRole('gridcell', { selected: true })).toHaveTextContent('24');
    expectTime(picker, '15:30');
    fireEvent.click(picker.getByRole('button', { name: 'Appliquer' }));
    expect(change).toHaveBeenCalledOnce();
  });

  it('keeps two visible waypoint calendars and their provisional edits independent', () => {
    const firstChange = vi.fn(), secondChange = vi.fn();
    render(<>{inlinePicker('2026-10-23T12:00', firstChange)}<SeaOperationEtaPicker inline label="ETA · date et heure · point 2" value="2026-11-12T09:00" onChange={secondChange} /><button type="button">Autre champ</button></>);
    const first = inlineQueries(), second = inlineQueries('ETA · date et heure · point 2');
    expect(first.getByRole('grid', { name: 'Calendrier · octobre 2026' })).toBeVisible();
    expect(second.getByRole('grid', { name: 'Calendrier · novembre 2026' })).toBeVisible();
    fireEvent.click(first.getByRole('button', { name: 'samedi 24 octobre 2026' }));
    changeTime(first, '15:30');
    changeTime(second, '10:45');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Autre champ' }));
    expectTime(first, '15:30');
    expectTime(second, '10:45');
    fireEvent.click(first.getByRole('button', { name: 'Appliquer' }));
    expect(firstChange).toHaveBeenCalledExactlyOnceWith('2026-10-24T15:30');
    expect(secondChange).not.toHaveBeenCalled();
    expect(second.getByRole('gridcell', { selected: true })).toHaveTextContent('12');
    expect(second.getByRole('grid', { name: 'Calendrier · novembre 2026' })).toBeVisible();
    fireEvent.click(second.getByRole('button', { name: 'Appliquer' }));
    expect(secondChange).toHaveBeenCalledExactlyOnceWith('2026-11-12T10:45');
  });

  it.each(['explicit', 'fieldset', 'inert'] as const)('shows stored ETA but blocks all inline editing when disabled by %s', (mode) => {
    const change = vi.fn();
    render(mode === 'fieldset' ? <fieldset disabled>{inlinePicker('2026-10-23T12:00', change)}</fieldset>
      : mode === 'inert' ? <div inert>{inlinePicker('2026-10-23T12:00', change)}</div> : inlinePicker('2026-10-23T12:00', change, true));
    const picker = inlineQueries();
    expect(picker.getByRole('grid', { name: 'Calendrier · octobre 2026' })).toBeVisible();
    if (mode !== 'inert') {
      for (const button of picker.getAllByRole('button')) expect(button).toBeDisabled();
      for (const select of picker.getAllByRole('combobox')) expect(select).toBeDisabled();
    }
    fireEvent.click(picker.getByRole('button', { name: 'samedi 24 octobre 2026' }));
    fireEvent.click(picker.getByRole('button', { name: 'Mois suivant' }));
    changeTime(picker, '15:30');
    fireEvent.click(picker.getByRole('button', { name: 'Appliquer' }));
    fireEvent.click(picker.getByRole('button', { name: 'Effacer' }));
    expect(picker.getByRole('gridcell', { selected: true })).toHaveTextContent('23');
    expectTime(picker, '12:00');
    expect(picker.getByRole('grid', { name: 'Calendrier · octobre 2026' })).toBeVisible();
    expect(change).not.toHaveBeenCalled();
  });

  it('resynchronizes external ETA updates and discards provisional date and hour without publishing them', () => {
    const change = vi.fn(); const { rerender } = render(inlinePicker('2026-10-23T12:00', change));
    let picker = inlineQueries();
    fireEvent.click(picker.getByRole('button', { name: 'samedi 24 octobre 2026' }));
    changeTime(picker, '15:30');
    rerender(inlinePicker('2026-11-12T09:00', change)); picker = inlineQueries();
    expect(picker.getByRole('grid', { name: 'Calendrier · novembre 2026' })).toBeVisible();
    expect(picker.getByRole('gridcell', { selected: true })).toHaveTextContent('12');
    expectTime(picker, '09:00');
    fireEvent.click(picker.getByRole('button', { name: 'Appliquer' }));
    expect(change).not.toHaveBeenCalled();
  });

  it('resets provisional inline edits with Cancel or Escape and leaves the surrounding operation open', () => {
    const change = vi.fn(), close = vi.fn(), submit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(<AppDialog title="Opération en mer" onClose={close} onSubmit={submit}>{inlinePicker('2026-10-23T12:00', change)}</AppDialog>);
    const picker = inlineQueries(), hour = picker.getByRole('combobox', { name: 'Heures de l’ETA (Paris)' });
    for (const action of ['Annuler', 'Escape']) {
      fireEvent.click(picker.getByRole('button', { name: 'samedi 24 octobre 2026' }));
      changeTime(picker, '15:30');
      fireEvent.keyDown(hour, { key: 'Enter' });
      expect(submit).not.toHaveBeenCalled();
      if (action === 'Escape') {
        fireEvent.keyDown(hour, { key: 'Escape' });
        fireEvent.keyDown(hour, { key: 'Escape', repeat: true });
      } else fireEvent.click(picker.getByRole('button', { name: 'Annuler' }));
      expectTime(picker, '12:00');
      expect(picker.getByRole('gridcell', { selected: true })).toHaveTextContent('23');
      expect(picker.getByRole('grid', { name: 'Calendrier · octobre 2026' })).toBeVisible();
      expect(screen.getByRole('dialog', { name: 'Opération en mer' })).toBeVisible();
      expect(close).not.toHaveBeenCalled(); expect(change).not.toHaveBeenCalled();
    }
  });

  it('retains keyboard day navigation and Tab access to the always-visible hour', async () => {
    const user = userEvent.setup(); render(inlinePicker('2026-12-31T10:00'));
    const picker = inlineQueries();
    const day = picker.getByRole('button', { name: 'jeudi 31 décembre 2026' }); day.focus();
    fireEvent.keyDown(day, { key: 'ArrowRight' });
    expect(picker.getByRole('grid', { name: 'Calendrier · janvier 2027' })).toBeVisible();
    expect(picker.getByRole('button', { name: 'vendredi 1 janvier 2027' })).toHaveFocus();
    await user.tab(); expect(picker.getByRole('combobox', { name: 'Heures de l’ETA (Paris)' })).toHaveFocus();
    await user.tab(); expect(picker.getByRole('combobox', { name: 'Minutes de l’ETA (Paris)' })).toHaveFocus();
  });

  it('keeps a partial hour local and supports every minute including midnight and 23:59', () => {
    const change = vi.fn(); render(inlinePicker('2026-10-23T12:00', change));
    const picker = inlineQueries(), hour = picker.getByRole('combobox', { name: 'Heures de l’ETA (Paris)' }), minute = picker.getByRole('combobox', { name: 'Minutes de l’ETA (Paris)' });
    expect(within(hour).getAllByRole('option')).toHaveLength(25);
    expect(within(minute).getAllByRole('option')).toHaveLength(61);
    fireEvent.change(minute, { target: { value: '' } });
    fireEvent.change(hour, { target: { value: '23' } });
    expect(picker.getByRole('button', { name: 'Appliquer' })).toBeDisabled(); expect(change).not.toHaveBeenCalled();
    fireEvent.change(minute, { target: { value: '59' } });
    fireEvent.click(picker.getByRole('button', { name: 'Appliquer' }));
    expect(change).toHaveBeenLastCalledWith('2026-10-23T23:59');
    changeTime(picker, '00:00'); fireEvent.click(picker.getByRole('button', { name: 'Appliquer' }));
    expect(change).toHaveBeenLastCalledWith('2026-10-23T00:00');
  });

  it.each(['2026-03-29', '2026-10-25'])('rejects the DST gap or overlap with separate hour and minute selectors on %s', date => {
    const change = vi.fn(); render(inlinePicker(`${date}T12:00`, change));
    const picker = inlineQueries(); changeTime(picker, '02:30'); fireEvent.click(picker.getByRole('button', { name: 'Appliquer' }));
    expect(picker.getByRole('alert')).toHaveTextContent('inexistante ou ambiguë'); expect(change).not.toHaveBeenCalled();
    changeTime(picker, '03:30'); expect(picker.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(picker.getByRole('button', { name: 'Appliquer' })); expect(change).toHaveBeenCalledExactlyOnceWith(`${date}T03:30`);
  });

  it('preserves exact stored seconds when the separate selectors make no visible change', () => {
    const change = vi.fn(); render(inlinePicker('2026-10-23T12:34:56', change));
    const picker = inlineQueries(); expectTime(picker, '12:34');
    fireEvent.click(picker.getByRole('button', { name: 'Appliquer' })); expect(change).not.toHaveBeenCalled();
  });

  it.each(['1000-01-01T00:00', '9999-12-31T23:59'])('keeps navigation inside the supported date range at %s', value => {
    render(inlinePicker(value)); const picker = inlineQueries(), lower = value.startsWith('1000');
    expect(picker.getByRole('button', { name: lower ? 'Mois précédent' : 'Mois suivant' })).toBeDisabled();
    const selected = picker.getByRole('gridcell', { selected: true }).querySelector('button')!;
    fireEvent.keyDown(selected, { key: lower ? 'ArrowLeft' : 'ArrowRight' });
    expect(picker.getByRole('gridcell', { selected: true })).toHaveTextContent(lower ? '1' : '31');
    expectTime(picker, lower ? '00:00' : '23:59');
  });
});
