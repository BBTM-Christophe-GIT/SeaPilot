import { formatPersonName, type HrDocumentRecord, type PersonRecord } from './peopleQueries';

interface TrainingCostRule {
  label: string;
  matches: (normalizedTitle: string) => boolean;
  unitCost: number;
}

interface TrainingPlanAction {
  document: HrDocumentRecord;
  expiresOn: string;
  personName: string;
  unitCost: number;
}

interface TrainingPlanGroup {
  actions: TrainingPlanAction[];
  label: string;
  subtotal: number;
  unitCost: number;
}

export interface TrainingPlanReportInput {
  averageTenureYears: number;
  documents: HrDocumentRecord[];
  generatedOn?: Date;
  people: PersonRecord[];
  targetYear?: number;
  turnoverRate: number;
}

export interface TrainingPlanReport {
  fileName: string;
  html: string;
  medicalCertificateCount: number;
  targetYear: number;
  totalActions: number;
  totalCost: number;
}

const TRAINING_COST_RULES: TrainingCostRule[] = [
  {
    label: 'CFBS - Certificat de Formation de Base à la Sécurité',
    matches: (title) => title.includes('cfbs') || title.includes('certificat de formation de base'),
    unitCost: 1400,
  },
  {
    label: "CGO - Certificat Général d'Opérateur",
    matches: (title) => title.includes('cgo') || title.includes("certificat general d'operateur"),
    unitCost: 800,
  },
  {
    label: "CRO - Certificat Restreint d'Opérateur",
    matches: (title) => title.includes('cro') || title.includes("certificat restreint d'operateur"),
    unitCost: 600,
  },
  {
    label: 'Enseignement Médical de niveau I',
    matches: (title) =>
      title.includes('enseignement medical de niveau i') && !title.includes('enseignement medical de niveau iii'),
    unitCost: 200,
  },
  {
    label: 'Enseignement Médical de niveau III',
    matches: (title) => title.includes('enseignement medical de niveau iii'),
    unitCost: 2000,
  },
];

