import type { jsPDF as JsPdf } from 'jspdf';
import type autoTableType from 'jspdf-autotable';
import type { FleetVessel } from './fleetQueries';

const NAVY: [number, number, number] = [8, 38, 67];
const TEAL: [number, number, number] = [0, 150, 170];
const INK: [number, number, number] = [20, 38, 54];
const MUTED: [number, number, number] = [92, 111, 126];
const PALE: [number, number, number] = [240, 246, 248];

function text(value: string | number | null | undefined, suffix = ''): string {
  return value == null || value === '' ? '—' : `${value}${suffix}`;
}

async function urlToDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Image indisponible (${response.status}).`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('Image illisible.'));
    reader.readAsDataURL(blob);
  });
}

function addCoverImage(doc: JsPdf, dataUrl: string, width: number, height: number): void {
  const properties = doc.getImageProperties(dataUrl);
  const ratio = Math.max(width / properties.width, height / properties.height);
  const imageWidth = properties.width * ratio;
  const imageHeight = properties.height * ratio;
  doc.addImage(dataUrl, dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG', (width - imageWidth) / 2, (height - imageHeight) / 2, imageWidth, imageHeight, undefined, 'FAST');
}

function addBrandHeader(doc: JsPdf, logo: string, pageLabel: string): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageWidth, 24, 'F');
  doc.addImage(logo, 'PNG', 14, 5, 14, 14, undefined, 'FAST');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('BBTM', 32, 14.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(pageLabel.toUpperCase(), pageWidth - 14, 14.5, { align: 'right' });
  doc.setFillColor(...TEAL);
  doc.rect(0, 24, pageWidth, 1.2, 'F');
}

function addSectionTitle(doc: JsPdf, title: string, x: number, y: number): void {
  doc.setFillColor(...TEAL);
  doc.rect(x, y - 4, 2.2, 7, 'F');
  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(title, x + 5, y + 1);
}

function rows(values: Array<[string, string | number | null | undefined, string?]>): string[][] {
  return values.map(([label, value, suffix]) => [label, text(value, suffix)]);
}

function addSpecsTable(doc: JsPdf, autoTable: typeof autoTableType, body: string[][], x: number, y: number, width: number): void {
  autoTable(doc, {
    body,
    startY: y,
    margin: { left: x },
    tableWidth: width,
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: { top: 2.5, right: 2, bottom: 2.5, left: 2 } },
    columnStyles: {
      0: { textColor: MUTED, fontStyle: 'bold', cellWidth: width * 0.48 },
      1: { textColor: INK, fontStyle: 'bold' },
    },
    alternateRowStyles: { fillColor: PALE },
  });
}

function safeFileName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

export async function buildFleetBrochurePdf(vessel: FleetVessel, photoUrl: string): Promise<Blob> {
  if (vessel.assetKind !== 'vessel') throw new Error('La brochure est réservée aux navires.');
  const [{ jsPDF }, { default: autoTable }, logoData, photoData] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    urlToDataUrl('/bbtm-logo.png'),
    photoUrl ? urlToDataUrl(photoUrl) : Promise.resolve(''),
  ]);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  if (photoData) addCoverImage(doc, photoData, pageWidth, 178);
  else {
    doc.setFillColor(223, 233, 239);
    doc.rect(0, 0, pageWidth, 178, 'F');
  }
  doc.setFillColor(...NAVY);
  doc.rect(0, 168, pageWidth, pageHeight - 168, 'F');
  doc.setFillColor(...TEAL);
  doc.rect(0, 168, pageWidth, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(35);
  doc.text(vessel.name.toUpperCase(), 16, 199);
  doc.setTextColor(111, 226, 226);
  doc.setFontSize(13);
  doc.text((vessel.brochureSubtitle || vessel.typeLabel || 'NAVIRE').toUpperCase(), 16, 211);
  doc.setTextColor(221, 232, 239);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const coverSummary = vessel.brochureSummary || 'Caractéristiques techniques et capacités opérationnelles.';
  doc.text(doc.splitTextToSize(coverSummary, 126), 16, 224, { lineHeightFactor: 1.35 });
  doc.addImage(logoData, 'PNG', pageWidth - 50, 188, 28, 28, undefined, 'FAST');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text('BBTM', pageWidth - 36, 223, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text([vessel.lengthOverall, vessel.maxSpeedKnots ? `${vessel.maxSpeedKnots} nœuds` : '', vessel.maxPeople ? `${vessel.maxPeople} personnes` : ''].filter(Boolean).join('  ·  '), 16, 277);

  doc.addPage();
  addBrandHeader(doc, logoData, `${vessel.name} · Caractéristiques`);
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.text(vessel.name.toUpperCase(), 14, 43);
  doc.setTextColor(...TEAL);
  doc.setFontSize(10);
  doc.text((vessel.brochureSubtitle || vessel.typeLabel || 'NAVIRE').toUpperCase(), 14, 51);

  addSectionTitle(doc, 'Identification', 14, 66);
  addSpecsTable(doc, autoTable, rows([
    ['Pavillon', vessel.flagState], ['Année de construction', vessel.builtYear], ['Classification', vessel.classificationLabel],
    ['Catégorie de navigation', vessel.navigationCategory], ['Immatriculation', vessel.registrationNumber], ['N° IMO', vessel.imoNumber],
    ['Port', vessel.registrationPort], ['Indicatif', vessel.callSign], ['MMSI', vessel.mmsi],
  ]), 14, 72, 87);
  addSectionTitle(doc, 'Dimensions & capacités', 109, 66);
  addSpecsTable(doc, autoTable, rows([
    ['Longueur hors tout', vessel.lengthOverall], ['Largeur hors tout', vessel.beamOverallM, ' m'], ['Jauge brute', vessel.grossTonnage, ' UMS'],
    ['Déplacement lège', vessel.lightshipTonnes, ' t'], ['Port en lourd', vessel.deadweightTonnes, ' t'],
    ['Effectif minimal', vessel.safeManning], ['Personnes à bord', vessel.maxPeople], ['Carburant', vessel.fuelCapacityM3, ' m³'],
  ]), 109, 72, 87);

  addSectionTitle(doc, 'Propulsion & performances', 14, 165);
  addSpecsTable(doc, autoTable, rows([
    ['Moteur principal', vessel.mainEngine], ['Puissance moteur', vessel.mainEnginePowerKw, ' kW'],
    ['Propulseur d’étrave', vessel.bowThrusterPowerKw, ' kW'], ['Groupes électrogènes', vessel.gensets],
    ['Vitesse maximale', vessel.maxSpeedKnots, ' nœuds'], ['Traction au point fixe', vessel.bollardPullTonnes, ' t'],
    ['Autonomie', vessel.rangeDescription],
  ]), 14, 171, 182);

  addSectionTitle(doc, 'Capacités opérationnelles', 14, 247);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...INK);
  const operations = vessel.brochureOperations.length ? vessel.brochureOperations : ['Opérations maritimes polyvalentes'];
  operations.forEach((operation, index) => {
    const x = 14 + (index % 2) * 92;
    const y = 257 + Math.floor(index / 2) * 12;
    doc.setFillColor(...TEAL);
    doc.circle(x + 2, y - 1, 1.5, 'F');
    doc.text(operation, x + 7, y);
  });

  doc.addPage();
  addBrandHeader(doc, logoData, `${vessel.name} · Équipements`);
  if (photoData) doc.addImage(photoData, photoData.startsWith('data:image/png') ? 'PNG' : 'JPEG', 14, 38, 182, 94, undefined, 'FAST');
  addSectionTitle(doc, 'Équipements de pont', 14, 151);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...INK);
  doc.text(doc.splitTextToSize(vessel.deckEquipment || 'Non renseigné.', 182), 14, 160, { lineHeightFactor: 1.35 });
  addSectionTitle(doc, 'Navigation & communications', 14, 190);
  doc.text(doc.splitTextToSize(vessel.electronicsCommunications || 'Non renseigné.', 182), 14, 199, { lineHeightFactor: 1.35 });
  addSectionTitle(doc, 'Aménagements', 14, 229);
  doc.text(doc.splitTextToSize(vessel.accommodation || 'Non renseigné.', 182), 14, 238, { lineHeightFactor: 1.35 });
  doc.setDrawColor(214, 226, 234);
  doc.line(14, 272, 196, 272);
  doc.setTextColor(...MUTED);
  doc.setFontSize(7.5);
  doc.text('Document édité à partir des caractéristiques enregistrées dans le référentiel BBTM.', 14, 279);
  doc.text(new Intl.DateTimeFormat('fr-FR').format(new Date()), 196, 279, { align: 'right' });

  doc.setProperties({ title: `${vessel.name} — Brochure technique`, subject: 'Caractéristiques du navire', author: 'BBTM', creator: 'BBTM' });
  return doc.output('blob');
}

export async function downloadFleetBrochure(vessel: FleetVessel, photoUrl: string): Promise<void> {
  const blob = await buildFleetBrochurePdf(vessel, photoUrl);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `brochure-${safeFileName(vessel.name) || 'navire'}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
}
