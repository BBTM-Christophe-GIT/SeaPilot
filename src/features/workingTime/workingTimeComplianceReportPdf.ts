import { jsPDF } from 'jspdf';
import type { WorkingTimeComplianceReportData } from './workingTimeComplianceReportModel';

const NAVY: [number, number, number] = [16, 48, 108];
const TEAL: [number, number, number] = [8, 117, 139];
const RED: [number, number, number] = [189, 45, 65];
const INK: [number, number, number] = [30, 48, 68];
const MUTED: [number, number, number] = [92, 113, 132];
const PALE: [number, number, number] = [240, 246, 249];

export interface GeneratedCompliancePdf {
  document: jsPDF;
  filename: string;
}

function formatNumber(value: number | null | undefined, digits = 2): string {
  return value === null || value === undefined
    ? 'Non configuré'
    : value.toLocaleString('fr-FR', { maximumFractionDigits: digits });
}

function safeFilename(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '');
}

async function fetchLogo(): Promise<Uint8Array | null> {
  try {
    const response = await fetch('/bbtm-report-logo.png');
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

export async function buildWorkingTimeCompliancePdf(
  report: WorkingTimeComplianceReportData,
  analysis: string,
): Promise<GeneratedCompliancePdf> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const logo = await fetchLogo();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const left = 15;
  const right = pageWidth - 15;
  const contentWidth = right - left;
  let y = 16;

  const addPage = () => {
    doc.addPage();
    y = 16;
  };
  const ensure = (height: number) => {
    if (y + height > pageHeight - 16) addPage();
  };
  const heading = (title: string) => {
    ensure(14);
    doc.setTextColor(...NAVY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(title, left, y);
    doc.setDrawColor(202, 216, 226);
    doc.line(left, y + 3, right, y + 3);
    y += 10;
  };
  const paragraph = (value: string, color: [number, number, number] = INK) => {
    doc.setTextColor(...color);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(value, contentWidth);
    ensure(lines.length * 4.2 + 3);
    doc.text(lines, left, y);
    y += lines.length * 4.2 + 3;
  };

  if (logo) doc.addImage(logo, 'PNG', left, y, 28, 15, undefined, 'FAST');
  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.text('Rapport de suivi du temps de travail', logo ? left + 34 : left, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(report.periodLabel, logo ? left + 34 : left, y + 13);
  y += 23;

  heading('Résumé exécutif');
  paragraph(analysis);

  heading('Chiffres clés');
  const cards = [
    ['Heures de travail', `${formatNumber(report.workHours, 1)} h`],
    ['Journées non conformes', formatNumber(report.nonCompliantDays, 0)],
    ['Marins concernés', formatNumber(report.peopleAffected, 0)],
    ['Heures d’exposition HSE', `${formatNumber(report.rawKpis.exposure_hours, 1)} h`],
  ];
  const cardGap = 3;
  const cardWidth = (contentWidth - cardGap * 3) / 4;
  ensure(28);
  cards.forEach(([label, value], index) => {
    const x = left + index * (cardWidth + cardGap);
    doc.setFillColor(...PALE);
    doc.roundedRect(x, y, cardWidth, 23, 2, 2, 'F');
    doc.setTextColor(...MUTED);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.3);
    doc.text(doc.splitTextToSize(label, cardWidth - 6), x + 3, y + 6);
    doc.setTextColor(...NAVY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(value, x + 3, y + 18);
  });
  y += 29;

  if (report.metricKeys.includes('imca')) {
    paragraph(`KPI IMCA — LTI ${formatNumber(report.rates.LTI, 0)} · LTIFR ${formatNumber(report.rates.LTIFR)} · TRIR ${formatNumber(report.rates.TRIR)} · FAR ${formatNumber(report.rates.FAR)} · Taux FAC ${formatNumber(report.rates.FAC_rate)} · Taux MTC ${formatNumber(report.rates.MTC_rate)} · Taux RWC ${formatNumber(report.rates.RWC_rate)} · SOFR ${formatNumber(report.rates.SOFR)}.`, NAVY);
  }
  if (report.metricKeys.includes('french')) {
    paragraph(`Indicateurs français — taux de fréquence ${formatNumber(report.rates.french_frequency_rate)} · taux de gravité ${formatNumber(report.rates.french_severity_rate)}.`, NAVY);
  }

  heading('Évolution de la période');
  ensure(66);
  const chartX = left + 8;
  const chartY = y + 3;
  const chartW = contentWidth - 16;
  const chartH = 42;
  const maxHours = Math.max(1, ...report.trend.map((point) => point.workHours));
  const points = report.trend;
  doc.setDrawColor(205, 217, 226);
  doc.line(chartX, chartY + chartH, chartX + chartW, chartY + chartH);
  doc.line(chartX, chartY, chartX, chartY + chartH);
  if (points.length) {
    doc.setDrawColor(...TEAL);
    doc.setLineWidth(0.8);
    points.forEach((point, index) => {
      if (index === 0) return;
      const previous = points[index - 1];
      const x1 = chartX + ((index - 1) / Math.max(1, points.length - 1)) * chartW;
      const x2 = chartX + (index / Math.max(1, points.length - 1)) * chartW;
      const y1 = chartY + chartH - (previous.workHours / maxHours) * chartH;
      const y2 = chartY + chartH - (point.workHours / maxHours) * chartH;
      doc.line(x1, y1, x2, y2);
    });
    const step = Math.max(1, Math.ceil(points.length / 8));
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    points.forEach((point, index) => {
      if (index % step !== 0 && index !== points.length - 1) return;
      const x = chartX + (index / Math.max(1, points.length - 1)) * chartW;
      doc.text(point.label, x, chartY + chartH + 5, { align: 'center' });
    });
  }
  y += 54;
  paragraph('Le graphique présente les heures de travail enregistrées par mois ou par jour selon la durée sélectionnée. Source : intervalles horodatés du registre.', MUTED);

  heading('Répartition des journées non conformes');
  const breakdown = report.breakdownByPerson.slice(0, 10);
  const maxValue = Math.max(1, ...breakdown.map((item) => item.value));
  breakdown.forEach((item) => {
    ensure(9);
    doc.setFontSize(7.5);
    doc.setTextColor(...INK);
    doc.text(item.label, left, y + 3, { maxWidth: 55 });
    const barX = left + 60;
    const barWidth = (contentWidth - 72) * item.value / maxValue;
    doc.setFillColor(...RED);
    doc.roundedRect(barX, y, Math.max(1.5, barWidth), 4.5, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text(String(item.value), right, y + 3.5, { align: 'right' });
    y += 8;
  });
  if (!breakdown.length) paragraph('Aucune journée non conforme n’a été détectée dans le périmètre sélectionné.');
  else paragraph('Chaque valeur correspond à un couple unique marin/date possédant au moins une fenêtre serveur non conforme. Source : moteur de conformité travail et repos.', MUTED);

  heading('Commentaires et analyse');
  paragraph(analysis);

  heading('Recommandations de suivi');
  paragraph('Prioriser la revue des journées signalées, rapprocher les écarts des commentaires opérationnels, puis suivre la réalisation du repos compensateur. Examiner séparément les tendances d’exposition HSE et les heures réelles afin d’éviter tout double comptage.');

  heading('Caveats et hypothèses');
  report.assumptions.forEach((assumption) => paragraph(`• ${assumption}`));

  heading('Détail des formules utilisées');
  paragraph(`Méthodologie : ${report.methodologyLabel}.`);
  report.formulas.forEach((formula) => paragraph(`• ${formula}`));

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setTextColor(...MUTED);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(`Généré le ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(report.generatedAt))}`, left, pageHeight - 7);
    doc.text(`${page} / ${pages}`, right, pageHeight - 7, { align: 'right' });
  }

  return {
    document: doc,
    filename: `rapport-suivi-temps-travail-${safeFilename(report.start)}-${safeFilename(report.end)}.pdf`,
  };
}
