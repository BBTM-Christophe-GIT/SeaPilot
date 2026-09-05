import autoTable from 'jspdf-autotable';
import type { jsPDF as Pdf } from 'jspdf';
import type { QhseReportDefinition } from './qhseReportCatalog';
import { buildQhseReportContent, type QhseReportChart, type QhseReportOptions, type QhseReportSnapshot } from './qhseReportData';
import { consumptionCutoff, consumptionYears } from './qhseConsumption';
import { maritimeYearSnapshot } from './qhseMaritimeReports';

type Rgb = [number, number, number];
const BLUE: Rgb = [18, 96, 130]; const INK: Rgb = [26, 39, 57]; const MUTED: Rgb = [78, 94, 112]; const LINE: Rgb = [218, 227, 236];
const M = 14; const W = 182; const BOTTOM = 278;
const number = (value: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value).replace(/[\u202f\u00a0]/g, ' ');
interface Assets { logo(): void; clean(value: string): string }

/** Common print language for the KPI library, matching the approved consumption PDF. */
export function drawMaritimePdf(doc: Pdf, report: QhseReportDefinition, input: QhseReportSnapshot, options: QhseReportOptions, assets: Assets): Blob {
  const cutoff = consumptionCutoff(options);
  let y = 40;
  let activeYear = input.scope.year;
  let headerEnd = y;
  const text = (value: string, x: number, at: number, size = 7, color = MUTED, bold = false, align: 'left' | 'right' | 'center' = 'left') => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color); doc.text(assets.clean(value), x, at, { align });
  };
  const lines = (value: string, width: number, size = 7, bold = false): string[] => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); return doc.splitTextToSize(assets.clean(value), width, { fontSize: size, fontName: 'helvetica', fontStyle: bold ? 'bold' : 'normal' }) as string[];
  };
  const header = () => {
    assets.logo();
    const title = lines(report.title, 153, 14, true);
    title.forEach((line, i) => text(line, 42, 14 + i * 5, 14, BLUE, true));
    text(report.family, 42, 23 + (title.length - 1) * 5, 8);
    text(String(activeYear), 196, 23 + (title.length - 1) * 5, 9, BLUE, true, 'right');
    const scope = `${input.scope.vesselNames?.join(', ') || input.scope.vesselName || 'Tous les navires'} · ${input.scope.projectNames?.join(', ') || input.scope.projectName || 'Tous les projets'}`;
    const scopeLines = lines(scope, W, 7);
    const start = 31 + (title.length - 1) * 5;
    scopeLines.forEach((line, i) => text(line, M, start + i * 3.2));
    y = start + scopeLines.length * 3.2;
    text(`Données arrêtées au ${(`${activeYear}-12-31` < cutoff ? `${activeYear}-12-31` : cutoff).split('-').reverse().join('/')}`, M, y + 1, 6.5);
    text(`Édité le ${cutoff.split('-').reverse().join('/')}`, 196, y + 1, 6.5, MUTED, false, 'right');
    y += 7;
    headerEnd = y;
  };
  const nextPage = () => { doc.addPage('a4', 'portrait'); header(); };
  const ensure = (height: number) => { if (y + height > BOTTOM) nextPage(); };
  const title = (value: string) => { ensure(14); text(value, M, y + 3, 9, BLUE, true); y += 7; };

  const chart = (item: QhseReportChart) => {
    const height = item.horizontal ? Math.max(49, item.labels.length * 5 + 20) : 49;
    ensure(height + 4);
    doc.setLineDashPattern([], 0); doc.setDrawColor(...LINE); doc.setFillColor(255, 255, 255); doc.setLineWidth(.25); doc.roundedRect(M, y, W, height, 2, 2, 'FD');
    text(item.title, M + 4, y + 7, 10, BLUE, true);
    text(item.subtitle || `${item.unit || 'Nombre'} · valeurs enregistrées`, M + 4, y + 12, 6.5);
    let legendX = M + 4; let legendY = y + 16;
    item.series.forEach((series) => {
      const label = assets.clean(series.label); doc.setFontSize(6);
      const width = doc.getTextWidth(label) + 10;
      if (legendX + width > M + W - 3) { legendX = M + 4; legendY += 3; }
      doc.setLineWidth(.4); doc.setDrawColor(...series.color); doc.setLineDashPattern(series.forecast ? [1, .8] : [], 0);
      doc.line(legendX, legendY - .7, legendX + 4, legendY - .7); doc.setLineDashPattern([], 0);
      if (series.trend) doc.circle(legendX + 2, legendY - .7, .6, 'S');
      text(label, legendX + 5, legendY, 6); legendX += width;
    });
    const px = M + (item.horizontal ? 72 : 14); const pw = W - (item.horizontal ? 90 : 21);
    const py = legendY + 4; const ph = height - (py - y) - 10;
    const values = item.series.flatMap((s) => s.values).filter((v): v is number => v !== null && Number.isFinite(v));
    const maxRaw = Math.max(1, ...values); const step = 10 ** Math.floor(Math.log10(maxRaw)) / 2; const max = Math.ceil(maxRaw * 1.15 / step) * step;
    if (!values.length) text('Aucune donnée exploitable pour ce graphique', M + W / 2, py + ph / 2, 8, MUTED, false, 'center');
    if (item.horizontal) {
      const rowHeight = ph / Math.max(1, item.labels.length);
      item.labels.forEach((label, i) => {
        const value = item.series[0]?.values[i]; const rowY = py + i * rowHeight;
        lines(label, 62, 7).slice(0, 2).forEach((line, j) => text(line, M + 4, rowY + 2 + j * 2.5, 7));
        if (value !== null && value !== undefined) {
          doc.setFillColor(...item.series[0].color); doc.rect(px, rowY, value / max * pw, Math.min(2.5, rowHeight - 1), 'F');
          text(number(value), px + pw + 2, rowY + 2, 7);
        }
      });
    } else {
      [0, .5, 1].forEach((ratio) => {
        doc.setDrawColor(...LINE); doc.setLineWidth(.12); doc.line(px, py + ph * (1 - ratio), px + pw, py + ph * (1 - ratio));
        text(number(max * ratio), px - 2, py + ph * (1 - ratio) + 1, 6.2, MUTED, false, 'right');
      });
      const count = Math.max(1, item.labels.length); const barSeries = item.series.filter((s) => !s.forecast && !s.trend);
      const xAt = (index: number) => px + (index + .5) / count * pw;
      item.series.forEach((series) => {
        doc.setDrawColor(...series.color); doc.setFillColor(...series.color); doc.setLineWidth(.4); doc.setLineDashPattern(series.forecast ? [1, .8] : [], 0);
        let previous: [number, number] | null = null;
        series.values.forEach((value, i) => {
          if (value === null || !Number.isFinite(value)) { previous = null; return; }
          const x = xAt(i); const yy = py + ph * (1 - value / max);
          if (item.kind === 'bar' && !series.trend && !series.forecast) {
            const bw = Math.min(5, pw / count / (barSeries.length + 1));
            doc.rect(x + (barSeries.indexOf(series) - barSeries.length / 2) * bw, yy, bw * .85, Math.max(0, py + ph - yy), 'F');
          } else {
            if (previous) doc.line(previous[0], previous[1], x, yy);
            if (series.trend) doc.lines([[.7, .7], [-.7, .7], [-.7, -.7], [.7, -.7]], x, yy - .7, [1, 1], 'S', true);
            else if (!series.forecast) doc.circle(x, yy, .45, 'F');
          }
          previous = [x, yy];
        });
        doc.setLineDashPattern([], 0);
      });
      item.labels.forEach((label, i) => {
        const split = lines(label, pw / count - 1, 6.5);
        split.slice(0, 2).forEach((line, j) => text(line, xAt(i), py + ph + 4 + j * 2.4, 6.5, MUTED, false, 'center'));
      });
    }
    y += height + 4;
  };

  (report.id === 'menu' ? [input.scope.year] : consumptionYears(input)).forEach((year, yearIndex) => {
    activeYear = year;
    if (yearIndex) doc.addPage('a4', 'portrait');
    header();
    const snapshot = maritimeYearSnapshot(input, year, options);
    const content = buildQhseReportContent(report, snapshot, options);
    const summary = lines(content.summary, W, 7);
    summary.forEach((line) => { ensure(4); text(line, M, y); y += 3.4; }); y += 2;
    const metrics = content.metrics;
    for (let index = 0; index < metrics.length; index += 4) {
      ensure(28);
      metrics.slice(index, index + 4).forEach((m, i) => {
        const x = M + i * 46.5;
        doc.setDrawColor(...LINE); doc.setFillColor(255, 255, 255); doc.setLineWidth(.25); doc.roundedRect(x, y, 42.5, 24, 2, 2, 'FD');
        lines(m.label, 35, 6.8, true).slice(0, 2).forEach((line, j) => text(line, x + 3, y + 4.5 + j * 3, 6.8, MUTED, true));
        text(m.value, x + 3, y + 14, m.value.length > 17 ? 9 : 12, INK, true);
        lines(m.detail || '', 36, 6).slice(0, 2).forEach((line, j) => text(line, x + 3, y + 19 + j * 2.5, 6));
      }); y += 28;
    }
    content.charts.forEach(chart);
    for (const table of content.tables) {
      title(table.title);
      if (!table.rows.length) { text('Aucun enregistrement disponible dans le périmètre.', M, y + 2); y += 8; continue; }
      autoTable(doc, {
        startY: y, head: [table.columns.map(assets.clean)], body: table.rows.map((r) => r.map(assets.clean)),
        margin: { left: M, right: M, top: headerEnd + 2, bottom: 19 }, theme: 'plain', rowPageBreak: 'avoid',
        styles: { font: 'helvetica', fontSize: 7, cellPadding: 1.6, textColor: INK, lineColor: LINE, lineWidth: { bottom: .1 } },
        headStyles: { fillColor: [242, 246, 250], textColor: MUTED, fontStyle: 'bold' },
        didDrawPage: ({ pageNumber }) => { if (pageNumber > 1) header(); },
      });
      y = (doc as Pdf & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
    }
    const methods = [...new Set(content.charts.flatMap((c) => [c.trendNote, c.forecastNote].filter((s): s is string => Boolean(s))))];
    const notes = [...content.notes, ...(methods.length ? [{ title: 'Options graphiques', text: methods.join(' ') }] : [])];
    notes.forEach((item) => {
      const body = lines(`${item.title} — ${item.text}`, W - 8, 6.5);
      const height = body.length * 3 + 5;
      ensure(height + 2);
      doc.setDrawColor(...LINE); doc.setFillColor(248, 250, 252); doc.setLineWidth(.2); doc.roundedRect(M, y, W, height, 2, 2, 'FD');
      body.forEach((line, i) => text(line, M + 4, y + 4 + i * 3, 6.5)); y += height + 2;
    });
    const sources = lines(`Sources : ${content.sources.join(' · ')}`, W, 6);
    // Keep a short source line with its report instead of creating a nearly empty page.
    if (y + sources.length * 3 + 2 > 285) ensure(sources.length * 3 + 4);
    sources.forEach((line, i) => text(line, M, y + 2 + i * 3, 6));
  });
  for (let page = 1; !options.omitPageNumbers && page <= doc.getNumberOfPages(); page++) { doc.setPage(page); text(String(page), 196, 290, 6, MUTED, false, 'right'); }
  return doc.output('blob');
}
