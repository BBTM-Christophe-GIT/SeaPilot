import autoTable from 'jspdf-autotable';
import type { jsPDF as JsPdfType } from 'jspdf';
import { buildQhseReportContent, type QhseReportChart, type QhseReportContent, type QhseReportOptions, type QhseReportSnapshot } from './qhseReportData';
import type { QhseReportDefinition } from './qhseReportCatalog';
import { consumptionCutoff, consumptionYears, consumptionYearSnapshot } from './qhseConsumption';

const INK: [number, number, number] = [26, 39, 57];
const MUTED: [number, number, number] = [78, 94, 112];
const BLUE: [number, number, number] = [18, 96, 130];
const LINE: [number, number, number] = [218, 227, 236];
const MARGIN = 14;
const WIDTH = 182;
const MODULE_HEIGHT = 51;
const number = (value: number, digits = 2) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits }).format(value).replace(/\u202f/g, ' ');
const dateLabel = (value: string) => value ? value.split('-').reverse().join('/') : 'aucune donnée';

interface PdfAssets {
  logo(): void;
  impact(impact: NonNullable<QhseReportContent['environmentalImpact']>, y: number): number;
  clean(value: string): string;
}

/** Dedicated native PDF layout: the 142 mm chart column stays aligned across all three modules. */
export function drawConsumptionPdf(doc: JsPdfType, report: QhseReportDefinition, snapshot: QhseReportSnapshot, options: QhseReportOptions, assets: PdfAssets): Blob {
  const years = consumptionYears(snapshot);
  const cutoff = consumptionCutoff(options);
  let scopeOverflow = '';
  const text = (value: string, x: number, y: number, size = 7, color = MUTED, bold = false, align: 'left' | 'right' | 'center' = 'left') => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color);
    doc.text(assets.clean(value), x, y, { align });
  };
  const header = (year: string, scoped: QhseReportSnapshot) => {
    assets.logo();
    text('RSE — consommations par projet', 42, 14, 14, BLUE, true);
    text('Eau, fuel et émissions', 42, 21, 9);
    text(year, WIDTH + MARGIN, 21, 10, BLUE, true, 'right');
    const vessels = snapshot.scope.vesselNames?.join(', ') || snapshot.scope.vesselName || 'Tous les navires';
    const projects = snapshot.scope.projectNames?.join(', ') || snapshot.scope.projectName || 'Tous les projets';
    doc.setFontSize(7);
    const scopeLines = doc.splitTextToSize(assets.clean(`${vessels} · ${projects}`), WIDTH) as string[];
    scopeOverflow = scopeLines.length > 3 ? `Périmètre complet : ${vessels} · ${projects}` : '';
    scopeLines.slice(0, 3).forEach((line, index) => text(index === 2 && scopeOverflow ? `${line} (…)` : line, MARGIN, 30 + index * 3.1));
    const lastDate = scoped.reports.map((row) => row.reportDate.slice(0, 10)).sort().at(-1) || '';
    const y = 34 + Math.max(0, Math.min(3, scopeLines.length) - 1) * 3.1;
    text(lastDate ? `DPR disponibles jusqu’au ${dateLabel(lastDate)}` : 'Aucun DPR disponible pour ce périmètre', MARGIN, y, 6.5);
    text(`Édité le ${dateLabel(cutoff)}`, MARGIN + WIDTH, y, 6.5, MUTED, false, 'right');
    return y + 6;
  };
  const module = (chart: QhseReportChart, title: string, value: string, caption: string, y: number, emissions: boolean) => {
    doc.setLineDashPattern([], 0); doc.setLineWidth(0.25); doc.setDrawColor(...LINE); doc.setFillColor(255, 255, 255);
    doc.roundedRect(MARGIN, y, WIDTH, MODULE_HEIGHT, 2, 2, 'FD');
    text(title, MARGIN + 4, y + 7, 11, BLUE, true);
    const hasTrend = chart.series.some((series) => series.trend);
    const rightTrend = chart.series.some((series) => series.trend && series.axis === 'right');
    text(rightTrend ? 'Cumuls : axe gauche · tendances mensuelles : axe droit' : chart.subtitle || '', MARGIN + 4, y + 12, 6.7);
    const hasForecast = chart.series.some((series) => series.forecast);
    if (hasTrend || hasForecast) text([hasTrend ? 'Losanges : tendance mensuelle' : '', hasForecast ? 'Pointillés : prévision' : ''].filter(Boolean).join(' · '), MARGIN + 4, y + 16, 6.2);
    const px = MARGIN + 10; const py = y + 20; const pw = 130; const ph = 22;
    const values = chart.series.filter((series) => series.axis !== 'right').flatMap((series) => series.values).filter((item): item is number => item !== null && Number.isFinite(item));
    const scaleMax = (items: number[]) => {
      const dataMax = Math.max(1, ...items);
      const step = 10 ** Math.floor(Math.log10(dataMax)) / 2;
      return Math.ceil(dataMax * 1.2 / step) * step;
    };
    const max = scaleMax(values);
    const rightMax = scaleMax(chart.series.filter((series) => series.axis === 'right').flatMap((series) => series.values).filter((item): item is number => item !== null && Number.isFinite(item)));
    const pointX = (index: number) => px + (chart.pointPositions?.[index] || 0) * pw;
    doc.setLineWidth(0.12);
    chart.monthTicks?.forEach((tick, month) => {
      const x = pointX(tick.startIndex ?? tick.index);
      doc.setDrawColor(235, 240, 245); doc.line(x, py, x, py + ph);
      text(tick.label, pointX(tick.index), y + 47, 6.5, MUTED, false, 'center');
      if (month === Number(cutoff.slice(5, 7)) - 1 && chart.series.some((series) => series.year === Number(cutoff.slice(0, 4)))) text('(en cours)', pointX(tick.index), y + 50, 5.7, MUTED, false, 'center');
    });
    [0, 0.5, 1].forEach((ratio) => {
      doc.setDrawColor(...LINE); doc.line(px, py + ph * (1 - ratio), px + pw, py + ph * (1 - ratio));
      text(number(max * ratio, 1), px - 2, py + ph * (1 - ratio) + 0.8, 6.2, MUTED, false, 'right');
      if (rightTrend) text(number(rightMax * ratio, 1), px + pw + 1, py + ph * (1 - ratio) + 0.8, 5.8);
    });
    const usedLabels: Array<{ x: number; y: number; width: number }> = [];
    chart.series.forEach((series) => {
      const indices = series.trend ? [] : emissions ? series.forecast ? [series.values.reduce((last, item, index) => item !== null ? index : last, -1)] : [] : series.valueLabelIndices || [];
      const labelIndices = new Set(indices);
      let path: Array<[number, number]> = [];
      const flush = () => {
        if (path.length > 1) {
          doc.setDrawColor(...series.color); doc.setLineWidth(0.35); doc.setLineDashPattern(series.forecast ? [1, 0.8] : [], 0);
          doc.lines(path.slice(1).map((point, index) => [point[0] - path[index][0], point[1] - path[index][1]]), path[0][0], path[0][1], [1, 1], 'S', false);
          doc.setLineDashPattern([], 0);
        }
        path = [];
      };
      series.values.forEach((value, index) => {
        if (value === null || !Number.isFinite(value)) { if (!series.trend) flush(); return; }
        const x = pointX(index); const yy = py + ph * (1 - value / (series.axis === 'right' ? rightMax : max));
        if (series.step && path.length) path.push([x, path.at(-1)![1]]);
        path.push([x, yy]);
        if (series.trend) {
          doc.setDrawColor(...series.color); doc.setFillColor(255, 255, 255); doc.setLineWidth(0.25);
          doc.lines([[0.7, 0.7], [-0.7, 0.7], [-0.7, -0.7], [0.7, -0.7]], x, yy - 0.7, [1, 1], 'FD', true);
        }
        if (!labelIndices.has(index)) return;
        const label = `${number(value)}${emissions ? '' : ' m³'}`;
        doc.setFontSize(6.5);
        const labelWidth = doc.getTextWidth(label);
        const labelX = Math.min(px + pw - labelWidth / 2, Math.max(px + labelWidth / 2, x));
        let labelY = emissions && series.color[1] > series.color[0] + 30 ? yy + 4 : Math.max(py - 1.2, yy - 2.3);
        for (let attempt = 0; attempt < 4 && usedLabels.some((used) => Math.abs(used.x - labelX) < (used.width + labelWidth) / 2 + 0.7 && Math.abs(used.y - labelY) < 2.8); attempt += 1) labelY -= 2.8;
        usedLabels.push({ x: labelX, y: labelY, width: labelWidth });
        text(label, labelX, labelY, 6.5, series.color, false, 'center');
        if (!series.forecast) {
          doc.setDrawColor(...series.color); doc.setFillColor(...series.color); doc.circle(x, yy, 0.4, emissions && series.color[0] > 100 ? 'S' : 'F');
        }
      });
      flush();
    });
    if (!values.length) text('Données non disponibles', px + pw / 2, py + ph / 2, 8, MUTED, false, 'center');
    doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(MARGIN + 146, y + 16, MARGIN + 146, y + 43);
    const cx = MARGIN + 164;
    if (emissions) {
      const actual = chart.series.filter((series) => !series.forecast && !series.trend);
      actual.forEach((series, index) => {
        const latest = series.values.filter((item): item is number => item !== null).at(-1);
        text(series.label, cx, y + 19 + index * 15, 6.5, series.color, false, 'center');
        text(latest === undefined ? '—' : number(latest), cx, y + 26 + index * 15, 12, series.color, true, 'center');
      });
      text('tCO₂e · réalisé', cx, y + 47, 6.3, MUTED, false, 'center');
    } else {
      const callout = assets.clean(value);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
      const size = Math.min(18, 18 * 32 / Math.max(1, doc.getTextWidth(callout)));
      text(value, cx, y + 28, size, INK, true, 'center');
      text(caption, cx, y + 35, 6.5, MUTED, false, 'center');
    }
  };
  const annualTable = (content: QhseReportContent, y: number) => {
    text('Synthèse annuelle · réalisé', MARGIN, y, 9, BLUE, true);
    autoTable(doc, {
      startY: y + 3, margin: { left: MARGIN, right: MARGIN, bottom: 18 }, tableWidth: WIDTH, theme: 'plain',
      head: [['Année', 'Eau (m³)', 'Fuel (m³)', 'Sans XBEE\n(tCO2e)', 'Avec XBEE\n(tCO2e)', 'Réduction\n(tCO2e)']],
      body: content.tables[0].rows.map((row) => row.map((value) => assets.clean(value.replace(/ (m³|tCO₂e)$/, '')))),
      styles: { font: 'helvetica', fontSize: 7, textColor: INK, cellPadding: 1.5 },
      headStyles: { fillColor: [242, 246, 249], textColor: MUTED, fontStyle: 'bold' },
      bodyStyles: { lineColor: LINE, lineWidth: { bottom: 0.15 } },
      columnStyles: { 0: { cellWidth: 16 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
    });
    return (doc as JsPdfType & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  };
  years.forEach((year, index) => {
    if (index) doc.addPage();
    const scoped = consumptionYearSnapshot(snapshot, year, cutoff);
    const content = buildQhseReportContent(report, scoped, { ...options, asOfDate: cutoff });
    let y = header(String(year), scoped);
    const forecastNotes = content.charts.map((chart, chartIndex) => chart.forecastNote ? chart.forecastNote.startsWith('Pointillés') ? chart.forecastNote : `${['Eau', 'Fuel', 'GES'][chartIndex]} : ${chart.forecastNote}` : '').filter(Boolean);
    const trendNotes = content.charts.map((chart, chartIndex) => chart.trendNote ? chart.trendNote.startsWith('Tendance :') ? chart.trendNote : `${['Eau', 'Fuel', 'GES'][chartIndex]} : ${chart.trendNote}` : '').filter(Boolean);
    module(content.charts[0], '1. Eau avitaillée', content.metrics[0].value, 'Total annuel réel', y, false); y += MODULE_HEIGHT + 5;
    module(content.charts[1], '2. Consommation de fuel', content.metrics[1].value, 'Total annuel réel', y, false); y += MODULE_HEIGHT + 5;
    module(content.charts[2], '3. Émissions de GES', '', '', y, true); y += MODULE_HEIGHT + 7;
    y = annualTable(content, y);
    if (content.environmentalImpact) y += assets.impact(content.environmentalImpact, y) + 3;
    const paragraphs = [
      'Émissions estimées : fuel en L ÷ 1 000 × facteur MDO Supabase ; hypothèse XBEE : réduction de 15 %.',
      ...new Set(forecastNotes),
      ...new Set(trendNotes),
      ...(content.charts.some((chart) => chart.series.some((series) => series.forecast)) ? [`Projection après le ${dateLabel(cutoff)} à rythme constant, sans saisonnalité ni intervalle de confiance. Les lacunes passées ne sont pas complétées et les totaux restent réels.`] : []),
      ...content.notes.map((note) => `${note.title} : ${note.text}`),
      ...(scopeOverflow ? [scopeOverflow] : []),
    ];
    doc.setFontSize(6.5);
    const lines = doc.splitTextToSize(assets.clean(paragraphs.join(' ')), WIDTH) as string[];
    if (y + lines.length * 2.7 > 282) { doc.addPage(); y = header(`${year} · Méthode et qualité des données`, scoped); }
    lines.forEach((line) => {
      if (y > 282) { doc.addPage(); y = header(`${year} · Méthode et qualité des données`, scoped); }
      text(line, MARGIN, y, 6.5); y += 2.7;
    });
  });
  if (years.length > 1) {
    doc.addPage();
    const y = header('Synthèse comparative', snapshot);
    const content = buildQhseReportContent(report, snapshot, { ...options, asOfDate: cutoff });
    const end = annualTable(content, y + 5);
    text('Comparaison des données réelles uniquement. Les prévisions ne sont pas additionnées aux cumuls.', MARGIN, end + 4, 7);
  }
  for (let page = 1; page <= doc.getNumberOfPages(); page += 1) {
    doc.setPage(page); text(String(page), 196, 290, 7, MUTED, false, 'right');
  }
  return doc.output('blob');
}
