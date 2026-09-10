import type { jsPDF as PdfDocument } from 'jspdf';
import { applicableCodes, groupByAccessory } from './liftingControls';
import { INSPECTOR, type LiftingItem, type LiftingKind, type LiftingVessel } from './liftingModel';
import { appendLiftingControlNotice } from './liftingPdf';

const INK: [number, number, number] = [28, 49, 60];
const clean = (value: string) => value.replace(/[’‘]/g, "'").replace(/[–—]/g, '-').replace(/\u00a0/g, ' ');
function emptyBox(pdf: PdfDocument, x: number, y: number, label: string) {
  pdf.setDrawColor(70, 80, 85); pdf.setTextColor(...INK); pdf.setLineWidth(.2);
  pdf.rect(x, y - 2, 2.5, 2.5); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.text(label, x + 3.7, y);
}

export async function buildLiftingPaperPdf(vessel: LiftingVessel, kind: LiftingKind, inventory: LiftingItem[], options: { includeNotice?: boolean; generatedAt?: Date } = {}) {
  const items = inventory.filter((item) => item.active && item.vessel_id === vessel.id && item.kind === kind);
  if (!items.length) throw new Error('Aucun matériel actif à imprimer pour ce registre.');
  const generatedAt = options.generatedAt || new Date();
  const generatedDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(generatedAt);
  const generatedLabel = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }).format(generatedAt);
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const pdf = new jsPDF({ format: 'a4', orientation: 'landscape', unit: 'mm', compress: true });
  const register = kind === 'lifting' ? 'Apparaux de levage' : 'Remorques';
  pdf.setProperties({ title: `Fiche de contrôle papier - ${vessel.name} - ${register}`, subject: 'Inventaire actif : saisie manuelle avant report dans SeaPilot', creator: 'SeaPilot' });
  const codes = kind === 'lifting' ? ['EG', 'ID', 'V1', 'V2', 'V3', 'V4', 'V5'] as const : ['EG', 'NID', 'V1', 'V2', 'V3', 'V4', 'V5'] as const;
  const lastY = () => (pdf as PdfDocument & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 35;
  autoTable(pdf, {
    startY: 33, margin: { left: 12, right: 12 }, theme: 'plain', styles: { fontSize: 9, cellPadding: 1.7, textColor: INK },
    body: [
      ['Navire / site', clean(vessel.name), 'Immatriculation', clean(vessel.registration_number || '-')],
      ['Vérificateur prévu', INSPECTOR, 'Inventaire extrait le', generatedLabel],
      ['Date du contrôle', '____ / ____ / ________', 'Lieu du contrôle', '________________________________'],
    ], columnStyles: { 0: { fontStyle: 'bold' }, 2: { fontStyle: 'bold' } },
  });
  let y = lastY() + 6;
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(...INK);
  pdf.text('Pour chaque code, cocher C : conforme ou NC : non conforme. Cases vides : non contrôlé. - : non applicable. ? : points à définir.', 12, y);
  pdf.text('Cocher une décision et noter les observations. Reporter ensuite ces résultats dans le contrôle numérique SeaPilot.', 12, y + 4.5);
  y += 9;
  for (const group of groupByAccessory(items, (item) => item)) {
    if (y > 153) { pdf.addPage('a4', 'landscape'); y = 33; }
    autoTable(pdf, {
      startY: y, margin: { top: 33, bottom: 17, left: 12, right: 12 }, theme: 'grid',
      styles: { fontSize: 8, textColor: INK, lineColor: [160, 172, 178], lineWidth: .15, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [235, 241, 243], textColor: INK, fontStyle: 'bold', fontSize: 8 },
      head: [
        [{ content: clean(`${group.label}${group.definition?.en ? ` / ${group.definition.en}` : ''}`), colSpan: 12, styles: { fontSize: 10 } }],
        ['N°', 'Description / Identification', 'CMU (t)', ...codes, 'Décision', 'Observations manuscrites'],
      ],
      body: group.rows.map((item) => [
        { content: item.reference, styles: { fontStyle: 'bold', halign: 'center', minCellHeight: 28 } },
        clean([item.description, item.serial_number && `N° série : ${item.serial_number}`, item.location, !applicableCodes(item).length && 'Notice de contrôle à compléter.'].filter(Boolean).join('\n')),
        item.swl_tonnes === null ? '-' : String(item.swl_tonnes).replace('.', ','),
        ...codes.map(() => ''), '', '',
      ]),
      columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: 58 }, 2: { cellWidth: 14 },
        ...Object.fromEntries(codes.map((_, index) => [index + 3, { cellWidth: 10 }])),
        10: { cellWidth: 43 }, 11: { cellWidth: 76 } },
      rowPageBreak: 'avoid',
      didDrawCell: (data) => {
        if (data.section !== 'body') return;
        const item = group.rows[data.row.index]; if (!item) return;
        const cell = data.cell;
        if (data.column.index >= 3 && data.column.index <= 9) {
          const applicable = applicableCodes(item);
          if (applicable.includes(codes[data.column.index - 3])) {
            emptyBox(pdf, cell.x + 1.6, cell.y + 9, 'C'); emptyBox(pdf, cell.x + 1.6, cell.y + 20, 'NC');
          } else {
            pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(110, 120, 125);
            pdf.text(applicable.length ? '-' : '?', cell.x + cell.width / 2, cell.y + 15, { align: 'center' });
          }
        }
        if (data.column.index === 10) {
          emptyBox(pdf, cell.x + 2, cell.y + 5, 'Maintien en service');
          emptyBox(pdf, cell.x + 2, cell.y + 13, 'Maintien en service');
          pdf.text('après réparation', cell.x + 5.7, cell.y + 17);
          emptyBox(pdf, cell.x + 2, cell.y + 25, 'Mise au rebut');
        }
        if (data.column.index === 11) {
          pdf.setDrawColor(185, 195, 200); pdf.setLineWidth(.12);
          for (const offset of [8, 16, 24]) pdf.line(cell.x + 2, cell.y + offset, cell.x + cell.width - 2, cell.y + offset);
        }
      },
    });
    y = lastY() + 5;
  }
  if (options.includeNotice !== false) appendLiftingControlNotice(pdf, autoTable, kind);
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page); const right = pdf.internal.pageSize.getWidth() - 12; const bottom = pdf.internal.pageSize.getHeight() - 12;
    pdf.setTextColor(...INK); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(15); pdf.text('FICHE DE CONTRÔLE PAPIER', 12, 14);
    pdf.setFontSize(10); pdf.setFont('helvetica', 'normal'); pdf.text(clean(`${vessel.name} - ${register}`), 12, 21);
    pdf.setFontSize(8); pdf.text(`${items.length} ${items.length === 1 ? 'matériel actif' : 'matériels actifs'} | Extrait le ${generatedLabel}`, right, 27, { align: 'right' });
    pdf.setDrawColor(175, 185, 190); pdf.line(12, 29, right, 29); pdf.line(12, bottom, right, bottom);
    pdf.setFontSize(8); pdf.text('Fiche de saisie avant contrôle | Résultats à reporter dans le contrôle numérique', 12, bottom + 5);
    pdf.text(`${page} / ${pages}`, right, bottom + 5, { align: 'right' });
  }
  return { blob: pdf.output('blob'), filename: `${vessel.acronym || vessel.name} - Fiche de contrôle papier - ${register} - ${generatedDate}.pdf`, itemCount: items.length };
}
