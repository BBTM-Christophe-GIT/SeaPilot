import type { jsPDF as JsPdfType } from 'jspdf';
import {
  type QhseReportContent, type QhseReportOptions, type QhseReportSnapshot,
} from './qhseReportData';
import { qhseReportFileName, type QhseReportDefinition } from './qhseReportCatalog';
import { drawConsumptionPdf } from './qhseConsumptionPdf';
import { drawMaritimePdf } from './qhseMaritimePdf';


let logoPromise: Promise<string> | null = null;
const imagePromises = new Map<string, Promise<string>>();

async function loadPublicImage(path: string): Promise<string> {
  if (!imagePromises.has(path)) imagePromises.set(path, (async () => {
    try {
      const response = await fetch(path);
      if (!response.ok) return '';
      const blob = await response.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    } catch { return ''; }
  })());
  return imagePromises.get(path)!;
}

async function loadLogo(): Promise<string> {
  if (!logoPromise) {
    logoPromise = loadPublicImage('/bbtm-report-logo.png');
  }
  return logoPromise;
}

export function fitImageWithinBox(imageWidth: number, imageHeight: number, boxWidth: number, boxHeight: number) {
  if (imageWidth <= 0 || imageHeight <= 0 || boxWidth <= 0 || boxHeight <= 0) return { width: 0, height: 0 };
  const scale = Math.min(boxWidth / imageWidth, boxHeight / imageHeight);
  return { width: imageWidth * scale, height: imageHeight * scale };
}

function drawReportLogo(doc: JsPdfType, logo: string, x: number, y: number, boxWidth: number, boxHeight: number): void {
  if (!logo) return;
  const properties = doc.getImageProperties(logo);
  const size = fitImageWithinBox(properties.width, properties.height, boxWidth, boxHeight);
  doc.addImage(logo, 'PNG', x + ((boxWidth - size.width) / 2), y + ((boxHeight - size.height) / 2), size.width, size.height, undefined, 'FAST');
}

export function sanitizeQhsePdfText(value: string): string {
  return value.replace(/[\u202f\u00a0]/g, ' ').replace(/SeaPilot/gi, 'Supabase').replace(/Supabase\s+Supabase/gi, 'Supabase').replace(/₂/g, '2').replace(/≥/g, '>=').replace(/≤/g, '<=');
}

function pageScope(snapshot: QhseReportSnapshot): string {
  const years = [...new Set(snapshot.scope.years?.length ? snapshot.scope.years : [snapshot.scope.year])].sort((left, right) => left - right);
  const period = years.length === 1 ? String(years[0]) : `${years[0]}–${years.at(-1)}`;
  const vessels = snapshot.scope.vesselNames?.length ? snapshot.scope.vesselNames.join(', ') : snapshot.scope.vesselName;
  const projects = snapshot.scope.projectNames?.length ? snapshot.scope.projectNames.join(', ') : snapshot.scope.projectName;
  return `${period} · ${vessels || 'Tous les navires'} · ${projects || 'Tous les projets'}`;
}

