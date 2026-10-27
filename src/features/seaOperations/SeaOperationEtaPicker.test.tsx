import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode, useState } from 'react';
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
    expect(screen.getByLabelText('Heure de l’ETA (Paris)')).toHaveAttribute('step', '300');
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
  function ControlledInline({ initial = '2026-10-23T12:00', change = vi.fn() }: { initial?: string; change?: (value: string) => void }) {
    const [value, setValue] = useState(initial);
    return inlinePicker(value, next => { change(next); setValue(next); });
  }

  it('shows the current Paris calendar and empty hour without implicit ETA, focus theft or confirmation controls', () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-31T23:30:00Z'));
    const change = vi.fn(), { rerender } = render(<button type="button">Autre champ</button>);
    const outside = screen.getByRole('button', { name: 'Autre champ' }); outside.focus();
    rerender(<><button type="button">Autre champ</button>{inlinePicker('', change)}</>);
    const picker = inlineQueries(), calendar = picker.getByRole('grid', { name: 'Calendrier · novembre 2026' });
    expect(calendar).toBeVisible();
    expect(within(calendar).getAllByRole('columnheader').map(column => column.getAttribute('aria-label'))).toEqual(['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']);
    expect(calendar.querySelector('[aria-selected="true"]')).toBeNull(); expectTime(picker, '');
    expect(picker.queryByRole('button', { name: 'Appliquer' })).not.toBeInTheDocument();
    expect(picker.queryByRole('button', { name: 'Annuler' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(outside).toHaveFocus(); expect(change).not.toHaveBeenCalled();
  });

  it.each(['date-first', 'time-first'])('publishes one complete date/hour immediately in %s order', order => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-23T10:00:00Z'));
    const change = vi.fn(); render(<ControlledInline initial="" change={change} />); const picker = inlineQueries();
    if (order === 'date-first') fireEvent.click(picker.getByRole('button', { name: 'samedi 24 octobre 2026' }));
    fireEvent.change(picker.getByRole('combobox', { name: 'Heures de l’ETA (Paris)' }), { target: { value: '15' } });
    expect(change).not.toHaveBeenCalled();
    fireEvent.change(picker.getByRole('combobox', { name: 'Minutes de l’ETA (Paris)' }), { target: { value: '30' } });
    if (order === 'time-first') {
      expect(change).not.toHaveBeenCalled(); fireEvent.click(picker.getByRole('button', { name: 'samedi 24 octobre 2026' }));
    }
    expect(change).toHaveBeenCalledExactlyOnceWith('2026-10-24T15:30');
    expect(picker.getByRole('gridcell', { selected: true })).toHaveTextContent('24'); expectTime(picker, '15:30');
    expect(picker.getByRole('grid', { name: 'Calendrier · octobre 2026' })).toBeVisible();
  });

  it('keeps consecutive controlled date, hour and minute edits without duplicate publications on blur or repeat selection', () => {
    const change = vi.fn(); render(<ControlledInline change={change} />); const picker = inlineQueries();
    fireEvent.click(picker.getByRole('button', { name: 'samedi 24 octobre 2026' }));
    changeTime(picker, '15:30');
    expect(change.mock.calls.map(([value]) => value)).toEqual(['2026-10-24T12:00', '2026-10-24T15:00', '2026-10-24T15:30']);
    fireEvent.click(picker.getByRole('button', { name: 'samedi 24 octobre 2026' }));
    changeTime(picker, '15:30'); fireEvent.blur(picker.getByRole('combobox', { name: 'Minutes de l’ETA (Paris)' }));
    expect(change).toHaveBeenCalledTimes(3); expectTime(picker, '15:30');
  });

  it('retains the newest date and both time parts when consecutive events are batched', () => {
    const change = vi.fn(); render(<ControlledInline change={change} />); const picker = inlineQueries();
    act(() => {
      fireEvent.click(picker.getByRole('button', { name: 'samedi 24 octobre 2026' }));
      changeTime(picker, '15:30');
    });
    expect(change).toHaveBeenLastCalledWith('2026-10-24T15:30'); expectTime(picker, '15:30');
    expect(picker.getByRole('gridcell', { selected: true })).toHaveTextContent('24');
  });

  it('keeps two visible waypoint calendars and their immediate changes independent', () => {
    const firstChange = vi.fn(), secondChange = vi.fn();
    render(<>{inlinePicker('2026-10-23T12:00', firstChange)}<SeaOperationEtaPicker inline label="ETA · date et heure · point 2" value="2026-11-12T09:00" onChange={secondChange} /><button type="button">Autre champ</button></>);
    const first = inlineQueries(), second = inlineQueries('ETA · date et heure · point 2');
    fireEvent.click(first.getByRole('button', { name: 'samedi 24 octobre 2026' })); changeTime(first, '15:30'); changeTime(second, '10:45');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Autre champ' }));
    expectTime(first, '15:30'); expectTime(second, '10:45');
    expect(firstChange).toHaveBeenLastCalledWith('2026-10-24T15:30'); expect(secondChange).toHaveBeenLastCalledWith('2026-11-12T10:45');
    expect(second.getByRole('gridcell', { selected: true })).toHaveTextContent('12');
  });

  it.each(['explicit', 'fieldset', 'inert'] as const)('shows stored ETA but blocks immediate edits when disabled by %s', mode => {
    const change = vi.fn();
    render(mode === 'fieldset' ? <fieldset disabled>{inlinePicker('2026-10-23T12:00', change)}</fieldset>
      : mode === 'inert' ? <div inert>{inlinePicker('2026-10-23T12:00', change)}</div> : inlinePicker('2026-10-23T12:00', change, true));
    const picker = inlineQueries();
    if (mode !== 'inert') {
      for (const button of picker.getAllByRole('button')) expect(button).toBeDisabled();
      for (const select of picker.getAllByRole('combobox')) expect(select).toBeDisabled();
    }
    fireEvent.click(picker.getByRole('button', { name: 'samedi 24 octobre 2026' })); fireEvent.click(picker.getByRole('button', { name: 'Mois suivant' }));
    changeTime(picker, '15:30'); fireEvent.click(picker.getByRole('button', { name: 'Effacer' }));
    expect(picker.getByRole('gridcell', { selected: true })).toHaveTextContent('23'); expectTime(picker, '12:00');
    expect(picker.getByRole('grid', { name: 'Calendrier · octobre 2026' })).toBeVisible(); expect(change).not.toHaveBeenCalled();
  });

  it('synchronizes external ETA updates while discarding incomplete local parts without publishing them', () => {
    const change = vi.fn(), { rerender } = render(inlinePicker('2026-10-23T12:00', change)); let picker = inlineQueries();
    fireEvent.change(picker.getByRole('combobox', { name: 'Minutes de l’ETA (Paris)' }), { target: { value: '' } });
    fireEvent.change(picker.getByRole('combobox', { name: 'Heures de l’ETA (Paris)' }), { target: { value: '15' } });
    expect(change).not.toHaveBeenCalled();
    rerender(inlinePicker('2026-11-12T09:05', change)); picker = inlineQueries();
    expect(picker.getByRole('grid', { name: 'Calendrier · novembre 2026' })).toBeVisible();
    expect(picker.getByRole('gridcell', { selected: true })).toHaveTextContent('12'); expectTime(picker, '09:05'); expect(change).not.toHaveBeenCalled();
  });

  it('clears a committed ETA once and permits a new complete choice without closing or changing its displayed month', () => {
    const change = vi.fn(); render(<ControlledInline change={change} />); const picker = inlineQueries();
    fireEvent.click(picker.getByRole('button', { name: 'Effacer' }));
    expect(change).toHaveBeenCalledExactlyOnceWith(''); expectTime(picker, '');
    expect(picker.queryByRole('gridcell', { selected: true })).not.toBeInTheDocument();
    expect(picker.queryByRole('button', { name: 'Effacer' })).not.toBeInTheDocument();
    fireEvent.click(picker.getByRole('button', { name: 'samedi 24 octobre 2026' })); changeTime(picker, '15:30');
    expect(change).toHaveBeenLastCalledWith('2026-10-24T15:30'); expect(change).toHaveBeenCalledTimes(2);
  });

  it('keeps completed changes on Escape and prevents Enter from submitting the surrounding operation', () => {
    const change = vi.fn(), close = vi.fn(), submit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(<AppDialog title="Opération en mer" onClose={close} onSubmit={submit}><ControlledInline change={change} /></AppDialog>);
    const picker = inlineQueries(), minute = picker.getByRole('combobox', { name: 'Minutes de l’ETA (Paris)' });
    fireEvent.change(minute, { target: { value: '15' } });
    expect(change).toHaveBeenCalledExactlyOnceWith('2026-10-23T12:15');
    fireEvent.keyDown(minute, { key: 'Enter' }); fireEvent.keyDown(minute, { key: 'Escape' }); fireEvent.keyDown(minute, { key: 'Escape', repeat: true });
    expectTime(picker, '12:15'); expect(submit).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled(); expect(change).toHaveBeenCalledOnce();
  });

  it('retains keyboard calendar navigation and Tab access to both time selectors', async () => {
    const user = userEvent.setup(), change = vi.fn(); render(<ControlledInline initial="2026-12-31T10:00" change={change} />); const picker = inlineQueries();
    picker.getByRole('button', { name: 'jeudi 31 décembre 2026' }).focus();
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(picker.getByRole('button', { name: 'vendredi 1 janvier 2027' })).toHaveFocus(); expect(change).not.toHaveBeenCalled();
    await user.tab(); expect(picker.getByRole('combobox', { name: 'Heures de l’ETA (Paris)' })).toHaveFocus();
    await user.tab(); const minute = picker.getByRole('combobox', { name: 'Minutes de l’ETA (Paris)' }); expect(minute).toHaveFocus();
    await user.selectOptions(minute, '05'); expect(change).toHaveBeenCalledExactlyOnceWith('2026-12-31T10:05');
  });

  it('keeps incomplete parts unpublished and offers the twelve five-minute choices, midnight and 23:55', () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-23T10:00:00Z'));
    const change = vi.fn(); render(<ControlledInline initial="" change={change} />); const picker = inlineQueries();
    const hour = picker.getByRole('combobox', { name: 'Heures de l’ETA (Paris)' }), minute = picker.getByRole('combobox', { name: 'Minutes de l’ETA (Paris)' });
    expect(within(hour).getAllByRole('option')).toHaveLength(25);
    expect(within(minute).getAllByRole('option').map(option => (option as HTMLOptionElement).value)).toEqual(['', '00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']);
    fireEvent.click(picker.getByRole('button', { name: 'vendredi 23 octobre 2026' })); fireEvent.change(hour, { target: { value: '23' } });
    expect(change).not.toHaveBeenCalled(); fireEvent.change(minute, { target: { value: '55' } });
    expect(change).toHaveBeenLastCalledWith('2026-10-23T23:55');
    changeTime(picker, '00:00'); expect(change).toHaveBeenLastCalledWith('2026-10-23T00:00');
  });

  it.each(['2026-03-29', '2026-10-25'])('rejects a DST gap or overlap immediately on %s until a valid correction', date => {
    const change = vi.fn(); render(<ControlledInline initial={`${date}T12:00`} change={change} />); const picker = inlineQueries();
    changeTime(picker, '02:30'); expect(picker.getByRole('alert')).toHaveTextContent('inexistante ou ambiguë'); expect(change).not.toHaveBeenCalled();
    changeTime(picker, '03:30'); expect(picker.queryByRole('alert')).not.toBeInTheDocument();
    expect(change).toHaveBeenCalledExactlyOnceWith(`${date}T03:30`);
  });

  it('preserves stored seconds without an edit, including focus, blur and selecting its existing date', () => {
    const change = vi.fn(); render(inlinePicker('2026-10-23T12:34:56', change)); const picker = inlineQueries();
    const minute = picker.getByRole('combobox', { name: 'Minutes de l’ETA (Paris)' }); minute.focus(); fireEvent.blur(minute);
    fireEvent.click(picker.getByRole('button', { name: 'vendredi 23 octobre 2026' })); expectTime(picker, '12:34'); expect(change).not.toHaveBeenCalled();
  });

  it.each(['07', '09', '59'])('keeps historical minute %s until a new minute is explicitly selected', async storedMinute => {
    const user = userEvent.setup(), change = vi.fn(); render(<ControlledInline initial={`2026-10-23T12:${storedMinute}:17`} change={change} />); const picker = inlineQueries();
    const minute = picker.getByRole('combobox', { name: 'Minutes de l’ETA (Paris)' });
    expect(within(minute).getByRole('option', { name: `${storedMinute} (actuelle)` })).toHaveValue(storedMinute);
    expect(within(minute).getAllByRole('option')).toHaveLength(14); minute.focus(); await user.tab(); fireEvent.blur(minute);
    expectTime(picker, `12:${storedMinute}`); expect(change).not.toHaveBeenCalled();
    await user.selectOptions(minute, '10'); expect(change).toHaveBeenCalledExactlyOnceWith('2026-10-23T12:10');
    expect(within(minute).queryByRole('option', { name: `${storedMinute} (actuelle)` })).not.toBeInTheDocument(); expect(within(minute).getAllByRole('option')).toHaveLength(13);
  });

  it('synchronizes a loaded historical exception without publishing an unfinished local edit', () => {
    const change = vi.fn(), { rerender } = render(inlinePicker('2026-10-23T12:07', change)); let picker = inlineQueries();
    fireEvent.change(picker.getByRole('combobox', { name: 'Minutes de l’ETA (Paris)' }), { target: { value: '' } });
    fireEvent.change(picker.getByRole('combobox', { name: 'Heures de l’ETA (Paris)' }), { target: { value: '13' } });
    rerender(inlinePicker('2026-10-24T09:09', change)); picker = inlineQueries(); expectTime(picker, '09:09');
    expect(picker.queryByRole('option', { name: '07 (actuelle)' })).not.toBeInTheDocument();
    expect(picker.getByRole('option', { name: '09 (actuelle)' })).toBeInTheDocument(); expect(change).not.toHaveBeenCalled();
  });

  it.each(['1000-01-01T00:00', '9999-12-31T23:59'])('keeps calendar navigation within the supported dates at %s without writing', value => {
    const change = vi.fn(); render(inlinePicker(value, change)); const picker = inlineQueries(), lower = value.startsWith('1000');
    expect(picker.getByRole('button', { name: lower ? 'Mois précédent' : 'Mois suivant' })).toBeDisabled();
    fireEvent.keyDown(picker.getByRole('gridcell', { selected: true }).querySelector('button')!, { key: lower ? 'ArrowLeft' : 'ArrowRight' });
    expect(picker.getByRole('gridcell', { selected: true })).toHaveTextContent(lower ? '1' : '31'); expectTime(picker, lower ? '00:00' : '23:59'); expect(change).not.toHaveBeenCalled();
  });

  it('publishes no mount-time values or duplicate callbacks under StrictMode', () => {
    const change = vi.fn(); render(<StrictMode><ControlledInline initial="2026-10-23T12:07" change={change} /></StrictMode>);
    expect(change).not.toHaveBeenCalled(); const picker = inlineQueries();
    fireEvent.change(picker.getByRole('combobox', { name: 'Minutes de l’ETA (Paris)' }), { target: { value: '10' } });
    expect(change).toHaveBeenCalledExactlyOnceWith('2026-10-23T12:10');
  });
});
