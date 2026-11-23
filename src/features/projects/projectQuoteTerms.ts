import type { jsPDF } from 'jspdf';
import commercialTerms from './assets/quote-commercial-terms.txt?raw';

export const QUOTE_FUEL_EXCLUDED = "A la charge de l'affréteur - Non inclus dans le prix de la prestation";
export const QUOTE_FUEL_INCLUDED = 'Inclus dans le prix de la prestation';

export function appendProjectQuoteTerms(pdf: jsPDF, reference: string, fuelTerms: string): void {
  const terms = fuelTerms === QUOTE_FUEL_INCLUDED
    ? commercialTerms
      .replace('Le fuel est approvisionné par le propriétaire et refacturé Ad Cost à l’affréteur.', 'Le fuel est approvisionné par le propriétaire et inclus dans le prix de la prestation.')
      .replace('Avitailler le fuel pour le compte de l’affréteur.', 'Avitailler le fuel inclus dans le prix de la prestation.')
    : commercialTerms;
  const sections = terms.trim().split(/\r?\n(?=Article \d+\s*:)/);
  const lineHeight = 4.2;
  let y = 0;

  function startPage() {
    pdf.addPage();
    pdf.setFillColor(9, 31, 50);
    pdf.rect(0, 0, 210, 24, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(12);
    pdf.text('CONDITIONS COMMERCIALES', 14, 15);
    pdf.setFontSize(9);
    pdf.text(reference, 196, 15, { align: 'right' });
    y = 36;
  }

  startPage();
  for (const section of sections) {
    const [heading, ...paragraphs] = section.split(/\r?\n/).map((line) => line.trim());
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    const lines = paragraphs.filter(Boolean).flatMap((paragraph) => (
      pdf.splitTextToSize(paragraph.replace(/\t+/g, ' '), 182) as string[]
    ));
    if (y + 6 + lines.length * lineHeight > 282) startPage();
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(18, 61, 104);
    pdf.setFontSize(9.5);
    pdf.text(heading, 14, y);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(23, 38, 58);
    pdf.setFontSize(9);
    pdf.text(lines, 14, y + 6, { lineHeightFactor: lineHeight / (9 / pdf.internal.scaleFactor) });
    y += 10 + lines.length * lineHeight;
  }
}
