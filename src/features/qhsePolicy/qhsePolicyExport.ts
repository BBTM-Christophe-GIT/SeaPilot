import type { QhsePolicyAttachment, QhsePolicySnapshot } from './qhsePolicyModel';
import { orderQhsePolicyUpdates, qhsePolicyDate, qhsePolicyTimestamp, summarizeQhsePolicyObjectives } from './qhsePolicyPresentation';
import type { PDFDocument, PDFImage } from 'pdf-lib';

export interface QhsePolicyExportInput {
  snapshot: QhsePolicySnapshot;
  policy: { blob: Blob; title: string; fileName?: string };
  readAttachment: (attachment: QhsePolicyAttachment) => Promise<Blob>;
  logo?: Uint8Array;
  generatedAt?: Date;
}
export interface QhsePolicyExportResult { blob: Blob; fileName: string; pageCount: number }

const INK: [number, number, number] = [20, 55, 75];
const clean = (value: string) => value.replace(/[\u2010-\u2015\u2212]/g, '-').replace(/[\u00a0\u202f]/g, ' ').replace(/\u2022/g, '-');
const percent = (value: number) => `${value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`;
const safeName = (value: string) => Array.from(value, (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 || character === '/' || character === '\\' ? '_' : character).join('').trim() || 'document';

async function loadPdf(bytes: Uint8Array, name: string): Promise<PDFDocument> {
  try {
    const { PDFDocument } = await import('pdf-lib');
    const source = await PDFDocument.load(bytes);
    if (!source.getPageCount()) throw new Error('PDF sans page');
    return source;
  } catch (error) {
    throw new Error(`Le PDF « ${name} » ne peut pas être intégré : fichier protégé, corrompu ou vide. L’export complet a été interrompu.`, { cause: error });
  }
}

async function embedImage(document: PDFDocument, bytes: Uint8Array, mimeType: string, name: string): Promise<PDFImage> {
  try {
    if (mimeType === 'image/png') return await document.embedPng(bytes);
    if (mimeType === 'image/jpeg') return await document.embedJpg(bytes);
    // The original remains attached byte-for-byte; this conversion only makes a
    // printable representation for image formats supported by the browser.
    if (typeof Image === 'undefined') throw new Error('Conversion image indisponible');
    const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: mimeType }));
    try {
      const picture = new Image();
      await new Promise<void>((resolve, reject) => {
        picture.onload = () => resolve(); picture.onerror = () => reject(new Error('Image illisible')); picture.src = url;
      });
      const canvas = globalThis.document.createElement('canvas');
      canvas.width = picture.naturalWidth; canvas.height = picture.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context || !canvas.width || !canvas.height) throw new Error('Image vide');
      context.drawImage(picture, 0, 0);
      return await document.embedPng(canvas.toDataURL('image/png'));
    } finally { URL.revokeObjectURL(url); }
  } catch (error) {
    throw new Error(`La photo « ${name} » ne peut pas être lue ou intégrée. L’export complet a été interrompu.`, { cause: error });
  }
}

