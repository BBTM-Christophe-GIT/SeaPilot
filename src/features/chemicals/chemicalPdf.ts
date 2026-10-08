import type { ChemicalFileStore } from './chemicalDrive';
import { productLabel, stockLabel, type ChemicalAttachment, type ChemicalProduct, type ChemicalVessel } from './chemicalModel';
import { downloadChemicalAttachment } from './chemicalQueries';

export interface ChemicalPdfInput {
  vessel: ChemicalVessel; products: ChemicalProduct[]; attachments: ChemicalAttachment[];
  logo: Uint8Array; pictograms: Map<string, Uint8Array>; includeAttachments: boolean;
  loadAttachment: (attachment: ChemicalAttachment) => Promise<Uint8Array>;
  issuedAt?: Date;
}
export async function prepareChemicalPdf(files: ChemicalFileStore, vessel: ChemicalVessel, products: ChemicalProduct[],
  attachments: ChemicalAttachment[], includeAttachments: boolean): Promise<ChemicalPdfInput> {
  const bytes = async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Une illustration du PDF est indisponible. Réessayez.');
    return new Uint8Array(await response.arrayBuffer());
  };
  const scoped = products.filter((p) => p.vessel_id === vessel.id);
  const codes = [...new Set(scoped.flatMap((p) => p.pictograms))];
  const [logo, icons] = await Promise.all([bytes('/bbtm-service-note-logo.png'), Promise.all(codes.map(async (code) => [code, await bytes(`/ghs/${code}.png`)] as const))]);
  return { vessel, products: scoped, attachments: attachments.filter((a) => scoped.some((p) => p.id === a.product_id)), logo,
    pictograms: new Map(icons), includeAttachments, loadAttachment: async (attachment) => new Uint8Array(await (await downloadChemicalAttachment(files, attachment)).arrayBuffer()) };
}
export async function buildChemicalPdf(input: ChemicalPdfInput): Promise<{ blob: Blob; filename: string }> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const products = input.products.filter((p) => p.vessel_id === input.vessel.id);
  const attachments = input.attachments.filter((a) => products.some((p) => p.id === a.product_id));
  const document = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  const date = (input.issuedAt || new Date()).toLocaleDateString('fr-FR');
  const text = (value: string) => value.trim() || 'À renseigner';
  const header = () => {
    document.setFillColor(15, 38, 63); document.rect(0, 0, 297, 5, 'F');
    document.addImage(input.logo, 'PNG', 11, 9, 17, 17);
    document.setTextColor(15, 38, 63); document.setFont('helvetica', 'bold'); document.setFontSize(17);
    document.text('INVENTAIRE DES PRODUITS CHIMIQUES', 34, 16);
    document.setFontSize(11); document.text(`${input.vessel.name}  |  ${date}`, 34, 23);
    document.setFont('helvetica', 'normal'); document.setFontSize(8);
    document.text(`${products.length} produits • Stock renseigné : ${stockLabel(products.reduce((sum,p) => sum + (p.stock_litres ?? 0),0))} • ${products.filter(p => p.stock_litres === null).length} stocks à renseigner`, 11, 33);
    document.text(input.includeAttachments ? 'Dossier avec pièces jointes (annexes en fin de document).' : 'Inventaire seul - pièces jointes non incluses.', 11, 38);
  };
  const widths = [24, 30, 15, 26, 31, 43, 59, 28, 17];
  autoTable(document, {
    startY: 43, margin: { top: 43, right: 12, bottom: 16, left: 12 },
    head: [['Marque', 'Type / variante', 'Compat.\nstock.', 'Usage / emplacement', 'Pictogrammes', 'Dangers', 'Conseils de prudence', 'EPI', 'Stock (L)']],
    body: products.map((p) => [text(p.brand), [p.product_type, p.variant].filter(Boolean).join('\n'), text(p.storage_compatibility),
      [p.usage, p.storage_location].filter(Boolean).join('\n') || 'À renseigner',
      p.pictograms.length ? '' : 'Non renseignés', text(p.hazards), text(p.precautions), text(p.ppe), stockLabel(p.stock_litres)]),
    styles: { font: 'helvetica', fontSize: 7.7, cellPadding: 2, overflow: 'linebreak', valign: 'top', textColor: [28, 43, 59], lineColor: [220, 228, 235], lineWidth: 0.15 },
    headStyles: { fillColor: [15, 38, 63], textColor: 255, fontSize: 8 },
    alternateRowStyles: { fillColor: [245, 248, 251] },
    columnStyles: Object.fromEntries(widths.map((cellWidth, index) => [index, { cellWidth }])),
    rowPageBreak: 'avoid',
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 4) {
        data.cell.styles.minCellHeight = Math.ceil((products[data.row.index]?.pictograms.length || 0) / 2) * 16 + 4;
      }
    },
    didDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 4 || data.row.index < 0) return;
      products[data.row.index]?.pictograms.forEach((code, index) => {
        const icon = input.pictograms.get(code);
        if (!icon) throw new Error(`Pictogramme ${code} indisponible.`);
        const x = data.cell.x + 2 + (index % 2) * 14, y = data.cell.y + 2 + Math.floor(index / 2) * 16;
        document.addImage(icon, 'PNG', x, y, 12, 12);
        document.setFontSize(5.5); document.text(code.replace('GHS', 'SGH'), x + 6, y + 14, { align: 'center' });
      });
    },
    didDrawPage: header,
  });
  if (!products.length) { header(); document.setFontSize(12); document.text('Aucun produit répertorié pour ce navire.', 12, 55); }
  document.addPage(); header();
  autoTable(document, {
    startY: 44, margin: { top: 43, bottom: 16, left: 12, right: 12 },
    head: [['Produit', 'Observations / source', 'FDS et pièces jointes']],
    body: products.map((p) => [productLabel(p), text(p.notes), attachments.filter((a) => a.product_id === p.id).map((a) => `${a.kind === 'fds' ? 'FDS' : 'Annexe'} : ${a.file_name}`).join('\n') || 'Aucune pièce jointe']),
    styles: { fontSize: 9, cellPadding: 3, overflow: 'linebreak' }, headStyles: { fillColor: [15, 38, 63] },
    columnStyles: { 0: { cellWidth: 57 }, 1: { cellWidth: 116 }, 2: { cellWidth: 100 } },
    rowPageBreak: 'avoid', didDrawPage: header,
  });
  const inventoryPages = document.getNumberOfPages();
  for (let page = 1; page <= inventoryPages; page++) {
    document.setPage(page); document.setFont('helvetica', 'normal'); document.setFontSize(7); document.setTextColor(80, 96, 110);
    document.text('BBTM • QHSE • Données du registre - consulter la FDS pour les consignes de sécurité.', 12, 201);
    document.text(`Inventaire ${page} / ${inventoryPages}`, 285, 201, { align: 'right' });
  }
  let bytes: Uint8Array<ArrayBufferLike> = new Uint8Array(document.output('arraybuffer'));
  if (input.includeAttachments && attachments.length) {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    const merged = await PDFDocument.load(bytes);
    const font = await merged.embedFont(StandardFonts.Helvetica);
    for (let index = 0; index < attachments.length; index++) {
      const attachment = attachments[index];
      try {
        const content = await input.loadAttachment(attachment);
        const page = merged.addPage([595.28, 841.89]);
        page.drawText(`BBTM - Annexe ${index + 1} / ${attachments.length}`, { x: 40, y: 785, size: 17, font, color: rgb(.06,.15,.25) });
        // Restrict appendix labels to characters supported by the PDF's standard font.
        const safe = (value: string) => value.replace(/[^\u0020-\u00ff]/g, '-');
        page.drawText(safe(productLabel(products.find((p) => p.id === attachment.product_id)!)).slice(0, 78), { x: 40, y: 745, size: 11, font });
        const label = safe(attachment.file_name);
        for (let line = 0; line < Math.ceil(label.length / 70); line++)
          page.drawText(label.slice(line * 70, (line + 1) * 70), { x: 40, y: 718 - line * 17, size: 10, font });
        if (attachment.mime_type === 'application/pdf') {
          const source = await PDFDocument.load(content);
          for (const copied of await merged.copyPages(source, source.getPageIndices())) merged.addPage(copied);
        } else if (attachment.mime_type === 'image/png' || attachment.mime_type === 'image/jpeg') {
          const picture = attachment.mime_type === 'image/png' ? await merged.embedPng(content) : await merged.embedJpg(content);
          const dims = picture.scaleToFit(515, 550);
          page.drawImage(picture, { x: (595.28 - dims.width) / 2, y: 50, ...dims });
        } else {
          await merged.attach(content, `${index + 1}-${attachment.file_name}`, { mimeType: attachment.mime_type, description: productLabel(products.find((p) => p.id === attachment.product_id)!) });
          page.drawText('Fichier inclus dans les pièces jointes du PDF.', { x: 40, y: 620, size: 12, font });
          page.drawText('Ouvrez le panneau des pièces jointes dans votre lecteur PDF.', { x: 40, y: 600, size: 10, font });
        }
      } catch {
        throw new Error(`Impossible d’intégrer « ${attachment.file_name} ». Vérifiez le fichier (PDF non protégé et lisible) ou exportez sans pièces jointes.`);
      }
    }
    bytes = await merged.save();
  }
  const vesselName = input.vessel.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9-]/gi,'-');
  return { blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }), filename: `BBTM-Produits-Chimiques-${vesselName}${input.includeAttachments ? '-avec-annexes' : ''}.pdf` };
}
