import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanningAbsencePeriodPicker, type PlanningAbsencePeriodPickerProps } from './PlanningAbsencePeriodPicker';

const defaultProps = { startsAt: '2026-10-05T08:00', endsAt: '2026-10-05T18:00', disabled: false };
function picker(props: Partial<PlanningAbsencePeriodPickerProps> = {}) {
  const onChange = vi.fn(); const onOpenChange = vi.fn();
  const value = { ...defaultProps, onChange, onOpenChange, ...props };
  return { ...render(<PlanningAbsencePeriodPicker {...value} />), onChange, onOpenChange, value };
}
async function open(user = userEvent.setup()) {
  await user.click(screen.getByRole('button', { name: /^Période :/ }));
  return screen.getByRole('dialog', { name: 'Choisir la période' });
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-02T10:00:00Z')); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('absence period picker', () => {
  it('selects a single day and updates the parent only after Apply', async () => {
    const { onChange, onOpenChange } = picker(); const user = userEvent.setup();
    const dialog = await open(user);
    expect(within(dialog).getAllByRole('grid')).toHaveLength(2);
    await user.click(within(dialog).getByRole('button', { name: 'vendredi 9 octobre 2026' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('button', { name: 'vendredi 9 octobre 2026' }).closest('[role=gridcell]')).toHaveAttribute('aria-selected', 'true');
    await user.click(within(dialog).getByRole('button', { name: 'Appliquer' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-10-09T08:00', '2026-10-09T18:00');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Période :/ })).toHaveFocus();
    expect(onOpenChange.mock.calls).toEqual([[true], [false]]);
  });

  it.each([['vendredi 9 octobre 2026', 'lundi 12 octobre 2026'], ['lundi 12 octobre 2026', 'vendredi 9 octobre 2026']])('sorts a two-click range chronologically (%s then %s)', async (first, second) => {
    const { onChange } = picker(); const user = userEvent.setup(); const dialog = await open(user);
    await user.click(within(dialog).getByRole('button', { name: first })); await user.click(within(dialog).getByRole('button', { name: second }));
    expect(within(dialog).getByRole('button', { name: 'samedi 10 octobre 2026' }).closest('[role=gridcell]')).toHaveAttribute('aria-selected', 'true');
    await user.click(within(dialog).getByRole('button', { name: 'Appliquer' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-10-09T08:00', '2026-10-12T18:00');
  });

  it('selects a period across the December/January boundary using the month selector', async () => {
    const { onChange } = picker(); const user = userEvent.setup(); const dialog = await open(user);
    await user.selectOptions(within(dialog).getByLabelText('Mois affiché'), '12');
    await user.click(within(dialog).getByRole('button', { name: 'jeudi 31 décembre 2026' }));
    await user.click(within(dialog).getByRole('button', { name: 'samedi 2 janvier 2027' }));
    await user.click(within(dialog).getByRole('button', { name: 'Appliquer' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-12-31T08:00', '2027-01-02T18:00');
  });

  it('browses other months and years without changing the existing timestamps', async () => {
    const { onChange } = picker({ startsAt: '2026-10-05T11:20', endsAt: '2026-10-07T15:10' });
    const user = userEvent.setup(); const dialog = await open(user);
    await user.click(within(dialog).getByRole('button', { name: 'Mois suivant' }));
    expect(within(dialog).getByRole('grid', { name: 'Calendrier · novembre 2026' })).toBeVisible();
    await user.selectOptions(within(dialog).getByLabelText('Année affichée'), '2028');
    expect(within(dialog).getByRole('grid', { name: 'Calendrier · novembre 2028' })).toBeVisible();
    expect(onChange).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Appliquer' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-10-05T11:20', '2026-10-07T15:10');
  });

  it('discards pending dates on Cancel and opens again from the controlled values', async () => {
    const { onChange } = picker(); const user = userEvent.setup(); const dialog = await open(user);
    await user.click(within(dialog).getByRole('button', { name: 'lundi 12 octobre 2026' }));
    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    expect(onChange).not.toHaveBeenCalled();
    const reopened = await open(user);
    expect(within(reopened).getByRole('button', { name: 'lundi 5 octobre 2026' }).closest('[role=gridcell]')).toHaveAttribute('aria-selected', 'true');
    expect(within(reopened).getByRole('button', { name: 'lundi 12 octobre 2026' }).closest('[role=gridcell]')).toHaveAttribute('aria-selected', 'false');
  });

  it('closes only the calendar on Escape and returns focus without submitting or closing the parent', async () => {
    const onChange = vi.fn(); const onSubmit = vi.fn((event) => event.preventDefault()); const onParentEscape = vi.fn();
    render(<form onSubmit={onSubmit} onKeyDown={(event) => { if (event.key === 'Escape') onParentEscape(); }}><PlanningAbsencePeriodPicker {...defaultProps} onChange={onChange} /><button type="submit">Envoyer</button></form>);
    const user = userEvent.setup(); const dialog = await open(user);
    await user.click(within(dialog).getByRole('button', { name: 'vendredi 9 octobre 2026' })); await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: /^Période :/ })).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled(); expect(onSubmit).not.toHaveBeenCalled(); expect(onParentEscape).not.toHaveBeenCalled();
  });

  it('navigates civil dates by arrows, Home/End and selects a keyboard range across months', async () => {
    const { onChange } = picker(); const user = userEvent.setup(); const dialog = await open(user);
    expect(within(dialog).getByRole('button', { name: 'lundi 5 octobre 2026' })).toHaveFocus();
    await user.keyboard('{ArrowRight}{End}'); expect(within(dialog).getByRole('button', { name: 'dimanche 11 octobre 2026' })).toHaveFocus();
    await user.keyboard('{Home}{ArrowUp}'); expect(within(dialog).getByRole('button', { name: 'lundi 28 septembre 2026' })).toHaveFocus();
    await user.keyboard('{Enter}{ArrowRight}{ArrowRight} ');
    await user.click(within(dialog).getByRole('button', { name: 'Appliquer' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-09-28T08:00', '2026-09-30T18:00');
  });

  it('shows one month in a narrow container and keeps keyboard focus when crossing into the next month', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 360, 100));
    picker({ startsAt: '2026-10-31T08:00', endsAt: '2026-10-31T18:00' }); const user = userEvent.setup(); const dialog = await open(user);
    expect(within(dialog).getAllByRole('grid')).toHaveLength(1);
    await user.keyboard('{ArrowRight}');
    expect(within(dialog).getByRole('grid', { name: 'Calendrier · novembre 2026' })).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'dimanche 1 novembre 2026' })).toHaveFocus();
  });

  it('keeps the focused date visible when the container shrinks from two months to one', async () => {
    let width = 700;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, 0, width, 100));
    picker({ startsAt: '2026-10-31T08:00', endsAt: '2026-10-31T18:00' }); const user = userEvent.setup(); const dialog = await open(user);
    await user.keyboard('{ArrowRight}'); expect(within(dialog).getByRole('button', { name: 'dimanche 1 novembre 2026' })).toHaveFocus();
    width = 360; fireEvent(window, new Event('resize'));
    expect(within(dialog).getAllByRole('grid')).toHaveLength(1);
    expect(within(dialog).getByRole('button', { name: 'dimanche 1 novembre 2026' })).toHaveFocus();
  });

  it('preserves existing hours on a new date and handles midnight as the end of the last included date', async () => {
    const { onChange } = picker({ startsAt: '2026-10-05T00:00', endsAt: '2026-10-08T00:00' });
    expect(screen.getByRole('button', { name: /^Période :/ })).toHaveTextContent('Du 5 au 7 octobre 2026');
    const user = userEvent.setup(); const dialog = await open(user);
    expect(within(dialog).getByRole('button', { name: 'mercredi 7 octobre 2026' }).closest('[role=gridcell]')).toHaveAttribute('aria-selected', 'true');
    expect(within(dialog).getByRole('button', { name: 'jeudi 8 octobre 2026' }).closest('[role=gridcell]')).toHaveAttribute('aria-selected', 'false');
    await user.click(within(dialog).getByRole('button', { name: 'vendredi 9 octobre 2026' })); await user.click(within(dialog).getByRole('button', { name: 'lundi 12 octobre 2026' }));
    await user.click(within(dialog).getByRole('button', { name: 'Appliquer' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-10-09T00:00', '2026-10-13T00:00');
  });

  it('defaults empty values to08h/18h and lets the user adjust hours without Enter sending the parent form', async () => {
    const onChange = vi.fn(); const onSubmit = vi.fn((event) => event.preventDefault());
    render(<form onSubmit={onSubmit}><PlanningAbsencePeriodPicker startsAt="" endsAt="" disabled={false} onChange={onChange} /><button type="submit">Envoyer</button></form>);
    const user = userEvent.setup(); const dialog = await open(user);
    await user.click(within(dialog).getByRole('button', { name: 'lundi 5 octobre 2026' }));
    await user.click(within(dialog).getByText('Horaires : 08:00 – 18:00'));
    expect(within(dialog).getByLabelText('Heure de début')).toHaveValue('08:00'); expect(within(dialog).getByLabelText('Heure de fin')).toHaveValue('18:00');
    fireEvent.change(within(dialog).getByLabelText('Heure de début'), { target: { value: '09:15' } });
    fireEvent.change(within(dialog).getByLabelText('Heure de fin'), { target: { value: '17:20' } });
    await user.click(within(dialog).getByLabelText('Heure de fin')); await user.keyboard('{Enter}');
    expect(onSubmit).not.toHaveBeenCalled(); expect(onChange).not.toHaveBeenCalled(); expect(document.querySelector('form form')).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Appliquer' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-10-05T09:15', '2026-10-05T17:20'); expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects a nonexistent DST hour before changing the parent timestamps', async () => {
    const { onChange } = picker({ startsAt: '2026-03-29T08:00', endsAt: '2026-03-29T18:00' });
    const user = userEvent.setup(); const dialog = await open(user);
    await user.click(within(dialog).getByText('Horaires : 08:00 – 18:00'));
    fireEvent.change(within(dialog).getByLabelText('Heure de début'), { target: { value: '02:30' } });
    await user.click(within(dialog).getByRole('button', { name: 'Appliquer' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('changement d’heure'); expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText('Heure de début'), { target: { value: '03:30' } });
    await user.click(within(dialog).getByRole('button', { name: 'Appliquer' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-03-29T03:30', '2026-03-29T18:00');
  });

  it('is disabled while saving and closes an open draft when it becomes disabled', async () => {
    const fixture = picker({ disabled: true }); const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Période :/ })); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(fixture.onOpenChange).not.toHaveBeenCalled();
    fixture.rerender(<PlanningAbsencePeriodPicker {...fixture.value} disabled={false} />); await open(user);
    fixture.rerender(<PlanningAbsencePeriodPicker {...fixture.value} disabled />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(fixture.onChange).not.toHaveBeenCalled(); expect(fixture.onOpenChange.mock.calls).toEqual([[true], [false]]);
  });

  it('discards a draft if the controlled timestamps change while the calendar is open', async () => {
    const fixture = picker(); const user = userEvent.setup(); await open(user);
    fixture.rerender(<PlanningAbsencePeriodPicker {...fixture.value} startsAt="2026-11-02T10:00" endsAt="2026-11-02T12:00" />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: /^Période :/ })).toHaveTextContent('2 novembre 2026');
    expect(fixture.onChange).not.toHaveBeenCalled(); expect(fixture.onOpenChange.mock.calls).toEqual([[true], [false]]);
  });

  it('notifies the parent if an open picker is unmounted', async () => {
    const fixture = picker(); await open(); fixture.unmount();
    expect(fixture.onOpenChange.mock.calls).toEqual([[true], [false]]);
  });
});
