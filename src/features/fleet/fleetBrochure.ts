import type { jsPDF as JsPdf } from 'jspdf';
import gouryPlan from '../workPermits/assets/goury-pont-principal.webp';
import hirondelleCabin from './assets/hirondelle-cabine.jpg';
import { drawBrochureIcon, type FleetBrochureIcon } from './fleetBrochureIcons';
import { getFleetBrochureCover, getFleetLayoutSections, type FleetBrochureLanguage, type FleetLayout } from './fleetLayout';
import type { FleetVessel } from './fleetQueries';

export type FleetBrochureFormat = 'a4' | 'folded';
export type { FleetBrochureLanguage } from './fleetLayout';

interface FleetBrochureOptions {
  format?: FleetBrochureFormat;
  language?: FleetBrochureLanguage;
  layout?: FleetLayout;
  fallbackPhotoUrls?: readonly string[];
}

type Color = [number, number, number];
type LayoutSection = ReturnType<typeof getFleetLayoutSections>[number];
type LayoutField = LayoutSection['fields'][number];

interface PdfImage {
  data: Uint8Array;
  width: number;
  height: number;
}

interface Panel {
  x: number;
  width: number;
  height: number;
  margin: number;
}

interface Annex {
  url: string;
  label?: string;
  title: string;
  description: string;
}

interface CoverOverflow {
  presentation: string[];
  missionsTitle: string;
  missions: string[];
}

interface SectionColumn {
  section: LayoutSection;
  fields: readonly LayoutField[];
  showHeading: boolean;
}

interface InteriorStyle {
  heading: number;
  body: number;
  line: number;
  rowPadding: number;
  sectionGap: number;
}

interface MeasuredRow {
  label: string[];
  value: string[];
  labelWidth: number;
  height: number;
  stacked: boolean;
  icon?: FleetBrochureIcon;
}

const ink: Color = [29, 30, 32];
const gray: Color = [83, 85, 89];
const lineColor: Color = [215, 216, 219];
const softGray: Color = [237, 238, 239];
const charcoal: Color = [37, 39, 42];
const lightText: Color = [230, 230, 231];
const white: Color = [255, 255, 255];
const orange: Color = [255, 153, 95];
const orangeLine: Color = [99, 101, 104];

const sectionIcons: Partial<Record<string, FleetBrochureIcon>> = {
  identity: 'flag', dimensions: 'ruler', propulsion: 'propeller', navigation: 'radar',
  crew: 'people', equipment: 'crane', capacities: 'box',
};
const equipmentIcons: Partial<Record<string, FleetBrochureIcon>> = {
  deckEquipment: 'crane', electronicsCommunications: 'radar', accommodation: 'bed',
};

const a4Style: InteriorStyle = { heading: 15, body: 10, line: 13, rowPadding: 8, sectionGap: 23 };
const a4CompactStyle: InteriorStyle = { heading: 14, body: 9.6, line: 12, rowPadding: 5.3, sectionGap: 16 };
const foldedStyle: InteriorStyle = { heading: 12.5, body: 8.6, line: 10.5, rowPadding: 6, sectionGap: 16 };
const compactStyle: InteriorStyle = { heading: 11.4, body: 7.8, line: 9, rowPadding: 3.7, sectionGap: 11 };
const condensedStyle: InteriorStyle = { heading: 10.6, body: 7.6, line: 8.5, rowPadding: 2.4, sectionGap: 8 };

const copy = {
  fr: { contact: 'Contact commercial', technical: 'Caractéristiques', equipment: 'Équipements à bord', continued: ' · suite',
    fullVersion: 'Caractéristiques détaillées dans la plaquette A4.', moreMissions: 'autres missions', presentation: 'Présentation',
    documentTitle: 'Plaquette BBTM', subject: 'Caractéristiques du navire' },
  en: { contact: 'Commercial enquiries', technical: 'Vessel specifications', equipment: 'Onboard equipment', continued: ' · continued',
    fullVersion: 'See the full A4 brochure for detailed specifications.', moreMissions: 'more missions', presentation: 'Overview',
    documentTitle: 'BBTM brochure', subject: 'Vessel specifications' },
} as const;

