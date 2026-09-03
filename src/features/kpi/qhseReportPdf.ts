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
const imagePromises = new Map<string, Promise<string>>();

async function loadPublicImage(path: string): Promise<string> {
  if (!imagePromises.has(path)) imagePromises.set(path, (async () => {
    try {
      const response = await fetch(path);
      if (!response.ok) return '';
      const blob = await response.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    } catch { return ''; }
  })());
  return imagePromises.get(path)!;
}

async function loadLogo(): Promise<string> {
  if (!logoPromise) {
    logoPromise = loadPublicImage('/bbtm-report-logo.png');
  }
  return logoPromise;
}

function pageScope(snapshot: QhseReportSnapshot): string {
  const years = [...new Set(snapshot.scope.years?.length ? snapshot.scope.years : [snapshot.scope.year])].sort((left, right) => left - right);
  const period = years.length === 1 ? String(years[0]) : `${years[0]}–${years.at(-1)}`;
  const vessels = snapshot.scope.vesselNames?.length ? snapshot.scope.vesselNames.join(', ') : snapshot.scope.vesselName;
  return `${period} · ${vessels || 'Tous les navires'}`;
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

const REFERENCE_PAGE_IDS = new Set(['social-safety-1', 'social-safety-vessel', 'environment', 'port-call-tracking-v2', 'social-governance']);

function referenceTitle(report: QhseReportDefinition): string {
  if (report.id === 'social-safety-1') return 'Indicateur RSE - Social / Sécurité';
  if (report.id === 'social-safety-vessel') return 'Indicateur RSE - QHSE Situations Dangereuses et Accidentologie';
  if (report.id === 'environment') return 'Indicateur RSE - Environnement';
  if (report.id === 'port-call-tracking-v2') return 'KPI OPERATIONS';
  return 'Indicateur RSE - Social et Gouvernance';
}

function drawReferenceHeader(doc: JsPdfType, report: QhseReportDefinition, snapshot: QhseReportSnapshot, logo: string, generatedAt: Date): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  if (logo) doc.addImage(logo, 'PNG', 14, 8, 25, 13, undefined, 'FAST');
  doc.setTextColor(18, 96, 130);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(report.id === 'social-safety-vessel' ? 12 : 14);
  const title = referenceTitle(report);
  const lines = doc.splitTextToSize(title, 118) as string[];
  doc.text(lines, pageWidth / 2, 15, { align: 'center' });
  if (report.id === 'port-call-tracking-v2') {
    doc.setFontSize(7);
    doc.text('Projet P144 - EMDT - GOURY', pageWidth / 2, 21, { align: 'center' });
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  doc.text(`Périmètre : ${pageScope(snapshot)}`, 14, 29);
  doc.text(`Date : ${formatGeneratedAt(generatedAt)}`, pageWidth - 14, 29, { align: 'right' });
  doc.setDrawColor(223, 228, 232);
  doc.line(14, 32, pageWidth - 14, 32);
}

function drawReferenceReport(doc: JsPdfType, report: QhseReportDefinition, snapshot: QhseReportSnapshot, logo: string, waterStressMap: string, generatedAt: Date): Blob {
  const content = buildQhseReportContent(report, snapshot);
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const width = pageWidth - (margin * 2);
  drawReferenceHeader(doc, report, snapshot, logo, generatedAt);
  let y = 37;
  const section = (title: string) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(18, 96, 130); doc.text(title, margin, y + 4); y += 8;
  };
  const table = (index: number, maxRows = 14) => {
    const item = content.tables[index];
    if (!item) return;
    section(item.title);
    autoTable(doc, {
      startY: y, head: [item.columns], body: item.rows.slice(0, maxRows), margin: { left: margin, right: margin },
      theme: 'plain', styles: { font: 'helvetica', fontSize: 5.8, cellPadding: 1.35, textColor: INK, lineColor: [225, 229, 233], lineWidth: { bottom: 0.15 } },
      headStyles: { fillColor: [224, 224, 224], textColor: [45, 45, 45], fontStyle: 'bold' }, alternateRowStyles: { fillColor: [247, 247, 247] },
    });
    y = ((doc as JsPdfType & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || y) + 4;
  };
  const chart = (index: number, x: number, chartY: number, chartWidth: number, chartHeight: number) => {
    const item = content.charts[index]; if (item) drawChart(doc, item, x, chartY, chartWidth, chartHeight);
  };

  if (report.id === 'social-safety-1') {
    table(0, 8); table(1, 8);
    const chartY = Math.max(y, 118);
    chart(0, margin, chartY, (width - 4) / 2, 44); chart(1, margin + ((width + 4) / 2), chartY, (width - 4) / 2, 44);
    chart(2, margin, chartY + 48, width, 72); y = chartY + 124;
  } else if (report.id === 'social-safety-vessel') {
    table(0, 8);
    const chartY = Math.max(y, 76);
    chart(0, margin, chartY, width, 72); chart(1, margin, chartY + 77, width, 72); y = chartY + 153;
  } else if (report.id === 'environment') {
    const valueCallout = (itemIndex: number, calloutY: number, caption: string) => {
      const item = content.metrics[itemIndex]; if (!item) return;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...INK); doc.text(item.value, pageWidth - margin - 3, calloutY, { align: 'right' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...MUTED); doc.text(caption, pageWidth - margin - 3, calloutY + 6, { align: 'right' });
    };
    section("1. Consommation d'eau");
    if (waterStressMap) {
      doc.addImage(waterStressMap, 'PNG', margin + 54, y, 70, 38, undefined, 'FAST');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(...MUTED);
      doc.text('Cartographie fixe de référence des zones présentant un stress hydrique', pageWidth / 2, y + 42, { align: 'center' });
      y += 46;
    }
    chart(0, margin, y, width - 37, 42); valueCallout(2, y + 20, 'Total sur la période en m³'); y += 48;
    section('2. Consommation de fuel'); chart(1, margin, y, width - 37, 42); valueCallout(0, y + 20, 'Total sur la période en m³'); y += 48;
    section('3. Émissions de GES'); chart(2, margin, y, width - 58, 38); valueCallout(3, y + 16, 'Émissions avec xBee');
    const avoided = content.tables[0]?.rows.find((row) => row[0] === 'GES évités')?.[1];
    if (avoided) { doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(11, 153, 73); doc.text(`${avoided} évitées`, pageWidth - margin - 3, y + 29, { align: 'right' }); }
    y += 42;
  } else if (report.id === 'port-call-tracking-v2') {
    section('1. Durée des escales en heures');
    chart(0, margin, y, width, 42); chart(1, margin, y + 45, width, 42); chart(2, margin, y + 90, width, 42); y += 136;
    table(0, 11);
    const targetMetrics = content.metrics.slice(1, 4);
    targetMetrics.forEach((item, index) => {
      const x = margin + (index * (width / 3));
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(18, 96, 130); doc.text(item.value, x + (width / 6), y + 3, { align: 'center' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(...MUTED); doc.text(item.label, x + (width / 6), y + 8, { align: 'center' });
    });
    y += 13;
  } else {
    section("1. Bien-être dans l'entreprise");
    const missing = content.notes.find((note) => note.title === 'Entretiens annuels');
    doc.setFillColor(...WARNING); doc.setDrawColor(235, 202, 142); doc.roundedRect(margin, y, width, 38, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(137, 82, 8); doc.text('Campagne d’entretien annuel — second lot', margin + 5, y + 8);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...INK); doc.text(doc.splitTextToSize(missing?.text || 'Données non disponibles.', width - 10), margin + 5, y + 15); y += 46;
    section('2. Discrimination / Atteinte aux droits humains'); y += 15;
    table(0, 18);
  }

  const notes = content.notes.filter((note) => report.id !== 'social-governance' || note.title !== 'Entretiens annuels');
  if (notes.length && y < 267) {
    const note = notes[0];
    doc.setFillColor(...(note.tone === 'warning' ? WARNING : PALE)); doc.setDrawColor(...LINE);
    const lines = doc.splitTextToSize(`${note.title} — ${note.text}`, width - 8) as string[];
    const boxHeight = Math.min(18, 6 + (lines.length * 3));
    doc.roundedRect(margin, y, width, boxHeight, 2, 2, 'FD'); doc.setFontSize(6); doc.setTextColor(...INK); doc.text(lines.slice(0, 4), margin + 4, y + 5); y += boxHeight + 2;
  }
  doc.setDrawColor(...LINE); doc.line(margin, 285, pageWidth - margin, 285);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(...MUTED);
  doc.text('BBTM · Rapport QHSE généré exclusivement depuis les données Supabase de SeaPilot', margin, 290);
  doc.text(`Page source ${report.sourcePage}`, pageWidth - margin, 290, { align: 'right' });
  return doc.output('blob');
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
  const waterStressMap = report.id === 'environment' ? await loadPublicImage('/qhse-water-stress-map.png') : '';
  let y = 34;

  doc.setProperties({
    title: report.title,
    subject: `Rapport QHSE SeaPilot · ${pageScope(snapshot)}`,
    author: 'BBTM · SeaPilot', creator: 'SeaPilot',
    keywords: `QHSE, KPI, ${snapshot.scope.year}, ${snapshot.scope.vesselName || 'flotte'}`,
  });

  if (REFERENCE_PAGE_IDS.has(report.id)) return drawReferenceReport(doc, report, snapshot, logo, waterStressMap, generatedAt);

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
    archive.file(qhseReportFileName(report, snapshot.scope.years || snapshot.scope.year, snapshot.scope.vesselNames?.join('-') || snapshot.scope.vesselName), await blob.arrayBuffer());
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
  const vesselName = snapshot.scope.vesselNames?.join('-') || snapshot.scope.vesselName;
  const vessel = vesselName
    ? `-${vesselName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`
    : '-flotte';
  const years = [...new Set(snapshot.scope.years?.length ? snapshot.scope.years : [snapshot.scope.year])].sort((left, right) => left - right);
  const period = years.length === 1 ? String(years[0]) : `${years[0]}-${years.at(-1)}`;
  return `rapports-qhse-${period}${vessel}.zip`;
}
