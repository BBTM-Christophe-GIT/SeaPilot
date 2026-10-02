import type { jsPDF } from 'jspdf';
import { qhsePolicyAxisIconDefinition, type QhsePolicyAxisIconKey } from './qhsePolicyIcons';

/** Draw the shared, trusted M/L/C/Z icon geometry as scalable PDF strokes. */
export function drawQhsePolicyAxisIcon(doc: jsPDF, key: QhsePolicyAxisIconKey, x: number, y: number, size: number) {
  const scale = size / 24;
  doc.saveGraphicsState();
  doc.setDrawColor(20, 55, 75);
  doc.setLineWidth(2 * scale);
  doc.setLineCap('round');
  doc.setLineJoin('round');
  for (const [tag, attributes] of qhsePolicyAxisIconDefinition(key).node) {
    if (tag === 'circle') {
      doc.circle(x + Number(attributes.cx) * scale, y + Number(attributes.cy) * scale, Number(attributes.r) * scale, 'S');
    } else if (tag === 'rect') {
      const radius = Number(attributes.rx ?? 0) * scale;
      doc.roundedRect(x + Number(attributes.x) * scale, y + Number(attributes.y) * scale,
        Number(attributes.width) * scale, Number(attributes.height) * scale, radius, radius, 'S');
    } else if (tag === 'path') {
      const tokens = attributes.d.match(/[MLCZ]|-?\d*\.?\d+/g) ?? [];
      const operations: Array<{ op: string; c: number[] }> = [];
      let index = 0;
      while (index < tokens.length) {
        const command = tokens[index++];
        const count = command === 'C' ? 6 : command === 'Z' ? 0 : 2;
        const coordinates = tokens.slice(index, index + count).map(Number);
        if (!['M', 'L', 'C', 'Z'].includes(command) || coordinates.length !== count || coordinates.some((number) => !Number.isFinite(number))) {
          throw new Error('Géométrie d’icône QHSE invalide.');
        }
        index += count;
        operations.push({ op: command === 'Z' ? 'h' : command.toLowerCase(), c: coordinates.map((number, offset) => (offset % 2 ? y : x) + number * scale) });
      }
      doc.path(operations).stroke();
    }
  }
  doc.restoreGraphicsState();
}
