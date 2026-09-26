import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PlanningColumnHighlights } from './PlanningColumnHighlights';
import { buildPlanningTimeline } from './planningModel';

const days = buildPlanningTimeline('2026-09-21', 'month').slice(0, 7);
const props = { days, today: '2026-09-26', label: 'Marins' };

describe('Planning column highlights', () => {
  it('toggles discontinuous dates, supports the keyboard and leaves the underlying cells editable', async () => {
    const user = userEvent.setup();
    const edit = vi.fn();
    const { container, unmount } = render(<PlanningColumnHighlights {...props}>
      <div className="planning-timeline-row"><button onClick={edit}>Case du planning</button></div>
    </PlanningColumnHighlights>);
    const buttons = screen.getAllByRole('button', { name: /Surligner/ });
    await user.click(buttons[0]);
    await user.click(buttons[2]);
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'false');
    expect(buttons[2]).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelector('.planning-column-highlights')?.getAttribute('style')).toContain('linear-gradient');
    await user.click(buttons[0]);
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'false');
    buttons[2].focus();
    await user.keyboard(' ');
    expect(buttons[2]).toHaveAttribute('aria-pressed', 'false');
    await user.keyboard('{Enter}');
    expect(buttons[2]).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Case du planning' }));
    expect(edit).toHaveBeenCalledOnce();
    unmount();
    render(<PlanningColumnHighlights {...props}>Planning</PlanningColumnHighlights>);
    expect(screen.getAllByRole('button', { name: /Surligner/ }).every((button) => button.getAttribute('aria-pressed') === 'false')).toBe(true);
  });

  it('adds and removes contiguous groups by dragging without panning the calendar', async () => {
    const user = userEvent.setup();
    const pan = vi.fn();
    render(<div onPointerDown={pan}><PlanningColumnHighlights {...props}>Planning</PlanningColumnHighlights></div>);
    const buttons = screen.getAllByRole('button', { name: /Surligner/ });
    await user.pointer([{ keys: '[MouseLeft>]', target: buttons[1] }, { target: buttons[3] }, { keys: '[/MouseLeft]' }]);
    expect(buttons.slice(1, 4).every((button) => button.getAttribute('aria-pressed') === 'true')).toBe(true);
    expect(pan).not.toHaveBeenCalled();
    await user.pointer([{ keys: '[MouseLeft>]', target: buttons[3] }, { target: buttons[1] }, { keys: '[/MouseLeft]' }]);
    expect(buttons.every((button) => button.getAttribute('aria-pressed') === 'false')).toBe(true);
  });
});
