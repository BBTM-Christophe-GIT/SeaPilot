import JSZip from 'jszip';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import {
  addPlanningDays,
  formatPlanningDate,
  inclusivePlanningDayCount,
  rangesOverlap,
  todayPlanningDate,
} from './planningDates';
import { formatPlanningPerson, getAllPlanningCrewEvents, normalizePlanningStatus } from './planningModel';
import type { PlanningOverview } from './planningQueries';

export type BoardingCertificateFormat = 'docx' | 'pdf';

export interface BoardingCertificateInput {
  personId: number;
  vesselIds: number[];
  startsOn: string;
  endsOn: string;
  generatedOn?: string;
}

export interface BoardingCertificatePeriod {
  startsOn: string;
  endsOn: string;
  functionLabel: string;
  vesselName: string;
  registrationNumber: string;
  dayCount: number;
}

export interface BoardingCertificateData {
  personName: string;
  sailorNumber: string;
  certificates: string;
  birthDate: string;
  periods: BoardingCertificatePeriod[];
  totalDays: number;
  generatedOn: string;
}

export interface BoardingCertificateTemplates {
  docx?: ArrayBuffer;
  pdf?: ArrayBuffer;
  signature?: ArrayBuffer;
}

export interface GeneratedBoardingCertificate {
  blob: Blob;
  fileName: string;
  data: BoardingCertificateData;
}

interface DatedService {
  date: string;
  functionLabel: string;
  vesselId: number;
  vesselName: string;
  registrationNumber: string;
}

const TEMPLATE_ROOT = '/templates';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PDF_MIME = 'application/pdf';
const PDF_MAX_PERIODS = 18;

function distinctLabels(values: Array<string | undefined>): string {
  const seen = new Set<string>();
  const labels: string[] = [];
  values.flatMap((value) => (value || '').split(/[,;\n]+/)).forEach((value) => {
    const label = value.trim();
    const key = label.toLocaleUpperCase('fr-FR');
    if (!label || seen.has(key)) return;
    seen.add(key);
    labels.push(label);
  });
  return labels.join(', ');
}

function serviceDays(overview: PlanningOverview, input: BoardingCertificateInput): DatedService[] {
  const selectedVessels = new Set(input.vesselIds);
  const byKey = new Map<string, DatedService>();
  getAllPlanningCrewEvents(overview)
    .filter((event) => event.personId === input.personId
      && event.vesselId !== null
      && selectedVessels.has(event.vesselId)
      && event.confirmationStatus !== 'cancelled'
      && rangesOverlap(event.startsOn, event.endsOn, input.startsOn, input.endsOn))
    .forEach((event) => {
      const vessel = overview.vessels.find((item) => item.id === event.vesselId);
      if (!vessel) return;
      const start = event.startsOn < input.startsOn ? input.startsOn : event.startsOn;
      const end = event.endsOn > input.endsOn ? input.endsOn : event.endsOn;
      for (let date = start; date <= end; date = addPlanningDays(date, 1)) {
        const status = event.dailyStatuses?.[date] || event.status;
        if (normalizePlanningStatus(status) !== 'En Mer') continue;
        const functionLabel = event.functionLabel.trim();
        const key = [date, vessel.id, functionLabel.toLocaleUpperCase('fr-FR')].join('|');
        byKey.set(key, {
          date,
          functionLabel,
          vesselId: vessel.id,
          vesselName: vessel.name,
          registrationNumber: vessel.registrationNumber || '',
        });
      }
    });
  return [...byKey.values()].sort((left, right) => left.date.localeCompare(right.date)
    || left.vesselName.localeCompare(right.vesselName, 'fr')
    || left.functionLabel.localeCompare(right.functionLabel, 'fr'));
}

