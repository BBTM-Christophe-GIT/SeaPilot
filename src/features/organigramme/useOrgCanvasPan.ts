import { useEffect, useRef, useState, type PointerEvent } from 'react';

interface CanvasDrag {
  canvas: HTMLDivElement;
  pointerId: number;
  x: number;
  y: number;
  left: number;
  top: number;
  nextLeft: number;
  nextTop: number;
  frame: number | null;
}

function applyPan(drag: CanvasDrag) {
  drag.canvas.scrollLeft = drag.nextLeft;
  drag.canvas.scrollTop = drag.nextTop;
  drag.frame = null;
}

export function useOrgCanvasPan() {
  const drag = useRef<CanvasDrag | null>(null);
  const [panning, setPanning] = useState(false);

  useEffect(() => () => {
    if (drag.current?.frame != null) cancelAnimationFrame(drag.current.frame);
  }, []);

  function start(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' || event.button !== 0 || drag.current) return;
    if (event.target instanceof Element && event.target.closest('button')) return;

    const canvas = event.currentTarget;
    if (canvas.scrollWidth <= canvas.clientWidth && canvas.scrollHeight <= canvas.clientHeight) return;
    const bounds = canvas.getBoundingClientRect();
    if (event.clientX >= bounds.left + canvas.clientLeft + canvas.clientWidth ||
        event.clientY >= bounds.top + canvas.clientTop + canvas.clientHeight) return;

    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    drag.current = {
      canvas, pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      left: canvas.scrollLeft, top: canvas.scrollTop, nextLeft: canvas.scrollLeft, nextTop: canvas.scrollTop, frame: null,
    };
    setPanning(true);
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const startPosition = drag.current;
    if (startPosition?.pointerId !== event.pointerId) return;
    startPosition.nextLeft = startPosition.left + startPosition.x - event.clientX;
    startPosition.nextTop = startPosition.top + startPosition.y - event.clientY;
    if (startPosition.frame === null) startPosition.frame = requestAnimationFrame(() => applyPan(startPosition));
  }

  function stop(event: PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (active?.pointerId !== event.pointerId) return;
    if (active.frame !== null) {
      cancelAnimationFrame(active.frame);
      if (event.type === 'pointerup') applyPan(active);
    }
    drag.current = null;
    setPanning(false);
  }

  return {
    'data-panning': panning,
    onPointerDown: start,
    onPointerMove: move,
    onPointerUp: stop,
    onPointerCancel: stop,
    onLostPointerCapture: stop,
  };
}
