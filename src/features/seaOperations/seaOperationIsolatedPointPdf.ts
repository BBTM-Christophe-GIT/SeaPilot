import type { jsPDF } from 'jspdf';
import type { SeaOperationWaypoint } from './seaOperationModel';
import { seaOperationIsolatedPointIcon, seaOperationIsolatedPointLabel } from './seaOperationIsolatedPointIcons';

const GREEN = [37, 129, 95] as const;
type PathOperation = { op: string; c: number[] };

/** The fixed icon catalogue uses absolute M/L/C/Z paths, shared with its SVG rendering. */
function iconPath(path: string, x: number, y: number, scale: number): PathOperation[] {
  const tokens = path.match(/[A-Za-z]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/g) || [];
  const operations: PathOperation[] = [];
  for (let cursor = 0; cursor < tokens.length;) {
    const command = tokens[cursor++];
    const count = command === 'M' || command === 'L' ? 2 : command === 'C' ? 6 : command === 'Z' ? 0 : -1;
    if (count < 0) throw new Error('Unsupported isolated-point icon path.');
    const coordinates = tokens.slice(cursor, cursor + count).map(Number);
    if (coordinates.length !== count || coordinates.some(value => !Number.isFinite(value))) throw new Error('Invalid isolated-point icon path.');
    cursor += count;
    operations.push({ op: command === 'M' ? 'm' : command === 'L' ? 'l' : command === 'C' ? 'c' : 'h',
      c: coordinates.map((value, index) => (index % 2 ? y : x) + (value - 12) * scale) });
  }
  return operations;
}

/** Isolated points only: no route, zone, navigation or snapshot data is modified. */
export function drawSeaOperationIsolatedPointPdf(document: jsPDF, point: Pick<SeaOperationWaypoint, 'number' | 'isolatedPointIcon'>, index: number,
  bounds: { x: number; y: number; left: number; right: number; top?: number; bottom?: number }) {
  const unit = (points: number) => points / document.internal.scaleFactor;
  const definition = seaOperationIsolatedPointIcon(point.isolatedPointIcon);
  const complete = seaOperationIsolatedPointLabel(point, index);
  const label = complete.length > 18 ? `${complete.slice(0, 17)}…` : complete;
  const printable = label.replace(/[′’]/g, "'").replace(/[–—−]/g, '-').replace(/…/g, '...').replace(/\u00a0|\u202f/g, ' ');
  document.saveGraphicsState();
  document.setDrawColor(...GREEN); document.setFillColor(...GREEN);
  document.setLineWidth(unit(definition ? 1.125 : .8)); document.setLineCap('round'); document.setLineJoin('round');
  if (definition) {
    for (const path of definition.paths) {
      document.path(iconPath(path.d, bounds.x, bounds.y, unit(18 / 24)));
      if (path.fill) document.fillStroke(); else document.stroke();
    }
  } else {
    document.setFillColor(255, 255, 255);
    document.rect(bounds.x - unit(4), bounds.y - unit(4), unit(8), unit(8), 'FD');
  }
  document.setFont('helvetica', 'normal'); document.setFontSize(7); document.setTextColor(...GREEN);
  const textWidth = document.getTextWidth(printable);
  const rightSide = bounds.x <= bounds.left + (bounds.right - bounds.left) * .7;
  const offset = unit(definition ? 14 : 7);
  const labelX = rightSide ? Math.min(bounds.right - textWidth - unit(2), bounds.x + offset)
    : Math.max(bounds.left + textWidth + unit(2), bounds.x - offset);
  const labelY = Math.max(bounds.top === undefined ? -Infinity : bounds.top + unit(8),
    Math.min(bounds.y + unit(2.4), bounds.bottom === undefined ? Infinity : bounds.bottom - unit(2)));
  document.text(printable, labelX, labelY, { align: rightSide ? 'left' : 'right' });
  document.restoreGraphicsState();
}
