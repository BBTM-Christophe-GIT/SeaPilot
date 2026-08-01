import type { DprFormPayload, IncidentCategory } from './dprFormModel.ts';
import type { DprReferenceData, DprReportRecord } from './dprQueries.ts';

const PAGE_WIDTH = 1896;
const PAGE_HEIGHT = 2667.12;
const REPORT_LOGO_PATH = '/bbtm-report-logo.png';
const SECTION_GREY = 230;

function valueOrDash(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === '' ? '-' : String(value);
}

function formatDate(value: string): string {
  if (!value) return '-';
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatAuthoredAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDate(value);
  const day = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Paris',
  }).format(date);
  const time = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Paris',
  }).format(date).replace(':', 'h');
  return `${day} à ${time}`;
}

function safeProjectLabel(payload: DprFormPayload, references: DprReferenceData): string {
  const project = references.projects.find((item) => item.id === payload.projectId);
  if (project) return `${project.code} - ${project.title}`.toUpperCase();
  return valueOrDash(payload.unlistedProjectName).toUpperCase();
}

function incidentLevel(payload: DprFormPayload, category: IncidentCategory): string {
  const incident = payload.incidents.find((item) => item.category === category);
  return `${incident?.level || 'T0'} - ${incident?.level && incident.level !== 'T0' ? 'Yes' : 'No'}`;
}

