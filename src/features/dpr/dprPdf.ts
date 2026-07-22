import type { DprFormPayload } from './dprFormModel.ts';
import type { DprReferenceData, DprReportRecord } from './dprQueries.ts';

function valueOrDash(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === '' ? '-' : String(value);
}

function formatDate(value: string): string {
  if (!value) return '-';
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
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
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const project = references.projects.find((item) => item.id === payload.projectId);
  const vessel = references.vessels.find((item) => item.id === payload.vesselId);
  const section = (title: string, y: number): number => {
    if (y > 270) { pdf.addPage(); y = 18; }
    pdf.setFillColor(38, 73, 196);
    pdf.roundedRect(14, y - 5, 182, 9, 2, 2, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text(title, 18, y + 1);
    pdf.setTextColor(21, 31, 55);
    return y + 9;
  };

  pdf.setTextColor(21, 31, 55);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.text(`Daily Progress Report — DPR-${report.number ?? 'BROUILLON'}`, 14, 20);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(`Généré depuis SeaPilot le ${new Date().toLocaleString('fr-FR')}`, 14, 27);

  autoTable(pdf, {
    startY: 33,
    theme: 'grid',
    head: [['Date', 'Projet', 'Navire', 'Émetteur', 'Statut']],
    body: [[
      formatDate(payload.reportDate),
      project ? `${project.code} — ${project.title}` : valueOrDash(payload.unlistedProjectName),
      valueOrDash(vessel?.name), valueOrDash(report.issuerName), report.status,
    ]],
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [38, 73, 196] },
  });
  const tableEnd = () => (pdf as typeof pdf & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
  let y = (tableEnd() || 50) + 11;

  y = section('1. Informations projet et personnel', y);
  autoTable(pdf, {
    startY: y,
    theme: 'striped',
    head: [['Fonction', 'Personnel embarqué']],
    body: payload.crewMembers.length
      ? payload.crewMembers.map((member) => [member.crewFunction, member.displayName])
      : [['-', 'Aucun personnel renseigné']],
    styles: { fontSize: 8, cellPadding: 2 },
  });
  y = (tableEnd() || y) + 10;

  y = section('2. Informations journalières', y);
  autoTable(pdf, {
    startY: y,
    theme: 'grid',
    body: [
      ['Description de la journée', valueOrDash(payload.description)],
      ['Carburant consommé (L)', valueOrDash(payload.metrics.fuelConsumedLiters)],
      ['Fuel à bord (L)', valueOrDash(payload.metrics.fuelOnBoardLiters)],
    ],
    styles: { fontSize: 8, cellPadding: 2 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 } },
  });
  y = (tableEnd() || y) + 10;

  y = section('3. Indicateurs QHSE', y);
  autoTable(pdf, {
    startY: y,
    theme: 'grid',
    head: [['Indicateur', 'Valeur']],
    body: [
      ...payload.incidents.map((incident) => [incident.category, `${incident.level}${incident.notes ? ` — ${incident.notes}` : ''}`]),
      ['TBT', payload.hseActions.tbtPerformed ? `Oui — ${payload.hseActions.tbtTheme}` : 'Non'],
      ['Visite HSE', payload.hseActions.hseVisitPerformed ? 'Oui' : 'Non'],
      ['Audit HSE', payload.hseActions.hseAuditPerformed ? 'Oui' : 'Non'],
      ['Exercices', payload.emergencyExercises.map((exercise) => references.exerciseTypes.find((type) => type.key === exercise.key)?.label || exercise.key).join(', ') || '-'],
      ['Note QHSE', valueOrDash(payload.qhseNote)],
    ],
    styles: { fontSize: 8, cellPadding: 2 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 } },
  });
  y = (tableEnd() || y) + 10;

  y = section('4. Escale, approvisionnements et déchets', y);
  const call = payload.portCalls[0];
  autoTable(pdf, {
    startY: y,
    theme: 'grid',
    body: [
      ['Port / accostage / appareillage', call ? `${valueOrDash(call.portName)} — ${valueOrDash(call.arrivalAt)} / ${valueOrDash(call.departureAt)}` : '-'],
      ['Motifs', call?.reasons.map((key) => references.portReasons.find((reason) => reason.key === key)?.label || key).join(', ') || '-'],
      ['Approvisionnements', `Fuel ${valueOrDash(payload.supplies.fuelM3)} m³ · Huile ${valueOrDash(payload.supplies.oilLiters)} L · Eau ${valueOrDash(payload.supplies.waterM3)} m³`],
      ['Déchets', payload.wasteRecords.map((record) => `${record.key}: ${valueOrDash(record.quantity)} ${record.unit}`).join(' · ')],
    ],
    styles: { fontSize: 8, cellPadding: 2 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 } },
  });

  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page);
    pdf.setFontSize(7);
    pdf.setTextColor(95, 105, 125);
    pdf.text(`SeaPilot · Page ${page}/${pages}`, 196, 290, { align: 'right' });
  }
  return { blob: pdf.output('blob'), filename: dprPdfFilename(report, references) };
}
