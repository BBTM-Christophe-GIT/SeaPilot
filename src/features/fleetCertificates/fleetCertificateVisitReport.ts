import type { FleetCertificateRecord } from './fleetCertificateQueries';
import {
  FLEET_FINDING_LABELS,
  type FleetCertificateFinding,
} from './fleetCertificateFindings';
import { calculateContainSize } from './fleetCertificateFindingReport';
import type { FleetServiceProvider, SaveFleetCertificateVisitInput } from './fleetCertificateVisits';

export interface FleetCertificateVisitReportInput {
  certificate: FleetCertificateRecord;
  visit: SaveFleetCertificateVisitInput;
  providers: FleetServiceProvider[];
  findings: FleetCertificateFinding[];
  attachmentImages?: Record<number, string>;
  reportDate: string;
  includeSubjects: boolean;
  generatedOn?: Date;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`;
}

async function loadLogo(): Promise<string | null> {
  try {
    const response = await fetch('/bbtm-report-logo.png');
    return response.ok ? blobToDataUrl(await response.blob()) : null;
  } catch {
    return null;
  }
}

function imageFormat(dataUrl: string): 'PNG' | 'JPEG' | 'WEBP' {
  if (dataUrl.startsWith('data:image/png')) return 'PNG';
  if (dataUrl.startsWith('data:image/webp')) return 'WEBP';
  return 'JPEG';
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short', timeStyle: 'short',
  }).format(new Date(value));
}

function formatReportDay(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  }).format(new Date(`${value}T12:00:00`));
}

export async function generateFleetCertificateVisitReport(
  input: FleetCertificateVisitReportInput,
): Promise<{ blob: Blob; filename: string; arrayBuffer: ArrayBuffer }> {
  const [{ jsPDF }, { autoTable }, logo] = await Promise.all([
    import('jspdf'), import('jspdf-autotable'), loadLogo(),
  ]);
  const generatedOn = input.generatedOn || new Date();
  const assignments = input.visit.assignments
    .filter((assignment) => assignment.scheduledStart.slice(0, 10) === input.reportDate)
    .sort((left, right) => left.scheduledStart.localeCompare(right.scheduledStart));
  if (!assignments.length) throw new Error('Aucune intervention à exporter pour cette journée.');

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const navy: [number, number, number] = [20, 37, 63];
  const blue: [number, number, number] = [12, 111, 202];
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const drawHeader = (): void => {
    doc.setFillColor(...navy);
    doc.rect(0, 0, pageWidth, 29, 'F');
    if (logo) {
      try {
        const properties = doc.getImageProperties(logo);
        const size = calculateContainSize(properties.width, properties.height, 19, 19);
        doc.addImage(logo, imageFormat(logo), 12, 5 + ((19 - size.height) / 2), size.width, size.height);
      } catch {
        doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text('BBTM', 14, 18);
      }
    }
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    doc.text('PLANNING DES VISITES', pageWidth - 12, 13, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text(`Édité le ${generatedOn.toLocaleString('fr-FR')}`, pageWidth - 12, 20, { align: 'right' });
  };
  const headerOnPage = (): void => drawHeader();

  drawHeader();
  doc.setTextColor(...navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
  doc.text('Planning des visites', 12, 43);
  doc.setFontSize(12);
  doc.text(formatReportDay(input.reportDate), 12, 51);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(70);
  doc.text(`${input.certificate.vesselName}  ›  ${input.certificate.categoryLabel}  ›  ${input.certificate.documentTitle}`, 12, 58, { maxWidth: 186 });

  autoTable(doc, {
    startY: 65,
    body: [
      ['Lieu de visite', input.visit.location || 'Non renseigné'],
      ['Objet', input.visit.purpose || `Visite ${input.certificate.documentTitle}`],
      ['Notes', input.visit.notes || 'Aucune note'],
    ],
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 3, valign: 'top' },
    columnStyles: { 0: { cellWidth: 34, fontStyle: 'bold', fillColor: [239, 244, 250] } },
    margin: { left: 12, right: 12, top: 34 },
    willDrawPage: headerOnPage,
  });

  const providerById = new Map(input.providers.map((provider) => [provider.id, provider]));
  const scheduleRows = assignments.map((assignment) => {
    const provider = providerById.get(assignment.providerId);
    const specialty = provider?.specialties.find((item) => item.id === assignment.specialtyId);
    const contact = provider?.contacts.find((item) => item.id === assignment.contactId);
    return [
      `${formatDateTime(assignment.scheduledStart)}\n${formatDateTime(assignment.scheduledEnd)}`,
      provider?.name || 'Prestataire',
      specialty?.name || 'Spécialité non renseignée',
      contact ? `${contact.name}\n${contact.email || ''}\n${contact.phone || ''}` : 'Contact général',
    ];
  });
  const scheduleY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  doc.setTextColor(...navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text('Interventions de la journée', 12, scheduleY);
  autoTable(doc, {
    startY: scheduleY + 4,
    head: [['Début / fin', 'Prestataire', 'Spécialité', 'Contact']],
    body: scheduleRows,
    theme: 'grid',
    styles: { fontSize: 7.4, cellPadding: 2.6, valign: 'top' },
    headStyles: { fillColor: blue, textColor: 255 },
    columnStyles: { 0: { cellWidth: 36 }, 1: { cellWidth: 43 }, 2: { cellWidth: 47 } },
    margin: { left: 12, right: 12, top: 34 },
    willDrawPage: headerOnPage,
  });

  if (input.includeSubjects) {
    input.findings.forEach((finding, findingIndex) => {
      doc.addPage();
      drawHeader();
      doc.setTextColor(...navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
      doc.text(`Sujet ${findingIndex + 1} - ${finding.title}`, 12, 42, { maxWidth: 186 });
      autoTable(doc, {
        startY: 49,
        body: [
          ['Type', FLEET_FINDING_LABELS[finding.findingType], 'Référence', finding.reference],
          ['Description / constat', finding.description || 'Non renseigné', 'Échéance', finding.treatmentDueOn || 'Non renseignée'],
          ['Responsable', finding.responsibleName || 'Non assigné', 'Avancement', `${finding.progress} %`],
        ],
        theme: 'grid',
        styles: { fontSize: 7.7, cellPadding: 2.7, valign: 'top' },
        columnStyles: {
          0: { cellWidth: 32, fontStyle: 'bold', fillColor: [239, 244, 250] },
          1: { cellWidth: 61 },
          2: { cellWidth: 29, fontStyle: 'bold', fillColor: [239, 244, 250] },
          3: { cellWidth: 64 },
        },
        margin: { left: 12, right: 12, top: 34 },
        willDrawPage: headerOnPage,
      });
      let cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      doc.setTextColor(...navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
      doc.text('Suivi du traitement', 12, cursorY);
      autoTable(doc, {
        startY: cursorY + 4,
        head: [['Date', 'Émetteur', 'Suivi']],
        body: finding.events.length ? finding.events.map((event) => [
          formatDateTime(event.createdAt), event.authorName || 'SeaPilot', event.note || event.eventType,
        ]) : [['-', '-', 'Aucun suivi enregistré']],
        theme: 'grid',
        styles: { fontSize: 7.4, cellPadding: 2.4, valign: 'top' },
        headStyles: { fillColor: navy, textColor: 255 },
        columnStyles: { 0: { cellWidth: 33 }, 1: { cellWidth: 42 } },
        margin: { left: 12, right: 12, top: 34 },
        willDrawPage: headerOnPage,
      });
      cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      finding.attachments.filter((attachment) => (
        attachment.mimeType.startsWith('image/') && input.attachmentImages?.[attachment.id]
      )).forEach((attachment) => {
        const dataUrl = input.attachmentImages?.[attachment.id];
        if (!dataUrl) return;
        try {
          const properties = doc.getImageProperties(dataUrl);
          const size = calculateContainSize(properties.width, properties.height, 184, 145);
          if (cursorY + size.height + 16 > pageHeight - 14) {
            doc.addPage(); drawHeader(); cursorY = 39;
          }
          doc.setTextColor(...navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
          doc.text(attachment.kind === 'finding' ? 'Photo du constat' : 'Preuve du traitement', 12, cursorY);
          doc.setTextColor(80); doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
          doc.text(attachment.caption || attachment.originalFileName, 12, cursorY + 5, { maxWidth: 184 });
          doc.addImage(dataUrl, imageFormat(dataUrl), 12 + ((184 - size.width) / 2), cursorY + 9, size.width, size.height);
          cursorY += size.height + 16;
        } catch {
          // Une photo illisible ne bloque pas la génération du planning.
        }
      });
    });
  }

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(220, 226, 234); doc.line(12, pageHeight - 10, pageWidth - 12, pageHeight - 10);
    doc.setTextColor(120); doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
    doc.text('SeaPilot - BBTM', 12, pageHeight - 6);
    doc.text(`Page ${page} / ${totalPages}`, pageWidth - 12, pageHeight - 6, { align: 'right' });
  }

  const arrayBuffer = doc.output('arraybuffer');
  return {
    blob: new Blob([arrayBuffer], { type: 'application/pdf' }),
    filename: `BBTM-Planning-des-visites-${input.reportDate}.pdf`,
    arrayBuffer,
  };
}

export function downloadFleetCertificateVisitReport(result: { blob: Blob; filename: string }): void {
  const url = URL.createObjectURL(result.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = result.filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
