import type { jsPDF as PdfDocument } from 'jspdf';
import type { CellInput, UserOptions } from 'jspdf-autotable';
import { CONDITION_LABELS, INSPECTOR, entryControlKeys, entryUnsatisfactory, formatLiftingDate, type InspectionEntry, type LiftingInspection } from './liftingModel';
import { ACCESSORIES, TOWING_TYPES, CONTROL_CODES, groupByAccessory, type AccessoryDefinition, type ControlText } from './liftingControls';

const NAVY: [number, number, number] = [19, 51, 66];
const RED: [number, number, number] = [185, 48, 42];
const GREEN: [number, number, number] = [35, 110, 77];
const clean = (s: string | null | undefined) => (s || '').replace(/[’‘]/g, "'").replace(/[–—]/g, '-').replace(/\u00a0/g, ' ');
const decisionEn = { pending: 'Not inspected', good: 'Remain in service', repair: 'Remain in service after repair', withdrawn: 'Scrap', not_present: 'Not presented' };
export function liftingReportFilename(report: LiftingInspection, draft = false): string {
  return `${report.vessel_snapshot.acronym || report.vessel_snapshot.name} - ${report.kind === 'towing' ? 'Registre des remorques' : 'Registre des Apparaux de Levage'} - ${report.issued_on} - LEV-${report.id}${draft ? ' - BROUILLON' : ''}.pdf`;
}
function resultIcon(pdf: PdfDocument, x: number, y: number, defect: boolean, size = 1.7) {
  pdf.setDrawColor(...(defect ? RED : GREEN)); pdf.setLineWidth(0.35); pdf.circle(x, y, size);
  if (defect) { pdf.line(x - size * .45, y - size * .45, x + size * .45, y + size * .45); pdf.line(x + size * .45, y - size * .45, x - size * .45, y + size * .45); }
  else { pdf.line(x - size * .55, y, x - size * .12, y + size * .4); pdf.line(x - size * .12, y + size * .4, x + size * .6, y - size * .4); }
}
// Measure and draw French then italic English in the same table cell, without clipping either language.
function bilingualLayout(pdf: PdfDocument, content: ControlText, width: number, fontSize: number) {
  pdf.setFontSize(fontSize); pdf.setFont('helvetica', 'normal');
  const fr = pdf.splitTextToSize(clean(content.fr), width) as string[];
  pdf.setFont('helvetica', 'italic'); const en = pdf.splitTextToSize(clean(content.en), width) as string[];
  const line = fontSize * .3528 * 1.13;
  return { fr, en, line, height: (fr.length + en.length) * line + 3 };
}
function drawBilingual(pdf: PdfDocument, content: ControlText, x: number, y: number, width: number, fontSize: number) {
  const layout = bilingualLayout(pdf, content, width, fontSize);
  pdf.setTextColor(...NAVY); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(fontSize);
  pdf.text(layout.fr, x, y, { lineHeightFactor: 1.13 });
  pdf.setTextColor(82, 103, 115); pdf.setFont('helvetica', 'italic');
  pdf.text(layout.en, x, y + layout.fr.length * layout.line + 1, { lineHeightFactor: 1.13 });
}
function appendNotice(pdf: PdfDocument, autoTable: (doc: PdfDocument, options: UserOptions) => void, report: LiftingInspection) {
  const types: AccessoryDefinition[] = report.kind === 'towing'
    ? TOWING_TYPES.map((type) => ({ ...type, code: 'TL', aliases: [] }))
    : ACCESSORIES.filter((type) => !['TL', 'RO'].includes(type.code));
  const codes = CONTROL_CODES.filter((code) => types.some((type) => type.checks[code]));
  pdf.addPage('a3', 'landscape');
  const noticePage = pdf.getNumberOfPages();
  const margin = 12; const width = pdf.internal.pageSize.getWidth() - margin * 2;
  const codeWidth = 12; const colWidth = (width - codeWidth) / types.length;
  let fontSize = 8.5;
  const measure = () => codes.map((code) => Math.max(10, ...types.map((type) => type.checks[code] ? bilingualLayout(pdf, type.checks[code]!, colWidth - 4, fontSize).height : 10)));
  let heights = measure();
  while (heights.reduce((a, b) => a + b, 0) > 195 && fontSize > 7.5) { fontSize -= .25; heights = measure(); }
  if (heights.reduce((a, b) => a + b, 0) > 195) throw new Error('La notice dépasse la dernière page. Réduisez son contenu ou adaptez sa mise en page.');
  pdf.setTextColor(...NAVY); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(15);
  pdf.text('NOTICE EXPLICATIVE DES CONTRÔLES', margin, 40);
  pdf.setFont('helvetica', 'italic'); pdf.setFontSize(9); pdf.text('Inspection guide - control codes by accessory type', margin, 46);
  autoTable(pdf, {
    startY: 51, margin: { left: margin, right: margin, top: 51, bottom: 30 }, theme: 'grid',
    styles: { cellPadding: 2, fontSize, textColor: NAVY, lineColor: [197, 212, 219], lineWidth: .15 },
    headStyles: { fillColor: [231, 240, 244], textColor: NAVY, fontStyle: 'bold' },
    head: [['Code', ...types.map((type) => `${report.kind === 'lifting' ? `${type.code} - ` : ''}${clean(type.fr)}\n${type.en}`)]],
    body: codes.map((code, index) => [{ content: code, styles: { fontStyle: 'bold', minCellHeight: heights[index], valign: 'middle', halign: 'center' } }, ...types.map(() => '')]),
    columnStyles: Object.fromEntries([0, ...types.map((_, i) => i + 1)].map((i) => [i, { cellWidth: i === 0 ? codeWidth : colWidth }])),
    didParseCell: (data) => { if (data.section === 'head' && data.column.index > 0) { data.cell.text = []; data.cell.styles.minCellHeight = 17; } },
    didDrawCell: (data) => {
      if (data.column.index === 0) return;
      const type = types[data.column.index - 1];
      if (data.section === 'head') drawBilingual(pdf, { fr: `${report.kind === 'lifting' ? `${type.code} - ` : ''}${type.fr}`, en: type.en }, data.cell.x + 2, data.cell.y + 4, colWidth - 4, fontSize);
      else {
        const content = type.checks[codes[data.row.index]];
        if (content) drawBilingual(pdf, content, data.cell.x + 2, data.cell.y + 4, colWidth - 4, fontSize);
        else { pdf.setFont('helvetica', 'normal'); pdf.setFontSize(fontSize); pdf.setTextColor(130, 141, 148); pdf.text('-', data.cell.x + colWidth / 2, data.cell.y + data.cell.height / 2, { align: 'center' }); }
      }
    }, rowPageBreak: 'avoid',
  });
  if (pdf.getNumberOfPages() !== noticePage) throw new Error('La notice doit tenir sur la dernière page du rapport.');
  const y = (pdf as PdfDocument & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
  const footnote = report.kind === 'towing'
    ? { fr: 'Codes des remorques définis par le vérificateur ; descriptions adaptées aux chaînes, câbles et textiles de la notice fournie. NID : identification.', en: 'Towing-line codes defined by the inspector; descriptions follow the supplied chain, wire-rope and textile guidance. NID: identification.' }
    : { fr: 'ID : identification. CMU : charge maximale d’utilisation. RO : aussières textiles ; détail des contrôles non fourni dans la notice source.', en: 'ID: identification. SWL: safe working load. RO: ropes; detailed checks are not specified in the source notice.' };
  drawBilingual(pdf, footnote, margin, y, width, 8);
}
export async function buildLiftingPdf(report: LiftingInspection, entries: InspectionEntry[], stamp?: Uint8Array, options: { specimen?: boolean } = {}) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const pdf = new jsPDF({ format: 'a4', orientation: 'landscape', unit: 'mm', compress: true });
  const draft = !stamp; const specimen = Boolean(options.specimen);
  const title = report.kind === 'towing' ? 'REGISTRE DE SUIVI DES REMORQUES' : 'REGISTRE DES APPARAUX DE LEVAGE';
  const subtitle = report.kind === 'towing' ? 'Register of Towing Lines' : 'Register of Lifting Accessories';
  const vessel = report.vessel_snapshot;
  const codes = report.kind === 'towing' ? ['EG', 'NID', 'V1', 'V2', 'V3', 'V4', 'V5'] as const : ['EG', 'ID', 'V1', 'V2', 'V3', 'V4', 'V5'] as const;
  const lastY = () => (pdf as typeof pdf & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 35;
  autoTable(pdf, {
    startY: 35, margin: { left: 14, right: 14 }, theme: 'plain', styles: { fontSize: 9, cellPadding: 1.8 },
    body: [
      ['Navire / Ship', clean(vessel.name), 'Immatriculation / Official number', clean(vessel.registration_number)],
      ['Signal distinctif / Call sign', clean(vessel.call_sign), 'Port / Port of registry', clean(vessel.registration_port)],
      ['Armateur / Owner', 'BENJAMIN BON TRAVAUX MARITIMES', 'Vérificateur / Inspector', INSPECTOR],
      ['Émission / Issued on', formatLiftingDate(report.issued_on), 'Échéance / Valid until', formatLiftingDate(report.expires_on)],
    ], columnStyles: { 0: { fontStyle: 'bold' }, 2: { fontStyle: 'bold' } },
  });
  const groups = groupByAccessory(entries, (entry) => entry.item_snapshot);
  const body: CellInput[][] = []; const rowEntries = new Map<number, InspectionEntry>();
  for (const group of groups) {
    body.push([{ content: clean(`${group.label} / ${group.definition?.en || ''}`), colSpan: 11, styles: { fillColor: [225, 236, 241], fontStyle: 'bold', fontSize: 8.5 } }]);
    for (const entry of group.rows) {
      const item = entry.item_snapshot; const applicable = entryControlKeys(entry);
      rowEntries.set(body.length, entry);
      body.push([
        { content: clean(item.reference), styles: { fontStyle: 'bold', textColor: entry.condition === 'withdrawn' ? RED : NAVY, valign: 'middle', halign: 'center' } },
        clean(item.description) + (item.legacy_reference ? `\nAncien ID / Previous ID: ${clean(item.legacy_reference)}` : '') + (item.serial_number ? `\nN° ${clean(item.serial_number)}` : ''),
        item.swl_tonnes === null ? '-' : String(item.swl_tonnes).replace('.', ','),
        ...codes.map((code) => ({ content: entry.condition === 'pending' ? '?' : applicable.includes(code) ? entry.checks[code] === 'ok' ? 'OK' : entry.checks[code] === 'defect' ? 'NC' : '?' : '-', styles: { halign: 'center' as const, cellPadding: { top: 7, bottom: 2, left: 1, right: 1 }, textColor: entry.checks[code] === 'defect' ? RED : NAVY } })),
        `${CONDITION_LABELS[entry.condition]}\n${decisionEn[entry.condition]}${entry.observations ? `\n\nObservation : ${clean(entry.observations)}` : ''}`,
      ]);
    }
  }
  autoTable(pdf, {
    startY: lastY() + 6, margin: { top: 33, left: 14, right: 14, bottom: 18 }, theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak', textColor: NAVY },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontSize: 8 },
    alternateRowStyles: { fillColor: [246, 249, 250] },
    head: [['N°', 'Description / Identification', 'CMU (t)\nSWL', ...codes, 'Décision et observations / Decision and remarks']], body,
    columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: 61 }, 2: { cellWidth: 16 }, 3: { cellWidth: 9 }, 4: { cellWidth: 9 }, 5: { cellWidth: 9 }, 6: { cellWidth: 9 }, 7: { cellWidth: 9 }, 8: { cellWidth: 9 }, 9: { cellWidth: 9 } },
    didDrawCell: (data) => {
      if (data.section !== 'body') return;
      const entry = rowEntries.get(data.row.index); if (!entry) return;
      if (data.column.index >= 3 && data.column.index <= 9 && entry.condition !== 'pending') {
        const code = codes[data.column.index - 3]; const value = entry.checks[code];
        if (entryControlKeys(entry).includes(code) && (value === 'ok' || value === 'defect')) resultIcon(pdf, data.cell.x + data.cell.width / 2, data.cell.y + 3.5, value === 'defect', 1.45);
      }
    }, rowPageBreak: 'avoid',
  });
  let y = lastY() + 7;
  if (y > 135) { pdf.addPage('a4', 'landscape'); y = 37; }
  drawBilingual(pdf, { fr: 'OK : point satisfaisant. NC et icône rouge : point insatisfaisant. Un seul point NC rend le résultat du matériel insatisfaisant. - : non applicable. ? : non contrôlé.', en: 'OK: satisfactory. NC and red icon: unsatisfactory. A single NC point makes the item result unsatisfactory. -: not applicable. ?: not inspected.' }, 14, y, 269, 8);
  y += 18; pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(...NAVY);
  const bad = entries.filter(entryUnsatisfactory).length; const pending = entries.filter((entry) => entry.condition === 'pending').length;
  pdf.text(`${entries.length} matériels - ${bad} résultats insatisfaisants${pending ? ` - ${pending} à contrôler` : ''}`, 14, y);
  y += 7;
  drawBilingual(pdf, { fr: 'Les réparations doivent être réalisées avant remise en service. Les matériels mis au rebut doivent être retirés du service.', en: 'Repairs must be completed before return to service. Items designated for scrapping must be removed from service.' }, 14, y, 269, 8);
  y += 16; pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(...NAVY);
  pdf.text(`Examen réalisé par : ${INSPECTOR}`, 14, y); pdf.text(`Date : ${formatLiftingDate(report.issued_on)}`, 14, y + 7);
  if (stamp) pdf.addImage(stamp, 'PNG', 218, y - 3, 57, 32);
  else pdf.text('BROUILLON - non signé - ne vaut pas rapport finalisé', 14, y + 16);
  appendNotice(pdf, autoTable, report);
  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page); const right = pdf.internal.pageSize.getWidth() - 14; const bottom = pdf.internal.pageSize.getHeight() - 14;
    pdf.setTextColor(...NAVY); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16); pdf.text(title, 14, 15);
    pdf.setFontSize(9); pdf.setFont('helvetica', 'italic'); pdf.text(subtitle, 14, 21);
    pdf.setFont('helvetica', 'normal'); pdf.text(`${clean(vessel.name)} / ${report.inspection_year}${draft ? ' / BROUILLON' : ''}`, right, 26, { align: 'right' });
    pdf.setDrawColor(195, 208, 214); pdf.line(14, 29, right, 29); pdf.line(14, bottom, right, bottom);
    pdf.setFontSize(8); pdf.text(`BBTM | Rapport LEV-${report.id} | Révision ${report.revision} | ${formatLiftingDate(report.issued_on)}`, 14, bottom + 6);
    pdf.text(`${page} / ${pageCount}`, right, bottom + 6, { align: 'right' });
    if (specimen) { pdf.setTextColor(...RED); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.text('EXEMPLE DE PRÉSENTATION - RÉSULTATS SIMULÉS - NON VALABLE', right, 21, { align: 'right' }); }
  }
  return { blob: pdf.output('blob'), filename: liftingReportFilename(report, draft).replace('.pdf', specimen ? ' - EXEMPLE.pdf' : '.pdf') };
}
export function saveLiftingBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
