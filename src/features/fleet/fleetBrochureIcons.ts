import type { jsPDF as JsPdf } from 'jspdf';

type PathOperation = { op: string; c: number[] };
type Color = [number, number, number];

// Absolute line-art paths use a 24-point square so they render as vectors in the PDF.
const paths = {
  flag: 'M 5 21 L 5 4 C 8 1 14 8 20 4 L 20 14 C 14 18 8 11 5 14',
  ruler: 'M 2 16 L 16 2 L 22 8 L 8 22 Z M 7 11 L 10 14 M 11 7 L 14 10 M 15 3 L 18 6',
  propeller: 'M 10 11 C 5 8 7 3 10 3 C 13 3 14 8 12 10 M 14 11 C 19 7 22 11 21 14 C 20 17 16 15 14 14 M 12 15 C 12 21 8 23 6 20 C 4 18 7 14 9 14',
  crane: 'M 2 21 L 22 21 M 5 21 L 5 6 L 9 3 L 9 21 M 5 6 L 19 6 L 22 10 L 9 10 M 18 10 L 18 14 C 23 14 21 19 18 17',
  radar: 'M 18 6 L 12 12 M 20 4 L 19 8 M 20 4 L 16 5',
  bed: 'M 2 19 L 2 6 M 22 19 L 22 11 L 10 11 L 10 15 M 2 16 L 22 16 M 4 12 L 8 12',
  map: 'M 2 5 L 8 3 L 16 6 L 22 4 L 22 19 L 16 21 L 8 18 L 2 20 Z M 8 3 L 8 18 M 16 6 L 16 21',
  eye: 'M 2 12 C 6 5 17 3 22 12 C 17 21 6 19 2 12 Z',
  anchor: 'M 12 6 L 12 22 M 8 10 L 16 10 M 2 15 C 2 18 7 22 12 22 C 17 22 22 18 22 15 M 2 19 L 2 15 L 6 15 M 18 15 L 22 15 L 22 19',
  waves: 'M 2 6 C 5 2 8 3 12 6 C 16 9 19 10 22 6 M 2 12 C 5 8 8 9 12 12 C 16 15 19 16 22 12 M 2 18 C 5 14 8 15 12 18 C 16 21 19 22 22 18',
  box: 'M 12 2 L 22 7 L 22 17 L 12 22 L 2 17 L 2 7 Z M 2 7 L 12 12 L 22 7 M 12 12 L 12 22 M 7 4 L 17 10',
  people: 'M 2 22 L 2 19 C 2 13 16 13 16 19 L 16 22 M 18 15 C 22 15 22 18 22 22',
  lifeBuoy: 'M 6 5 L 9 9 M 19 6 L 15 9 M 5 19 L 9 15 M 19 19 L 15 15',
  compass: 'M 16 8 L 14 14 L 8 16 L 10 10 Z',
  list: 'M 9 6 L 22 6 M 9 12 L 22 12 M 9 18 L 22 18 M 3 6 L 5 6 M 3 12 L 5 12 M 3 18 L 5 18',
} as const;

const circles: Partial<Record<keyof typeof paths, [number, number, number][]>> = {
  propeller: [[12, 12, 2.2]], radar: [[12, 12, 9], [12, 12, 5], [12, 12, 1.25]], eye: [[12, 12, 3.1]],
  anchor: [[12, 4, 2]], people: [[9, 7, 3.5], [18, 7, 2.75]],
  lifeBuoy: [[12, 12, 9.5], [12, 12, 4.2]], compass: [[12, 12, 10]],
};

export type FleetBrochureIcon = keyof typeof paths;

export function drawBrochureIcon(doc: JsPdf, icon: FleetBrochureIcon, x: number, y: number, size: number, color: Color): void {
  const scale = size / 24;
  const operations = Array.from(paths[icon].matchAll(/([MLCZ])([^MLCZ]*)/g), ([, command, values]): PathOperation => ({
    op: command === 'Z' ? 'h' : command.toLowerCase(),
    c: values.trim() ? values.trim().split(/\s+/).map((coordinate, index) => Number(coordinate) * scale + (index % 2 ? y : x)) : [],
  }));
  doc.setDrawColor(...color).setLineWidth(Math.max(0.75, size / 18));
  doc.setLineCap('round').setLineJoin('round');
  doc.path(operations).stroke();
  for (const [cx, cy, radius] of circles[icon] || []) {
    doc.circle(x + cx * scale, y + cy * scale, radius * scale, 'S');
  }
}
