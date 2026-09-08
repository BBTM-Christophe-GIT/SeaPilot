import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { withStablePlanningHandlers, samePlanningLaneSelection } from './planningRendering';
import type { PlanningGridCell } from './planningGrid';

describe('Planning row render isolation', () => {
  it('skips unchanged row renders while invoking the latest committed handler', () => {
    const renders = vi.fn();
    const Row = withStablePlanningHandlers(({ onClick }: { onClick?: () => void }) => {
      renders();
      return <button disabled={!onClick} onClick={onClick}>Planning row</button>;
    });
    const oldHandler = vi.fn();
    const currentHandler = vi.fn();
    const { rerender } = render(<Row onClick={oldHandler} />);
    rerender(<Row onClick={currentHandler} />);
    expect(renders).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button'));
    expect(currentHandler).toHaveBeenCalledOnce();
    expect(oldHandler).not.toHaveBeenCalled();
    rerender(<Row />);
    expect(screen.getByRole('button')).toBeDisabled();
    expect(renders).toHaveBeenCalledTimes(2);
  });

  it('only invalidates the row whose selected cells changed', () => {
    const selected = { key: 'one::2026-09-08', laneKey: 'one' } as PlanningGridCell;
    const other = { key: 'two::2026-09-08', laneKey: 'two' } as PlanningGridCell;
    const before = new Map([[selected.key, selected]]);
    const after = new Map([...before, [other.key, other]]);
    expect(samePlanningLaneSelection(before, after, 'one')).toBe(true);
    expect(samePlanningLaneSelection(before, after, 'two')).toBe(false);
    expect(samePlanningLaneSelection(before, new Map(), 'one')).toBe(false);
  });
});
