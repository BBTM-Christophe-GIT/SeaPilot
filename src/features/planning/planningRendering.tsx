import { createElement, memo, useLayoutEffect, useMemo, useRef, type ComponentType } from 'react';
import type { PlanningGridCell } from './planningGrid';

type Handler = (...args: never[]) => unknown;

// Timeline event handlers keep their latest committed closure without making
// every row rerender when a dialog, filter popover or status message changes.
// Unlike ignoring functions in a memo comparator, this cannot retain an old
// permission, selected cell or mutation handler.
export function withStablePlanningHandlers<P extends object>(
  Component: ComponentType<P>,
  compare?: (previous: Readonly<P>, next: Readonly<P>) => boolean,
) {
  const Memoized = memo(Component, compare) as ComponentType<P>;
  return function StablePlanningRow(props: P) {
    const callbacks = Object.fromEntries(Object.entries(props).filter(([, value]) => typeof value === 'function')) as Record<string, Handler>;
    const currentCallbacks = useRef(callbacks);
    useLayoutEffect(() => { currentCallbacks.current = callbacks; });
    const keys = Object.keys(callbacks).sort().join('|');
    const handlers = useMemo(() => Object.fromEntries(keys.split('|').filter(Boolean).map((key) => [
      key, (...args: never[]) => currentCallbacks.current[key]?.(...args),
    ])), [keys]);
    return createElement(Memoized, { ...props, ...handlers });
  };
}

export function samePlanningLaneSelection(
  previous: ReadonlyMap<string, PlanningGridCell> | undefined,
  next: ReadonlyMap<string, PlanningGridCell> | undefined,
  laneKey: string,
): boolean {
  if (previous === next) return true;
  const before = [...(previous?.values() || [])].filter((cell) => cell.laneKey === laneKey);
  const after = [...(next?.values() || [])].filter((cell) => cell.laneKey === laneKey);
  return before.length === after.length && before.every((cell) => next?.get(cell.key) === cell);
}

export function shallowPlanningEqual(previous: object, next: object): boolean {
  const entries = Object.entries(previous);
  return entries.length === Object.keys(next).length
    && entries.every(([key, value]) => Object.is(value, (next as Record<string, unknown>)[key]));
}
