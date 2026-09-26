import { layoutOrganigramme, ORG_COLORS, organigrammeSvg, paginateOrganigramme, type OrgDiagram } from './organigrammeDiagram';
import { ORGANIGRAMME_REFERENCE, ORGANIGRAMME_SOURCE, type OrgSection, type OrganigrammeView } from './organigrammeModel';

export function downloadOrgBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.hidden = true;
  document.body.append(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function buildOrgImage(sections: OrgSection[], showVessels: boolean, format: 'svg' | 'png'): Promise<Blob> {
  const diagram = layoutOrganigramme(sections, showVessels);
  const svg = new Blob([organigrammeSvg(diagram)], { type: 'image/svg+xml;charset=utf-8' });
  if (format === 'svg') return svg;
  const scale = Math.min(2, 16000 / diagram.width, 16000 / diagram.height, Math.sqrt(40_000_000 / (diagram.width * diagram.height)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(diagram.width * scale); canvas.height = Math.ceil(diagram.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('L’export PNG est indisponible. Utilisez le format SVG.');
  const url = URL.createObjectURL(svg);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('Impossible de préparer l’image.')); img.src = url; });
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Image trop grande. Utilisez le format SVG.')), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}

export async function buildOrgPdf(sections: OrgSection[], showVessels: boolean, asOf: string, view: OrganigrammeView, logoBytes?: Uint8Array): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  if (!logoBytes) {
    const response = await fetch('/bbtm-report-logo.png');
    if (!response.ok) throw new Error('Impossible de charger le logo BBTM.');
    logoBytes = new Uint8Array(await response.arrayBuffer());
  }
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  pdf.setProperties({ title: `Organigramme BBTM — ${ORGANIGRAMME_REFERENCE}`, subject: `Situation au ${asOf}`, creator: 'SeaPilot' });
  const pages = paginateOrganigramme(sections, showVessels);
  const draw = (diagram: OrgDiagram) => {
    const scale = Math.min(0.31, 277 / diagram.width, 158 / diagram.height);
    const offsetX = (297 - diagram.width * scale) / 2;
    const offsetY = 35;
    pdf.setLineWidth(0.35); pdf.setDrawColor(ORG_COLORS.line);
    diagram.lines.forEach((line) => { pdf.setLineDashPattern(line.dashed ? [1.5, 1.2] : [], 0); pdf.line(offsetX + line.x1 * scale, offsetY + line.y1 * scale, offsetX + line.x2 * scale, offsetY + line.y2 * scale); });
    pdf.setLineDashPattern([], 0);
    diagram.boxes.forEach((box) => {
      pdf.setFillColor(ORG_COLORS[box.tone]); pdf.setDrawColor(box.tone === 'white' ? ORG_COLORS.border : ORG_COLORS[box.tone]);
      pdf.roundedRect(offsetX + box.x * scale, offsetY + box.y * scale, box.width * scale, box.height * scale, 2, 2, 'FD');
      let baseline = box.y + 14;
      box.lines.forEach((line) => {
        baseline += line.size + 5;
        pdf.setFont('helvetica', line.bold ? 'bold' : 'normal');
        pdf.setFontSize(line.size * scale * 72 / 25.4);
        pdf.setTextColor(box.tone === 'navy' ? '#ffffff' : line.bold ? ORG_COLORS.ink : ORG_COLORS.muted);
        pdf.text(line.text, offsetX + (box.x + box.width / 2) * scale, offsetY + (baseline - 5) * scale, { align: 'center' });
      });
    });
  };
  pages.forEach((diagram, index) => {
    if (index) pdf.addPage();
    pdf.setFillColor(ORG_COLORS.navy); pdf.rect(0, 0, 297, 4, 'F');
    const logo = pdf.getImageProperties(logoBytes!);
    const logoScale = Math.min(29 / logo.width, 19 / logo.height);
    pdf.addImage(logoBytes!, 'PNG', 12, 8, logo.width * logoScale, logo.height * logoScale);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(19); pdf.setTextColor(ORG_COLORS.navy);
    pdf.text('Organigramme BBTM', 49, 17);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10);
    pdf.text(`${view === 'vessels' ? 'Par navire et bordée' : 'Par fonction'} · Situation au ${asOf.split('-').reverse().join('/')}`, 49, 25);
    pdf.setFontSize(9); pdf.text(ORGANIGRAMME_REFERENCE, 285, 16, { align: 'right' });
    pdf.setDrawColor('#1b888c'); pdf.line(12, 31, 285, 31);
    draw(diagram);
    pdf.setDrawColor(ORG_COLORS.border); pdf.line(12, 198, 285, 198);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(ORG_COLORS.muted);
    pdf.text(`Référence : ${ORGANIGRAMME_SOURCE} · ${ORGANIGRAMME_REFERENCE}`, 12, 204);
    pdf.text(`${index + 1} / ${pages.length}`, 285, 204, { align: 'right' });
  });
  if (!pages.length) throw new Error('Aucun organigramme à exporter.');
  return pdf.output('blob');
}
