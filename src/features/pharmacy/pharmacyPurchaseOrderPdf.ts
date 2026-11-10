import { jsPDF } from 'jspdf';
import stampUrl from './assets/bbtm-pharmacy-stamp.jpg?url';
import { formatPharmacyDate, formatPharmacyStockQuantity, pharmacyDaysUntil } from './pharmacyModel';

type OrderLine = {
  designation: string;
  brand?: string;
  strength?: string;
  packaging: string;
  reason: string;
  quantity: number;
  unit: string;
  quantityNeedsReview?: boolean;
};

export interface PharmacyPurchaseOrderPdfInput {
  issuedOn: string;
  vesselName: string;
  registrationNumber: string | null;
  imoNumber?: string | null;
  medicalDotation: string;
  signerName: string;
  signerFunction: string | null;
  signature: Uint8Array;
  lines: readonly OrderLine[];
}

const NAVY = '#102A43';
const GREEN = '#116449';
const MUTED = '#4C6173';
const RULE = '#D6E0E7';
const LIGHT = '#F1F6F8';
const ALT = '#F8FAFB';
const WHITE = '#FFFFFF';
const MARGIN = 14;
const HEADER_HEIGHT = 8;
const FONT_TO_MM = 25.4 / 72;
const PANEL_GAP = 8;

type PageLayout = {
  format: 'a4' | 'a3' | 'a2';
  panels: number;
  size: number;
  leading: number;
  padding: number;
  inlineDetails?: boolean;
};

const PAGE_LAYOUTS: readonly PageLayout[] = [
  { format: 'a4', panels: 1, size: 9.5, leading: 4.1, padding: 2 },
  { format: 'a4', panels: 1, size: 8.5, leading: 3.7, padding: 1.25 },
  { format: 'a3', panels: 1, size: 9.5, leading: 4.1, padding: 1.25 },
  { format: 'a3', panels: 2, size: 8.5, leading: 3.7, padding: 1.25 },
  { format: 'a2', panels: 2, size: 9.5, leading: 4.1, padding: 1.25 },
  { format: 'a2', panels: 2, size: 8.5, leading: 3.35, padding: 0.65, inlineDetails: true },
  { format: 'a2', panels: 3, size: 8.5, leading: 3.15, padding: 0.5, inlineDetails: true },
];

function setType(doc: jsPDF, size: number, bold = false, color = NAVY) {
  doc.setFont('helvetica', bold ? 'bold' : 'normal');
  doc.setFontSize(size);
  doc.setTextColor(color);
}

function wrap(doc: jsPDF, value: string, width: number): string[] {
  return doc.splitTextToSize(value.replace(/[\s\u00a0\u202f]+/gu, ' ').trim() || '–', width);
}

function printLines(doc: jsPDF, lines: string[], x: number, y: number, leading: number, align: 'left' | 'center' = 'left') {
  doc.text(lines, x, y, { align, lineHeightFactor: leading / (doc.getFontSize() * FONT_TO_MM) });
}

function splitPanels<Row extends { height: number }>(rows: Row[], panelHeight: number, count: number): Row[][] | null {
  const panels: Row[][] = [[]];
  let height = 0;
  for (const row of rows) {
    if (row.height > panelHeight) return null;
    if (height + row.height > panelHeight) {
      if (panels.length >= count) return null;
      panels.push([]);
      height = 0;
    }
    panels[panels.length - 1].push(row);
    height += row.height;
  }
  return panels;
}

function drawImage(doc: jsPDF, bytes: Uint8Array, x: number, y: number, width: number, height: number, label: string) {
  try {
    const image = doc.getImageProperties(bytes);
    if (!['JPEG', 'PNG'].includes(image.fileType) || !image.width || !image.height) throw new Error();
    const scale = Math.min(width / image.width, height / image.height);
    const imageWidth = image.width * scale;
    const imageHeight = image.height * scale;
    doc.addImage(bytes, image.fileType, x + (width - imageWidth) / 2, y + (height - imageHeight) / 2, imageWidth, imageHeight, undefined, 'FAST');
  } catch {
    throw new Error(`Impossible d’intégrer ${label} au bon de commande.`);
  }
}

