import autoTable from 'jspdf-autotable';
import type { jsPDF as JsPdfType } from 'jspdf';
import { buildQhseReportContent, type QhseReportChart, type QhseReportSnapshot } from './qhseReportData';
import { qhseReportFileName, type QhseReportDefinition } from './qhseReportCatalog';

const NAVY: [number, number, number] = [16, 49, 83];
const BLUE: [number, number, number] = [24, 96, 174];
const INK: [number, number, number] = [26, 39, 57];
const MUTED: [number, number, number] = [92, 108, 126];
const LINE: [number, number, number] = [218, 227, 236];
const PALE: [number, number, number] = [244, 248, 252];
const WARNING: [number, number, number] = [255, 246, 226];

function formatGeneratedAt(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(date).replace(' à ', ' · ');
}

let logoPromise: Promise<string> | null = null;

async function loadLogo(): Promise<string> {
  if (!logoPromise) {
    logoPromise = (async (): Promise<string> => {
      try {
        const response = await fetch('/bbtm-report-logo.png');
        if (!response.ok) return '';
        const blob = await response.blob();
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
      } catch { return ''; }
    })();
  }
  return logoPromise;
}

function pageScope(snapshot: QhseReportSnapshot): string {
  return `${snapshot.scope.year} · ${snapshot.scope.vesselName || 'Tous les navires'}`;
}

function drawChart(doc: JsPdfType, chart: QhseReportChart, x: number, y: number, width: number, height: number): void {
  doc.setDrawColor(...LINE);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, width, height, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...INK);
  doc.text(chart.title, x + 4, y + 6);
  const legendY = y + 11;
  let legendX = x + 4;
  chart.series.forEach((series) => {
    doc.setFillColor(...series.color);
    doc.circle(legendX + 1.3, legendY - 1, 1.2, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.7);
    doc.setTextColor(...MUTED);
    doc.text(series.label, legendX + 4, legendY);
    legendX += Math.min(42, doc.getTextWidth(series.label) + 10);
  });
  const plotX = x + 8;
  const plotY = y + 16;
  const plotW = width - 12;
  const plotH = height - 25;
  const leftValues = chart.series.filter((series) => series.axis !== 'right').flatMap((series) => series.values)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const rightValues = chart.series.filter((series) => series.axis === 'right').flatMap((series) => series.values)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const max = Math.max(1, ...leftValues);
  const rightMax = Math.max(1, ...rightValues);
  doc.setDrawColor(...LINE);
  doc.line(plotX, plotY + plotH, plotX + plotW, plotY + plotH);
  [0.25, 0.5, 0.75, 1].forEach((ratio) => {
    const lineY = plotY + plotH - (plotH * ratio);
    doc.setDrawColor(235, 240, 245);
    doc.line(plotX, lineY, plotX + plotW, lineY);
  });
  const count = Math.max(1, chart.labels.length);
  if (chart.kind === 'bar') {
    const groupWidth = plotW / count;
    const gap = 0.7;
    const barWidth = Math.max(0.7, Math.min(5, (groupWidth - 1.4) / Math.max(1, chart.series.length) - gap));
    chart.labels.forEach((_, index) => {
      chart.series.forEach((series, seriesIndex) => {
        const value = series.values[index] || 0;
        const barHeight = Math.max(value > 0 ? 0.6 : 0, (value / max) * plotH);
        const usedWidth = chart.series.length * (barWidth + gap);
        const barX = plotX + (index * groupWidth) + ((groupWidth - usedWidth) / 2) + (seriesIndex * (barWidth + gap));
        doc.setFillColor(...series.color);
        doc.rect(barX, plotY + plotH - barHeight, barWidth, barHeight, 'F');
      });
    });
  } else {
    chart.series.forEach((series) => {
      doc.setDrawColor(...series.color);
      doc.setLineWidth(0.7);
      let previous: [number, number] | null = null;
      series.values.forEach((value, index) => {
        if (value === null || !Number.isFinite(value)) { previous = null; return; }
        const pointX = plotX + (count === 1 ? plotW / 2 : (index / (count - 1)) * plotW);
        const seriesMax = series.axis === 'right' ? rightMax : max;
        const pointY = plotY + plotH - ((value / seriesMax) * plotH);
        if (previous) doc.line(previous[0], previous[1], pointX, pointY);
        doc.setFillColor(...series.color);
        doc.circle(pointX, pointY, 0.9, 'F');
        previous = [pointX, pointY];
      });
    });
  }
  const labelStep = chart.labels.length > 8 ? Math.ceil(chart.labels.length / 6) : 1;
  chart.labels.forEach((label, index) => {
    if (index % labelStep !== 0 && index !== chart.labels.length - 1) return;
    const labelX = plotX + (count === 1 ? plotW / 2 : ((index + 0.5) / count) * plotW);
    doc.setFontSize(5.2);
    doc.setTextColor(...MUTED);
    doc.text(label.slice(0, 12), labelX, y + height - 3.2, { align: 'center' });
  });
  doc.setFontSize(5.4);
  doc.text(`${Math.round(max * 100) / 100}${chart.unit ? ` ${chart.unit}` : ''}`, plotX, plotY - 1.2);
  if (rightValues.length) doc.text(String(Math.round(rightMax * 100) / 100), plotX + plotW, plotY - 1.2, { align: 'right' });
}