/** Builds a complete, unfiltered dossier. No signed URL or storage path is printed. */
export async function buildQhsePolicyExport(input: QhsePolicyExportInput): Promise<QhsePolicyExportResult> {
  const { snapshot } = input;
  const processes = [...snapshot.processes].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'fr') || a.id.localeCompare(b.id));
  const processIds = new Set(processes.map((row) => row.id));
  const objectives = new Map(snapshot.objectives.map((row) => [row.id, row]));
  const updates = new Map(snapshot.updates.map((row) => [row.id, row]));
  if (processIds.size !== processes.length || objectives.size !== snapshot.objectives.length || updates.size !== snapshot.updates.length
    || snapshot.objectives.some((row) => !processIds.has(row.processId))
    || snapshot.updates.some((row) => !objectives.has(row.objectiveId))) throw new Error('Le dossier QHSE est incomplet. Actualisez la page avant l’export.');
  const attachments = [...snapshot.attachments].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  if (new Set(attachments.map((row) => row.id)).size !== attachments.length
    || attachments.some((row) => !objectives.has(row.objectiveId) || updates.get(row.updateId)?.objectiveId !== row.objectiveId)) {
    throw new Error('Une pièce jointe ne correspond pas à son objectif et à son suivi. Actualisez la page avant l’export.');
  }
  const generatedAt = input.generatedAt ?? new Date();
  const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(generatedAt);
  const policyBytes = new Uint8Array(await input.policy.blob.arrayBuffer());
  const originalPolicy = await loadPdf(policyBytes, input.policy.title || 'Politique QHSE');
  const [{ jsPDF }, { autoTable }, { PDFDocument }] = await Promise.all([import('jspdf'), import('jspdf-autotable'), import('pdf-lib')]);
  const prepared = await PDFDocument.create();
  const entries: Array<{ record: QhsePolicyAttachment; bytes: Uint8Array; reference: string; context: string; pdf?: PDFDocument; image?: PDFImage }> = [];
  for (const record of attachments) {
    const reference = `PJ${String(entries.length + 1).padStart(3, '0')}`;
    const objective = objectives.get(record.objectiveId)!; const update = updates.get(record.updateId)!;
    const process = processes.find((row) => row.id === objective.processId)!;
    const context = `Processus : ${process.name}\nObjectif : ${objective.title}\n${update.kind === 'initial' ? 'État initial' : 'Suivi'} du ${qhsePolicyDate(update.occurredOn)} - ${update.actorName}\nEnregistré le ${qhsePolicyTimestamp(update.createdAt)}`;
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await (await input.readAttachment(record)).arrayBuffer());
      if (!bytes.length || bytes.length !== record.sizeBytes) throw new Error('Taille différente de la pièce enregistrée');
    } catch (error) {
      throw new Error(`Impossible d’inclure « ${record.fileName} » (${reference}). Vérifiez l’accès au fichier et actualisez la page. L’export complet a été interrompu.`, { cause: error });
    }
    const pdf = record.mimeType === 'application/pdf' ? await loadPdf(bytes, record.fileName) : undefined;
    const image = record.mimeType.startsWith('image/') ? await embedImage(prepared, bytes, record.mimeType, record.fileName) : undefined;
    entries.push({ record, bytes, reference, context, pdf, image });
  }
  let logo = input.logo;
  if (!logo) {
    try {
      const response = await fetch('/bbtm-report-logo.png');
      if (!response.ok) throw new Error('Logo indisponible');
      logo = new Uint8Array(await response.arrayBuffer());
    } catch (error) { throw new Error('L’identité visuelle du rapport est indisponible. Réessayez l’export.', { cause: error }); }
  }

  function newSection(label: string) {
    const doc = new jsPDF({ format: 'a4', unit: 'mm', compress: true, putOnlyUsedFonts: true });
    let cursor = 43;
    const logoProperties = doc.getImageProperties(logo!);
    const logoScale = Math.min(25 / logoProperties.width, 16 / logoProperties.height);
    const header = () => {
      doc.setFillColor(...INK); doc.rect(0, 0, 210, 4, 'F'); doc.addImage(logo!, 'PNG', 15, 9, logoProperties.width * logoScale, logoProperties.height * logoScale);
      doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.text('POLITIQUE QHSE', 46, 15);
      doc.setFontSize(10); doc.text(clean(label), 46, 23);
      doc.setDrawColor(219, 229, 235); doc.line(15, 32, 195, 32);
      doc.setTextColor(...INK);
    };
    header();
    const ensure = (height: number) => { if (cursor + height > 273) { doc.addPage(); header(); cursor = 43; } };
    const paragraph = (value: string, bold = false) => {
      if (bold) ensure(18);
      doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(bold ? 11 : 9);
      const lines = doc.splitTextToSize(clean(value || 'Non renseigné'), 180) as string[];
      for (const line of lines) {
        ensure(5); doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(bold ? 11 : 9); doc.text(line, 15, cursor); cursor += 4.7;
      }
      cursor += 3;
    };
    const table = (head: string[], body: string[][]) => {
      ensure(16);
      autoTable(doc, { startY: cursor, head: [head.map(clean)], body: body.map((row) => row.map(clean)),
        margin: { top: 43, bottom: 24, left: 15, right: 15 }, styles: { font: 'helvetica', fontSize: 8, cellPadding: 2.5, overflow: 'linebreak' },
        columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 80 }, 2: { cellWidth: 50 } },
        headStyles: { fillColor: INK }, alternateRowStyles: { fillColor: [246, 249, 251] }, didDrawPage: header });
      cursor = (doc as typeof doc & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;
    };
    const finish = async () => {
      const count = doc.getNumberOfPages();
      for (let page = 1; page <= count; page++) {
        doc.setPage(page); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(93, 112, 126);
        doc.text(`BBTM - SeaPilot - Export du ${qhsePolicyDate(day)}`, 15, 286);
        doc.text(`${label} - ${page}/${count}`, 195, 286, { align: 'right' });
      }
      return PDFDocument.load(doc.output('arraybuffer'));
    };
    return { doc, paragraph, table, finish };
  }
  const report = newSection('Objectifs et historique complet');
  report.paragraph('Dossier complet - politique, objectifs, suivis et pièces jointes', true);
  report.paragraph(`Édité le ${qhsePolicyTimestamp(generatedAt.toISOString())}. Tous les processus, objectifs et suivis sont inclus, y compris les archives. Les filtres d’écran ne limitent pas ce dossier.`);
  report.paragraph(`Politique de référence : ${input.policy.title}\nLe PDF original intégral (${originalPolicy.getPageCount()} page(s)) figure après les objectifs et est aussi intégré comme fichier original.`);
  const summary = summarizeQhsePolicyObjectives(snapshot.objectives, processes);
  report.paragraph(`${processes.length} processus - ${snapshot.objectives.length} objectifs - ${snapshot.updates.length} entrées d’historique - ${entries.length} pièces jointes.`);
  report.paragraph(summary.total ? `Objectifs actifs : ${summary.completed}/${summary.total} réalisés - progression moyenne ${percent(summary.average ?? 0)}. Les archives sont exclues de cette moyenne.` : 'Aucun objectif actif.');
  if (entries.length) {
    report.paragraph('Index des pièces jointes', true);
    report.table(['Réf. / fichier original', 'Objectif et suivi', 'Contenu inclus'], entries.map((entry) => [
      `${entry.reference}\n${entry.record.fileName}`, entry.context,
      `${entry.pdf ? `${entry.pdf.getPageCount()} page(s) PDF reproduites` : entry.image ? 'Photo reproduite sans recadrage' : 'Fichier original intégré'}\n${entry.record.mimeType}\n${entry.bytes.length} octets`,
    ]));
    report.paragraph('Chaque référence PJ renvoie à une annexe et à un fichier original intégré au PDF. Les fichiers bureautiques s’ouvrent depuis le panneau des pièces jointes d’un lecteur PDF compatible.');
  }
  for (const process of processes) {
    report.paragraph(`Processus : ${process.name}${process.archived ? ' [ARCHIVÉ]' : ''}`, true);
    if (process.description) report.paragraph(process.description);
    const processObjectives = snapshot.objectives.filter((row) => row.processId === process.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    if (!processObjectives.length) report.paragraph('Aucun objectif dans ce processus.');
    for (const objective of processObjectives) {
      report.paragraph(`Objectif : ${objective.title}${objective.archived ? ' [ARCHIVÉ]' : ''}${process.archived ? ' [PROCESSUS ARCHIVÉ]' : ''}`, true);
      if (objective.description) report.paragraph(objective.description);
      report.paragraph(`Responsable actuel : ${objective.ownerLabel || 'Non renseigné'}\nÉchéance : ${qhsePolicyDate(objective.dueOn)} - progression courante : ${percent(objective.progress)}\nCréé le ${qhsePolicyTimestamp(objective.createdAt)} - modifié le ${qhsePolicyTimestamp(objective.updatedAt)}`);
      report.paragraph('Historique des suivis', true);
      const history = orderQhsePolicyUpdates(snapshot.updates.filter((row) => row.objectiveId === objective.id));
      if (!history.length) report.paragraph('Aucun suivi enregistré.');
      for (const update of history) {
        report.paragraph(`${update.kind === 'initial' ? 'État initial' : 'Suivi'} du ${qhsePolicyDate(update.occurredOn)} - ${percent(update.progress)}`, true);
        report.paragraph(`Auteur : ${update.actorName || 'Utilisateur'} - responsable lors de la saisie : ${update.ownerLabel || 'Non renseigné'}\nEnregistré le ${qhsePolicyTimestamp(update.createdAt)}`);
        report.paragraph(update.note || 'Aucun commentaire.');
        const linked = entries.filter((entry) => entry.record.updateId === update.id);
        if (linked.length) report.paragraph(`Pièces jointes :\n${linked.map((entry) => `${entry.reference} - ${entry.record.fileName}`).join('\n')}`);
      }
    }
  }
  const output = prepared;
  async function append(source: PDFDocument) { for (const page of await output.copyPages(source, source.getPageIndices())) output.addPage(page); }
  await append(await report.finish());
  const policyCover = newSection('Politique originale');
  policyCover.paragraph('Politique de référence - PDF original intégral', true); policyCover.paragraph(input.policy.title);
  policyCover.paragraph(`${originalPolicy.getPageCount()} page(s) reproduites intégralement. Le fichier d’origine est également intégré au dossier.`);
  await append(await policyCover.finish()); await append(originalPolicy);
  await output.attach(policyBytes, `00-${safeName(input.policy.fileName || 'Politique-QHSE-original.pdf')}`, { mimeType: 'application/pdf', description: input.policy.title });
  for (const entry of entries) {
    const cover = newSection(`Annexe ${entry.reference}`);
    cover.paragraph(`${entry.reference} - ${entry.record.fileName}`, true); cover.paragraph(entry.context);
    cover.paragraph(entry.pdf ? 'Pages du PDF original reproduites à la suite. Original également intégré.' : entry.image ? 'Photo reproduite à la suite sans recadrage. Original également intégré.' : 'Fichier original intégré. Ouvrez le panneau des pièces jointes de votre lecteur PDF pour le consulter.');
    await append(await cover.finish());
    await output.attach(entry.bytes, `${entry.reference}-${safeName(entry.record.fileName)}`, { mimeType: entry.record.mimeType, description: clean(entry.context) });
    if (entry.pdf) await append(entry.pdf);
    if (entry.image) {
      const page = output.addPage([595.28, 841.89]);
      const dimensions = entry.image.scaleToFit(515, 761);
      page.drawImage(entry.image, { x: (page.getWidth() - dimensions.width) / 2, y: (page.getHeight() - dimensions.height) / 2, ...dimensions });
    }
  }
  output.setTitle('Politique QHSE - Dossier complet'); output.setAuthor('BBTM - SeaPilot');
  output.setSubject('Politique, processus, objectifs, historique et pièces jointes - archives incluses');
  output.setCreationDate(generatedAt); output.setModificationDate(generatedAt);
  const bytes = await output.save();
  return { blob: new Blob([bytes.slice().buffer], { type: 'application/pdf' }), fileName: `Politique-QHSE-complete-${day}.pdf`, pageCount: output.getPageCount() };
}
