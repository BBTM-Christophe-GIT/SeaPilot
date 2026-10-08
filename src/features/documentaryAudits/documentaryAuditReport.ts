import { formatAuditDate, todayAuditParis, type AuditSite } from '../internalAudits/internalAuditModel';
import { auditReportTimestampDay, resolveInternalAuditReportPhoto } from '../internalAudits/internalAuditReport';
import { DOCUMENTARY_AUDIT_LABELS, DOCUMENTARY_FINDING_LABELS, DOCUMENTARY_STATUS_LABELS, type AuditAttachment, type DocumentaryAudit, type DocumentaryFinding, type DocumentaryFindingEvent } from './documentaryAuditModel';

export interface DocumentaryAuditReportInput {
  audit: DocumentaryAudit; site: AuditSite; findings: readonly DocumentaryFinding[]; events: readonly DocumentaryFindingEvent[];
  findingId?: string; loadFile?: (file: AuditAttachment) => Promise<Blob>; generatedAt?: Date;
}
export function documentaryReportData(input: DocumentaryAuditReportInput) {
  if (input.site.id !== input.audit.siteId || input.site.companyId !== input.audit.companyId) throw new Error('Le navire ne correspond pas au dossier sélectionné.');
  const visible = input.findings.filter((x) => x.auditId === input.audit.id && x.companyId === input.audit.companyId);
  const findings = input.findingId ? visible.filter((x) => x.id === input.findingId) : visible;
  if (input.findingId && findings.length !== 1) throw new Error('Cet écart n’appartient pas au dossier sélectionné.');
  const entries = findings.map((finding) => ({ finding, events: input.events.filter((x) => x.findingId === finding.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)) }));
  const files = [
    ...(input.findingId ? [] : input.audit.files.map((file) => ({ file, context: 'Documents du dossier d’audit' }))),
    ...entries.flatMap(({ finding, events }) => [
      ...finding.files.map((file) => ({ file, context: `${finding.reference || 'Écart'} · Constat` })),
      ...events.flatMap((event) => event.files.map((file) => ({ file, context: `${finding.reference || 'Écart'} · ${DOCUMENTARY_STATUS_LABELS[event.status]} · ${event.actorName} · ${formatAuditDate(auditReportTimestampDay(event.createdAt))}` }))),
    ]),
  ];
  const slug = input.site.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-');
  const reference = input.findingId ? `-ecart-${(findings[0].reference || findings[0].id).replace(/[^a-zA-Z0-9]+/g, '-')}` : '';
  return { entries, files, filename: `audit-${input.audit.kind}-${slug}-${input.audit.year}${reference}.pdf` };
}
async function loadFile(input: DocumentaryAuditReportInput, file: AuditAttachment): Promise<Blob> {
  if (input.loadFile) return input.loadFile(file);
  if (!file.url) throw new Error(`Le fichier ${file.fileName} est indisponible. Rechargez le dossier avant l’export.`);
  const response = await fetch(file.url);
  if (!response.ok) throw new Error(`Impossible de télécharger ${file.fileName}.`);
  return response.blob();
}
function dataUrl(bytes: Uint8Array, mime: string): string {
  let raw = ''; for (let i = 0; i < bytes.length; i += 8192) raw += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:${mime};base64,${btoa(raw)}`;
}
const clean = (text: string) => text.replace(/[\u2010-\u2015\u2212]/g, '-').replace(/[\u00a0\u202f]/g, ' ').replace(/\u2022/g, '-');

export async function buildDocumentaryAuditReport(input: DocumentaryAuditReportInput): Promise<{ blob: Blob; filename: string; pageCount: number }> {
  const data = documentaryReportData(input);
  const files = new Map<string, { file: AuditAttachment; bytes: Uint8Array; context: string; image?: string }>();
  for (const entry of data.files) {
    const key = entry.file.storagePath || entry.file.id;
    if (files.has(key)) continue;
    let blob: Blob;
    try { blob = await loadFile(input, entry.file); } catch (error) { throw new Error(`Le rapport n’a pas pu inclure ${entry.file.fileName}. Rechargez le dossier puis réessayez.`, { cause: error }); }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (!bytes.length) throw new Error(`Le fichier ${entry.file.fileName} est vide ou indisponible.`);
    const image = entry.file.mimeType.startsWith('image/') ? await resolveInternalAuditReportPhoto({ audit: {} as never, site: {} as never, audits: [], findings: [], events: [], loadPhoto: async () => dataUrl(bytes, entry.file.mimeType) }, entry.file) : undefined;
    files.set(key, { ...entry, bytes, image });
  }
  const [{ jsPDF }, { autoTable }, { PDFDocument }] = await Promise.all([import('jspdf'), import('jspdf-autotable'), import('pdf-lib')]);
  const pdf = new jsPDF({ format: 'a4', unit: 'mm', compress: true });
  const kindLabel = DOCUMENTARY_AUDIT_LABELS[input.audit.kind]; const margin = 15; let cursor = 48;
  const ink: [number, number, number] = [20, 55, 75];
  pdf.setProperties({ title: `${kindLabel} - ${input.site.name} - ${input.audit.year}`, author: input.audit.auditorName || 'SeaPilot' });
  function header() {
    pdf.setFillColor(...ink); pdf.rect(0, 0, 210, 29, 'F'); pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16);
    pdf.text(clean(`${kindLabel} - ${input.site.name}`), margin, 13); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
    pdf.text(clean(`Audit ${input.audit.year} - ${input.findingId ? 'Rapport d’un écart' : 'Liste et suivi des écarts'}`), margin, 23);
    pdf.setTextColor(...ink); pdf.setFontSize(9); const title = input.audit.title || `${kindLabel} ${input.audit.year}`; pdf.text(clean(title.length > 85 ? `${title.slice(0, 82)}...` : title), margin, 38);
  }
  header();
  function ensure(height: number) { if (cursor + height > 276) { pdf.addPage(); header(); cursor = 48; } }
  function paragraph(text: string, bold = false) {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal'); pdf.setFontSize(bold ? 10 : 9);
    const lines = pdf.splitTextToSize(clean(text), 180) as string[];
    for (const line of lines) { ensure(5); pdf.setFont('helvetica', bold ? 'bold' : 'normal'); pdf.setFontSize(bold ? 10 : 9); pdf.text(line, margin, cursor); cursor += 4.7; }
    cursor += 2;
  }
  function table(head: string[], body: string[][]) {
    ensure(15);
    autoTable(pdf, { startY: cursor, head: [head.map(clean)], body: body.map((row) => row.map(clean)), margin: { top: 48, bottom: 23, left: margin, right: margin }, styles: { font: 'helvetica', fontSize: 8, cellPadding: 2.5, overflow: 'linebreak' }, headStyles: { fillColor: ink }, didDrawPage: () => { if (pdf.getCurrentPageInfo().pageNumber > 1) header(); } });
    cursor = (pdf as typeof pdf & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }
  async function evidence(attachments: AuditAttachment[], label: string) {
    if (!attachments.length) return;
    paragraph(label, true);
    table(['Pièce jointe', 'Format', 'Taille'], attachments.map((file) => [clean(file.fileName), file.mimeType.startsWith('image/') ? 'Photo' : file.mimeType === 'application/pdf' ? 'PDF · annexe' : 'Document original joint', `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(file.sizeBytes / 1024)} Ko`]));
    for (const file of attachments) {
      const entry = files.get(file.storagePath || file.id);
      if (!entry?.image) continue;
      const properties = pdf.getImageProperties(entry.image); const width = Math.min(170, 75 * properties.width / properties.height); const height = width * properties.height / properties.width;
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
      const caption = pdf.splitTextToSize(clean(file.fileName), 180) as string[];
      const captionHeight = caption.length * 4 + 2;
      ensure(height + captionHeight + 6); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.text(caption, margin, cursor); cursor += captionHeight;
      pdf.addImage(entry.image, entry.image.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG', margin, cursor, width, height); cursor += height + 6;
    }
  }
  if (input.audit.title) paragraph(input.audit.title, true);
  paragraph(`Date de l’audit : ${input.audit.auditedOn ? formatAuditDate(input.audit.auditedOn) : 'Non renseignée'} · Auditeur : ${input.audit.auditorName || 'Non renseigné'}`);
  if (!input.findingId) {
    await evidence(input.audit.files, 'Documents constituant l’audit');
    paragraph(`${data.entries.length} écart(s) enregistré(s).`, true);
    if (data.entries.length) table(['Référence / type', 'Constat', 'État / responsable'], data.entries.map(({ finding }) => [clean(`${finding.reference || '—'}\n${DOCUMENTARY_FINDING_LABELS[finding.category]}`), clean(finding.description), clean(`${DOCUMENTARY_STATUS_LABELS[finding.status]}\n${finding.assigneeLabel}`)]));
  }
  for (const { finding, events } of data.entries) {
    ensure(30); paragraph(`${finding.reference || 'Écart'} - ${DOCUMENTARY_FINDING_LABELS[finding.category]}`, true);
    paragraph(finding.description); paragraph(`${DOCUMENTARY_STATUS_LABELS[finding.status]} · Responsable : ${finding.assigneeLabel}`);
    paragraph(`Ouverture : ${formatAuditDate(finding.openedOn)} · ${finding.dueOn ? `Échéance : ${formatAuditDate(finding.dueOn)}` : finding.category === 'remark' ? 'Sans échéance - clôture facultative' : 'Sans échéance'}`);
    await evidence(finding.files, 'Photos et fichiers du constat');
    paragraph('Suivi du traitement', true);
    if (!events.length) paragraph('Aucun traitement enregistré.');
    for (const event of events) {
      paragraph(`${formatAuditDate(auditReportTimestampDay(event.createdAt))} - ${event.actorName || 'Responsable'} - ${DOCUMENTARY_STATUS_LABELS[event.status]}`, true);
      paragraph(event.treatment || 'Preuve jointe'); await evidence(event.files, event.status === 'closed' ? 'Preuves de clôture' : 'Preuves du traitement');
    }
  }
  if (files.size) paragraph('Les documents originaux sont également joints à ce PDF. Les documents PDF figurent dans les annexes suivantes.');
  const generated = input.generatedAt ?? new Date();
  const generatedPages = pdf.getNumberOfPages();
  for (let page = 1; page <= generatedPages; page += 1) {
    pdf.setPage(page); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(101, 124, 137);
    pdf.text(`SeaPilot - Export du ${todayAuditParis(generated)}`, margin, 286); pdf.text(`${page} / ${generatedPages} - Annexes jointes`, 195, 286, { align: 'right' });
  }
  const report = await PDFDocument.load(pdf.output('arraybuffer'));
  let index = 0;
  for (const entry of files.values()) {
    index += 1;
    await report.attach(entry.bytes, `${String(index).padStart(2, '0')}-${entry.file.fileName}`, { mimeType: entry.file.mimeType, description: entry.context });
    if (entry.file.mimeType === 'application/pdf') {
      let original;
      try { original = await PDFDocument.load(entry.bytes); } catch (error) { throw new Error(`Le PDF joint ${entry.file.fileName} ne peut pas être intégré (fichier protégé ou invalide).`, { cause: error }); }
      const separator = new jsPDF({ format: 'a4', unit: 'mm' }); separator.setTextColor(...ink); separator.setFontSize(15); separator.text('Annexe - document PDF', margin, 25);
      separator.setFontSize(11); const fileLines = separator.splitTextToSize(clean(entry.file.fileName), 180) as string[]; separator.text(fileLines, margin, 40);
      separator.setFontSize(9); separator.text(separator.splitTextToSize(clean(entry.context), 180), margin, 40 + fileLines.length * 5 + 10);
      const cover = await PDFDocument.load(separator.output('arraybuffer')); const coverPages = await report.copyPages(cover, [0]); report.addPage(coverPages[0]);
      const pages = await report.copyPages(original, original.getPageIndices()); pages.forEach((page) => report.addPage(page));
    }
  }
  report.setTitle(`${kindLabel} - ${input.site.name} - ${input.audit.year}`); report.setAuthor(input.audit.auditorName || 'SeaPilot'); report.setCreationDate(generated); report.setModificationDate(generated);
  const bytes = await report.save();
  return { blob: new Blob([bytes.slice().buffer], { type: 'application/pdf' }), filename: data.filename, pageCount: report.getPageCount() };
}
export async function downloadDocumentaryAuditReport(input: DocumentaryAuditReportInput): Promise<void> {
  const report = await buildDocumentaryAuditReport(input); const url = URL.createObjectURL(report.blob);
  const link = document.createElement('a'); link.href = url; link.download = report.filename; document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