function mergeServicePeriods(days: DatedService[]): BoardingCertificatePeriod[] {
  const periods: BoardingCertificatePeriod[] = [];
  const byService = new Map<string, DatedService[]>();
  days.forEach((day) => {
    const key = `${day.vesselName}\u0000${day.registrationNumber}\u0000${day.functionLabel}`;
    byService.set(key, [...(byService.get(key) || []), day]);
  });
  byService.forEach((serviceDays) => {
    for (const day of serviceDays.sort((left, right) => left.date.localeCompare(right.date))) {
      const previous = periods.at(-1);
      const sameService = previous
        && previous.vesselName === day.vesselName
        && previous.functionLabel === day.functionLabel
        && previous.registrationNumber === day.registrationNumber
        && addPlanningDays(previous.endsOn, 1) === day.date;
      if (sameService) {
        previous.endsOn = day.date;
        previous.dayCount = inclusivePlanningDayCount(previous.startsOn, previous.endsOn);
      } else {
        periods.push({
          startsOn: day.date,
          endsOn: day.date,
          functionLabel: day.functionLabel,
          vesselName: day.vesselName,
          registrationNumber: day.registrationNumber,
          dayCount: 1,
        });
      }
    }
  });
  return periods.sort((left, right) => right.endsOn.localeCompare(left.endsOn) || right.startsOn.localeCompare(left.startsOn));
}

export function buildBoardingCertificateData(
  overview: PlanningOverview,
  input: BoardingCertificateInput,
): BoardingCertificateData {
  const person = overview.people.find((item) => item.id === input.personId);
  if (!person) throw new Error('Le marin sélectionné est introuvable.');
  if (!input.vesselIds.length) throw new Error('Sélectionnez au moins un navire.');
  const periods = mergeServicePeriods(serviceDays(overview, input));
  const certificates = distinctLabels([person.deckCertificateLabel, person.engineCertificateLabel]);
  const missing = [
    !person.sailorNumber ? 'numéro de marin' : '',
    !person.birthDate ? 'date de naissance' : '',
    !certificates ? 'brevet Pont ou Machine' : '',
    !periods.length ? 'période en mer' : '',
    periods.some((period) => !period.registrationNumber) ? 'immatriculation du navire' : '',
    periods.some((period) => !period.functionLabel) ? 'fonction à bord' : '',
  ].filter(Boolean);
  if (missing.length) throw new Error(`Attestation incomplète : ${missing.join(', ')}.`);
  return {
    personName: formatPlanningPerson(person),
    sailorNumber: person.sailorNumber || '',
    certificates,
    birthDate: person.birthDate || '',
    periods,
    totalDays: periods.reduce((total, period) => total + period.dayCount, 0),
    generatedOn: input.generatedOn || todayPlanningDate(),
  };
}

