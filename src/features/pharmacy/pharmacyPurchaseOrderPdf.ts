import { jsPDF } from 'jspdf';
import stampUrl from './assets/bbtm-pharmacy-stamp.jpg?url';
import {
  formatPharmacyDate, formatPharmacyStockQuantity, pharmacyDaysUntil, pharmacyDotationKey, pharmacyMedicalSection,
  type PharmacyMedicalSection,
} from './pharmacyModel';

export type PharmacyPurchaseOrderPdfLine = {
  designation: string;
  brand?: string;
  requiredStrength: string;
  quantity: number;
  unit: string;
  quantityNeedsReview?: boolean;
  dotation?: string;
  section?: PharmacyMedicalSection | null;
  category?: string;
  administrationRoute?: string;
  presentation?: string;
  requiredQuantity?: string;
  stockQuantity?: string;
  expiry?: string;
  classification?: string;
  remarks?: string;
};

export interface PharmacyPurchaseOrderPdfInput {
  issuedOn: string;
  vesselName: string;
  registrationNumber: string | null;
  imoNumber?: string | null;
  medicalDotation: string;
  medicalEmergencyBag?: boolean;
  armament?: string | null;
  flagState?: string | null;
  registrationPort?: string | null;
  signerName: string;
  signerFunction: string | null;
  signature: Uint8Array;
  lines: readonly PharmacyPurchaseOrderPdfLine[];
}

const NAVY = '#17365A';
const YELLOW = '#FFF200';
const RED = '#923632';
const BLACK = '#000000';
const WHITE = '#FFFFFF';
const MARGIN = 19;
const PAGE_BOTTOM = 185;
const CELL_PADDING = 1.5;
const FONT_SIZE = 9;
const LEADING = 3.8;
const FONT_TO_MM = 25.4 / 72;
const SECTION_HEIGHT = 8;
const MIN_SIGNATURE_HEIGHT = 24;

const sections: Record<PharmacyMedicalSection, { heading: string; order: number }> = {
  medicines: { heading: 'I. Registre des médicaments', order: 0 },
  equipment: { heading: 'II. Matériel médical et objets de pansement', order: 1 },
  unclassified: { heading: 'III. Articles à classer', order: 2 },
};

type OrderLine = PharmacyPurchaseOrderPdfLine;
type OrderColumn = {
  heading: string;
  width: number;
  value: (line: OrderLine) => string | undefined;
  align?: 'left' | 'center';
};

function orderQuantity(line: OrderLine) {
  return formatPharmacyStockQuantity(line.quantity, line.unit) + (line.quantityNeedsReview ? ' *' : '');
}

function expiry(line: OrderLine) {
  const value = line.expiry;
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatPharmacyDate(value) : value;
}

const requiredColumn = { heading: 'Quantité\nréglementaire', value: (line: OrderLine) => line.requiredQuantity };
const stockColumn = { heading: 'Quantité\nexistante', value: (line: OrderLine) => line.stockQuantity };
const expiryColumn = { heading: 'Date de\npéremption', value: expiry };
const orderColumn = { heading: 'Quantité\nà commander', value: orderQuantity };

const medicineColumns: readonly OrderColumn[] = [
  { heading: 'Principe actif\nDénomination commune\ninternationale', width: 0.204, value: (line) => line.designation, align: 'left' },
  { heading: 'Nom de spécialité\nou générique', width: 0.124, value: (line) => line.brand, align: 'left' },
  { heading: 'Voie\nd’administration', width: 0.103, value: (line) => line.administrationRoute },
  { heading: 'Forme -\nComposition', width: 0.182, value: (line) => [
    line.presentation || line.requiredStrength,
    line.remarks ? `Remarques : ${line.remarks}` : '',
  ].filter(Boolean).join('\n'), align: 'left' },
  { ...requiredColumn, width: 0.086 },
  { ...stockColumn, width: 0.068 },
  { ...expiryColumn, width: 0.075 },
  { heading: 'Liste', width: 0.063, value: (line) => line.classification },
  { ...orderColumn, width: 0.095 },
];
const equipmentColumns: readonly OrderColumn[] = [
  { heading: 'Article', width: 0.228, value: (line) => line.designation, align: 'left' },
  { heading: 'Marque / Modèle', width: 0.12, value: (line) => line.brand, align: 'left' },
  { heading: 'Présentation', width: 0.145, value: (line) => line.presentation || line.requiredStrength, align: 'left' },
  { ...requiredColumn, width: 0.091 },
  { ...stockColumn, width: 0.071 },
  { ...expiryColumn, width: 0.076 },
  { heading: 'Remarques', width: 0.172, value: (line) => line.remarks, align: 'left' },
  { ...orderColumn, width: 0.097 },
];

