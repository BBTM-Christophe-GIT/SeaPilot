import type { FleetCertificateRecord } from './fleetCertificateQueries';
import { FLEET_FINDING_LABELS, FLEET_FINDING_STATUS_LABELS, type FleetCertificateFinding } from './fleetCertificateFindings';

export interface FleetFindingReportInput {
  title: string;
  certificates: FleetCertificateRecord[];
  findings: FleetCertificateFinding[];
  generatedOn?: Date;
}

function formatDate(value: string): string {
  if (!value) return 'Non renseignée';
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

async function loadLogo(): Promise<string | null> {
  try {
    const response = await fetch('/bbtm-report-logo.png');
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function safeFileName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

export async function generateFleetFindingReport(input: FleetFindingReportInput): Promise<{ blob: Blob; filename: string }> {
  const [{ jsPDF }, { autoTable }, logo] = await Promise.all([import('jspdf'), import('jspdf-autotable'), loadLogo()]);
  const generatedOn = input.generatedOn || new Date();
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const navy: [number, number, number] = [20, 37, 63];
  const blue: [number, number, number] = [12, 111, 202];
  const red: [number, number, number] = [205, 47, 47];

  const drawHeader = (): void => {
    doc.setFillColor(...navy); doc.rect(0, 0, 210, 29, 'F');
    if (logo) doc.addImage(logo, 'PNG', 12, 7, 34, 15);
    else { doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text('BBTM', 14, 18); }
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text('RAPPORT DES ÉCARTS CERTIFICATS', 198, 13, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(input.title, 198, 20, { align: 'right' });
  };
  drawHeader();

  doc.setTextColor(...navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.text(input.title, 12, 42);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(80);
  doc.text(`Généré le ${generatedOn.toLocaleString('fr-FR')} • ${input.certificates.length} document(s) • ${input.findings.length} écart(s)`, 12, 49);

  const open = input.findings.filter((item) => item.status !== 'closed');
  const overdue = open.filter((item) => item.treatmentDueOn && item.treatmentDueOn < generatedOn.toISOString().slice(0, 10));
  autoTable(doc, {
    startY: 56,
    head: [['Écarts ouverts', 'Majeurs', 'En retard', 'Clôturés']],
    body: [[open.length, open.filter((item) => item.findingType === 'major_non_conformity').length, overdue.length, input.findings.length - open.length]],
    theme: 'grid', styles: { halign: 'center', fontSize: 11, cellPadding: 4, textColor: navy },
    headStyles: { fillColor: [239, 244, 250], textColor: navy, fontSize: 8 },
    columnStyles: { 2: { textColor: red } }, margin: { left: 12, right: 12 },
  });

  autoTable(doc, {
    startY: 82,
    head: [['Référence', 'Navire / certificat', 'Type', 'Échéance', 'Responsable', 'État']],
    body: input.findings.map((finding) => {
      const certificate = input.certificates.find((item) => item.id === finding.certificateId);
      return [finding.reference, `${certificate?.vesselName || '-'}\n${certificate?.documentTitle || '-'}`, FLEET_FINDING_LABELS[finding.findingType], formatDate(finding.treatmentDueOn), finding.responsibleName, `${FLEET_FINDING_STATUS_LABELS[finding.status]}\n${finding.progress} %`];
    }),
    theme: 'grid', styles: { fontSize: 7.4, cellPadding: 2.3, valign: 'middle' },
    headStyles: { fillColor: blue, textColor: 255, fontStyle: 'bold' }, margin: { left: 12, right: 12 },
  });

  input.findings.forEach((finding) => {
    const certificate = input.certificates.find((item) => item.id === finding.certificateId);
    doc.addPage(); drawHeader();
    doc.setTextColor(...navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(`${finding.reference} — ${finding.title}`, 12, 42, { maxWidth: 186 });
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(75);
    doc.text(`${certificate?.vesselName || '-'} • ${certificate?.documentTitle || '-'} • ${FLEET_FINDING_LABELS[finding.findingType]}`, 12, 50);
    autoTable(doc, {
      startY: 57, theme: 'grid',
      body: [
        ['Constaté le', formatDate(finding.detectedOn), 'Échéance', formatDate(finding.treatmentDueOn)],
        ['Responsable', finding.responsibleName, 'Avancement', `${finding.progress} % — ${FLEET_FINDING_STATUS_LABELS[finding.status]}`],
        ['Délai', finding.treatmentDelayDays == null ? '-' : `${finding.treatmentDelayDays} jours`, 'Preuves', `${finding.attachments.filter((item) => item.kind === 'treatment').length} fichier(s)`],
      ],
      styles: { fontSize: 8, cellPadding: 3 }, columnStyles: { 0: { fontStyle: 'bold', fillColor: [239, 244, 250] }, 2: { fontStyle: 'bold', fillColor: [239, 244, 250] } }, margin: { left: 12, right: 12 },
    });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...navy); doc.text('Description de l’écart', 12, 94);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(55); doc.text(finding.description || 'Aucune description.', 12, 101, { maxWidth: 186 });
    const attachmentsY = Math.max(121, 105 + doc.splitTextToSize(finding.description || '', 186).length * 4);
    autoTable(doc, {
      startY: attachmentsY, head: [['Pièces et preuves', 'Nature', 'Ajoutée le']],
      body: finding.attachments.length ? finding.attachments.map((item) => [item.originalFileName, item.kind === 'finding' ? 'Constat initial' : 'Preuve de traitement', new Date(item.createdAt).toLocaleDateString('fr-FR')]) : [['Aucune pièce jointe', '-', '-']],
      theme: 'grid', styles: { fontSize: 8, cellPadding: 2.5 }, headStyles: { fillColor: blue }, margin: { left: 12, right: 12 },
    });
    const historyY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    autoTable(doc, {
      startY: historyY, head: [['Historique du traitement', 'Détail']],
      body: finding.events.length ? finding.events.map((event) => [new Date(event.createdAt).toLocaleString('fr-FR'), event.note || event.eventType]) : [['-', 'Aucun événement']],
      theme: 'striped', styles: { fontSize: 7.5, cellPadding: 2.3 }, headStyles: { fillColor: navy }, margin: { left: 12, right: 12 },
    });
    doc.setFontSize(7); doc.setTextColor(120); doc.text('Rapport généré par SeaPilot — BBTM', 12, 290);
  });

  return { blob: doc.output('blob'), filename: `BBTM-${safeFileName(input.title || 'Rapport-ecarts')}-${generatedOn.toISOString().slice(0, 10)}.pdf` };
}

export function downloadFleetFindingReport(result: { blob: Blob; filename: string }): void {
  const url = URL.createObjectURL(result.blob);
  const link = document.createElement('a'); link.href = url; link.download = result.filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