const annexes: Partial<Record<string, Record<FleetBrochureLanguage, Annex>>> = {
  GOURY: {
    fr: { url: gouryPlan, label: 'Plan du pont', title: 'Pont principal',
      description: 'Le plan situe la salle de travail, l’atelier, le carré, la cuisine et les cabines.' },
    en: { url: gouryPlan, label: 'Deck plan', title: 'Main deck',
      description: 'The plan shows the operations room, workshop, mess, galley and cabins.' },
  },
  'HIRONDELLE DE LA MANCHE': {
    fr: { url: hirondelleCabin, title: 'Cabine de travail',
      description: 'Cinq sièges suspendus accueillent l’équipe à bord. Une table de survey avec écran permet de suivre les opérations depuis la cabine.' },
    en: { url: hirondelleCabin, title: 'Survey cabin',
      description: 'Five suspension seats accommodate the team. A survey desk with a screen lets operators monitor work from the cabin.' },
  },
};

function safeFileName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

export function fleetBrochureFileName(vesselName: string, format: FleetBrochureFormat = 'a4', language: FleetBrochureLanguage = 'fr'): string {
  const suffix = format === 'folded' ? (language === 'en' ? '-folded-a4' : '-a4-pliee') : '';
  return `brochure-${safeFileName(vesselName) || 'navire'}${suffix}${language === 'en' ? '-en' : ''}.pdf`;
}

