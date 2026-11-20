import type { jsPDF } from 'jspdf';
import { FLEET_LIST_COLUMNS, type FleetListColumnKey, type FleetListLanguage } from './fleetList';
import type { FleetVessel } from './fleetQueries';

const NAVY: [number, number, number] = [8, 38, 67];
const TEAL: [number, number, number] = [0, 150, 170];
const INK: [number, number, number] = [20, 38, 54];
const GRID: [number, number, number] = [206, 220, 228];
const PALE: [number, number, number] = [240, 246, 248];
const MARGIN = 12;
const TABLE_TOP = 32;
const TABLE_GAP = 6;
const LOCALES = {
  fr: { title: 'Flotte BBTM', vessel: 'Navire', filename: 'Flotte-BBTM-FR.pdf' },
  en: { title: 'BBTM Fleet', vessel: 'Vessel', filename: 'BBTM-Fleet-EN.pdf' },
};
const TABLE_SIZES = [
  { fontSize: 9.5, paddingX: 2, paddingY: 2.1 },
  { fontSize: 9, paddingX: 1.7, paddingY: 1.7 },
  { fontSize: 8.5, paddingX: 1.5, paddingY: 1.35 },
  { fontSize: 8, paddingX: 1.25, paddingY: 1.05 },
  { fontSize: 7.5, paddingX: 1, paddingY: 0.8 },
  { fontSize: 7, paddingX: 0.8, paddingY: 0.65 },
];

async function loadLogo() {
  const response = await fetch('/bbtm-report-logo.png');
  if (!response.ok) throw new Error('Le logo BBTM est indisponible. Réessayez.');
  return new Uint8Array(await response.arrayBuffer());
}

async function loadPdfResources() {
  const [{ jsPDF }, { autoTable }, logo] = await Promise.all([
    import('jspdf'), import('jspdf-autotable'), loadLogo(),
  ]);
  return { jsPDF, autoTable, logo };
}

function header(doc: jsPDF, title: string, logo: Uint8Array, pageWidth: number) {
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageWidth, 3, 'F');
  doc.addImage(logo, 'PNG', MARGIN, 8, 16, 16, 'bbtm-logo');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...NAVY);
  doc.text(title, MARGIN + 23, 18.8);
  doc.setDrawColor(...TEAL);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, 28, pageWidth - MARGIN, 28);
}

function cellText(value: string) {
  return value.normalize('NFC').replace(/[\u00a0\u202f]/g, ' ').trim() || '-';
}

function columnWidths(
  doc: jsPDF, head: string[], body: string[][], weights: number[], tableWidth: number, paddingX: number,
) {
  const minimum = head.map(() => 5 + 2 * paddingX);
  const preferred = [...minimum];
  const measure = (text: string, index: number) => {
    for (const line of text.split('\n')) {
      const lineWidth = doc.getTextWidth(line) + 2 * paddingX;
      preferred[index] = Math.max(preferred[index], Math.min(lineWidth, weights[index] * 30));
      for (const word of line.split(/\s+/)) {
        // Keep identifiers and ordinary words together, even in a dense selection.
        const wordWidth = Math.min(doc.getTextWidth(word), 34) + 2 * paddingX;
        minimum[index] = Math.max(minimum[index], wordWidth);
      }
    }
  };
  doc.setFont('helvetica', 'bold');
  head.forEach(measure);
  body.forEach((row) => measure(row[0], 0));
  doc.setFont('helvetica', 'normal');
  body.forEach((row) => row.slice(1).forEach((text, index) => measure(text, index + 1)));
  preferred.forEach((width, index) => { preferred[index] = Math.max(minimum[index], width); });
  const preferredTotal = preferred.reduce((sum, width) => sum + width, 0);
  const minimumTotal = minimum.reduce((sum, width) => sum + width, 0);
  if (minimumTotal > tableWidth) return null;
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);

  const widths = preferred.map((width, index) => {
    if (preferredTotal <= tableWidth) return width + (tableWidth - preferredTotal) * weights[index] / weightTotal;
    return minimum[index] + (tableWidth - minimumTotal) * (width - minimum[index]) / (preferredTotal - minimumTotal);
  });
  return Object.fromEntries(widths.map((cellWidth, index) => [index, { cellWidth }]));
}

function selectedVessels(vessels: readonly FleetVessel[]) {
  const records = vessels.filter((vessel) => vessel.assetKind === 'vessel' && vessel.active);
  if (!records.length) throw new Error('Sélectionnez au moins un navire.');
  return records;
}