async function loadReportLogo(): Promise<string | null> {
  try {
    const response = await fetch(REPORT_LOGO_PATH);
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    }
    return `data:${response.headers.get('content-type') || 'image/png'};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

export function dprPdfFilename(report: DprReportRecord, references: DprReferenceData): string {
  const vessel = references.vessels.find((item) => item.id === report.vesselId)?.name || report.vesselName || 'Sans navire';
  const safeVessel = vessel.replace(/[\\/:*?"<>|]/g, '-');
  const date = report.reportDate ? report.reportDate.split('-').reverse().join('-') : 'Sans date';
  return `DPR-${report.number ?? 'BROUILLON'} - ${safeVessel} - ${date}.pdf`;
}

export async function generateDprPdf(
  report: DprReportRecord,
  payload: DprFormPayload,
  references: DprReferenceData,
): Promise<{ blob: Blob; filename: string }> {
  const [{ jsPDF }, logo] = await Promise.all([import('jspdf'), loadReportLogo()]);
  const pdf = new jsPDF({ unit: 'pt', format: [PAGE_WIDTH, PAGE_HEIGHT], orientation: 'portrait', compress: true });
  const vessel = references.vessels.find((item) => item.id === payload.vesselId)?.name || report.vesselName || '-';
  const project = safeProjectLabel(payload, references);

  pdf.setProperties({
    title: `Daily Progress Report - DPR-${report.number ?? 'BROUILLON'}`,
    subject: `${vessel} - ${formatDate(payload.reportDate)}`,
    author: report.issuerName || 'SeaPilot',
    creator: 'SeaPilot',
  });
  pdf.setDrawColor(15, 15, 15);
  pdf.setLineWidth(0.75);
  pdf.setTextColor(0, 0, 0);

  // Power BI reference frame and header.
  pdf.setFillColor(245, 245, 245);
  pdf.rect(18, 18, 52.5, PAGE_HEIGHT - 36, 'F');
  if (logo) pdf.addImage(logo, 'PNG', 141.75, 21.75, 217.5, 217.5, undefined, 'FAST');
  pdf.rect(419.25, 18, 1443.75, 225);
  pdf.line(419.25, 185.25, 1863, 185.25);
  pdf.line(1578, 185.25, 1578, 243);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(60);
  pdf.text('Daily Progress Report', 1141.125, 129, { align: 'center' });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(32);
  pdf.text(project, 998.625, 225, { align: 'center', maxWidth: 1100 });
  pdf.text(formatDate(payload.reportDate), 1720.5, 225, { align: 'center' });
  pdf.setDrawColor(35, 104, 232);
  pdf.setLineWidth(1.5);
  pdf.line(1638.75, 231.75, 1802.25, 231.75);
  pdf.setDrawColor(15, 15, 15);

  const sectionBar = (title: string, y: number, height: number) => {
    pdf.setFillColor(SECTION_GREY, SECTION_GREY, SECTION_GREY);
    pdf.rect(70.5, y, 1794.75, height, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(36);
    pdf.setTextColor(0, 0, 0);
    pdf.text(title, 70.5, y + 45);
  };
  const heading = (title: string, x: number, y: number) => {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(32);
    pdf.text(title, x, y);
  };
  const body = (text: string | string[], x: number, y: number, size = 28) => {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(size);
    pdf.text(text, x, y);
  };

  sectionBar('Informations Missions', 273, 62.25);
  heading('Navire', 92.25, 393);
  body(vessel.toUpperCase(), 92.25, 460);

  heading('Description de la Journée', 761.25, 393);
  const descriptionLines = pdf.splitTextToSize(valueOrDash(payload.description), 1000).slice(0, 31) as string[];
  body(descriptionLines, 761.25, 460);

  heading('Carburant :', 84.75, 629);
  body(`Quantité consommée : ${valueOrDash(payload.metrics.fuelConsumedLiters)} L`, 84.75, 694, 32);

  heading('Bordée', 92.25, 775);
  const crew = [...payload.crewMembers].sort((a, b) => a.displayOrder - b.displayOrder);
  body(crew.length ? crew.map((member) => member.displayName) : ['Néant'], 92.25, 842);

  heading('Autres Personnes', 92.25, 1380);
  const otherPeople = [...payload.otherPeople].sort((a, b) => a.displayOrder - b.displayOrder);
  if (otherPeople.length) body(otherPeople.map((person) => person.displayName), 92.25, 1447);

  heading('Contact Radio', 761.25, 1671);
  body('Néant', 761.25, 1738);

  sectionBar('Indicateurs QHSE', 2133, 65.25);
  heading('Leading Indicators', 296.93, 2239);
  heading('Incident / Accident Report', 1134.66, 2239);

  body('TBT', 94, 2285);
  body('Audit/Visite HSE', 175, 2285);
  body('Inspection Commune Préalable', 399, 2285);
  body('Personne', 913, 2285);
  body('Matériel', 1267, 2285);
  body('Environnement', 1582, 2285);

  const checkbox = (x: number, y: number, checked: boolean) => {
    pdf.setLineWidth(1.4);
    pdf.rect(x, y, 27, 27);
    if (checked) {
      pdf.setLineWidth(3);
      pdf.line(x + 5, y + 14, x + 11, y + 21);
      pdf.line(x + 11, y + 21, x + 23, y + 6);
    }
  };
  checkbox(104, 2307, payload.hseActions.tbtPerformed);
  checkbox(264, 2307, payload.hseActions.hseVisitPerformed || payload.hseActions.hseAuditPerformed);
  checkbox(579, 2307, false);
  body(incidentLevel(payload, 'person'), 913, 2335, 26);
  body(incidentLevel(payload, 'equipment'), 1267, 2335, 26);
  body(incidentLevel(payload, 'environment'), 1582, 2335, 26);

  heading("Exercices d'Urgence", 78.75, 2408);
  heading('Note QHSE', 611.25, 2408);
  const exercises = payload.emergencyExercises.map((exercise) => {
    const label = references.exerciseTypes.find((type) => type.key === exercise.key)?.label || exercise.key;
    return exercise.notes ? `${label} - ${exercise.notes}` : label;
  });
  body(exercises.length ? pdf.splitTextToSize(exercises.join(', '), 470).slice(0, 5) as string[] : [''], 78.75, 2460);
  body(payload.qhseNote ? pdf.splitTextToSize(payload.qhseNote, 1180).slice(0, 5) as string[] : [''], 611.25, 2460);

  pdf.setFont('helvetica', 'italic');
  pdf.setFontSize(32);
  const author = report.issuerName || 'Utilisateur SeaPilot';
  pdf.text(`Ce DPR a été rédigé par ${author} le ${formatAuthoredAt(report.updatedAt)}`, 920.68, 2647, { align: 'center' });

  return { blob: pdf.output('blob'), filename: dprPdfFilename(report, references) };
}