async function readImage(doc: JsPdf, url: string): Promise<PdfImage> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Image indisponible (${response.status}).`);
  const data = new Uint8Array(await response.arrayBuffer());
  const { width, height } = doc.getImageProperties(data);
  if (!width || !height) throw new Error('Image illisible.');
  return { data, width, height };
}

async function firstImage(doc: JsPdf, urls: readonly string[]): Promise<PdfImage | undefined> {
  for (const url of new Set(urls.filter(Boolean))) {
    try {
      return await readImage(doc, url);
    } catch {
      // A stale private URL or an unreadable optional image can be replaced by the next candidate.
    }
  }
  return undefined;
}

function font(doc: JsPdf, size: number, bold: boolean, color: Color = ink): void {
  doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size).setTextColor(...color);
}

function wrap(doc: JsPdf, value: string, width: number, size: number, bold = false): string[] {
  font(doc, size, bold);
  return doc.splitTextToSize(value.trim(), width) as string[];
}

function limitedLines(doc: JsPdf, lines: string[], count: number, width: number): string[] {
  if (lines.length <= count) return lines;
  const result = lines.slice(0, count);
  let end = result[count - 1].trimEnd();
  while (end && doc.getTextWidth(`${end}…`) > width) end = end.slice(0, -1);
  result[count - 1] = `${end.trimEnd()}…`;
  return result;
}

function writeLines(doc: JsPdf, lines: string[], x: number, y: number, lineHeight: number): void {
  lines.forEach((line, index) => doc.text(line, x, y + index * lineHeight));
}

function image(doc: JsPdf, asset: PdfImage, x: number, y: number, width: number, height: number): void {
  doc.addImage(asset.data, x, y, width, height, undefined, 'FAST');
}

function rect(doc: JsPdf, x: number, y: number, width: number, height: number, color: Color): void {
  doc.setFillColor(...color).rect(x, y, width, height, 'F');
}

function rule(doc: JsPdf, x1: number, y1: number, x2: number, y2: number, color = lineColor, weight = 0.5): void {
  doc.setDrawColor(...color).setLineWidth(weight).line(x1, y1, x2, y2);
}

function brand(doc: JsPdf, logo: PdfImage, panel: Panel, y: number, size: number): void {
  const x = panel.x + panel.margin;
  image(doc, logo, x, y, size, size);
  font(doc, size * 0.52, true);
  doc.text('BBTM', x + size + 9, y + size * 0.47);
  font(doc, size * 0.27, false, gray);
  doc.text('Benjamin Bon Travaux Maritimes', x + size + 9, y + size * 0.87);
}

function contact(doc: JsPdf, right: number, top: number, scale: number, language: FleetBrochureLanguage): void {
  font(doc, 8 * scale, true, gray);
  doc.text(copy[language].contact, right, top, { align: 'right' });
  const lines = [
    { text: '+33 6 65 33 94 07', size: 11, bold: true, url: 'tel:+33665339407' },
    { text: 'bbtm.fr', size: 9, bold: false, url: 'https://www.bbtm.fr' },
  ];
  lines.forEach(({ text, size, bold, url }, index) => {
    font(doc, size * scale, bold);
    const y = top + (13 + index * 12) * scale;
    doc.text(text, right, y, { align: 'right' });
    const width = doc.getTextWidth(text);
    doc.link(right - width, y - size * scale, width, (size + 2) * scale, { url });
  });
}

function missionIcon(text: string): FleetBrochureIcon {
  const name = text.toLowerCase();
  if (/surveill|watch|guard/.test(name)) return 'eye';
  if (/plong|diving|sauvet/.test(name)) return 'lifeBuoy';
  if (/rov|survey|hydro/.test(name)) return 'waves';
  if (/matériel|cargo|fret/.test(name)) return 'box';
  if (/personnel|équipe|crew/.test(name)) return 'people';
  return 'anchor';
}

function renderCover(doc: JsPdf, panel: Panel, vessel: FleetVessel, logo: PdfImage, cover: PdfImage | undefined, folded: boolean, language: FleetBrochureLanguage): CoverOverflow {
  const headerScale = folded ? 1 : 1.36;
  const left = panel.x + panel.margin;
  const right = panel.x + panel.width - panel.margin;
  const width = right - left;
  brand(doc, logo, panel, 23 * headerScale, 28 * headerScale);
  contact(doc, right, 28 * headerScale, headerScale, language);

  const pictureTop = 72 * headerScale;
  const inset = folded ? 0 : 16 * headerScale;
  const pictureWidth = panel.width - 2 * inset;
  const pictureMaxHeight = panel.height * (folded ? 0.535 : 0.445);
  const pictureHeight = cover ? Math.min(pictureMaxHeight, pictureWidth * cover.height / cover.width) : pictureMaxHeight * 0.75;
  if (cover) {
    const fitWidth = Math.min(pictureWidth, pictureHeight * cover.width / cover.height);
    image(doc, cover, panel.x + (panel.width - fitWidth) / 2, pictureTop, fitWidth, pictureHeight);
  } else {
    rect(doc, panel.x + inset, pictureTop, pictureWidth, pictureHeight, softGray);
    drawBrochureIcon(doc, 'anchor', panel.x + panel.width / 2 - 20, pictureTop + pictureHeight / 2 - 20, 40, gray);
  }

  const top = pictureTop + pictureHeight;
  const scale = folded ? Math.min(1, (panel.height - top) / 242) : headerScale;
  rect(doc, panel.x, top, panel.width, panel.height - top, charcoal);
  rect(doc, left, top, 64 * scale, 2.6 * scale, orange);
  const { subtitle, summary, missionsTitle, operations } = getFleetBrochureCover(vessel, language);
  const completeRole = subtitle.trim() ? wrap(doc, subtitle, width, 9 * scale, true) : [];
  const roleLines = limitedLines(doc, completeRole, 2, width);
  const overflow: CoverOverflow = { presentation: completeRole.length > 2 ? [subtitle] : [], missionsTitle, missions: [] };
  font(doc, 9 * scale, true, orange);
  writeLines(doc, roleLines, left, top + 21 * scale, 10 * scale);

  const uppercaseName = vessel.name.trim().toUpperCase();
  const longName = uppercaseName === 'HIRONDELLE DE LA MANCHE' ? 'HIRONDELLE\nDE LA MANCHE' : uppercaseName;
  let titleSize = doc.getTextWidth(longName) * 70 / 9 > width ? 44 * scale : 70 * scale;
  let titleLines = wrap(doc, longName, width, titleSize, true);
  while (titleLines.length > 2 && titleSize > 10) {
    titleSize *= 0.85;
    titleLines = wrap(doc, longName, width, titleSize, true);
  }
  titleLines = limitedLines(doc, titleLines, 2, width);
  font(doc, titleSize, true, white);
  const titleTop = top + (25 + roleLines.length * 9) * scale + titleSize * 0.83;
  writeLines(doc, titleLines, left, titleTop, titleSize * 0.94);
  let y = titleTop + (titleLines.length - 1) * titleSize * 0.94 + 22 * scale;
  const missions = operations.filter((mission) => mission.trim());
  const summaryBottom = panel.height - (missions.length ? 90 : 18) * scale;

  if (summary.trim()) {
    const completeSummary = wrap(doc, summary, width, 10 * scale);
    const summaryCapacity = Math.min(2, Math.floor((summaryBottom - y) / (13 * scale)) + 1);
    const summaryLines = summaryCapacity > 0 ? limitedLines(doc, completeSummary, summaryCapacity, width) : [];
    if (completeSummary.length > summaryLines.length) overflow.presentation.push(summary);
    font(doc, 10 * scale, false, lightText);
    writeLines(doc, summaryLines, left, y, 13 * scale);
    y += summaryLines.length * 13 * scale;
  }

  if (!missions.length) return overflow;
  y = Math.min(y + 4 * scale, panel.height - 86 * scale);
  rule(doc, left, y, right, y, orangeLine);
  const caption = limitedLines(doc, wrap(doc, missionsTitle, width, 8 * scale, true), 1, width);
  font(doc, 8 * scale, true, lightText);
  writeLines(doc, caption, left, y + 14 * scale, 10 * scale);
  const visible = missions.slice(0, missions.length > 4 ? 3 : 4);
  if (missions.length > 4) {
    visible.push(`+${missions.length - 3} ${copy[language].moreMissions}`);
    overflow.missions = missions;
  }
  const cell = width / 4;
  visible.forEach((mission, index) => {
    const x = left + index * cell;
    const pad = index ? 8 * scale : 0;
    if (index) rule(doc, x, y + 22 * scale, x, Math.min(y + 71 * scale, panel.height - 9), orangeLine);
    drawBrochureIcon(doc, mission.startsWith('+') ? 'list' : missionIcon(mission), x + pad, y + 22 * scale, 15 * scale, orange);
    const textWidth = cell - pad - 4 * scale;
    const completeLabels = wrap(doc, mission, textWidth, 8.5 * scale, true);
    const labels = limitedLines(doc, completeLabels, 3, textWidth);
    if (!mission.startsWith('+') && completeLabels.length > labels.length) overflow.missions = missions;
    font(doc, 8.5 * scale, true, white);
    writeLines(doc, labels, x + pad, y + 49 * scale, 10 * scale);
  });
  return overflow;
}

function sectionIcon(section: LayoutSection): FleetBrochureIcon {
  return sectionIcons[section.id] || 'list';
}

function headingHeight(doc: JsPdf, label: string, width: number, style: InteriorStyle, lineLimit?: number): number {
  const lines = wrap(doc, label, width - 29, style.heading, true);
  return Math.max(20, Math.min(lines.length, lineLimit ?? Infinity) * (style.heading + 1)) + 7;
}

function sectionHeading(doc: JsPdf, label: string, icon: FleetBrochureIcon, x: number, y: number, width: number, style: InteriorStyle, lineLimit?: number): number {
  const wrapped = wrap(doc, label, width - 29, style.heading, true);
  const lines = lineLimit ? limitedLines(doc, wrapped, lineLimit, width - 29) : wrapped;
  rect(doc, x, y, 20, 20, softGray);
  drawBrochureIcon(doc, icon, x + 4, y + 4, 12, gray);
  font(doc, style.heading, true);
  writeLines(doc, lines, x + 27, y + Math.max(13, style.heading), style.heading + 1);
  return y + headingHeight(doc, label, width, style, lineLimit);
}

function measurement(doc: JsPdf, field: LayoutField, width: number, style: InteriorStyle, lineLimit?: number): MeasuredRow {
  const labelWidth = width * 0.49;
  const icon = equipmentIcons[field.id];
  const valueText = String(field.value ?? '').trim() || '—';
  const stacked = Boolean(icon || field.wide && /\n/.test(valueText));
  const labelArea = stacked ? width - 15 : labelWidth - 13;
  const valueArea = stacked ? width - 2 : width - labelWidth - 2;
  const wrappedLabel = wrap(doc, field.label, labelArea, style.body, Boolean(icon));
  const label = lineLimit ? limitedLines(doc, wrappedLabel, lineLimit, labelArea) : wrappedLabel;
  const wrappedValue = wrap(doc, valueText, valueArea, style.body, !stacked);
  const value = lineLimit ? limitedLines(doc, wrappedValue, lineLimit, valueArea) : wrappedValue;
  const count = stacked ? label.length + value.length : Math.max(label.length, value.length);
  return { label, value, labelWidth, height: count * style.line + style.rowPadding * 2, stacked, icon };
}

function drawRow(doc: JsPdf, row: MeasuredRow, x: number, y: number, width: number, style: InteriorStyle): number {
  rule(doc, x, y, x + width, y);
  const baseline = y + style.rowPadding + style.body * 0.87;
  font(doc, style.body, Boolean(row.icon), gray);
  if (row.icon && row.label.length) drawBrochureIcon(doc, row.icon, x, baseline - 8, 9, gray);
  writeLines(doc, row.label, x + (row.icon ? 13 : 0), baseline, style.line);
  font(doc, style.body, !row.stacked);
  writeLines(doc, row.value, row.stacked ? x : x + row.labelWidth, baseline + (row.stacked ? row.label.length * style.line : 0), style.line);
  return y + row.height;
}

function rowFragment(row: MeasuredRow, lineLimit: number, style: InteriorStyle): [MeasuredRow, MeasuredRow] {
  const labelCount = Math.min(lineLimit, row.label.length);
  const valueCount = row.stacked ? lineLimit - labelCount : lineLimit;
  const label = row.label.slice(labelCount);
  const value = row.value.slice(valueCount);
  const remainingLines = row.stacked ? label.length + value.length : Math.max(label.length, value.length);
  return [
    { ...row, label: row.label.slice(0, labelCount), value: row.value.slice(0, valueCount), height: lineLimit * style.line + style.rowPadding * 2 },
    { ...row, label, value, height: remainingLines * style.line + style.rowPadding * 2 },
  ];
}

function singleSection(section: LayoutSection): SectionColumn {
  return { section, fields: section.fields, showHeading: true };
}

function groupSections(sections: LayoutSection[], folded: boolean): SectionColumn[][] {
  const groups: SectionColumn[][] = [];
  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index];
    const icon = sectionIcon(section);
    if (folded && section.id === 'identity' && sections[index + 1]?.id === 'dimensions') {
      groups.push([singleSection(section), singleSection(sections[index + 1])]);
      index += 1;
    } else if ((folded && section.fields.length >= 9)
      || (icon === 'ruler' && section.fields.length >= 4) || (icon === 'flag' && section.fields.length >= 5)) {
      const middle = Math.ceil(section.fields.length / 2);
      groups.push([
        { section, fields: section.fields.slice(0, middle), showHeading: true },
        { section, fields: section.fields.slice(middle), showHeading: false },
      ]);
    } else if (icon !== 'crane' && (index > 0 || folded) && sections[index + 1]
      && !['ruler', 'crane'].includes(sectionIcon(sections[index + 1]))) {
      groups.push([singleSection(section), singleSection(sections[index + 1])]);
      index += 1;
    } else {
      groups.push([singleSection(section)]);
    }
  }
  return groups;
}

function groupMetrics(doc: JsPdf, columns: SectionColumn[], width: number, style: InteriorStyle, lineLimit?: number) {
  const gap = columns.length > 1 ? (width < 400 ? 16 : 26) : 0;
  const columnWidth = (width - gap) / columns.length;
  const heading = Math.max(...columns.filter((column) => column.showHeading).map(({ section }) => headingHeight(doc, section.label, columnWidth, style, lineLimit)));
  const rows = columns.map((column) => column.fields.map((field) => measurement(doc, field, columnWidth, style, lineLimit)));
  const height = heading + Math.max(...rows.map((list) => list.reduce((sum, row) => sum + row.height, 0)));
  return { gap, columnWidth, heading, rows, height };
}

function drawGroup(doc: JsPdf, columns: SectionColumn[], x: number, y: number, width: number, style: InteriorStyle, lineLimit?: number): number {
  const { gap, columnWidth, heading, rows, height } = groupMetrics(doc, columns, width, style, lineLimit);
  columns.forEach(({ section, showHeading }, index) => {
    const colX = x + index * (columnWidth + gap);
    if (showHeading) sectionHeading(doc, section.label, sectionIcon(section), colX, y, columnWidth, style, lineLimit);
    let bottom = y + heading;
    for (const row of rows[index]) bottom = drawRow(doc, row, colX, bottom, columnWidth, style);
    rule(doc, colX, bottom, colX + columnWidth, bottom);
  });
  return y + height;
}

function annexSize(doc: JsPdf, asset: PdfImage, annex: Annex, width: number, style: InteriorStyle) {
  const gap = width < 400 ? 10 : 14;
  const imageWidth = width * (style === condensedStyle ? 0.51 : 0.63);
  const cardWidth = width - imageWidth - gap;
  const imageHeight = imageWidth * asset.height / asset.width;
  const titleLines = wrap(doc, annex.title, cardWidth - 20, style.heading, true);
  const copy = wrap(doc, annex.description, cardWidth - 20, style.body);
  const cardHeight = Math.max(imageHeight, titleLines.length * (style.heading + 2) + copy.length * style.line + 31);
  const heading = annex.label ? headingHeight(doc, annex.label, width, style) : 0;
  return { gap, imageWidth, cardWidth, imageHeight, titleLines, copy, cardHeight, heading };
}

function drawAnnex(doc: JsPdf, asset: PdfImage, annex: Annex, x: number, y: number, width: number, style: InteriorStyle): void {
  const { gap, imageWidth, cardWidth, imageHeight, titleLines, copy, cardHeight } = annexSize(doc, asset, annex, width, style);
  if (annex.label) y = sectionHeading(doc, annex.label, 'map', x, y, width, style);
  const cardX = x + imageWidth + gap;
  if (cardHeight > imageHeight) doc.setDrawColor(...lineColor).setLineWidth(0.4).rect(x, y, imageWidth, cardHeight, 'S');
  image(doc, asset, x, y + (cardHeight - imageHeight) / 2, imageWidth, imageHeight);
  rect(doc, cardX, y, cardWidth, cardHeight, softGray);
  rule(doc, cardX + 10, y + 13, cardX + 23, y + 13, gray, 1.3);
  font(doc, style.heading, true);
  writeLines(doc, titleLines, cardX + 10, y + 20 + style.heading, style.heading + 2);
  font(doc, style.body, false, gray);
  writeLines(doc, copy, cardX + 10, y + 23 + titleLines.length * (style.heading + 2) + style.body, style.line);
}

function interiorTitle(doc: JsPdf, panel: Panel, title: string, logo?: PdfImage, vesselName = ''): number {
  const x = panel.x + panel.margin;
  const right = panel.x + panel.width - panel.margin;
  if (logo) {
    brand(doc, logo, panel, 39, 34);
    const name = limitedLines(doc, wrap(doc, vesselName, (right - x) * 0.45, 10, true), 2, (right - x) * 0.45);
    font(doc, 10, true, gray);
    name.forEach((line, index) => doc.text(line, right, 57 + 11 * index, { align: 'right' }));
    rule(doc, x, 92, right, 92);
  }
  font(doc, logo ? 36 : 28, true);
  if (doc.getTextWidth(title) > right - x) doc.setFontSize(doc.getFontSize() * (right - x) / doc.getTextWidth(title));
  doc.text(title, x, logo ? 151 : 65);
  return logo ? 183 : 88;
}

function renderA4Interior(
  doc: JsPdf,
  panel: Panel,
  vessel: FleetVessel,
  logo: PdfImage,
  title: string,
  sections: LayoutSection[],
  annex: Annex | undefined,
  annexImage: PdfImage | undefined,
  language: FleetBrochureLanguage,
  coverOverflow?: CoverOverflow,
): void {
  const x = panel.x + panel.margin;
  const width = panel.width - panel.margin * 2;
  const limit = panel.height - panel.margin;
  function newPage(continuation = false): number {
    doc.addPage();
    return interiorTitle(doc, panel, continuation ? `${title}${copy[language].continued}` : title, logo, vessel.name);
  }
  let y = newPage();
  const top = y;
  const groups = groupSections(sections, false);
  const total = (style: InteriorStyle) => {
    const table = groups.reduce((sum, group) => sum + style.sectionGap + groupMetrics(doc, group, width, style).height, 0);
    if (!annex || !annexImage) return Math.max(0, table - style.sectionGap);
    const visual = annexSize(doc, annexImage, annex, width, style);
    return table + visual.heading + visual.cardHeight;
  };
  const style = top + total(a4Style) > limit && top + total(a4CompactStyle) <= limit ? a4CompactStyle : a4Style;
  for (const group of groups) {
    const { height } = groupMetrics(doc, group, width, style);
    if (height <= limit - top) {
      if (y + height > limit) y = newPage(true);
      y = drawGroup(doc, group, x, y, width, style) + style.sectionGap;
      continue;
    }

    // An unusually long section keeps every value by flowing down full-width continuation pages.
    for (const { section, fields, showHeading } of group) {
      if (y + 66 > limit) y = newPage(true);
      if (showHeading || y === top) y = sectionHeading(doc, section.label, sectionIcon(section), x, y, width, style);
      for (const field of fields) {
        const row = measurement(doc, field, width, style);
        if (row.height <= limit - top - 42 && y + row.height > limit) {
          y = sectionHeading(doc, section.label, sectionIcon(section), x, newPage(true), width, style);
        }
        let remaining = row;
        while (y + remaining.height > limit) {
          const capacity = Math.floor((limit - y - style.rowPadding * 2) / style.line);
          if (capacity > 0) {
            const [front, rest] = rowFragment(remaining, capacity, style);
            drawRow(doc, front, x, y, width, style);
            remaining = rest;
          }
          y = sectionHeading(doc, section.label, sectionIcon(section), x, newPage(true), width, style);
        }
        y = drawRow(doc, remaining, x, y, width, style);
      }
      rule(doc, x, y, x + width, y);
      y += style.sectionGap;
    }
  }
  if (annex && annexImage) {
    const { cardHeight, heading } = annexSize(doc, annexImage, annex, width, style);
    if (y + cardHeight + heading > limit) y = newPage(true);
    drawAnnex(doc, annexImage, annex, x, y, width, style);
  }
  if (!coverOverflow) return;
  const additional = [
    { label: copy[language].presentation, values: coverOverflow.presentation, icon: 'list' as const },
    { label: coverOverflow.missionsTitle, values: coverOverflow.missions, icon: 'compass' as const },
  ];
  for (const { label, values, icon } of additional) {
    if (!values.length) continue;
    if (y + headingHeight(doc, label, width, style) + style.line * 2 > limit) y = newPage(true);
    y = sectionHeading(doc, label, icon, x, y, width, style);
    for (const value of values) {
      const lines = wrap(doc, value, width, style.body);
      for (const line of lines) {
        if (y + style.line > limit) y = sectionHeading(doc, label, icon, x, newPage(true), width, style);
        font(doc, style.body, false);
        doc.text(line, x, y + style.body);
        y += style.line;
      }
      y += 6;
    }
    y += style.sectionGap;
  }
}

function renderFoldedInterior(
  doc: JsPdf,
  panel: Panel,
  title: string,
  sections: LayoutSection[],
  annex: Annex | undefined,
  annexImage: PdfImage | undefined,
  language: FleetBrochureLanguage,
): void {
  const x = panel.x + panel.margin;
  const width = panel.width - panel.margin * 2;
  const top = interiorTitle(doc, panel, title);
  const limit = panel.height - 24;
  const groups = groupSections(sections, true);
  const height = (style: InteriorStyle, lineLimit?: number) => {
    const body = groups.reduce((total, group) => total + groupMetrics(doc, group, width, style, lineLimit).height + style.sectionGap, 0);
    if (!annex || !annexImage) return body;
    const visual = annexSize(doc, annexImage, annex, width, style);
    return body + visual.heading + visual.cardHeight;
  };
  const available = limit - top;
  const style = height(foldedStyle) <= available ? foldedStyle : height(compactStyle) <= available ? compactStyle : condensedStyle;
  // Folded exports keep every shared row. Very long entries are shortened to fit the single sheet.
  const lineLimit = style === condensedStyle && height(style) > available ?
    [3, 2, 1].find((lines) => height(style, lines) + 14 <= available) || 1 : undefined;
  const contentHeight = height(style, lineLimit) + (lineLimit ? 14 : 0);
  const fit = contentHeight > 0 ? Math.min(1, available / contentHeight) : 1;
  if (fit < 1) {
    doc.saveGraphicsState();
    doc.setCurrentTransformationMatrix(doc.Matrix(fit, 0, 0, fit, (1 - fit) * x, (1 - fit) * (panel.height - top)));
  }
  let y = top;
  for (const group of groups) y = drawGroup(doc, group, x, y, width, style, lineLimit) + style.sectionGap;
  if (lineLimit) {
    font(doc, style.body, true, gray);
    doc.text(copy[language].fullVersion, x, y + style.body);
    y += 14;
  }
  if (annex && annexImage) drawAnnex(doc, annexImage, annex, x, y, width, style);
  if (fit < 1) doc.restoreGraphicsState();
}

function foldMarks(doc: JsPdf, width: number, height: number): void {
  rule(doc, width / 2, 15, width / 2, 20, [180, 180, 180]);
  rule(doc, width / 2, height - 20, width / 2, height - 15, [180, 180, 180]);
}

function brochureSections(vessel: FleetVessel, language: FleetBrochureLanguage, layout?: FleetLayout): [LayoutSection[], LayoutSection[]] {
  const sections = getFleetLayoutSections(vessel, layout, language)
    .map((section) => ({
      ...section,
      fields: section.fields.filter(({ brochure }) => brochure),
    }))
    .filter(({ fields }) => fields.length);
  const equipmentIndex = sections.findIndex(({ id }) => id === 'equipment' || id === 'capacities');
  if (equipmentIndex < 0) return [sections, []];
  // A customized order can put equipment first. Retain that reading order while using both panels.
  const split = equipmentIndex === 0 && sections.length > 1 ? Math.ceil(sections.length / 2) : equipmentIndex;
  return [sections.slice(0, split), sections.slice(split)];
}

export async function buildFleetBrochurePdf(vessel: FleetVessel, photoUrl: string, options: FleetBrochureOptions = {}): Promise<Blob> {
  if (vessel.assetKind !== 'vessel') throw new Error('La brochure est réservée aux navires.');
  const folded = options.format === 'folded';
  const language = options.language || 'fr';
  const { technical: technicalTitle, equipment: equipmentTitle, documentTitle, subject } = copy[language];
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: folded ? 'landscape' : 'portrait', unit: 'pt', format: 'a4', compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const annex = annexes[vessel.name.trim().toUpperCase()]?.[language];
  const [logo, cover, annexImage] = await Promise.all([
    readImage(doc, '/bbtm-report-logo.png'),
    firstImage(doc, [photoUrl, ...(options.fallbackPhotoUrls || [])]),
    annex ? firstImage(doc, [annex.url]) : undefined,
  ]);
  const width = folded ? pageWidth / 2 : pageWidth;
  const left = { x: 0, width, height, margin: folded ? 28 : 45 };
  const right = { ...left, x: width };
  const [technical, equipment] = brochureSections(vessel, language, options.layout);
  const coverOverflow = renderCover(doc, folded ? right : left, vessel, logo, cover, folded, language);
  if (folded) {
    foldMarks(doc, pageWidth, height);
    doc.addPage();
    renderFoldedInterior(doc, left, technicalTitle, technical, undefined, undefined, language);
    renderFoldedInterior(doc, right, equipmentTitle, equipment, annex, annexImage, language);
    foldMarks(doc, pageWidth, height);
  } else {
    renderA4Interior(doc, left, vessel, logo, technicalTitle, technical, undefined, undefined, language, coverOverflow);
    renderA4Interior(doc, left, vessel, logo, equipmentTitle, equipment, annex, annexImage, language);
  }
  doc.setLanguage(language);
  doc.setProperties({ title: `${vessel.name} — ${documentTitle}`, subject, author: 'BBTM', creator: 'BBTM' });
  return doc.output('blob');
}

export async function downloadFleetBrochure(vessel: FleetVessel, photoUrl: string, options?: FleetBrochureOptions): Promise<void> {
  const blob = await buildFleetBrochurePdf(vessel, photoUrl, options);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fleetBrochureFileName(vessel.name, options?.format, options?.language);
  anchor.click();
  URL.revokeObjectURL(url);
}