export async function buildQhseReportPdf(report: QhseReportDefinition, snapshot: QhseReportSnapshot): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const content = buildQhseReportContent(report, snapshot);
  const doc = new jsPDF({ format: 'a4', unit: 'mm', orientation: report.orientation });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - (margin * 2);
  const generatedAt = new Date();
  const logo = await loadLogo();
  let y = 34;

  doc.setProperties({
    title: report.title,
    subject: `Rapport QHSE SeaPilot · ${pageScope(snapshot)}`,
    author: 'BBTM · SeaPilot', creator: 'SeaPilot',
    keywords: `QHSE, KPI, ${snapshot.scope.year}, ${snapshot.scope.vesselName || 'flotte'}`,
  });

  const drawHeader = () => {
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, pageWidth, 25, 'F');
    if (logo) doc.addImage(logo, 'PNG', margin, 5, 27, 13, undefined, 'FAST');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(report.title, logo ? margin + 33 : margin, 11);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(`Page source ${report.sourcePage} · ${report.sourceTitle}`, logo ? margin + 33 : margin, 17);
    doc.setFont('helvetica', 'bold');
    doc.text(pageScope(snapshot), pageWidth - margin, 11, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.text(`Généré le ${formatGeneratedAt(generatedAt)}`, pageWidth - margin, 17, { align: 'right' });
  };
  const addPage = () => {
    doc.addPage('a4', report.orientation);
    drawHeader();
    y = 34;
  };
  const ensure = (height: number) => { if (y + height > pageHeight - 18) addPage(); };
  const sectionTitle = (title: string) => {
    ensure(11);
    doc.setFillColor(...BLUE);
    doc.roundedRect(margin, y, contentWidth, 7, 1.5, 1.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(title.toUpperCase(), margin + 3, y + 4.8);
    y += 10;
  };

  drawHeader();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(...MUTED);
  const summaryLines = doc.splitTextToSize(content.summary, contentWidth) as string[];
  doc.text(summaryLines, margin, y);
  y += (summaryLines.length * 4) + 3;

  if (content.metrics.length) {
    const columns = report.orientation === 'landscape' ? 4 : 2;
    const gap = 3;
    const cardWidth = (contentWidth - ((columns - 1) * gap)) / columns;
    const cardHeight = 20;
    const rows = Math.ceil(content.metrics.length / columns);
    ensure((rows * (cardHeight + gap)) + 4);
    content.metrics.forEach((item, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const x = margin + (column * (cardWidth + gap));
      const cardY = y + (row * (cardHeight + gap));
      const tones: Record<'blue' | 'green' | 'orange' | 'red', [number, number, number]> = {
        blue: [235, 244, 253], green: [234, 248, 241], orange: [255, 245, 232], red: [253, 237, 239],
      };
      doc.setDrawColor(...LINE);
      doc.setFillColor(...tones[item.tone || 'blue']);
      doc.roundedRect(x, cardY, cardWidth, cardHeight, 2, 2, 'FD');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.4);
      doc.setTextColor(...MUTED);
      doc.text(item.label, x + 3, cardY + 5);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(...INK);
      doc.text(item.value, x + 3, cardY + 12.3);
      if (item.detail) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.6);
        doc.setTextColor(...MUTED);
        doc.text(doc.splitTextToSize(item.detail, cardWidth - 6)[0] || '', x + 3, cardY + 17);
      }
    });
    y += rows * (cardHeight + gap) + 1;
  }

  if (content.charts.length) {
    sectionTitle('Visualisations');
    const columns = report.orientation === 'landscape' && content.charts.length > 1 ? 2 : 1;
    const gap = 4;
    const chartWidth = (contentWidth - ((columns - 1) * gap)) / columns;
    const chartHeight = report.orientation === 'landscape' ? 64 : 60;
    content.charts.forEach((chart, index) => {
      if (index > 0 && index % columns === 0) y += chartHeight + gap;
      ensure(chartHeight + 2);
      const column = index % columns;
      drawChart(doc, chart, margin + (column * (chartWidth + gap)), y, chartWidth, chartHeight);
    });
    y += chartHeight + 4;
  }

  for (const table of content.tables) {
    sectionTitle(table.title);
    if (!table.rows.length) {
      ensure(15);
      doc.setFillColor(...PALE);
      doc.setDrawColor(...LINE);
      doc.roundedRect(margin, y, contentWidth, 12, 2, 2, 'FD');
      doc.setTextColor(...MUTED);
      doc.setFontSize(7);
      doc.text('Aucune donnée disponible pour ce tableau.', margin + 4, y + 7);
      y += 16;
      continue;
    }
    autoTable(doc, {
      startY: y, head: [table.columns], body: table.rows,
      margin: { left: margin, right: margin, top: 30, bottom: 18 },
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: report.orientation === 'landscape' ? 6.5 : 6.2, cellPadding: 1.8, textColor: INK, lineColor: LINE, lineWidth: 0.15, overflow: 'linebreak' },
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: PALE },
      didDrawPage: ({ pageNumber }) => { if (pageNumber > 1) drawHeader(); },
    });
    y = ((doc as JsPdfType & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || y) + 5;
  }

  if (content.notes.length) {
    sectionTitle('Lecture et limites');
    content.notes.forEach((note) => {
      const bodyLines = doc.splitTextToSize(note.text, contentWidth - 8) as string[];
      const height = 10 + (bodyLines.length * 3.2);
      ensure(height + 3);
      doc.setFillColor(...(note.tone === 'warning' ? WARNING : PALE));
      doc.setDrawColor(...LINE);
      doc.roundedRect(margin, y, contentWidth, height, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      const noteTitleColor: [number, number, number] = note.tone === 'warning' ? [137, 82, 8] : BLUE;
      doc.setTextColor(...noteTitleColor);
      doc.text(note.title, margin + 4, y + 5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...INK);
      doc.text(bodyLines, margin + 4, y + 9.2);
      y += height + 3;
    });
  }

  if (content.sources.length) {
    ensure(12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(...MUTED);
    doc.text(doc.splitTextToSize(`Sources : ${content.sources.join(' · ')}`, contentWidth), margin, y + 2);
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...LINE);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...MUTED);
    doc.text('BBTM · Rapport QHSE généré exclusivement depuis SeaPilot', margin, pageHeight - 7);
    doc.text(`Page ${page} / ${pageCount}`, pageWidth - margin, pageHeight - 7, { align: 'right' });
  }
  return doc.output('blob');
}

export async function buildQhseReportArchive(
  reports: readonly QhseReportDefinition[],
  snapshot: QhseReportSnapshot,
  onProgress?: (completed: number, total: number) => void,
): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const archive = new JSZip();
  for (let index = 0; index < reports.length; index += 1) {
    const report = reports[index];
    const blob = await buildQhseReportPdf(report, snapshot);
    archive.file(qhseReportFileName(report, snapshot.scope.year, snapshot.scope.vesselName), await blob.arrayBuffer());
    onProgress?.(index + 1, reports.length);
  }
  return archive.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export function downloadQhseBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function qhseReportArchiveFileName(snapshot: QhseReportSnapshot): string {
  const vessel = snapshot.scope.vesselName
    ? `-${snapshot.scope.vesselName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`
    : '-flotte';
  return `rapports-qhse-${snapshot.scope.year}${vessel}.zip`;
}
