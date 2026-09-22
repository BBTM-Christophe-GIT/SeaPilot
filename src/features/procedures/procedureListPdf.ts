import type { RowInput } from 'jspdf-autotable';
import { CHAPTERS, chapterKey } from './procedureChapters';
import type { ProcedureRecord } from './procedureQueries';

export interface ProcedureListPdfInput {
  records: ProcedureRecord[];
  vessel: string;
  library: 'sources' | 'published';
  issuedAt?: Date;
}

export async function buildProcedureListPdf({ records, vessel, library, issuedAt = new Date() }: ProcedureListPdfInput) {
  if (!records.length) throw new Error('Sélectionnez au moins un document.');
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const date = issuedAt.toLocaleDateString('fr-FR');
  const libraryLabel = library === 'sources' ? 'Documents de travail privés' : 'PDF publiés';
  const body: RowInput[] = CHAPTERS.flatMap(([key, label]) => {
    const chapterRecords = records.filter((record) => chapterKey(record.ismChapter) === key)
      .sort((a, b) => a.procedureCode.localeCompare(b.procedureCode, 'fr', { numeric: true }) || a.title.localeCompare(b.title, 'fr'));
    if (!chapterRecords.length) return [];
    return [
      [{ content: label, colSpan: 4, styles: { fontStyle: 'bold', fillColor: [225, 235, 244], textColor: [15, 38, 63] } }],
      ...chapterRecords.map((record) => [
        record.procedureCode || record.documentNumber || '-', record.title,
        record.versionLabel || record.revisionLabel || '-',
        record.diffusionOn ? new Date(`${record.diffusionOn}T12:00:00`).toLocaleDateString('fr-FR') : '-',
      ]),
    ] satisfies RowInput[];
  });
  // Prefer the most comfortable one-page layout, preserving a readable lower bound.
  const layouts = [
    { fontSize: 9, padding: 1.4 }, { fontSize: 8.5, padding: 1 },
    { fontSize: 8, padding: 0.7 }, { fontSize: 7.5, padding: 0.5 }, { fontSize: 7, padding: 0.4 },
  ];
  let pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  for (const layout of layouts) {
    pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    autoTable(pdf, {
      startY: 26, margin: { top: 26, left: 10, right: 10, bottom: 12 },
      head: [['Référence', 'Document', 'Version', 'Diffusion']], body,
      styles: { font: 'helvetica', fontSize: layout.fontSize, cellPadding: { top: layout.padding, bottom: layout.padding, left: 1.5, right: 1.5 }, overflow: 'linebreak', valign: 'top', textColor: [28, 43, 59] },
      headStyles: { fillColor: [15, 38, 63], textColor: 255 },
      alternateRowStyles: { fillColor: [247, 249, 252] },
      columnStyles: { 0: { cellWidth: 27 }, 1: { cellWidth: 124 }, 2: { cellWidth: 15 }, 3: { cellWidth: 24 } },
      rowPageBreak: 'avoid',
      didDrawPage: () => {
        pdf.setFillColor(15, 38, 63); pdf.rect(0, 0, 210, 3, 'F');
        pdf.setTextColor(15, 38, 63); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(14);
        pdf.text('LISTE DES DOCUMENTS QHSE', 10, 12);
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
        pdf.text(`${records.length} document(s) - ${libraryLabel}`, 10, 20);
        pdf.text(`Éditée le ${date}`, 200, 20, { align: 'right' });
      },
    });
    if (pdf.getNumberOfPages() === 1) break;
  }
  const total = pdf.getNumberOfPages();
  for (let page = 1; page <= total; page += 1) {
    pdf.setPage(page); pdf.setFontSize(7); pdf.setTextColor(100);
    pdf.text('SeaPilot - Liste documentaire QHSE', 10, 291);
    pdf.text(`${page} / ${total}`, 200, 291, { align: 'right' });
  }
  const suffix = (vessel || 'Tous les navires').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  return { blob: pdf.output('blob'), filename: `liste-documents-qhse-${suffix}.pdf` };
}

export async function downloadProcedureListPdf(input: ProcedureListPdfInput): Promise<void> {
  const { blob, filename } = await buildProcedureListPdf(input);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename;
  document.body.append(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