function xmlEscape(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function exactTextPattern(value: string): RegExp {
  return new RegExp(`(<w:t(?:\\s[^>]*)?>)${value}(</w:t>)`);
}

function replaceExactText(xml: string, placeholder: string, value: string): string {
  const pattern = exactTextPattern(placeholder);
  if (!pattern.test(xml)) throw new Error(`Emplacement ${placeholder} absent du modèle Word.`);
  return xml.replace(pattern, `$1${xmlEscape(value)}$2`);
}

function periodLabel(period: BoardingCertificatePeriod): string {
  return `${formatPlanningDate(period.startsOn)} au ${formatPlanningDate(period.endsOn)}`;
}

async function buildDocx(template: ArrayBuffer, data: BoardingCertificateData): Promise<Blob> {
  const archive = await JSZip.loadAsync(template);
  const documentPart = archive.file('word/document.xml');
  if (!documentPart) throw new Error('Le modèle Word ne contient pas word/document.xml.');
  let xml = await documentPart.async('string');
  const rows = [...xml.matchAll(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g)].map((match) => match[0]);
  const templateRow = rows.find((row) => ['8', '7', '5', '6', '9'].every((value) => exactTextPattern(value).test(row)));
  if (!templateRow) throw new Error('La ligne des périodes est absente du modèle Word.');
  const generatedRows = data.periods.map((period) => {
    let row = templateRow;
    row = replaceExactText(row, '8', periodLabel(period));
    row = replaceExactText(row, '7', period.functionLabel);
    row = replaceExactText(row, '5', period.vesselName);
    row = replaceExactText(row, '6', period.registrationNumber);
    row = replaceExactText(row, '9', String(period.dayCount));
    return row;
  }).join('');
  xml = xml.replace(templateRow, generatedRows);
  xml = replaceExactText(xml, '1', data.personName);
  xml = replaceExactText(xml, '2', data.sailorNumber);
  xml = replaceExactText(xml, '3', data.certificates);
  xml = replaceExactText(xml, '4', formatPlanningDate(data.birthDate));
  xml = replaceExactText(xml, '10', String(data.totalDays));
  xml = replaceExactText(xml, '11', formatPlanningDate(data.generatedOn));
  archive.file('word/document.xml', xml);
  const bytes = await archive.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return new Blob([arrayBuffer(bytes)], { type: DOCX_MIME });
}

function pdfY(page: PDFPage, top: number, fontSize: number): number {
  return page.getHeight() - top - fontSize;
}

function drawFittedText(
  page: PDFPage,
  text: string,
  font: PDFFont,
  options: { x: number; top: number; width: number; size?: number; minSize?: number; align?: 'left' | 'center' },
) {
  let size = options.size || 11;
  const minSize = options.minSize || 7;
  while (size > minSize && font.widthOfTextAtSize(text, size) > options.width) size -= 0.25;
  const textWidth = font.widthOfTextAtSize(text, size);
  const x = options.align === 'center' ? options.x + Math.max(0, (options.width - textWidth) / 2) : options.x;
  page.drawText(text, { x, y: pdfY(page, options.top, size), font, size, color: rgb(0, 0, 0) });
}

function drawTopLine(page: PDFPage, x1: number, x2: number, top: number, width = 0.48) {
  const y = page.getHeight() - top;
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: width, color: rgb(0, 0, 0) });
}

function drawVerticalLine(page: PDFPage, x: number, top: number, bottom: number, width = 0.48) {
  page.drawLine({
    start: { x, y: page.getHeight() - top },
    end: { x, y: page.getHeight() - bottom },
    thickness: width,
    color: rgb(0, 0, 0),
  });
}