function drawFleetList(
  vessels: readonly FleetVessel[], columnKeys: readonly FleetListColumnKey[], language: FleetListLanguage,
  { jsPDF, autoTable, logo }: Awaited<ReturnType<typeof loadPdfResources>>,
): Blob {
  const locale = LOCALES[language];
  const columns = FLEET_LIST_COLUMNS.filter((column) => columnKeys.includes(column.key));
  const table = (tableColumns: typeof columns) => ({
    head: [locale.vessel, ...tableColumns.map((column) => column.labels[language])],
    body: vessels.map((vessel) => [cellText(vessel.name), ...tableColumns.map((column) => cellText(column.value(vessel, language)))]),
    weights: [1.65, ...tableColumns.map((column) => column.weight)],
  });
  const layouts = [[table(columns)]];
  // Continue the wide table beneath its first block, repeating the vessel column.
  for (const blockCount of [2, 3]) {
    if (columns.length <= 7 * (blockCount - 1)) break;
    layouts.push(Array.from({ length: blockCount }, (_, index) => table(columns.slice(
      Math.round(index * columns.length / blockCount),
      Math.round((index + 1) * columns.length / blockCount),
    ))));
  }

  for (const tables of layouts) {
    const orientations = tables.length > 1 || columns.length <= 6
      ? ['portrait', 'landscape'] as const : ['landscape', 'portrait'] as const;
    for (const { fontSize, paddingX, paddingY } of TABLE_SIZES) {
      for (const orientation of orientations) {
        const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
        const pageWidth = doc.internal.pageSize.getWidth();
        const availableHeight = doc.internal.pageSize.getHeight() - TABLE_TOP - MARGIN - (tables.length - 1) * TABLE_GAP;
        const minimumRowHeight = fontSize * doc.getLineHeightFactor() / doc.internal.scaleFactor + 2 * paddingY;
        if ((vessels.length + 1) * tables.length * minimumRowHeight > availableHeight) continue;
        const tableWidth = pageWidth - 2 * MARGIN;
        doc.setFontSize(fontSize);
        const widths = tables.map(({ head, body, weights }) => columnWidths(doc, head, body, weights, tableWidth, paddingX));
        if (!widths.every((width) => width !== null)) continue;

        header(doc, locale.title, logo, pageWidth);
        let startY = TABLE_TOP;
        for (const [index, { head, body }] of tables.entries()) {
          if (startY >= doc.internal.pageSize.getHeight() - MARGIN) break;
          const width = widths[index];
          autoTable(doc, {
            head: [head], body, tableWidth, startY,
            margin: { top: TABLE_TOP, left: MARGIN, right: MARGIN, bottom: MARGIN },
            theme: 'grid', rowPageBreak: 'avoid',
            styles: {
              font: 'helvetica', fontSize, textColor: INK, lineColor: GRID, lineWidth: 0.16,
              overflow: 'linebreak', valign: 'middle',
              cellPadding: { top: paddingY, bottom: paddingY, left: paddingX, right: paddingX },
            },
            headStyles: { fillColor: NAVY, textColor: 255, lineColor: [69, 94, 115], fontStyle: 'bold' },
            columnStyles: { ...width, 0: { ...width[0], fontStyle: 'bold' } },
            alternateRowStyles: { fillColor: PALE },
          });
          if (doc.getNumberOfPages() > 1) break;
          if (index === tables.length - 1) {
            doc.setLanguage(language);
            doc.setProperties({ title: locale.title, author: 'BBTM', creator: 'BBTM' });
            return doc.output('blob');
          }
          startY = (doc as typeof doc & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + TABLE_GAP;
        }
      }
    }
  }

  throw new Error('La sélection dépasse une page A4. Retirez des caractéristiques ou des navires, puis réessayez.');
}

export async function buildFleetListPdf(
  vessels: readonly FleetVessel[], columnKeys: readonly FleetListColumnKey[], language: FleetListLanguage,
): Promise<Blob> {
  const records = selectedVessels(vessels);
  return drawFleetList(records, columnKeys, language, await loadPdfResources());
}

function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadFleetListPdfs(
  vessels: readonly FleetVessel[], columnKeys: readonly FleetListColumnKey[], languages: readonly FleetListLanguage[],
): Promise<void> {
  const [first, ...remaining] = [...new Set(languages)];
  if (!first) throw new Error('Sélectionnez au moins une langue.');
  const records = selectedVessels(vessels);
  const resources = await loadPdfResources();
  const firstPdf = drawFleetList(records, columnKeys, first, resources);
  if (!remaining.length) {
    downloadFile(firstPdf, LOCALES[first].filename);
    return;
  }

  const { default: JSZip } = await import('jszip');
  const archive = new JSZip();
  archive.file(LOCALES[first].filename, await firstPdf.arrayBuffer());
  for (const language of remaining) {
    const pdf = drawFleetList(records, columnKeys, language, resources);
    archive.file(LOCALES[language].filename, await pdf.arrayBuffer());
  }
  downloadFile(await archive.generateAsync({ type: 'blob' }), 'Flotte-BBTM-FR-EN.zip');
}
