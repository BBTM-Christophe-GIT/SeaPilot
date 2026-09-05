import type { QhseReportDefinition } from './qhseReportCatalog';
import type { QhseReportOptions, QhseReportSnapshot } from './qhseReportData';
import { buildQhseReportPdf } from './qhseReportPdf';

export interface PreparedQhsePage { id: string; reportId: string; reportTitle: string; sourceIndex: number; documentIndex: number; number: number }
export interface PreparedQhseReport { pages: PreparedQhsePage[]; documents: Uint8Array[]; indexContext?: { report: QhseReportDefinition; snapshot: QhseReportSnapshot; options: QhseReportOptions } }

export async function prepareQhseReport(
  reports: readonly QhseReportDefinition[], snapshot: QhseReportSnapshot, options: QhseReportOptions,
  progress?: (done: number, total: number) => void,
): Promise<PreparedQhseReport> {
  const { PDFDocument } = await import('pdf-lib');
  const prepared: PreparedQhseReport = { pages: [], documents: [] };
  for (const [documentIndex, report] of reports.entries()) {
    if (report.id === 'menu') prepared.indexContext = { report, snapshot, options };
    const blob = await buildQhseReportPdf(report, snapshot, { ...options, omitPageNumbers: true });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const doc = await PDFDocument.load(bytes);
    prepared.documents.push(bytes);
    for (let sourceIndex = 0; sourceIndex < doc.getPageCount(); sourceIndex++) {
      prepared.pages.push({ id: `${report.id}:${sourceIndex}`, reportId: report.id, reportTitle: report.title, sourceIndex, documentIndex, number: prepared.pages.length + 1 });
    }
    progress?.(documentIndex + 1, reports.length);
  }
  return prepared;
}

/** Exact physical-page selection, preserving vector charts and numbering only the final export. */
export async function composeQhseReport(prepared: PreparedQhseReport, selectedIds: readonly string[]): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const selected = new Set(selectedIds);
  const pages = prepared.pages.filter((p) => selected.has(p.id));
  if (!pages.length) throw new Error('Sélectionnez au moins une page.');
  const output = await PDFDocument.create();
  const font = await output.embedFont(StandardFonts.Helvetica);
  const sources = await Promise.all(prepared.documents.map((bytes) => PDFDocument.load(bytes)));
  const indexPage = pages.find((page) => page.reportId === 'menu');
  if (indexPage && prepared.indexContext) {
    const { report, snapshot, options } = prepared.indexContext;
    const seen = new Set<string>();
    const contents = pages.flatMap((page, index) => {
      if (page.reportId === 'menu' || seen.has(page.reportId)) return [];
      seen.add(page.reportId); return [{ title: page.reportTitle, page: index + 1 }];
    });
    const blob = await buildQhseReportPdf(report, snapshot, { ...options, omitPageNumbers: true, contents });
    sources[indexPage.documentIndex] = await PDFDocument.load(await blob.arrayBuffer());
  }
  for (const [index, page] of pages.entries()) {
    const [copied] = await output.copyPages(sources[page.documentIndex], [page.sourceIndex]);
    output.addPage(copied);
    const width = copied.getWidth();
    const label = String(index + 1);
    copied.drawText(label, { x: width - 14 * 72 / 25.4 - font.widthOfTextAtSize(label, 6), y: 7 * 72 / 25.4, size: 6, font, color: rgb(.31, .37, .44) });
  }
  output.setTitle('Rapport QHSE — sélection de pages'); output.setAuthor('BBTM'); output.setCreator('BBTM');
  const bytes = await output.save();
  return new Blob([new Uint8Array(bytes).buffer], { type: 'application/pdf' });
}
