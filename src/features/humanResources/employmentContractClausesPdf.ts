import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { EmploymentContractDraft } from './employmentContractModel';
import { EMPLOYMENT_CONTRACT_CLAUSES } from './employmentContractClauses';

export interface ContractTextRun { text: string; bold: boolean; symbol?: boolean }
interface Clause { kind: 'intro' | 'heading' | 'paragraph'; gapBefore: boolean; marker: string; runs: readonly ContractTextRun[] }
interface Fonts { regular: PDFFont; bold: PDFFont; italic: PDFFont; symbol: PDFFont }
interface Word { runs: ContractTextRun[]; width: number }

function sliceRuns(runs: readonly ContractTextRun[], start: number, end: number): ContractTextRun[] {
  let offset = 0;
  return runs.flatMap((run) => {
    const begin = Math.max(0, start - offset), finish = Math.min(run.text.length, end - offset);
    offset += run.text.length;
    return finish > begin ? [{ ...run, text: run.text.slice(begin, finish) }] : [];
  });
}

function replaceRuns(runs: readonly ContractTextRun[], pattern: RegExp, replacement: (match: RegExpMatchArray) => string): ContractTextRun[] {
  const text = runs.map((run) => run.text).join('');
  const output: ContractTextRun[] = [];
  let start = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index!;
    output.push(...sliceRuns(runs, start, index));
    output.push({ text: replacement(match), bold: sliceRuns(runs, index, index + match[0].length).some((run) => run.bold) });
    start = index + match[0].length;
  }
  output.push(...sliceRuns(runs, start, text.length));
  return output;
}

