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

export interface FleetCertificateActionReportDocumentGroup extends FleetFindingReportDocumentGroup {
  reportRow: FleetCertificateDocumentReportRow;
}

export interface FleetCertificateActionReportCategoryGroup {
  label: string;
  documents: FleetCertificateActionReportDocumentGroup[];
}

export interface FleetCertificateActionReportVesselGroup {
  name: string;
  categories: FleetCertificateActionReportCategoryGroup[];
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

export function buildFleetCertificateActionReportHierarchy(
  certificates: FleetCertificateRecord[],
  findings: FleetCertificateFinding[],
  generatedOn: Date,
): FleetCertificateActionReportVesselGroup[] {
  const findingsByCertificate = new Map<number, FleetCertificateFinding[]>();
  findings.forEach((finding) => {
    const certificateFindings = findingsByCertificate.get(finding.certificateId) || [];
    certificateFindings.push(finding);
    findingsByCertificate.set(finding.certificateId, certificateFindings);
  });

  const generatedDate = reportIsoDate(generatedOn);
  const vessels = new Map<string, Map<string, FleetCertificateActionReportDocumentGroup[]>>();
  certificates.forEach((certificate) => {
    const vessel = vessels.get(certificate.vesselName) || new Map<string, FleetCertificateActionReportDocumentGroup[]>();
    const category = vessel.get(certificate.categoryLabel) || [];
    category.push({
      certificate,
      reportRow: {
        vesselName: certificate.vesselName,
        categoryLabel: certificate.categoryLabel,
        documentTitle: certificate.documentTitle,
        expiresOn: certificate.expiresOn,
        validity: certificate.expiresOn && certificate.expiresOn < generatedDate ? 'Échu' : 'Valide',
      },
      findings: (findingsByCertificate.get(certificate.id) || []).slice()
        .sort((left, right) => frenchSort.compare(left.reference, right.reference)),
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
  const reportHierarchy = buildFleetCertificateActionReportHierarchy(
    certificates,
    includeFindings ? findings : [],
    generatedOn,
  );
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  doc.setProperties({ title: FLEET_REPORT_TITLE, subject: FLEET_REPORT_TITLE, author: 'BBTM', creator: 'BBTM' });
  const navy: [number, number, number] = [20, 37, 63];
  const blue: [number, number, number] = [12, 111, 202];
  const red: [number, number, number] = [205, 47, 47];
  const green: [number, number, number] = [19, 126, 83];
  const amber: [number, number, number] = [202, 116, 26];
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const drawHeader = (): void => {
    doc.setFillColor(...navy);
    doc.rect(0, 0, pageWidth, 21, 'F');
    if (logo) {
      try {
        const properties = doc.getImageProperties(logo);
        const size = calculateContainSize(properties.width, properties.height, 14, 14);
        doc.addImage(logo, imageFormat(logo), 12, 3.5 + ((14 - size.height) / 2), size.width, size.height);
      } catch {
        doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text('BBTM', 14, 13.5);
      }
    } else {
      doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text('BBTM', 14, 13.5);
    }
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text(FLEET_REPORT_TITLE, pageWidth - 12, 9.2, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
    doc.text(`Édité le ${generatedOn.toLocaleString('fr-FR')}`, pageWidth - 12, 15.4, { align: 'right' });
  };

  const generatedDate = reportIsoDate(generatedOn);
  const lastTableY = (): number => (
    doc as unknown as { lastAutoTable: { finalY: number } }
  ).lastAutoTable.finalY;
  let tableY = 0;

  const vesselDocumentCount = (vessel: FleetCertificateActionReportVesselGroup): number => (
    vessel.categories.reduce((total, category) => total + category.documents.length, 0)
  );
  const vesselFindingCount = (vessel: FleetCertificateActionReportVesselGroup): number => (
    vessel.categories.reduce((vesselTotal, category) => (
      vesselTotal + category.documents.reduce((categoryTotal, group) => categoryTotal + group.findings.length, 0)
    ), 0)
  );

  const renderVesselHeading = (
    vessel: FleetCertificateActionReportVesselGroup,
    y: number,
    continued = false,
  ): void => {
    const documentCount = vesselDocumentCount(vessel);
    const findingCount = vesselFindingCount(vessel);
    doc.setFillColor(...blue);
    doc.roundedRect(12, y, pageWidth - 24, 8, 1.5, 1.5, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9.2);
    doc.text(`NAVIRE · ${vessel.name}${continued ? ' · SUITE' : ''}`, 16, y + 5.4);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8);
    const metrics = [
      includeDocuments ? `${documentCount} document${documentCount > 1 ? 's' : ''}` : '',
      includeFindings ? `${findingCount} écart${findingCount > 1 ? 's' : ''}` : '',
    ].filter(Boolean).join(' · ');
    doc.text(metrics, pageWidth - 16, y + 5.3, { align: 'right' });
  };

  const renderCategoryHeading = (label: string, y: number, continued = false): void => {
    doc.setFillColor(239, 244, 250);
    doc.rect(12, y, pageWidth - 24, 6.5, 'F');
    doc.setTextColor(...navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.7);
    doc.text(`${label}${continued ? ' · suite' : ''}`, 15, y + 4.5, { maxWidth: pageWidth - 30 });
  };

  const startVesselPage = (vessel: FleetCertificateActionReportVesselGroup, addPage: boolean): void => {
    if (addPage) doc.addPage();
    drawHeader();
    renderVesselHeading(vessel, 25);
    tableY = 37;
  };

  const startContinuationPage = (
    vessel: FleetCertificateActionReportVesselGroup,
    categoryLabel?: string,
  ): void => {
    doc.addPage();
    drawHeader();
    renderVesselHeading(vessel, 25, true);
    tableY = 37;
    if (categoryLabel) {
      renderCategoryHeading(categoryLabel, tableY, true);
      tableY += 8.5;
    }
  };

  const ensureVesselSpace = (
    vessel: FleetCertificateActionReportVesselGroup,
    requiredHeight: number,
    categoryLabel?: string,
  ): boolean => {
    if (tableY <= pageHeight - requiredHeight) return false;
    startContinuationPage(vessel, categoryLabel);
    return true;
  };

  const drawCategoryTableHeader = (
    data: { pageNumber: number },
    vessel: FleetCertificateActionReportVesselGroup,
    categoryLabel: string,
  ): void => {
    drawHeader();
    if (data.pageNumber <= 1) return;
    renderVesselHeading(vessel, 25, true);
    renderCategoryHeading(categoryLabel, 36, true);
  };

  if (!reportHierarchy.length) {
    drawHeader();
    doc.setTextColor(...navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text('Aucune donnée à afficher pour le périmètre sélectionné.', pageWidth / 2, 55, { align: 'center' });
  } else if (includeDocuments && !includeFindings) {
    reportHierarchy.forEach((vessel, vesselIndex) => {
      startVesselPage(vessel, vesselIndex > 0);
      const body = vessel.categories.flatMap((category) => [
        [{
          content: category.label,
          colSpan: 3,
          styles: {
            fillColor: [232, 239, 248] as [number, number, number],
            textColor: navy,
            fontStyle: 'bold' as const,
            fontSize: 7.2,
            cellPadding: { top: 1.35, right: 1.6, bottom: 1.35, left: 2.2 },
          },
        }],
        ...category.documents.map((group) => [
          group.reportRow.documentTitle,
          formatFleetCertificateDocumentExpiry(group.reportRow.expiresOn),
          {
            content: group.reportRow.validity,
            styles: {
              fillColor: (group.reportRow.validity === 'Échu'
                ? [255, 238, 238]
                : [234, 247, 240]) as [number, number, number],
              textColor: group.reportRow.validity === 'Échu' ? red : green,
              fontStyle: 'bold' as const,
              halign: 'center' as const,
            },
          },
        ]),
      ]);

      autoTable(doc, {
        startY: tableY,
        head: [
          [{
            content: `LISTE DES DOCUMENTS · ${vesselDocumentCount(vessel)} document${vesselDocumentCount(vessel) > 1 ? 's' : ''}`,
            colSpan: 3,
            styles: { fillColor: navy, textColor: 255, fontStyle: 'bold' },
          }],
          ['Document', 'Échéance', 'État'],
        ],
        body,
        theme: 'grid',
        styles: { fontSize: 6.65, cellPadding: 1.25, valign: 'middle', lineColor: [220, 226, 234] },
        headStyles: { fillColor: [45, 63, 87], textColor: 255, fontStyle: 'bold', cellPadding: 1.45 },
        alternateRowStyles: { fillColor: [249, 251, 253] },
        columnStyles: { 1: { cellWidth: 38 }, 2: { cellWidth: 21, halign: 'center' } },
        margin: { left: 12, right: 12, top: 37, bottom: 14 },
        willDrawPage: (data) => {
          drawHeader();
          if (data.pageNumber > 1) renderVesselHeading(vessel, 25, true);
        },
      });
      tableY = lastTableY() + 4;
    });
  } else {
    reportHierarchy.forEach((vessel, vesselIndex) => {
      startVesselPage(vessel, vesselIndex > 0);

      vessel.categories.forEach((category) => {
      ensureVesselSpace(vessel, 38);
      renderCategoryHeading(category.label, tableY);
      tableY += 8.5;

      if (includeDocuments) {
        autoTable(doc, {
          startY: tableY,
          head: [
            [{
              content: `SUIVI DOCUMENTAIRE · ${category.documents.length} document${category.documents.length > 1 ? 's' : ''}`,
              colSpan: 3,
              styles: { fillColor: navy, textColor: 255, fontStyle: 'bold' },
            }],
            ['Document', 'Échéance', 'État'],
          ],
          body: category.documents.map((group) => [
            group.reportRow.documentTitle,
            formatFleetCertificateDocumentExpiry(group.reportRow.expiresOn),
            {
              content: group.reportRow.validity,
              styles: {
                fillColor: group.reportRow.validity === 'Échu' ? [255, 238, 238] : [234, 247, 240],
                textColor: group.reportRow.validity === 'Échu' ? red : green,
                fontStyle: 'bold',
                halign: 'center',
              },
            },
          ]),
          theme: 'grid',
          styles: { fontSize: 7.7, cellPadding: 2.35, valign: 'middle', lineColor: [220, 226, 234] },
          headStyles: { fillColor: [45, 63, 87], textColor: 255, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [249, 251, 253] },
          columnStyles: { 1: { cellWidth: 39 }, 2: { cellWidth: 22, halign: 'center' } },
          margin: { left: 12, right: 12, top: 45 },
          willDrawPage: (data) => drawCategoryTableHeader(data, vessel, category.label),
        });
        tableY = lastTableY() + 5;
      }

      if (includeFindings) {
        const categoryFindings = category.documents.flatMap((group) => (
          group.findings.map((finding) => ({ group, finding }))
        ));

        if (!categoryFindings.length) {
          ensureVesselSpace(vessel, 17, category.label);
          doc.setFillColor(238, 248, 243);
          doc.roundedRect(12, tableY, pageWidth - 24, 9, 1.3, 1.3, 'F');
          doc.setTextColor(...green); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
          doc.text('Aucun écart enregistré pour cette catégorie.', 16, tableY + 5.8);
          tableY += 13;
        } else {
          ensureVesselSpace(vessel, 34, category.label);
          autoTable(doc, {
            startY: tableY,
            head: [
              [{
                content: `ÉCARTS & ACTIONS · ${categoryFindings.length}`,
                colSpan: 5,
                styles: { fillColor: amber, textColor: 255, fontStyle: 'bold' },
              }],
              ['Document', 'Référence', 'Écart', 'Échéance', 'Suivi'],
            ],
            body: categoryFindings.map(({ group, finding }) => {
              const overdue = finding.status !== 'closed'
                && Boolean(finding.treatmentDueOn)
                && finding.treatmentDueOn < generatedDate;
              return [
                group.certificate.documentTitle,
                finding.reference,
                finding.title || 'Non renseigné',
                formatDate(finding.treatmentDueOn),
                {
                  content: `${overdue ? 'En retard' : FLEET_FINDING_STATUS_LABELS[finding.status]} · ${finding.progress} %`,
                  styles: {
                    fillColor: overdue ? [255, 238, 238] : finding.status === 'closed' ? [234, 247, 240] : [239, 244, 250],
                    textColor: overdue ? red : finding.status === 'closed' ? green : navy,
                    fontStyle: 'bold',
                    halign: 'center',
                  },
                },
              ];
            }),
            theme: 'grid',
            styles: { fontSize: 6.8, cellPadding: 2.1, valign: 'middle', lineColor: [224, 227, 232] },
            headStyles: { fillColor: [61, 72, 89], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [253, 250, 246] },
            columnStyles: {
              0: { cellWidth: 37 },
              1: { cellWidth: 23 },
              3: { cellWidth: 24 },
              4: { cellWidth: 30, halign: 'center' },
            },
            margin: { left: 12, right: 12, top: 45 },
            willDrawPage: (data) => drawCategoryTableHeader(data, vessel, category.label),
          });
          tableY = lastTableY() + 7;

          categoryFindings.forEach(({ group, finding }) => {
            ensureVesselSpace(vessel, 48, category.label);
            autoTable(doc, {
              startY: tableY,
              head: [[{
                content: `${finding.reference} · ${finding.title || 'Écart sans objet'}`,
                colSpan: 4,
                styles: { fillColor: amber, textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
              }]],
              body: [
                [{
                  content: group.certificate.documentTitle,
                  colSpan: 4,
                  styles: { fillColor: [253, 247, 239], textColor: navy, fontStyle: 'bold' },
                }],
                ['Type d’écart', FLEET_FINDING_LABELS[finding.findingType] || 'Non renseigné', 'Échéance', formatDate(finding.treatmentDueOn)],
                ['Responsable', finding.responsibleName || 'Non renseigné', 'État', `${FLEET_FINDING_STATUS_LABELS[finding.status]} · ${finding.progress} %`],
                ['Date du constat', formatDate(finding.detectedOn), 'Date de clôture', finding.closedAt ? formatDate(finding.closedAt) : 'Non clôturé'],
                [{
                  content: `Description\n${finding.description || 'Aucune description.'}`,
                  colSpan: 4,
                  styles: { cellPadding: 3, textColor: [55, 62, 72] },
                }],
              ],
              theme: 'grid',
              styles: { fontSize: 7.3, cellPadding: 2.3, valign: 'middle', lineColor: [224, 227, 232] },
              columnStyles: {
                0: { fontStyle: 'bold', fillColor: [245, 247, 250], cellWidth: 31 },
                1: { cellWidth: 62 },
                2: { fontStyle: 'bold', fillColor: [245, 247, 250], cellWidth: 31 },
                3: { cellWidth: 62 },
              },
              margin: { left: 12, right: 12, top: 45 },
              willDrawPage: (data) => drawCategoryTableHeader(data, vessel, category.label),
            });
            tableY = lastTableY() + 3;

            ensureVesselSpace(vessel, 28, category.label);
            autoTable(doc, {
              startY: tableY,
              head: [
                [{
                  content: 'SUIVI DU TRAITEMENT',
                  colSpan: 3,
                  styles: { fillColor: navy, textColor: 255, fontStyle: 'bold' },
                }],
                ['Date', 'Émetteur', 'Action / commentaire'],
              ],
              body: finding.events.length
                ? finding.events.slice().sort((left, right) => left.createdAt.localeCompare(right.createdAt)).map((event) => [
                  formatDateTime(event.createdAt),
                  event.authorName || 'Système',
                  event.note || event.eventType,
                ])
                : [['-', '-', 'Aucun suivi enregistré']],
              theme: 'grid',
              styles: { fontSize: 7.1, cellPadding: 2.2, valign: 'top', lineColor: [224, 227, 232] },
              headStyles: { fillColor: [45, 63, 87], textColor: 255 },
              columnStyles: { 0: { cellWidth: 31 }, 1: { cellWidth: 39 } },
              margin: { left: 12, right: 12, top: 45 },
              willDrawPage: (data) => drawCategoryTableHeader(data, vessel, category.label),
            });
            tableY = lastTableY() + 7;

            const photos = finding.attachments.filter((attachment) => (
              attachment.mimeType.startsWith('image/') && input.attachmentImages?.[attachment.id]
            ));
            photos.forEach((attachment) => {
              const dataUrl = input.attachmentImages?.[attachment.id];
              if (!dataUrl) return;
              try {
                const properties = doc.getImageProperties(dataUrl);
                const size = calculateContainSize(properties.width, properties.height, 184, 145);
                const requiredHeight = size.height + 18;
                if (tableY + requiredHeight > pageHeight - 14) startContinuationPage(vessel, category.label);
                doc.setTextColor(...navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.7);
                doc.text(`${finding.reference} · ${attachment.kind === 'finding' ? 'Photo du constat' : 'Preuve du traitement'}`, 12, tableY);
                doc.setTextColor(85); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.2);
                doc.text(attachment.caption || attachment.originalFileName || 'Pièce jointe', 12, tableY + 5, { maxWidth: 184 });
                doc.addImage(dataUrl, imageFormat(dataUrl), 12 + ((184 - size.width) / 2), tableY + 9, size.width, size.height);
                tableY += requiredHeight;
              } catch {
                // Une image illisible ne doit pas empêcher la génération du rapport complet.
              }
            });
          });
        }
      }

      tableY += 4;
      });
    });
  }

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