type OrderGroup = { dotation: string; section: PharmacyMedicalSection; categories: Map<string, OrderLine[]> };

function groupLines(input: PharmacyPurchaseOrderPdfInput): OrderGroup[] {
  const groups = new Map<string, OrderGroup>();
  for (const line of input.lines) {
    const dotation = line.dotation?.trim() || input.medicalDotation;
    const section = pharmacyMedicalSection(line.section);
    const key = JSON.stringify([pharmacyDotationKey(dotation), section]);
    const group = groups.get(key) ?? { dotation, section, categories: new Map<string, OrderLine[]>() };
    const category = line.category?.trim() || '';
    const articles = group.categories.get(category) ?? [];
    articles.push(line);
    group.categories.set(category, articles);
    groups.set(key, group);
  }
  const base = pharmacyDotationKey(input.medicalDotation);
  const isSupplement = (group: OrderGroup) => Number(pharmacyDotationKey(group.dotation) !== base);
  return [...groups.values()].sort((a, b) => isSupplement(a) - isSupplement(b) || sections[a.section].order - sections[b.section].order);
}

function setType(doc: jsPDF, size: number, style: 'normal' | 'bold' | 'italic' = 'normal', color = BLACK) {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
  doc.setTextColor(color);
}

function wrap(doc: jsPDF, value: string, width: number): string[] {
  return value.replaceAll('≥', '>=').replaceAll('≤', '<=').split(/\r?\n/).flatMap((paragraph: string) =>
    doc.splitTextToSize(paragraph.replace(/\s+/gu, ' ').trim(), width) as string[]);
}

function drawLines(doc: jsPDF, lines: string[], x: number, y: number, align: 'left' | 'center' = 'left') {
  doc.text(lines, x, y, { align, lineHeightFactor: LEADING / (doc.getFontSize() * FONT_TO_MM) });
}

function drawPageHeader(doc: jsPDF, input: PharmacyPurchaseOrderPdfInput, width: number) {
  doc.setFillColor(NAVY);
  doc.rect(MARGIN + 8, 14, width - 12, 8, 'FD');
  setType(doc, 13, 'bold', WHITE);
  doc.text('BON DE COMMANDE - DOTATION MÉDICALE', MARGIN + 10, 19.5);
  setType(doc, 8.5, 'italic');
  doc.text('Modèle de l’annexe 217-3.A.3 (arrêté du 30/09/2021)', MARGIN + width / 2, 26.5, { align: 'center' });

  const fieldX = MARGIN + width * 0.63;
  const fields = [
    ['Navire', input.vesselName], ['Armement', input.armament], ['Pavillon', input.flagState],
    ['Port d’attache', input.registrationPort], ['Immatriculation', input.registrationNumber],
    ...(input.imoNumber ? [['N° OMI', input.imoNumber]] : []),
  ];
  let fieldY = 34;
  for (const [label, value] of fields) {
    setType(doc, 8.5, 'bold');
    doc.text(`${label} :`, fieldX, fieldY);
    setType(doc, 8.5);
    const lines = wrap(doc, value || '-', width * 0.37 - 30);
    drawLines(doc, lines, fieldX + 30, fieldY);
    fieldY += Math.max(1, lines.length) * LEADING;
  }
  setType(doc, 10, 'bold');
  const dotation = wrap(doc, `Dotation médicale : ${input.medicalDotation}`, width * 0.62 - 9);
  drawLines(doc, dotation, MARGIN + 7, 38);
  setType(doc, 8.5);
  const dateY = 41 + dotation.length * LEADING;
  doc.text(`Date d’émission : ${formatPharmacyDate(input.issuedOn)}`, MARGIN + 7, dateY);
  if (input.medicalEmergencyBag) doc.text('Sac médical d’urgence', MARGIN + 7, dateY + LEADING);
  return Math.max(fieldY, dateY + (input.medicalEmergencyBag ? LEADING : 0)) + 4;
}