async function buildPdf(template: ArrayBuffer, signatureBytes: ArrayBuffer, data: BoardingCertificateData): Promise<Blob> {
  const document = await PDFDocument.load(template);
  const pageCount = Math.ceil(data.periods.length / PDF_MAX_PERIODS);
  if (pageCount > 1) {
    const retainedTemplate = await PDFDocument.load(template);
    for (let pageIndex = 1; pageIndex < pageCount; pageIndex += 1) {
      const [page] = await document.copyPages(retainedTemplate, [0]);
      document.addPage(page);
    }
  }
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const signature = await document.embedPng(signatureBytes);
  const white = rgb(1, 1, 1);

  document.getPages().forEach((page, pageIndex) => {
    const periods = data.periods.slice(pageIndex * PDF_MAX_PERIODS, (pageIndex + 1) * PDF_MAX_PERIODS);
    const infoSlots = [
      { x: 196, top: 96, width: 355, height: 15, text: data.personName },
      { x: 233.5, top: 110.5, width: 318, height: 15, text: data.sailorNumber },
      { x: 110, top: 125, width: 441, height: 16, text: data.certificates },
      { x: 170, top: 139.5, width: 381, height: 16, text: formatPlanningDate(data.birthDate) },
    ];
    infoSlots.forEach((slot) => {
      page.drawRectangle({ x: slot.x, y: page.getHeight() - slot.top - slot.height, width: slot.width, height: slot.height, color: white });
      drawFittedText(page, slot.text, regular, { x: slot.x + 3, top: slot.top + 1.5, width: slot.width - 5, size: 11, minSize: 8 });
    });

    const columns = [38.88, 195.65, 301.39, 393.55, 492.82, 556.68];
    const tableTop = 324.53;
    const rowHeight = 17;
    const totalHeight = 15;
    const tableBottom = tableTop + periods.length * rowHeight + totalHeight;
    page.drawRectangle({ x: 38.4, y: page.getHeight() - 680, width: 519, height: 680 - tableTop, color: white });

    drawTopLine(page, columns[0], columns.at(-1)!, tableTop);
    periods.forEach((period, index) => {
      const top = tableTop + index * rowHeight;
      const values = [periodLabel(period), period.functionLabel, period.vesselName, period.registrationNumber, String(period.dayCount)];
      values.forEach((value, column) => drawFittedText(page, value, regular, {
        x: columns[column] + 3,
        top: top + 3.1,
        width: columns[column + 1] - columns[column] - 6,
        size: 8.5,
        minSize: 6.75,
        align: 'center',
      }));
      drawTopLine(page, columns[0], columns.at(-1)!, top + rowHeight);
    });
    columns.forEach((x) => drawVerticalLine(page, x, tableTop, tableBottom - totalHeight));
    drawVerticalLine(page, columns[0], tableBottom - totalHeight, tableBottom);
    drawVerticalLine(page, columns[3], tableBottom - totalHeight, tableBottom);
    drawVerticalLine(page, columns[4], tableBottom - totalHeight, tableBottom);
    drawVerticalLine(page, columns[5], tableBottom - totalHeight, tableBottom);
    drawTopLine(page, columns[0], columns.at(-1)!, tableBottom);
    drawFittedText(page, 'Durée totale du service en mer', bold, {
      x: columns[0], top: tableBottom - totalHeight + 2.5, width: columns[3] - columns[0], size: 11, minSize: 9, align: 'center',
    });
    drawFittedText(page, String(data.totalDays), bold, {
      x: columns[4], top: tableBottom - totalHeight + 2.5, width: columns[5] - columns[4], size: 11, align: 'center',
    });

    const legalTop = tableBottom + 22;
    drawFittedText(page, 'Pour servir et valoir ce que de droit.', regular, { x: 76.2, top: legalTop, width: 300, size: 11 });
    drawFittedText(page, `Date de délivrance : ${formatPlanningDate(data.generatedOn)}`, regular, { x: 76.2, top: legalTop + 14, width: 300, size: 11 });
    drawFittedText(page, 'Benjamin BON', bold, { x: 438, top: legalTop - 1, width: 110, size: 11, align: 'center' });
    drawFittedText(page, 'Président BBTM', regular, { x: 438, top: legalTop + 13, width: 110, size: 11, align: 'center' });
    page.drawImage(signature, {
      x: 450,
      y: page.getHeight() - legalTop - 85,
      width: 100,
      height: 70,
    });
  });

  const bytes = await document.save();
  return new Blob([arrayBuffer(bytes)], { type: PDF_MIME });
}

async function fetchTemplate(path: string): Promise<ArrayBuffer> {
  const response = await fetch(`${TEMPLATE_ROOT}/${path}`);
  if (!response.ok) throw new Error('Le modèle d’attestation est indisponible.');
  return response.arrayBuffer();
}

function certificateFileName(data: BoardingCertificateData, format: BoardingCertificateFormat): string {
  const generatedDate = data.generatedOn.split('-').reverse().join('-');
  return `Attestation d'embarquement - ${data.personName} - ${generatedDate}.${format}`;
}

export async function generateBoardingCertificate(
  format: BoardingCertificateFormat,
  overview: PlanningOverview,
  input: BoardingCertificateInput,
  templates: BoardingCertificateTemplates = {},
): Promise<GeneratedBoardingCertificate> {
  const data = buildBoardingCertificateData(overview, input);
  const blob = format === 'docx'
    ? await buildDocx(templates.docx || await fetchTemplate('attestation-embarquement.docx'), data)
    : await buildPdf(
      templates.pdf || await fetchTemplate('attestation-embarquement.pdf'),
      templates.signature || await fetchTemplate('attestation-signature.png'),
      data,
    );
  return { blob, fileName: certificateFileName(data, format), data };
}