function drawEnvironmentalImpact(doc: JsPdfType, impact: NonNullable<QhseReportContent['environmentalImpact']>, x: number, y: number, width: number): number {
  const number = (value: number) => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value).replace(/\u202f/g, ' ');
  const green: [number, number, number] = [18, 116, 70];
  const textX = x + 17;
  const textWidth = width - 22;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
  const reduction = `${number(impact.avoidedTonnes)} tonnes.`;
  doc.setFont('helvetica', 'bold');
  const reductionWidth = doc.getTextWidth(reduction);
  doc.setFont('helvetica', 'normal');
  const ending = "dans l'atmosphère de ";
  const body: string[] = [''];
  // Keep the ending and the bold dynamic quantity together, wrapping earlier words if needed.
  for (const word of 'Les additifs enzymatiques XBEE utilisés par BBTM ont permis de réduire les émissions de CO2'.split(' ')) {
    const last = body.length - 1;
    const candidate = body[last] ? `${body[last]} ${word}` : word;
    if (doc.getTextWidth(candidate) > textWidth) body.push(word); else body[last] = candidate;
  }
  const last = body.length - 1;
  if (doc.getTextWidth(`${body[last]} ${ending}`) + reductionWidth + 0.5 > textWidth) body.push(ending);
  else body[last] += ` ${ending}`;
  const baseline = doc.splitTextToSize(`Sans additif, les rejets de CO2 auraient été de ${number(impact.baselineTonnes)} tonnes de CO2.`, textWidth) as string[];
  const height = 16.2 + body.length * 2.8 + baseline.length * 2.8;
  doc.setDrawColor(160, 212, 182); doc.setFillColor(239, 249, 242); doc.setLineWidth(0.3);
  doc.roundedRect(x, y, width, height, 2.5, 2.5, 'FD');
  doc.setFillColor(...green); doc.roundedRect(x, y + 3, 1, height - 6, 0.5, 0.5, 'F');
  doc.setFillColor(215, 239, 224); doc.circle(x + 9, y + 9, 4.5, 'F');
  // Small vector leaf remains sharp in print at any PDF zoom.
  doc.setDrawColor(...green); doc.setLineWidth(0.35);
  doc.lines([[0, -2.5, 1.5, -4, 5, -4], [0, 3, -1.5, 4.5, -5, 4]], x + 6.5, y + 11, [1, 1], 'S', true);
  doc.line(x + 6.2, y + 11.7, x + 10.3, y + 8.4);
  doc.setTextColor(...green); doc.setFont('helvetica', 'bold'); doc.setFontSize(5.7);
  doc.text('IMPACT ENVIRONNEMENTAL · XBEE', textX, y + 4.5);
  doc.setFontSize(9);
  doc.text(`${number(impact.emittedTonnes)} tonnes de CO2 ont été émis.`, textX, y + 9.3);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(48, 77, 60);
  body.forEach((line, index) => doc.text(line, textX, y + 14 + index * 2.8));
  const reductionY = y + 14 + (body.length - 1) * 2.8;
  const reductionX = textX + doc.getTextWidth(body.at(-1)!) + 0.5;
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...green);
  doc.text(reduction, reductionX, reductionY);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(76, 104, 86);
  doc.text(baseline, textX, reductionY + 4, { lineHeightFactor: 1.22 });
  return height;
}

export async function buildQhseReportPdf(report: QhseReportDefinition, snapshot: QhseReportSnapshot, options: QhseReportOptions = {}): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ format: 'a4', unit: 'mm', orientation: 'portrait' });
  const logo = await loadLogo();
  doc.setProperties({ title: report.title, subject: `Rapport QHSE BBTM · ${pageScope(snapshot)}`, author: 'BBTM', creator: 'BBTM' });
  const assets = {
    logo: () => drawReportLogo(doc, logo, 14, 6, 20, 20),
    impact: (impact: NonNullable<QhseReportContent['environmentalImpact']>, impactY: number) => drawEnvironmentalImpact(doc, impact, 14, impactY, 182),
    clean: sanitizeQhsePdfText,
  };
  return report.id === 'consumption'
    ? drawConsumptionPdf(doc, report, snapshot, options, assets)
    : drawMaritimePdf(doc, report, snapshot, options, assets);
}

export async function buildQhseReportArchive(
  reports: readonly QhseReportDefinition[],
  snapshot: QhseReportSnapshot,
  onProgress?: (completed: number, total: number) => void,
  options: QhseReportOptions = {},
): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const archive = new JSZip();
  for (let index = 0; index < reports.length; index += 1) {
    const report = reports[index];
    const blob = await buildQhseReportPdf(report, snapshot, options);
    archive.file(qhseReportFileName(
      report,
      snapshot.scope.years || snapshot.scope.year,
      snapshot.scope.vesselNames?.join('-') || snapshot.scope.vesselName,
      snapshot.scope.projectNames?.join('-') || snapshot.scope.projectName,
    ), await blob.arrayBuffer());
    onProgress?.(index + 1, reports.length);
  }
  return archive.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export function downloadQhseBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function qhseReportArchiveFileName(snapshot: QhseReportSnapshot): string {
  const vesselName = snapshot.scope.vesselNames?.join('-') || snapshot.scope.vesselName;
  const vessel = vesselName
    ? `-${vesselName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`
    : '-flotte';
  const projectName = snapshot.scope.projectNames?.join('-') || snapshot.scope.projectName;
  const project = projectName
    ? `-${projectName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`
    : '-tous-projets';
  const years = [...new Set(snapshot.scope.years?.length ? snapshot.scope.years : [snapshot.scope.year])].sort((left, right) => left - right);
  const period = years.length === 1 ? String(years[0]) : `${years[0]}-${years.at(-1)}`;
  return `rapports-qhse-${period}${vessel}${project}.zip`;
}