function drawPageFooter(doc: jsPDF, width: number, page: number) {
  const y = 190;
  const x = MARGIN + 7;
  doc.setFillColor(RED);
  doc.rect(x, y, 22, 10.5, 'F');
  doc.setDrawColor(BLACK);
  doc.line(x + 22, y, MARGIN + width - 7, y);
  setType(doc, 9, 'normal', WHITE);
  doc.text(String(page), x + 20, y + 4.2, { align: 'right' });
  setType(doc, 8);
  doc.text('DIVISION 217 | ANNEXE 217-3.A.3', MARGIN + width / 2, y + 4.2, { align: 'center' });
  setType(doc, 8, 'italic');
  doc.text('Édition JORF du 16/10/2021', MARGIN + width / 2, y + 8, { align: 'center' });
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

function drawSignature(doc: jsPDF, signature: Uint8Array, stamp: Uint8Array, y: number, width: number, height: number, signer: string[]) {
  const signatureX = MARGIN + width * 0.48;
  const stampX = MARGIN + width * 0.73;
  doc.rect(MARGIN, y, width, height);
  doc.line(signatureX, y, signatureX, y + height);
  doc.line(stampX, y, stampX, y + height);
  setType(doc, 9, 'bold');
  doc.text('Émis par', MARGIN + 3, y + 5);
  doc.text('Signature', signatureX + 3, y + 5);
  doc.text('Cachet de l’entreprise', stampX + 3, y + 5);
  setType(doc, 9);
  drawLines(doc, signer, MARGIN + 3, y + 10);
  drawImage(doc, signature, signatureX + 3, y + 6.5, stampX - signatureX - 6, 16, 'la signature');
  drawImage(doc, stamp, stampX + 3, y + 6.5, MARGIN + width - stampX - 6, 16, 'le cachet de l’entreprise');
}

function rowHeight(lineCount: number) {
  return Math.max(1, lineCount) * LEADING + CELL_PADDING * 2;
}

function renderOrder(input: PharmacyPurchaseOrderPdfInput, stamp: Uint8Array) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
  const width = doc.internal.pageSize.getWidth() - 2 * MARGIN;
  doc.setDrawColor(BLACK);
  doc.setLineWidth(0.18);
  doc.setProperties({ title: 'Bon de commande - Inventaire Pharmacie', subject: input.vesselName, author: input.armament || 'BBTM sas' });
  const groups = groupLines(input);
  const needsReview = input.lines.some((line) => line.quantityNeedsReview);
  setType(doc, FONT_SIZE);
  const signer = wrap(doc, [input.signerName, input.signerFunction].filter(Boolean).join('\n'), width * 0.48 - 6);
  const signatureHeight = Math.max(MIN_SIGNATURE_HEIGHT, 10 + signer.length * LEADING);
  const orderEndHeight = 4 + signatureHeight + (needsReview ? 5 : 0);
  let y = drawPageHeader(doc, input, width);
  let pageHasRows = false;
  const newPage = () => {
    doc.addPage();
    y = drawPageHeader(doc, input, width);
    pageHasRows = false;
  };

  groups.forEach((group, groupIndex) => {
    const columns = group.section === 'medicines' ? medicineColumns : equipmentColumns;
    const headerHeight = rowHeight(Math.max(...columns.map(({ heading }) => heading.split('\n').length)));
    const heading = sections[group.section].heading;
    const sectionTitle = pharmacyDotationKey(group.dotation) === pharmacyDotationKey(input.medicalDotation)
      ? heading : `${group.dotation} - ${heading}`;
    const drawRow = (cells: string[][], height: number, header = false) => {
      let x = MARGIN;
      cells.forEach((lines, index) => {
        const column = columns[index];
        const columnWidth = column.width * width;
        const align = header ? 'center' : column.align ?? 'center';
        doc.rect(x, y, columnWidth, height);
        setType(doc, FONT_SIZE, header || index === columns.length - 1 ? 'bold' : 'normal');
        const baseline = y + (height - lines.length * LEADING) / 2 + 2.9;
        if (lines.length) drawLines(doc, lines, align === 'left' ? x + CELL_PADDING : x + columnWidth / 2, baseline, align);
        x += columnWidth;
      });
      y += height;
    };
    const drawHeading = () => {
      setType(doc, 10, 'bold');
      doc.text(sectionTitle, MARGIN + 7, y + 5);
      y += SECTION_HEIGHT;
      drawRow(columns.map(({ heading: label }) => label.split('\n')), headerHeight, true);
    };
    const categories = [...group.categories].sort(([a], [b]) => a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' }));
    let hasHeading = false;
    categories.forEach(([category, lines], categoryIndex) => {
      setType(doc, FONT_SIZE, 'bold');
      const categoryLines = category ? wrap(doc, category, width - 2 * CELL_PADDING) : [];
      const categoryHeight = categoryLines.length ? rowHeight(categoryLines.length) : 0;
      const drawCategory = () => {
        if (!categoryHeight) return;
        doc.setFillColor(YELLOW);
        doc.rect(MARGIN, y, width, categoryHeight, 'FD');
        setType(doc, FONT_SIZE, 'bold');
        drawLines(doc, categoryLines, MARGIN + CELL_PADDING, y + CELL_PADDING + 2.9);
        y += categoryHeight;
      };
      lines.forEach((line, lineIndex) => {
        const isLastRow = groupIndex === groups.length - 1 && categoryIndex === categories.length - 1 && lineIndex === lines.length - 1;
        const rowBottom = PAGE_BOTTOM - (isLastRow ? orderEndHeight : 0);
        setType(doc, FONT_SIZE);
        const cells = columns.map(({ value, width: columnWidth }, index) => {
          const content = value(line);
          if (!content) return [];
          setType(doc, FONT_SIZE, index === columns.length - 1 ? 'bold' : 'normal');
          return wrap(doc, content, columnWidth * width - 2 * CELL_PADDING);
        });
        const cellLines = Math.max(1, ...cells.map((cell) => cell.length));
        const categoryNeeded = lineIndex === 0;
        const precedingHeight = (hasHeading ? 0 : SECTION_HEIGHT + headerHeight) + (categoryNeeded ? categoryHeight : 0);
        if (pageHasRows && y + precedingHeight + rowHeight(cellLines) > rowBottom) {
          newPage();
          drawHeading();
          drawCategory();
        } else {
          if (!hasHeading) drawHeading();
          if (categoryNeeded) drawCategory();
        }
        hasHeading = true;

        let offset = 0;
        while (offset < cellLines) {
          const capacity = Math.floor((rowBottom - y - 2 * CELL_PADDING) / LEADING);
          if (capacity < 1) throw new Error('Les informations du navire sont trop longues pour le bon de commande.');
          const count = Math.min(cellLines - offset, capacity);
          drawRow(cells.map((cell) => cell.slice(offset, offset + count)), rowHeight(count));
          pageHasRows = true;
          offset += count;
          if (offset < cellLines) {
            newPage();
            drawHeading();
            drawCategory();
          }
        }
      });
    });
    y += 4;
  });

  if (needsReview) {
    setType(doc, 8.5);
    doc.text('* Quantité à vérifier avant envoi.', MARGIN, y + 3);
    y += 5;
  }
  drawSignature(doc, input.signature, stamp, y, width, signatureHeight, signer);
  for (let page = 1; page <= doc.getNumberOfPages(); page += 1) {
    doc.setPage(page);
    drawPageFooter(doc, width, page);
  }
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
  const document = renderOrder(input, stamp);
  return { blob: document.output('blob'), filename: `bon-de-commande-pharmacie-${name}-${input.issuedOn}.pdf` };
}