function renderOrder(input: PharmacyPurchaseOrderPdfInput, stamp: Uint8Array, layout: PageLayout): jsPDF | null {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: layout.format, compress: true, putOnlyUsedFonts: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const right = pageWidth - MARGIN;
  const width = right - MARGIN;
  const panelWidth = (width - PANEL_GAP * (layout.panels - 1)) / layout.panels;
  const columns = [
    { label: 'Article / dosage', width: panelWidth * 0.42 },
    { label: 'Conditionnement', width: panelWidth * 0.25 },
    { label: 'Motif', width: panelWidth * 0.20 },
    { label: 'Quantité', width: panelWidth * 0.13 },
  ];
  const columnStarts = columns.map((_, index) => columns.slice(0, index).reduce((sum, column) => sum + column.width, 0));
  const date = formatPharmacyDate(input.issuedOn);
  const issuerWidth = width * 0.42;
  const fields = [
    { label: 'Navire', value: input.vesselName, ratio: 0.28 },
    { label: 'Immatriculation', value: input.registrationNumber || 'Non renseignée', ratio: input.imoNumber ? 0.21 : 0.33 },
    ...(input.imoNumber ? [{ label: 'N° OMI', value: input.imoNumber, ratio: 0.15 }] : []),
    { label: 'Type de dotation médicale', value: input.medicalDotation, ratio: input.imoNumber ? 0.36 : 0.39 },
  ];
  setType(doc, 11, true);
  const wrappedFields = fields.map(({ value, ratio }) => wrap(doc, value, width * ratio - 8));
  const infoTop = 43;
  const infoHeight = 12 + 4.6 * Math.max(...wrappedFields.map((lines) => lines.length));
  const tableTop = infoTop + infoHeight + 15;
  setType(doc, 11, true);
  const name = wrap(doc, input.signerName, issuerWidth - 10);
  setType(doc, 9);
  const job = wrap(doc, input.signerFunction || 'Non renseignée', issuerWidth - 10);
  const issuerHeight = Math.max(34, 14 + name.length * 4.5 + job.length * 4);
  const issuerTop = pageHeight - MARGIN - issuerHeight;
  const review = input.lines.some((line) => line.quantityNeedsReview);
  const tableBottom = issuerTop - (review ? 13 : 8);
  const cellPadding = 2.4;
  const rows = input.lines.map((line) => {
    const details = [line.strength, line.brand].filter(Boolean).join(' · ');
    const quantity = formatPharmacyStockQuantity(line.quantity, line.unit) + (line.quantityNeedsReview ? ' *' : '');
    const designation = layout.inlineDetails && details ? `${line.designation} · ${details}` : line.designation;
    setType(doc, layout.size, true);
    const title = wrap(doc, designation, columns[0].width - 2 * cellPadding);
    const orderQuantity = wrap(doc, quantity, columns[3].width - 2 * cellPadding);
    setType(doc, layout.size);
    const sub = !layout.inlineDetails && details ? wrap(doc, details, columns[0].width - 2 * cellPadding) : [];
    const packaging = wrap(doc, line.packaging, columns[1].width - 2 * cellPadding);
    const reason = wrap(doc, line.reason, columns[2].width - 2 * cellPadding);
    return {
      title, sub, packaging, reason, orderQuantity,
      height: 2 * layout.padding + layout.leading * Math.max(title.length + sub.length, packaging.length, reason.length, orderQuantity.length),
    };
  });
  const panels = splitPanels(rows, tableBottom - tableTop - HEADER_HEIGHT, layout.panels);
  if (!panels) return null;

  doc.setProperties({ title: 'Bon de commande – Inventaire Pharmacie', subject: input.vesselName, author: 'BBTM sas' });
  setType(doc, 9, true, GREEN);
  doc.text('SEAPILOT  /  INVENTAIRE PHARMACIE', MARGIN, 17);
  setType(doc, 27, true);
  doc.text('Bon de commande', MARGIN, 29);
  setType(doc, 10, false, MUTED);
  doc.text('Réapprovisionnement de la pharmacie de bord', MARGIN, 35.5);
  const dateWidth = 41;
  doc.setFillColor(LIGHT);
  doc.roundedRect(right - dateWidth, 14, dateWidth, 21, 2, 2, 'F');
  setType(doc, 7.4, true, MUTED);
  doc.text('DATE D’ÉMISSION', right - dateWidth / 2, 21, { align: 'center' });
  setType(doc, 13, true);
  doc.text(date, right - dateWidth / 2, 29, { align: 'center' });

  doc.setFillColor(LIGHT);
  doc.roundedRect(MARGIN, infoTop, width, infoHeight, 2, 2, 'F');
  let fieldX = MARGIN;
  fields.forEach((field, index) => {
    if (index) {
      doc.setDrawColor(RULE);
      doc.line(fieldX, infoTop + 3, fieldX, infoTop + infoHeight - 3);
    }
    setType(doc, 7.4, true, MUTED);
    doc.text(field.label, fieldX + 4, infoTop + 5.4);
    setType(doc, 11, true);
    printLines(doc, wrappedFields[index], fieldX + 4, infoTop + 11.5, 4.6);
    fieldX += width * field.ratio;
  });

  setType(doc, 13, true);
  doc.text('Articles à commander', MARGIN, tableTop - 4);
  setType(doc, 8.5, true, GREEN);
  doc.text(`${rows.length} ${rows.length > 1 ? 'références' : 'référence'}`, right, tableTop - 4, { align: 'right' });
  let lastRowBottom = tableTop;
  panels.forEach((panel, panelIndex) => {
    const panelX = MARGIN + panelIndex * (panelWidth + PANEL_GAP);
    doc.setFillColor(NAVY);
    doc.roundedRect(panelX, tableTop, panelWidth, HEADER_HEIGHT, 1.1, 1.1, 'F');
    columns.forEach((column, index) => {
      setType(doc, 8, true, WHITE);
      const centered = index === 3;
      const labelX = panelX + columnStarts[index] + (centered ? column.width / 2 : cellPadding);
      doc.text(column.label, labelX, tableTop + 5.1, { align: centered ? 'center' : 'left' });
    });
    let rowY = tableTop + HEADER_HEIGHT;
    panel.forEach((row, index) => {
      if (index % 2 === 0) {
        doc.setFillColor(ALT);
        doc.rect(panelX, rowY, panelWidth, row.height, 'F');
      }
      const y = rowY + layout.padding + layout.size * FONT_TO_MM * 0.84;
      const cellX = (column: number) => panelX + columnStarts[column] + cellPadding;
      setType(doc, layout.size, true);
      printLines(doc, row.title, cellX(0), y, layout.leading);
      printLines(doc, row.orderQuantity, panelX + columnStarts[3] + columns[3].width / 2, y, layout.leading, 'center');
      setType(doc, layout.size, false, MUTED);
      if (row.sub.length) printLines(doc, row.sub, cellX(0), y + row.title.length * layout.leading, layout.leading);
      printLines(doc, row.packaging, cellX(1), y, layout.leading);
      printLines(doc, row.reason, cellX(2), y, layout.leading);
      rowY += row.height;
      doc.setDrawColor(RULE);
      doc.setLineWidth(0.18);
      doc.line(panelX, rowY, panelX + panelWidth, rowY);
    });
    lastRowBottom = Math.max(lastRowBottom, rowY);
  });
  if (review) {
    setType(doc, 8.5, false, MUTED);
    doc.text('* Quantité à vérifier avant envoi.', MARGIN, lastRowBottom + 5);
  }

  doc.setDrawColor(RULE);
  doc.setLineWidth(0.25);
  doc.roundedRect(MARGIN, issuerTop, width, issuerHeight, 2, 2);
  const signatureWidth = width * 0.27;
  const stampX = MARGIN + issuerWidth + signatureWidth;
  doc.line(MARGIN + issuerWidth, issuerTop + 4, MARGIN + issuerWidth, issuerTop + issuerHeight - 4);
  doc.line(stampX, issuerTop + 4, stampX, issuerTop + issuerHeight - 4);
  setType(doc, 7.8, true, MUTED);
  doc.text('ÉMIS PAR', MARGIN + 5, issuerTop + 6);
  doc.text('SIGNATURE', MARGIN + issuerWidth + signatureWidth / 2, issuerTop + 6, { align: 'center' });
  doc.text('CACHET DE L’ENTREPRISE', stampX + (right - stampX) / 2, issuerTop + 6, { align: 'center' });
  setType(doc, 11, true);
  printLines(doc, name, MARGIN + 5, issuerTop + 13, 4.5);
  setType(doc, 9, false, MUTED);
  printLines(doc, job, MARGIN + 5, issuerTop + 14.5 + name.length * 4.5, 4);
  drawImage(doc, input.signature, MARGIN + issuerWidth + 5, issuerTop + 9, signatureWidth - 10, 21, 'la signature');
  drawImage(doc, stamp, stampX + 4, issuerTop + 9, right - stampX - 8, 21, 'le cachet de l’entreprise');
  return doc;
}

export async function buildPharmacyPurchaseOrderPdf(input: PharmacyPurchaseOrderPdfInput): Promise<{ blob: Blob; filename: string }> {
  if (!input.lines.length) throw new Error('Aucun article à commander.');
  if (input.lines.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0)) throw new Error('Renseignez les quantités à commander.');
  if (pharmacyDaysUntil(input.issuedOn, input.issuedOn) !== 0) throw new Error('La date d’émission est invalide.');
  const response = await fetch(stampUrl);
  if (!response.ok) throw new Error('Le cachet de l’entreprise est indisponible.');
  const stamp = new Uint8Array(await response.arrayBuffer());
  const name = input.vesselName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  for (const layout of PAGE_LAYOUTS) {
    const document = renderOrder(input, stamp, layout);
    if (document) return { blob: document.output('blob'), filename: `bon-de-commande-pharmacie-${name}-${input.issuedOn}.pdf` };
  }
  throw new Error('Le bon de commande contient trop de texte pour tenir sur une seule page lisible.');
}
