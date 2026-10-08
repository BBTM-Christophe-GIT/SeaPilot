import type { jsPDF } from 'jspdf';
import type { RowInput } from 'jspdf-autotable';
import { groupOrgContacts, ORG_CONTACT_CONTENT, type OrgContactDocument, type OrgContactPerson } from './organigrammeContacts';
import type { OrgExportContent } from './OrgExportFields';
import { orgImageSource } from './organigrammeDiagram';

export interface OrgContactsSheet { kind: OrgContactDocument; people: OrgContactPerson[]; content?: OrgExportContent }
const MM = 72 / 25.4;

function drawPortrait(pdf: jsPDF, source: string, x: number, y: number, size: number) {
  const properties = pdf.getImageProperties(source);
  const scale = Math.max(size / properties.width, size / properties.height);
  const width = properties.width * scale; const height = properties.height * scale;
  pdf.saveGraphicsState();
  pdf.circle(x + size / 2, y + size / 2, size / 2, null); pdf.clip(); pdf.discardPath();
  pdf.addImage(source, source.startsWith('data:image/png') ? 'PNG' : 'JPEG', x + (size - width) / 2, y + (size - height) / 2, width, height);
  pdf.restoreGraphicsState();
}

export async function buildOrgContactsPdf(documents: OrgContactsSheet[], asOf: string, logoBytes?: Uint8Array): Promise<Blob> {
  if (!documents.length || documents.some((document) => !document.people.length)) throw new Error('Sélectionnez au moins une personne pour chaque liste à exporter.');
  if (documents.some((document) => document.content?.showPhotos && document.people.some((person) => person.photoUnavailable))) throw new Error('Une photo sélectionnée est indisponible. Actualisez ou décochez Photos.');
  const [{ jsPDF }, { autoTable }, { PDFDocument, StandardFonts, rgb }] = await Promise.all([import('jspdf'), import('jspdf-autotable'), import('pdf-lib')]);
  if (!logoBytes) {
    const response = await fetch('/bbtm-report-logo.png');
    if (!response.ok) throw new Error('Impossible de charger le logo BBTM.');
    logoBytes = new Uint8Array(await response.arrayBuffer());
  }
  const result = await PDFDocument.create();
  result.setTitle(documents.length > 1 ? 'BBTM - Personnel et numéros d’urgence' : documents[0].kind === 'personnel' ? 'BBTM - Liste du personnel' : 'BBTM - Numéros d’urgence');
  result.setSubject(`Situation au ${asOf}`); result.setCreator('SeaPilot');
  for (const document of documents) {
    const content = { ...ORG_CONTACT_CONTENT, ...document.content };
    const personnel = document.kind === 'personnel';
    const title = personnel ? 'Liste du personnel' : 'Numéros d’urgence';
    const heading: [number, number, number] = personnel ? [18, 54, 75] : [142, 45, 62];
    const stripe: [number, number, number] = personnel ? [243, 248, 249] : [252, 243, 244];
    const groups = groupOrgContacts(document.people);
    // Measure all personnel at natural size, then fit vector content to ONE A4
    // page without dropping any rows, including exceptionally long lists.
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: personnel ? [210, 3500] : 'a4', compress: true });
    const logo = pdf.getImageProperties(logoBytes);
    const logoScale = Math.min(22 / logo.width, 16 / logo.height);
    const header = (target: jsPDF) => {
      target.setFillColor(...heading); target.rect(0, 0, 210, 3, 'F');
      target.addImage(logoBytes!, 'PNG', 12, 8, logo.width * logoScale, logo.height * logoScale);
      target.setFont('helvetica', 'bold'); target.setFontSize(17); target.setTextColor(...heading); target.text(title, 41, 17);
      target.setFont('helvetica', 'normal'); target.setFontSize(9);
      target.text(`BBTM · Situation au ${asOf.split('-').reverse().join('/')}`, 41, 24);
      target.setFontSize(8); target.text(`${document.people.length} personne(s)${content.showFunctions ? ' · Par fonction, puis par nom de famille' : ''}`, 12, 34);
      target.setDrawColor(...heading); target.line(12, 38, 198, 38);
    };
    const columns: Array<{ key: 'photo' | 'name' | 'email' | 'phone' | 'vesselLabel' | 'watchLabel'; label: string; weight: number }> = [
      ...(content.showPhotos ? [{ key: 'photo' as const, label: 'Photo', weight: 12 }] : []),
      { key: 'name', label: 'Prénom NOM', weight: 50 },
      ...(content.showEmails ? [{ key: 'email' as const, label: 'Email', weight: 58 }] : []),
      ...(content.showPhones ? [{ key: 'phone' as const, label: 'Téléphone', weight: 35 }] : []),
      ...(content.showVessels ? [{ key: 'vesselLabel' as const, label: 'Navire', weight: 29 }] : []),
      ...(content.showWatches ? [{ key: 'watchLabel' as const, label: 'Bordée', weight: 26 }] : []),
    ];
    const photoWidth = content.showPhotos ? 11 : 0;
    const weight = columns.filter((column) => column.key !== 'photo').reduce((sum, column) => sum + column.weight, 0);
    const columnStyles = Object.fromEntries(columns.map((column, index) => [index, { cellWidth: column.key === 'photo' ? photoWidth : (186 - photoWidth) * column.weight / weight, ...(column.key === 'phone' && !personnel ? { fontStyle: 'bold' as const } : {}) }]));
    const rows: Array<{ group?: string; person?: OrgContactPerson }> = groups.flatMap((group) => [
      ...(content.showFunctions ? [{ group: group.functionLabel }] : []), ...group.people.map((person) => ({ person })),
    ]);
    const body: RowInput[] = rows.map((row) => row.group ? [{ content: row.group, colSpan: columns.length, styles: { fillColor: stripe, textColor: heading, fontStyle: 'bold', cellPadding: 1.1 } }] : columns.map((column) => column.key === 'photo' ? '' : row.person![column.key] || '—'));
    const bottoms = new Map<number, number>();
    const decorated = new Set<number>();
    autoTable(pdf, {
      startY: personnel ? 0 : 43,
      margin: { top: personnel ? 0 : 43, left: 12, right: 12, bottom: personnel ? 0 : 18 },
      head: [columns.map((column) => column.label)], body,
      theme: 'grid', rowPageBreak: 'avoid', showHead: 'everyPage',
      styles: { font: 'helvetica', fontSize: personnel ? 8 : 9, cellPadding: personnel ? 1.1 : 2, textColor: [18, 54, 75], lineColor: personnel ? [215, 227, 232] : [232, 204, 209], lineWidth: .15, overflow: 'linebreak', valign: 'middle' },
      headStyles: { fillColor: heading, textColor: 255, fontStyle: 'bold' }, columnStyles,
      didParseCell: ({ section, row, cell }) => {
        if (section === 'body' && rows[row.index]?.person && content.showPhotos) cell.styles.minCellHeight = personnel ? 8.5 : 12;
      },
      didDrawPage: () => {
        const page = pdf.getCurrentPageInfo().pageNumber;
        if (!personnel && !decorated.has(page)) { header(pdf); decorated.add(page); }
      },
      didDrawCell: ({ section, row, column, cell }) => {
        const page = pdf.getCurrentPageInfo().pageNumber;
        bottoms.set(page, Math.max(bottoms.get(page) || 0, cell.y + cell.height));
        const person = section === 'body' ? rows[row.index]?.person : undefined;
        const source = content.showPhotos && person ? orgImageSource(person.photoUrl) : '';
        if (source && columns[column.index].key === 'photo') {
          const size = Math.min(cell.width - 2, cell.height - 2, personnel ? 7 : 10);
          drawPortrait(pdf, source, cell.x + (cell.width - size) / 2, cell.y + (cell.height - size) / 2, size);
        }
      },
    });
    const source = await PDFDocument.load(pdf.output('arraybuffer'));
    if (personnel) {
      const frame = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
      header(frame);
      const target = await PDFDocument.load(frame.output('arraybuffer'));
      const page = target.getPage(0);
      const totalHeight = [...bottoms.values()].reduce((sum, height) => sum + height, 0);
      const scale = Math.min(1, 236 / totalHeight);
      let top = 43;
      for (const [index, sourcePage] of source.getPages().entries()) {
        const height = bottoms.get(index + 1)!;
        const table = await target.embedPage(sourcePage, { left: 12 * MM, right: 198 * MM, top: sourcePage.getHeight(), bottom: sourcePage.getHeight() - height * MM });
        page.drawPage(table, { x: (210 - 186 * scale) / 2 * MM, y: page.getHeight() - (top + height * scale) * MM, width: 186 * scale * MM, height: height * scale * MM });
        top += height * scale;
      }
      const [single] = await result.copyPages(target, [0]); result.addPage(single);
    } else {
      for (const page of await result.copyPages(source, source.getPageIndices())) result.addPage(page);
    }
  }
  const font = await result.embedFont(StandardFonts.Helvetica);
  result.getPages().forEach((page, index) => {
    const color = rgb(82 / 255, 105 / 255, 120 / 255);
    page.drawLine({ start: { x: 12 * MM, y: 14 * MM }, end: { x: 198 * MM, y: 14 * MM }, thickness: .4, color });
    page.drawText('SeaPilot · Coordonnées issues des fiches RH / Brevets', { x: 12 * MM, y: 8 * MM, font, size: 7.5, color });
    const counter = `${index + 1} / ${result.getPageCount()}`;
    page.drawText(counter, { x: 198 * MM - font.widthOfTextAtSize(counter, 7.5), y: 8 * MM, font, size: 7.5, color });
  });
  return new Blob([new Uint8Array(await result.save())], { type: 'application/pdf' });
}
