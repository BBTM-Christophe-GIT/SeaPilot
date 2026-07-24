import {
  buildPermanentWorkforceTurnover,
  buildWorkforceTurnover,
  formatPersonName,
  isPersonEmployedOn,
  type HrDocumentRecord,
  type PersonRecord,
} from './peopleQueries';

type PdfDocument = import('jspdf').jsPDF;
type Rgb = [number, number, number];

interface TrainingCostRule {
  label: string;
  matches: (normalizedTitle: string) => boolean;
  unitCost: number;
}

interface TrainingPlanAction {
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

interface MedicalCertificateAction {
  expiresOn: string;
  personName: string;
}

export interface AnnualHrIndicator {
  averageTenureYears: number;
  endsOn: string;
  exitAverageHeadcount: number;
  exitDepartures: number;
  exitRate: number;
  headcountEnd: number;
  headcountStart: number;
  peopleWithTenure: number;
  permanentAverageHeadcount: number;
  permanentDepartures: number;
  permanentTurnoverRate: number;
  startsOn: string;
  year: number;
}

export interface TrainingPlanReportInput {
  documents: HrDocumentRecord[];
  generatedOn?: Date;
  indicatorYear?: number | null;
  people: PersonRecord[];
  targetYear?: number;
}

export interface TrainingPlanReport {
  annualIndicators: AnnualHrIndicator[];
  fileName: string;
  generatedOn: Date;
  headlineIndicator: AnnualHrIndicator;
  indicatorYear: number | null;
  medicalCertificateCount: number;
  medicalCertificates: MedicalCertificateAction[];
  targetYear: number;
  totalActions: number;
  totalCost: number;
  trainingGroups: TrainingPlanGroup[];
}

const NAVY: Rgb = [23, 32, 51];
const BLUE: Rgb = [21, 96, 130];
const BLUE_ALT: Rgb = [49, 112, 143];
const SLATE: Rgb = [75, 93, 114];
const GRID: Rgb = [216, 226, 239];
const LIGHT: Rgb = [238, 244, 250];
const PALE: Rgb = [248, 250, 252];
const REPORT_FOOTER =
  "REP 07-A - Vérifiez la liste de diffusion pour vous assurer d'avoir toujours la dernière version de ce formulaire.";

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

function normalizeTitle(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, "'")
    .toLocaleLowerCase('fr-FR')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDate(value: string): Date | null {
  const date = value ? new Date(`${value.slice(0, 10)}T00:00:00`) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

function endOfYear(year: number): Date {
  return new Date(year, 11, 31, 23, 59, 59, 999);
}

function roundMetric(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatDate(value: Date | string): string {
  const date = typeof value === 'string' ? parseDate(value) : value;
  return date ? new Intl.DateTimeFormat('fr-FR').format(date) : '-';
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
    .format(value)
    .replace(/[\u00a0\u202f]/g, ' ');
}

function formatMetric(value: number, maximumFractionDigits = 1): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toLocaleString('fr-FR', { maximumFractionDigits });
}

function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildHrIndicator(
  people: PersonRecord[],
  referenceDate: Date,
  startsOn: string,
  year: number,
): AnnualHrIndicator {
  const endsOn = getLocalDateKey(referenceDate);
  const exitMetric = buildWorkforceTurnover(people, endsOn, startsOn);
  const permanentMetric = buildPermanentWorkforceTurnover(people, endsOn, startsOn);
  const tenureValues = people.flatMap((person) => {
    const hiredOn = parseDate(person.hiredOn);
    return hiredOn && isPersonEmployedOn(person, endsOn)
      ? [(referenceDate.getTime() - hiredOn.getTime()) / (365.25 * 24 * 60 * 60 * 1000)]
      : [];
  });

  return {
    averageTenureYears:
      tenureValues.length > 0
        ? roundMetric(tenureValues.reduce((total, value) => total + value, 0) / tenureValues.length)
        : 0,
    endsOn,
    exitAverageHeadcount: exitMetric.averageHeadcount,
    exitDepartures: exitMetric.departures,
    exitRate: exitMetric.rate,
    headcountEnd: exitMetric.headcountEnd,
    headcountStart: exitMetric.headcountStart,
    peopleWithTenure: tenureValues.length,
    permanentAverageHeadcount: permanentMetric.averageHeadcount,
    permanentDepartures: permanentMetric.departures,
    permanentTurnoverRate: permanentMetric.rate,
    startsOn,
    year,
  };
}

export function buildAnnualHrIndicators(
  people: PersonRecord[],
  generatedOn: Date,
  indicatorYear: number | null = null,
): AnnualHrIndicator[] {
  const currentYear = generatedOn.getFullYear();
  const reportYear = indicatorYear ?? currentYear;
  const hires = people.flatMap((person) => {
    const hiredOn = parseDate(person.hiredOn);
    return hiredOn ? [hiredOn] : [];
  });
  const firstHireYear =
    hires.length > 0 ? Math.min(reportYear, ...hires.map((date) => date.getFullYear())) : reportYear;

  return Array.from({ length: reportYear - firstHireYear + 1 }, (_, index) => {
    const year = firstHireYear + index;
    const referenceDate = year === currentYear ? generatedOn : endOfYear(year);
    const startsOn = `${year - 1}-12-31`;
    return buildHrIndicator(people, referenceDate, startsOn, year);
  });
}

export function buildTrainingPlanReport(input: TrainingPlanReportInput): TrainingPlanReport {
  const generatedOn = input.generatedOn || new Date();
  const targetYear = input.targetYear || generatedOn.getFullYear() + 1;
  const indicatorYear = input.indicatorYear ?? null;
  const annualIndicators = buildAnnualHrIndicators(input.people, generatedOn, indicatorYear);
  const trailingPeriodStart = new Date(generatedOn);
  trailingPeriodStart.setFullYear(trailingPeriodStart.getFullYear() - 1);
  const headlineIndicator =
    indicatorYear === null
      ? buildHrIndicator(
          input.people,
          generatedOn,
          getLocalDateKey(trailingPeriodStart),
          generatedOn.getFullYear(),
        )
      : annualIndicators[annualIndicators.length - 1];
  const activePeople = new Map(input.people.filter((person) => person.active).map((person) => [person.id, person]));
  const expiringDocuments = input.documents.filter((document) => {
    const expiresOn = parseDate(document.expiresOn);
    return document.personId !== null && activePeople.has(document.personId) && expiresOn?.getFullYear() === targetYear;
  });
  const trainingGroups = TRAINING_COST_RULES.flatMap<TrainingPlanGroup>((rule) => {
    const actions = expiringDocuments
      .filter((document) => TRAINING_COST_RULES.find((candidate) => candidate.matches(normalizeTitle(document.title))) === rule)
      .map<TrainingPlanAction>((document) => ({
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
    .map<MedicalCertificateAction>((document) => ({
      expiresOn: document.expiresOn,
      personName: formatPersonName(activePeople.get(document.personId!)!),
    }))
    .sort((left, right) => left.personName.localeCompare(right.personName, 'fr'));

  return {
    annualIndicators,
    fileName: `Plan-de-Formation-${targetYear}.pdf`,
    generatedOn,
    headlineIndicator,
    indicatorYear,
    medicalCertificateCount: medicalCertificates.length,
    medicalCertificates,
    targetYear,
    totalActions: trainingGroups.reduce((total, group) => total + group.actions.length, 0),
    totalCost: trainingGroups.reduce((total, group) => total + group.subtotal, 0),
    trainingGroups,
  };
}

function drawSectionTitle(doc: PdfDocument, number: string, title: string, y: number): void {
  doc.setFillColor(...BLUE);
  doc.circle(13, y - 1.2, 2.7, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text(number, 13, y - 0.3, { align: 'center' });
  doc.setTextColor(...NAVY);
  doc.setFontSize(12);
  doc.text(title, 18, y);
}

async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const response = await fetch('/bbtm-logo.png');
    const blob = await response.blob();
    const imageUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.src = imageUrl;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      URL.revokeObjectURL(imageUrl);
      return null;
    }
    context.filter = 'invert(1)';
    context.drawImage(image, 0, 0);
    URL.revokeObjectURL(imageUrl);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

function drawHeader(doc: PdfDocument, title: string, logo: string | null): void {
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.25);
  doc.rect(10, 10, 190, 20);
  doc.line(32, 10, 32, 30);
  if (logo) {
    doc.addImage(logo, 'PNG', 16, 13, 14, 14);
  } else {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...NAVY);
    doc.text('BBTM', 21, 22, { align: 'center' });
  }
  doc.setTextColor(...BLUE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text(title.toLocaleUpperCase('fr-FR'), 116, 22.5, { align: 'center' });
}

function drawMetricCard(doc: PdfDocument, x: number, y: number, width: number, label: string, value: string): void {
  doc.setDrawColor(...GRID);
  doc.setFillColor(...PALE);
  doc.roundedRect(x, y, width, 15, 1.5, 1.5, 'FD');
  doc.setTextColor(...SLATE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.text(label.toLocaleUpperCase('fr-FR'), x + 4, y + 5);
  doc.setTextColor(...BLUE);
  doc.setFontSize(12);
  doc.text(value, x + 4, y + 11.5);
}

function drawLineChart(
  doc: PdfDocument,
  options: {
    color: Rgb;
    points: Array<{ value: number; year: number }>;
    suffix: string;
    title: string;
    width: number;
    x: number;
    y: number;
  },
): void {
  const height = 43;
  const { color, points, suffix, title, width, x, y } = options;
  doc.setDrawColor(...GRID);
  doc.setFillColor(...PALE);
  doc.roundedRect(x, y, width, height, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...NAVY);
  doc.text(title, x + 4, y + 6);
  const latest = points[points.length - 1]?.value || 0;
  doc.setTextColor(...color);
  doc.setFontSize(9);
  doc.text(`${formatMetric(latest)}${suffix}`, x + width - 4, y + 6, { align: 'right' });

  const plotLeft = x + 10;
  const plotRight = x + width - 4;
  const plotTop = y + 11;
  const plotBottom = y + height - 8;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;
  const maxValue = Math.max(1, ...points.map((point) => point.value));
  const axisMax = Math.ceil(maxValue * 1.15 * 10) / 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(...SLATE);
  doc.setDrawColor(...GRID);
  [0, 0.5, 1].forEach((ratio) => {
    const gridY = plotBottom - ratio * plotHeight;
    doc.line(plotLeft, gridY, plotRight, gridY);
    doc.text(`${formatMetric(axisMax * ratio)}${suffix}`, plotLeft - 1, gridY + 1.5, { align: 'right' });
  });

  if (points.length === 0) {
    return;
  }

  const coordinates = points.map((point, index) => ({
    x: plotLeft + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth),
    y: plotBottom - (point.value / axisMax) * plotHeight,
    year: point.year,
  }));
  doc.setDrawColor(...color);
  doc.setFillColor(...color);
  doc.setLineWidth(0.7);
  coordinates.forEach((point, index) => {
    if (index > 0) {
      doc.line(coordinates[index - 1].x, coordinates[index - 1].y, point.x, point.y);
    }
    doc.circle(point.x, point.y, 0.8, 'F');
  });
  const labelStep = Math.max(1, Math.ceil(points.length / 6));
  doc.setTextColor(...SLATE);
  doc.setFontSize(5.5);
  coordinates.forEach((point, index) => {
    if (index % labelStep === 0 || index === coordinates.length - 1) {
      doc.text(String(point.year), point.x, plotBottom + 4, { align: 'center' });
    }
  });
}

function datePosition(date: Date, year: number): number {
  const start = new Date(year, 0, 1).getTime();
  const end = endOfYear(year).getTime();
  return (date.getTime() - start) / Math.max(1, end - start);
}

function drawCostChart(doc: PdfDocument, report: TrainingPlanReport, y: number): void {
  const x = 10;
  const width = 190;
  const height = 55;
  const plotLeft = x + 18;
  const plotRight = x + width - 6;
  const plotTop = y + 10;
  const plotBottom = y + height - 9;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;
  const axisStep = 2000;
  const axisMax = Math.max(axisStep, Math.ceil(report.totalCost / axisStep) * axisStep);
  const actions = report.trainingGroups
    .flatMap((group) => group.actions)
    .sort((left, right) => left.expiresOn.localeCompare(right.expiresOn) || left.personName.localeCompare(right.personName, 'fr'));
  doc.setDrawColor(...GRID);
  doc.setFillColor(...PALE);
  doc.roundedRect(x, y, width, height, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text('Coût cumulé des formations', x + 4, y + 6);
  doc.setTextColor(...BLUE);
  doc.text(formatMoney(report.totalCost), x + width - 4, y + 6, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(...SLATE);
  doc.setDrawColor(...GRID);
  for (let value = 0; value <= axisMax; value += axisStep) {
    const gridY = plotBottom - (value / axisMax) * plotHeight;
    doc.line(plotLeft, gridY, plotRight, gridY);
    doc.text(formatMoney(value), plotLeft - 1.5, gridY + 1.5, { align: 'right' });
  }
  for (let month = 0; month < 12; month += 1) {
    const monthX = plotLeft + (month / 11) * plotWidth;
    doc.text(String(month + 1).padStart(2, '0'), monthX, plotBottom + 4, { align: 'center' });
  }

  let cumulative = 0;
  let previousX = plotLeft;
  let previousY = plotBottom;
  doc.setDrawColor(...BLUE);
  doc.setLineWidth(0.8);
  actions.forEach((action) => {
    const date = parseDate(action.expiresOn)!;
    const actionX = plotLeft + datePosition(date, report.targetYear) * plotWidth;
    const nextCumulative = cumulative + action.unitCost;
    const nextY = plotBottom - (nextCumulative / axisMax) * plotHeight;
    doc.line(previousX, previousY, actionX, previousY);
    doc.line(actionX, previousY, actionX, nextY);
    previousX = actionX;
    previousY = nextY;
    cumulative = nextCumulative;
  });
  doc.line(previousX, previousY, plotRight, previousY);

  const quarterMonths = [2, 5, 8, 11];
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  quarterMonths.forEach((month, index) => {
    const quarterEnd = endOfYear(report.targetYear);
    quarterEnd.setMonth(month + 1, 0);
    const quarterTotal = actions
      .filter((action) => parseDate(action.expiresOn)! <= quarterEnd)
      .reduce((total, action) => total + action.unitCost, 0);
    const quarterX = plotLeft + datePosition(quarterEnd, report.targetYear) * plotWidth;
    const quarterY = Math.max(plotTop + 3, plotBottom - (quarterTotal / axisMax) * plotHeight - 3);
    doc.setTextColor(...NAVY);
    doc.text(`T${index + 1}: ${formatMoney(quarterTotal)}`, Math.min(quarterX, plotRight - 13), quarterY, { align: 'right' });
  });
}

function drawFormulaSection(doc: PdfDocument, y: number, report: TrainingPlanReport): void {
  const lastIndicator = report.headlineIndicator;
  const periodLabel = report.indicatorYear === null ? '12 mois' : String(lastIndicator.year);
  drawSectionTitle(doc, '3', 'Méthodes de calcul des indicateurs', y);
  const boxY = y + 5;
  const boxHeight = 42;
  const boxWidth = 92;
  const formulaTextWidth = boxWidth - 8;
  const drawFormulaBox = (x: number, title: string, formula: string, details: string[]) => {
    doc.setDrawColor(...GRID);
    doc.setFillColor(...PALE);
    doc.roundedRect(x, boxY, boxWidth, boxHeight, 1.5, 1.5, 'FD');
    doc.setTextColor(...BLUE);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(title, x + 4, boxY + 6);
    doc.setTextColor(...NAVY);
    doc.setFontSize(7);
    const formulaLines = doc.splitTextToSize(formula, formulaTextWidth);
    doc.text(formulaLines, x + 4, boxY + 12);
    let detailY = boxY + 12 + formulaLines.length * 3.2 + 2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.4);
    doc.setTextColor(...SLATE);
    details.forEach((detail) => {
      const detailLines = doc.splitTextToSize(`- ${detail}`, formulaTextWidth);
      doc.text(detailLines, x + 4, detailY);
      detailY += detailLines.length * 2.9 + 1;
    });
  };

  drawFormulaBox(
    10,
    'Turnover CDI et sorties',
    'Taux N (%) = départs de la population / effectif moyen quotidien de la même population x 100',
    [
      `Turnover CDI ${periodLabel}: ${lastIndicator.permanentDepartures} départ(s) / ${formatMetric(lastIndicator.permanentAverageHeadcount, 2)} CDI moyens, soit ${formatMetric(lastIndicator.permanentTurnoverRate)} %.`,
      `Sorties tous contrats: ${lastIndicator.exitDepartures} / ${formatMetric(lastIndicator.exitAverageHeadcount, 2)} salariés moyens, soit ${formatMetric(lastIndicator.exitRate)} %.`,
      "Moyenne calculée chaque jour; stagiaires exclus du turnover CDI.",
    ],
  );
  drawFormulaBox(
    108,
    'Ancienneté moyenne',
    "Ancienneté moyenne N = Somme des anciennetés individuelles à la date de référence / salariés présents avec date d'embauche",
    [
      "Ancienneté individuelle = jours depuis la date d'embauche / 365,25.",
      `Pour ${lastIndicator.year}: ${lastIndicator.peopleWithTenure} salarié(s) inclus dans le calcul.`,
      "Les salariés sans date d'embauche sont exclus; les salariés sortis restent pris en compte dans les années où ils étaient présents.",
    ],
  );
}

function drawFooters(doc: PdfDocument): void {
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...GRID);
    doc.line(10, 282, 200, 282);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(...SLATE);
    doc.text(REPORT_FOOTER, 10, 286);
    doc.text(`Page ${page} / ${pages}`, 200, 286, { align: 'right' });
  }
}

function tableFinalY(doc: PdfDocument, fallback: number): number {
  return ((doc as PdfDocument & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || fallback) as number;
}

export async function generateTrainingPlanPdf(report: TrainingPlanReport): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ compress: true, format: 'a4', orientation: 'portrait', unit: 'mm' });
  const logo = await loadLogoDataUrl();
  const title = `Plan de Formation ${report.targetYear}`;
  const currentIndicator = report.headlineIndicator;
  const metricPeriodLabel = report.indicatorYear === null ? '12 mois' : String(currentIndicator.year);
  doc.setProperties({
    author: 'SeaPilot - BBTM',
    creator: 'SeaPilot',
    subject: `Plan de formation et indicateurs RH ${report.targetYear}`,
    title,
  });
  drawHeader(doc, title, logo);
  drawSectionTitle(doc, '1', 'Indicateurs', 39);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(...SLATE);
  const indicatorPeriod =
    report.indicatorYear === null
      ? `12 mois glissants; courbes annuelles jusqu'en ${currentIndicator.year}`
      : `année ${currentIndicator.year} (filtre sélectionné)`;
  doc.text(
    `Rapport généré le ${formatDate(report.generatedOn)}. Indicateurs: ${indicatorPeriod}. Échéances du plan: ${report.targetYear}.`,
    10,
    46,
  );
  drawMetricCard(
    doc,
    10,
    50,
    60,
    `Turnover CDI ${metricPeriodLabel}`,
    `${formatMetric(currentIndicator.permanentTurnoverRate)} %`,
  );
  drawMetricCard(
    doc,
    75,
    50,
    60,
    `Sorties tous contrats ${metricPeriodLabel}`,
    `${formatMetric(currentIndicator.exitRate)} %`,
  );
  drawMetricCard(
    doc,
    140,
    50,
    60,
    `Ancienneté moyenne ${currentIndicator.year}`,
    `${formatMetric(currentIndicator.averageTenureYears)} ans`,
  );
  drawLineChart(doc, {
    color: BLUE,
    points: report.annualIndicators.map((indicator) => ({ value: indicator.permanentTurnoverRate, year: indicator.year })),
    suffix: ' %',
    title: 'Évolution annuelle du turnover CDI',
    width: 92,
    x: 10,
    y: 68,
  });
  drawLineChart(doc, {
    color: BLUE_ALT,
    points: report.annualIndicators.map((indicator) => ({ value: indicator.exitRate, year: indicator.year })),
    suffix: ' %',
    title: 'Évolution annuelle des sorties tous contrats',
    width: 92,
    x: 108,
    y: 68,
  });
  drawCostChart(doc, report, 115);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text('Récapitulatif financier', 10, 177);
  autoTable(doc, {
    body: [
      ...report.trainingGroups.map((group) => [group.label, String(group.actions.length), formatMoney(group.subtotal)]),
      ['Total général', String(report.totalActions), formatMoney(report.totalCost)],
    ],
    columnStyles: { 0: { cellWidth: 130 }, 1: { cellWidth: 24, halign: 'right' }, 2: { cellWidth: 36, halign: 'right' } },
    didParseCell: (data) => {
      if (data.row.index === report.trainingGroups.length) {
        data.cell.styles.fillColor = PALE;
        data.cell.styles.fontStyle = 'bold';
      }
    },
    head: [['Formation', 'Actions', 'Sous-total']],
    headStyles: { fillColor: LIGHT, fontStyle: 'bold', textColor: NAVY },
    margin: { left: 10, right: 10 },
    pageBreak: 'avoid',
    startY: 180,
    styles: { cellPadding: 1.5, font: 'helvetica', fontSize: 7, lineColor: GRID, lineWidth: { bottom: 0.15 }, textColor: NAVY },
    theme: 'plain',
  });

  doc.addPage();
  drawHeader(doc, title, logo);
  drawSectionTitle(doc, '2', `Plan de Formation ${report.targetYear}`, 39);
  const trainingRows: string[][] = [];
  report.trainingGroups.forEach((group) => {
    group.actions.forEach((action, index) => {
      trainingRows.push([index === 0 ? group.label : '', action.personName, formatDate(action.expiresOn), formatMoney(group.unitCost)]);
    });
    trainingRows.push(['', `Sous-total ${group.label}`, '', formatMoney(group.subtotal)]);
  });
  trainingRows.push(['Total général', '', '', formatMoney(report.totalCost)]);
  autoTable(doc, {
    body: trainingRows.length > 1 ? trainingRows : [['Aucune formation payante', '', '', formatMoney(0)]],
    columnStyles: {
      0: { cellWidth: 72, fontStyle: 'bold' },
      1: { cellWidth: 58 },
      2: { cellWidth: 28 },
      3: { cellWidth: 32, halign: 'right' },
    },
    didParseCell: (data) => {
      const row = data.row.raw as string[];
      if (String(row[1] || '').startsWith('Sous-total') || row[0] === 'Total général') {
        data.cell.styles.fillColor = PALE;
        data.cell.styles.fontStyle = 'bold';
      }
    },
    head: [['Formation', 'Prénom et NOM du collaborateur', 'Échéance', 'Coût']],
    headStyles: { fillColor: LIGHT, fontStyle: 'bold', textColor: NAVY },
    margin: { bottom: 16, left: 10, right: 10, top: 12 },
    rowPageBreak: 'avoid',
    startY: 43,
    styles: { cellPadding: 1.25, font: 'helvetica', fontSize: 6.6, lineColor: GRID, lineWidth: { bottom: 0.15 }, textColor: NAVY },
    theme: 'plain',
  });
  let nextY = tableFinalY(doc, 80) + 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...NAVY);
  doc.text("Certificats médicaux d'aptitude à la navigation maritime", 10, nextY);
  autoTable(doc, {
    body:
      report.medicalCertificates.length > 0
        ? report.medicalCertificates.map((certificate, index) => [
            index === 0 ? "Certificat Médical d'Aptitude à la Navigation Maritime" : '',
            certificate.personName,
            formatDate(certificate.expiresOn),
          ])
        : [['Aucun certificat médical', '', '']],
    columnStyles: { 0: { cellWidth: 90, fontStyle: 'bold' }, 1: { cellWidth: 65 }, 2: { cellWidth: 35 } },
    head: [['Formation', 'Prénom et NOM du collaborateur', 'Échéance']],
    headStyles: { fillColor: LIGHT, fontStyle: 'bold', textColor: NAVY },
    margin: { bottom: 16, left: 10, right: 10, top: 12 },
    rowPageBreak: 'avoid',
    startY: nextY + 3,
    styles: { cellPadding: 1.15, font: 'helvetica', fontSize: 6.4, lineColor: GRID, lineWidth: { bottom: 0.15 }, textColor: NAVY },
    theme: 'plain',
  });
  nextY = tableFinalY(doc, nextY + 30) + 7;
  if (nextY > 228) {
    doc.addPage();
    nextY = 18;
  }
  drawFormulaSection(doc, nextY, report);
  drawFooters(doc);
  return doc.output('blob');
}

export async function openTrainingPlanReport(report: TrainingPlanReport): Promise<boolean> {
  const reportWindow = window.open('', '_blank');

  if (!reportWindow) {
    return false;
  }

  reportWindow.document.open();
  reportWindow.document.write(
    '<!doctype html><html lang="fr"><head><title>Génération du PDF...</title></head><body style="font:16px Segoe UI,Arial,sans-serif;padding:32px;color:#172033">Génération du rapport PDF en cours...</body></html>',
  );
  reportWindow.document.close();

  try {
    const blob = await generateTrainingPlanPdf(report);
    const file = new File([blob], report.fileName, { type: 'application/pdf' });
    const pdfUrl = URL.createObjectURL(file);
    reportWindow.location.replace(pdfUrl);
    window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 5 * 60 * 1000);
    return true;
  } catch (error) {
    reportWindow.close();
    throw error;
  }
}
