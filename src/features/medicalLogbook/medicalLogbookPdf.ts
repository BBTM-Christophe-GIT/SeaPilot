import type { jsPDF as PdfDocument } from 'jspdf';
import type { MedicalEntry, MedicalVessel } from './medicalLogbookModel';

const MARGIN = 12;
const LINE_HEIGHT = 3.8;
const CELL_PADDING = 2;
const MIN_ROW_HEIGHT = 18;
const SIGNATURE_HEIGHT = 10;
const WIDTHS = [20, 15, 39, 63, 63, 36, 37];
const HEADERS = [
  'Date', 'Heure', 'Nom du patient', 'Blessure / maladie',
  'Traitement / médicaments administrés', 'Premiers soins dispensés par', 'Signature du secouriste',
];

// Helvetica intégrée permet les libellés français sans téléchargement de police.
const printable = (value: string) => value
  .replace(/[’‘]/g, "'").replace(/[–—]/g, '-')
  .replace(/\u00a0/g, ' ').replace(/\t/g, '   ')
  .split('').filter((character) => character.charCodeAt(0) >= 32 || character === '\n' || character === '\r').join('');

function drawSignature(pdf: PdfDocument, png: Uint8Array, x: number, y: number, width: number) {
  const properties = pdf.getImageProperties(png);
  if (properties.fileType !== 'PNG' || !properties.width || !properties.height) {
    throw new Error('Une signature enregistrée est illisible. Le PDF ne peut pas être généré.');
  }
  const scale = Math.min(width / properties.width, SIGNATURE_HEIGHT / properties.height);
  pdf.addImage(png, 'PNG', x, y, properties.width * scale, properties.height * scale, undefined, 'FAST');
}

