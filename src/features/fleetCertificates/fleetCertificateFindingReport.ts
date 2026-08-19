import type { SupabaseClient } from '@supabase/supabase-js';
import type { FleetCertificateRecord } from './fleetCertificateQueries';
import {
  FLEET_FINDING_LABELS,
  FLEET_FINDING_STATUS_LABELS,
  type FleetCertificateFinding,
} from './fleetCertificateFindings';

export interface FleetFindingReportInput {
  certificates: FleetCertificateRecord[];
  findings: FleetCertificateFinding[];
  attachmentImages?: Record<number, string>;
  generatedOn?: Date;
  includeDocuments?: boolean;
  includeFindings?: boolean;
}

export interface FleetCertificateDocumentReportRow {
  vesselName: string;
  categoryLabel: string;
  documentTitle: string;
  expiresOn: string;
  validity: 'Valide' | 'Échu';
}

export interface FleetCertificateDocumentReportCategoryGroup {
  label: string;
  documents: FleetCertificateDocumentReportRow[];
}

export interface FleetCertificateDocumentReportVesselGroup {
  name: string;
  categories: FleetCertificateDocumentReportCategoryGroup[];
}

export interface FleetFindingReportDocumentGroup {
  certificate: FleetCertificateRecord;
  findings: FleetCertificateFinding[];
}

export interface FleetFindingReportCategoryGroup {
  label: string;
  documents: FleetFindingReportDocumentGroup[];
}

export interface FleetFindingReportVesselGroup {
  name: string;
  categories: FleetFindingReportCategoryGroup[];
}

const frenchSort = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });
const FLEET_REPORT_TITLE = "Certificats Flotte - Plan d'Action";

export function sanitizeFleetReportText(value: string | null | undefined): string {
  return (value || '').replace(/seapilot/gi, '').replace(/\s{2,}/g, ' ').trim();
}

function reportIsoDate(value: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(value);
}

export function buildFleetCertificateDocumentReportRows(
  certificates: FleetCertificateRecord[],
  generatedOn: Date,
): FleetCertificateDocumentReportRow[] {
  const generatedDate = reportIsoDate(generatedOn);
  return certificates.map((certificate) => ({
    vesselName: certificate.vesselName,
    categoryLabel: certificate.categoryLabel,
    documentTitle: certificate.documentTitle,
    expiresOn: certificate.expiresOn,
    validity: certificate.expiresOn && certificate.expiresOn < generatedDate ? 'Échu' as const : 'Valide' as const,
  })).sort((left, right) => (
    frenchSort.compare(left.vesselName, right.vesselName)
    || frenchSort.compare(left.categoryLabel, right.categoryLabel)
    || frenchSort.compare(left.documentTitle, right.documentTitle)
  ));
}

export function buildFleetCertificateDocumentReportHierarchy(
  rows: FleetCertificateDocumentReportRow[],
): FleetCertificateDocumentReportVesselGroup[] {
  const vessels = new Map<string, Map<string, FleetCertificateDocumentReportRow[]>>();
  rows.forEach((row) => {
    const vessel = vessels.get(row.vesselName) || new Map<string, FleetCertificateDocumentReportRow[]>();
    const category = vessel.get(row.categoryLabel) || [];
    category.push(row);
    vessel.set(row.categoryLabel, category);
    vessels.set(row.vesselName, vessel);
  });

  return Array.from(vessels, ([name, categories]) => ({
    name,
    categories: Array.from(categories, ([label, documents]) => ({
      label,
      documents: documents.slice().sort((left, right) => frenchSort.compare(left.documentTitle, right.documentTitle)),
    })).sort((left, right) => frenchSort.compare(left.label, right.label)),
  })).sort((left, right) => frenchSort.compare(left.name, right.name));
}

function formatDate(value: string): string {
  if (!value) return 'Non renseignée';
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

export function formatFleetCertificateDocumentExpiry(value: string): string {
  return value ? formatDate(value) : 'Validité illimitée';
}

function formatDateTime(value: string): string {
  if (!value) return 'Date non renseignée';
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
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
    if (!response.ok) return null;
    return blobToDataUrl(await response.blob());
  } catch {
    return null;
  }
}

