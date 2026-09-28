import { CONTRACT_PAGE_SIZE, type StyledContractDocument } from './projectStyledContract';

export async function renderStyledContractPdf(
  layout: StyledContractDocument,
  fileName: string,
  subject: string,
  signatureUrl?: string,
  signatureMimeType?: string,
): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const load = async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Impossible de charger la ressource du contrat : ${url}`);
    return new Uint8Array(await response.arrayBuffer());
  };
  const [logoBytes, signatureBytes] = await Promise.all([
    load('/bbtm-report-logo.png'),
    signatureUrl ? load(signatureUrl).catch(() => null) : Promise.resolve(null),
  ]);
  const pdf = await PDFDocument.create();
  const [regular, bold, logo] = await Promise.all([
    pdf.embedFont(StandardFonts.Helvetica),
    pdf.embedFont(StandardFonts.HelveticaBold),
    pdf.embedPng(logoBytes),
  ]);
  let signature = null;
  if (signatureBytes) {
    try {
      signature = signatureMimeType === 'image/jpeg'
        ? await pdf.embedJpg(signatureBytes)
        : await pdf.embedPng(signatureBytes);
    } catch { signature = null; }
  }
  const color = (hex: string) => rgb(...[1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255) as [number, number, number]);
  layout.pages.forEach((items) => {
    const page = pdf.addPage([CONTRACT_PAGE_SIZE.width, CONTRACT_PAGE_SIZE.height]);
    items.forEach((item) => {
      if (item.type === 'circle') {
        page.drawCircle({ x: item.x, y: CONTRACT_PAGE_SIZE.height - item.y, size: item.radius, color: color(item.fill) });
      } else if (item.type === 'rect') {
        page.drawRectangle({ x: item.x, y: CONTRACT_PAGE_SIZE.height - item.y - item.height, width: item.width, height: item.height, color: color(item.fill), borderColor: item.stroke ? color(item.stroke) : undefined, borderWidth: item.stroke ? .5 : 0 });
      } else if (item.type === 'image') {
        const image = item.source === 'logo' ? logo : signature;
        if (!image) return;
        const scaled = image.scaleToFit(item.width, item.height);
        page.drawImage(image, { x: item.x, y: CONTRACT_PAGE_SIZE.height - item.y - (item.height + scaled.height) / 2, width: scaled.width, height: scaled.height });
      } else {
        item.lines.forEach((line, index) => page.drawText(line, { x: item.x, y: CONTRACT_PAGE_SIZE.height - item.y - item.size - index * item.leading, size: item.size, font: item.weight === 'bold' ? bold : regular, color: color(item.color) }));
      }
    });
  });
  pdf.setTitle(fileName);
  pdf.setSubject(subject);
  pdf.setCreator('BBTM');
  return new Blob([new Uint8Array(await pdf.save())], { type: 'application/pdf' });
}