export async function createMedicalLogbookPdf(
  vessel: MedicalVessel,
  entries: MedicalEntry[],
  { blank = false, year, signatureImages }: {
    blank?: boolean;
    year?: string;
    /** Versions immuables des signatures PNG téléchargées par le client Storage authentifié. */
    signatureImages?: ReadonlyMap<number, Uint8Array>;
  } = {},
): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ format: 'a4', orientation: 'landscape', unit: 'mm', compress: true });
  pdf.setProperties({ title: 'Registre médical', subject: printable(vessel.name), creator: 'SeaPilot' });
  const right = pdf.internal.pageSize.getWidth() - MARGIN;
  const bottom = pdf.internal.pageSize.getHeight() - 20;
  let bodyStart = 0;
  let y = 0;

  const startPage = () => {
    pdf.setDrawColor(0, 0, 0); pdf.setTextColor(0, 0, 0); pdf.setFillColor(0, 0, 0); pdf.setLineWidth(0.2);
    pdf.line(MARGIN, 8, right, 8);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13);
    pdf.text('Registre médical', MARGIN, 15);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
    const details = `Navire : ${printable(vessel.name)}${vessel.registration_number ? ` | Immatriculation : ${printable(vessel.registration_number)}` : ''}${year ? ` | Année : ${printable(year)}` : ''}`;
    const lines: string[] = pdf.splitTextToSize(details, right - MARGIN);
    pdf.text(lines, MARGIN, 22);
    const headerY = 25 + lines.length * 4;
    const headerHeight = 13;
    let x = MARGIN;
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8);
    HEADERS.forEach((label, index) => {
      pdf.rect(x, headerY, WIDTHS[index], headerHeight);
      const heading: string[] = pdf.splitTextToSize(label, WIDTHS[index] - CELL_PADDING * 2);
      pdf.text(heading, x + WIDTHS[index] / 2, headerY + 4, { align: 'center', lineHeightFactor: 1.3 });
      x += WIDTHS[index];
    });
    bodyStart = headerY + headerHeight;
    y = bodyStart;
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5);
  };

  const drawRow = (columns: string[][], offset: number, count: number, height: number, signature?: Uint8Array) => {
    let x = MARGIN;
    columns.forEach((lines, index) => {
      pdf.setDrawColor(0, 0, 0); pdf.setLineWidth(0.15); pdf.rect(x, y, WIDTHS[index], height);
      const visibleLines = lines.slice(offset, offset + count);
      if (offset > 0 && index < 3 && !visibleLines.length) {
        visibleLines.push(...lines.slice(0, count));
      }
      pdf.setTextColor(0, 0, 0); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5);
      visibleLines.forEach((line, lineIndex) => pdf.text(line, x + CELL_PADDING, y + CELL_PADDING + 2.8 + lineIndex * LINE_HEIGHT));
      if (index === 6 && signature) {
        drawSignature(pdf, signature, x + CELL_PADDING, y + height - SIGNATURE_HEIGHT - CELL_PADDING, WIDTHS[index] - CELL_PADDING * 2);
      }
      x += WIDTHS[index];
    });
    y += height;
  };

  startPage();
  if (blank) {
    const rowCount = Math.floor((bottom - bodyStart) / MIN_ROW_HEIGHT);
    const rowHeight = (bottom - bodyStart) / rowCount;
    for (let row = 0; row < rowCount; row++) {
      drawRow(HEADERS.map(() => []), 0, 0, rowHeight);
      let x = MARGIN;
      WIDTHS.forEach((width, column) => {
        if ([2, 3, 4, 5].includes(column)) {
          pdf.setDrawColor(190, 190, 190); pdf.setLineWidth(0.1);
          for (let ruledY = y - rowHeight + 6; ruledY < y - 2; ruledY += 5) pdf.line(x + 1, ruledY, x + width - 1, ruledY);
        }
        x += width;
      });
    }
  } else {
    // Le jeu fourni est déjà filtré ; les autres navires sont exclus par précaution.
    const selected = entries.filter((entry) => entry.vessel_id === vessel.id && (!year || year === 'all' || entry.occurred_on.startsWith(`${year}-`)));
    for (const entry of selected) {
      const values = [
        entry.occurred_on.split('-').reverse().join('/'), entry.occurred_time.slice(0, 5),
        entry.patient_name, entry.injury_illness, entry.treatment_medicines, entry.first_aider_name, entry.signature_name,
      ];
      const columns = values.map((value, index) => pdf.splitTextToSize(printable(value), WIDTHS[index] - CELL_PADDING * 2) as string[]);
      const maxLines = Math.max(1, ...columns.map((lines) => lines.length));
      const signature = signatureImages?.get(entry.id);
      if ((entry.signature_version_id || entry.signature_snapshot) && !signature) {
        throw new Error(`La signature enregistrée de ${entry.signature_name} est indisponible. Le PDF ne peut pas être généré.`);
      }
      const signed = !!signature;
      const finalExtra = signed ? SIGNATURE_HEIGHT + 2 : 0;
      const completeHeight = Math.max(MIN_ROW_HEIGHT, maxLines * LINE_HEIGHT + CELL_PADDING * 2 + finalExtra);
      if (y > bodyStart && completeHeight > bottom - y) { pdf.addPage(); startPage(); }
      let offset = 0;
      while (offset < maxLines) {
        const remaining = maxLines - offset;
        const available = bottom - y;
        const finalHeight = Math.max(MIN_ROW_HEIGHT, remaining * LINE_HEIGHT + CELL_PADDING * 2 + finalExtra);
        if (finalHeight <= available) {
          drawRow(columns, offset, remaining, finalHeight, signature);
          offset = maxLines;
        } else {
          const linesThatFit = Math.floor((available - CELL_PADDING * 2) / LINE_HEIGHT);
          if (linesThatFit < 1) { pdf.addPage(); startPage(); continue; }
          // Réserver au moins une ligne au dernier fragment avec sa signature.
          const count = Math.min(linesThatFit, remaining - 1);
          if (count < 1) { pdf.addPage(); startPage(); continue; }
          drawRow(columns, offset, count, count * LINE_HEIGHT + CELL_PADDING * 2);
          offset += count;
          pdf.addPage(); startPage();
        }
      }
    }
    if (!selected.length) {
      drawRow([[''], [''], ['Aucune entrée'], [], [], [], []], 0, 1, MIN_ROW_HEIGHT);
    }
  }

  const total = pdf.getNumberOfPages();
  for (let page = 1; page <= total; page++) {
    pdf.setPage(page); pdf.setDrawColor(0, 0, 0); pdf.setLineWidth(0.15);
    pdf.line(MARGIN, bottom + 6, right, bottom + 6);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(0, 0, 0);
    pdf.text('Registre médical - Confidentiel', MARGIN, bottom + 11);
    pdf.text(`${page} / ${total}`, right, bottom + 11, { align: 'right' });
  }
  return pdf.output('blob');
}

export function downloadMedicalLogbookPdf(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