export async function loadFleetFindingReportImages(
  client: SupabaseClient,
  findings: FleetCertificateFinding[],
): Promise<Record<number, string>> {
  const images = findings.flatMap((finding) => finding.attachments)
    .filter((attachment) => attachment.mimeType.startsWith('image/'));
  const loaded = await Promise.all(images.map(async (attachment) => {
    try {
      let url = `/demo/${attachment.storagePath.split('/').pop()}`;
      if (!attachment.storagePath.startsWith('demo/')) {
        const { data, error } = await client.storage
          .from(attachment.storageBucket)
          .createSignedUrl(attachment.storagePath, 300);
        if (error) throw error;
        url = data.signedUrl;
      }
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Image indisponible (${response.status})`);
      return [attachment.id, await blobToDataUrl(await response.blob())] as const;
    } catch {
      return null;
    }
  }));
  return Object.fromEntries(loaded.filter((item): item is readonly [number, string] => item !== null));
}

export function buildFleetFindingReportHierarchy(
  certificates: FleetCertificateRecord[],
  findings: FleetCertificateFinding[],
): FleetFindingReportVesselGroup[] {
  const byCertificate = new Map<number, FleetCertificateFinding[]>();
  findings.forEach((finding) => {
    const current = byCertificate.get(finding.certificateId) || [];
    current.push(finding);
    byCertificate.set(finding.certificateId, current);
  });

  const vessels = new Map<string, Map<string, FleetFindingReportDocumentGroup[]>>();
  certificates.forEach((certificate) => {
    const certificateFindings = byCertificate.get(certificate.id);
    if (!certificateFindings?.length) return;
    const vessel = vessels.get(certificate.vesselName) || new Map<string, FleetFindingReportDocumentGroup[]>();
    const category = vessel.get(certificate.categoryLabel) || [];
    category.push({
      certificate,
      findings: certificateFindings.slice().sort((left, right) => frenchSort.compare(left.reference, right.reference)),
    });
    vessel.set(certificate.categoryLabel, category);
    vessels.set(certificate.vesselName, vessel);
  });

  return Array.from(vessels, ([name, categories]) => ({
    name,
    categories: Array.from(categories, ([label, documents]) => ({
      label,
      documents: documents.slice().sort((left, right) => frenchSort.compare(
        left.certificate.documentTitle,
        right.certificate.documentTitle,
      )),
    })).sort((left, right) => frenchSort.compare(left.label, right.label)),
  })).sort((left, right) => frenchSort.compare(left.name, right.name));
}

export function calculateContainSize(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: maxWidth, height: maxHeight };
  const scale = Math.min(maxWidth / width, maxHeight / height);
  return { width: width * scale, height: height * scale };
}

function imageFormat(dataUrl: string): 'PNG' | 'JPEG' | 'WEBP' {
  if (dataUrl.startsWith('data:image/png')) return 'PNG';
  if (dataUrl.startsWith('data:image/webp')) return 'WEBP';
  return 'JPEG';
}

export async function generateFleetFindingReport(input: FleetFindingReportInput): Promise<{ blob: Blob; filename: string; arrayBuffer: ArrayBuffer }> {
  const includeDocuments = input.includeDocuments !== false;
  const includeFindings = input.includeFindings !== false;
  if (!includeDocuments && !includeFindings) throw new Error('Sélectionnez au moins une liste à éditer.');

  const [{ jsPDF }, { autoTable }, logo] = await Promise.all([import('jspdf'), import('jspdf-autotable'), loadLogo()]);
  const generatedOn = input.generatedOn || new Date();
  const certificates = input.certificates.map((certificate) => ({
    ...certificate,
    vesselName: sanitizeFleetReportText(certificate.vesselName),
    categoryLabel: sanitizeFleetReportText(certificate.categoryLabel),
    documentTitle: sanitizeFleetReportText(certificate.documentTitle),
    title: sanitizeFleetReportText(certificate.title),
  }));
  const findings = input.findings.map((finding) => ({
    ...finding,
    reference: sanitizeFleetReportText(finding.reference),
    title: sanitizeFleetReportText(finding.title),
    description: sanitizeFleetReportText(finding.description),
    responsibleName: sanitizeFleetReportText(finding.responsibleName),
    events: finding.events.map((event) => ({
      ...event,
      authorName: sanitizeFleetReportText(event.authorName),
      note: sanitizeFleetReportText(event.note),
    })),
    attachments: finding.attachments.map((attachment) => ({
      ...attachment,
      caption: sanitizeFleetReportText(attachment.caption),
      originalFileName: sanitizeFleetReportText(attachment.originalFileName),
    })),
  }));
  const hierarchy = buildFleetFindingReportHierarchy(certificates, includeFindings ? findings : []);
  const documentRows = buildFleetCertificateDocumentReportRows(certificates, generatedOn);
  const documentHierarchy = buildFleetCertificateDocumentReportHierarchy(documentRows);
  const certificateById = new Map(certificates.map((certificate) => [certificate.id, certificate]));
  const findingRows = findings.flatMap((finding) => {
    const certificate = certificateById.get(finding.certificateId);
    return certificate ? [{ certificate, finding }] : [];
  }).sort((left, right) => (
    frenchSort.compare(left.certificate.vesselName, right.certificate.vesselName)
    || frenchSort.compare(left.certificate.documentTitle, right.certificate.documentTitle)
    || frenchSort.compare(left.finding.reference, right.finding.reference)
  ));
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  doc.setProperties({ title: FLEET_REPORT_TITLE, subject: FLEET_REPORT_TITLE, author: 'BBTM', creator: 'BBTM' });
  const navy: [number, number, number] = [20, 37, 63];
  const blue: [number, number, number] = [12, 111, 202];
  const red: [number, number, number] = [205, 47, 47];
  const green: [number, number, number] = [19, 126, 83];
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
    } else {
      doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text('BBTM', 14, 18);
    }
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text(FLEET_REPORT_TITLE, pageWidth - 12, 13, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text(`Édité le ${generatedOn.toLocaleString('fr-FR')}`, pageWidth - 12, 20, { align: 'right' });
  };

  const drawAutoTableHeader = (): void => drawHeader();
  drawHeader();
  doc.setTextColor(...navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
  doc.text(FLEET_REPORT_TITLE, 12, 44);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(80);
  const vesselCount = new Set(certificates.map((certificate) => certificate.vesselName)).size;
  const summary = [`${vesselCount} navire(s)`];
  if (includeDocuments) summary.push(`${certificates.length} document(s)`);
  if (includeFindings) summary.push(`${findings.length} écart(s)`);
  doc.text(summary.join(' - '), 12, 51);

  let tableY = 58;
  const ensureTableSpace = (requiredHeight = 34): boolean => {
    if (tableY <= pageHeight - requiredHeight) return false;
    doc.addPage();
    drawHeader();
    tableY = 38;
    return true;
  };

  if (includeFindings) {
    const open = findings.filter((item) => item.status !== 'closed');
    const overdue = open.filter((item) => item.treatmentDueOn && item.treatmentDueOn < reportIsoDate(generatedOn));
    autoTable(doc, {
      startY: tableY,
      head: [['Écarts ouverts', 'Majeurs', 'En retard', 'Clôturés']],
      body: [[open.length, open.filter((item) => item.findingType === 'major_non_conformity').length, overdue.length, findings.length - open.length]],
      theme: 'grid',
      styles: { halign: 'center', fontSize: 11, cellPadding: 4, textColor: navy },
      headStyles: { fillColor: [239, 244, 250], textColor: navy, fontSize: 8 },
      columnStyles: { 2: { textColor: red } },
      margin: { left: 12, right: 12, top: 34 },
      willDrawPage: drawAutoTableHeader,
    });
    tableY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;
  }

  if (includeDocuments) {
    ensureTableSpace(40);
    doc.setTextColor(...navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text('Liste des documents', 12, tableY);
    doc.setDrawColor(...blue); doc.setLineWidth(0.7); doc.line(12, tableY + 3, pageWidth - 12, tableY + 3);
    tableY += 9;

    const renderVesselHeading = (name: string, count: number, y: number, continued = false): void => {
      doc.setFillColor(...blue);
      doc.roundedRect(12, y, pageWidth - 24, 9, 1.5, 1.5, 'F');
      doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
      doc.text(`NAVIRE · ${name}${continued ? ' · SUITE' : ''}`, 16, y + 6);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
      doc.text(`${count} document${count > 1 ? 's' : ''}`, pageWidth - 16, y + 6, { align: 'right' });
    };

    const drawVesselHeading = (name: string, count: number, continued = false): void => {
      renderVesselHeading(name, count, tableY, continued);
      tableY += 13;
    };

    if (!documentHierarchy.length) {
      autoTable(doc, {
        startY: tableY,
        body: [['Aucun document dans ce périmètre']],
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 4, textColor: [90, 99, 112] },
        margin: { left: 12, right: 12, top: 34 },
        willDrawPage: drawAutoTableHeader,
      });
      tableY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;
    }

    documentHierarchy.forEach((vessel) => {
      const documentCount = vessel.categories.reduce((total, category) => total + category.documents.length, 0);
      ensureTableSpace(40);
      drawVesselHeading(vessel.name, documentCount);

      vessel.categories.forEach((category) => {
        if (ensureTableSpace(34)) drawVesselHeading(vessel.name, documentCount, true);

        autoTable(doc, {
          startY: tableY,
          head: [
            [{
              content: category.label,
              colSpan: 3,
              styles: {
                fillColor: [239, 244, 250],
                textColor: navy,
                fontStyle: 'bold',
                fontSize: 8.5,
              },
            }],
            ['Document', 'Échéance', 'État'],
          ],
          body: category.documents.map((row) => [
            row.documentTitle,
            formatFleetCertificateDocumentExpiry(row.expiresOn),
            {
              content: row.validity,
              styles: {
                fillColor: row.validity === 'Échu' ? [255, 238, 238] : [234, 247, 240],
                textColor: row.validity === 'Échu' ? red : green,
                fontStyle: 'bold',
                halign: 'center',
              },
            },
          ]),
          theme: 'grid',
          styles: { fontSize: 7.8, cellPadding: 2.5, valign: 'middle', lineColor: [220, 226, 234] },
          headStyles: { fillColor: navy, textColor: 255, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [249, 251, 253] },
          columnStyles: {
            1: { cellWidth: 39 },
            2: { cellWidth: 22, halign: 'center' },
          },
          margin: { left: 12, right: 12, top: 47 },
          willDrawPage: (data) => {
            drawAutoTableHeader();
            if (data.pageNumber > 1) renderVesselHeading(vessel.name, documentCount, 34, true);
          },
        });
        tableY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
      });
      tableY += 2;
    });
  }

  if (includeFindings) {
    ensureTableSpace();
    autoTable(doc, {
      startY: tableY,
      head: [['Navire', 'Document', 'Référence', 'Écart', 'Échéance', 'État']],
      body: findingRows.length ? findingRows.map(({ certificate, finding }) => [
        certificate.vesselName,
        certificate.documentTitle,
        finding.reference,
        finding.title || 'Non renseigné',
        formatDate(finding.treatmentDueOn),
        FLEET_FINDING_STATUS_LABELS[finding.status],
      ]) : [['-', '-', '-', 'Aucun écart dans ce périmètre', '-', '-']],
      theme: 'grid',
      styles: { fontSize: 6.7, cellPadding: 2.1, valign: 'middle' },
      headStyles: { fillColor: navy, textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 38 },
        2: { cellWidth: 24 },
        4: { cellWidth: 24 },
        5: { cellWidth: 21 },
      },
      margin: { left: 12, right: 12, top: 34 },
      willDrawPage: drawAutoTableHeader,
    });
  }

  if (includeFindings) hierarchy.forEach((vessel) => vessel.categories.forEach((category) => category.documents.forEach((group) => {
    group.findings.forEach((finding) => {
      doc.addPage();
      drawHeader();
      doc.setTextColor(80); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      doc.text(`${vessel.name} / ${category.label} / ${group.certificate.documentTitle}`, 12, 38, { maxWidth: 186 });
      doc.setTextColor(...navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
      const heading = doc.splitTextToSize(`${finding.reference} - ${finding.title || 'Écart sans objet'}`, 186);
      doc.text(heading, 12, 47);
      const metadataY = 49 + (heading.length * 6);

      autoTable(doc, {
        startY: metadataY,
        theme: 'grid',
        body: [
          ['Type d’écart', FLEET_FINDING_LABELS[finding.findingType], 'Échéance', formatDate(finding.treatmentDueOn)],
          ['Objet', finding.title || 'Non renseigné', 'Date de clôture', finding.closedAt ? formatDate(finding.closedAt) : 'Non clôturé'],
          ['Responsable', finding.responsibleName || 'Non renseigné', 'État', `${FLEET_FINDING_STATUS_LABELS[finding.status]} - ${finding.progress} %`],
          ['Date du constat', formatDate(finding.detectedOn), 'Délai', finding.treatmentDelayDays == null ? 'Non renseigné' : `${finding.treatmentDelayDays} jours`],
        ],
        styles: { fontSize: 7.8, cellPadding: 2.7, valign: 'middle' },
        columnStyles: {
          0: { fontStyle: 'bold', fillColor: [239, 244, 250], cellWidth: 29 },
          1: { cellWidth: 64 },
          2: { fontStyle: 'bold', fillColor: [239, 244, 250], cellWidth: 29 },
          3: { cellWidth: 64 },
        },
        margin: { left: 12, right: 12, top: 34 },
        willDrawPage: drawAutoTableHeader,
      });

      let cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      const descriptionLines = doc.splitTextToSize(finding.description || 'Aucune description.', 186);
      if (cursorY + 10 + (descriptionLines.length * 4.2) > pageHeight - 15) {
        doc.addPage(); drawHeader(); cursorY = 39;
      }
      doc.setTextColor(...navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
      doc.text('Description', 12, cursorY);
      doc.setTextColor(55); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8);
      doc.text(descriptionLines, 12, cursorY + 6);
      cursorY += 10 + (descriptionLines.length * 4.2);

      autoTable(doc, {
        startY: cursorY,
        head: [['Date', 'Émetteur du suivi', 'Suivi du traitement']],
        body: finding.events.length
          ? finding.events.slice().sort((left, right) => left.createdAt.localeCompare(right.createdAt)).map((event) => [
            formatDateTime(event.createdAt),
            event.authorName || 'Système',
            event.note || event.eventType,
          ])
          : [['-', '-', 'Aucun suivi enregistré']],
        theme: 'grid',
        styles: { fontSize: 7.4, cellPadding: 2.4, valign: 'top' },
        headStyles: { fillColor: navy, textColor: 255 },
        columnStyles: { 0: { cellWidth: 31 }, 1: { cellWidth: 42 } },
        margin: { left: 12, right: 12, top: 34 },
        willDrawPage: drawAutoTableHeader,
      });

      const photos = finding.attachments.filter((attachment) => (
        attachment.mimeType.startsWith('image/') && input.attachmentImages?.[attachment.id]
      ));
      if (photos.length) {
        let photoY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 9;
        photos.forEach((attachment) => {
          const dataUrl = input.attachmentImages?.[attachment.id];
          if (!dataUrl) return;
          try {
            const properties = doc.getImageProperties(dataUrl);
            const size = calculateContainSize(properties.width, properties.height, 184, 150);
            const requiredHeight = size.height + 17;
            if (photoY + requiredHeight > pageHeight - 14) {
              doc.addPage(); drawHeader(); photoY = 39;
            }
            doc.setTextColor(...navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
            doc.text(attachment.kind === 'finding' ? 'Photo du constat' : 'Preuve photographique du traitement', 12, photoY);
            doc.setTextColor(85); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.3);
            doc.text(attachment.caption || attachment.originalFileName || 'Pièce jointe', 12, photoY + 5, { maxWidth: 184 });
            doc.addImage(dataUrl, imageFormat(dataUrl), 12 + ((184 - size.width) / 2), photoY + 9, size.width, size.height);
            photoY += requiredHeight;
          } catch {
            // Une image illisible ne doit pas empêcher la génération du rapport complet.
          }
        });
      }
    });
  })));

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(220, 226, 234); doc.line(12, pageHeight - 10, pageWidth - 12, pageHeight - 10);
    doc.setTextColor(120); doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
    doc.text('BBTM', 12, pageHeight - 6);
    doc.text(`Page ${page} / ${totalPages}`, pageWidth - 12, pageHeight - 6, { align: 'right' });
  }

  const arrayBuffer = doc.output('arraybuffer');
  return {
    blob: new Blob([arrayBuffer], { type: 'application/pdf' }),
    filename: `BBTM-Certificats-Flotte-Plan-d-Action-${reportIsoDate(generatedOn)}.pdf`,
    arrayBuffer,
  };
}

export function downloadFleetFindingReport(result: { blob: Blob; filename: string }): void {
  const url = URL.createObjectURL(result.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = result.filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