const MONTH_LABELS = ['Jan.', 'Fév.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];
const REPORT_FOOTER =
  "REP 07-A - Vérifiez la liste de diffusion pour vous assurer d'avoir toujours la dernière version de ce formulaire.";

function normalizeTitle(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, "'")
    .toLocaleLowerCase('fr-FR')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function parseDate(value: string): Date | null {
  const date = value ? new Date(`${value.slice(0, 10)}T00:00:00`) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

function formatDate(value: Date | string): string {
  const date = typeof value === 'string' ? parseDate(value) : value;
  return date ? new Intl.DateTimeFormat('fr-FR').format(date) : '-';
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);
}

function formatMetric(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}

function buildReportData(input: TrainingPlanReportInput) {
  const generatedOn = input.generatedOn || new Date();
  const targetYear = input.targetYear || generatedOn.getFullYear() + 1;
  const activePeople = new Map(input.people.filter((person) => person.active).map((person) => [person.id, person]));
  const expiringDocuments = input.documents.filter((document) => {
    const expiresOn = parseDate(document.expiresOn);
    return document.personId !== null && activePeople.has(document.personId) && expiresOn?.getFullYear() === targetYear;
  });

  const trainingGroups = TRAINING_COST_RULES.flatMap<TrainingPlanGroup>((rule) => {
    const actions = expiringDocuments
      .filter((document) => TRAINING_COST_RULES.find((candidate) => candidate.matches(normalizeTitle(document.title))) === rule)
      .map<TrainingPlanAction>((document) => ({
        document,
        expiresOn: document.expiresOn,
        personName: formatPersonName(activePeople.get(document.personId!)!),
        unitCost: rule.unitCost,
      }))
      .sort((left, right) => left.personName.localeCompare(right.personName, 'fr'));

    return actions.length > 0
      ? [{ actions, label: rule.label, subtotal: actions.length * rule.unitCost, unitCost: rule.unitCost }]
      : [];
  });
  const medicalCertificates = expiringDocuments
    .filter((document) => document.categoryKey === 'medical_visit')
    .map((document) => ({
      expiresOn: document.expiresOn,
      personName: formatPersonName(activePeople.get(document.personId!)!),
    }))
    .sort((left, right) => left.personName.localeCompare(right.personName, 'fr'));

  return {
    generatedOn,
    medicalCertificates,
    targetYear,
    totalActions: trainingGroups.reduce((total, group) => total + group.actions.length, 0),
    totalCost: trainingGroups.reduce((total, group) => total + group.subtotal, 0),
    trainingGroups,
  };
}

function datePosition(date: Date, year: number): number {
  const start = new Date(`${year}-01-01T00:00:00`).getTime();
  const end = new Date(`${year}-12-31T00:00:00`).getTime();
  return (date.getTime() - start) / Math.max(1, end - start);
}

function buildCostChart(groups: TrainingPlanGroup[], targetYear: number, totalCost: number): string {
  const chartLeft = 76;
  const chartRight = 658;
  const chartTop = 26;
  const chartBottom = 206;
  const chartWidth = chartRight - chartLeft;
  const chartHeight = chartBottom - chartTop;
  const axisStep = 2000;
  const axisMax = Math.max(axisStep, Math.ceil(totalCost / axisStep) * axisStep);
  const scheduledActions = groups
    .flatMap((group) => group.actions)
    .sort((left, right) => left.expiresOn.localeCompare(right.expiresOn) || left.personName.localeCompare(right.personName, 'fr'));
  let cumulative = 0;
  const chartPoints = [`${chartLeft},${chartBottom}`];

  scheduledActions.forEach((action) => {
    const date = parseDate(action.expiresOn)!;
    const x = chartLeft + datePosition(date, targetYear) * chartWidth;
    const previousY = chartBottom - (cumulative / axisMax) * chartHeight;
    cumulative += action.unitCost;
    const nextY = chartBottom - (cumulative / axisMax) * chartHeight;
    chartPoints.push(`${x.toFixed(1)},${previousY.toFixed(1)}`, `${x.toFixed(1)},${nextY.toFixed(1)}`);
  });
  chartPoints.push(`${chartRight},${(chartBottom - (totalCost / axisMax) * chartHeight).toFixed(1)}`);

  const yGrid = Array.from({ length: axisMax / axisStep + 1 }, (_, index) => {
    const value = index * axisStep;
    const y = chartBottom - (value / axisMax) * chartHeight;
    return `<line class="chart-grid" x1="${chartLeft}" y1="${y}" x2="${chartRight}" y2="${y}"></line><text class="chart-tick" x="68" y="${y + 3}" text-anchor="end">${escapeHtml(formatMoney(value))}</text>`;
  }).join('');
  const quarterEnds = [2, 5, 8, 11].map((month, index) => {
    const endDate = new Date(targetYear, month + 1, 0);
    const quarterTotal = scheduledActions
      .filter((action) => parseDate(action.expiresOn)! <= endDate)
      .reduce((total, action) => total + action.unitCost, 0);
    const x = chartLeft + datePosition(endDate, targetYear) * chartWidth;
    const y = Math.max(chartTop + 4, chartBottom - (quarterTotal / axisMax) * chartHeight - 24);
    const labelX = index === 3 ? chartRight - 44 : x;
    return `<line class="quarter-guide" x1="${x.toFixed(1)}" y1="${chartTop}" x2="${x.toFixed(1)}" y2="${chartBottom}"></line><rect class="quarter-label-box" x="${(labelX - 44).toFixed(1)}" y="${y.toFixed(1)}" width="88" height="16" rx="5" ry="5"></rect><text class="quarter-label" x="${labelX.toFixed(1)}" y="${(y + 11.5).toFixed(1)}" text-anchor="middle">T${index + 1}: ${escapeHtml(formatMoney(quarterTotal))}</text>`;
  }).join('');
  const months = MONTH_LABELS.map((label, month) => {
    const x = chartLeft + (month / 11) * chartWidth;
    return `<line class="chart-month-tick" x1="${x.toFixed(1)}" y1="${chartBottom}" x2="${x.toFixed(1)}" y2="${chartBottom + 4}"></line><text class="chart-month-label" x="${x.toFixed(1)}" y="224" text-anchor="middle">${label}</text>`;
  }).join('');

  return `<section class="cost-chart-section" aria-label="Coût cumulé annuel des formations"><h3>Coût cumulé des formations</h3><svg class="cost-chart" viewBox="0 0 680 260" role="img" aria-label="Coût cumulé des formations pour l'année ${targetYear}"><line class="chart-axis" x1="${chartLeft}" y1="${chartTop}" x2="${chartLeft}" y2="${chartBottom}"></line><line class="chart-axis" x1="${chartLeft}" y1="${chartBottom}" x2="${chartRight}" y2="${chartBottom}"></line>${yGrid}<text class="chart-axis-label chart-axis-label-y" transform="translate(18 152) rotate(-90)">Coût</text><text class="chart-axis-label" x="367" y="250" text-anchor="middle">Année ${targetYear}</text><polyline class="chart-line" points="${chartPoints.join(' ')}"></polyline>${quarterEnds}${months}</svg></section>`;
}

function buildFinancialSummary(groups: TrainingPlanGroup[], totalActions: number, totalCost: number): string {
  const rows = groups
    .map(
      (group) => `<tr><td>${escapeHtml(group.label)}</td><td class="amount">${group.actions.length}</td><td class="amount">${escapeHtml(formatMoney(group.subtotal))}</td></tr>`,
    )
    .join('');
  return `<section class="financial-summary"><h2>Récapitulatif financier</h2><table><thead><tr><th>Formation</th><th class="amount">Actions</th><th class="amount">Sous-total</th></tr></thead><tbody>${rows}<tr class="total-row"><td>Total général</td><td class="amount">${totalActions}</td><td class="amount">${escapeHtml(formatMoney(totalCost))}</td></tr></tbody></table></section>`;
}

function buildPlanRows(groups: TrainingPlanGroup[], totalCost: number): string {
  if (groups.length === 0) {
    return '<tr><td class="empty-state" colspan="4">Aucune formation payante n’arrive à échéance sur cette année.</td></tr>';
  }

  const rows = groups
    .map((group) => {
      const actionRows = group.actions
        .map(
          (action, index) => `<tr>${index === 0 ? `<td class="training-cell" rowspan="${group.actions.length + 1}">${escapeHtml(group.label)}</td>` : ''}<td>${escapeHtml(action.personName)}</td><td>${formatDate(action.expiresOn)}</td><td class="amount">${escapeHtml(formatMoney(group.unitCost))}</td></tr>`,
        )
        .join('');
      return `${actionRows}<tr class="training-subtotal-row"><td colspan="2" class="training-subtotal-label">Sous-total ${escapeHtml(group.label)}</td><td class="amount">${escapeHtml(formatMoney(group.subtotal))}</td></tr>`;
    })
    .join('');
  return `${rows}<tr class="total-row report-total-row"><td colspan="3">Total général</td><td class="amount">${escapeHtml(formatMoney(totalCost))}</td></tr>`;
}

function buildMedicalRows(medicalCertificates: Array<{ expiresOn: string; personName: string }>): string {
  if (medicalCertificates.length === 0) {
    return '<tr><td class="empty-state" colspan="3">Aucun certificat médical n’arrive à échéance sur cette année.</td></tr>';
  }

  return medicalCertificates
    .map(
      (certificate, index) => `<tr>${index === 0 ? `<td class="training-cell" rowspan="${medicalCertificates.length}">Certificat Médical d’Aptitude à la Navigation Maritime</td>` : ''}<td>${escapeHtml(certificate.personName)}</td><td>${formatDate(certificate.expiresOn)}</td></tr>`,
    )
    .join('');
}

function reportStyles(): string {
  return `
    :root { color: #172033; font-family: "Segoe UI", Arial, sans-serif; }
    body { margin: 0; background: #eef3f8; }
    .training-report { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 10mm 10mm 8mm; background: #fff; box-sizing: border-box; }
    .model-header { display: grid; grid-template-columns: 22mm 1fr; border: 1px solid #122033; min-height: 20mm; }
    .model-logo { display: flex; align-items: center; justify-content: center; border-right: 1px solid #122033; }
    .model-logo img { display: block; width: 14mm; height: 14mm; object-fit: contain; filter: invert(1); }
    .model-title { display: flex; flex-direction: column; justify-content: center; padding: 0 8mm; text-align: center; }
    h1 { margin: 0; color: #156082; font-size: 23px; text-transform: uppercase; }
    .intro, .plan-section { margin-top: 6mm; }
    .intro > div, .plan-section > div { display: flex; align-items: center; gap: 8px; margin-bottom: 3mm; }
    .section-number { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 999px; background: #156082; color: #fff; font-size: 10px; font-weight: 900; }
    h2 { margin: 0; color: #172033; font-size: 15px; }
    .intro p { margin: 0; color: #4b5d72; font-size: 9.5px; line-height: 1.45; }
    .report-metrics { display: grid; grid-template-columns: repeat(2, 1fr); gap: 3mm; margin-top: 4mm; }
    .report-metric { padding: 3mm 4mm; border: 1px solid #d8e2ef; border-radius: 5px; background: #fbfdff; }
    .report-metric small { display: block; color: #64748b; font-size: 8px; font-weight: 700; text-transform: uppercase; }
    .report-metric strong { display: block; margin-top: 1mm; color: #156082; font-size: 17px; }
    .cost-chart-section { margin-top: 4mm; break-inside: avoid; }
    .cost-chart-section h3 { margin: 0 0 2mm; color: #172033; font-size: 12px; }
    .cost-chart { display: block; width: 100%; height: auto; border: 1px solid #d8e2ef; border-radius: 5px; background: #fbfdff; }
    .chart-axis { stroke: #334155; stroke-width: 1.2; }
    .chart-grid, .quarter-guide { stroke: #d8e2ef; stroke-width: .8; }
    .quarter-guide { stroke-dasharray: 4 4; }
    .chart-line { fill: none; stroke: #156082; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
    .quarter-label-box { fill: #fff; }
    .chart-month-tick { stroke: #334155; stroke-width: .8; }
    .quarter-label, .chart-tick, .chart-month-label, .chart-axis-label { fill: #334155; font-size: 10px; }
    .quarter-label { font-weight: 900; }
    .chart-month-label { font-size: 8.5px; }
    .chart-axis-label { font-size: 11px; font-weight: 900; }
    .financial-summary { margin-top: 5mm; break-inside: avoid; }
    .financial-summary h2 { margin-bottom: 2.5mm; }
    table { width: 100%; border-collapse: collapse; font-size: 8.7px; }
    th { padding: 1.4mm 1.6mm; background: #eef4fa; color: #334155; text-align: left; text-transform: uppercase; font-size: 7.2px; }
    td { padding: 1.25mm 1.6mm; border-bottom: 1px solid #e7edf5; color: #172033; vertical-align: top; }
    tr { break-inside: avoid; }
    .amount { text-align: right; white-space: nowrap; }
    .training-plan-table { margin-top: 1mm; table-layout: fixed; }
    .training-plan-table th:nth-child(1) { width: 42%; }
    .training-plan-table th:nth-child(2) { width: 28%; }
    .training-plan-table th:nth-child(3) { width: 15%; }
    .training-plan-table th:nth-child(4) { width: 15%; }
    .training-cell { background: #f8fafc; color: #0f3354; font-weight: 900; }
    .training-subtotal-row td, .subtotal-row td, .total-row td { background: #f8fafc; font-weight: 900; }
    .training-subtotal-label { text-align: right; }
    .total-row td { border-top: 2px solid #cbd5e1; }
    .medical-certificate-section { margin-top: 6mm; }
    .medical-certificate-section h3 { margin: 0 0 4mm; color: #172033; font-size: 17px; }
    .medical-certificate-table { table-layout: fixed; }
    .medical-certificate-table th:nth-child(1) { width: 55%; }
    .medical-certificate-table th:nth-child(2) { width: 30%; }
    .medical-certificate-table th:nth-child(3) { width: 15%; }
    .empty-state { padding: 8mm; border: 1px dashed #cdd8e6; border-radius: 5px; color: #64748b; font-size: 12px; text-align: center; }
    footer { margin-top: 5mm; padding-top: 2mm; border-top: 1px solid #d8e2ef; color: #64748b; font-size: 7px; }
    @page { size: A4; margin: 10mm; }
    @media print { body { background: #fff; } .training-report { width: auto; min-height: auto; margin: 0; padding: 0; } }
  `;
}

export function buildTrainingPlanReport(input: TrainingPlanReportInput): TrainingPlanReport {
  const data = buildReportData(input);
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Plan de Formation ${data.targetYear}</title><style>${reportStyles()}</style></head><body><main class="training-report"><header class="model-header"><div class="model-logo"><img src="/bbtm-logo.png" alt="Logo BBTM"></div><div class="model-title"><h1>Plan de Formation ${data.targetYear}</h1></div></header><section class="intro"><div><span class="section-number">1</span><h2>Indicateurs</h2></div><p>Rapport généré le ${formatDate(data.generatedOn)}. Les actions ci-dessous recensent les formations et certificats arrivant à échéance sur l’année ${data.targetYear}.</p><div class="report-metrics"><article class="report-metric"><small>Turnover annuel ${data.generatedOn.getFullYear()}</small><strong>${formatMetric(input.turnoverRate)} %</strong></article><article class="report-metric"><small>Ancienneté moyenne</small><strong>${formatMetric(input.averageTenureYears)} ans</strong></article></div></section>${buildCostChart(data.trainingGroups, data.targetYear, data.totalCost)}${buildFinancialSummary(data.trainingGroups, data.totalActions, data.totalCost)}<section class="plan-section"><div><span class="section-number">2</span><h2>Plan de Formation ${data.targetYear}</h2></div><table class="training-plan-table"><thead><tr><th>Formation</th><th>Prénom et NOM du collaborateur</th><th>Échéance</th><th class="amount">Coût</th></tr></thead><tbody>${buildPlanRows(data.trainingGroups, data.totalCost)}</tbody></table><section class="medical-certificate-section"><h3>Certificats médicaux d’aptitude à la navigation maritime</h3><table class="medical-certificate-table"><thead><tr><th>Formation</th><th>Prénom et NOM du collaborateur</th><th>Échéance</th></tr></thead><tbody>${buildMedicalRows(data.medicalCertificates)}</tbody></table></section></section><footer>${escapeHtml(REPORT_FOOTER)}</footer></main></body></html>`;

  return {
    fileName: `Plan-de-Formation-${data.targetYear}.pdf`,
    html,
    medicalCertificateCount: data.medicalCertificates.length,
    targetYear: data.targetYear,
    totalActions: data.totalActions,
    totalCost: data.totalCost,
  };
}

export function openTrainingPlanReport(report: TrainingPlanReport): boolean {
  const reportWindow = window.open('', '_blank');

  if (!reportWindow) {
    return false;
  }

  reportWindow.addEventListener(
    'load',
    () => {
      reportWindow.document.title = report.fileName.replace(/\.pdf$/i, '');
      reportWindow.focus();
      reportWindow.print();
    },
    { once: true },
  );
  reportWindow.document.open();
  reportWindow.document.write(report.html);
  reportWindow.document.close();
  return true;
}