/** Substitute references, preserving the emphasis of each original Word run. */
export function employmentContractClauseRuns(type: EmploymentContractDraft['type'], values: Record<string, string>): Clause[] {
  const references: Record<string, string> = {
    '1': values.startDate, '1a': values.startDate, '1b': values.endDate,
    '9': values.functionLabel, '10': values.vesselNames, '11': values.enimCategory,
    '12': values.enimFunctionCode, '13': values.collectiveAgreement, '14': values.grossMonthlySalary,
  };
  return EMPLOYMENT_CONTRACT_CLAUSES[type].map((clause) => {
    let runs = replaceRuns(clause.runs, /\{\{([A-Za-z]+)\}\}/g, (match) => values[match[1]] || '');
    runs = replaceRuns(runs, /«\s*l[’']employé\s*»/giu, () => values.fullName);
    runs = replaceRuns(runs, /(?<!\p{L})l[’']employé(?!\p{L})/giu, () => values.fullName);
    // The literal "trois (3) mois" is the trial duration, not a first-page reference.
    runs = replaceRuns(runs, /\((1a|1b|1|9|10|11|12|13|14)\)/g, (match) => references[match[1]]);
    return { ...clause, runs: runs.flatMap((run) => run.text.replace(/[\u00a0\u202f]/g, ' ').replace(/\u2011/g, '-').split(/([≤≥])/g)
      .filter(Boolean).map((text) => ({ ...run, text, symbol: text === '≤' || text === '≥' }))) };
  });
}

const fontFor = (run: ContractTextRun, fonts: Fonts) => run.symbol ? fonts.symbol : fonts[run.bold ? 'bold' : 'regular'];

function richLines(runs: readonly ContractTextRun[], size: number, width: number, fonts: Fonts): Word[][] {
  const text = runs.map((run) => run.text).join('');
  const space = fonts.regular.widthOfTextAtSize(' ', size);
  const lines: Word[][] = [];
  let line: Word[] = [], used = 0;
  for (const match of text.matchAll(/\S+/g)) {
    const parts = sliceRuns(runs, match.index!, match.index! + match[0].length);
    const wordWidth = parts.reduce((sum, run) => sum + fontFor(run, fonts).widthOfTextAtSize(run.text, size), 0);
    if (line.length && used + space + wordWidth > width) { lines.push(line); line = []; used = 0; }
    if (wordWidth <= width) {
      line.push({ runs: parts, width: wordWidth }); used += (line.length > 1 ? space : 0) + wordWidth;
    } else {
      // Long unbroken surnames and references also flow without leaving the column.
      let chunk: ContractTextRun[] = [], chunkWidth = 0;
      for (const run of parts) for (const character of run.text) {
        const characterWidth = fontFor(run, fonts).widthOfTextAtSize(character, size);
        if (chunkWidth + characterWidth > width) {
          line.push({ runs: chunk, width: chunkWidth }); lines.push(line); line = []; used = 0;
          chunk = []; chunkWidth = 0;
        }
        chunk.push({ ...run, text: character }); chunkWidth += characterWidth;
      }
      if (chunk.length) { line.push({ runs: chunk, width: chunkWidth }); used = chunkWidth; }
    }
  }
  if (line.length) lines.push(line);
  return lines;
}

function lineHeight(lines: Word[][], size: number, fonts: Fonts) {
  return fonts.regular.heightAtSize(size) + Math.max(0, lines.length - 1) * size * 1.18;
}

function drawLines(page: PDFPage, lines: Word[][], x: number, top: number, width: number, size: number, fonts: Fonts, justify = false, color = rgb(0, 0, 0)) {
  const space = fonts.regular.widthOfTextAtSize(' ', size);
  lines.forEach((line, lineIndex) => {
    const used = line.reduce((sum, word) => sum + word.width, 0) + Math.max(0, line.length - 1) * space;
    const gap = space + (justify && lineIndex < lines.length - 1 && line.length > 1 ? (width - used) / (line.length - 1) : 0);
    let left = x;
    line.forEach((word, index) => {
      if (index) left += gap;
      for (const run of word.runs) {
        const font = fontFor(run, fonts);
        page.drawText(run.text, { x: left, y: page.getHeight() - top - fonts.regular.heightAtSize(size, { descender: false }) - lineIndex * size * 1.18, size, font, color });
        left += font.widthOfTextAtSize(run.text, size);
      }
    });
  });
}

/** Reflow the source clauses in the original two-column typography as values grow. */
export async function renderEmploymentContractClauses(pdf: PDFDocument, draft: EmploymentContractDraft, values: Record<string, string>, fonts: Fonts) {
  const clauses = employmentContractClauseRuns(draft.type, values);
  const continuation = await PDFDocument.create();
  const [blank] = await continuation.copyPages(pdf, [2]); continuation.addPage(blank);
  const left = 71.3, right = 302.8, width = 221.35, bottom = 776;
  const blue = rgb(47 / 255, 84 / 255, 150 / 255);
  let pageIndex = 1, column = 0, sectionNumber = 0;
  let columnTop: number, top: number;
  let usedBottom: number[];
  const ensurePage = async (index: number) => {
    if (index < pdf.getPageCount()) return;
    const [page] = await pdf.copyPages(continuation, [0]); pdf.addPage(page);
    page.drawRectangle({ x: 510, y: 30, width: 18, height: 20, color: rgb(1, 1, 1) });
    page.drawText(String(index + 1), { x: 518, y: 40, size: 11, font: fonts.regular, color: rgb(0, .49, 1) });
  };
  const nextColumn = async () => {
    if (!column) column = 1;
    else { pageIndex++; column = 0; columnTop = 120; usedBottom = [columnTop, columnTop]; await ensurePage(pageIndex); }
    top = columnTop;
  };
  const first = pdf.getPage(1);
  const title = 'CLAUSES GÉNÉRALES';
  first.drawText(title, { x: (first.getWidth() - fonts.bold.widthOfTextAtSize(title, 11)) / 2,
    y: first.getHeight() - 120 - fonts.bold.heightAtSize(11, { descender: false }), font: fonts.bold, size: 11 });
  const intro = clauses.find((clause) => clause.kind === 'intro')!;
  const introLines = richLines(intro.runs, 10, 452.85, fonts);
  drawLines(first, introLines, left, 144, 452.85, 10, fonts, true);
  columnTop = 144 + lineHeight(introLines, 10, fonts) + 17; top = columnTop; usedBottom = [top, top];

  const body = clauses.filter((item) => item.kind !== 'intro');
  for (const [clauseIndex, clause] of body.entries()) {
    const heading = clause.kind === 'heading';
    const size = heading ? 10 : 8;
    const indent = heading ? 40 : clause.marker ? 14 : 0;
    const runs = heading ? clause.runs.map((run) => ({ ...run, bold: true })) : clause.runs;
    const lines = richLines(runs, size, width - indent, fonts);
    const gap = top === columnTop ? 0 : heading ? 9 : clause.gapBefore ? 7 : 1.2;
    const height = lineHeight(lines, size, fonts);
    const following = heading ? body[clauseIndex + 1] : undefined;
    const followingHeight = following ? lineHeight(richLines(following.runs, 8, width - (following.marker ? 14 : 0), fonts), 8, fonts) + 2 : 0;
    // The following paragraph is kept whole, so keep its heading with it too.
    if (top + gap + height + followingHeight > bottom) await nextColumn();
    else top += gap;
    const page = pdf.getPage(pageIndex), x = column ? right : left;
    if (heading) {
      sectionNumber++;
      page.drawText(`${sectionNumber}.`, { x, y: page.getHeight() - top - fonts.bold.heightAtSize(size, { descender: false }), size, font: fonts.bold, color: blue });
    } else if (clause.marker) {
      page.drawText(clause.marker, { x, y: page.getHeight() - top - fonts.regular.heightAtSize(size, { descender: false }), size, font: fonts.regular });
    }
    drawLines(page, lines, x + indent, top, width - indent, size, fonts,
      !heading && !clause.marker && !clause.runs[0]?.text.trim().startsWith('-'), heading ? blue : rgb(0, 0, 0));
    top += height; usedBottom[column] = top;
  }

  const tableWidth = 452.85, cellWidth = tableWidth / 2;
  const employeeLines = richLines([{ text: values.fullName, bold: false }], 9, cellWidth - 12, fonts);
  const italicFonts = { ...fonts, regular: fonts.italic };
  const employeeSignatureLines = richLines([{ text: values.fullName, bold: false }], 9, cellWidth - 12, italicFonts);
  const header = Math.max(16, lineHeight(employeeLines, 9, fonts) + 6), tableHeight = header + 107;
  let signatureTop = Math.max(185, Math.max(...usedBottom) + 27);
  if (pageIndex < 2) { pageIndex = 2; signatureTop = 185; }
  else if (signatureTop + 20 + tableHeight > bottom) { pageIndex++; signatureTop = 150; await ensurePage(pageIndex); }
  const page = pdf.getPage(pageIndex);
  page.drawText(`${sectionNumber + 1}.`, { x: left, y: page.getHeight() - signatureTop - 8, size: 10, font: fonts.bold, color: blue });
  page.drawText('Signatures', { x: left + 40, y: page.getHeight() - signatureTop - 8, size: 10, font: fonts.bold, color: blue });
  const tableTop = signatureTop + 20;
  page.drawRectangle({ x: left, y: page.getHeight() - tableTop - tableHeight, width: tableWidth, height: tableHeight, borderWidth: .6, borderColor: rgb(0, 0, 0) });
  page.drawLine({ start: { x: left + cellWidth, y: page.getHeight() - tableTop }, end: { x: left + cellWidth, y: page.getHeight() - tableTop - tableHeight }, thickness: .6 });
  page.drawLine({ start: { x: left, y: page.getHeight() - tableTop - header }, end: { x: left + tableWidth, y: page.getHeight() - tableTop - header }, thickness: .6 });
  const text = (value: string, x: number, textTop: number, italic = false, size = 10) => page.drawText(value, {
    x, y: page.getHeight() - textTop - fonts.regular.heightAtSize(size, { descender: false }), size, font: italic ? fonts.italic : fonts.regular,
  });
  text('Pour la compagnie', left + 6, tableTop + 3);
  drawLines(page, employeeLines, left + cellWidth + 6, tableTop + 3, cellWidth - 12, 9, fonts);
  text('Benjamin BON', left + 6, tableTop + header + 4, true);
  text(`Le ${values.signatureDate}`, left + 6, tableTop + header + 17, false, 9);
  drawLines(page, employeeSignatureLines, left + cellWidth + 6, tableTop + header + 4, cellWidth - 12, 9, italicFonts);
  text('Avec mention « lu et approuvé »', left + cellWidth + 6,
    tableTop + header + 8 + lineHeight(employeeSignatureLines, 9, italicFonts), true, 9);
  return { page: pageIndex, x: left + 14, top: tableTop + header + 37, width: 115, height: 60 };
}
