import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import {
  EMPLOYMENT_CONTRACT_FIELDS, employmentContractValues, validateEmploymentContractDraft,
  type EmploymentContractDraft,
} from './employmentContractModel';
import { EMPLOYMENT_CONTRACT_PDF_LAYOUT } from './employmentContractPdfLayout';

export interface EmploymentContractEmployerSignature {
  bytes: Uint8Array;
  mimeType: 'image/png' | 'image/jpeg';
}

interface FieldRectangle {
  key: string; page: number; x: number; top: number; width: number; height: number;
  size: number; font: 'regular' | 'bold' | 'italic';
}

function printable(value: string): string {
  return value.replace(/[\u00a0\u202f]/g, ' ').replace(/\u2011/g, '-').replace(/\r\n|\r/g, '\n');
}

function wrap(value: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of value.split('\n')) {
    let line = '';
    for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
      if (font.widthOfTextAtSize(line ? `${line} ${word}` : word, size) <= width) {
        line = line ? `${line} ${word}` : word;
        continue;
      }
      if (line) { lines.push(line); line = ''; }
      for (const character of word) {
        if (line && font.widthOfTextAtSize(line + character, size) > width) { lines.push(line); line = ''; }
        line += character;
      }
    }
    lines.push(line);
  }
  return lines;
}

function drawField(page: PDFPage, slot: FieldRectangle, value: string, font: PDFFont): void {
  const text = printable(value);
  const label = EMPLOYMENT_CONTRACT_FIELDS.find((field) => field.key === slot.key)?.label
    || (slot.key === 'fullName' ? 'Prénom et nom' : slot.key === 'collectiveClause' ? 'Convention collective applicable' : slot.key);
  try {
    for (const size of slot.size >= 10 ? [slot.size, slot.size - .5, slot.size - 1] : [slot.size]) {
      const lines = wrap(text, font, size, slot.width);
      const lineHeight = size * 1.15;
      const textHeight = font.heightAtSize(size) + (lines.length - 1) * lineHeight;
      if (textHeight > slot.height + .01) continue;
      const top = slot.top + (slot.height - textHeight) / 2;
      lines.forEach((line, index) => page.drawText(line, {
        x: slot.x, y: page.getHeight() - top - font.heightAtSize(size, { descender: false }) - index * lineHeight,
        size, font, color: rgb(0, 0, 0),
      }));
      return;
    }
  } catch {
    throw new Error(`${label} : le texte contient un caractère non pris en charge par le modèle PDF.`);
  }
  throw new Error(`${label} : le texte est trop long pour le modèle PDF BBTM. Corrigez la fiche RH avant de générer le contrat.`);
}

/** Fill the original unsigned BBTM layout and append the private Benjamin BON signature. */
export async function generateEmploymentContractPdf(
  draft: EmploymentContractDraft,
  employerSignature: EmploymentContractEmployerSignature,
  templateBytes?: ArrayBuffer | Uint8Array,
): Promise<Blob> {
  const signedDraft = {
    ...draft,
    signatureDate: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(new Date()),
    employerRepresentative: 'Benjamin BON',
  };
  const issues = validateEmploymentContractDraft(signedDraft);
  if (issues.length) throw new Error(issues.join('\n'));
  if (!employerSignature.bytes?.length || employerSignature.bytes.length > 2 * 1024 * 1024
    || !['image/png', 'image/jpeg'].includes(employerSignature.mimeType)) {
    throw new Error('La signature enregistrée de Benjamin BON doit être une image PNG ou JPEG valide de moins de 2 Mo.');
  }
  let bytes = templateBytes;
  if (!bytes) {
    const response = await fetch(`${import.meta.env.BASE_URL}templates/employment-contract-${draft.type.toLowerCase()}-bbtm.pdf`);
    if (!response.ok) throw new Error('Le modèle PDF BBTM du contrat est indisponible.');
    bytes = await response.arrayBuffer();
  }
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  if (pdf.getPageCount() !== 3) throw new Error('Le modèle PDF BBTM doit contenir ses trois pages.');
  const [regular, bold, italic] = await Promise.all([
    pdf.embedFont(StandardFonts.Helvetica), pdf.embedFont(StandardFonts.HelveticaBold), pdf.embedFont(StandardFonts.HelveticaOblique),
  ]);
  const fonts = { regular, bold, italic };
  const values: Record<string, string> = {
    ...employmentContractValues(signedDraft),
    fullName: `${draft.firstName.trim()} ${draft.lastName.trim().toLocaleUpperCase('fr-FR')}`,
    collectiveClause: `La ${draft.collectiveAgreement.trim()}.`,
  };
  values.grossMonthlySalary += ' €';
  const layout = EMPLOYMENT_CONTRACT_PDF_LAYOUT[draft.type];
  for (const slot of layout.slots) {
    let value = values[slot.key];
    if (slot.key === 'employerRepresentative' && slot.page === 0) value = 'Benjamin BON - Président';
    drawField(pdf.getPage(slot.page), slot, value, fonts[slot.font]);
  }
  let signature;
  try {
    signature = employerSignature.mimeType === 'image/png'
      ? await pdf.embedPng(employerSignature.bytes) : await pdf.embedJpg(employerSignature.bytes);
  } catch { throw new Error('La signature enregistrée de Benjamin BON est illisible.'); }
  const box = layout.signature;
  const scaled = signature.scaleToFit(box.width, box.height);
  const page = pdf.getPage(box.page);
  page.drawImage(signature, { x: box.x + (box.width - scaled.width) / 2,
    y: page.getHeight() - box.top - scaled.height, width: scaled.width, height: scaled.height });
  pdf.setTitle(`Contrat ${draft.type} - ${values.fullName}`);
  pdf.setAuthor('BBTM'); pdf.setCreator('SeaPilot');
  pdf.setSubject(`Contrat de travail ${draft.type}`);
  pdf.setCreationDate(new Date()); pdf.setModificationDate(new Date());
  return new Blob([new Uint8Array(await pdf.save())], { type: 'application/pdf' });
}
