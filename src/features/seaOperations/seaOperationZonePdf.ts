import type { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { SeaOperationMapZone } from './seaOperationMapLayers';
import { formatSeaPosition } from './seaOperationCoordinates';
import { seaOperationZoneAppearance } from './seaOperationZonePresentation';

const printable = (text: string) => text.replace(/[\u2010-\u2015\u2212]/g, '-').replace(/[′’]/g, "'").replace(/\u00a0|\u202f/g, ' ');

export function seaOperationZoneTableMinimumHeight(document: jsPDF, zone: SeaOperationMapZone, index: number,
  options: { left: number; right: number; fontSize?: number }) {
  const fontSize = options.fontSize ?? 8, width = document.internal.pageSize.getWidth() - options.left - options.right;
  document.setFont('helvetica', 'bold'); document.setFontSize(fontSize + 1);
  const title = printable(`${seaOperationZoneAppearance(index).code} - ${zone.name.trim() || `Zone ${index + 1}`}`);
  const lines = document.splitTextToSize(title, width - 16) as string[];
  return lines.length * (fontSize + 2) + 28 + Math.min(12, Math.max(1, zone.vertices.length)) * (fontSize + 9);
}

/** A repeated parent header and indented vertices form the same hierarchy in both documents. */
export function drawSeaOperationZoneTablePdf(document: jsPDF, zone: SeaOperationMapZone, index: number,
  options: { y: number; left: number; right: number; top: number; bottom: number; fontSize?: number }) {
  const appearance = seaOperationZoneAppearance(index), fontSize = options.fontSize ?? 8;
  const width = document.internal.pageSize.getWidth() - options.left - options.right;
  const title = printable(`${appearance.code} - ${zone.name.trim() || `Zone ${index + 1}`}`);
  const minimum = seaOperationZoneTableMinimumHeight(document, zone, index, options);
  let y = options.y;
  if (y + minimum > document.internal.pageSize.getHeight() - options.bottom && y > options.top) {
    document.addPage(); y = options.top;
  }
  autoTable(document, {
    startY: y, margin: { left: options.left, right: options.right, top: options.top, bottom: options.bottom },
    theme: 'grid', showHead: 'everyPage', rowPageBreak: 'avoid',
    head: [[{ content: title, colSpan: 2, styles: { fillColor: [...appearance.fillRgb], textColor: [...appearance.rgb],
      fontStyle: 'bold', fontSize: fontSize + 1, halign: 'left', cellPadding: 7 } }], ['Rang / Sommet', 'Coordonnées']],
    body: zone.vertices.length ? zone.vertices.map((vertex, vertexIndex) => [
      `${appearance.code}.${vertexIndex + 1}`, printable(formatSeaPosition(vertex)),
    ]) : [['-', 'Aucun sommet renseigné']],
    styles: { font: 'helvetica', fontSize, textColor: [34, 46, 59], lineColor: [209, 220, 230], lineWidth: .35,
      cellPadding: 4, valign: 'middle', halign: 'left', overflow: 'linebreak' },
    headStyles: { fillColor: [248, 250, 252], textColor: [34, 46, 59], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: Math.min(110, width * .25), textColor: [...appearance.rgb], cellPadding: { top: 4, right: 4, bottom: 4, left: 17 } },
      1: { halign: 'center' } },
    didDrawCell(cell) {
      if (cell.section !== 'body' || cell.column.index !== 0) return;
      const x = cell.cell.x + 8, cy = cell.cell.y + cell.cell.height / 2;
      document.saveGraphicsState(); document.setDrawColor(...appearance.rgb); document.setLineWidth(.55);
      document.line(x, cell.cell.y, x, cy); document.line(x, cy, x + 4, cy);
      document.restoreGraphicsState();
    },
  });
  return ((document as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 12;
}

/** Full names stay outside the map; map tags use only the stable short code. */
export function drawSeaOperationZoneLegendPdf(document: jsPDF, zones: readonly SeaOperationMapZone[],
  options: { y: number; left: number; right: number; top: number; bottom: number; fontSize?: number }) {
  let y = options.y;
  const fontSize = options.fontSize ?? 7, width = document.internal.pageSize.getWidth() - options.left - options.right;
  for (const [index, zone] of zones.entries()) {
    const appearance = seaOperationZoneAppearance(index);
    document.setFont('helvetica', 'normal'); document.setFontSize(fontSize);
    const lines = document.splitTextToSize(printable(`${appearance.code} - ${zone.name.trim() || `Zone ${index + 1}`}`), width - 16) as string[];
    for (const [lineIndex, line] of lines.entries()) {
      if (y + fontSize + 4 > document.internal.pageSize.getHeight() - options.bottom) { document.addPage(); y = options.top; }
      document.setTextColor(...appearance.rgb);
      if (!lineIndex) { document.setFillColor(...appearance.rgb); document.rect(options.left, y - fontSize + 1, 7, 7, 'F'); }
      document.text(line, options.left + 13, y); y += fontSize + 4;
    }
  }
  return y + (zones.length ? 7 : 0);
}
